/** Compatibility shared by saved customer snapshots and read-only JSON previews. */
const privateKeys = new Set([
  "meta", "metadata", "evidence", "provenance", "cookie", "cookies", "setcookie", "authorization",
  "headers", "password", "token", "accesstoken", "refreshtoken", "sessiontoken",
  "idtoken", "apikey", "secret", "clientsecret"
]);
const omitted = Symbol("private tracking value");
const localPath = /(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\|file:|\/(?!\/)[A-Za-z0-9_.-]+\/)/;
const scalar = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const list = (value) => Array.isArray(value) ? value : [];
export function publicTrackingKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  return !privateKeys.has(normalized) && !normalized.includes("artifact") && !/paths?$/.test(normalized);
}
export function sanitizeTrackingData(value) {
  const visit = (entry) => {
    if (Array.isArray(entry)) return entry.map(visit).filter((item) => item !== omitted);
    if (entry && typeof entry === "object") {
      if (typeof entry.key === "string" && !publicTrackingKey(entry.key)) return omitted;
      return Object.fromEntries(Object.entries(entry).flatMap(([key, item]) => {
        if (!publicTrackingKey(key)) return [];
        const clean = visit(item);
        return clean === omitted ? [] : [[key, clean]];
      }));
    }
    if (typeof entry === "string") {
      if (/^[\s]*[\[{]/.test(entry)) {
        try {
          const parsed = JSON.parse(entry);
          if (parsed && typeof parsed === "object") {
            const clean = visit(parsed);
            if (clean === omitted) return omitted;
            return JSON.stringify(clean) === JSON.stringify(parsed) ? entry : JSON.stringify(clean);
          }
        } catch { /* Carrier text need not be JSON. */ }
      }
      if (localPath.test(entry)) return omitted;
    }
    return entry;
  };
  const result = visit(value);
  return result === omitted ? null : result;
}

const sourceKinds = new Set(["PAGE_TEXT", "PAGE_OVERVIEW", "PAGE_DETAIL", "PAGE_DETAILS", "PDF_DOWNLOAD", "PDF_TEXT"]);
const count = (value) => Number.isInteger(value) && value >= 0 ? value : null;
const uniqueCount = (values) => new Set(list(values).map(scalar).filter(Boolean)).size;
export function normalizeDetailCapture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = scalar(value.status).toLowerCase();
  if (!["captured", "partial", "overview_only", "unverified"].includes(status)) return null;
  const coverage = value.coverage || {};
  return {
    status,
    scopeComplete: value.scopeComplete === true || coverage.scope_complete === true,
    declaredContainers: count(value.declaredContainers ?? coverage.declared_containers),
    overviewCount: count(value.overviewCount) ?? uniqueCount(coverage.overview_containers),
    detailedCount: count(value.detailedCount) ?? uniqueCount(coverage.detailed_containers),
    pendingCount: count(value.pendingCount) ?? uniqueCount(coverage.pending_containers),
    sourceKinds: [...new Set(list(value.sourceKinds ?? list(value.sources).map((source) => source?.kind))
      .map(scalar).filter((kind) => sourceKinds.has(kind)))]
  };
}
export function detailCaptureLabel(snapshot, language = "zh") {
  const capture = normalizeDetailCapture(snapshot?.sourceDetails?.detailCapture);
  if (!capture || capture.status === "unverified") return "";
  const en = language === "en";
  const expected = capture.declaredContainers ?? capture.overviewCount;
  if (capture.detailedCount > 0 && expected >= capture.detailedCount) {
    const label = en ? `Read details for ${capture.detailedCount}/${expected} containers` : `已读取 ${capture.detailedCount}/${expected} 箱详情`;
    const partial = capture.pendingCount > 0 || capture.detailedCount < expected;
    return label + (partial ? (en ? " · Some details unavailable" : " · 部分详情未读取") :
      capture.status === "partial" ? (en ? " · Some additional information unavailable" : " · 部分补充信息未取得") : "");
  }
  return en ? "Some container details unavailable" : "部分详情未读取";
}

export function eventVesselLabel(event, language = "zh") {
  const details = event?.vesselDetails || {};
  return [scalar(event?.vesselName), scalar(event?.voyage),
    scalar(details.imo) ? `IMO ${scalar(details.imo)}` : "",
    scalar(details.flag), scalar(details.built) ? `${language === "en" ? "Built" : "建造年份"} ${scalar(details.built)}` : ""]
    .filter(Boolean).join(" · ");
}
export function eventTerminalLabel(event) {
  const details = event?.terminalDetails || {};
  return [scalar(event?.terminal), ...["smdg", "firms", "bic"].flatMap((key) =>
    scalar(details[key]) ? [`${key.toUpperCase()} ${scalar(details[key])}`] : [])].filter(Boolean).join(" · ");
}
export function eventLoadLabel(event, language = "zh") {
  if (event?.loadStatus === "EMPTY") return language === "en" ? "Empty" : "空箱";
  if (event?.loadStatus === "LADEN") return language === "en" ? "Laden" : "重箱";
  return "";
}
export function reportedTimeLabel(value, timezone) {
  const time = scalar(value).replace(/(\d{4}-\d{2}-\d{2})T(?=\d)/, "$1 ");
  const zone = scalar(timezone);
  if (!time) return "—";
  return zone && !time.toUpperCase().endsWith(zone.toUpperCase()) ? `${time} ${zone}` : time;
}

const eventPresentations = [
  ["Gate out empty from depot", "提空", "Empty pickup", "origin"],
  ["Ready to be loaded", "待装船", "Ready for loading", "waypoint"],
  ["Loaded on board", "装船", "Loaded", "departure"],
  ["Vessel Departure", "离港", "Vessel departure", "departure"],
  ["Vessel Arrival", "到港", "Vessel arrival", "arrival"],
  ["Discharged from Vessel", "卸船", "Discharged", "arrival"],
  ["Gate out to consignee", "提货", "Cargo pickup", "destination"],
  ["Gate in empty at Depot", "还空箱", "Empty return", "destination"]
];
/** A display vocabulary only. It never changes a node's time or evidence. */
export function progressEventPresentation(node, language = "zh") {
  if (node?.semanticKind !== "CARRIER_REPORTED") return null;
  const event = scalar(node.event).toLowerCase();
  const entry = eventPresentations.find(([source]) => source.toLowerCase() === event);
  return entry ? { label: language === "en" ? entry[2] : entry[1], icon: entry[3] } : null;
}
export function routeLocationLabel(node) {
  let city = scalar(node?.city);
  const country = scalar(node?.countryCode);
  if (country && /^[A-Z]{2}$/i.test(country)) {
    const suffix = new RegExp(`(?:\\s*\\(${country}\\)|,\\s*${country})$`, "i");
    city = city.replace(suffix, "").trim();
  }
  return [city, country].filter(Boolean).join(", ");
}

export function reportedSeal(value) {
  const seal = scalar(value);
  return /[*•]/.test(seal) ? "" : seal;
}
function sourceMeasurement(value) {
  if (!value || typeof value !== "object") return scalar(value);
  const raw = scalar(value.raw), unit = scalar(value.unit), number = scalar(value.value);
  return raw ? (unit && !raw.toUpperCase().includes(unit.toUpperCase()) ? `${raw} ${unit}` : raw) : [number, unit].filter(Boolean).join(" ");
}
function usefulBusinessText(value) {
  const text = scalar(value), normalized = text.replace(/\s+/g, " ");
  return /click to check/i.test(normalized) || /^(?:N\/?A|Not Applicable|[-—–]+)$/i.test(normalized) ? "" : text;
}
function oneReleaseFacts(release, language) {
  const en = language === "en";
  return [
    ["obl_received", "O/BL 收讫时间（船司报告）", "O/BL received time (reported)"],
    ["ocean_freight_collection", "海运费收取时间（船司报告）", "Ocean freight collection time (reported)"],
    ["customs_clearance", "海关清关时间（船司报告）", "Customs clearance time (reported)"],
    ["importer_security_filing", "ISF 申报时间（船司报告）", "ISF filing time (reported)"],
    ["firms_code_port_of_discharging", "卸货港 FIRMS 代码", "Port of discharge FIRMS code"],
    ["firms_code_place_of_delivery", "交货地 FIRMS 代码", "Place of delivery FIRMS code"]
  ].flatMap(([key, zh, english]) => {
    const value = usefulBusinessText(release?.[key]);
    return value ? [{ key: `release.${key}`, label: en ? english : zh, value }] : [];
  });
}
export function containerBusinessFacts(container, language = "zh") {
  const en = language === "en", extra = container?.extra || {};
  const rows = [];
  const add = (key, zh, english, value) => {
    const text = scalar(value);
    if (text) rows.push({ key, label: en ? english : zh, value: text });
  };
  add("seal", "封条号", "Seal number", reportedSeal(extra.seal || extra.seal_number));
  add("serviceType", "服务类型", "Service type", extra.service_type || extra.service_term || extra.move_type);
  add("quantity", "货物件数（船司原值）", "Cargo quantity as reported", extra.quantity_raw ?? extra.cartons ?? extra.packages);
  add("measurement", "体积（船司原值）", "Measurement as reported", extra.measurement_raw ?? extra.measurement);
  const vgm = extra.vgm || extra.verified_gross_mass;
  add("vgm", "VGM（船司原值）", "VGM as reported", typeof vgm === "object" && vgm ?
    [sourceMeasurement(vgm), scalar(vgm.method) ? `${en ? "Method" : "方法"} ${scalar(vgm.method)}` : ""].filter(Boolean).join(" · ") : vgm);
  add("cargoGross", "货物毛重（船司原值）", "Cargo gross weight as reported", extra.reported_cargo_gross_weight_raw || sourceMeasurement(extra.gross_weight));
  add("reportedWeight", "重量（船司原值）", "Weight as reported", extra.reported_weight_raw);
  add("netWeight", "箱内净重（船司原值）", "Net container weight as reported", sourceMeasurement(extra.net_container_weight));
  add("billNumber", "关联提单号", "Associated bill number", extra.bill_number);
  add("billStatus", "提单状态", "Bill status", extra.bill_status);
  add("emptyReturn", "还空箱场站", "Empty return facility", extra.empty_return_facility);
  add("emptyPickup", "空箱提取场站", "Empty pickup facility", extra.empty_pickup_facility);
  const lfd = extra.terminal_last_free_date;
  add("terminalLfd", "码头最后免费日（船司报告）", "Terminal last free date (carrier reported)",
    lfd ? [scalar(lfd.date_raw || lfd.date), scalar(lfd.place)].filter(Boolean).join(" · ") : "");
  const detention = extra.detention;
  if (detention?.basis === "TARIFF_STANDARD_REFERENCE" && detention.guaranteed === false && detention.contract_terms_prevail === true) {
    add("freeTimeReference", "标准费率免箱期参考（合同条款优先，非保证）", "Standard tariff free-time reference (contract terms prevail; not guaranteed)",
      [scalar(detention.last_free_day_raw || detention.last_free_day), scalar(detention.free_time_raw)].filter(Boolean).join(" · "));
  }
  rows.push(...oneReleaseFacts(extra.cargo_release, language));
  return rows;
}

function sourceObject(snapshot, key) {
  const business = snapshot?.sourceDetails?.businessExtras;
  if (key === "extra" && business && typeof business === "object" && !Array.isArray(business) && Object.keys(business).length)
    return business;
  const direct = snapshot?.sourceDetails?.extraFields?.[key];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
  const field = list(snapshot?.sourceDetails?.fields).find((entry) => entry?.key === key && !entry.truncated && /(?:^|\.)fields_extra$/.test(entry.source || ""));
  if (!field) return {};
  if (field.value && typeof field.value === "object") return field.value;
  try {
    const value = JSON.parse(field.rawText || field.value);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function shipmentBusinessFactGroups(snapshot, language = "zh") {
  const en = language === "en", release = sourceObject(snapshot, "evergreen_release");
  const rows = [
    ["carrier_status", "放货状态", "Release status"], ["freight_status", "运费状态", "Freight status"],
    ["bill_type", "提单类型", "Bill type"], ["bill_date_raw", "提单日期", "Bill date"],
    ["customs_status", "海关状态", "Customs status"], ["customs_description", "海关说明", "Customs information"],
    ["customs_date_raw", "海关更新时间", "Customs update time"]
  ].flatMap(([key, zh, english]) => usefulBusinessText(release[key]) ? [{ key, label: en ? english : zh, value: usefulBusinessText(release[key]) }] : []);
  const pickup = sourceObject(snapshot, "evergreen_pickup_reference");
  const items = [
    ["terminal", en ? "Pickup terminal" : "提货码头", usefulBusinessText(pickup.terminal_name)],
    ["address", en ? "Pickup address" : "提货地址", [pickup.address, pickup.city, pickup.state, pickup.postal_code].map(usefulBusinessText).filter(Boolean).join(", ")]
  ].flatMap(([key, label, value]) => value ? [{ key, label, value }] : []);
  const generic = sourceObject(snapshot, "extra");
  const extraRows = [
    ["packages", "货物件数（船司原值）", "Cargo quantity as reported"], ["measurement", "体积（船司原值）", "Measurement as reported"],
    ["gross_cargo_weight", "货物毛重（船司原值）", "Cargo gross weight as reported"],
    ["service_requirement", "运输服务要求", "Service requirement"], ["carrier_release_status", "船司放货状态", "Carrier release status"],
    ["customs_status", "海关状态", "Customs status"], ["ace_status", "ACE 状态", "ACE status"],
    ["aci_status", "ACI 状态", "ACI status"], ["isf_status", "ISF 状态", "ISF status"]
  ].flatMap(([key, zh, english]) => scalar(generic[key]) ? [{ key, label: en ? english : zh, value: scalar(generic[key]) }] : []);
  const customs = list(generic.customs_history).flatMap((entry, index) => {
    const value = [entry["Code Activity"], entry["District Port"], entry["Entry Number"], entry.Remarks].map(scalar).filter(Boolean).join(" · ");
    return value ? [{ key: `customs${index}`, label: [entry["Date/Time"], entry.Event].map(scalar).filter(Boolean).join(" · "), value }] : [];
  });
  const oneByContainer = new Map();
  const knownContainers = new Set(list(snapshot?.containers).map((container) => scalar(container.number)).filter(Boolean));
  for (const container of list(snapshot?.containers)) {
    if (container.extra?.cargo_release && knownContainers.has(container.number))
      oneByContainer.set(container.number, container.extra.cargo_release);
  }
  for (const release of list(generic.one_release)) {
    const number = scalar(release?.container_number);
    if (knownContainers.has(number) && !oneByContainer.has(number)) oneByContainer.set(number, release);
  }
  const oneRows = [...oneByContainer].flatMap(([number, release]) => oneReleaseFacts(release, language)
    .map((fact) => ({ ...fact, key: `${number}.${fact.key}`, label: `${number} · ${fact.label}` })));
  const hmmRows = [];
  const hmmReturn = [];
  if (scalar(snapshot?.provider?.code).toUpperCase() === "HMM") {
    const deliveryLabels = {
      "original b/l": ["提单收讫（船司原报）", "Original B/L received (as reported)"],
      "us custom": ["美国海关放行（船司原报）", "US customs release (as reported)"],
      "firms code": ["FIRMS 代码", "FIRMS code"]
    };
    for (const row of list(generic.cargo_delivery)) {
      if (!Array.isArray(row)) continue;
      const key = scalar(row[0]).replace(/\s+/g, " ").toLowerCase(), label = deliveryLabels[key];
      const value = usefulBusinessText(row[1]);
      if (label && value) hmmRows.push({ key, label: en ? label[1] : label[0], value });
    }
    const locations = generic.empty_return_locations;
    // The customer privacy projection removes the generic `headers` key. The
    // exact worker field still has its fixed [return facility, address] shape.
    const headers = list(locations?.headers).map((header) => scalar(header).toLowerCase());
    const locationRows = list(locations?.rows);
    if (locationRows.length && (!headers.length || JSON.stringify(headers) === JSON.stringify(["empty container return location", "address"])) &&
        locationRows.every((row) => Array.isArray(row) && row.length === 2 &&
          row.every((cell) => cell == null || typeof cell === "string" || typeof cell === "number"))) {
      locationRows.forEach((row, index) => {
        if (!Array.isArray(row)) return;
        const value = row.slice(0, 2).map(usefulBusinessText).filter(Boolean).join(" · ");
        if (value) hmmReturn.push({ key: `emptyReturn${index}`, label: en ? "Empty return facility / address (reported)" : "还空箱场站 / 地址（船司报告）", value });
      });
    }
  }
  return [
    ...(rows.length ? [{ id: "release", title: en ? "Release and customs" : "放货与海关信息", items: rows }] : []),
    ...(items.length ? [{ id: "pickup", title: en ? "Pickup information" : "提货信息", items }] : []),
    ...(extraRows.length ? [{ id: "cargo-release", title: en ? "Cargo and release information" : "货物与放货信息", items: extraRows }] : []),
    ...(customs.length ? [{ id: "customs-records", title: en ? "Customs records (carrier reported)" : "海关记录（船司报告）", items: customs }] : []),
    ...(oneRows.length ? [{ id: "container-release", title: en ? "Container release information" : "逐箱放货信息", items: oneRows }] : []),
    ...(hmmRows.length ? [{ id: "bill-customs-release", title: en ? "Bill and customs release" : "提单与海关放行信息", items: hmmRows }] : []),
    ...(hmmReturn.length ? [{ id: "empty-return-location", title: en ? "Empty return information" : "还空箱信息", items: hmmReturn }] : [])
  ];
}
