const form = document.querySelector("#tracking-form");
const submitButton = document.querySelector("#submit-button");
const carrierSelect = document.querySelector("#carrier-select");
const trackingType = document.querySelector("#tracking-type");
const trackingNumber = document.querySelector("#tracking-number");
const carrierNotice = document.querySelector("#carrier-notice");
const sourceTag = document.querySelector("#source-tag");
const emptyState = document.querySelector("#empty-state");
const results = document.querySelector("#results");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");
const channelState = document.querySelector("#channel-state");
const channelStatusText = document.querySelector("#channel-status-text");
const overviewMonitorStatus = document.querySelector("#overview-monitor-status");
const activeViewTitle = document.querySelector("#active-view-title");
const historyEmpty = document.querySelector("#history-empty");
const historyTableWrap = document.querySelector("#history-table-wrap");
const historyTableBody = document.querySelector("#history-table-body");
const clearHistoryButton = document.querySelector("#clear-history-button");

const CACHE_VERSION = 2;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_LIMIT = 20;
const CACHE_PREFIX = "shipment-track:v2:";
const CACHE_INDEX_KEY = "shipment-track:v2:index";
const LEGACY_CACHE_INDEX_KEY = "shipment-track:v1:C:index";
const MIGRATION_KEY = "shipment-track:v2:migrated";
const LANGUAGE_KEY = "shipment-track:language";

const CARRIERS = Object.freeze({
  COSCO: {
    code: "COSCO",
    name: "COSCO SHIPPING",
    enabled: true,
    source: "COSCO · PUBLIC WEB"
  },
  CMA: {
    code: "CMA",
    name: "CMA CGM",
    enabled: false,
    source: "CMA CGM · ADAPTER RESERVED"
  }
});

const TYPE_KEYS = Object.freeze({
  BILLOFLADING: "type.bill",
  BOOKING: "type.booking",
  CONTAINER: "type.container"
});

