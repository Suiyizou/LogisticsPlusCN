/**
 * Per-carrier key-field rendering for tracking snapshots.
 *
 * Each carrier publishes a different subset of shipment facts: ONE returns four
 * milestones but no route, COSCO returns terminals plus client/PO references,
 * MSC returns declared-versus-returned container counts, Matson only returns a
 * delivery stamp. Rendering one shared field list therefore hides most of what
 * the carrier actually sent. This module declares, per carrier, which facts are
 * worth showing and how to read them from a normalized tracking.v1 snapshot.
 *
 * Pure functions only: no DOM, no network, no persistence.
 */

const LABEL = (zh, en) => ({ zh, en });
const same = (label) => LABEL(label, label);

const text = (value) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** Carrier timestamps arrive in mixed formats; keep the carrier's own wording. */
export function cleanCarrierTime(value) {
  const raw = text(value).replace(/\s+/g, " ");
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  const [date, time] = raw.replace("T", " ").split(" ");
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

const firstOf = (...values) => values.map(text).find(Boolean) || "";

function sourceFields(snapshot) {
  return list(snapshot?.sourceDetails?.fields);
}

/** First non-empty carrier source field with this key. */
export function carrierSourceField(snapshot, key) {
  const hit = sourceFields(snapshot).find(
    (field) => field?.key === key && text(field.value) && field.source !== "shipment.fields_extra"
  );
  const fallback = hit
    ? text(hit.value)
    : text(sourceFields(snapshot).find((field) => field?.key === key)?.value);
  return cleanCarrierTime(fallback);
}

function keyTime(snapshot, name) {
  const record = object(object(snapshot?.keyTimes)[name]);
  const time = cleanCarrierTime(record.actualTime || record.time);
  if (!time) return "";
  const location = text(record.location);
  return location && !time.includes(location) ? `${time} · ${location}` : time;
}

const CHROME_WORDS =
  /^(?:number|confirmed|n\/?a|none|null|unknown|—|-|search|track|tracking|no\.|booking no\.|bill of lading no\.)$/i;

/**
 * Scrapers sometimes capture page chrome instead of a reference ("Number",
 * "confirmed", "e.g. 0123…"). Such values must never be shown as a fact, and a
 * reference always carries a digit or a CJK character.
 */
export function safeCarrierText(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/e\.g\.,?/i.test(raw)) return "";
  if (!/[0-9]/.test(raw) && !/[\u4e00-\u9fff]/.test(raw)) return "";
  if (CHROME_WORDS.test(raw)) return "";
  return raw;
}

/**
 * Statuses and event names are words, not references: only page chrome is
 * rejected here, never the absence of a digit.
 */
export function safeCarrierLabel(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/e\.g\.,?/i.test(raw)) return "";
  if (CHROME_WORDS.test(raw)) return "";
  return raw;
}

function reference(snapshot, name) {
  const value = text(object(snapshot?.references)[name]);
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? "" : value;
}

const BILL_STATUS = /^(.*?)[\s(]*((?:B\/L|BL)\s*(?:Not\s*)?Ready)[)]?$/i;

/** COSCO and OOCL append a readiness note to the bill number; keep them apart. */
export function splitBillReference(value) {
  const raw = safeCarrierText(value).replace(/\s+/g, " ");
  if (!raw) return { number: "", status: "" };
  const match = raw.match(BILL_STATUS);
  if (!match) return { number: raw, status: "" };
  return { number: match[1].trim(), status: match[2].replace(/\s+/g, " ") };
}

function routeNode(snapshot, types, kind) {
  const wanted = new Set(types);
  const node = list(snapshot?.route).find((item) => wanted.has(text(item?.locationType).toUpperCase()));
  return node ? cleanCarrierTime(firstOf(node[kind])) : "";
}

function referenceInformation(snapshot, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const rows = list(object(snapshot?.references).information)
    .filter((row) => wanted.has(text(row?.name).toLowerCase()))
    .sort((left, right) => Number(left?.sequence ?? 999) - Number(right?.sequence ?? 999));
  return rows
    .map((row) => text(row.value))
    .filter(Boolean)
    .join(" · ");
}

function businessReference(snapshot, name) {
  return safeCarrierText(object(object(snapshot?.references).business)[name]);
}

