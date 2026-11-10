import {BOX,clean,cells,table,rows,localDate,fail,actionTime,readOrdinaryDocument,detailState} from './ordinary-detail-common.mjs';

const PROFILE=['Container No.','Size','Type','Seal No.','MoveType','Date/Time','Latest Event','Place','VGM'];
const HISTORY=['Date/Time','Event','At Facility','To Facility','Mode'];

export function parseYmlOverview(document){
  const text=String(document.text??''),get=label=>clean(new RegExp(`(?:^|\\n)(?:${label})[^\\S\\r\\n]*[:：][^\\S\\r\\n]*([^\\n]*)`,'i').exec(text)?.[1]);
  const profiles=rows(table(document,PROFILE)).filter(row=>BOX.test(row[0]??'')).map(row=>{
    const mass=/^([\d,.]+)\s*(KGS|KG|LBS|LB)$/i.exec(row[8]);
    return {number:row[0],type:[row[1],row[2]].filter(Boolean).join(' / '),extra:{seal_number:row[3],move_type:row[4],latest_event_time_raw:row[5],latest_event:row[6],place:row[7],
      verified_gross_mass:mass?{value:Number(mass[1].replace(/,/g,'')),unit:mass[2],raw:row[8]}:{raw:row[8]}}};
  });
  const customsHeaders=['Date/Time','Event','Code Activity','IT Number','IT Location','Entry Number','Pieces','District Port','Remarks'];
  const customs=rows(table(document,customsHeaders)).filter(row=>row.length===9&&localDate(row[0])).map(row=>Object.fromEntries(customsHeaders.map((key,index)=>[key,row[index]])));
  const free=rows(table(document,['Container No.','Terminal Last Free Date','Place'])).filter(row=>BOX.test(row[0]??'')&&localDate(row[1])).map(row=>({container_number:row[0],date:localDate(row[1]),date_raw:row[1],place:row[2],label:'Terminal Last Free Date'}));
  const extra={booking_number:get('Booking Number'),bill_number:get('B/L No\\.'),vessel_voyage:get('Vessel Voy No\\.'),
    packages:get('No\\. of Packages'),on_board_date:get('On Board Date'),gross_cargo_weight:get('Gross Cargo Weight'),
    declared_containers:get('No\\. of Containers \\(booking quantity\\)'),measurement:get('Measurement'),service_requirement:get('Service Requirement'),carrier_scac:get('Carrier’s SCAC|Carrier.s SCAC'),
    carrier_release_status:get('Carrier Status'),customs_status:get('Customs Status').replace(/\[(?:View details|Close)\]/g,''),
    ace_status:get('ACE Status \\(filed by carrier\\)'),aci_status:get('ACI Status \\(filed by carrier\\)'),isf_status:get('ISF Status \\(filed by importer/broker\\)'),
    customs_history:customs,terminal_last_free_dates:free,
    locations:{headers:['Receipt','Loading','Discharge','Delivery'],rows:rows(table(document,['Receipt','Loading','Discharge','Delivery']))},
    routing_schedule_report:text.includes('Routing Schedule')?text.slice(text.indexOf('Routing Schedule'),text.indexOf('24 Hour Advance Manifest')>0?text.indexOf('24 Hour Advance Manifest'):undefined).split('\n').map(clean).filter(Boolean):[]};
  return {profiles,extra};
}

export function parseYmlContainer(document,number){
  if(!BOX.test(number??''))throw fail('DETAIL_CONTAINER_MISMATCH','YML history has no valid container');
  const sourceNumber=/Container No\.\s*([A-Z]{4}\d{7})/.exec(String(document.text??''))?.[1];
  if(sourceNumber!==number)throw fail('DETAIL_CONTAINER_MISMATCH','YML detail heading belongs to another container');
  const events=rows(table(document,HISTORY)).flatMap(row=>{
    if(row.length!==5)return [];
    const[rawTime,description,atFacility,toFacility,reportedMode]=row,time=localDate(rawTime);
    if(!time||!description)return [];
    const split=/^(.+?)\s+-\s+(.+)$/.exec(atFacility),vessel=/^(.+?)\s*\(([A-Z0-9]+)\)$/.exec(reportedMode);
    return [{container_number:number,time,time_raw:rawTime,description,location:(split?.[1]??atFacility)||null,
      terminal:split?.[2]??null,mode:vessel?'VESSEL':reportedMode||null,vessel:vessel?.[1]??null,voyage:vessel?.[2]??null,
      time_type:'REPORTED',timezone:null,time_basis:null,source:{kind:'PAGE_DETAILS',container:number,section:'Container Status'},extra:{at_facility:atFacility,to_facility:toFacility}}];
  });
  return {number,events};
}