const MESSAGES = {
  en: {
    "meta.title": "Shipment Track · Carrier Intelligence",
    "meta.description": "A unified multi-carrier shipment tracking workspace",
    "brand.subtitle": "Carrier intelligence desk",
    "nav.ariaLabel": "Primary navigation",
    "nav.workspace": "Workspace",
    "nav.overview": "Overview",
    "nav.tracking": "Shipment tracking",
    "nav.carriers": "Carrier adapters",
    "carrier.connected": "Connected · Channel C",
    "carrier.planned": "Adapter reserved",
    "carrier.cmaOption": "CMA CGM · COMING SOON",
    "carrier.cmaNotice": "CMA CGM is selectable, but its adapter is not connected yet.",
    "sidebar.architecture": "UNIFIED ADAPTER",
    "breadcrumb.workspace": "Workspace",
    "overview.kicker": "OPERATIONS OVERVIEW",
    "overview.title": "Every shipment, one calm view.",
    "overview.description": "Revisit recent searches, monitor carrier availability and continue where you left off.",
    "overview.startTracking": "Track a shipment",
    "overview.savedSearches": "Saved searches",
    "overview.carriersUsed": "Carriers used",
    "overview.lastUpdated": "Last updated",
    "overview.monitoring": "Carrier monitoring",
    "overview.noRecords": "No records",
    "history.title": "Recent searches",
    "history.subtitle": "Stored on this browser for 24 hours",
    "history.clear": "Clear history",
    "history.emptyTitle": "No shipment history yet",
    "history.emptyDescription": "Your successful searches will appear here.",
    "history.carrier": "Carrier",
    "history.reference": "Reference",
    "history.route": "Route",
    "history.latestStatus": "Latest status",
    "history.queriedAt": "Queried at",
    "history.open": "Open",
    "history.confirmClear": "Clear all locally saved shipment history?",
    "tracking.kicker": "SHIPMENT INTELLIGENCE",
    "tracking.title": "Shipment tracking",
    "tracking.description": "Query carrier sources and shape them into one consistent snapshot.",
    "query.carrier": "Carrier",
    "query.type": "Reference type",
    "query.number": "Reference number",
    "query.submit": "Track shipment",
    "query.helper": "Snapshots stay on this browser for 24 hours and refresh from the server.",
    "type.bill": "Bill of lading",
    "type.booking": "Booking number",
    "type.container": "Container number",
    "error.title": "Tracking request failed",
    "error.generic": "Tracking failed. Please try again.",
    "error.http": "Tracking failed (HTTP {status})",
    "error.localFallback": "{message} Showing the latest browser snapshot instead.",
    "empty.title": "Ready when you are",
    "empty.description": "Enter a bill, booking or container number to begin.",
    "metrics.actualDeparture": "Actual departure",
    "metrics.actualArrival": "Actual arrival",
    "metrics.estimatedDelivery": "Estimated final delivery",
    "metrics.latestEvent": "Latest event",
    "metrics.noLatestEvent": "No latest event",
    "route.title": "Route story",
    "route.origin": "Origin",
    "route.destination": "Destination",
    "route.nodes": "{count} nodes",
    "route.noNodes": "The carrier did not provide route nodes.",
    "route.unknownLocation": "Unknown location",
    "route.noEvent": "Event name not provided",
    "references.title": "Reference numbers",
    "references.masterBill": "Master bill",
    "references.booking": "Booking number",
    "references.external": "External / order references",
    "routing.title": "Routing legs",
    "routing.legs": "{count} legs",
    "routing.leg": "Leg",
    "routing.transport": "Mode / vessel",
    "routing.voyage": "Service / voyage",
    "routing.loadPort": "Load port",
    "routing.dischargePort": "Discharge port",
    "routing.estimatedDeparture": "Est. departure",
    "routing.actualDeparture": "Actual departure",
    "routing.estimatedArrival": "Est. arrival",
    "routing.actualArrival": "Actual arrival",
    "routing.masterBill": "Master bill",
    "routing.empty": "The carrier did not provide enough data to compose routing legs.",
    "containers.title": "Container details",
    "containers.count": "{count} containers",
    "containers.number": "Container",
    "containers.type": "Type",
    "containers.mode": "Mode",
    "containers.terms": "Terms",
    "containers.location": "Current location",
    "containers.status": "Latest status",
    "containers.time": "Status time",
    "containers.empty": "The carrier did not provide container-level details.",
    "raw.title": "Decoded source payload",
    "raw.cacheNotice": "The browser cache stores the unified snapshot only, not the carrier's raw payload.",
    "common.notProvided": "Not provided",
    "cache.live": "Live result",
    "cache.server": "Server cache",
    "cache.browser": "Browser cache",
    "cache.savedAt": "Saved {time}",
    "status.available": "Channel C available",
    "status.unavailable": "Channel C unavailable",
    "status.checking": "Channel C checking",
    "status.disabled": "Channel C monitor disabled",
    "status.unknown": "Channel C awaiting check",
    "status.shortAvailable": "Healthy",
    "status.shortUnavailable": "Unavailable",
    "status.shortChecking": "Checking",
    "status.shortDisabled": "Disabled",
    "status.shortUnknown": "Awaiting check",
    "status.lastCheck": "Last check: {time}",
    "status.nextCheck": "Next check: {time}",
    "status.error": "Error: {message}"
  },
  zh: {
    "meta.title": "Shipment Track · 船司货运工作台",
    "meta.description": "统一的多船司货运跟踪工作台",
    "brand.subtitle": "船司数据工作台",
    "nav.ariaLabel": "主导航",
    "nav.workspace": "工作区",
    "nav.overview": "总览",
    "nav.tracking": "货物跟踪",
    "nav.carriers": "船司适配器",
    "carrier.connected": "已接入 · 通道 C",
    "carrier.planned": "已预留适配器",
    "carrier.cmaOption": "CMA CGM · 即将接入",
    "carrier.cmaNotice": "已支持选择 CMA CGM，但查询适配器暂未接入。",
    "sidebar.architecture": "统一适配层",
    "breadcrumb.workspace": "工作台",
    "overview.kicker": "运营总览",
    "overview.title": "每一票货物，都清晰可见。",
    "overview.description": "回看最近查询、监控船司可用性，并从上次的位置继续工作。",
    "overview.startTracking": "查询一票货物",
    "overview.savedSearches": "已保存查询",
    "overview.carriersUsed": "已使用船司",
    "overview.lastUpdated": "最近更新",
    "overview.monitoring": "船司监控",
    "overview.noRecords": "暂无记录",
    "history.title": "最近查询",
    "history.subtitle": "在当前浏览器保存 24 小时",
    "history.clear": "清空记录",
    "history.emptyTitle": "还没有查询记录",
    "history.emptyDescription": "成功查询的货物会显示在这里。",
    "history.carrier": "船司",
    "history.reference": "查询号码",
    "history.route": "路线",
    "history.latestStatus": "最新状态",
    "history.queriedAt": "查询时间",
    "history.open": "打开",
    "history.confirmClear": "确定清空当前浏览器保存的全部查询记录吗？",
    "tracking.kicker": "货运信息",
    "tracking.title": "货物跟踪",
    "tracking.description": "查询船司数据源，并转换为统一的运输状态快照。",
    "query.carrier": "船司",
    "query.type": "查询类型",
    "query.number": "查询号码",
    "query.submit": "查询运输信息",
    "query.helper": "统一快照在本机保留 24 小时，同时从后端刷新最新数据。",
    "type.bill": "提单号",
    "type.booking": "订舱号",
    "type.container": "箱号",
    "error.title": "查询失败",
    "error.generic": "查询失败，请稍后重试。",
    "error.http": "查询失败（HTTP {status}）",
    "error.localFallback": "{message} 当前展示最近一次浏览器缓存结果。",
    "empty.title": "等待查询",
    "empty.description": "输入提单号、订舱号或箱号即可开始。",
    "metrics.actualDeparture": "实际离港",
    "metrics.actualArrival": "实际到港",
    "metrics.estimatedDelivery": "预计到达最终目的地",
    "metrics.latestEvent": "最新动态",
    "metrics.noLatestEvent": "暂无最新动态",
    "route.title": "路线详情",
    "route.origin": "起始地",
    "route.destination": "目的地",
    "route.nodes": "{count} 个节点",
    "route.noNodes": "船司未提供路线节点。",
    "route.unknownLocation": "未知地点",
    "route.noEvent": "船司未提供事件名称",
    "references.title": "参考号码",
    "references.masterBill": "主提单号",
    "references.booking": "订舱号",
    "references.external": "外部 / 订单参考号",
    "routing.title": "分段运输 Routing",
    "routing.legs": "{count} 段",
    "routing.leg": "段",
    "routing.transport": "运输 / 船名",
    "routing.voyage": "航线 / 航次",
    "routing.loadPort": "装载港",
    "routing.dischargePort": "卸载港",
    "routing.estimatedDeparture": "预计离港",
    "routing.actualDeparture": "实际离港",
    "routing.estimatedArrival": "预计到港",
    "routing.actualArrival": "实际到港",
    "routing.masterBill": "主提单",
    "routing.empty": "船司未提供可组成分段运输的数据。",
    "containers.title": "集装箱明细",
    "containers.count": "{count} 个箱",
    "containers.number": "箱号",
    "containers.type": "箱型",
    "containers.mode": "运输方式",
    "containers.terms": "运输条款",
    "containers.location": "当前位置",
    "containers.status": "最新状态",
    "containers.time": "状态时间",
    "containers.empty": "船司未提供箱级明细。",
    "raw.title": "原始解码结果",
    "raw.cacheNotice": "浏览器缓存仅保存统一快照，不保存船司原始报文。",
    "common.notProvided": "上游未提供",
    "cache.live": "实时查询",
    "cache.server": "服务端缓存",
    "cache.browser": "浏览器缓存",
    "cache.savedAt": "保存于 {time}",
    "status.available": "通道 C 可用",
    "status.unavailable": "通道 C 异常",
    "status.checking": "通道 C 检测中",
    "status.disabled": "通道 C 监控已停用",
    "status.unknown": "通道 C 等待检测",
    "status.shortAvailable": "监控正常",
    "status.shortUnavailable": "监控异常",
    "status.shortChecking": "正在检测",
    "status.shortDisabled": "监控停用",
    "status.shortUnknown": "等待检测",
    "status.lastCheck": "最近检测：{time}",
    "status.nextCheck": "下次检测：{time}",
    "status.error": "错误：{message}"
  }
};

