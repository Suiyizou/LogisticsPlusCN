const text=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
const first=(...values)=>values.map(text).find(v=>v&&!/^(?:N\/?A|—|-|NULL)$/i.test(v))||null;
const list=value=>Array.isArray(value)?value:[];
function sourceTime(snapshot,key){
  return first(list(snapshot?.sourceDetails?.fields).find(f=>f.key===key&&(!f.source||f.source==='shipment.fields'))?.value);
}
export function overviewTiming(snapshot={}){
  const keys=snapshot.keyTimes||{},legs=list(snapshot.routingLegs),ocean=legs.filter(l=>String(l.mode).toUpperCase()==='SEA');
  const start=ocean[0]||legs[0]||{},end=ocean.at(-1)||legs.at(-1)||{};
  const actualDeparture=first(start.actualDeparture,keys.actualDeparture?.time,keys.actualDeparture?.reportedTime,sourceTime(snapshot,'atd'));
  const estimatedDeparture=first(start.estimatedDeparture,keys.estimatedDeparture?.time,keys.estimatedDeparture?.reportedTime,sourceTime(snapshot,'etd'));
  const actualArrival=first(end.actualArrival,keys.actualArrival?.time,keys.actualArrival?.reportedTime,keys.estimatedDelivery?.actualTime,sourceTime(snapshot,'ata'));
  const estimatedArrival=first(end.estimatedArrival,keys.estimatedFinalArrival?.time,keys.estimatedFinalArrival?.reportedTime,keys.estimatedArrival?.time,keys.estimatedArrival?.reportedTime,keys.estimatedDelivery?.time,sourceTime(snapshot,'eta'));
  return{departureTime:actualDeparture||estimatedDeparture,departureIsActual:!!actualDeparture,arrivalTime:actualArrival||estimatedArrival,arrivalIsActual:!!actualArrival,actualDeparture,actualArrival,estimatedArrival};
}
export function overviewReference(entry){
  const s=entry.snapshot||{},type=entry.query?.type;
  const valid=value=>{const v=text(value);return /\d/.test(v)&&/^[A-Z0-9][A-Z0-9._/-]*$/i.test(v)?v:'';};
  return [entry.query?.number,s.tracking?.originalNumber,...(type==='BILLOFLADING'?[entry.originalBillOfLading,s.references?.masterBill,s.summary?.billOfLading]:type==='BOOKING'?list(s.references?.bookingNumbers):[])].map(valid).find(Boolean)||'';
}
