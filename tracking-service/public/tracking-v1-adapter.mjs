import {
  normalizeTrackingLocation,
  normalizeTrackingSnapshotLocations
} from "./tracking-location-normalizer.mjs";
import { sanitizeTrackingData, normalizeDetailCapture, reportedSeal } from "./tracking-detail-data.mjs?v=20261108-carrier-details-r4";

/** Read-only compatibility for supplied tracking.v1 JSON. No network or persistence. */
const text = (value) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const first = (...values) => values.map(text).find(Boolean) || "";
const isoTime = (value) =>
  /^\d{4}-\d{2}-\d{2}(?:$|[T ][0-9])/.test(text(value)) ? text(value) : null;
const carrierAliases = { HPL: "HAPAG_LLOYD", MSK: "MAERSK", EMC: "EVERGREEN", MATSN: "MATSON" };
export function carrierIdentity(code, name = "") {
  const supplied = text(code).toUpperCase();
  const canonical = carrierAliases[supplied] || supplied || "UNKNOWN";
  return { code: canonical, name: text(name) || canonical };
}
export const CARRIER_LOGOS = Object.freeze({
  COSCO: "./carriers/cosco-shipping-lines.png",
  OOCL: "./carriers/oocl.svg",
  HMM: "./carriers/hmm.png",
  SML: "./carriers/sml.png",
  MATSON: "./carriers/matson.png",
  MSC: "./carriers/msc.webp",
  EVERGREEN: "./carriers/evergreen.svg",
  HAPAG_LLOYD: "./carriers/hapag-lloyd.svg",
  KMTC: "./carriers/kmtc.png",
  MAERSK: "./carriers/maersk.jpg",
  YML: "./carriers/yml.png",
  ZIM: "./carriers/zim.webp",
  CMA: "./carriers/cma.svg",
  ONE: "./carriers/one.svg"
});

function normalizeEvent(value, index, source) {
  const e = object(value);
  const description = first(
    e.description,
    e.status,
    e.name,
    e.eventName,
    e.event_name,
    e.raw,
    value
  );
  const place = normalizeTrackingLocation({
    ...object(e.location),
    name: first(e.location, e.locationName, e.location_name, e.city, e.location?.name),
    countryCode: first(e.countryCode, e.country_code, e.location?.countryCode),
    country: first(e.country, e.countryName, e.country_name, e.location?.country)
  });
  const time = first(e.time, e.date, e.occurredAt, e.occurred_at);
  const timeType = ["ACTUAL", "ESTIMATED", "REPORTED"].includes(e.time_type || e.timeType)
    ? e.time_type || e.timeType : "REPORTED";
  if (!description && !time && !place?.name) return null;
  return {
    sequence: e.sequence ?? index + 1,
    name: description,
    occurredAt: timeType === "ACTUAL" ? time || null : null,
    estimatedAt: timeType === "ESTIMATED" ? time || first(e.estimatedAt) || null : null,
    timeType,
    sourceTime: first(e.sourceTime, time) || null,
    reportedTime: first(e.time_raw, e.reportedTime, time),
    location: place?.name ?? "",
    countryCode: place?.countryCode || undefined,
    transportMode: first(e.mode, e.transportMode, e.transport_mode),
    containerNumber: first(e.container_number, e.containerNumber),
    terminal: text(e.terminal),
    vesselName: first(e.vessel, e.vessel_name, e.vesselName),
    voyage: text(e.voyage),
    timezone: text(e.timezone) || null,
    timePrecision: first(e.time_precision, e.timePrecision) || null,
    loadStatus: first(e.load_status, e.loadStatus) || null,
    vesselDetails: object(e.vessel_details || e.vesselDetails),
    terminalDetails: object(e.terminal_details || e.terminalDetails),
    sourceKind: first(e.sourceKind, e.source?.kind, typeof e.source === "string" ? e.source : ""),
    source,
    ...(e.raw != null ? { raw: e.raw } : {})
  };
}
function shipmentEvents(shipment) {
  return list(shipment.events)
    .map((e, i) => normalizeEvent(e, i, "shipment.events"))
    .filter(Boolean)
    .map((entry) => ({ ...entry, semanticKind: entry.timeType === "REPORTED" ? "SOURCE_ENTRY" : "CARRIER_EVENT" }));
}
function additionalEvents(shipment) {
  const extra = object(shipment.fields_extra);
  return [
    ...list(extra.hmm_history).map((e, i) =>
      normalizeEvent(
        {
          ...e,
          time:
            first(e.date) && first(e.time)
              ? String(e.date) + " " + String(e.time)
              : first(e.date, e.time)
        },
        i,
        "hmm_history"
      )
    ),
    ...list(extra.msc_events).map((e, i) => normalizeEvent(e, i, "msc_events"))
  ].filter(Boolean);
}
function timeRecord(value, location) {
  const time = text(value);
  return time ? { time, location: location?.name || null } : null;
}

