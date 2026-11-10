import fs from 'node:fs/promises';

const BOX = /^[A-Z]{4}\d{7}$/;
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function maerskLocalDate(value) {
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})(?: (\d{2}):(\d{2}))?$/.exec(clean(value));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const day = Number(m[1]), year = Number(m[3]);
  const hour = Number(m[4] ?? 0), minute = Number(m[5] ?? 0);
  if (month < 0 || hour > 23 || minute > 59 || new Date(Date.UTC(year, month, day)).getUTCDate() !== day) return null;
  return `${m[3]}-${String(month+1).padStart(2,'0')}-${m[1].padStart(2,'0')}${m[4] ? `T${m[4]}:${m[5]}:00` : ''}`;
}

// The public tracking card groups adjacent events below a city/terminal header.
// Read the rendered DOM in that order, within one container, never the page footer.
export function readMaerskCardDom(card) {
  const text = e => (e?.innerText ?? '').replace(/\s+/g,' ').trim();
  const visible = e => !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const events = [];
  let location = null, terminal = null;
  for (const element of card.querySelectorAll('[data-test="event-location-city"], [data-test="event-name"]')) {
    if (!visible(element)) continue;
    if (element.getAttribute('data-test') === 'event-location-city') {
      location = text(element.querySelector('p')) || null;
      terminal = text(element.querySelector('[data-test="event-location-terminal"]')) || null;
      continue;
    }
    const row = element.closest('[data-test="container-event-row"], [data-test="container-event-current"]');
    if (!row) continue;
    const label = element.cloneNode(true);
    label.querySelectorAll('[data-test="event-latest-badge"]').forEach(e => e.remove());
    const rawTime = text(row.querySelector('[data-test="event-date"]'));
    const completedList = row.closest('[data-test="completed-events-list"]');
    const completedLabel = text(card.querySelector('[data-test="completed-events-toggle"]'));
    const fullText = text(row);
    events.push({description:label.textContent.replace(/\s+/g,' ').trim(),time_raw:rawTime,
      location,terminal,completed:!!completedList && /events? completed/i.test(completedLabel),
      estimated:/\bestimated\b/i.test(fullText)});
  }
  return {number:card.getAttribute('data-test-container'),type:text(card.querySelector('[data-test="accordion-container-type"]')),
    localTime:/all times are given in local time/i.test(text(card.querySelector('[data-test="container-timezone-note"]'))),
    events};
}

export function parseMaerskCardData(data) {
  const number = clean(data?.number).toUpperCase();
  if (!BOX.test(number)) throw new Error('Maersk detail has no bound container');
  const seen = new Set();
  const events = [];
  for (const row of data.events ?? []) {
    const description = clean(row.description), timeRaw = clean(row.time_raw);
    const time = maerskLocalDate(timeRaw);
    if (!description || !time || /^(?:date|location|description|view \d+ events?)$/i.test(description)) continue;
    const key = JSON.stringify([description,timeRaw,row.location,row.terminal]);
    if (seen.has(key)) continue;
    seen.add(key);
    const vessel = /(?:\bon\s+|\()(.+?)\s*\/\s*([A-Z0-9-]+)\)?$/i.exec(description);
    events.push({container_number:number,description,time,time_raw:timeRaw,
      location:clean(row.location)||null,terminal:clean(row.terminal)||null,
      vessel:vessel?.[1]?.trim()??null,voyage:vessel?.[2]??null,
      time_type:row.estimated ? 'ESTIMATED' : row.completed ? 'ACTUAL' : 'REPORTED',
      timezone:null,time_basis:data.localTime ? 'LOCAL_TIME' : null,
      mode:/vessel|load on|discharge/i.test(description)?'VESSEL':/gate|empty container/i.test(description)?'TRUCK':null,
      source:{kind:'PAGE_DETAILS',container:number,section:row.completed?'completed_events':'public_event'}});
  }
  return {number,type:clean(data.type)||null,events};
}