function containerNumbers(snapshot, limit = 6) {
  const numbers = list(snapshot?.containers)
    .map((container) => text(container?.number))
    .filter(Boolean);
  if (!numbers.length) return "";
  const unique = [...new Set(numbers)];
  const shown = unique.slice(0, limit).join(" · ");
  return unique.length > limit ? `${shown} +${unique.length - limit}` : shown;
}

function containerMix(snapshot) {
  const counts = new Map();
  const add = (type, quantity) => {
    const key = text(type).toUpperCase();
    if (!key) return;
    const amount = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    counts.set(key, (counts.get(key) ?? 0) + amount);
  };
  const declaredRows = list(object(snapshot?.summary).containers);
  const declaredTypes = declaredRows.filter((row) =>
    text(row?.cntrType ?? row?.containerType ?? row?.type)
  );
  if (declaredTypes.length) {
    // A declared summary already carries quantities; never add per-container
    // rows on top of it or every type is counted twice.
    for (const row of declaredTypes) {
      add(row.cntrType ?? row.containerType ?? row.type, Number(row.quantity ?? 1));
    }
  } else {
    for (const container of list(snapshot?.containers)) {
      add(container?.type ?? container?.containerType, 1);
    }
  }
  return [...counts.entries()]
    .map(([type, count]) => `${type.length > 22 ? `${type.slice(0, 21)}…` : type} × ${count}`)
    .join(" · ");
}

function containerVolume(snapshot) {
  const counts = object(object(snapshot?.summary).containerCount);
  const declared = Number.isFinite(Number(counts.declared)) && counts.declared !== null
    ? Number(counts.declared)
    : null;
  const returned = list(snapshot?.containers).length || Number(counts.extracted) || 0;
  if (declared === null && !returned) return "";
  if (declared !== null && returned && declared !== returned) return `${declared} / ${returned}`;
  return String(declared ?? returned);
}

function latestEvent(snapshot) {
  const latest = object(object(snapshot?.summary).latestEvent);
  const name = text(latest.name);
  if (!name) return "";
  const time = cleanCarrierTime(latest.occurredAt || latest.reportedTime);
  return time ? `${name} · ${time}` : name;
}

/** Read only named, bounded source values. Unknown extensions remain in the
 * source disclosure; they must not become customer-facing labels by accident. */
function reportedValue(snapshot, keys) {
  for (const key of keys) {
    const field = sourceFields(snapshot).find((entry) => entry?.key === key && !entry.truncated);
    if (!field) continue;
    let value = field.rawText ?? field.value;
    if (field.structured) {
      try { value = JSON.parse(value); } catch { continue; }
    }
    if (Array.isArray(value)) {
      if (!value.every((entry) => typeof entry === "string" || typeof entry === "number")) continue;
      value = [...new Set(value.map(text).filter(Boolean))].slice(0, 30).join(" · ");
    } else if (value && typeof value === "object") {
      if ((key === "weight" || key.endsWith("_weight")) && text(value.value) && text(value.unit))
        value = `${text(value.value)} ${text(value.unit)}`;
      else continue;
    }
    value = safeCarrierLabel(value);
    if (value && value.length <= 1600) return value;
  }
  return "";
}

const REPORTED_CARGO = [
  ["containerType", LABEL("船司箱型描述", "Reported container type"), ["container_type"]],
  ["sealNumbers", LABEL("封条号", "Seal numbers"), ["seal_numbers", "seal_number", "seal"]],
  ["weight", LABEL("重量（船司原值）", "Weight as reported"), ["weight", "gross_weight", "cargo_weight"]],
  ["commodity", LABEL("货物描述", "Cargo description"), ["commodity", "cargo_description"]],
  ["service", LABEL("航线服务", "Service"), ["service", "service_name"]]
];

function reportedCargo(snapshot, language) {
  return REPORTED_CARGO.flatMap(([key, label, keys]) => {
    const value = reportedValue(snapshot, keys);
    // A per-container type is already shown in the main summary/table.
    if (!value || (key === "containerType" && list(snapshot?.containers).some((entry) => text(entry.type))))
      return [];
    return [{ key, label: label[language], value }];
  });
}

