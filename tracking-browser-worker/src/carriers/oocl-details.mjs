import {BOX,clean,cells,rows,zonedLabelDate,fail,actionTime,detailState} from './ordinary-detail-common.mjs';

// Each movement table is bound to its nearest card containing one container label.
export function readOoclCardsDom() {
  const visible=e=>!!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
  const cards=[];let billInformation=[];
  for(const table of [...document.querySelectorAll('table')].filter(visible)){
    const grid=[...table.rows].filter(visible).map(row=>[...row.cells].map(cell=>cell.innerText.trim()));
    const headers=grid[0]?.map(value=>value.replace(/\s+/g,' ').trim()) ?? [];
    if(headers.includes('进口海关清关状态')){billInformation=grid;continue;}
    if(JSON.stringify(headers)!==JSON.stringify(['动态','时间','位置','阶段','运输方式']) && JSON.stringify(headers)!==JSON.stringify(['Event','Time','Location','Stage','Transport Mode']))continue;
    let card=table.parentElement,number=null;
    for(let i=0;i<16&&card;i++,card=card.parentElement){
      const found=[...card.innerText.matchAll(/(?:集装箱号|Container\s*(?:No\.?|Number))\s*[:：]\s*([A-Z]{4}\d{7})/gi)].map(match=>match[1]);
      if(new Set(found).size===1){number=found[0];break;}
    }
    if(card&&number)cards.push({number,profile:card.innerText.split(/\n(?:动态|Event)\s*\t/)[0],rows:grid.slice(1)});
  }
  const text=document.body.innerText.split(/集装箱列表|Container List/)[0];
  return {cards,billInformation,routeText:text};
}

export function parseOoclCard(card) {
  if(!BOX.test(card?.number??''))throw fail('DETAIL_CONTAINER_MISMATCH','OOCL history has no bound container');
  const number=card.number,profile=String(card.profile??'');
  const profileNumber=/(?:集装箱号|Container\s*(?:No\.?|Number))\s*[:：]\s*([A-Z]{4}\d{7})/i.exec(profile)?.[1];
  if(profileNumber!==number)throw fail('DETAIL_CONTAINER_MISMATCH','OOCL profile and history container identifiers differ');
  const value=label=>clean(new RegExp(`(?:^|\\n)(?:${label})[^\\S\\r\\n]*[:：][^\\S\\r\\n]*([^\\n]+)`,'i').exec(profile)?.[1]);
  const weight=label=>{const raw=value(label),m=/^([\d,.]+)\s*(KG|KGS|LB|LBS)(?:\s*\(([^)]+)\))?$/i.exec(raw);return m?{value:Number(m[1].replace(/,/g,'')),unit:m[2].toUpperCase(),status:m[3]??null,raw}:raw?{raw}:null;};
  const events=(card.rows??[]).flatMap(row=>{
    const [description,rawTime,facility,stage,mode]=cells(row),stamp=zonedLabelDate(rawTime);
    if(!stamp||!description)return [];
    const facilityLines=String(typeof row[2]==='object'?row[2].text:row[2]??'').split(/\n/).map(clean).filter(Boolean);
    return [{container_number:number,time:stamp.time,time_raw:rawTime,description,location:facilityLines.slice(1).join(', ')||null,
      terminal:facilityLines[0]||clean(facility)||null,mode:mode||null,vessel:null,voyage:null,time_type:'REPORTED',
      timezone:stamp.timezone,time_basis:null,source:{kind:'PAGE_DETAILS',container:number,section:'Container event history'},extra:{stage}}];
  });
  const type=/(?:^|\n)((?:20|40|45)[A-Z0-9]{1,4})(?:\n|$)/.exec(profile)?.[1]??null;
  const returned=/(?:^|\n)还空箱\n([^\n]+)\n提空箱\n([^\n]+)/.exec(profile);
  return {number,type,events,extra:{haulage:value('托运方式|Haulage'),packages:value('包装|Packages'),gross_weight:weight('毛重|Gross Weight'),
    verified_gross_mass:weight('验证毛重|VGM'),bill_number:value('提单号|B/L No\\.?')||/(?:提单号|B\/L No\.?)\s*([A-Z0-9]+)/i.exec(profile)?.[1]||null,
    empty_return_facility:returned?.[1]??null,empty_pickup_facility:returned?.[2]??null}};
}

export async function collectOoclDetails(options){
  const{page,job,overview,artifactBase,signal,remaining,onPartial}=options;
  const state=detailState({carrier:'OOCL',page,job,overview,artifactBase,onPartial,scope:'public_per_container_history_and_bill_information'});
  if(new URL(page.url()).origin!=='https://pbcontroltower.digital.oocl.com')throw fail('DETAIL_ORIGIN_MISMATCH','Unexpected OOCL result');
  const title=await page.locator('body').innerText({timeout:actionTime(signal,remaining)});
  const reference=clean(job.submitted).replace(/^OOLU/i,'');
  if(!title.includes(reference))throw fail('DETAIL_REFERENCE_MISMATCH','OOCL result does not identify the submitted reference');
  const capture=async()=>{const raw=await page.evaluate(readOoclCardsDom);state.extra.bill_information=raw.billInformation;state.extra.route_report=raw.routeText.split('\n').map(clean).filter(Boolean);
    for(const card of raw.cards){if(state.known.has(card.number)&&!state.details.has(card.number))await state.save(parseOoclCard(card));}state.publish();};
  await capture();
  for(let i=0;i<100;i++){
    const more=page.locator('button.ant-btn-link:visible').filter({hasText:/^(?:展开|Expand)$/i}).first();
    if(!await more.count())break;
    let number;
    try{
      actionTime(signal,remaining);
      number=await more.evaluate(button=>{let card=button.parentElement;for(let i=0;i<16&&card;i++,card=card.parentElement){const all=[...card.innerText.matchAll(/(?:集装箱号|Container\s*(?:No\.?|Number))\s*[:：]\s*([A-Z]{4}\d{7})/gi)].map(m=>m[1]);if(new Set(all).size===1)return all[0];}return null;});
      if(!state.known.has(number))throw fail('DETAIL_CONTAINER_MISMATCH','OOCL expansion is not bound to the confirmed shipment');
      await more.click({timeout:actionTime(signal,remaining)});
      await page.waitForFunction(number=>[...document.querySelectorAll('table')].some(table=>{if(!/动态|Event/.test(table.rows[0]?.innerText??''))return false;let card=table.parentElement;for(let i=0;i<16&&card;i++,card=card.parentElement){const all=[...card.innerText.matchAll(/(?:集装箱号|Container\s*(?:No\.?|Number))\s*[:：]\s*([A-Z]{4}\d{7})/gi)].map(m=>m[1]);if(new Set(all).size===1)return all[0]===number;}return false;}),number,{timeout:actionTime(signal,remaining)});
      await capture();
    }catch(error){state.addError(error,number);break;}
  }
  return state.result();
}
