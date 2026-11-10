import fs from 'node:fs/promises';
import {BOX,clean,fail,actionTime,detailState} from './ordinary-detail-common.mjs';

const HEADERS=['Event','Location','Date','Time','Transport','Voyage No.'];
const ROW='tr.q-tr:visible:has(> td:first-child b.no-wrap.text-underline)';
const referenceKey=value=>clean(value).replace(/\s+/g,'').toUpperCase();

export function hapagLocalStamp(date,clock) {
  const day=clean(date),time=clean(clock);
  const d=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(day);
  const t=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if(!d||!t)return null;
  const calendar=new Date(Date.UTC(Number(d[1]),Number(d[2])-1,Number(d[3])));
  if(calendar.getUTCMonth()!==Number(d[2])-1||calendar.getUTCDate()!==Number(d[3])||
    Number(t[1])>23||Number(t[2])>59||Number(t[3]??0)>59)return null;
  return {time:`${day}T${time}`,time_raw:`${day} ${time}`,time_precision:t[3]?'SECOND':'MINUTE'};
}

// DOM reader for the normally expanded sibling row. No private application
// state, requests, verification widgets or synthetic control events are used.
export function readHapagExpandedRow(row) {
  const text=element=>element?.innerText?.replace(/\s+/g,' ').trim()||'';
  const visible=element=>!!element&&!!element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden';
  const cells=[...row.children].filter(element=>element.tagName==='TD');
  const tracking=row.nextElementSibling?.querySelector('.hal-event-tracking');
  const value=(event,key)=>text([...event.querySelectorAll('span.hal-event__col')].find(column=>
    (column.getAttribute('aria-labelledby')??'').split(/\s+/).some(id=>id.startsWith(`event-header-${key}-`))));
  const table=row.closest('.q-table__container');
  return {number:text(cells[0]?.querySelector('b.no-wrap.text-underline')),
    overview:{type:text(cells[3]),tare_kg_raw:text(row.querySelector('[data-testid="tareKg"]')),
      max_payload_kg_raw:text(row.querySelector('[data-testid="maxPayloadKg"]')),
      latest_event:text(cells[4]),planned_raw:text(cells[5])},
    headers:tracking?[...tracking.querySelectorAll('.hal-event-tracking__header-col')].filter(visible).map(text):[],
    rows:tracking?[...tracking.querySelectorAll('.hal-event__inline')].filter(visible).map(event=>({
      event:value(event,'event'),location:value(event,'locationName'),date:value(event,'date'),time:value(event,'time'),
      transport:value(event,'transport'),voyage:value(event,'voyage')})):[],
    pagination_text:text(table?.querySelector('.q-table__bottom'))};
}

const equipmentMass=value=>{
  const raw=clean(value);
  return /^\d[\d,]*(?:\.\d+)?$/.test(raw)?Number(raw.replace(/,/g,'')):null;
};

export function parseHapagExpandedRow(raw,number) {
  if(!BOX.test(number??'')||raw?.number!==number)throw fail('DETAIL_CONTAINER_MISMATCH','Hapag history belongs to another container');
  if(JSON.stringify((raw.headers??[]).map(clean))!==JSON.stringify(HEADERS))
    throw fail('DETAIL_HEADER_MISMATCH','Hapag movement table does not have the observed six public columns');
  const events=[],seen=new Set();let invalid=0,duplicates=0;
  for(const row of raw.rows??[]) {
    const stamp=hapagLocalStamp(row.date,row.time),description=clean(row.event),location=clean(row.location);
    if(!stamp||!description||!location){invalid++;continue;}
    const transport=clean(row.transport),voyage=clean(row.voyage)||null;
    const mode=/^truck$/i.test(transport)?'TRUCK':/^(?:rail|train)$/i.test(transport)?'RAIL':null;
    const vessel=!mode&&voyage&&transport?transport:null;
    const identity=JSON.stringify([number,stamp.time,description,location,transport,voyage]);
    if(seen.has(identity)){duplicates++;continue;}seen.add(identity);
    events.push({container_number:number,...stamp,description,location,terminal:null,
      vessel,voyage:vessel?voyage:null,mode:mode??(vessel?'VESSEL':null),
      time_type:'REPORTED',timezone:null,time_basis:'LOCAL_TIME',
      source:{kind:'PAGE_DETAILS',container:number,section:'Event / Location / Date / Time / Transport / Voyage No.'},
      extra:{transport_raw:transport||null,voyage_raw:voyage,date_raw:clean(row.date),clock_raw:clean(row.time)}});
  }
  const latest=events.at(-1),overview=raw.overview??{};
  return {number,type:clean(overview.type)||null,tare_kg:equipmentMass(overview.tare_kg_raw),
    payload_kg:equipmentMass(overview.max_payload_kg_raw),planned_raw:clean(overview.planned_raw)||null,
    latest_status:latest?.description??null,status_time:latest?.time??null,status_time_raw:latest?.time_raw??null,
    position:latest?.location??null,timezone:null,events,
    source:{kind:'PAGE_DETAILS',section:'Expanded container movement history'},
    extra:{hapag_overview_latest_event:clean(overview.latest_event)||null,
      hapag_equipment_specifications:{tare_raw:clean(overview.tare_kg_raw)||null,max_payload_raw:clean(overview.max_payload_kg_raw)||null,unit:'KG'},
      hapag_history_coverage:{reported_rows:(raw.rows??[]).length,captured_rows:events.length,invalid_rows:invalid,duplicate_rows:duplicates}}};
}