function labelledCarrierTimes(snapshot, language) {
  if (text(snapshot?.provider?.code).toUpperCase() !== "OOCL") return [];
  const seen = new Set();
  return list(snapshot?.events).flatMap((entry, index) => {
    const match = text(entry?.name).match(/^(ATA|ATD|Cargo Available):\s*([A-Z]{2,5})?$/i);
    if (!match || !text(entry.reportedTime)) return [];
    const kind = match[1].toUpperCase();
    const source = typeof entry.raw === "string" ? entry.raw.trim() : "";
    const value = source.replace(/^(?:ATA|ATD|Cargo Available):\s*/i, "") ||
      [text(entry.reportedTime), match[2]].filter(Boolean).join(" ");
    if (value.length > 240 || seen.has(kind + "|" + value)) return [];
    seen.add(kind + "|" + value);
    const label = kind === "CARGO AVAILABLE"
      ? (language === "en" ? "Cargo available (reported)" : "货物可用时间（船司报告）")
      : (language === "en" ? `Reported ${kind}` : `船司 ${kind} 时间`);
    return [{ key: `reportedTime${index}`, label, value }];
  });
}

function eventCount(snapshot) {
  const count = list(snapshot?.events).length;
  return count > 0 ? String(count) : "";
}

function carriedForward(snapshot, sourceNames) {
  for (const name of sourceNames) {
    const value = carrierSourceField(snapshot, name);
    if (value) return value;
  }
  return "";
}

const FACTS = {
  booking: (snapshot) =>
    list(object(snapshot?.references).bookingNumbers)
      .map((value) => safeCarrierText(value))
      .filter(Boolean)
      .join(", "),
  masterBill: (snapshot) => splitBillReference(reference(snapshot, "masterBill")).number,
  billStatus: (snapshot) => splitBillReference(reference(snapshot, "masterBill")).status,
  origin: (snapshot) => text(object(object(snapshot?.summary).origin).name),
  destination: (snapshot) => text(object(object(snapshot?.summary).destination).name),
  vesselVoyage: (snapshot) => {
    const value = text(object(snapshot?.summary).vesselVoyage);
    if (value) return value;
    const parts = [text(snapshot?.sourceDetails?.vessel), text(snapshot?.sourceDetails?.voyage)];
    return parts.filter(Boolean).join(" / ");
  },
  vessel: (snapshot) => text(snapshot?.sourceDetails?.vessel),
  voyage: (snapshot) => text(snapshot?.sourceDetails?.voyage),
  status: (snapshot) => safeCarrierLabel(object(snapshot?.summary).status),
  trafficTerm: (snapshot) => {
    const value = object(snapshot?.summary).trafficTerm;
    return text(value && typeof value === "object" ? value.value : value);
  },
  containerNumbers: (snapshot) => containerNumbers(snapshot),
  containerMix: (snapshot) => containerMix(snapshot),
  containerVolume: (snapshot) => containerVolume(snapshot),
  latestEvent: (snapshot) => latestEvent(snapshot),
  eventCount: (snapshot) => eventCount(snapshot),
  estimatedDeparture: (snapshot) =>
    firstOf(
      carrierSourceField(snapshot, "etd"),
      keyTime(snapshot, "estimatedDeparture"),
      routeNode(snapshot, ["FPOL", "POL", "POR"], "estimatedTime")
    ),
  estimatedArrival: (snapshot) =>
    firstOf(
      carrierSourceField(snapshot, "eta"),
      keyTime(snapshot, "estimatedArrival"),
      routeNode(snapshot, ["FND", "LPOD", "POD"], "estimatedTime")
    ),
  estimateEstimatedDeparture: (snapshot) => keyTime(snapshot, "estimatedDeparture"),
  estimateEstimatedArrival: (snapshot) => keyTime(snapshot, "estimatedArrival"),
  actualDeparture: (snapshot) =>
    firstOf(keyTime(snapshot, "actualDeparture"), routeNode(snapshot, ["FPOL", "POL"], "actualTime")),
  actualArrival: (snapshot) =>
    firstOf(keyTime(snapshot, "actualArrival"), routeNode(snapshot, ["FND", "LPOD", "POD"], "actualTime")),
  estimatedDelivery: (snapshot) => keyTime(snapshot, "estimatedDelivery"),
  pickup: (snapshot) => carriedForward(snapshot, ["milestone_pickup"]),
  departure: (snapshot) => carriedForward(snapshot, ["milestone_departure"]),
  arrival: (snapshot) => carriedForward(snapshot, ["milestone_arrival"]),
  delivery: (snapshot) => carriedForward(snapshot, ["milestone_delivery", "milestone_delivery_date"]),
  originDeparture: (snapshot) => carriedForward(snapshot, ["origin_departure"]),
  destinationArrival: (snapshot) => carriedForward(snapshot, ["destination_arrival"]),
  pol: (snapshot) => referenceInformation(snapshot, ["POL"]),
  pod: (snapshot) => referenceInformation(snapshot, ["POD"]),
  por: (snapshot) => referenceInformation(snapshot, ["POR"]),
  emptyPickup: (snapshot) => referenceInformation(snapshot, ["Empty Pick Up Facility"]),
  fullReturn: (snapshot) => referenceInformation(snapshot, ["Full Return Facility"]),
  clientCode: (snapshot) => safeCarrierLabel(object(object(snapshot?.references).business).clientNameCode),
  clientPo: (snapshot) => businessReference(snapshot, "clientPoNumber"),
  forwarderJob: (snapshot) => businessReference(snapshot, "forwarderJobNumber")
};