export async function collectYmlDetails(options){
  const{page,job,overview,artifactBase,signal,remaining,onPartial}=options;
  const state=detailState({carrier:'YML',page,job,overview,artifactBase,onPartial,scope:'public_container_histories_customs_and_terminal_last_free_dates'});
  const origin=new URL(page.url());
  if(origin.origin!=='https://www.yangming.com'||origin.pathname!=='/en/esolution/tracking/cargo_tracking')throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected YML overview');
  const reference=clean(job.submitted).replace(/^YMJA/i,'');
  let raw=await page.evaluate(readOrdinaryDocument,{start:'Booking Number'});
  const parsed=parseYmlOverview(raw);
  const billReference=clean(parsed.extra.bill_number.split(/\s*\(/)[0]);
  if(parsed.extra.booking_number!==reference && billReference!==reference && !state.known.has(reference))throw fail('DETAIL_REFERENCE_MISMATCH','YML result does not match this bill, booking or confirmed container');
  const linkedReferences=new Set([reference,billReference,parsed.extra.booking_number].filter(Boolean));
  Object.assign(state.extra,parsed.extra);state.publish();
  // These two inline links reveal customs and free-time tables, not security UI.
  for(let i=0;i<4;i++){
    const more=page.locator('a:visible').filter({hasText:/^View details$/}).first();
    if(!await more.count())break;
    try{await more.click({timeout:actionTime(signal,remaining)});await page.waitForFunction(()=>[...document.querySelectorAll('a')].filter(e=>e.getClientRects().length&&e.innerText.trim()==='Close').length>0,null,{timeout:actionTime(signal,remaining)});}
    catch(error){state.addError(error);break;}
  }
  raw=await page.evaluate(readOrdinaryDocument,{start:'Booking Number'});
  const full=parseYmlOverview(raw);Object.assign(state.extra,full.extra);state.publish();
  const profiles=new Map(full.profiles.map(profile=>[profile.number,profile]));
  const links=raw.links.filter(link=>/\/cargo_tracking_detail\?/.test(link.href??'')&&state.known.has(clean(link.text)));
  for(const link of links.slice(0,100)){
    const number=clean(link.text);
    try{
      const target=new URL(link.href,origin.origin);
      if(target.origin!==origin.origin||target.pathname!=='/en/esolution/tracking/cargo_tracking_detail'||target.searchParams.get('trackNo')!==number||!linkedReferences.has(target.searchParams.get('refNo')))throw fail('DETAIL_REFERENCE_MISMATCH','YML container link does not match this bill and container');
      await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:actionTime(signal,remaining,12000)});
      await page.getByText('Container Status',{exact:true}).first().waitFor({state:'visible',timeout:actionTime(signal,remaining)});
      await page.waitForFunction(number=>document.body.innerText.includes('Container No.'+number)&&[...document.querySelectorAll('table')].some(t=>t.innerText.includes('At Facility')&&[...t.rows].some(r=>/^\d{4}\/\d{2}\/\d{2}/.test(r.cells[0]?.innerText??''))),number,{timeout:actionTime(signal,remaining)});
      const data=await page.evaluate(readOrdinaryDocument,{start:'Container No.'});
      const detail=parseYmlContainer(data,number),profile=profiles.get(number);
      await state.save({...profile,...detail,extra:{...(profile?.extra??{}),terminal_last_free_date:full.extra.terminal_last_free_dates.find(item=>item.container_number===number)??null}});
    }catch(error){state.addError(error,number);if(signal?.aborted||remaining()<100)break;}
  }
  if(links.length>100)state.addError(fail('DETAIL_CONTAINER_LIMIT','YML result exceeds 100 containers'));
  return state.result();
}
