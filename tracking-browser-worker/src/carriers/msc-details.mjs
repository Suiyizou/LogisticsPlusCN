import fs from 'node:fs/promises';
import {isMscHistoryRow} from './detail-parser.mjs';

const stop = (code,message) => Object.assign(new Error(message),{code});
const actionTimeout = (signal,remaining,max = 7000) => {
  if (signal.aborted || remaining() < 100) throw stop('DETAIL_TIMEOUT','MSC supplementary capture reached its time budget');
  return Math.max(1,Math.min(max,remaining()-50));
};

export function readMscCard(card) {
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const values = element => [...element.querySelectorAll('.data-value')].filter(visible)
    .map(item => item.textContent.replace(/\s+/g,' ').trim()).filter(Boolean);
  const header = values(card.querySelector('.msc-flow-tracking__bar'));
  const rows = [...card.querySelectorAll('.msc-flow-tracking__port')].filter(visible)
    .map(row => values(row)).filter(cells => cells.length === 5 && /^\d{2}\/\d{2}\/\d{4}$/.test(cells[0]));
  return {container:header[0],type:header[1],latest_move:header[2],eta:header[3],rows};
}

export function readMscTooltips(row) {
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  return [...row.querySelectorAll('.msc-flow-tracking__tooltip-box')].filter(visible).map(box => ({
    kind:box.classList.contains('vessel') ? 'vessel' : 'terminal',
    fields:Object.fromEntries([...box.querySelectorAll('.tooltip-row')].map(item => [
      item.querySelector('.data-tooltip-title')?.textContent.trim(),
      item.querySelector('.data-tooltip-value')?.textContent.trim(),
    ]).filter(([key,value]) => key && value)),
  }));
}

export function parseMscRows(snapshot) {
  if (!/^[A-Z]{4}\d{7}$/.test(snapshot?.container ?? ''))
    throw stop('DETAIL_CONTAINER_MISMATCH','MSC detail card has no valid container identifier');
  const events = (snapshot.rows ?? []).flatMap(cells => {
    const [date,location,description,detail,facility] = cells;
    if (!isMscHistoryRow({date,location,description,mode:detail,facility})) return [];
    const match = /^(\d{2})\/(\d{2})\/(20\d{2})$/.exec(date);
    if (!match) return [];
    const check = new Date(Date.UTC(Number(match[3]),Number(match[2])-1,Number(match[1])));
    if (check.getUTCMonth() !== Number(match[2])-1 || check.getUTCDate() !== Number(match[1])) return [];
    const vessel = /^(.+?)\s+([A-Z]{2}\d{3,4}[A-Z]?)$/.exec(detail ?? '');
    return [{container_number:snapshot.container,time:`${match[3]}-${match[2]}-${match[1]}`,time_raw:date,
      time_type:/\bestimated\b|\bETA\b/i.test(description) ? 'ESTIMATED' : 'REPORTED',
      timezone:null,time_basis:null,time_precision:'DATE',description,location,terminal:facility,
      vessel:vessel?.[1] ?? null,voyage:vessel?.[2] ?? null,
      load_status:/^(?:EMPTY|LADEN)$/i.test(detail ?? '') ? detail.toUpperCase() : null,
      mode:vessel ? 'VESSEL' : null,
      source:{kind:'PAGE_DETAILS',container:snapshot.container,section:'Date / Location / Description / Empty/Laden/Vessel/Voyage / Equipment handling facility name'}}];
  });
  return {number:snapshot.container,type:snapshot.type,eta:snapshot.eta ?? null,eta_raw:snapshot.eta ?? null,
    eta_label:'POD ETA',events,source:{kind:'PAGE_DETAILS',section:'Container history'}};
}

const cleanTooltip = item => {
  const aliases = item.kind === 'vessel' ? {Flag:'flag',IMO:'imo',Built:'built'} : {SMDG:'smdg',FIRMS:'firms',BIC:'bic'};
  return Object.fromEntries(Object.entries(item.fields ?? {}).filter(([key,value]) => aliases[key] && value)
    .map(([key,value]) => [aliases[key],value]));
};