const elements = Object.fromEntries(
  [
    "result-carrier",
    "result-type",
    "result-number",
    "cache-status",
    "fetched-at",
    "actual-departure",
    "actual-departure-location",
    "actual-arrival",
    "actual-arrival-location",
    "estimated-delivery",
    "estimated-delivery-location",
    "latest-event",
    "latest-event-detail",
    "origin-flag",
    "origin-name",
    "origin-code",
    "destination-flag",
    "destination-name",
    "destination-code",
    "route-count",
    "route-flow",
    "master-bill",
    "booking-numbers",
    "external-references",
    "reference-information",
    "routing-count",
    "routing-table-body",
    "container-count",
    "container-table-body",
    "raw-json",
    "history-total",
    "history-carriers",
    "history-last-updated"
  ].map((id) => [id, document.querySelector(`#${id}`)])
);

let currentLanguage = localStorage.getItem(LANGUAGE_KEY) === "zh" ? "zh" : "en";
let activeView = "overview";
let currentPayload = null;
let lastChannelStatus = { status: "unknown" };
let loading = false;

function t(key, variables = {}) {
  const template = MESSAGES[currentLanguage]?.[key] ?? MESSAGES.en[key] ?? key;
  return Object.entries(variables).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template
  );
}

function locale() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

function valueOrDash(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDateTime(value, timezone) {
  if (!value) return "—";
  const formatted = String(value).replace("T", " ");
  return timezone ? `${formatted} ${timezone}` : formatted;
}

function formatLocalDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function normalizeCountryCode(countryCode) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function setCountryFlag(element, countryCode) {
  const code = normalizeCountryCode(countryCode);
  element.className = `flag-icon${code ? ` flag-${code.toLowerCase()}` : " flag-generic"}`;
  element.textContent = code && !["CN", "US"].includes(code) ? code : "";
  element.title = code || t("route.unknownLocation");
  element.setAttribute("aria-label", code || t("route.unknownLocation"));
}

function createCountryFlag(countryCode) {
  const flag = document.createElement("i");
  setCountryFlag(flag, countryCode);
  return flag;
}

function trackingTypeLabel(type) {
  return t(TYPE_KEYS[type] ?? "type.bill");
}

function normalizeQuery(query) {
  return {
    carrier: String(query.carrier ?? "COSCO").trim().toUpperCase(),
    type: String(query.type ?? "BILLOFLADING").trim().toUpperCase(),
    number: String(query.number ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
  };
}

function cacheKey(query) {
  const normalized = normalizeQuery(query);
  return `${CACHE_PREFIX}${normalized.carrier}:${normalized.type}:${normalized.number}`;
}

function readCacheIndex() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeCacheIndex(keys) {
  localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(keys.slice(0, CACHE_LIMIT)));
}

function rememberCacheKey(key) {
  const keys = [key, ...readCacheIndex().filter((item) => item !== key)];
  for (const oldKey of keys.slice(CACHE_LIMIT)) localStorage.removeItem(oldKey);
  writeCacheIndex(keys);
}

function removeCacheKey(key) {
  try {
    localStorage.removeItem(key);
    writeCacheIndex(readCacheIndex().filter((item) => item !== key));
  } catch {
    // Browser storage may be disabled.
  }
}

function saveSnapshot(query, payload, savedAt = new Date().toISOString()) {
  if (!payload?.snapshot) return;
  const normalized = normalizeQuery(query);

  try {
    const key = cacheKey(normalized);
    localStorage.setItem(
      key,
      JSON.stringify({
        version: CACHE_VERSION,
        savedAt,
        query: normalized,
        snapshot: payload.snapshot
      })
    );
    rememberCacheKey(key);
  } catch {
    // A successful live query must still render when LocalStorage is unavailable.
  }
}

function readCacheEntry(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    const savedAt = Date.parse(stored?.savedAt ?? "");
    const valid =
      stored?.version === CACHE_VERSION &&
      stored?.query &&
      stored?.snapshot?.tracking &&
      stored?.snapshot?.summary &&
      Number.isFinite(savedAt) &&
      Date.now() - savedAt <= CACHE_TTL_MS;

    if (!valid) {
      if (stored) removeCacheKey(key);
      return null;
    }
    return stored;
  } catch {
    removeCacheKey(key);
    return null;
  }
}