const field = (key, zh, en = zh) => ({ key, label: LABEL(zh, en) });

const TRANSPORT_STATES = {
  IN_TRANSIT: LABEL("运输中", "In transit"),
  RETURNED: LABEL("已返还", "Returned"),
  ON_BOARD: LABEL("已装船", "On board"),
  LOADED: LABEL("已装船", "Loaded"),
  DEPARTED: LABEL("已离港", "Departed"),
  ARRIVED: LABEL("已到港", "Arrived"),
  DISCHARGED: LABEL("已卸船", "Discharged"),
  DELIVERED: LABEL("已交付", "Delivered"),
  BOOKED: LABEL("已订舱", "Booked")
};

/**
 * Declarative per-carrier layout. `fields` reference FACTS keys; a field whose
 * value is empty is dropped at render time, so carriers that return little
 * cannot produce placeholder rows.
 */
const CARRIER_LAYOUTS = Object.freeze({
  ONE: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("booking", "订舱号", "Booking"), field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status")]
    },
    {
      id: "route",
      title: LABEL("航线与船期", "Route & schedule"),
      fields: [
        field("origin", "起运地", "Origin"),
        field("destination", "目的地", "Destination"),
        field("vessel", "船名", "Vessel"),
        field("voyage", "航次", "Voyage"),
        field("estimatedDeparture", "预计离港", "Estimated departure"),
        field("estimatedArrival", "预计到港", "Estimated arrival")
      ]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [
        field("containerVolume", "箱量（申报/返回）", "Containers"),
        field("containerNumbers", "箱号", "Container numbers")
      ]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [
        field("pickup", "提柜", "Empty pickup"),
        field("departure", "开船", "Departure"),
        field("arrival", "到港", "Arrival"),
        field("delivery", "还柜", "Empty return"),
        field("status", "船司状态", "Carrier status")
      ]
    }
  ],
  MAERSK: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"), field("booking", "订舱号", "Booking")]
    },
    {
      id: "route",
      title: LABEL("航线与船期", "Route & schedule"),
      fields: [
        field("origin", "起运地", "Origin"),
        field("destination", "目的地", "Destination"),
        field("vesselVoyage", "船名 / 航次", "Vessel / voyage"),
        field("estimatedDeparture", "预计离港", "Estimated departure"),
        field("estimatedArrival", "预计到港", "Estimated arrival")
      ]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [
        field("containerMix", "箱型箱量", "Container mix"),
        field("containerNumbers", "箱号", "Container numbers")
      ]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [
        field("latestEvent", "最新事件", "Latest event"),
        field("status", "船司状态", "Carrier status")
      ]
    }
  ],
  MSC: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"), field("booking", "订舱号", "Booking")]
    },
    {
      id: "route",
      title: LABEL("航线与船期", "Route & schedule"),
      fields: [
        field("origin", "起运地", "Origin"),
        field("destination", "目的地", "Destination"),
        field("estimatedArrival", "预计到港", "Estimated arrival"),
        field("estimatedDeparture", "预计离港", "Estimated departure")
      ]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [
        field("containerVolume", "箱量（申报/返回）", "Containers"),
        field("containerMix", "箱型箱量", "Container mix"),
        field("containerNumbers", "箱号", "Container numbers")
      ]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [field("latestEvent", "最新事件", "Latest event"), field("status", "船司状态", "Carrier status")]
    }
  ],
  MATSON: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"), field("booking", "订舱号", "Booking")]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [field("containerNumbers", "箱号", "Container numbers"), field("containerVolume", "箱量", "Containers")]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [
        field("delivery", "交付时间", "Delivered at"),
        field("arrival", "到港", "Arrival"),
        field("status", "船司状态", "Carrier status"),
        field("latestEvent", "最新事件", "Latest event")
      ]
    }
  ],
  OOCL: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"), field("booking", "订舱号", "Booking")]
    },
    {
      id: "route",
      title: LABEL("航线与船期", "Route & schedule"),
      fields: [
        field("origin", "起运地", "Origin"),
        field("destination", "目的地", "Destination"),
        field("vessel", "船名", "Vessel"),
        field("voyage", "航次", "Voyage")
      ]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [
        field("containerVolume", "箱量（申报/返回）", "Containers"),
        field("containerNumbers", "箱号", "Container numbers")
      ]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [field("status", "船司状态", "Carrier status"), field("eventCount", "事件条数", "Events")]
    }
  ],
  COSCO: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [
        field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"),
        field("booking", "订舱号", "Booking"),
        field("trafficTerm", "交接条款", "Traffic terms")
      ]
    },
    {
      id: "business",
      title: LABEL("客户与业务", "Client & business"),
      fields: [
        field("clientCode", "客户名称代码", "Client name code"),
        field("clientPo", "客户 PO 号", "Client PO"),
        field("forwarderJob", "货代作业号", "Forwarder job")
      ]
    },
    {
      id: "route",
      title: LABEL("港口与码头", "Ports & terminals"),
      fields: [
        field("pol", "起运港 POL", "POL"),
        field("pod", "目的港 POD", "POD"),
        field("por", "收货地 POR", "POR"),
        field("emptyPickup", "提空箱点", "Empty pickup facility"),
        field("fullReturn", "还重箱点", "Full return facility")
      ]
    },
    {
      id: "milestones",
      title: LABEL("船期与节点", "Schedule & milestones"),
      fields: [
        field("estimatedDeparture", "预计离港", "Estimated departure"),
        field("actualDeparture", "实际离港", "Actual departure"),
        field("estimatedArrival", "预计到港", "Estimated arrival"),
        field("actualArrival", "实际到港", "Actual arrival"),
        field("estimatedDelivery", "预计交付", "Estimated delivery")
      ]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [
        field("containerMix", "箱型箱量", "Container mix"),
        field("containerNumbers", "箱号", "Container numbers")
      ]
    }
  ],
  CMA: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("booking", "订舱号", "Booking"), field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status")]
    },
    {
      id: "route",
      title: LABEL("航线与船期", "Route & schedule"),
      fields: [field("origin", "起运地", "Origin"), field("destination", "目的地", "Destination")]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [field("containerNumbers", "箱号", "Container numbers"), field("containerVolume", "箱量", "Containers")]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [
        field("status", "船司状态", "Carrier status"),
        field("latestEvent", "最新事件", "Latest event"),
        field("eventCount", "事件条数", "Events")
      ]
    }
  ],
  HAPAG_LLOYD: [
    {
      id: "reference",
      title: LABEL("订舱与参考", "Booking & references"),
      fields: [field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"), field("booking", "订舱号", "Booking")]
    },
    {
      id: "route",
      title: LABEL("航线与船期", "Route & schedule"),
      fields: [
        field("origin", "起运地", "Origin"),
        field("destination", "目的地", "Destination"),
        field("vessel", "船名", "Vessel")
      ]
    },
    {
      id: "containers",
      title: LABEL("箱与货物", "Containers"),
      fields: [field("containerNumbers", "箱号", "Container numbers"), field("containerVolume", "箱量", "Containers")]
    },
    {
      id: "milestones",
      title: LABEL("节点里程碑", "Milestones"),
      fields: [
        field("arrival", "到港", "Arrival"),
        field("status", "船司状态", "Carrier status"),
        field("latestEvent", "最新事件", "Latest event")
      ]
    }
  ]
});