export async function collectMaerskDetails({page,job,overview,artifactBase,signal,remaining,onPartial=()=>{}}) {
  const containers=[], errors=[], artifacts=[];
  const known = new Set((overview?.containers??[]).map(c=>typeof c==='string'?c:c.number).filter(Boolean));
  const origin = new URL(page.url());
  if (origin.origin!=='https://www.maersk.com' || !origin.pathname.startsWith('/tracking/')) throw new Error('Unexpected Maersk public page');
  const reference = String(job.submitted);
  const visibleReference=clean(await page.locator('[data-test="ocean-design-bl-value"]').innerText({timeout:Math.max(1,Math.min(3000,remaining()))}).catch(()=>''));
  const sameReference=visibleReference===reference || visibleReference===reference.replace(/^MAEU/i,'') || known.has(reference);
  if(!sameReference)throw Object.assign(new Error('Maersk detail reference mismatch'),{code:'DETAIL_REFERENCE_MISMATCH'});
  const cards=page.locator('[data-test="container-design-accordion-item"][data-test-container]');
  const count=await cards.count();
  if(!count)throw new Error('Maersk public container cards not found');
  const result=()=>({reference,extraction:{containers:containers.map(c=>c.number),
    vessel_voyage:[...new Set(containers.flatMap(c=>c.events.filter(e=>e.vessel).map(e=>`${e.vessel} / ${e.voyage}`)))],
    fields:{container_details:containers,structured_events:containers.flatMap(c=>c.events)},
    events:containers.flatMap(c=>c.events.map(e=>`${c.number} | ${e.time_raw} | ${e.description} | ${e.location??''}`))},
    coverage:{scope:'public_container_histories',scope_complete:containers.length===count&&errors.length===0,
      detailed_containers:containers.map(c=>c.number)},sources:[{id:'maersk-public-details',kind:'PAGE_DETAILS',url:origin.origin+origin.pathname}],errors:[...errors],artifacts:[...artifacts]});
  const timeout=()=>Math.max(1,Math.min(5000,remaining()));
  for(let i=0;i<Math.min(count,200);i++){
    if(signal?.aborted||remaining()<=0)break;
    const card=cards.nth(i),number=await card.getAttribute('data-test-container');
    if(!BOX.test(number??'') || (known.size && !known.has(number))){errors.push({code:'DETAIL_CONTAINER_MISMATCH',message:'Unbound Maersk container ignored'});continue;}
    try{
      const button=card.getByRole('button',{name:/^container /i}).first();
      if(await button.getAttribute('aria-expanded')!=='true')await button.click({timeout:timeout()});
      let expanded=0;
      while(remaining()>0&&!signal?.aborted){
        const view=card.getByRole('button',{name:/^View \d+ events?/i}).first();
        if(!await view.isVisible().catch(()=>false))break;
        if(expanded++>=20)throw new Error('Maersk detail expansion limit reached');
        const before=await view.innerText();await view.click({timeout:timeout()});
        await view.waitFor({state:'hidden',timeout:timeout()}).catch(async()=>{if(await view.isVisible()&&await view.innerText()===before)throw new Error('Maersk event expander did not change');});
      }
      if(signal?.aborted||remaining()<=0)break;
      const raw=await card.evaluate(readMaerskCardDom), detail=parseMaerskCardData(raw);
      if(!detail.events.length)throw new Error('Maersk detail contains no dated business events');
      containers.push(detail);
      if(artifactBase){const path=`${artifactBase}.maersk-${number}.json`;await fs.writeFile(path,JSON.stringify(raw,null,2));artifacts.push({kind:'PAGE_DETAILS',path,container:number});}
      onPartial(result());
    }catch(e){errors.push({code:'DETAIL_CONTAINER_FAILED',message:String(e.message).slice(0,180)});onPartial(result());}
  }
  if(count>200)errors.push({code:'DETAIL_LIMIT_REACHED',message:'Public container detail limit reached'});
  return result();
}