export async function collectMscDetails({page,job,overview,artifactBase,signal,remaining,onPartial = () => {}}) {
  const cards = page.locator('.msc-flow-tracking__container:visible');
  const known = new Set(overview.containers);
  const details = [],errors = [],sources = [],artifacts = [];
  const vessels = new Map(),terminals = new Map(),candidates = new Map();
  const tooltipState = {state:'pending',attempted:0,succeeded:0,failed:0};
  const tooltipDebug = [];
  const result = () => {
    const events = details.flatMap(detail => detail.events.map(event => ({...event,
      vessel_details:vessels.get(event.vessel) ?? null,terminal_details:terminals.get(event.terminal) ?? null})));
    const latest = [...events].filter(event => event.time_type !== 'ESTIMATED').sort((a,b) => b.time.localeCompare(a.time))[0];
    return {reference:job.submitted,extraction:{containers:[...known],
      vessel_voyage:[...new Set(events.filter(event => event.vessel).map(event => `${event.vessel} / ${event.voyage}`))],
      fields:{container_details:details.map(detail => ({...detail,events:events.filter(event => event.container_number === detail.number)})),
        structured_events:events,msc_tooltip_capture:{...tooltipState},
        latest_event:latest ? [latest.time,latest.description,latest.location,latest.container_number].join(' | ') : undefined},
      events:events.map(event => [event.time,event.description,event.location,event.terminal,event.vessel,event.voyage,event.container_number].filter(Boolean).join(' | '))},
      coverage:{scope:'public_container_histories_and_tooltips',scope_complete:errors.length === 0 && details.length === known.size && tooltipState.state === 'captured',
        detailed_containers:details.filter(detail => detail.events.length).map(detail => detail.number)},sources,errors,artifacts};
  };
  const count = await cards.count();
  // Core histories always come first. Optional hover information can never
  // consume the budget needed to visit the remaining containers.
  for (let index = 0; index < Math.min(count,100); index += 1) {
    let number;
    try {
      actionTimeout(signal,remaining);
      const card = cards.nth(index);
      const bar = card.locator('.msc-flow-tracking__bar');
      number = (await bar.locator('.data-value').first().innerText({timeout:actionTimeout(signal,remaining)})).trim();
      if (!known.has(number)) throw stop('DETAIL_CONTAINER_MISMATCH','MSC result contains a container outside the confirmed overview');
      if (!/\bopen\b/.test(await bar.getAttribute('class') ?? '')) await bar.click({timeout:actionTimeout(signal,remaining)});
      await card.locator('.msc-flow-tracking__port:visible .data-value').first().waitFor({state:'visible',timeout:actionTimeout(signal,remaining)});
      const snapshot = await card.evaluate(readMscCard);
      if (snapshot.container !== number) throw stop('DETAIL_CONTAINER_MISMATCH','MSC expanded card belongs to another container');
      const parsed = parseMscRows(snapshot);
      if (!parsed.events.length) throw stop('DETAIL_EMPTY_HISTORY','MSC expanded card returned no valid movement rows');
      details.push(parsed);
      for (const event of parsed.events) {
        for (const [kind,value] of [['vessel',event.vessel],['terminal',event.terminal]]) {
          const key = `${kind}:${value}`;
          if (value && !candidates.has(key)) candidates.set(key,{kind,value,event,cardIndex:index});
        }
      }
      sources.push({id:`msc-details-${number}`,kind:'PAGE_DETAILS',url:page.url()});
      const output = `${artifactBase}.${number}.details.json`;
      await fs.writeFile(output,JSON.stringify(snapshot,null,2),'utf8');
      artifacts.push({kind:'PAGE_DETAILS_JSON',container:number,path:output});
      onPartial(result());
    } catch (error) {
      errors.push({code:error.code ?? 'DETAIL_CAPTURE_FAILED',message:`${number ?? `card ${index+1}`}: ${error.message}`});
      onPartial(result());
      if (signal.aborted || remaining() < 100) break;
    }
  }
  if (count > 100) errors.push({code:'DETAIL_CONTAINER_LIMIT',message:'MSC result exceeds the 100-card capture limit'});
  // A separate small budget and one attempt per unique key, including failed
  // keys. Copy/close buttons inside the tooltip are explicitly excluded.
  const tooltipDeadline = Date.now()+Math.min(12000,Math.max(0,remaining()-100));
  for (const candidate of candidates.values()) {
    if (signal.aborted || Date.now() >= tooltipDeadline || remaining() < 100) break;
    const store = candidate.kind === 'vessel' ? vessels : terminals;
    if (store.has(candidate.value)) continue;
    tooltipState.attempted++;
    const hoverStarted = Date.now();
    try {
      const row = cards.nth(candidate.cardIndex).locator('.msc-flow-tracking__port:visible')
        .filter({hasText:candidate.event.description}).first();
      const boxSelector = candidate.kind === 'vessel' ? '.msc-flow-tracking__tooltip-box.vessel' : '.msc-flow-tracking__tooltip-box:not(.vessel)';
      const button = row.locator(`.msc-flow-tracking__tooltip:has(> ${boxSelector}) > button.msc-flow-tracking__info--details:visible`).first();
      if (!await button.count()) {store.set(candidate.value,null);continue;}
      const timeout = Math.max(1,Math.min(3000,tooltipDeadline-Date.now(),remaining()-50));
      await button.hover({timeout});
      await row.locator(`${boxSelector}:visible`).first().waitFor({state:'visible',timeout});
      const metadata = await row.evaluate(readMscTooltips);
      const item = metadata.find(value => value.kind === candidate.kind);
      const values = cleanTooltip(item ?? {kind:candidate.kind});
      if (!Object.keys(values).length) throw stop('DETAIL_TOOLTIP_EMPTY','MSC visible tooltip returned no supported identifiers');
      store.set(candidate.value,values);
      tooltipState.succeeded++;
      tooltipDebug.push({kind:candidate.kind,value:candidate.value,status:'captured',duration_ms:Date.now()-hoverStarted});
    } catch (error) {
      store.set(candidate.value,null);
      tooltipState.failed++;
      errors.push({code:error.code ?? 'DETAIL_TOOLTIP_UNAVAILABLE',message:`${candidate.kind} ${candidate.value}: ${error.message}`});
      tooltipDebug.push({kind:candidate.kind,value:candidate.value,status:'failed',duration_ms:Date.now()-hoverStarted,message:String(error.message ?? error)});
    }
    onPartial(result());
  }
  const unresolved = [...candidates.values()].filter(candidate => !(candidate.kind === 'vessel' ? vessels : terminals).has(candidate.value)).length;
  if (unresolved) errors.push({code:'DETAIL_TOOLTIP_BUDGET',message:`${unresolved} unique MSC metadata tooltips were outside the separate hover budget`});
  tooltipState.state = tooltipState.failed || unresolved ? 'partial' : 'captured';
  if (artifactBase) {
    const output = `${artifactBase}.msc-tooltips.json`;
    await fs.writeFile(output,JSON.stringify({vessels:[...vessels],terminals:[...terminals],capture:tooltipState,debug:tooltipDebug},null,2),'utf8');
    artifacts.push({kind:'PAGE_TOOLTIP_JSON',path:output});
  }
  return result();
}