/** Only explicitly typed leg dates can become progress nodes. Summary ports
 * and generic page-text records are not evidence that a milestone occurred. */
function typedLegRoute(legs) {
  return legs.flatMap((leg) => {
    const nodes = [];
    for (const [kind, location, countryCode, actualTime, estimatedTime] of [
      ["departure", leg.loadPort, leg.loadCountryCode, leg.actualDeparture, leg.estimatedDeparture],
      ["arrival", leg.dischargePort, leg.dischargeCountryCode, leg.actualArrival, leg.estimatedArrival]
    ]) {
      const city = typeof location === "string" ? location : first(location?.name, location?.city);
      if (!city || (!actualTime && !estimatedTime)) continue;
      nodes.push({
        city,
        countryCode,
        locationType: kind === "departure" ? "POL" : "POD",
        event: "",
        typedEvent: kind,
        actualTime: actualTime || null,
        estimatedTime: estimatedTime || null,
        source: "shipment.legs"
      });
    }
    return nodes;
  });
}

/** Display progress from native milestones, typed sailing legs, or the
 * carrier's separate history table. Generic source entries stay in archives. */
const transportMovement = (name) => !/customs|clearance|freight|\b(?:ISF|AMS|ACI|ACE)\b/i.test(name) &&
  /\b(?:gate[ -]?(?:in|out)|(?:in|out)gate|load(?:ed|ing)?|discharg(?:e|ed|ing)|depart(?:ure|ed)?|arriv(?:al|ed)|deliver(?:y|ed)|empty return(?:ed)?|empty to shipper|empty container released|returned|received|available|pick[ -]?up)\b|还空箱|装船|卸船|进场|出场|提箱|交付|离港|到港/i.test(name);

