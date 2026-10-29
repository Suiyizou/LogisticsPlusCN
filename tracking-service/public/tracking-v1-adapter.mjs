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
  const description = first(e.description, e.status, e.name, e.raw);
  if (!description && !first(e.time, e.date, e.location)) return null;
  return {
    sequence: e.sequence ?? index + 1,
    name: description,
    occurredAt: isoTime(first(e.time, e.date)),
    reportedTime: first(e.time_raw, e.time, e.date),
    location: text(e.location),
    transportMode: text(e.mode),
    containerNumber: first(e.container_number, e.containerNumber),
    source
  };
}
function shipmentEvents(shipment) {
  return list(shipment.events)
    .map((e, i) => normalizeEvent(e, i, "shipment.events"))
    .filter(Boolean)
    .map((entry) => ({ ...entry, semanticKind: "SOURCE_ENTRY", occurredAt: null }));
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
  return time ? { time, location: text(location) || null } : null;
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
  const shipment = object(record.shipment),
    fields = object(shipment.fields),
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
  const origin = first(route.origin, fields.origin),
    destination = first(route.destination, fields.destination);
  const events = shipmentEvents(shipment);
  const containers = list(shipment.containers)
    .map((c) => ({
      number: text(c.number),
      type: text(c.type),
      transportMode: text(c.movement),
      trafficTerm: text(c.terms),
      currentLocation: text(c.position),
      latestEvent: text(c.latest_status),
      latestEventTime: text(c.status_time) || null,
      reportedStatusTime: text(c.status_time),
      seal: first(c.seal, c.seal_number),
      weight: text(c.weight),
      milestones: list(c.events)
        .map((e, i) => normalizeEvent(e, i, "container.events"))
        .filter(Boolean)
        .map((e) => ({
          name: e.name,
          time: e.occurredAt,
          reportedTime: e.reportedTime,
          location: e.location,
          transportMode: e.transportMode
        }))
    }))
    .filter((c) => c.number);
  const routingLegs = list(shipment.legs).map((l, i) => ({
    sequence: i + 1,
    mode: text(l.mode),
    vesselName: first(l.vessel, l.vessel_name),
    voyage: text(l.voyage),
    service: text(l.service),
    loadPort: first(l.load_port, l.origin),
    dischargePort: first(l.discharge_port, l.destination),
    estimatedDeparture: text(l.etd) || null,
    estimatedArrival: text(l.eta) || null,
    actualDeparture: text(l.atd) || null,
    actualArrival: text(l.ata) || null
  }));
  const keyTimes = Object.fromEntries(
    [
      ["estimatedDeparture", fields.etd, origin],
      ["estimatedArrival", fields.eta, destination],
      ["actualDeparture", fields.atd, origin],
      ["actualArrival", fields.ata, destination]
    ]
      .map(([key, value, location]) => [key, timeRecord(value, location)])
      .filter(([, value]) => value)
  );
  const latestEvent = first(status.latest_event, fields.latest_event);
  const warnings = list(record.meta?.warnings).map(text).filter(Boolean);
  const sourceFields = [
    ...collectSourceFields(fields, "shipment.fields"),
    ...collectSourceFields(shipment.fields_extra, "shipment.fields_extra")
  ];
  const snapshot = {
    schemaVersion: "tracking.v1",
    provider: carrier,
    channel: "NODE_JSON",
    fetchedAt: text(record.generated_at) || null,
    tracking: { type, number, originalNumber },
    summary: {
      billOfLading: text(shipment.bill_of_lading) || null,
      bookingNumbers: [text(shipment.booking)].filter(Boolean),
      origin: origin ? { name: origin } : null,
      destination: destination ? { name: destination } : null,
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
      additionalEvents: additionalEvents(shipment),
      warnings,
      businessVerified: record.meta?.business_verified === true,
      confidence: text(record.meta?.confidence),
      noBusinessData: query.status === "NO_BUSINESS_DATA",
      evidenceAvailable: Boolean(record.evidence?.screenshot_path || record.evidence?.text_path)
    }
  };
  // Endpoint names are summary facts, never fabricated milestone nodes.
  return { snapshot, raw: null, cached: false, sourceSchema: "tracking.v1" };
}

export function normalizeSourceDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return details;
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

export function normalizeTrackingPayload(payload) {
  if (payload?.snapshot && typeof payload.snapshot === "object") {
    if (!payload.snapshot.sourceDetails) return payload;
    return {
      ...payload,
      snapshot: {
        ...payload.snapshot,
        sourceDetails: normalizeSourceDetails(payload.snapshot.sourceDetails)
      }
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
