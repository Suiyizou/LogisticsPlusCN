import fs from 'node:fs/promises';
import {BOX,clean,fail,actionTime,detailState} from './ordinary-detail-common.mjs';
import {hapagLocalStamp} from './hapag-details.mjs';

const HEADERS=['Status','Place of Activity','Date','Time','Transport','Voyage No.'];
const HISTORY_ID='tracing_by_container_f:hl66';
const normalized=value=>clean(value).replace(/\s+/g,'').toUpperCase();
const LEGEND=/Bold data represents actual data,?\s*all other rows indicate planned movements\.?/i;
const legacyUrl=value=>{try{const url=new URL(value);return url.origin==='https://www.hapag-lloyd.com'&&/^\/(?:en|zh)\/online-business\/track\/track-by-container-solution(?:-legacy)?\.html$/.test(url.pathname)?url:null;}catch{return null;}};

// Serializable read-only browser reader. Only rendered input, table, equipment
// and legend values are read; there are no requests, app-state or cookie reads.
export function readHapagLegacyDocument(){
  const text=element=>element?.innerText?.replace(/\s+/g,' ').trim()||'';
  const visible=element=>!!element&&!!element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden';
  const labelled=[...document.querySelectorAll('label[for]')].filter(label=>/^Container No\.?$/.test(text(label)))
    .map(label=>document.getElementById(label.htmlFor)).filter(element=>element?.tagName==='INPUT'&&visible(element));
  const candidates=[...new Set(labelled.length?labelled:[...document.querySelectorAll('input[id^="tracing_by_container_f:"]')]
    .filter(element=>visible(element)&&(!element.type||element.type==='text')))];
  const table=document.getElementById('tracing_by_container_f:hl66');
  const headers=table&&visible(table)?[...table.querySelectorAll('thead')].filter(visible).flatMap(head=>
    [...head.querySelectorAll('tr')].filter(visible).map(row=>[...row.children].filter(cell=>cell.tagName==='TH').map(text)))[0]??[]:[];
  const rows=table&&visible(table)?[...table.tBodies].flatMap(body=>[...body.rows]).filter(visible).map(row=>({
    className:row.className,cells:[...row.children].filter(cell=>cell.tagName==='TD').map(cell=>({text:text(cell),className:cell.className,
      fontWeight:getComputedStyle(cell).fontWeight,
      visibleTextWeights:[...cell.querySelectorAll('*')].filter(element=>visible(element)&&text(element)).map(element=>({fontWeight:getComputedStyle(element).fontWeight}))}))})):[];
  const equipment=[...document.querySelectorAll('table')].filter(visible).map(item=>({id:item.id,
    rows:[...item.querySelectorAll(':scope > tbody > tr')].filter(visible).map(row=>[...row.children].filter(cell=>cell.tagName==='TD').map(text))}))
    .filter(item=>item.rows.some(row=>row.length===2&&/^(?:Type|Description|Dimension|Tare \(kg\)|Max\. Payload \(kg\))$/.test(row[0])));
  const body=document.body?.innerText??'';
  const legend=/Bold data represents actual data,?\s*all other rows indicate planned movements\.?/i.exec(body)?.[0]??null;
  const lastMovement=/The vessel departed from[^\r\n]+/i.exec(body)?.[0]??null;
  return {url:location.href,reference:candidates.length===1?candidates[0].value:null,input_count:candidates.length,
    history:{id:table&&visible(table)?table.id:null,headers,rows},equipment,legend,last_movement_raw:lastMovement};
}

function field(document,label){
  const values=[...new Set((document.equipment??[]).flatMap(table=>(table.rows??[]).filter(row=>row.length===2&&clean(row[0])===label).map(row=>clean(row[1]))).filter(Boolean))];
  if(values.length>1)throw fail('DETAIL_EQUIPMENT_AMBIGUOUS','Legacy equipment has conflicting values for '+label);
  return values[0]??null;
}
function kg(value){return /^\d[\d,]*(?:\.\d+)?$/.test(value??'')?Number(value.replaceAll(',','')):null;}
function weight(value){if(value==='bold')return 700;if(value==='normal')return 400;return /^\d+$/.test(String(value))?Number(value):null;}
function rowKind(cells,legend){
  if(!legend)return 'REPORTED';
  const strong=cell=>String(cell.className??'').split(/\s+/).includes('strong');
  const weights=cell=>[weight(cell.fontWeight),...(cell.visibleTextWeights??[]).map(item=>weight(item.fontWeight))];
  if(cells.every(cell=>strong(cell)&&weights(cell).every(value=>value!==null&&value>=600)))return 'ACTUAL';
  if(cells.every(cell=>!strong(cell)&&weights(cell).every(value=>value!==null&&value<600)))return 'ESTIMATED';
  return 'REPORTED';
}

