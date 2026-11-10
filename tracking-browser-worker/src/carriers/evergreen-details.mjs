import fs from 'node:fs/promises';

const MONTHS = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
const stop = (code,message) => Object.assign(new Error(message),{code});
const actionTimeout = (signal,remaining,max = 7000) => {
  if (signal.aborted || remaining() < 100) throw stop('DETAIL_TIMEOUT','Evergreen supplementary capture reached its time budget');
  return Math.max(1,Math.min(max,remaining()-50));
};
export function matchesEvergreenDisclosure(response, origin, item) {
  try {
    const target=new URL(response.url());
    if(target.hostname!==origin.hostname||target.pathname!=='/servlet/TDB1_CargoTracking.do')return false;
    if(target.searchParams.get('Item')===item)return true;
    const request=response.request?.();
    return request?.method()==='POST'&&new URLSearchParams(request.postData()??'').get('Item')===item;
  }catch{return false;}
}
async function finishResponse(response,signal,remaining) {
  const timeout=actionTimeout(signal,remaining);
  let timer,abort;
  try {
    await Promise.race([response.finished(),new Promise((_,reject) => {
      const expired=() => reject(stop('DETAIL_DISCLOSURE_TIMEOUT','Evergreen disclosure did not finish loading within its budget'));
      timer=setTimeout(expired,timeout);abort=expired;signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)expired();
    })]);
  } finally {clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);}
}
export function evergreenDate(raw) {
  const match = /^([A-Z]{3})-(\d{1,2})-(20\d{2})$/i.exec(clean(raw));
  if (!match || !MONTHS[match[1].toUpperCase()]) return null;
  const month = MONTHS[match[1].toUpperCase()];
  const date = new Date(Date.UTC(Number(match[3]),month-1,Number(match[2])));
  if (date.getUTCMonth() !== month-1 || date.getUTCDate() !== Number(match[2])) return null;
  return `${match[3]}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
}

export function readEvergreenSummary(root) {
  const text = element => element?.textContent?.replace(/\s+/g,' ').trim() || '';
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const tables = [...root.querySelectorAll('table.ec-table')].filter(visible).map(table =>
    [...table.rows].map(row => [...row.cells].map(text)));
  const labels = {};
  for (const table of [...root.querySelectorAll('table.ec-table')].filter(visible)) {
    for (const row of table.rows) {
      const cells = [...row.cells];
      cells.forEach((cell,index) => {
        if (cell.tagName === 'TH' && cells[index+1]?.tagName === 'TD' && text(cell)) labels[text(cell)] = text(cells[index+1]);
      });
    }
  }
  const containerTable = tables.find(rows => rows.some(row => row.includes('Container No.') && row.includes('Seal No.')));
  const containers = (containerTable ?? []).filter(row => /^[A-Z]{4}\d{7}$/.test(row[0] ?? '')).map(row => ({
    number:row[0],type:row[1],seal:row[2],service_type:row[3],quantity:row[4],
    vgm_method:row[5],vgm:row[6],status:row[7],date:row[8],
  }));
  const release = root.querySelector('#RlsStatusInfo');
  const advance = root.querySelector('#AMInfo');
  const pickup = root.querySelector('#PickupRefInfo');
  const rows = element => element && visible(element) ? [...element.querySelectorAll('tr')]
    .map(row => [...row.cells].map(text)).filter(row => row.length > 1) : [];
  return {labels,containers,release_rows:rows(release),advance_filing_rows:rows(advance),
    pickup_rows:rows(pickup),pickup_disclaimer:pickup ? [...pickup.querySelectorAll('td')]
      .map(text).find(value => /standard tariff only/i.test(value)) ?? null : null};
}

export function readEvergreenHistory(root) {
  const text = element => element?.textContent?.replace(/\s+/g,' ').trim() || '';
  const table = [...root.querySelectorAll('table.ec-table')].find(item => /Container Moves\s*:/i.test(text(item)));
  const number = /Container Moves\s*:\s*([A-Z]{4}\d{7})/i.exec(text(table))?.[1];
  return {number,rows:table ? [...table.rows].map(row => [...row.cells].map(text)).filter(row => row.length === 4) : []};
}

export function parseEvergreenHistory(data,expectedContainer) {
  if (data?.number !== expectedContainer) throw stop('DETAIL_CONTAINER_MISMATCH','Evergreen movement window belongs to another container');
  return (data.rows ?? []).flatMap(([date,description,location,vesselRaw]) => {
    const time = evergreenDate(date);
    if (!time || !description || /^(?:Date|Container Moves)$/i.test(description)) return [];
    const vessel = /^(.*?)\s+(\d{3,4}-\d{2,4}[A-Z]?)$/.exec(vesselRaw ?? '');
    return [{container_number:expectedContainer,time,time_raw:date,time_precision:'DATE',
      time_type:/estimated|\bETA\b/i.test(description) ? 'ESTIMATED' : 'REPORTED',timezone:null,time_basis:null,
      description,location,terminal:null,vessel:vessel?.[1] ?? null,voyage:vessel?.[2] ?? null,
      mode:vessel ? 'VESSEL' : /haulage|pick-up/i.test(description) ? 'TRUCK' : null,
      source:{kind:'PAGE_DETAILS',container:expectedContainer,section:'Container Moves'}}];
  });
}

export function evergreenSupplementFields(summary) {
  const f = summary.labels ?? {};
  const release = summary.release_rows ?? [];
  const carrierHeader = release.findIndex(row => row[0] === 'Carrier Status');
  const carrier = carrierHeader < 0 ? [] : release[carrierHeader+1] ?? [];
  const customsHeader = release.findIndex(row => row.length === 3 && row[0] === 'Status' && row[1] === 'Description');
  const customs = customsHeader < 0 ? [] : release[customsHeader+1] ?? [];
  const pickup = summary.pickup_rows ?? [];
  const pickupValue = label => pickup.find(row => row[0] === label)?.[1] || null;
  const location = pickup.find(row => row[0] === 'City') ?? [];
  const detention = pickup.filter(row => /^[A-Z]{4}\d{7}$/.test(row[0] ?? '') && row.length === 3).map(row => ({
    container_number:row[0],last_free_day:evergreenDate(row[1]),last_free_day_raw:row[1],free_time_raw:row[2],
    basis:'TARIFF_STANDARD_REFERENCE',contract_terms_prevail:true,guaranteed:false,disclaimer_raw:summary.pickup_disclaimer ?? null,
  }));
  return {bill_of_lading:clean(f['B/L No.']).replace(/\s/g,'') || undefined,
    por:f['Port of Loading'] || undefined,pod:f['Port of Discharge'] || undefined,
    place_of_receipt:f['Place of Receipt'] || undefined,place_of_delivery:f['Place of Delivery'] || undefined,
    weight:f['Gross Weight'] || undefined,measurement:f.Measurement || undefined,
    manifest_quantity:f['Manifest Quantity'] || undefined,service_mode:f['Service Mode'] || undefined,
    estimated_on_board_date:f['Estimated On Board Date'] || undefined,
    evergreen_release:{carrier_status:carrier[0] || null,freight_status:carrier[1] || null,
      bill_type:carrier[4] || null,bill_date_raw:carrier[5] || null,
      customs_status:customs[0] || null,customs_description:customs[1] || null,customs_date_raw:customs[2] || null},
    evergreen_advance_filing:summary.advance_filing_rows ?? [],
    evergreen_pickup_reference:{terminal_name:pickupValue('Name'),address:pickupValue('Address1'),
      city:location[1] || null,state:location[3] || null,postal_code:location[5] || null,detention},
    evergreen_supplement_raw:{labels:f,release_rows:release,advance_filing_rows:summary.advance_filing_rows ?? [],pickup_rows:pickup}};
}

export async function collectEvergreenDetails({page,job,overview,artifactBase,signal,remaining,onPartial = () => {}}) {
  const errors = [],artifacts = [],sources = [],details = [];
  const url = new URL(page.url());
  if (!/(?:^|\.)shipmentlink\.com$/.test(url.hostname)) throw stop('DETAIL_SOURCE_MISMATCH','Evergreen details are not on ShipmentLink');
  // All selectors below were observed ordinary disclosures. No hidden content
  // is read until its actual visible disclosure has been opened.
  for (const [selector,title,marker,item] of [
    ['#CustomsInfo','Customs Information (Incl. Advance Filing Status)','#CustomsTitle',null],
    ['#RlsStatusInfo','Release Status','#RlsStatusTitle','RlsStatus'],
    ['#PickupRefInfo','Pick-up Reference Information','#PickupRefTitle','PickupRef'],
    ['#AMInfo','Advance Filing Status','#AMTitle','AMSACK'],
  ]) {
    try {
      actionTimeout(signal,remaining);
      const panel = page.locator(selector);
      const link = page.getByRole('link',{name:title,exact:true});
      const needsData = !await panel.locator('table').count();
      if (await link.count() && (!await panel.isVisible() || needsData)) {
        const open = clean(await page.locator(marker).innerText().catch(() => '')) === '-';
        let response;
        if (!open) {
          const loaded = item && needsData ? page.waitForResponse(response => matchesEvergreenDisclosure(response,url,item),
            {timeout:actionTimeout(signal,remaining)}) : Promise.resolve(null);
          [,response] = await Promise.all([link.click({timeout:actionTimeout(signal,remaining)}),loaded]);
          if (response) await finishResponse(response,signal,remaining);
        }
        if (selector !== '#AMInfo' || (open && needsData)) {
          // An already-open but empty panel can still have an in-flight AJAX
          // request. Wait for its data instead of toggling/re-requesting it.
          await panel.locator('table').first().waitFor({state:'visible',timeout:actionTimeout(signal,remaining)});
        } else if (response) await page.waitForTimeout(Math.min(150,actionTimeout(signal,remaining)));
      }

    } catch (error) {errors.push({code:error.code ?? 'DETAIL_DISCLOSURE_UNAVAILABLE',message:`${title}: ${error.message}`});}
  }
  actionTimeout(signal,remaining);
  const summary = await page.locator('body').evaluate(readEvergreenSummary);
  const fields = evergreenSupplementFields(summary);
  const printed = clean(fields.bill_of_lading).replace(/^EGLV/,'');
  const requested = clean(job.submitted).replace(/^EGLV/,'');
  if (printed && job.reference_type !== 'CONTAINER' && job.reference_type !== 'BOOKING' && printed !== requested)
    throw stop('DETAIL_REFERENCE_MISMATCH','Evergreen detail heading does not match the requested bill');
  const known = new Set(overview.containers);
  const result = () => {
    const events = details.flatMap(detail => detail.events);
    const latest = [...events].sort((a,b) => b.time.localeCompare(a.time))[0];
    return {reference:job.submitted,extraction:{containers:[...known],
      vessel_voyage:[...new Set(events.filter(event => event.vessel).map(event => `${event.vessel} / ${event.voyage}`))],
      fields:{...fields,container_details:details,structured_events:events,
        latest_event:latest ? [latest.time,latest.description,latest.location,latest.container_number].join(' | ') : undefined},
      events:events.map(event => [event.time,event.description,event.location,event.vessel,event.voyage,event.container_number].filter(Boolean).join(' | '))},
      coverage:{scope:'public_container_moves_and_release',scope_complete:details.length === known.size && !errors.length,
        detailed_containers:details.filter(detail => detail.events.length).map(detail => detail.number)},sources,errors,artifacts};
  };
  if (artifactBase) {
    const output = `${artifactBase}.evergreen-summary.json`;
    await fs.writeFile(output,JSON.stringify(summary,null,2),'utf8');
    artifacts.push({kind:'PAGE_DETAILS_JSON',path:output});
  }
  sources.push({id:'evergreen-supplement',kind:'PAGE_DETAILS',url:url.origin+url.pathname});
  onPartial(result());
  for (const container of summary.containers.slice(0,100)) {
    let popup;
    try {
      actionTimeout(signal,remaining);
      if (!known.has(container.number)) throw stop('DETAIL_CONTAINER_MISMATCH','Evergreen detail table contains an unbound container');
      const link = page.getByRole('link',{name:container.number,exact:true});
      const opened = page.waitForEvent('popup',{timeout:actionTimeout(signal,remaining)});
      [,popup] = await Promise.all([link.click({timeout:actionTimeout(signal,remaining)}),opened]);
      await popup.waitForLoadState('domcontentloaded',{timeout:actionTimeout(signal,remaining)});
      await popup.locator('table.ec-table').first().waitFor({state:'visible',timeout:actionTimeout(signal,remaining)});
      const raw = await popup.locator('body').evaluate(readEvergreenHistory);
      const events = parseEvergreenHistory(raw,container.number);
      if (!events.length) throw stop('DETAIL_EMPTY_HISTORY','Evergreen container window returned no movement rows');
      details.push({number:container.number,type:container.type,latest_status:container.status,
        status_time:evergreenDate(container.date),status_time_raw:container.date,
        source:{kind:'PAGE_DETAILS',section:'Container(s) information on B/L and Current Status'},
        events,extra:{seal:container.seal,service_type:container.service_type,quantity_raw:container.quantity,
          vgm:{raw:container.vgm,method:container.vgm_method,label:'VGM'},
          reported_cargo_gross_weight_raw:summary.labels['Gross Weight'] ?? null}});
      details.at(-1).extra.detention = fields.evergreen_pickup_reference.detention.find(item => item.container_number === container.number) ?? null;
      if (artifactBase) {
        const output = `${artifactBase}.${container.number}.evergreen-moves.json`;
        await fs.writeFile(output,JSON.stringify(raw,null,2),'utf8');
        artifacts.push({kind:'PAGE_DETAILS_JSON',container:container.number,path:output});
      }
      sources.push({id:`evergreen-moves-${container.number}`,kind:'PAGE_DETAILS',url:new URL(popup.url()).origin+new URL(popup.url()).pathname});
      onPartial(result());
    } catch (error) {
      errors.push({code:error.code ?? 'DETAIL_CONTAINER_FAILED',message:`${container.number}: ${error.message}`});
      onPartial(result());
      if (signal.aborted || remaining() < 100) break;
    } finally {if (popup && !popup.isClosed()) await popup.close().catch(() => {});}
  }
  return result();
}