function loadSnapshot(query) {
  const stored = readCacheEntry(cacheKey(query));
  if (!stored) return null;
  return {
    snapshot: stored.snapshot,
    raw: null,
    cached: false,
    browserCached: true,
    browserCachedAt: stored.savedAt
  };
}

function readHistory() {
  return readCacheIndex()
    .map((key) => readCacheEntry(key))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
}

function migrateLegacyCache() {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const legacyKeys = JSON.parse(localStorage.getItem(LEGACY_CACHE_INDEX_KEY) ?? "[]");
    if (Array.isArray(legacyKeys)) {
      for (const legacyKey of legacyKeys) {
        const stored = JSON.parse(localStorage.getItem(legacyKey) ?? "null");
        if (!stored?.snapshot?.tracking) continue;
        const query = {
          carrier: "COSCO",
          type: stored.snapshot.tracking.type,
          number: stored.snapshot.tracking.number
        };
        saveSnapshot(query, { snapshot: stored.snapshot }, stored.savedAt);
      }
    }
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch {
    // Migration is best-effort and never blocks the application.
  }
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = valueOrDash(value);
  if (className) cell.className = className;
  row.append(cell);
}

function setLoading(value) {
  loading = value;
  submitButton.classList.toggle("is-loading", loading);
  submitButton.disabled = loading || !CARRIERS[carrierSelect.value]?.enabled;
}

