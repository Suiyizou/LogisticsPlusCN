import {BOX,clean,table,rows,localDate,fail,actionTime,normalizedBox,readOrdinaryDocument,detailState} from './ordinary-detail-common.mjs';

export function parseMatsonContainer(document,number){
  if(!BOX.test(number??''))throw fail('DETAIL_CONTAINER_MISMATCH','Matson container is invalid');
  const text=String(document.text??''),heading=/CONTAINER TRACKING-\s*([A-Z]{4}\d{6}-?\d)/i.exec(text)?.[1];
  if(normalizedBox(heading)!==number)throw fail('DETAIL_CONTAINER_MISMATCH','Matson detail heading belongs to another container');
  const events=rows(table(document,['DATE & TIME','LOCATION','STATUS'])).flatMap(row=>{
    if(row.length!==3)return [];
    const[rawTime,location,description]=row,time=localDate(rawTime,'MDY');
    if(!time||!description)return [];
    const vessel=/(?:FROM|TO) VESSEL (.+?) (\d{1,6}[A-Z]?)$/i.exec(description);
    return [{container_number:number,time,time_raw:rawTime,description,location:location||null,terminal:null,
      vessel:vessel?.[1]??null,voyage:vessel?.[2]??null,mode:vessel?'VESSEL':null,time_type:'REPORTED',timezone:null,
      time_basis:/All events are recorded in local time/i.test(text)?'LOCAL_TIME':null,
      source:{kind:'PAGE_DETAILS',container:number,section:'CONTAINER TRACKING MOVEMENT EVENTS'}}];
  });
  const field=label=>clean(new RegExp(`${label}:\\s*([^\\t\\n]*)`,'i').exec(text)?.[1]);
  const rawWeight=field('NET CONTAINER WEIGHT \\(LBS\\)'),weight=/^[\d,]+(?:\.\d+)?$/.test(rawWeight)?Number(rawWeight.replace(/,/g,'')):null;
  const etaRaw=field('VESSEL ETA'),type=field('EQUIPMENT');
  return {number,type:type||null,eta:localDate(etaRaw,'MDY'),eta_raw:etaRaw||null,eta_label:'VESSEL ETA',events,
    extra:{port_of_origin:field('PORT OF ORIGIN'),port_of_destination:field('PORT OF DESTINATION'),port_of_loading:field('PORT OF LOADING'),port_of_discharge:field('PORT OF DISCHARGE'),
      temperature:field('TEMPERATURE'),net_container_weight:{value:weight,unit:'LBS',raw:rawWeight,label:'NET CONTAINER WEIGHT (LBS)'}}};
}

export async function collectMatsonDetails(options){
  const{page,job,overview,artifactBase,signal,remaining,onPartial}=options;
  const state=detailState({carrier:'MATSON',page,job,overview,artifactBase,onPartial,scope:'public_per_container_movement_and_equipment_details'});
  const origin=new URL(page.url());
  if(origin.origin!=='https://www.matson.com'||origin.pathname!=='/shipment-tracking.html')throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected Matson result');
  const submitted=await page.locator('#track-number-top, input[name=trackingnumber]').first().inputValue({timeout:actionTime(signal,remaining)});
  if(normalizedBox(submitted)!==normalizedBox(job.submitted))throw fail('DETAIL_REFERENCE_MISMATCH','Matson form reference does not match this query');
  // A detail view is still the same public page; Back restores its existing list.
  if(!await page.locator('#tracking_table:visible').count()&&await page.locator('#back:visible').count())await page.locator('#back').click({timeout:actionTime(signal,remaining)});
  const entries=await page.locator('#tracking_table a:visible').evaluateAll(elements=>elements.map(e=>({label:e.innerText.trim(),number:e.innerText.trim().replace(/-/g,'')})));
  for(const item of entries.slice(0,100)){
    try{
      if(!state.known.has(item.number))throw fail('DETAIL_CONTAINER_MISMATCH','Matson link is outside the confirmed overview');
      await page.locator('#tracking_table').getByRole('link',{name:item.label,exact:true}).click({timeout:actionTime(signal,remaining)});
      await page.waitForFunction(label=>document.querySelector('#shipmentTrackingDetails')?.innerText.toUpperCase().includes('CONTAINER TRACKING-'+label),item.label,{timeout:actionTime(signal,remaining)});
      const raw=await page.evaluate(readOrdinaryDocument,{scope:'#shipmentTrackingDetails',start:'CONTAINER TRACKING-'});
      await state.save(parseMatsonContainer(raw,item.number));
    }catch(error){state.addError(error,item.number);if(signal?.aborted||remaining()<100)break;}
    try{const back=page.locator('#back:visible');if(await back.count())await back.click({timeout:actionTime(signal,remaining)});}
    catch(error){state.addError(error,item.number);break;}
  }
  if(entries.length>100)state.addError(fail('DETAIL_CONTAINER_LIMIT','Matson result exceeds 100 containers'));
  return state.result();
}