/** Carriers without a dedicated layout still get the shared fact sheet. */
const DEFAULT_LAYOUT = Object.freeze([
  {
    id: "reference",
    title: LABEL("订舱与参考", "Booking & references"),
    fields: [field("masterBill", "提单号", "B/L"), field("billStatus", "提单状态", "B/L status"), field("booking", "订舱号", "Booking")]
  },
  {
    id: "route",
    title: LABEL("航线与船期", "Route & schedule"),
    fields: [
      field("origin", "起运地", "Origin"),
      field("destination", "目的地", "Destination"),
      field("vesselVoyage", "船名 / 航次", "Vessel / voyage"),
      field("estimatedDeparture", "预计离港", "Estimated departure"),
      field("estimatedArrival", "预计到港", "Estimated arrival")
    ]
  },
  {
    id: "containers",
    title: LABEL("箱与货物", "Containers"),
    fields: [
      field("containerVolume", "箱量", "Containers"),
      field("containerNumbers", "箱号", "Container numbers")
    ]
  },
  {
    id: "milestones",
    title: LABEL("节点里程碑", "Milestones"),
    fields: [
      field("latestEvent", "最新事件", "Latest event"),
      field("status", "船司状态", "Carrier status")
    ]
  }
]);

export function carrierLayout(code) {
  return CARRIER_LAYOUTS[text(code).toUpperCase()] ?? DEFAULT_LAYOUT;
}