function showError(message) {
  errorMessage.textContent = message;
  errorPanel.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";
  errorPanel.hidden = true;
}

function renderRoute(route) {
  elements["route-flow"].replaceChildren();
  elements["route-flow"].style.setProperty("--route-columns", Math.max(route.length, 1));
  elements["route-count"].textContent = t("route.nodes", { count: route.length });

  if (route.length === 0) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = t("route.noNodes");
    elements["route-flow"].append(empty);
    return;
  }

  for (const node of route) {
    const item = document.createElement("article");
    item.className = `route-node${node.active ? " is-active" : ""}`;

    const dot = document.createElement("i");
    dot.className = "route-dot";

    const type = document.createElement("small");
    type.textContent = valueOrDash(node.locationType, `#${node.sequence}`);

    const city = document.createElement("strong");
    city.append(
      createCountryFlag(node.countryCode),
      document.createTextNode(
        [node.city, node.countryCode].filter(Boolean).join(", ") || t("route.unknownLocation")
      )
    );

    const event = document.createElement("span");
    event.textContent = valueOrDash(node.event, t("route.noEvent"));

    const time = document.createElement("time");
    time.textContent = formatDateTime(node.actualTime ?? node.estimatedTime, node.timezone);

    item.append(dot, type, city, event, time);
    elements["route-flow"].append(item);
  }
}

function renderRoutingLegs(legs) {
  const body = elements["routing-table-body"];
  body.replaceChildren();
  elements["routing-count"].textContent = t("routing.legs", { count: legs.length });

  if (legs.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.className = "table-empty";
    cell.textContent = t("routing.empty");
    row.append(cell);
    body.append(row);
    return;
  }

  for (const leg of legs) {
    const row = document.createElement("tr");
    appendCell(row, leg.sequence);
    appendCell(row, [leg.mode, leg.vesselName].filter(Boolean).join(" / "));
    appendCell(row, [leg.service, leg.voyage].filter(Boolean).join(" / "));
    const loadPort = document.createElement("td");
    loadPort.className = "port-cell";
    loadPort.append(createCountryFlag(leg.loadCountryCode), valueOrDash(leg.loadPort));
    row.append(loadPort);
    const dischargePort = document.createElement("td");
    dischargePort.className = "port-cell";
    dischargePort.append(
      createCountryFlag(leg.dischargeCountryCode),
      valueOrDash(leg.dischargePort)
    );
    row.append(dischargePort);
    appendCell(row, formatDateTime(leg.estimatedDeparture));
    appendCell(row, formatDateTime(leg.actualDeparture), "actual-time");
    appendCell(row, formatDateTime(leg.estimatedArrival));
    appendCell(row, formatDateTime(leg.actualArrival), "actual-time");
    appendCell(row, leg.masterBill);
    body.append(row);
  }
}