export function parseHapagLegacyContainer(document,number){
  if(!BOX.test(number??''))throw fail('DETAIL_INVALID_CONTAINERS','Legacy query is not an exact container number');
  const url=legacyUrl(document?.url);
  if(!url||normalized(url.searchParams.get('container'))!==number||normalized(document?.reference)!==number||
    (document.input_count!==undefined&&document.input_count!==1))throw fail('DETAIL_CONTAINER_MISMATCH','Legacy input and returned result URL must both identify this container');
  if(document.history?.id!==HISTORY_ID||JSON.stringify((document.history?.headers??[]).map(clean))!==JSON.stringify(HEADERS))
    throw fail('DETAIL_HEADER_MISMATCH','Legacy history does not have the observed public movement table');
  const type=field(document,'Type'),tareRaw=field(document,'Tare (kg)'),payloadRaw=field(document,'Max. Payload (kg)');
  const tare=kg(tareRaw),payload=kg(payloadRaw);
  if(!type||tare===null||payload===null)throw fail('DETAIL_EQUIPMENT_NOT_FOUND','Legacy result is missing its typed equipment specifications');
  if(!Array.isArray(document.history.rows)||document.history.rows.length>1000)throw fail('DETAIL_ROW_LIMIT','Legacy history row scope is invalid or too large');
  const legend=LEGEND.test(clean(document.legend)),events=[],seen=new Set();let invalid=0,duplicates=0,ambiguous=0;
  for(const row of document.history.rows){
    const cells=row?.cells??[];if(cells.length!==6){invalid++;continue;}
    const [description,location,date,clock,transport,voyage]=cells.map(cell=>clean(cell.text)),stamp=hapagLocalStamp(date,clock);
    if(!description||!location||!stamp){invalid++;continue;}
    const mode=/^truck$/i.test(transport)?'TRUCK':/^(?:rail|train)$/i.test(transport)?'RAIL':null;
    const vessel=!mode&&transport&&voyage?transport:null,timeType=rowKind(cells,legend);
    if(timeType==='REPORTED')ambiguous++;
    const key=JSON.stringify([number,description,location,stamp.time,transport,voyage,timeType]);
    if(seen.has(key)){duplicates++;continue;}seen.add(key);
    events.push({container_number:number,...stamp,description,location,terminal:null,vessel,voyage:vessel?voyage:null,
      mode:mode??(vessel?'VESSEL':null),time_type:timeType,timezone:null,time_basis:'LOCAL_TIME',
      source:{kind:'PAGE_DETAILS',container:number,section:'Legacy Container movement history'},
      extra:{site_label:timeType==='ACTUAL'?'ACTUAL':timeType==='ESTIMATED'?'PLANNED':null,
        classification_basis:legend?'Visible site legend plus full-row typography':'No supported visible legend',
        transport_raw:transport||null,voyage_raw:voyage||null,date_raw:date,clock_raw:clock}});
  }
  if(!events.length)throw fail('DETAIL_EMPTY_HISTORY','Legacy result contains no dated visible movement records');
  const latest=[...events].reverse().find(event=>event.time_type==='ACTUAL')??null;
  const planned=events.filter(event=>event.time_type==='ESTIMATED');
  return {number,type,tare_kg:tare,payload_kg:payload,events,
    latest_status:latest?.description??null,status_time:latest?.time??null,status_time_raw:latest?.time_raw??null,
    position:latest?.location??null,timezone:null,
    planned_raw:planned.map(event=>[event.time_raw,event.description,event.location,event.vessel,event.voyage].filter(Boolean).join(' | ')).join('\n')||null,
    source:{kind:'PAGE_DETAILS',section:'Legacy Container movement history'},
    extra:{hapag_query_type:'CONTAINER',hapag_bound_container:number,hapag_last_movement_raw:clean(document.last_movement_raw)||null,
      hapag_time_type_legend:clean(document.legend)||null,
      hapag_equipment_specifications:{type,description:field(document,'Description'),dimension:field(document,'Dimension'),tare_raw:tareRaw,max_payload_raw:payloadRaw,unit:'KG'},
      hapag_history_coverage:{reported_rows:document.history.rows.length,captured_rows:events.length,invalid_rows:invalid,
        duplicate_rows:duplicates,ambiguous_time_rows:ambiguous,legend_supported:legend}}};
}

