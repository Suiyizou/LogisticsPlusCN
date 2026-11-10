import fs from 'node:fs/promises';

const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
const BOX = /^[A-Z]{4}\d{7}$/;
function localDate(value) {
  const match=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(clean(value));
  if(!match)return null;
  const [,y,m,d,h,minute,s]=match;
  const date=new Date(Date.UTC(+y,+m-1,+d));
  if(+m<1||+m>12||+d<1||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d||+h>23||+minute>59||+s>59)return null;
  return `${y}-${m}-${d}T${h}:${minute}:${s}`;
}

export function readCoscoShipmentPanel(panel) {
  const text=e=>(e?.innerText??'').trim();
  return {milestones:[...panel.querySelectorAll('.time-container')].filter(e=>e.getClientRects().length).map(e=>({
    label:text(e.previousElementSibling),date:text(e.querySelector('.date')),time:text(e.querySelector('.time')),timezone:text(e.querySelector('.timezone'))})),
    rows:[...panel.querySelectorAll('tr')].filter(e=>e.getClientRects().length).map(e=>[...e.querySelectorAll(':scope > td')].map(text)).filter(c=>c.length)};
}

export function readCoscoContainerPanel(panel) {
  const text=e=>(e?.innerText??'').trim();
  return {rows:[...panel.querySelectorAll('tr')].filter(e=>e.getClientRects().length).map(e=>[...e.querySelectorAll(':scope > td')].map(text)).filter(c=>c.length)};
}

export function parseCoscoPanels(snapshot,overview) {
  const known = new Set(overview.containers??[]),containers=[];
  for(const cells of snapshot.containers.rows??[]){
    const rawNumber=String(cells[1]??'').split(/\r?\n/).map(clean).filter(Boolean);
    const number=rawNumber[0];if(!BOX.test(number??'')||!known.has(number))continue;
    const status=String(cells[4]??'').split(/\r?\n/).map(clean).filter(Boolean);
    const date=clean(status.find(v=>/\d{4}-\d{2}-\d{2}/.test(v))).replace(/^于\s*/, '');
    const time=localDate(date);
    const event=time&&status[0]?{container_number:number,time,time_raw:date,description:status[0],location:clean(cells[3])||null,
      terminal:null,vessel:null,voyage:null,time_type:'REPORTED',timezone:null,time_basis:null,mode:null,
      source:{kind:'PAGE_DETAILS',container:number,section:'集装箱信息 / 最新动态'}}:null;
    containers.push({number,type:rawNumber[1]??null,terms:clean(cells[2])||null,position:clean(cells[3])||null,
      latest_status:status[0]??null,status_time:time,status_time_raw:date||null,events:event?[event]:[]});
  }
  const events=[];
  for(const row of snapshot.shipment.milestones??[]){
    const label=clean(row.label),raw=clean(`${row.date} ${row.time}`),time=localDate(raw);
    if(!time||!['还重时间','实际离港','实际到港','提货时间','预计离港','预计到港'].includes(label))continue;
    events.push({container_number:null,time,time_raw:raw,description:label,
      // Shipment-level nodes are not evidence of a particular box's movement.
      location:null,terminal:null,vessel:null,voyage:null,
      time_type:/^实际/.test(label)?'ACTUAL':/^预计/.test(label)?'ESTIMATED':'REPORTED',
      timezone:clean(row.timezone)||null,time_basis:'LOCAL_TIME',mode:/港/.test(label)?'VESSEL':null,
      source:{kind:'PAGE_DETAILS',container:null,section:'全链运输信息'}});
  }
  return {containers,events:[...events,...containers.flatMap(c=>c.events)]};
}

export async function collectCoscoDetails({page,job,overview,artifactBase,signal,remaining,onPartial=()=>{}}){
  const url=new URL(page.url());
  if(url.origin!=='https://elines.coscoshipping.com'||!url.pathname.startsWith('/scct/public/ct/'))throw new Error('Unexpected COSCO public page');
  const timeout=()=>{if(signal?.aborted||remaining()<100)throw Object.assign(new Error('COSCO detail capture timed out'),{code:'DETAIL_TIMEOUT'});return Math.max(1,Math.min(5000,remaining()-50));};
  const reference=clean(job.submitted);
  const input=await page.getByRole('textbox').first().inputValue({timeout:timeout()});
  const normalized=reference.replace(/^(COSU|CSNU|CBHU|CCLU)/,'');
  if(clean(input)!==reference&&clean(input)!==normalized)throw Object.assign(new Error('COSCO public reference changed'),{code:'DETAIL_REFERENCE_MISMATCH'});
  const errors=[],artifacts=[];
  await page.getByRole('tab',{name:'全链运输信息',exact:true}).click({timeout:timeout()});
  const shipment=await page.getByRole('tabpanel',{name:'全链运输信息',exact:true}).evaluate(readCoscoShipmentPanel);
  let containers={rows:[]};
  try{
    await page.getByRole('tab',{name:'集装箱信息',exact:true}).click({timeout:timeout()});
    const panel=page.getByRole('tabpanel',{name:'集装箱信息',exact:true});
    // The visible tab mounts before its async container table has returned.
    // Wait for one of this exact shipment's confirmed boxes before reading it.
    const first=(overview.containers??[])[0];
    if(first&&BOX.test(first))await panel.getByText(first,{exact:false}).first().waitFor({state:'visible',timeout:timeout()});
    containers=await panel.evaluate(readCoscoContainerPanel);
  }catch(error){errors.push({code:error.code??'DETAIL_CONTAINER_PANEL_UNAVAILABLE',message:String(error.message).slice(0,180)});}
  const snapshot={shipment,containers};
  const parsed=parseCoscoPanels(snapshot,overview);
  const result={reference,extraction:{containers:parsed.containers.map(c=>c.number),
    fields:{container_details:parsed.containers,structured_events:parsed.events,
      cosco_shipment_milestones:parsed.events.filter(e=>!e.container_number)},
    events:parsed.events.map(e=>[e.container_number,e.time_raw,e.timezone,e.description,e.location].filter(Boolean).join(' | '))},
    coverage:{scope:'public_shipment_and_container_panels',scope_complete:errors.length===0&&parsed.containers.length>0&&parsed.containers.length===(overview.containers??[]).length,
      detailed_containers:parsed.containers.map(c=>c.number)},sources:[{id:'cosco-public-panels',kind:'PAGE_DETAILS',url:url.origin+url.pathname}],errors,artifacts};
  onPartial(result);
  if(artifactBase){const path=`${artifactBase}.cosco-panels.json`;await fs.writeFile(path,JSON.stringify(snapshot,null,2));artifacts.push({kind:'PAGE_DETAILS_JSON',path});}
  // Restore the useful shipment panel after reading the separate container tab.
  if(!signal?.aborted&&remaining()>100)await page.getByRole('tab',{name:'全链运输信息',exact:true}).click({timeout:timeout()}).catch(()=>{});
  return result;
}