async function confirmReference(page,job,signal,remaining) {
  const modern=page.getByRole('searchbox',{name:/Container, Booking or B\/L No\./i});
  const legacy=[page.getByLabel('Bill of Lading No.',{exact:true}),page.getByLabel('Booking No.',{exact:true})];
  for(const input of [modern,...legacy]) {
    if(await input.isVisible().catch(()=>false)) {
      const value=await input.inputValue({timeout:actionTime(signal,remaining)});
      if(referenceKey(value)===referenceKey(job.submitted)||referenceKey(value)===referenceKey(job.reference))return;
    }
  }
  throw fail('DETAIL_REFERENCE_MISMATCH','Hapag visible query field does not match the submitted reference');
}

export async function collectHapagDetails(options) {
  const {page,job,overview,artifactBase,signal,remaining,onPartial}=options;
  const url=new URL(page.url());
  if(url.origin!=='https://www.hapag-lloyd.com'||!/^\/(?:solutions\/tracking\/?|en\/online-business\/track\/track-by-booking-solution\.html)$/.test(url.pathname))
    throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected Hapag public tracking result');
  actionTime(signal,remaining);await confirmReference(page,job,signal,remaining);
  const domArtifacts=[];
  const state=detailState({carrier:'HAPAG_LLOYD',page,job,overview,artifactBase,onPartial:()=>onPartial?.(result()),
    scope:'public_visible_container_movement_histories'});
  const result=()=>{
    const value=state.result(),details=[...state.details.values()],events=value.extraction.fields.structured_events;
    value.artifacts.push(...domArtifacts);
    const latest=details.map(detail=>detail.events.at(-1)).filter(Boolean);
    // Across unknown zones, compare local clocks only at the same location.
    // Within each box the website's displayed sequence is authoritative.
    const oneLocation=new Set(latest.map(event=>referenceKey(event.location))).size===1;
    const top=latest.length===1?latest[0]:oneLocation?[...latest].sort((a,b)=>b.time.localeCompare(a.time))[0]:null;
    const ships=details.map(detail=>[...detail.events].reverse().find(event=>event.vessel));
    const distinct=new Map(ships.filter(Boolean).map(event=>[`${event.vessel}|${event.voyage}`,event]));
    const common=ships.length&&ships.every(Boolean)&&distinct.size===1?[...distinct.values()][0]:null;
    Object.assign(value.extraction.fields,{hapag_detail_history:events.length>0,
      hapag_reported_vessel:common?{name:common.vessel,voyage:common.voyage,source:{kind:'PAGE_DETAILS',section:'Transport / Voyage No.'}}:null,
      ...(common?{vessel_name:common.vessel,voyage:common.voyage}:{}),
      ...(top?{latest_event:[top.time,top.description,top.location,top.container_number].join(' | ')}:{})});
    return value;
  };
  const rows=page.locator(ROW),count=await rows.count(),visited=new Set();
  if(!count)throw fail('DETAIL_CONTAINER_NOT_FOUND','Hapag public result rows were not found');
  let total=null;
  for(let index=0;index<Math.min(count,100);index++) {
    let number;
    try {
      actionTime(signal,remaining);
      const row=rows.nth(index),link=row.locator('td:first-child b.no-wrap.text-underline');
      number=clean(await link.innerText({timeout:actionTime(signal,remaining)}));
      if(!state.known.has(number))throw fail('DETAIL_CONTAINER_MISMATCH','Hapag row is outside the confirmed overview');
      if(visited.has(number))continue;visited.add(number);
      const tracking=row.locator('xpath=following-sibling::tr[1]').locator('.hal-event-tracking');
      if(!await tracking.isVisible())await link.click({timeout:actionTime(signal,remaining)});
      await tracking.waitFor({state:'visible',timeout:actionTime(signal,remaining)});
      await tracking.locator('.hal-event__inline').first().waitFor({state:'visible',timeout:actionTime(signal,remaining)});
      const raw=await row.evaluate(readHapagExpandedRow);
      const pagination=/(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/i.exec(raw.pagination_text??'');
      if(pagination)total=Number(pagination[3]);
      const parsed=parseHapagExpandedRow(raw,number);
      await state.save(parsed);
      if(parsed.extra.hapag_history_coverage.invalid_rows)state.addError(fail('DETAIL_ROWS_PARTIAL','Some Hapag rows had invalid or incomplete date/location values'),number);
      if(artifactBase){const path=`${artifactBase}.hapag-${number}.dom.json`;
        await fs.writeFile(path,JSON.stringify(raw,null,2),'utf8');domArtifacts.push({kind:'PAGE_DETAILS_DOM_JSON',container:number,path});}
      onPartial?.(result());
    }catch(error){state.addError(error,number);if(signal?.aborted||remaining()<100)break;}
  }
  if(count>100)state.addError(fail('DETAIL_CONTAINER_LIMIT','Hapag result exceeds the 100-row capture limit'));
  if(total!==null&&total!==state.known.size)state.addError(fail('DETAIL_PAGINATION_INCOMPLETE','Hapag reports containers beyond the confirmed visible overview'));
  const value=result();
  if(total!==null)value.extraction.fields.declared_containers=String(total);
  return value;
}
