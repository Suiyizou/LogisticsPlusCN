const labels={
  container_numbers:['箱号','Containers'],origin_terminal:['起运码头','Origin terminal'],destination_terminal:['目的码头','Destination terminal'],
  service:['航线服务','Service'],commodity:['品名','Commodity'],weight:['货重（船司原值）','Weight as reported'],
  gross_weight:['毛重（船司原值）','Gross weight as reported'],net_weight:['净重（船司原值）','Net weight as reported'],
  packages:['件数','Packages'],measurement:['体积（船司原值）','Measurement as reported'],seal:['封条号','Seal number'],
  seal_number:['封条号','Seal number'],firms_code:['FIRMS 代码','FIRMS code'],customs_status:['海关状态','Customs status'],
  freight_status:['运费状态','Freight status'],release_status:['放货状态','Release status'],bill_type:['提单类型','Bill type'],
  empty_return_facility:['还空箱场站','Empty return facility'],empty_pickup_facility:['提空箱场站','Empty pickup facility'],
  terminal_last_free_date:['最后免费日','Last free date'],customer_reference:['客户参考号','Customer reference'],po_number:['客户 PO','Customer PO'],
  etd:['预计离港（ETD）','Estimated departure (ETD)'],eta:['预计到港（ETA）','Estimated arrival (ETA)'],atd:['实际离港（ATD）','Actual departure (ATD)'],ata:['实际到港（ATA）','Actual arrival (ATA)']
};
const duplicate=new Set(['bill_of_lading','booking','container_type','container_count_declared','container_count_extracted','origin','destination','vessel','voyage','state','latest_event','latest_event_at','container_numbers']);
const stringify=value=>Array.isArray(value)?value.map(stringify).filter(Boolean).join('、'):value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k}: ${stringify(v)}`).join(' · '):value==null?'':String(value).trim();
export function sourceBusinessFields(snapshot,language='zh'){
  const seen=new Set(),en=language==='en',fields=Array.isArray(snapshot?.sourceDetails?.fields)?snapshot.sourceDetails.fields:[];
  return fields.flatMap(field=>{
    if(!labels[field.key]||duplicate.has(field.key)||/\.(?:containers|events|legs)(?:\.|\[|$)/.test(field.source||''))return[];
    const keyTime={etd:'estimatedDeparture',eta:'estimatedArrival',atd:'actualDeparture',ata:'actualArrival'}[field.key];
    if(keyTime&&(snapshot.keyTimes?.[keyTime]?.time||snapshot.keyTimes?.[keyTime]?.reportedTime))return[];
    const value=stringify(field.value);if(!value||/^(?:N\/?A|NONE|NULL|UNKNOWN|—|-)$/i.test(value))return[];
    const label=labels[field.key][en?1:0],identity=label+'|'+value;if(seen.has(identity))return[];seen.add(identity);
    return[{label,value}];
  });
}
