// Ordinary result data only. These parsers never infer ports from the latest
// container location, or turn an ETA into a completed shipment movement.
const MONTHS = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};

export function parseCmaLocalTime(value) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  const match = /\b(\d{1,2})-([A-Z]{3})-(20\d{2})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i.exec(raw);
  if (!match || !MONTHS[match[2].toUpperCase()]) return {raw:raw || null, local:null, timezone:null};
  let hour = match[4] === undefined ? null : Number(match[4]);
  const period = match[6]?.toUpperCase();
  if (hour !== null && (hour > 23 || (period && (hour < 1 || hour > 12)))) return {raw,local:null,timezone:null};
  if (period) hour = hour % 12 + (period === 'PM' ? 12 : 0);
  const year = Number(match[3]); const month = MONTHS[match[2].toUpperCase()]; const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || Number(match[5] ?? 0) > 59)
    return {raw,local:null,timezone:null};
  const local = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` +
    (hour === null ? '' : `T${String(hour).padStart(2,'0')}:${match[5]}`);
  // The carrier's visible clock has no timezone in this layout. Do not add Z.
  return {raw,local,timezone:null};
}

export function cmaOverview(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => /^Tracking details$/i.test(line));
  if (start < 0) return null;
  const details = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const number = lines[index];
    if (!/^[A-Z]{4}\d{7}$/.test(number)) continue;
    const type = lines[index + 1];
    const status = lines[index + 2];
    const position = lines[index + 3];
    const day = lines[index + 4];
    if (!/^\d{2}[A-Z]\d\s*\(/.test(type ?? '') ||
      !/\b(?:GATE|EMPTY|LOAD|DISCHARG|DEPART|ARRIV|DELIVER|RECEIV|RETURN|TRANSFER)/i.test(status ?? '') ||
      !/\d{1,2}-[A-Z]{3}-20\d{2}/i.test(day ?? '')) continue;
    const separateClock = /^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i.test(lines[index + 5] ?? '') ? lines[index + 5] : '';
    const at = parseCmaLocalTime([day,separateClock].filter(Boolean).join(' '));
    const nextBox = lines.findIndex((line, atIndex) => atIndex > index && /^[A-Z]{4}\d{7}$/.test(line));
    const block = lines.slice(index, nextBox < 0 ? lines.length : nextBox);
    const etaIndex = block.findIndex(line => /^ETA Berth at POD$/i.test(line));
    const eta = etaIndex < 0 ? null : parseCmaLocalTime(block[etaIndex + 1]);
    details.push({number,type,position,latest_status:status,status_time:at.local,
      status_time_raw:at.raw,timezone:at.timezone,
      eta:eta?.local ?? null,eta_raw:eta?.raw ?? null,eta_label:eta ? 'ETA Berth at POD' : null,
      source:{kind:'PAGE_OVERVIEW',section:'Tracking details'},
      events:[{description:status,location:position,time:at.local,time_raw:at.raw,
        timezone:null,time_type:'REPORTED',source:'PAGE_OVERVIEW'}]});
  }
  return details.length ? details : null;
}

export function isMscHistoryRow(row) {
  const movement = /\b(?:load(?:ed|ing)?|unload(?:ed|ing)?|discharg\w*|arriv\w*|depart\w*|gate|return\w*|releas\w*|receiv\w*|deliver\w*|pick\w*|empty\s+to\s+shipper|transship\w*|transfer\w*|estimated\s+time\s+of\s+arrival)\b/i;
  const label = /^(?:container(?:s)?|type|latest move|pod eta|date|location|description|mode|facility|show all|\*show all)\b/i;
  return Boolean(row?.description && movement.test(row.description) &&
    !label.test(row.description) && !/^[A-Z]{4}\d{7}$/.test(row.description) &&
    !label.test(row.location ?? '') && !/price calculation|tracking results|contact.*msc|terms of use/i.test(Object.values(row).join(' ')));
}

// Runs in the result card's DOM context after ordinary controls are expanded.
// No scripts, hidden application state, network interception or challenge UI.
export function readCmaCard(card) {
  const text = element => element?.textContent?.replace(/\s+/g,' ').trim() || null;
  const number = text(card.querySelector('.container-ref dt > span'));
  const route = [...card.querySelectorAll('.timeline--item-description')].map(item => ({
    label:text(item.querySelector('.capsule')),location:text(item.querySelector('strong')),
  }));
  const bookingItem = [...card.querySelectorAll('.detail-item')].find(item =>
    /^Booking reference$/i.test(text(item.querySelector('.label-Info')) ?? ''));
  const rows = [...card.querySelectorAll('tr.k-master-row')].flatMap(row => {
    const day = text(row.querySelector('td.date .calendar'));
    const description = text(row.querySelector('td .capsule'));
    if (!day || !description) return [];
    const place = row.querySelector('td.location');
    const vesselCell = row.querySelector('td.vesselVoyage');
    const vesselLink = vesselCell?.querySelector('a[href*="/vessel/"]');
    const voyageLink = vesselCell?.querySelector('a[href*="VoyageReference="]');
    return [{day,clock:text(row.querySelector('td.date .time')),description,
      location:text(place?.querySelector('div > span')) || (place?.querySelector('.terminal-name') ? null : text(place)),
      terminal:text(place?.querySelector('.terminal-name')),
      vessel:text(vesselLink),voyage:text(voyageLink)?.replace(/^[\s(]+|[\s)]+$/g,'') || null,
      vessel_raw:text(vesselCell),row_class:row.className,
      mode:row.querySelector('.ico-vessel') ? 'VESSEL' : row.querySelector('.ico-truck') ? 'TRUCK' : null}];
  });
  return {container:number,booking:text(bookingItem?.querySelector('.value-Info')),
    type:text(card.querySelector('.container-ref dt > span:nth-child(2)')),route,rows,
    local_time_statement:text(card.querySelector('.notif-disclaimer')),
    history_expanded:[...card.querySelectorAll('a')].some(link => text(link) === 'Hide Previous Moves'),
    pdf_href:card.querySelector('.export-pdf a')?.getAttribute('href') || null};
}

export function parseCmaCard(snapshot, expectedContainer) {
  if (snapshot?.container !== expectedContainer)
    throw Object.assign(new Error('CMA detail card belongs to another container'),{code:'DETAIL_CONTAINER_MISMATCH'});
  const events = (snapshot.rows ?? []).flatMap(row => {
    const at = parseCmaLocalTime([row.day,row.clock].filter(Boolean).join(' '));
    if (!at.local || !row.description) return [];
    return [{container_number:expectedContainer,time:at.local,time_raw:at.raw,
      timezone:null,time_basis:/local times/i.test(snapshot.local_time_statement ?? '') ? 'LOCAL_TIME' : null,
      time_type:/\bestimated|\bETA\b/i.test(row.description) ? 'ESTIMATED' : 'REPORTED',
      description:row.description,location:row.location ?? null,terminal:row.terminal ?? null,
      vessel:row.vessel ?? null,voyage:row.voyage ?? null,mode:row.mode ?? null,
      source:{kind:'PAGE_DETAILS',container:expectedContainer,section:'Date / Moves / Location / Vessel (Voyage)'}}];
  });
  const unique = [...new Map(events.map(event => [[event.container_number,event.time,event.description,event.location,event.terminal,event.vessel,event.voyage].join('|'),event])).values()];
  const origin = snapshot.route?.find(item => item.label === 'POL')?.location ?? null;
  const destination = snapshot.route?.find(item => item.label === 'POD')?.location ?? null;
  const placeKey = value => String(value ?? '').replace(/\s*\([A-Z]{2}\)\s*$/,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const destinationKey = placeKey(destination);
  const latest = [...unique].sort((a,b) => b.time.localeCompare(a.time))[0];
  const returned = snapshot.history_expanded === true && destinationKey && unique.find(event =>
    /^Gate in empty at Depot$/i.test(event.description) && event.time_basis === 'LOCAL_TIME' &&
    event.time === latest?.time && placeKey(event.location) === destinationKey);
  const pickedUp = returned && unique.find(event => /^Gate out to consignee$/i.test(event.description) &&
    event.time_basis === 'LOCAL_TIME' && placeKey(event.location) === destinationKey && event.time < returned.time);
  const evidenceState = pickedUp ? {state:'RETURNED',container_number:expectedContainer,
    rule:'DESTINATION_EMPTY_RETURN_AFTER_CONSIGNEE_PICKUP',pickup_time:pickedUp.time,
    empty_return_time:returned.time,location:returned.location,time_basis:'LOCAL_TIME',timezone:null,
    source:{kind:'PAGE_DETAILS',section:'Expanded container movement history'}} : null;
  return {number:expectedContainer,type:snapshot.type,events:unique,
    origin,destination,local_time_statement:snapshot.local_time_statement,
    state:evidenceState?.state ?? null,evidence_state:evidenceState,
    history_expanded:snapshot.history_expanded === true,
    source:{kind:'PAGE_DETAILS',section:'Date / Moves / Location / Vessel (Voyage)'}};
}
