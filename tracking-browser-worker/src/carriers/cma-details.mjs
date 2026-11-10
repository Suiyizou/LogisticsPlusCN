import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readCmaCard,parseCmaCard} from './detail-parser.mjs';

const fail = (code,message) => Object.assign(new Error(message),{code});
const requireTime = (signal,remaining,max = 8000) => {
  if (signal.aborted || remaining() < 100) throw fail('DETAIL_TIMEOUT','CMA supplementary capture reached its time budget');
  return Math.max(1,Math.min(max,remaining()-50));
};

export async function saveCmaPdf({page,link,booking,container,artifactBase,signal,remaining}) {
  const href = new URL(await link.getAttribute('href'),page.url());
  if (href.origin !== 'https://www.cma-cgm.com' || href.pathname !== '/ebusiness/tracking/export-pdf' ||
      href.searchParams.get('bookingReference') !== booking || href.searchParams.get('containerID') !== container ||
      href.searchParams.get('fileType') !== 'pdf') throw fail('PDF_REFERENCE_MISMATCH','CMA export link does not match the active booking and container');
  const timeout = requireTime(signal,remaining,10000);
  const context = page.context();
  const listeners = new Map();
  const owned = new Set();
  let finished = false,complete = false,activeDownload,cancelRequested = false;
  let resolveDownload,rejectInterrupted;
  const received = new Promise(resolve => {resolveDownload = resolve;});
  const interrupted = new Promise((_,reject) => {rejectInterrupted = reject;});
  const cancelOwnDownload = () => {
    if (activeDownload && !cancelRequested) {cancelRequested=true;void activeDownload.cancel?.().catch(() => {});}
  };
  const interrupt = error => {if (!finished) {cancelOwnDownload();rejectInterrupted(error);}};
  const acceptDownload = download => {
    if (finished || signal.aborted) {void download.cancel?.().catch(() => {});return;}
    activeDownload = download;
    resolveDownload(download);
  };
  const detach = target => {
    const listener = listeners.get(target);
    if (listener) {target.off('download',listener);listeners.delete(target);}
  };
  const onPage = popup => {
    if (finished) return;
    const handler = download => {
      popup.opener().then(opener => {
        if (opener !== page) return;
        if (finished) {void download.cancel?.().catch(() => {});return;}
        owned.add(popup);acceptDownload(download);
      }).catch(() => {});
    };
    listeners.set(popup,handler);popup.on('download',handler);
    popup.opener().then(opener => {
      if (opener !== page) {detach(popup);return;}
      if (finished) {detach(popup);if (!popup.isClosed()) void popup.close().catch(() => {});return;}
      owned.add(popup);
    }).catch(() => {detach(popup);});
  };
  listeners.set(page,acceptDownload);page.on('download',acceptDownload);
  context.on('page',onPage);
  const timer = setTimeout(() => interrupt(fail('PDF_DOWNLOAD_TIMEOUT','CMA browser PDF export exceeded its download budget')),timeout);
  const abort = () => interrupt(fail('DETAIL_TIMEOUT','CMA PDF download was interrupted by its time budget'));
  signal.addEventListener('abort',abort,{once:true});
  const temporary = `${artifactBase}.${container}.pdf.download`;
  const finalPath = `${artifactBase}.${container}.pdf`;
  const bounded = operation => Promise.race([operation,interrupted]);
  try {
    if (signal.aborted) abort();
    const [,download] = await bounded(Promise.all([link.click({timeout}),received]));
    activeDownload = download;
    requireTime(signal,remaining);
    const saving = download.saveAs(temporary);
    // A late save completion after cancellation must not leave a temporary file.
    saving.then(() => {if (finished && !complete) return fs.unlink(temporary).catch(() => {});},() => {});
    await bounded(saving);
    const error = await bounded(download.failure());
    if (error) throw fail('PDF_DOWNLOAD_FAILED',String(error).slice(0,160));
    const stat = await bounded(fs.stat(temporary));
    if (stat.size < 5 || stat.size > 10*1024*1024) throw fail('PDF_INVALID_SIZE','CMA export is empty or exceeds the 10 MB artifact limit');
    const bytes = await bounded(fs.readFile(temporary));
    if (bytes.subarray(0,5).toString('ascii') !== '%PDF-') throw fail('PDF_INVALID_CONTENT','CMA browser export did not contain a PDF document');
    requireTime(signal,remaining);
    await bounded(fs.rename(temporary,finalPath));
    complete = true;
    return {kind:'PDF_DOWNLOAD',container,path:finalPath,bytes:stat.size,
      sha256:createHash('sha256').update(bytes).digest('hex'),parsed:false};
  } finally {
    finished = true;
    clearTimeout(timer);signal.removeEventListener('abort',abort);
    context.off('page',onPage);
    for (const target of [...listeners.keys()]) detach(target);
    if (!complete) cancelOwnDownload();
    await fs.unlink(temporary).catch(() => {});
    for (const popup of owned) if (!popup.isClosed()) await popup.close().catch(() => {});
  }
}