function renderReferences(references) {
  elements["master-bill"].textContent = valueOrDash(references.masterBill);
  elements["booking-numbers"].textContent =
    references.bookingNumbers?.length > 0 ? references.bookingNumbers.join(", ") : "—";

  if (references.external?.length > 0) {
    elements["external-references"].className = "";
    elements["external-references"].textContent = references.external.join(", ");
  } else {
    elements["external-references"].className = "missing-value";
    elements["external-references"].textContent = t("common.notProvided");
  }

  const list = elements["reference-information"];
  list.replaceChildren();
  const visible = (references.information ?? []).filter((item) => item.name && item.value);

  for (const information of visible) {
    const row = document.createElement("div");
    row.className = "reference-row";
    const name = document.createElement("span");
    name.textContent = information.name;
    const value = document.createElement("strong");
    value.textContent = information.value;
    row.append(name, value);
    list.append(row);
  }
}

function renderContainers(containers) {
  const body = elements["container-table-body"];
  body.replaceChildren();
  elements["container-count"].textContent = t("containers.count", { count: containers.length });

  if (containers.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "table-empty";
    cell.textContent = t("containers.empty");
    row.append(cell);
    body.append(row);
    return;
  }

  for (const container of containers) {
    const row = document.createElement("tr");
    appendCell(row, container.number);
    appendCell(row, container.type);
    appendCell(row, container.transportMode);
    appendCell(row, container.trafficTerm);
    appendCell(row, container.currentLocation);
    appendCell(row, container.latestEvent);
    appendCell(row, formatDateTime(container.latestEventTime));
    body.append(row);
  }
}

function renderResult(payload) {
  const snapshot = payload.snapshot;
  const summary = snapshot.summary;
  const keyTimes = snapshot.keyTimes ?? {};
  const latest = summary.latestEvent;
  const providerCode = snapshot.provider?.code ?? "COSCO";

  currentPayload = payload;
  elements["result-carrier"].textContent = providerCode;
  elements["result-type"].textContent = trackingTypeLabel(snapshot.tracking.type);
  elements["result-number"].textContent = snapshot.tracking.number;

  const source = payload.browserCached ? "browser" : payload.cached ? "server" : "live";
  elements["cache-status"].dataset.source = source;
  elements["cache-status"].textContent = t(`cache.${source}`);
  elements["cache-status"].title = payload.browserCachedAt
    ? t("cache.savedAt", { time: formatLocalDateTime(payload.browserCachedAt) })
    : "";
  elements["fetched-at"].textContent = formatLocalDateTime(snapshot.fetchedAt);

  elements["actual-departure"].textContent = formatDateTime(keyTimes.actualDeparture?.time);
  elements["actual-departure-location"].textContent = valueOrDash(
    keyTimes.actualDeparture?.location,
    t("common.notProvided")
  );
  elements["actual-arrival"].textContent = formatDateTime(keyTimes.actualArrival?.time);
  elements["actual-arrival-location"].textContent = valueOrDash(
    keyTimes.actualArrival?.location,
    t("common.notProvided")
  );
  elements["estimated-delivery"].textContent = formatDateTime(
    keyTimes.estimatedDelivery?.actualTime ?? keyTimes.estimatedDelivery?.time,
    keyTimes.estimatedDelivery?.timezone
  );
  elements["estimated-delivery-location"].textContent = valueOrDash(
    keyTimes.estimatedDelivery?.location,
    t("common.notProvided")
  );
  elements["latest-event"].textContent = valueOrDash(latest?.name, t("metrics.noLatestEvent"));
  elements["latest-event-detail"].textContent = [
    latest?.location,
    formatDateTime(latest?.occurredAt),
    latest?.transportMode
  ]
    .filter((item) => item && item !== "—")
    .join(" · ");

  setCountryFlag(elements["origin-flag"], summary.origin.countryCode);
  elements["origin-name"].textContent = valueOrDash(summary.origin.name);
  elements["origin-code"].textContent = valueOrDash(summary.origin.countryCode);
  setCountryFlag(elements["destination-flag"], summary.destination.countryCode);
  elements["destination-name"].textContent = valueOrDash(summary.destination.name);
  elements["destination-code"].textContent = valueOrDash(summary.destination.countryCode);

  renderRoute(snapshot.route ?? []);
  renderRoutingLegs(snapshot.routingLegs ?? []);
  renderReferences(snapshot.references ?? {});
  renderContainers(snapshot.containers ?? []);
  elements["raw-json"].textContent = payload.raw
    ? JSON.stringify(payload.raw, null, 2)
    : JSON.stringify({ notice: t("raw.cacheNotice"), snapshot }, null, 2);

  emptyState.hidden = true;
  results.hidden = false;
}

