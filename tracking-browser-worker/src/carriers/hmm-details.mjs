import {BOX,clean,cells,table,rows,localDate,fail,actionTime,readOrdinaryDocument,detailState} from './ordinary-detail-common.mjs';

const CONTAINER_HEADERS = ['No.','Container No.','Trailer No.','Cargo Type','Type / Size','Weight','B/L No.','Cell No.','Service Term','B/L Status','Seal No.','Movement','Last Movement Date','CNTR Status'];
const HISTORY_HEADERS = ['Date','Time','Location','Status Description','Mode'];

export function parseHmmContainer(document, number) {
  if (!BOX.test(number)) throw fail('DETAIL_CONTAINER_MISMATCH','HMM container identifier is invalid');
  if (document.selected && document.selected !== number) throw fail('DETAIL_CONTAINER_MISMATCH','HMM history selection is for another container');
  const profile = rows(table(document,CONTAINER_HEADERS)).find(row => row[1] === number);
  if (!profile) throw fail('DETAIL_CONTAINER_MISMATCH','HMM container is not in the overview table');
  const events = rows(table(document,HISTORY_HEADERS)).flatMap(row => {
    if (row.length !== 5) return [];
    const [date,clock,location,description,reportedMode] = row;
    const time = localDate(`${date} ${clock}`);
    if (!time || !description || !location) return [];
    const vessel = /^(.*?)\s+(\d{4}[A-Z])$/.exec(reportedMode);
    return [{container_number:number,time,time_raw:`${date} ${clock}`,description,location,terminal:null,
      mode:vessel ? 'VESSEL' : /^truck$/i.test(reportedMode) ? 'TRUCK' : reportedMode || null,
      vessel:vessel?.[1] ?? null,voyage:vessel?.[2] ?? null,time_type:'REPORTED',timezone:null,time_basis:'LOCAL_TIME',
      source:{kind:'PAGE_DETAILS',container:number,section:'Shipment History'},extra:{reported_mode:reportedMode}}];
  });
  return {number,type:profile[4] || null,events,extra:{cargo_type:profile[3],reported_weight_raw:profile[5],
    bill_number:profile[6],service_term:profile[8],bill_status:profile[9].replace(/\s*tooltip$/i,''),seal_number:profile[10],
    movement:profile[11],last_movement_time_raw:profile[12],container_status:profile[13]}};
}

export function parseHmmShipmentExtra(document) {
  const selected = [
    ['shipment_schedule',['','Origin','Loading Port','Discharging Port','Destination']],
    ['customs_status',['Nation / Item','US / AMS','Canada / ACI','EU / ENS','U.K. / SNS','China / CAMS','Japan / AFR']],
    ['empty_return_locations',['Empty Container Return Location','Address']],
  ];
  const result = Object.fromEntries(selected.flatMap(([key,headers]) => {const found=table(document,headers);return found?[[key,{headers,rows:rows(found)}]]:[];}));
  const delivery = (document.tables ?? []).find(item => cells(item.rows?.[0])[0] === 'Original B/L');
  if (delivery) result.cargo_delivery = (delivery.rows ?? []).map(cells).filter(row => row.length === 2 && row[1]);
  return result;
}

export async function collectHmmDetails(options) {
  const {page,job,overview,artifactBase,signal,remaining,onPartial} = options;
  const state=detailState({carrier:'HMM',page,job,overview,artifactBase,onPartial,scope:'public_per_container_history_and_shipment_tables'});
  const origin=new URL(page.url());
  if (origin.origin !== 'https://www.hmm21.com' || !origin.pathname.includes('/trackNTrace/')) throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected HMM public result');
  const initial=await page.evaluate(readOrdinaryDocument);
  const submitted=clean(job.submitted).replace(/^HDMU/i,'');
  if (![clean(initial.reference),clean(initial.booking)].includes(submitted) && !state.known.has(submitted)) throw fail('DETAIL_REFERENCE_MISMATCH','HMM result does not match the submitted bill, booking or confirmed container');
  Object.assign(state.extra,parseHmmShipmentExtra(initial));state.publish();
  const containers=(initial.hmmContainers ?? []).filter(item => state.known.has(item.number));
  for (const item of containers.slice(0,100)) {
    try {
      actionTime(signal,remaining);
      const current=await page.locator('#thisCntr').inputValue({timeout:actionTime(signal,remaining)});
      if (current!==item.number) {
        await page.locator(`#${item.id}`).click({timeout:actionTime(signal,remaining)});
        await page.waitForFunction(number=>document.querySelector('#thisCntr')?.value===number,item.number,{timeout:actionTime(signal,remaining)});
      }
      const more=page.locator('#shipmentProgress .clsShowedMoves:visible');
      if (await more.count()) {await more.click({timeout:actionTime(signal,remaining)});await more.waitFor({state:'hidden',timeout:actionTime(signal,remaining)});}
      const raw=await page.evaluate(readOrdinaryDocument);
      if (raw.selected!==item.number) throw fail('DETAIL_CONTAINER_MISMATCH','HMM selected history changed to another container');
      await state.save(parseHmmContainer(raw,item.number));
    } catch(error) {state.addError(error,item.number);if(signal?.aborted||remaining()<100)break;}
  }
  if(containers.length>100)state.addError(fail('DETAIL_CONTAINER_LIMIT','HMM result exceeds 100 containers'));
  return state.result();
}
