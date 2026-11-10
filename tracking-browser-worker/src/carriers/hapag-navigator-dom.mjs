export const NAVIGATOR_SCOPE = 'ACCOUNT_AUTHORIZED_ONLY';
export const CURRENT_UNVERIFIED_MESSAGE = 'Actual shipment status not verified by account-visible source';
const BOX = /^[A-Z]{4}\d{7}$/;
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export const normalizeNavigatorReference = value => clean(value).replace(/\s+/g, '').toUpperCase();
const fail = (code,message) => Object.assign(new Error(message), {code});
const CONTAINER_HEADERS = ['#','Container No.','Transport Type','Container Type','Tare','Max Payload','Quantity','Gross Cargo Weight','Pick-up (Empty)','Redelivery (Empty)'];
const TRACKING_HEADERS = ['Event','Place of Activity','Date','Time','Transport','Voyage no.'];

// Ordinary visible document reader, suitable for page.evaluate without any
// arguments. No framework state, network, cookies or hidden fields are read.
export function readNavigatorDocument() {
  const text = element => element?.innerText?.replace(/\s+/g,' ').trim() || '';
  const visible = element => {
    if (!element || !element.getClientRects().length) return false;
    for (let current=element; current; current=current.parentElement) {
      const style=getComputedStyle(current);
      if (style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse') return false;
    }
    return true;
  };
  const transitioning = element => {
    for(let current=element;current;current=current.parentElement)
      if(/q-transition--\S*-(?:leave|enter)-(?:active|to|from)/.test(current.className||''))return true;
    return false;
  };
  const all = (scope,selector) => [...scope.querySelectorAll(selector)].filter(visible);
  const fields = scope => all(scope,'.hal-data-item').map(item=>({
    label:text(item.querySelector('.hal-data-item__label')),value:text(item.querySelector('.hal-data-item__content')),
  })).filter(item=>item.label);
  const result={url:location.href,capturedAt:new Date().toISOString(),shipmentContext:null,containers:null,dialog:null};
  const overviews=all(document,'.overview').filter(element=>!transitioning(element)&&all(element,'h2').some(h=>text(h)==='Details'));
  if(overviews.length===1){
    const overview=overviews[0],items=fields(overview);
    const links=all(overview,'a[title="Update Booking"]').map(link=>link.getAttribute('href'));
    const bookingReferences=[];
    for(const href of links)try{
      const url=new URL(href,location.href);
      if(url.origin==='https://www.hapag-lloyd.com'&&url.pathname==='/solutions/booking-amendment/'){
        const question=url.hash.indexOf('?');
        const booking=question>=0?new URLSearchParams(url.hash.slice(question+1)).get('booking'):null;
        if(booking)bookingReferences.push({value:booking,href});
      }
    }catch{}
    const bills=items.filter(item=>item.label==='BL/SWB no.').map(item=>item.value);
    const bookings=[...new Set(bookingReferences.map(item=>item.value))];
    const progress=all(overview,'.hal-shipment-v__step').map(step=>({
      title:text(step.querySelector('.hal-shipment-v__title')),classes:step.className,
      values:all(step,'.hal-shipment-v__teaser .hal-micro-data').map(item=>({label:text(item.querySelector('.hal-micro-data__label')),value:text(item.querySelector('.hal-micro-data__content'))})),
    })).filter(item=>item.title);
    result.shipmentContext={booking:bookings.length===1?bookings[0]:null,billOfLading:bills.length===1?bills[0]:null,
      bookingSource:'VISIBLE_UPDATE_BOOKING_LINK',bookingLinks:bookingReferences,billSource:'VISIBLE_BL_SWB_FIELD',fields:items,progress};
  }
  const panels=all(document,'[role="tabpanel"]').filter(panel=>!transitioning(panel));
  const containerPanels=panels.filter(panel=>all(panel,'h2').some(h=>text(h)==='Containers and Cargo')&&all(panel,'table.q-table').length);
  if(containerPanels.length===1){
    const tables=all(containerPanels[0],'table.q-table');
    if(tables.length===1){
      const table=tables[0],holder=table.closest('.q-table__container');
      result.containers={headers:all(table,'thead th').map(text),
        rows:all(table,'tbody tr').map((row,index)=>({row:index+1,cells:[...row.children].filter(cell=>cell.tagName==='TD'&&visible(cell)).map(text)})).filter(row=>row.cells.length),
        paginationText:text(holder?.querySelector('.q-table__bottom'))};
    }
  }
  const dialogs=all(document,'.dialog-card').filter(card=>/^\s*[A-Z]{4}\s*\d{7}\s*$/.test(text(card.querySelector('h2'))));
  if(dialogs.length===1){
    const card=dialogs[0];
    const active=all(card,'[role="tab"][aria-selected="true"]').map(text);
    const visiblePanels=all(card,'[role="tabpanel"]');
    const stablePanels=visiblePanels.filter(panel=>!transitioning(panel));
    // During the observed Overview transition the outgoing Tracking pane was
    // still in the DOM. Scope equipment fields to the actual Container Details
    // pane instead of consuming the dialog's concatenated text/history.
    const overviewPanels=visiblePanels.filter(panel=>all(panel,'h3').some(h=>text(h)==='Container Details'));
    const sectionPanels=active.length===1&&active[0]==='Overview'?overviewPanels:stablePanels;
    const sections=sectionPanels.flatMap(panel=>all(panel,'.q-card__subsection').map(section=>({
      title:text(section.querySelector('h3')),fields:fields(section),
      groups:all(section,'.col-xs-12.col-md-6').filter(group=>group.querySelector('h4')).map(group=>({title:text(group.querySelector('h4')),fields:fields(group)})),
    }))).filter(section=>section.title);
    const grids=stablePanels.flatMap(panel=>all(panel,'.hal-event-tracking'));
    const tracking=active.length===1&&active[0]==='Tracking'&&grids.length===1?{
      headers:all(grids[0],'.hal-event-tracking__header-col').map(text),
      rows:all(grids[0],'.hal-event__inline').map((row,index)=>({row:index+1,classes:row.parentElement?.className||'',
        cells:all(row,'span.hal-event__col').map(text)})),
    }:null;
    result.dialog={containerNumber:text(card.querySelector('h2')),activeTab:active.length===1?active[0]:null,
      sections,tracking,transitioning:active[0]==='Tracking'&&visiblePanels.some(transitioning)};
  }
  return result;
}

function officialDocument(document) {
  let url;try{url=new URL(document?.url);}catch{throw fail('NAVIGATOR_ORIGIN_MISMATCH','Navigator document URL is missing');}
  if(url.origin!=='https://www.hapag-lloyd.com'||!/^\/solutions\/navigator\/?$/.test(url.pathname))
    throw fail('NAVIGATOR_ORIGIN_MISMATCH','Unexpected account Navigator document origin or path');
}
function contextBinding(document,query,receipt) {
  officialDocument(document);
  const type=query?.reference_type;
  if(!['CONTAINER','BOOKING','BILLOFLADING'].includes(type))throw fail('NAVIGATOR_REFERENCE_TYPE','An explicit supported query type is required');
  const reference=normalizeNavigatorReference(query.submitted??query.reference);
  if(!reference||normalizeNavigatorReference(query.reference)!==reference||receipt?.confirmed!==true||receipt.referenceType!==type||
      normalizeNavigatorReference(receipt.submitted)!==reference||!clean(receipt.searchActionId)||!Number.isFinite(Date.parse(receipt.selectedAt)))
    throw fail('NAVIGATOR_SELECTION_UNCONFIRMED','The current typed search and ordinary shipment selection are not confirmed');
  const contextDocument=document.shipmentContext?document:receipt.contextDocument;
  officialDocument(contextDocument);
  const context=contextDocument.shipmentContext;
  const booking=normalizeNavigatorReference(context?.booking),bill=normalizeNavigatorReference(context?.billOfLading);
  if(!booking||!bill||context.bookingSource!=='VISIBLE_UPDATE_BOOKING_LINK'||context.billSource!=='VISIBLE_BL_SWB_FIELD'||
      normalizeNavigatorReference(receipt.booking)!==booking||normalizeNavigatorReference(receipt.billOfLading)!==bill)
    throw fail('NAVIGATOR_SHIPMENT_MISMATCH','Visible shipment booking and B/L do not match this selection');
  if(type==='BOOKING'&&reference!==booking||type==='BILLOFLADING'&&reference!==bill)
    throw fail('NAVIGATOR_REFERENCE_MISMATCH','The selected account shipment does not match the typed query');
  return {reference_type:type,reference,booking,bill_of_lading:bill,search_action_id:clean(receipt.searchActionId),
    selected_at:receipt.selectedAt,access_scope:NAVIGATOR_SCOPE,context};
}
function mass(value) {
  const raw=clean(value),match=/^(\d+(?:\.\d+)?)\s+([A-Za-z]+)$/.exec(raw);
  const unit=match?.[2]?.toUpperCase()??null,amount=match?Number(match[1]):null;
  return {value:amount,unit,raw,kg:amount!==null&&['KGM','KG'].includes(unit)?amount:null};
}
function quantity(value){const raw=clean(value);return {value:/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):null,unit:null,raw};}
function pagination(value){const match=/(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/i.exec(value??'');return match?{start:Number(match[1]),end:Number(match[2]),total:Number(match[3])}:null;}
const itemValue=(items,label)=>items?.find(item=>clean(item.label)===label)?.value??null;
const source=(binding,section,container,row)=>({kind:'PAGE_DETAILS',access_scope:NAVIGATOR_SCOPE,section,
  booking:binding.booking,bill_of_lading:binding.bill_of_lading,...(container?{container}:{}),...(row?{row}:{})});

export function parseNavigatorContainersSnapshot({document,query,selectionReceipt}) {
  const binding=contextBinding(document,query,selectionReceipt),table=document.containers;
  if(!table||JSON.stringify(table.headers?.map(clean))!==JSON.stringify(CONTAINER_HEADERS)||!Array.isArray(table.rows)||!table.rows.length)
    throw fail('NAVIGATOR_CONTAINER_TABLE_NOT_READY','The visible ten-column container table is not ready');
  const details=[],seen=new Set();
  for(const [index,row] of table.rows.entries()){
    if(row.cells?.length!==10)throw fail('NAVIGATOR_CONTAINER_COLUMNS','A container row does not match its visible ten-column header');
    const cells=row.cells.map(clean),number=normalizeNavigatorReference(cells[1]);
    if(!BOX.test(number)||seen.has(number))throw fail('NAVIGATOR_CONTAINER_MISMATCH','Container row identifiers are invalid or duplicated');
    seen.add(number);
    const tare=mass(cells[4]),payload=mass(cells[5]);
    details.push({number,type:cells[3]||null,movement:cells[2]||null,tare_kg:tare.kg,payload_kg:payload.kg,
      latest_status:null,status_time:null,position:null,events:[],source:source(binding,'Navigator Containers and Cargo',number,row.row??index+1),
      extra:{account_scope:NAVIGATOR_SCOPE,tare,maximum_payload:payload,quantity:quantity(cells[6]),gross_cargo_weight:mass(cells[7]),
        empty_pickup_location_raw:cells[8]||null,empty_redelivery_location_raw:cells[9]||null}});
  }
  const numbers=details.map(detail=>detail.number),page=pagination(table.paginationText);
  if(binding.reference_type==='CONTAINER'&&!numbers.includes(binding.reference))throw fail('NAVIGATOR_REFERENCE_MISMATCH','The queried container is not in the selected shipment');
  if(!Array.isArray(selectionReceipt.containerNumbers)||!selectionReceipt.containerNumbers.length||
      JSON.stringify([...selectionReceipt.containerNumbers.map(normalizeNavigatorReference)].sort())!==JSON.stringify([...numbers].sort()))
    throw fail('NAVIGATOR_CONTAINER_MISMATCH','The selected shipment container membership changed');
  const declared=/^(\d+)\s*x\s*/i.exec(clean(itemValue(binding.context.fields,'Containers')))?.[1];
  const declaredCount=declared?Number(declared):page?.total??null;
  if(declaredCount!==null&&declaredCount<numbers.length)throw fail('NAVIGATOR_CONTAINER_COUNT_CONFLICT','Visible shipment and container counts conflict');
  const complete=!!page&&page.start===1&&page.end===numbers.length&&page.total===numbers.length&&declaredCount===numbers.length;
  const selectedDetails=binding.reference_type==='CONTAINER'?details.filter(detail=>detail.number===binding.reference):details;
  const selectedNumbers=selectedDetails.map(detail=>detail.number);
  const queryCount=binding.reference_type==='CONTAINER'?1:declaredCount;
  const fields={booking:binding.booking,bill_of_lading:binding.bill_of_lading,declared_containers:queryCount===null?null:String(queryCount),
    container_details:selectedDetails,commodity:itemValue(binding.context.fields,'Commodity'),
    extra:{account_scope:NAVIGATOR_SCOPE,navigator_progress:binding.context.progress??[],navigator_current_status_verified:false,
      navigator_shipment_container_numbers:numbers,navigator_shipment_declared_containers:declaredCount,
      navigator_container_count_scope:binding.reference_type==='CONTAINER'?'EXPLICIT_QUERY_SELECTION':'VISIBLE_SHIPMENT_DECLARATION'}};
  const locations=(binding.context.progress??[]).filter(item=>/^\([A-Z]{5}\)/.test(clean(item.title)));
  if(locations.length){fields.por=clean(locations[0].title).replace(/^\([A-Z]{5}\)\s*/,'');fields.pod=clean(locations.at(-1).title).replace(/^\([A-Z]{5}\)\s*/,'');
    fields.etd=itemValue(locations[0].values,'ETD:');fields.eta=itemValue(locations.at(-1).values,'ETA:');}
  return {reference:query.reference,binding,account_scope:NAVIGATOR_SCOPE,extraction:{ok:true,containers:selectedNumbers,container_count:queryCount??selectedNumbers.length,
    fields,events:[],vessel_voyage:[],dates:[]},coverage:{scope:NAVIGATOR_SCOPE,declared_containers:queryCount,visible_containers:selectedNumbers,shipment_visible_containers:numbers,
      table_complete:complete,pagination:page,scope_complete:false}};
}

function stamp(date,time) {
  const d=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(clean(date)),t=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(clean(time));
  if(!d||!t)return null;
  const calendar=new Date(Date.UTC(Number(d[1]),Number(d[2])-1,Number(d[3])));
  if(calendar.getUTCMonth()!==Number(d[2])-1||calendar.getUTCDate()!==Number(d[3])||Number(t[1])>23||Number(t[2])>59||Number(t[3]??0)>59)return null;
  return {time:`${d[0]}T${t[0]}`,time_raw:`${d[0]} ${t[0]}`,time_basis:'LOCAL_TIME',timezone:null,time_precision:t[3]?'SECOND':'MINUTE'};
}

export function parseNavigatorTrackingSnapshot({document,trackingDocument=document,overviewDocument,query,selectionReceipt,containerNumber,overview}) {
  const binding=contextBinding(trackingDocument,query,selectionReceipt),number=normalizeNavigatorReference(containerNumber);
  if(!BOX.test(number)||!overview?.extraction?.containers?.includes(number)||overview.binding?.booking!==binding.booking||
      overview.binding?.bill_of_lading!==binding.bill_of_lading||overview.binding?.search_action_id!==binding.search_action_id)
    throw fail('NAVIGATOR_CONTAINER_MISMATCH','Tracking dialog is not bound to the selected shipment container');
  const dialog=trackingDocument.dialog;
  if(normalizeNavigatorReference(dialog?.containerNumber)!==number||dialog?.activeTab!=='Tracking'||!dialog.tracking||dialog.transitioning)
    throw fail('NAVIGATOR_TRACKING_NOT_READY','The correct stable container Tracking tab is not ready');
  if(JSON.stringify(dialog.tracking.headers?.map(clean))!==JSON.stringify(TRACKING_HEADERS)||!Array.isArray(dialog.tracking.rows)||!dialog.tracking.rows.length)
    throw fail('NAVIGATOR_TRACKING_COLUMNS','Tracking does not have the observed six-column event grid');
  const base=structuredClone(overview.extraction.fields.container_details.find(detail=>detail.number===number));
  const events=[];
  for(const [index,row] of dialog.tracking.rows.entries()){
    if(row.cells?.length!==6)throw fail('NAVIGATOR_TRACKING_COLUMNS','A movement row has incomplete columns');
    const [description,location,date,clock,transport,voyageRaw]=row.cells.map(clean),at=stamp(date,clock);
    if(!description||!location||!at)throw fail('NAVIGATOR_TRACKING_ROW_INVALID','A movement row has invalid date, time or location');
    const mode=/^truck$/i.test(transport)?'TRUCK':/^(rail|train)$/i.test(transport)?'RAIL':/^barge$/i.test(transport)?'BARGE':null;
    const voyage=voyageRaw&&voyageRaw!=='-'?voyageRaw:null,vessel=!mode&&voyage&&transport?transport:null;
    const load_status=/\bempty\b/i.test(description)?'EMPTY':/\bfull\b/i.test(description)?'LADEN':null;
    events.push({container_number:number,...at,description,location,terminal:null,mode:mode??(vessel?'VESSEL':null),vessel,voyage:vessel?voyage:null,
      time_type:'REPORTED',load_status,source:source(binding,'Navigator Container Tracking',number,row.row??index+1),
      extra:{transport_raw:transport||null,voyage_raw:voyageRaw||null,time_classification_evidence:null,
        classification_note:'No explicit actual/planned classification in this captured Tracking grid',dom_classes:clean(row.classes)||null}});
  }
  if(overviewDocument){
    officialDocument(overviewDocument);
    const other=overviewDocument.dialog;
    if(normalizeNavigatorReference(other?.containerNumber)!==number||other.activeTab!=='Overview')throw fail('NAVIGATOR_OVERVIEW_MISMATCH','Container Overview belongs to another tab or container');
    const sections=other.sections??[],container=sections.filter(section=>section.title==='Container Details');
    if(container.length!==1)throw fail('NAVIGATOR_OVERVIEW_NOT_READY','The exact Container Details subsection is missing or duplicated');
    const type=clean(itemValue(container[0].fields,'Type')),tare=mass(itemValue(container[0].fields,'Tare')),payload=mass(itemValue(container[0].fields,'Max. Payload'));
    if(type!==base.type||tare.kg!==base.tare_kg||payload.kg!==base.payload_kg)throw fail('NAVIGATOR_EQUIPMENT_CONFLICT','Container Overview and table equipment specifications conflict');
    base.extra.navigator_overview_sections=sections;
    const seals=sections.find(section=>section.title==='Seals');
    base.extra.seals=seals?{type:clean(itemValue(seals.fields,'Seal Type'))||null,number:clean(itemValue(seals.fields,'Seal No.'))||null}:null;
  }
  base.events=events;base.extra.latest_actual=null;base.extra.current_status_verified=false;
  base.latest_status=null;base.status_time=null;base.position=null;
  return {number,detail:base,events,binding,latestActual:null,account_scope:NAVIGATOR_SCOPE,
    coverage:{reported_rows:dialog.tracking.rows.length,captured_rows:events.length,time_classification:'REPORTED_ONLY',all_rows_captured:true}};
}

export function mergeNavigatorSnapshots({overview,details=[]}) {
  if(!overview?.extraction||overview.account_scope!==NAVIGATOR_SCOPE)throw fail('NAVIGATOR_OVERVIEW_MISMATCH','A bound Navigator container overview is required');
  const known=overview.extraction.containers,byNumber=new Map(),errors=[];
  for(const value of details){
    if(!known.includes(value.number)||byNumber.has(value.number)||value.binding?.booking!==overview.binding.booking||
        value.binding?.bill_of_lading!==overview.binding.bill_of_lading||value.binding?.search_action_id!==overview.binding.search_action_id)
      throw fail('NAVIGATOR_CONTAINER_MISMATCH','A detail snapshot is duplicated or belongs to another account shipment');
    byNumber.set(value.number,value);
  }
  const pending=known.filter(number=>!byNumber.has(number));
  if(pending.length)errors.push({code:'NAVIGATOR_DETAILS_PARTIAL',message:'Some selected-shipment containers have no captured Tracking details',containers:pending});
  if(!overview.coverage.table_complete)errors.push({code:'NAVIGATOR_CONTAINER_TABLE_PARTIAL',message:'Only part of the account-visible container table was captured'});
  const containerDetails=known.map(number=>byNumber.get(number)?.detail??overview.extraction.fields.container_details.find(detail=>detail.number===number));
  const events=known.flatMap(number=>byNumber.get(number)?.events??[]);
  const extraction={...overview.extraction,fields:{...overview.extraction.fields,container_details:containerDetails,structured_events:events,
      hapag_detail_history:true,hapag_reported_vessel:null,latest_actual:null,latest_event:CURRENT_UNVERIFIED_MESSAGE,
      extra:{...overview.extraction.fields.extra,account_scope:NAVIGATOR_SCOPE,latest_actual:null,navigator_current_status_verified:false}},
    events:events.map(event=>[event.time_raw,event.description,event.location,event.vessel,event.voyage,event.container_number].filter(Boolean).join(' | ')),
    vessel_voyage:[],dates:[]};
  return {reference:overview.reference,extraction,binding:overview.binding,account_scope:NAVIGATOR_SCOPE,latestActual:null,errors,
    coverage:{scope:NAVIGATOR_SCOPE,declared_containers:overview.coverage.declared_containers,overview_containers:known,
      detailed_containers:known.filter(number=>byNumber.has(number)),pending_containers:pending,reported_event_count:events.length,
      time_classification:'REPORTED_ONLY',verified_actual_count:0,scope_complete:errors.length===0}};
}