function renderHistory() {
  const history = readHistory();
  const carriers = new Set(history.map((entry) => entry.query.carrier));
  elements["history-total"].textContent = String(history.length);
  elements["history-carriers"].textContent = String(carriers.size);
  elements["history-last-updated"].textContent = history[0]
    ? formatLocalDateTime(history[0].savedAt)
    : t("overview.noRecords");

  historyEmpty.hidden = history.length > 0;
  historyTableWrap.hidden = history.length === 0;
  clearHistoryButton.hidden = history.length === 0;
  historyTableBody.replaceChildren();

  for (const entry of history) {
    const row = document.createElement("tr");
    const snapshot = entry.snapshot;
    const summary = snapshot.summary;

    const carrierCell = document.createElement("td");
    const carrier = document.createElement("span");
    carrier.className = "carrier-pill";
    carrier.textContent = entry.query.carrier;
    carrierCell.append(carrier);

    const referenceCell = document.createElement("td");
    referenceCell.className = "history-reference";
    const reference = document.createElement("strong");
    reference.textContent = entry.query.number;
    const type = document.createElement("small");
    type.textContent = trackingTypeLabel(entry.query.type);
    referenceCell.append(reference, type);

    const routeCell = document.createElement("td");
    const route = document.createElement("span");
    route.className = "history-route";
    const origin = document.createElement("b");
    setCountryFlag(origin, summary.origin?.countryCode);
    origin.title = valueOrDash(summary.origin?.name);
    const line = document.createElement("i");
    const destination = document.createElement("b");
    setCountryFlag(destination, summary.destination?.countryCode);
    destination.title = valueOrDash(summary.destination?.name);
    route.append(origin, line, destination);
    routeCell.append(route);

    const statusCell = document.createElement("td");
    statusCell.textContent = valueOrDash(summary.latestEvent?.name, t("metrics.noLatestEvent"));

    const timeCell = document.createElement("td");
    timeCell.textContent = formatLocalDateTime(entry.savedAt);

    const actionCell = document.createElement("td");
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "open-history-button";
    openButton.textContent = t("history.open");
    openButton.addEventListener("click", () => openHistoryEntry(entry));
    actionCell.append(openButton);

    row.append(carrierCell, referenceCell, routeCell, statusCell, timeCell, actionCell);
    historyTableBody.append(row);
  }
}

function updateCarrierUI({ resetResult = false } = {}) {
  const carrier = CARRIERS[carrierSelect.value] ?? CARRIERS.COSCO;
  sourceTag.textContent = carrier.source;
  carrierNotice.hidden = carrier.enabled;
  carrierNotice.textContent = carrier.enabled ? "" : t("carrier.cmaNotice");
  setLoading(loading);

  if (resetResult && currentPayload?.snapshot?.provider?.code !== carrier.code) {
    currentPayload = null;
    results.hidden = true;
    emptyState.hidden = false;
    clearError();
  }
}

function renderChannelStatus(status) {
  lastChannelStatus = status ?? { status: "unknown" };
  const state = lastChannelStatus.status ?? "unknown";
  channelState.dataset.status = state;
  channelStatusText.textContent = t(`status.${state}`);
  overviewMonitorStatus.textContent = t(`status.short${state[0].toUpperCase()}${state.slice(1)}`);
  channelState.title = [
    lastChannelStatus.lastCheckedAt
      ? t("status.lastCheck", { time: formatLocalDateTime(lastChannelStatus.lastCheckedAt) })
      : null,
    lastChannelStatus.nextCheckAt
      ? t("status.nextCheck", { time: formatLocalDateTime(lastChannelStatus.nextCheckAt) })
      : null,
    lastChannelStatus.lastError
      ? t("status.error", { message: lastChannelStatus.lastError })
      : null
  ]
    .filter(Boolean)
    .join("\n");
}

