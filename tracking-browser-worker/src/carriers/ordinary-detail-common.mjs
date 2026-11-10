import fs from 'node:fs/promises';

export const BOX = /^[A-Z]{4}\d{7}$/;
export const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export const cells = row => (row ?? []).map(cell => clean(typeof cell === 'object' ? cell.text : cell));
export const table = (document, headers) => (document.tables ?? []).find(item =>
  JSON.stringify(cells(item.rows?.[0])) === JSON.stringify(headers));
export const rows = item => (item?.rows ?? []).slice(1).map(cells);
export const fail = (code, message) => Object.assign(new Error(message), {code});
export const actionTime = (signal, remaining, max = 7000) => {
  if (signal?.aborted || remaining() < 100) throw fail('DETAIL_TIMEOUT', 'Ordinary detail capture reached its time budget');
  return Math.max(1, Math.min(max, remaining() - 50));
};
export const publicUrl = url => {const value = new URL(url); return value.origin + value.pathname;};
export const normalizedBox = value => clean(value).replace(/-/g, '').toUpperCase();

export function localDate(value, format = 'YMD') {
  const raw = clean(value);
  const m = format === 'MDY'
    ? /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw)
    : /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (!m) return null;
  const [year, month, day] = format === 'MDY' ? [Number(m[3]) + (m[3].length === 2 ? 2000 : 0), Number(m[1]), Number(m[2])] : [Number(m[1]), Number(m[2]), Number(m[3])];
  const hour = Number(m[4] ?? 0), minute = Number(m[5] ?? 0), second = Number(m[6] ?? 0);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}${m[4] ? `T${m[4]}:${m[5]}:${m[6] ?? '00'}` : ''}`;
}

export function zonedLabelDate(value) {
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}) ([A-Z]{2,5})$/.exec(clean(value));
  if (!m) return null;
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()) + 1;
  const time = localDate(`${m[3]}-${String(month).padStart(2,'0')}-${m[1].padStart(2,'0')} ${m[4]}:${m[5]}`);
  return time ? {time, timezone:m[6]} : null;
}

// Serializable browser reader: rendered business tables only, with no requests.
export function readOrdinaryDocument({scope = 'body', start = ''} = {}) {
  const root = document.querySelector(scope);
  if (!root) return {text:'', tables:[], links:[]};
  const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  let text = root.innerText ?? '';
  if (start && text.includes(start)) text = text.slice(text.indexOf(start));
  text = text.split(/DISCLAIMER\s*:|Also of Interest:|Copyright ©/)[0];
  return {text, tables:[...root.querySelectorAll('table')].filter(visible).map(element => ({id:element.id,
    rows:[...element.rows].filter(visible).map(row => [...row.cells].map(cell => cell.innerText.trim()))})),
  links:[...root.querySelectorAll('a[href]')].filter(visible).map(element => ({text:element.innerText.trim(),href:element.getAttribute('href')})),
  selected:document.querySelector('#thisCntr')?.value ?? null,
  reference:document.querySelector('#thisBl')?.value ?? null,
  booking:document.querySelector('#thisBkg')?.value ?? null,
  hmmContainers:[...document.querySelectorAll('#containerStatus [id^=cntrId]')].filter(visible).map(element => ({id:element.id,number:element.innerText.trim()}))};
}

export function detailState({carrier,page,job,overview,artifactBase,scope,onPartial = () => {}}) {
  const known = new Set((overview.containers ?? []).map(item => typeof item === 'string' ? item : item.number).filter(number => BOX.test(number ?? '')));
  const details = new Map(), errors = [], artifacts = [], extra = {};
  const sourceUrl = publicUrl(page.url());
  const result = () => {
    const list = [...details.values()], events = list.flatMap(item => item.events ?? []);
    return {reference:job.submitted, extraction:{containers:[...known],
      vessel_voyage:[...new Set(events.filter(item => item.vessel).map(item => [item.vessel,item.voyage].filter(Boolean).join(' / ')))],
      fields:{container_details:list, structured_events:events, extra:{...extra}},
      events:events.map(item => [item.container_number,item.time_raw,item.description,item.location,item.terminal].filter(Boolean).join(' | '))},
    coverage:{scope,scope_complete:known.size > 0 && list.filter(item => item.events?.length).length === known.size && errors.length === 0,
      detailed_containers:list.filter(item => item.events?.length).map(item => item.number)},
    sources:[{id:`${carrier.toLowerCase()}-public-details`,kind:'PAGE_DETAILS',url:sourceUrl}],errors:[...errors],artifacts:[...artifacts]};
  };
  return {known,details,errors,extra,result,publish:() => onPartial(result()),
    addError(error, number) {errors.push({code:error.code ?? 'DETAIL_CAPTURE_FAILED',message:`${number ?? carrier}: ${String(error.message ?? error).slice(0,180)}`});onPartial(result());},
    async save(detail) {
      if (!known.has(detail.number)) throw fail('DETAIL_CONTAINER_MISMATCH','Detail belongs to a container outside this shipment');
      if (!detail.events?.length) throw fail('DETAIL_EMPTY_HISTORY','No dated movement rows were returned');
      details.set(detail.number,detail); onPartial(result());
      if (artifactBase) {
        const path = `${artifactBase}.${carrier.toLowerCase()}-${detail.number}.details.json`;
        await fs.writeFile(path,JSON.stringify(detail,null,2),'utf8');
        artifacts.push({kind:'PAGE_DETAILS_JSON',container:detail.number,path});
      }
      onPartial(result());
    }};
}