function jobContainer(job){
  if(job?.reference_type!=='CONTAINER')throw fail('UNSUPPORTED_REFERENCE_TYPE','Legacy Container result cannot be attributed to a bill or booking');
  const number=normalized(job.submitted);
  if(!BOX.test(number)||normalized(job.reference)!==number)throw fail('DETAIL_CONTAINER_MISMATCH','Legacy query must retain the same full container reference');
  return number;
}
function decorate(value,detail){
  const latest=[...detail.events].reverse().find(event=>event.time_type==='ACTUAL')??null;
  const vessel=[...detail.events].reverse().find(event=>event.time_type==='ACTUAL'&&event.vessel)??null;
  Object.assign(value.extraction.fields,{hapag_detail_history:true,hapag_legacy_query_type:'CONTAINER',
    hapag_reported_vessel:vessel?{name:vessel.vessel,voyage:vessel.voyage,source:{kind:'PAGE_DETAILS',section:'Legacy actual Transport / Voyage No.'}}:null,
    ...(vessel?{vessel_name:vessel.vessel,voyage:vessel.voyage}:{}),
    ...(latest?{latest_event:[latest.time,latest.description,latest.location,detail.number].join(' | ')}:{}),
    declared_containers:'1'});
  return value;
}

export async function probeHapagLegacyContainerOverview({page,job,queryReceipt}){
  const empty=reason=>({ok:false,containers:[],container_count:0,fields:{},events:[],dates:[],vessel_voyage:[],reason});
  if(job?.reference_type!=='CONTAINER')return empty('LEGACY_CONTAINER_CANNOT_BIND_BILL_OR_BOOKING');
  let number;try{number=jobContainer(job);}catch{return empty('LEGACY_CONTAINER_REFERENCE_MISMATCH');}
  if(queryReceipt?.confirmed!==true)return empty('LEGACY_QUERY_RESPONSE_NOT_CONFIRMED');
  const receiptUrl=legacyUrl(queryReceipt.responseUrl);
  if(queryReceipt.queryType!=='CONTAINER'||queryReceipt.normalizedReference!==number||normalized(queryReceipt.submitted)!==number||
    !receiptUrl||normalized(receiptUrl.searchParams.get('container'))!==number||!Number.isInteger(queryReceipt.responseStatus)||queryReceipt.responseStatus<200||queryReceipt.responseStatus>=300)
    return empty('LEGACY_QUERY_RECEIPT_MISMATCH');
  const document=await page.evaluate(readHapagLegacyDocument);
  let detail;try{detail=parseHapagLegacyContainer(document,number);}catch(error){
    if(String(error.code??'').startsWith('DETAIL_'))return empty(error.code);throw error;
  }
  // The probe proves business rows, but typed structured history is inserted
  // exactly once by the collector. Never merge a second object copy via Set.
  const {events,...overviewDetail}=detail;
  const value=decorate({extraction:{fields:{container_details:[overviewDetail]},containers:[number],container_count:1}},detail).extraction;
  delete value.fields.hapag_detail_history;delete value.fields.hapag_reported_vessel;
  return {...value,ok:true,events:events.map(event=>[number,event.time_raw,event.description,event.location,event.vessel,event.voyage].filter(Boolean).join(' | ')),
    vessel_voyage:[...new Set(events.filter(event=>event.time_type==='ACTUAL'&&event.vessel).map(event=>[event.vessel,event.voyage].filter(Boolean).join(' / ')))],dates:[]};
}

export async function collectHapagLegacyContainerDetails({page,job,overview,artifactBase,signal,remaining,onPartial}){
  const number=jobContainer(job);actionTime(signal,remaining);
  if(!legacyUrl(page.url()))throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected legacy Container result origin or path');
  if(overview.containers?.length!==1||overview.containers[0]!==number)throw fail('DETAIL_CONTAINER_MISMATCH','Legacy overview must identify only the queried container');
  await page.locator('[id="tracing_by_container_f:hl66"]').waitFor({state:'visible',timeout:actionTime(signal,remaining)});
  const document=await page.evaluate(readHapagLegacyDocument);actionTime(signal,remaining);
  const detail=parseHapagLegacyContainer(document,number);
  const state=detailState({carrier:'HAPAG_LLOYD',page,job,overview,artifactBase,
    scope:'public_legacy_single_container_history_and_equipment',onPartial:()=>onPartial?.(decorate(state.result(),detail))});
  const coverage=detail.extra.hapag_history_coverage;
  if(coverage.invalid_rows)state.addError(fail('DETAIL_ROWS_PARTIAL','Some legacy movement rows have invalid date or location values'),number);
  if(!coverage.legend_supported||coverage.ambiguous_time_rows)state.addError(fail('DETAIL_TIME_TYPE_UNVERIFIED','Legacy actual/planned legend or typography could not classify every movement'),number);
  await state.save(detail);actionTime(signal,remaining);
  const value=decorate(state.result(),detail);
  if(artifactBase){const artifact=`${artifactBase}.hapag-legacy-${number}.dom.json`;await fs.writeFile(artifact,JSON.stringify(document,null,2),'utf8');
    value.artifacts.push({kind:'PAGE_DETAILS_DOM_JSON',container:number,path:artifact});}
  return value;
}