async function refreshChannelStatus() {
  try {
    const response = await fetch("/api/channels/c/status", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderChannelStatus(await response.json());
  } catch {
    renderChannelStatus({ status: "unknown" });
  }
}

function updateUrl(query) {
  const normalized = normalizeQuery(query);
  const url = new URL(window.location.href);
  url.searchParams.set("carrier", normalized.carrier);
  url.searchParams.set("type", normalized.type);
  url.searchParams.set("number", normalized.number);
  url.hash = "tracking";
  window.history.replaceState({}, "", url);
}

function showView(name, { updateLocation = true } = {}) {
  activeView = name === "tracking" ? "tracking" : "overview";
  document.querySelectorAll(".app-view").forEach((view) => {
    view.hidden = view.dataset.view !== activeView;
  });
  document.querySelectorAll("[data-view-target]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.viewTarget === activeView);
  });
  activeViewTitle.textContent = t(`nav.${activeView}`);

  if (updateLocation) {
    const url = new URL(window.location.href);
    url.hash = activeView;
    if (activeView === "overview") {
      url.searchParams.delete("carrier");
      url.searchParams.delete("type");
      url.searchParams.delete("number");
    }
    window.history.replaceState({}, "", url);
  }

  if (activeView === "overview") renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openHistoryEntry(entry) {
  carrierSelect.value = entry.query.carrier;
  trackingType.value = entry.query.type;
  trackingNumber.value = entry.query.number;
  updateCarrierUI();
  showView("tracking");
  form.requestSubmit();
}

function applyLanguage(language, { persist = true } = {}) {
  currentLanguage = language === "zh" ? "zh" : "en";
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.title = t("meta.title");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-content]").forEach((node) => {
    node.setAttribute("content", t(node.dataset.i18nContent));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.language === currentLanguage);
  });

  if (persist) localStorage.setItem(LANGUAGE_KEY, currentLanguage);
  activeViewTitle.textContent = t(`nav.${activeView}`);
  updateCarrierUI();
  renderChannelStatus(lastChannelStatus);
  renderHistory();
  if (currentPayload) renderResult(currentPayload);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const query = normalizeQuery({
    carrier: carrierSelect.value,
    type: trackingType.value,
    number: trackingNumber.value
  });
  const carrier = CARRIERS[query.carrier];

  if (!carrier?.enabled) {
    showError(t("carrier.cmaNotice"));
    return;
  }

  setLoading(true);
  updateUrl(query);
  const localPayload = loadSnapshot(query);
  if (localPayload) renderResult(localPayload);

  try {
    const response = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query)
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message || t("error.http", { status: response.status }));
    }

    saveSnapshot(query, payload);
    renderResult(payload);
    renderHistory();
  } catch (error) {
    const message = error?.message || t("error.generic");
    showError(localPayload ? t("error.localFallback", { message }) : message);
  } finally {
    setLoading(false);
  }
});

carrierSelect.addEventListener("change", () => updateCarrierUI({ resetResult: true }));

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.language));
});

document.querySelectorAll("[data-view-target]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showView(link.dataset.viewTarget);
  });
});

document.querySelector("#start-tracking-button").addEventListener("click", () => {
  showView("tracking");
  trackingNumber.focus();
});

clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm(t("history.confirmClear"))) return;
  for (const key of readCacheIndex()) localStorage.removeItem(key);
  localStorage.removeItem(CACHE_INDEX_KEY);
  renderHistory();
});

window.addEventListener("hashchange", () => {
  showView(window.location.hash === "#tracking" ? "tracking" : "overview", {
    updateLocation: false
  });
});

migrateLegacyCache();
applyLanguage(currentLanguage, { persist: false });

const initial = new URLSearchParams(window.location.search);
const initialNumber = initial.get("number");
if (initialNumber) {
  carrierSelect.value = initial.get("carrier") || "COSCO";
  trackingType.value = initial.get("type") || "BILLOFLADING";
  trackingNumber.value = initialNumber;
  updateCarrierUI();
  showView("tracking", { updateLocation: false });
  form.requestSubmit();
} else {
  showView(window.location.hash === "#tracking" ? "tracking" : "overview", {
    updateLocation: false
  });
}

void refreshChannelStatus();
setInterval(() => {
  void refreshChannelStatus();
}, 60_000);