export function carrierDetailEvents(snapshot) {
  const entries = [
    ...list(snapshot?.events),
    ...list(snapshot?.containers).flatMap((container) => list(container.milestones)
      .map((event) => ({ ...event, containerNumber: event.containerNumber || container.number })))
  ];
  const seen = new Set();
  return entries.filter((entry) => {
    if (!["PAGE_DETAIL", "PAGE_DETAILS"].includes(entry?.sourceKind) ||
        !text(entry.name) || !text(entry.reportedTime || entry.occurredAt || entry.estimatedAt)) return false;
    if (/^(?:containers?|type|weight|POD ETA)$/i.test(entry.name) || /^[A-Z]{4}\d{7}$/i.test(entry.name) || /price calculation date|\bindicative\b/i.test(entry.name)) return false;
    const key = [entry.containerNumber, entry.name, entry.location, entry.terminal, entry.reportedTime,
      entry.occurredAt, entry.estimatedAt, entry.timeType, entry.timezone, entry.vesselName, entry.voyage].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function reportedTrackingHistory(snapshot) {
  const details = carrierDetailEvents(snapshot);
  if (details.length) return details;
  return list(snapshot?.sourceDetails?.additionalEvents).filter((entry) => {
    if (!entry || !text(entry.name) || !text(entry.reportedTime || entry.occurredAt)) return false;
    const name = text(entry.name);
    const place = text(entry.location);
    if (/^(?:containers?|type|weight|POD ETA)$/i.test(name) || /^[A-Z]{4}\d{7}$/i.test(name) ||
        /price calculation date|\bindicative\b/i.test(name + " " + place) ||
        /^(?:container|type)$/i.test(place)) return false;
    if (entry.source === "hmm_history") return true;
    if (entry.source !== "msc_events") return false;
    // The MSC extractor also emits table headers and container rows here.
    // Only an explicit transport movement may be presented as history.
    return /\b(?:gate[ -]?(?:in|out)|load(?:ed|ing)?|discharg(?:e|ed|ing)|depart(?:ure|ed)?|arriv(?:al|ed)|deliver(?:y|ed)|empty return(?:ed)?|return(?:ed)? (?:of )?empty|received|cargo available)\b|还空箱|装船|卸船|进场|出场|提箱|交付|离港|到港/i.test(name);
  });
}

export function progressContainerNumbers(snapshot) {
  if (list(snapshot?.route).length || typedLegRoute(list(snapshot?.routingLegs)).length) return [];
  const events = carrierDetailEvents(snapshot);
  if (!events.length) return [];
  return [...new Set([...events.map((event) => text(event.containerNumber)),
    ...list(snapshot?.containers).map((container) => text(container.number))].filter(Boolean))];
}

export function trackingProgressNodes(snapshot, { containerNumber = "" } = {}) {
  if (Array.isArray(snapshot?.route) && snapshot.route.length) return snapshot.route;
  const typed = typedLegRoute(list(snapshot?.routingLegs));
  if (typed.length) return typed;
  const details = carrierDetailEvents(snapshot).filter((entry) => text(entry.location) && transportMovement(entry.name) && (!containerNumber || entry.containerNumber === containerNumber));
  // Order one box's explicitly ISO-formatted source dates without converting
  // local timestamps, adding a time, or assigning completion semantics.
  if (containerNumber && details.every((entry) => /^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(entry.sourceTime || "")))
    details.sort((a, b) => a.sourceTime.localeCompare(b.sourceTime));
  if (details.length) return details.map((entry) => ({
    city: entry.location,
    countryCode: text(entry.countryCode),
    locationType: "REPORTED",
    event: entry.name,
    containerNumber: text(entry.containerNumber),
    actualTime: entry.timeType === "ACTUAL" ? entry.occurredAt || null : null,
    estimatedTime: entry.timeType === "ESTIMATED" ? entry.estimatedAt || null : null,
    reportedTime: entry.reportedTime || null,
    timezone: entry.timezone || null,
    timePrecision: entry.timePrecision || null,
    semanticKind: entry.timeType === "ACTUAL" || entry.timeType === "ESTIMATED" ? "CARRIER_EVENT" : "CARRIER_REPORTED",
    source: entry.source,
    sourceKind: entry.sourceKind
  }));
  return reportedTrackingHistory(snapshot).flatMap((entry) => {
    if (entry?.source !== "hmm_history") return [];
    const name = text(entry.name);
    const location = text(entry.location);
    const reportedTime = text(entry.reportedTime || entry.occurredAt);
    if (!name || !location || !reportedTime) return [];
    return [{
      city: location,
      countryCode: text(entry.countryCode),
      locationType: /departure.*POL|depart.*port of loading/i.test(name) ? "POL" :
        /arrival.*POD|arriv.*port of discharge/i.test(name) ? "POD" : "REPORTED",
      event: name,
      actualTime: null,
      estimatedTime: null,
      reportedTime,
      semanticKind: "CARRIER_REPORTED",
      source: entry.source
    }];
  });
}

function endpoint(countryCode, ...candidates) {
  const value = candidates.find((entry) => entry && (typeof entry === "object" || text(entry)));
  if (!value && !countryCode) return null;
  return normalizeTrackingLocation({
    ...(value && typeof value === "object" ? value : { name: value }),
    countryCode: first(value?.countryCode, value?.country_code, value?.country, countryCode)
  });
}

function supplementary(value, knownKeys) {
  const known = new Set(knownKeys.split(" "));
  return Object.fromEntries(Object.entries(object(value)).filter(([name]) => !known.has(name)));
}

function supplementaryRows(rows, knownKeys) {
  return Object.fromEntries(
    list(rows).map((row, index) => [String(index + 1), supplementary(row, knownKeys)])
  );
}

const SOURCE_VALUE_LIMIT = 65536;
function sourceFieldValue(value) {
  let truncated = false;
  let budget = 48000;
  const seen = new WeakSet();
  const marker = () => {
    truncated = true;
    return "[source display limit]";
  };
  const visit = (entry, depth) => {
    if (budget <= 0 || depth > 8) return marker();
    if (typeof entry === "string") {
      const length = Math.min(entry.length, budget, 8192);
      budget -= length;
      if (length < entry.length) {
        truncated = true;
        return entry.slice(0, length) + " [source display limit]";
      }
      return entry;
    }
    if (!entry || typeof entry !== "object") {
      budget -= 16;
      return entry;
    }
    if (seen.has(entry)) return marker();
    seen.add(entry);
    const pairs = Object.entries(entry);
    const result = Array.isArray(entry) ? [] : Object.create(null);
    let rendered = 0;
    for (const [key, item] of pairs) {
      if (rendered >= 100 || budget <= 0) break;
      const safeKey = key.slice(0, 512);
      if (safeKey !== key) truncated = true;
      budget -= safeKey.length + 16;
      const child = visit(item, depth + 1);
      if (Array.isArray(result)) result.push(child);
      else result[safeKey] = child;
      rendered++;
    }
    if (rendered < pairs.length) {
      const omitted = marker() + " (" + (pairs.length - rendered) + " omitted)";
      if (Array.isArray(result)) result.push(omitted);
      else result["[source display limit]"] = omitted;
    }
    seen.delete(entry);
    return result;
  };
  const structured = value !== null && typeof value === "object";
  let rawText = structured ? JSON.stringify(visit(value, 0), null, 2) : String(value);
  if (rawText.length > SOURCE_VALUE_LIMIT) {
    rawText = rawText.slice(0, SOURCE_VALUE_LIMIT) + " [source display limit]";
    truncated = true;
  }
  return {
    value: rawText.length > 1200 ? rawText.slice(0, 1200) + "…" : rawText,
    rawText,
    structured,
    truncated
  };
}
function collectSourceFields(value, source) {
  const entries = Object.entries(object(value)).filter(
    ([, item]) =>
      item !== null &&
      item !== undefined &&
      (typeof item === "string"
        ? item.trim() !== ""
        : typeof item === "object"
          ? Object.keys(item).length > 0
          : true)
  );
  const fields = entries
    .slice(0, 200)
    .map(([key, item]) => ({ key: key.slice(0, 512), source, ...sourceFieldValue(item) }));
  if (entries.length > fields.length)
    fields.push({
      key: "[source field limit]",
      source,
      value: String(entries.length - fields.length) + " additional fields exceed the display limit",
      rawText: "",
      structured: false,
      truncated: true
    });
  return fields;
}

export function adaptTrackingV1(record, { carrierCode = "" } = {}) {
  if (record?.schema !== "tracking.v1") throw new Error("Expected a tracking.v1 record");
  const carrier = carrierIdentity(record.carrier?.code || carrierCode, record.carrier?.name);
  if (carrierCode && carrierIdentity(carrierCode).code !== carrier.code)
    throw new Error("Carrier group conflicts with record.carrier.code");
  const shipment = object(sanitizeTrackingData(record.shipment)),
    fields = object(shipment.fields),
    extra = object(shipment.fields_extra),
    route = object(shipment.route),
    vessel = object(route.vessel),
    query = object(record.query),
    status = object(shipment.status);
  const originalNumber = first(
    query.reference_input,
    shipment.bill_of_lading,
    query.reference_submitted
  );
  const number = first(query.reference_submitted, query.reference_normalized, originalNumber);
  if (!number) throw new Error("Tracking record has no reference");
  const type =
    {
      BILL_OF_LADING: "BILLOFLADING",
      BILLOFLADING: "BILLOFLADING",
      BOOKING: "BOOKING",
      CONTAINER: "CONTAINER"
    }[text(query.reference_type).toUpperCase()] ||
    text(query.reference_type) ||
    "UNKNOWN";
  const origin = endpoint(
    first(
      route.originCountryCode,
      route.origin_country_code,
      fields.origin_country_code,
      fields.origin_country
    ),
    route.origin,
    fields.origin,
    route.POL,
    fields.POL,
    fields.pol,
    fields.load_port,
    extra.load_port
  );
  const destination = endpoint(
    first(
      route.destinationCountryCode,
      route.destination_country_code,
      fields.destination_country_code,
      fields.destination_country
    ),
    route.destination,
    fields.destination,
    route.POD,
    fields.POD,
    fields.pod,
    fields.discharge_port,
    extra.discharge_port
  );
  const events = shipmentEvents(shipment);
  const containers = list(shipment.containers)
    .map((c) => ({
      number: first(c.number, c.container_number, c.containerNumber),
      type: first(c.type, c.container_type, c.containerType),
      transportMode: first(c.movement, c.transportMode, c.transport_mode),
      trafficTerm: first(c.terms, c.trafficTerm, c.traffic_term),
      currentLocation: c.position ?? c.currentLocation ?? c.current_location ?? "",
      currentLocationCountryCode: first(
        c.currentLocationCountryCode,
        c.current_location_country_code,
        c.country_code
      ),
      latestEvent: first(c.latest_status, c.latestEvent, c.latest_event),
      latestEventTime: first(c.status_time, c.latestEventTime, c.latest_event_time) || null,
      reportedStatusTime: first(c.status_time_raw, c.status_time, c.reportedStatusTime, c.reported_status_time),
      timezone: text(c.timezone) || null,
      seal: reportedSeal(first(c.seal, c.seal_number, c.extra?.seal, c.extra?.seal_number)),
      weight: text(c.weight),
      extra: object(c.extra),
      tareKg: typeof c.tare_kg === "number" && c.tare_kg >= 0 ? c.tare_kg : null,
      payloadKg: typeof c.payload_kg === "number" && c.payload_kg >= 0 ? c.payload_kg : null,
      estimatedArrival: text(c.eta) || null,
      estimatedArrivalRaw: first(c.eta_raw, c.eta) || null,
      estimatedArrivalLabel: text(c.eta_label) || null,
      ...(c.raw != null ? { raw: c.raw } : {}),
      milestones: list(c.events)
        .map((e, i) => normalizeEvent(e, i, "container.events"))
        .filter(Boolean)
        .map((e) => ({
          ...e,
          name: e.name,
          time: null,
          reportedTime: e.reportedTime,
          containerNumber: e.containerNumber || first(c.number, c.container_number, c.containerNumber),
          location: e.location,
          countryCode: e.countryCode,
          transportMode: e.transportMode,
          ...(e.raw != null ? { raw: e.raw } : {})
        }))
    }))
    .filter((c) => c.number);
  const routingLegs = list(shipment.legs).map((l, i) => ({
    sequence: l.sequence ?? i + 1,
    mode: first(l.mode, l.transportMode, l.transport_mode),
    vesselName: first(l.vessel, l.vessel_name),
    voyage: text(l.voyage),
    service: text(l.service),
    loadPort: l.load_port ?? l.loadPort ?? l.origin ?? "",
    dischargePort: l.discharge_port ?? l.dischargePort ?? l.destination ?? "",
    loadCountryCode: first(
      l.loadCountryCode,
      l.load_country_code,
      l.load_country,
      l.origin_country_code
    ),
    dischargeCountryCode: first(
      l.dischargeCountryCode,
      l.discharge_country_code,
      l.discharge_country,
      l.destination_country_code
    ),
    estimatedDeparture: first(l.etd, l.estimatedDeparture, l.estimated_departure, l.ETD) || null,
    estimatedArrival: first(l.eta, l.estimatedArrival, l.estimated_arrival, l.ETA) || null,
    actualDeparture: first(l.atd, l.actualDeparture, l.actual_departure) || null,
    actualArrival: first(l.ata, l.actualArrival, l.actual_arrival) || null
  }));
  const keyTimes = Object.fromEntries(
    [
      [
        "estimatedDeparture",
        first(
          fields.etd,
          fields.estimatedDeparture,
          fields.estimated_departure,
          fields.ETD,
          extra.etd,
          extra.ETD
        ),
        origin
      ],
      [
        "estimatedArrival",
        first(
          fields.eta,
          fields.estimatedArrival,
          fields.estimated_arrival,
          fields.ETA,
          extra.eta,
          extra.ETA
        ),
        destination
      ],
      [
        "actualDeparture",
        first(fields.atd, fields.actualDeparture, fields.actual_departure, fields.ATD),
        origin
      ],
      [
        "actualArrival",
        first(fields.ata, fields.actualArrival, fields.actual_arrival, fields.ATA),
        destination
      ]
    ]
      .map(([key, value, location]) => [key, timeRecord(value, location)])
      .filter(([, value]) => value)
  );
  const latestEvent = first(status.latest_event, fields.latest_event);
  const warnings = list(sanitizeTrackingData(record.meta?.warnings)).map(text).filter(Boolean);
  const sourceFields = [
    ...collectSourceFields(fields, "shipment.fields"),
    ...collectSourceFields(shipment.fields_extra, "shipment.fields_extra"),
    ...collectSourceFields(
      supplementary(
        shipment,
        "bill_of_lading booking container_count route status containers events legs fields fields_extra"
      ),
      "shipment"
    ),
    ...collectSourceFields(supplementary(route, "origin destination vessel"), "shipment.route"),
    ...collectSourceFields(supplementary(vessel, "name voyage"), "shipment.route.vessel"),
    ...collectSourceFields(
      supplementary(status, "state latest_event latest_event_at"),
      "shipment.status"
    ),
    ...collectSourceFields(
      supplementaryRows(
        shipment.legs,
        "sequence mode vessel vessel_name voyage service load_port discharge_port origin destination etd eta atd ata"
      ),
      "shipment.legs"
    ),
    ...collectSourceFields(
      supplementaryRows(
        shipment.containers,
        "number type movement terms position latest_status status_time status_time_raw timezone seal seal_number weight tare_kg payload_kg eta eta_raw eta_label"
      ),
      "shipment.containers"
    ),
    ...collectSourceFields(
      supplementaryRows(
        shipment.events,
        "sequence description status name time date time_raw location mode container_number containerNumber"
      ),
      "shipment.events"
    )
  ];
  const snapshot = {
    schemaVersion: "tracking.v1",
    deliveryMode: "SINGLE_RESPONSE",
    provider: carrier,
    channel: "NODE_JSON",
    fetchedAt: text(record.generated_at) || null,
    tracking: { type, number, originalNumber },
    summary: {
      billOfLading: text(shipment.bill_of_lading) || null,
      bookingNumbers: [text(shipment.booking)].filter(Boolean),
      origin,
      destination,
      vesselVoyage: [first(vessel.name, fields.vessel), first(vessel.voyage, fields.voyage)]
        .filter(Boolean)
        .join(" / "),
      status: first(status.state, fields.state),
      latestEvent: latestEvent
        ? {
            name: latestEvent,
            occurredAt: isoTime(first(status.latest_event_at, fields.latest_event_at)),
            reportedTime: first(status.latest_event_at, fields.latest_event_at)
          }
        : null,
      containerCount: object(shipment.container_count)
    },
    references: {
      masterBill: text(shipment.bill_of_lading) || null,
      bookingNumbers: [text(shipment.booking)].filter(Boolean)
    },
    keyTimes,
    route: [],
    routingLegs,
    containers,
    events,
    sourceDetails: {
      schema: record.schema,
      queryStatus: text(query.status),
      strategy: text(query.strategy),
      vessel: first(vessel.name, fields.vessel),
      voyage: first(vessel.voyage, fields.voyage),
      fields: sourceFields,
      businessExtras: object(extra.extra),
      additionalEvents: additionalEvents(shipment),
      warnings,
      businessVerified: record.meta?.business_verified === true,
      confidence: text(record.meta?.confidence),
      noBusinessData: query.status === "NO_BUSINESS_DATA",
      evidenceAvailable: Boolean(record.evidence?.screenshot_path || record.evidence?.text_path),
      detailCapture: normalizeDetailCapture(record.meta?.detail_capture)
    }
  };
  // Endpoint names are summary facts, never fabricated milestone nodes.
  return {
    snapshot: normalizeTrackingSnapshotLocations(snapshot),
    raw: null,
    cached: false,
    sourceSchema: "tracking.v1"
  };
}

export function normalizeSourceDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return details;
  details = sanitizeTrackingData(details);
  const fields = list(details.fields)
    .slice(0, 200)
    .flatMap((entry) => {
      if (!entry || !text(entry.key) || entry.value === null || entry.value === undefined)
        return [];
      const alreadyFormatted =
        typeof entry.rawText === "string" && typeof entry.structured === "boolean";
      const formatted = sourceFieldValue(alreadyFormatted ? entry.rawText : entry.value);
      return [
        {
          key: text(entry.key).slice(0, 512),
          source: text(entry.source).slice(0, 512) || "shipment.fields",
          ...formatted,
          structured: alreadyFormatted ? entry.structured : formatted.structured,
          truncated: entry.truncated === true || formatted.truncated
        }
      ];
    });
  if (list(details.fields).length > 200)
    fields.push({
      key: "[source field limit]",
      source: "shipment.fields",
      value: "Additional source fields exceed the display limit",
      rawText: "",
      structured: false,
      truncated: true
    });
  fields.push(...collectSourceFields(details.extraFields, "shipment.fields_extra"));
  const seen = new Set();
  const normalized = {
    ...details,
    detailCapture: normalizeDetailCapture(details.detailCapture),
    fields: fields.filter((field) => {
      const key = field.source + "|" + field.key;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  };
  delete normalized.extraFields;
  return normalized;
}

export function usesLegacySupplementalDelivery(snapshot) {
  return snapshot?.deliveryMode === "LEGACY_SUPPLEMENTAL";
}

export function normalizeTrackingPayload(payload) {
  if (payload?.snapshot && typeof payload.snapshot === "object") {
    const safe = sanitizeTrackingData(payload.snapshot);
    const snapshot = normalizeTrackingSnapshotLocations(
      JSON.stringify(safe) === JSON.stringify(payload.snapshot) ? payload.snapshot : safe
    );
    if (!snapshot.sourceDetails)
      return snapshot === payload.snapshot ? payload : { ...payload, snapshot };
    return {
      ...payload,
      snapshot: { ...snapshot, sourceDetails: normalizeSourceDetails(snapshot.sourceDetails) }
    };
  }
  if (payload?.schema === "tracking.v1" && payload.shipment) return adaptTrackingV1(payload);
  throw new Error("Expected an existing snapshot response or a tracking.v1 record");
}
export function readTrackingPreview(value) {
  let records;
  if (
    value?.by_carrier &&
    typeof value.by_carrier === "object" &&
    !Array.isArray(value.by_carrier)
  ) {
    records = Object.entries(value.by_carrier).flatMap(([carrier, items]) => {
      if (!Array.isArray(items)) throw new Error("Each by_carrier group must be an array");
      return items.map((record) => adaptTrackingV1(record, { carrierCode: carrier }));
    });
  } else
    records = list(value).length
      ? value.map(normalizeTrackingPayload)
      : [normalizeTrackingPayload(value)];
  if (!records.length || records.length > 500)
    throw new Error("Preview requires between 1 and 500 tracking records");
  return records.map((payload, index) => {
    const snapshot = payload.snapshot;
    if (
      !text(snapshot?.tracking?.number) ||
      !snapshot.summary ||
      typeof snapshot.summary !== "object" ||
      Array.isArray(snapshot.summary)
    )
      throw new Error("Snapshot requires tracking.number and a summary object");
    for (const key of ["route", "routingLegs", "containers", "events"])
      if (snapshot[key] !== undefined && !Array.isArray(snapshot[key]))
        throw new Error(`Snapshot ${key} must be an array`);
    return {
      ...payload,
      raw: null,
      shipmentId: null,
      shipmentRecord: null,
      databaseStored: false,
      localPreview: true,
      previewIndex: index,
      snapshot: { ...snapshot, channel: "LOCAL_JSON", localPreview: true }
    };
  });
}
export function detailSections(snapshot) {
  return {
    route: list(snapshot?.route).length > 0,
    routeSummary: Boolean(
      text(snapshot?.summary?.origin?.name) || text(snapshot?.summary?.destination?.name)
    ),
    legs: list(snapshot?.routingLegs).length > 0,
    containers: list(snapshot?.containers).length > 0,
    events: list(snapshot?.events).length > 0,
    schedule: Object.keys(object(snapshot?.keyTimes)).length > 0,
    vessel: Boolean(text(snapshot?.sourceDetails?.vessel) || text(snapshot?.summary?.vesselVoyage)),
    noBusinessData: snapshot?.sourceDetails?.noBusinessData === true
  };
}

export function createCarrierBadge(doc, code, name) {
  const carrier = carrierIdentity(code, name),
    badge = doc.createElement("span");
  badge.className = "tracking-carrier-badge";
  badge.dataset.carrier = carrier.code;
  badge.title = carrier.name;
  const label = doc.createElement("span");
  label.textContent = carrier.code;
  badge.append(label);
  const path = CARRIER_LOGOS[carrier.code];
  if (path) {
    const image = doc.createElement("img");
    image.src = path;
    image.alt = carrier.name;
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    badge.prepend(image);
  }
  return badge;
}