export async function collectCmaDetails({page,job,overview,artifactBase,signal,remaining,onPartial = () => {}}) {
  const cards = page.locator('article.result-card');
  const known = new Set(overview.containers);
  const detailed = [];
  const artifacts = [];
  const sources = [];
  const errors = [];
  const pdf = [];
  const expectedBooking = overview.fields?.booking || (job.reference_type === 'BOOKING' ? job.submitted : null);
  const result = () => {
    const histories = detailed.flatMap(detail => detail.events);
    const common = key => {
      const values = [...new Set(detailed.map(detail => detail[key]).filter(Boolean))];
      return values.length === 1 ? values[0] : undefined;
    };
    const vesselVoyages = [...new Set(histories.filter(event => event.vessel).map(event =>
      [event.vessel,event.voyage].filter(Boolean).join(' / ')))];
    return {reference:job.submitted,extraction:{containers:[...known],vessel_voyage:vesselVoyages,
      fields:{por:common('origin'),pod:common('destination'),container_details:detailed,structured_events:histories},
      events:histories.map(event => [event.time,event.description,event.location,event.terminal,
        [event.vessel,event.voyage].filter(Boolean).join(' / '),event.container_number].filter(Boolean).join(' | '))},
      coverage:{scope:'visible_container_histories_and_pdf',scope_complete:errors.length === 0 && detailed.length === known.size && pdf.length === known.size && pdf.every(item => item.state === 'saved'),
        detailed_containers:detailed.filter(detail => detail.history_expanded).map(detail => detail.number)},
      sources,errors,artifacts,pdf};
  };
  const count = await cards.count();
  for (let index = 0; index < Math.min(count,50); index += 1) {
    let number;
    try {
      requireTime(signal,remaining);
      const card = cards.nth(index);
      number = (await card.locator('.container-ref dt > span').first().innerText({timeout:requireTime(signal,remaining)})).trim();
      if (!known.has(number)) throw fail('DETAIL_CONTAINER_MISMATCH','CMA result contains a container outside the confirmed overview');
      const details = card.locator('.result-card--details');
      if (!await details.isVisible()) {
        const id = await card.locator('input[data-role="switch"]').getAttribute('id');
        if (!/^card-details-switch-\d+$/.test(id ?? '')) throw fail('DETAIL_CONTROL_UNAVAILABLE','CMA visible details control was not found');
        await card.locator(`label[for="${id}"]`).click({timeout:requireTime(signal,remaining)});
      }
      await details.waitFor({state:'visible',timeout:requireTime(signal,remaining)});
      await details.locator('td.date .calendar').first().waitFor({state:'visible',timeout:requireTime(signal,remaining)});
      const previous = details.locator('a').filter({hasText:/^Display Previous Moves$/}).first();
      if (await previous.isVisible()) {
        await previous.click({timeout:requireTime(signal,remaining)});
        await details.locator('a').filter({hasText:/^Hide Previous Moves$/}).first()
          .waitFor({state:'visible',timeout:requireTime(signal,remaining)});
      }
      const snapshot = await card.evaluate(readCmaCard);
      if (!snapshot.booking || (expectedBooking && snapshot.booking !== expectedBooking))
        throw fail('DETAIL_REFERENCE_MISMATCH','CMA details do not match the confirmed booking');
      const parsed = parseCmaCard(snapshot,number);
      if (!parsed.events.length) throw fail('DETAIL_EMPTY_HISTORY','CMA expanded card returned no dated movement rows');
      detailed.push(parsed);
      const sourceId = `cma-details-${number}`;
      sources.push({id:sourceId,kind:'PAGE_DETAILS',url:page.url()});
      // Each card is saved now: opening another card collapses this one.
      const dataPath = `${artifactBase}.${number}.details.json`;
      await fs.writeFile(dataPath,JSON.stringify(snapshot,null,2),'utf8');
      artifacts.push({kind:'PAGE_DETAILS_JSON',container:number,path:dataPath});
      onPartial(result());
      try {
        const artifact = await saveCmaPdf({page,link:details.locator('.export-pdf a'),booking:snapshot.booking,
          container:number,artifactBase,signal,remaining});
        artifacts.push(artifact);
        sources.push({id:`cma-pdf-${number}`,kind:'PDF_DOWNLOAD',url:page.url()});
        pdf.push({container:number,state:'saved',parsed:false});
      } catch (error) {
        errors.push({code:error.code ?? 'PDF_DOWNLOAD_FAILED',message:`${number}: ${error.message}`});
        pdf.push({container:number,state:'failed',parsed:false});
      }
      onPartial(result());
    } catch (error) {
      errors.push({code:error.code ?? 'DETAIL_CAPTURE_FAILED',message:`${number ?? `card ${index+1}`}: ${error.message}`});
      onPartial(result());
      if (signal.aborted || remaining() < 100) break;
    }
  }
  if (count > 50) errors.push({code:'DETAIL_CONTAINER_LIMIT',message:'CMA result exceeds the 50-card capture limit'});
  return result();
}