/**
 * Build the render model: groups of label/value rows for this carrier only,
 * with every empty value removed.
 */
export function carrierKeyFacts(snapshot, language = "zh") {
  const key = language === "en" ? "en" : "zh";
  const code = text(snapshot?.provider?.code).toUpperCase();
  const groups = [];
  for (const group of carrierLayout(code)) {
    const items = [];
    for (const entry of group.fields) {
      const read = FACTS[entry.key];
      if (!read) continue;
      let value = "";
      try {
        value = read(snapshot);
      } catch {
        value = "";
      }
      value = text(value);
      if (!value || CHROME_WORDS.test(value)) continue;
      if (entry.key === "status") {
        if (/^(?:QUERY_COMPLETED|HUMAN_REQUIRED|NO_BUSINESS_DATA|FAILED|ERROR|BLOCKED)$/i.test(value)) continue;
        value = TRANSPORT_STATES[value.toUpperCase()]?.[key] || value;
      }
      if (items.some((item) => item.key === entry.key)) continue;
      items.push({ key: entry.key, label: entry.label[key], value });
    }
    if (items.length) groups.push({ id: group.id, title: group.title[key], items });
  }
  const cargo = reportedCargo(snapshot, key);
  if (cargo.length) {
    const existing = groups.find((group) => group.id === "containers");
    if (existing) existing.items.push(...cargo);
    else groups.push({ id: "containers", title: key === "en" ? "Cargo information" : "货物信息", items: cargo });
  }
  const reportedTimes = labelledCarrierTimes(snapshot, key);
  if (reportedTimes.length)
    groups.push({ id: "reported-times", title: key === "en" ? "Carrier-reported times" : "船司报告时间", items: reportedTimes });
  return groups;
}

/** Short provenance line, so a thin result never looks like a system fault. */
export function carrierFactsProvenance(snapshot, language = "zh") {
  const details = object(snapshot?.sourceDetails);
  const status = text(details.queryStatus);
  if (status === "HUMAN_REQUIRED")
    return language === "en" ? "The carrier requires verification before this query can finish." : "船司要求完成验证后才能继续查询。";
  if (details.noBusinessData === true || status === "NO_BUSINESS_DATA")
    return language === "en" ? "The carrier returned no matching shipment data." : "船司未返回匹配的物流数据。";
  if (/ERROR|FAILED|BLOCKED/.test(status))
    return language === "en" ? "This carrier query has not completed." : "本次船司查询尚未完成。";
  return "";
}
