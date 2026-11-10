import {BOX,clean,localDate,fail,actionTime,detailState} from './ordinary-detail-common.mjs';

const TABLE='[data-testid="tnt-cargo-tracking-table"]:not(#table-wrap-fake):not(#table-wrap-fake *)';
const ROW='[data-testid="tnt-cargo-tracking-table-row"]';
const RELEASE_FIELDS={
  obl_received:'tnt-cargo-release-obl-received-value',
  ocean_freight_collection:'tnt-cargo-release-ocean-freight-collection-value',
  customs_clearance:'tnt-cargo-release-customs-clearance-value',
  importer_security_filing:'tnt-cargo-release-importer-filing-value',
  inbound_number:'tnt-cargo-release-inbound-no-value',
  authorization_date:'tnt-cargo-release-authorization-date-value',
  firms_code_port_of_discharging:'tnt-cargo-release-firms-code-pod-value',
  firms_code_place_of_delivery:'tnt-cargo-release-firms-code-deliver-value',
  service_provider:'tnt-service-provider-name-value',
  telephone:'tnt-service-provider-telephone-value',
  work_order_number:'tnt-service-provider-work-order-no-value',
  work_order_issue_date:'tnt-service-provider-work-order-issue-date-value',
};

// Serializable DOM reader. Restrict every detail lookup to the real table row;
// ONE also renders pinned/fake table copies with the same labels.
export function readOnePageDom(){
  const text=element=>(element?.innerText??element?.textContent??'').replace(/\s+/g,' ').trim();
  const visible=element=>!!element&&!!element.getClientRects().length&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none';
  const table=[...document.querySelectorAll('[data-testid="tnt-cargo-tracking-table"]')].find(element=>!element.closest('#table-wrap-fake')&&visible(element));
  if(!table)return {rows:[],query_references:[],total_results:null};
  const queryReferences=[...document.querySelectorAll('[data-testid="tnt-search-multiple-input-chip-item"]')].filter(visible).map(text);
  const totalText=text([...document.querySelectorAll('[data-testid="tnt-pagination-total-records"]')].find(visible));
  const total=/Total\s+(\d+)\s+results?/i.exec(totalText);
  const rows=[...table.querySelectorAll('[data-testid="tnt-cargo-tracking-table-row"]')].filter(visible).map(row=>{
    const cells=[...row.children].filter(element=>element.getAttribute('role')==='cell');
    const number=/\b[A-Z]{4}\d{7}\b/.exec(text(cells[1]))?.[0]??null;
    const equipment=cells[1]?.querySelector('[class*="container-number-cell-pinned-alias"]');
    const equipmentFields=[...(equipment?.children?.[1]?.querySelectorAll(':scope > span')??[])].map(text);
    const candidate=row.parentElement?.nextElementSibling;
    const detail=candidate?.classList.contains('row-detail-alias')?candidate:null;
    const expanded=visible(detail);
    let location=null,terminal=null;
    const events=expanded?[...detail.querySelectorAll('[data-testid="tnt-cop-event-row"]')].filter(visible).map(event=>{
      const city=text(event.querySelector('[class*="EventTable_country-name"]'));
      const facility=text(event.querySelector('[class*="EventTable_terminal-name"]'));
      if(city){location=city;terminal=facility||null;}else if(facility)terminal=facility;
      const date=event.querySelector('[class*="EventDate_event-date-container"]');
      const explicitLabels=[date?.getAttribute('aria-label'),date?.getAttribute('title'),
        ...[...(date?.querySelectorAll('[aria-label],[title],[data-tooltip]')??[])].flatMap(e=>[e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-tooltip')])].filter(Boolean);
      const scheduleLink=event.querySelector('a[data-ga-cargo-tracking-schedule-redirection]');
      return {description:text(event.querySelector('[data-testid="tnt-cop-event-name"]')),time_raw:text(date),location,terminal,
        vessel_voyage:text(scheduleLink)||null,time_labels:explicitLabels};
    }):[];
    const releaseFields={
      obl_received:'tnt-cargo-release-obl-received-value',ocean_freight_collection:'tnt-cargo-release-ocean-freight-collection-value',
      customs_clearance:'tnt-cargo-release-customs-clearance-value',importer_security_filing:'tnt-cargo-release-importer-filing-value',
      inbound_number:'tnt-cargo-release-inbound-no-value',authorization_date:'tnt-cargo-release-authorization-date-value',
      firms_code_port_of_discharging:'tnt-cargo-release-firms-code-pod-value',firms_code_place_of_delivery:'tnt-cargo-release-firms-code-deliver-value',
      service_provider:'tnt-service-provider-name-value',telephone:'tnt-service-provider-telephone-value',
      work_order_number:'tnt-service-provider-work-order-no-value',work_order_issue_date:'tnt-service-provider-work-order-issue-date-value'};
    const release=Object.fromEntries(Object.entries(releaseFields).map(([key,id])=>[key,text(detail?.querySelector(`[data-testid="${id}"]`))]));
    const sailing=[...(detail?.querySelectorAll('#sailing-table-wrap [class*="SailingTable_body"]')??[])].filter(visible).map(body=>({
      vessel_voyage:text(body.querySelector('[class*="SailingTable_vessel-td"]')),
      load_port:text(body.querySelector('[class*="SailingTable_port-of-loading-td"]')),
      departure_raw:text(body.querySelector('[class*="SailingTable_departure-date-td"]')),
      discharge_port:text(body.querySelector('[class*="SailingTable_port-of-discharge-td"]')),
      arrival_raw:text(body.querySelector('[class*="SailingTable_arrival-time-td"]'))}));
    return {number,booking_reference:text(cells[0]),type:equipmentFields[0]||null,reported_weight_raw:equipmentFields[1]||null,
      seal_raw:text(cells[5])||null,latest_location:text(cells[2])||null,latest_event:text(cells[3]?.querySelector('[class*="event-status-selector-alias"] > div:first-child'))||null,
      latest_time_raw:text(cells[3]?.querySelector('[class*="EventDate_event-date-container"]'))||null,
      expanded,events,sailing,release,release_visible:expanded&&Object.values(release).some(Boolean),
      local_time_declared:/\ball (?:dates and )?times (?:are |shown )?(?:given )?in local time\b/i.test(text(detail))};
  });
  return {rows,query_references:queryReferences,total_results:total?Number(total[1]):null};
}

const referenceKey=value=>clean(value).replace(/^ONEY/i,'').replace(/\s+/g,'').toUpperCase();
function vesselVoyage(value){
  const raw=clean(value),match=/^(.+?)\s+(\d{2,}[A-Z])(?:\s*\([^)]*\))?$/.exec(raw);
  return {vessel:match?.[1]??null,voyage:match?.[2]??null};
}

export function parseOneContainer(data,number){
  if(!BOX.test(number??'')||data?.number!==number)throw fail('DETAIL_CONTAINER_MISMATCH','ONE detail belongs to a different container');
  const seen=new Set(),events=[];
  for(const row of data.events??[]){
    const description=clean(row.description),timeRaw=clean(row.time_raw),time=localDate(timeRaw);
    if(!description||!time)continue;
    const location=clean(row.location)||null,terminal=clean(row.terminal)||null;
    const identity=JSON.stringify([number,timeRaw,description,location,terminal,row.vessel_voyage]);
    if(seen.has(identity))continue;
    seen.add(identity);
    const labels=(row.time_labels??[]).map(clean);
    const actual=labels.some(label=>/^(?:actual|actual (?:schedule|date|time))$/i.test(label));
    const estimated=labels.some(label=>/^(?:estimated?|estimated? (?:schedule|date|time))$/i.test(label));
    const vessel=vesselVoyage(row.vessel_voyage);
    events.push({container_number:number,time,time_raw:timeRaw,description,location,terminal,...vessel,
      time_type:actual&&!estimated?'ACTUAL':estimated&&!actual?'ESTIMATED':'REPORTED',timezone:null,
      time_basis:data.local_time_declared?'LOCAL_TIME':null,
      mode:/vessel|port of load|port of discharg/i.test(description)?'VESSEL':/gate|shipper|customer/i.test(description)?'TRUCK':null,
      source:{kind:'PAGE_DETAILS',container:number,section:'Cargo Tracking movement history'}});
  }
  const seal=clean(data.seal_raw),masked=/[*•]/.test(seal);
  return {number,type:clean(data.type)||null,events,extra:{booking_reference:clean(data.booking_reference)||null,
    reported_weight_raw:clean(data.reported_weight_raw)||null,seal_number:masked?null:seal||null,seal_masked:masked,
    latest_location:clean(data.latest_location)||null,latest_event:clean(data.latest_event)||null,
    latest_event_time_raw:clean(data.latest_time_raw)||null,sailing_information:(data.sailing??[]).map(row=>({...row}))}};
}

export function parseOneRelease(data,number){
  if(data?.number!==number||!BOX.test(number??''))throw fail('DETAIL_CONTAINER_MISMATCH','ONE release belongs to a different container');
  if(!data.release_visible)throw fail('DETAIL_RELEASE_NOT_READY','ONE release panel has not returned its public fields');
  return Object.fromEntries(Object.keys(RELEASE_FIELDS).map(key=>{
    const value=clean(data.release?.[key]);return [key,value&&value!=='-'?value:null];
  }));
}

export async function collectOneDetails({page,job,overview,artifactBase,signal,remaining,onPartial=()=>{}}){
  const origin=new URL(page.url());
  if(origin.origin!=='https://www.one-line.com'||origin.pathname!=='/one-ecom/manage-shipment/cargo-tracking')throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected ONE public tracking page');
  const released=new Set();
  const state=detailState({carrier:'ONE',page,job,overview,artifactBase,scope:'public_visible_container_histories_and_release',
    onPartial:partial=>onPartial({...partial,coverage:{...partial.coverage,scope_complete:partial.coverage.scope_complete&&partial.coverage.detailed_containers.every(number=>released.has(number))}})});
  let raw=await page.evaluate(readOnePageDom);
  const reference=referenceKey(job.submitted);
  if(!(raw.query_references??[]).some(value=>referenceKey(value)===reference)&&!state.known.has(reference))throw fail('DETAIL_REFERENCE_MISMATCH','ONE query chip does not match the current shipment');
  if(raw.total_results>(raw.rows??[]).length){
    try{
      if(typeof page.getByRole!=='function')throw fail('DETAIL_PAGE_SIZE_UNAVAILABLE','ONE page-size control is unavailable');
      await page.getByRole('button',{name:/^Show \d+ items$/}).first().click({timeout:actionTime(signal,remaining)});
      await page.getByRole('option',{name:'50 items',exact:true}).first().click({timeout:actionTime(signal,remaining)});
      await page.waitForFunction(({expected})=>{
        const table=[...document.querySelectorAll('[data-testid="tnt-cargo-tracking-table"]')].find(element=>!element.closest('#table-wrap-fake'));
        return (table?.querySelectorAll('[data-testid="tnt-cargo-tracking-table-row"]').length??0)>=expected;
      },{expected:Math.min(raw.total_results,50)},{timeout:actionTime(signal,remaining)});
      raw=await page.evaluate(readOnePageDom);
    }catch(error){state.addError(error);}
  }
  const matches=(raw.rows??[]).filter(row=>BOX.test(row.number??'')&&(referenceKey(row.booking_reference)===reference||row.number===reference));
  if(!matches.length)throw fail('DETAIL_REFERENCE_MISMATCH','ONE visible rows do not match this bill, booking or container');
  for(const row of matches)state.known.add(row.number);
  const table=page.locator(TABLE);
  for(const bound of matches.slice(0,100)){
    const number=bound.number;
    try{
      actionTime(signal,remaining);
      const row=table.locator(ROW).filter({hasText:number}).first();
      const detail=row.locator('xpath=../following-sibling::*[1]');
      if(!bound.expanded){await row.locator('[class*="TableColumn_arrow"]').first().click({timeout:actionTime(signal,remaining)});await detail.waitFor({state:'visible',timeout:actionTime(signal,remaining)});}
      const tracking=detail.getByTestId('tnt-quick-action-tab').filter({hasText:/^Cargo Tracking$/}).first();
      await tracking.click({timeout:actionTime(signal,remaining)});
      const latest=detail.locator('[data-testid="tnt-cargo-tracking-show-latest-event-toggle"] button[role="switch"]');
      if(await latest.count()&&await latest.getAttribute('aria-checked')==='true')await latest.click({timeout:actionTime(signal,remaining)});
      await detail.locator('[data-testid="tnt-cop-event-row"]').first().waitFor({state:'visible',timeout:actionTime(signal,remaining)});
      let current=(await page.evaluate(readOnePageDom)).rows.find(item=>item.number===number);
      const parsed=parseOneContainer(current,number);
      if(!parsed.events.length)throw fail('DETAIL_EMPTY_HISTORY','ONE expanded container has no dated movement rows');
      await state.save(parsed);
      // Release dates and FIRMS are separate business data, never movement events.
      const releaseTab=detail.getByTestId('tnt-quick-action-tab').filter({hasText:/^Cargo Release & Rail Tracking$/}).first();
      if(!await releaseTab.count()){
        state.extra.one_release_availability??=[];
        state.extra.one_release_availability.push({container_number:number,status:'NOT_PROVIDED_BY_CARRIER'});
        released.add(number);state.publish();continue;
      }
      await releaseTab.click({timeout:actionTime(signal,remaining)});
      await detail.locator('[data-testid="tnt-cargo-release-obl-received-value"]').waitFor({state:'visible',timeout:actionTime(signal,remaining)});
      current=(await page.evaluate(readOnePageDom)).rows.find(item=>item.number===number);
      const cargoRelease=parseOneRelease(current,number);
      released.add(number);
      await state.save({...parsed,extra:{...parsed.extra,cargo_release:cargoRelease}});
      state.extra.one_release=[...state.details.values()].filter(item=>item.extra?.cargo_release).map(item=>({container_number:item.number,...item.extra.cargo_release}));
      state.publish();
    }catch(error){state.addError(error,number);if(signal?.aborted||remaining()<100)break;}
  }
  if(matches.length>100)state.addError(fail('DETAIL_CONTAINER_LIMIT','ONE visible result exceeds 100 containers'));
  if(raw.total_results===null||raw.total_results>matches.length)state.addError(fail('DETAIL_PAGINATION_INCOMPLETE','ONE result has additional or unverified pages; only the current page was inspected'));
  const result=state.result();
  if(Number.isSafeInteger(raw.total_results)&&raw.total_results>=0)result.extraction.fields.declared_containers=String(raw.total_results);
  result.coverage.scope_complete=result.coverage.scope_complete&&[...state.known].every(number=>released.has(number))&&raw.total_results===state.known.size;
  return result;
}
