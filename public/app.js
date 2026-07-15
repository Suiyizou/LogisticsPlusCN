const form = document.querySelector("#tracking-form");
const submitButton = document.querySelector("#submit-button");
const carrierSelect = document.querySelector("#carrier-select");
const channelSelect = document.querySelector("#channel-select");
const trackingType = document.querySelector("#tracking-type");
const trackingNumber = document.querySelector("#tracking-number");
const carrierNotice = document.querySelector("#carrier-notice");
const sourceTag = document.querySelector("#source-tag");
const emptyState = document.querySelector("#empty-state");
const results = document.querySelector("#results");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");
const alertTitle = document.querySelector("#alert-title");
const channelState = document.querySelector("#channel-state");
const channelStatusText = document.querySelector("#channel-status-text");
const overviewMonitorStatus = document.querySelector("#overview-monitor-status");
const activeViewTitle = document.querySelector("#active-view-title");
const historyEmpty = document.querySelector("#history-empty");
const historyTableWrap = document.querySelector("#history-table-wrap");
const historyTableBody = document.querySelector("#history-table-body");
const clearHistoryButton = document.querySelector("#clear-history-button");
const journeyStage = document.querySelector("#journey-stage");
const checkChannelsButton = document.querySelector("#check-channels-button");
const channelCheckSummary = document.querySelector("#channel-check-summary");
const networkProbe = document.querySelector("#network-probe");
const playwrightProbe = document.querySelector("#playwright-probe");
const networkProbeStatus = document.querySelector("#network-probe-status");
const playwrightProbeStatus = document.querySelector("#playwright-probe-status");
const networkProbeLatency = document.querySelector("#network-probe-latency");
const playwrightProbeLatency = document.querySelector("#playwright-probe-latency");

const CACHE_VERSION = 3;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_LIMIT = 20;
const CACHE_PREFIX = "shipment-track:v3:";
const CACHE_INDEX_KEY = "shipment-track:v3:index";
const LEGACY_CACHE_INDEX_KEY = "shipment-track:v2:index";
const MIGRATION_KEY = "shipment-track:v3:migrated";
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

const CHANNELS = Object.freeze({
  AUTO: {
    code: "AUTO",
    labelKey: "channel.auto",
    sourceKey: "source.auto"
  },
  NETWORK: {
    code: "NETWORK",
    labelKey: "channel.network",
    sourceKey: "source.network"
  },
  PLAYWRIGHT: {
    code: "PLAYWRIGHT",
    labelKey: "channel.playwright",
    sourceKey: "source.playwright"
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
    "carrier.connected": "Connected · 2 channels",
    "carrier.planned": "Adapter reserved",
    "carrier.cmaOption": "CMA CGM · COMING SOON",
    "carrier.cmaNotice": "CMA CGM is selectable, but its adapter is not connected yet.",
    "sidebar.architecture": "UNIFIED ADAPTER",
    "breadcrumb.workspace": "Workspace",
    "overview.kicker": "SHIPMENT DASHBOARD",
    "overview.title": "Your shipments, moving in plain sight.",
    "overview.description": "See ports, sailing dates and arrival status at a glance, then expand any shipment for its latest movement.",
    "overview.startTracking": "Track a shipment",
    "overview.savedSearches": "Saved searches",
    "overview.carriersUsed": "Carriers used",
    "overview.lastUpdated": "Last updated",
    "overview.monitoring": "Carrier monitoring",
    "overview.noRecords": "No records",
    "workbench.kicker": "QUERY WORKBENCH",
    "workbench.title": "Channel health",
    "workbench.description": "COSCO uses the network API first and switches to the browser DOM automatically when needed.",
    "workbench.policy": "API FIRST · DOM FALLBACK",
    "workbench.check": "Check both channels",
    "workbench.checking": "Checking both channels…",
    "workbench.primary": "PRIMARY · NETWORK API",
    "workbench.fallback": "FALLBACK · BROWSER DOM",
    "workbench.networkName": "Network interface",
    "workbench.playwrightName": "Playwright browser",
    "workbench.notChecked": "Not checked",
    "workbench.available": "Available",
    "workbench.unavailable": "Unavailable",
    "workbench.helper": "The check uses the current shipment number; it does not add a tracking record.",
    "workbench.checkedAt": "Both channels checked at {time}",
    "workbench.checkFailed": "Channel check failed: {message}",
    "workbench.latency": "{time} ms",
    "history.title": "Tracked shipments",
    "history.subtitle": "Latest carrier snapshots stored on this browser",
    "history.clear": "Clear history",
    "history.emptyTitle": "No shipment history yet",
    "history.emptyDescription": "Your successful searches will appear here.",
    "history.carrier": "Carrier",
    "history.reference": "Shipment No.",
    "history.route": "Route",
    "history.latestStatus": "Latest status",
    "history.queriedAt": "Queried at",
    "history.open": "Open details",
    "history.delete": "Delete",
    "history.deleteLabel": "Delete tracking history for {number}",
    "history.confirmDelete": "Delete the saved tracking history for {number}? This only removes the browser snapshot.",
    "history.departed": "Departed",
    "history.etd": "ETD",
    "history.arrived": "Arrived",
    "history.eta": "ETA",
    "history.originPort": "Origin port",
    "history.destinationPort": "Destination port",
    "history.currentLocation": "Current location",
    "history.updated": "Snapshot updated",
    "history.recentMovement": "Recent movement",
    "history.expand": "Expand shipment {number}",
    "history.collapse": "Collapse shipment {number}",
    "history.noTimeline": "No confirmed movement events yet.",
    "history.confirmClear": "Clear all locally saved shipment history?",
    "tracking.kicker": "SHIPMENT INTELLIGENCE",
    "tracking.title": "Shipment tracking",
    "tracking.description": "Query carrier sources and shape them into one consistent snapshot.",
    "result.transportTerms": "Transport terms",
    "result.containerType": "Container type",
    "summary.services": "Selected services",
    "summary.sea": "Ocean",
    "summary.inland": "Inland",
    "summary.customs": "Customs",
    "summary.warehouse": "Warehouse",
    "query.carrier": "Carrier",
    "query.channel": "Query channel",
    "query.type": "Shipment number type",
    "query.number": "Shipment No.",
    "query.submit": "Track shipment",
    "query.loading": "Tracking…",
    "query.helper": "Automatic mode calls the network interface first and uses the Playwright browser only as a fallback.",
    "channel.auto": "Automatic · API first, DOM fallback",
    "channel.network": "Channel 1 · Network interface",
    "channel.playwright": "Channel 2 · Playwright browser",
    "source.auto": "COSCO · API FIRST · DOM FALLBACK",
    "source.network": "COSCO · CHANNEL 1 · NETWORK",
    "source.playwright": "COSCO · CHANNEL 2 · PLAYWRIGHT",
    "type.bill": "Bill of lading",
    "type.booking": "Booking number",
    "type.container": "Container number",
    "error.title": "Tracking request failed",
    "error.generic": "Tracking failed. Please try again.",
    "error.http": "Tracking failed (HTTP {status})",
    "error.localFallback": "{message} Showing the latest browser snapshot instead.",
    "notice.cacheTitle": "Live refresh unavailable",
    "empty.title": "Ready when you are",
    "empty.description": "Enter a bill, booking or container number to begin.",
    "metrics.actualDeparture": "Actual departure",
    "metrics.actualArrival": "Actual arrival",
    "metrics.notDeparted": "Not departed",
    "metrics.notArrived": "Not arrived",
    "metrics.estimatedDelivery": "Estimated final delivery",
    "metrics.latestEvent": "Latest event",
    "metrics.noLatestEvent": "No latest event",
    "journey.currentStage": "Current stage",
    "journey.departed": "Departed",
    "journey.arrived": "Port arrival",
    "journey.delivered": "Final destination",
    "journey.progress": "{completed} of {total} milestones confirmed",
    "journey.awaiting": "Awaiting the next carrier event",
    "route.title": "Route story",
    "route.origin": "Origin",
    "route.destination": "Destination",
    "route.nodes": "{count} nodes",
    "route.noNodes": "The carrier did not provide route nodes.",
    "route.unknownLocation": "Unknown location",
    "route.noEvent": "Event name not provided",
    "route.progress": "Route progress {progress}%",
    "route.stage.origin": "Place of receipt",
    "route.stage.departure": "Departure port",
    "route.stage.arrival": "Arrival port",
    "route.stage.destination": "Final destination",
    "route.stage.waypoint": "Route waypoint",
    "references.title": "Carrier identifiers",
    "references.masterBill": "Master bill",
    "references.booking": "Booking number",
    "references.external": "Other carrier references",
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
    "status.available": "Channel 1 network available",
    "status.unavailable": "Channel 1 network unavailable",
    "status.checking": "Channel 1 network checking",
    "status.disabled": "Channel 1 monitor disabled",
    "status.unknown": "Channel 1 awaiting check",
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
    "carrier.connected": "已接入 · 双通道",
    "carrier.planned": "已预留适配器",
    "carrier.cmaOption": "CMA CGM · 即将接入",
    "carrier.cmaNotice": "已支持选择 CMA CGM，但查询适配器暂未接入。",
    "sidebar.architecture": "统一适配层",
    "breadcrumb.workspace": "工作台",
    "overview.kicker": "运输看板",
    "overview.title": "每一票货物，进度一眼可见。",
    "overview.description": "直观看到港口、离港日期和到达状态，也可展开单条货物查看最新动态。",
    "overview.startTracking": "查询一票货物",
    "overview.savedSearches": "已保存查询",
    "overview.carriersUsed": "已使用船司",
    "overview.lastUpdated": "最近更新",
    "overview.monitoring": "船司监控",
    "overview.noRecords": "暂无记录",
    "workbench.kicker": "查询工作台",
    "workbench.title": "通道健康状态",
    "workbench.description": "COSCO 默认优先调用网络接口，必要时自动切换浏览器 DOM 托底。",
    "workbench.policy": "接口优先 · DOM 托底",
    "workbench.check": "检测双通道",
    "workbench.checking": "正在检测两个通道…",
    "workbench.primary": "主通道 · 网络接口",
    "workbench.fallback": "托底通道 · 浏览器 DOM",
    "workbench.networkName": "网络接口",
    "workbench.playwrightName": "Playwright 浏览器",
    "workbench.notChecked": "尚未检测",
    "workbench.available": "可用",
    "workbench.unavailable": "不可用",
    "workbench.helper": "检测使用当前运输单号，不会写入查询记录。",
    "workbench.checkedAt": "双通道检测完成：{time}",
    "workbench.checkFailed": "通道检测失败：{message}",
    "workbench.latency": "{time} 毫秒",
    "history.title": "运输任务",
    "history.subtitle": "当前浏览器保存的最新船司快照",
    "history.clear": "清空记录",
    "history.emptyTitle": "还没有查询记录",
    "history.emptyDescription": "成功查询的货物会显示在这里。",
    "history.carrier": "船司",
    "history.reference": "运输单号",
    "history.route": "路线",
    "history.latestStatus": "最新状态",
    "history.queriedAt": "查询时间",
    "history.open": "打开详情",
    "history.delete": "删除",
    "history.deleteLabel": "删除 {number} 的跟踪历史",
    "history.confirmDelete": "确定删除 {number} 的本地跟踪历史吗？只会移除浏览器快照。",
    "history.departed": "已离港",
    "history.etd": "预计离港",
    "history.arrived": "已到达",
    "history.eta": "预计到达",
    "history.originPort": "起运港",
    "history.destinationPort": "目的港",
    "history.currentLocation": "当前位置",
    "history.updated": "快照更新时间",
    "history.recentMovement": "最近动态",
    "history.expand": "展开运输任务 {number}",
    "history.collapse": "收起运输任务 {number}",
    "history.noTimeline": "船司尚未提供已确认的运输动态。",
    "history.confirmClear": "确定清空当前浏览器保存的全部查询记录吗？",
    "tracking.kicker": "货运信息",
    "tracking.title": "货物跟踪",
    "tracking.description": "查询船司数据源，并转换为统一的运输状态快照。",
    "result.transportTerms": "运输条款",
    "result.containerType": "箱型",
    "summary.services": "已选服务",
    "summary.sea": "海运",
    "summary.inland": "陆运",
    "summary.customs": "关务",
    "summary.warehouse": "仓储",
    "query.carrier": "船司",
    "query.channel": "查询通道",
    "query.type": "运输单号类型",
    "query.number": "运输单号",
    "query.submit": "查询运输信息",
    "query.loading": "查询中…",
    "query.helper": "自动模式优先调用网络接口，失败后才启用 Playwright 浏览器托底。",
    "channel.auto": "自动 · 接口优先，DOM 托底",
    "channel.network": "通道一 · 网络接口",
    "channel.playwright": "通道二 · Playwright 浏览器",
    "source.auto": "COSCO · 接口优先 · DOM 托底",
    "source.network": "COSCO · 通道一 · 网络接口",
    "source.playwright": "COSCO · 通道二 · PLAYWRIGHT",
    "type.bill": "提单号",
    "type.booking": "订舱号",
    "type.container": "箱号",
    "error.title": "查询失败",
    "error.generic": "查询失败，请稍后重试。",
    "error.http": "查询失败（HTTP {status}）",
    "error.localFallback": "{message} 当前展示最近一次浏览器缓存结果。",
    "notice.cacheTitle": "实时刷新暂不可用",
    "empty.title": "等待查询",
    "empty.description": "输入提单号、订舱号或箱号即可开始。",
    "metrics.actualDeparture": "实际离港",
    "metrics.actualArrival": "实际到港",
    "metrics.notDeparted": "未离港",
    "metrics.notArrived": "未到港",
    "metrics.estimatedDelivery": "预计到达最终目的地",
    "metrics.latestEvent": "最新动态",
    "metrics.noLatestEvent": "暂无最新动态",
    "journey.currentStage": "当前阶段",
    "journey.departed": "已离港",
    "journey.arrived": "已到港",
    "journey.delivered": "最终目的地",
    "journey.progress": "已确认 {completed}/{total} 个主要节点",
    "journey.awaiting": "等待船司更新下一节点",
    "route.title": "路线详情",
    "route.origin": "起始地",
    "route.destination": "目的地",
    "route.nodes": "{count} 个节点",
    "route.noNodes": "船司未提供路线节点。",
    "route.unknownLocation": "未知地点",
    "route.noEvent": "船司未提供事件名称",
    "route.progress": "路线进度 {progress}%",
    "route.stage.origin": "起运节点",
    "route.stage.departure": "离港节点",
    "route.stage.arrival": "到港节点",
    "route.stage.destination": "最终目的地",
    "route.stage.waypoint": "运输节点",
    "references.title": "船司识别号",
    "references.masterBill": "主提单号",
    "references.booking": "订舱号",
    "references.external": "其他船司参考号",
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
    "status.available": "通道一网络接口可用",
    "status.unavailable": "通道一网络接口异常",
    "status.checking": "通道一网络接口检测中",
    "status.disabled": "通道一监控已停用",
    "status.unknown": "通道一等待检测",
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
    "result-primary-facts",
    "result-traffic-term-fact",
    "result-traffic-term",
    "result-container-types-fact",
    "result-container-types",
    "summary-booking-number",
    "summary-origin-name",
    "summary-destination-name",
    "summary-latest-detail",
    "summary-service-sea",
    "summary-service-inland",
    "summary-service-customs",
    "summary-service-warehouse",
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
    "route-summary-line",
    "route-summary-marker",
    "master-bill",
    "booking-numbers",
    "external-references",
    "reference-information",
    "routing-count",
    "routing-table-body",
    "container-count",
    "container-table-body",
    "raw-json"
  ].map((id) => [id, document.querySelector(`#${id}`)])
);

let currentLanguage = "en";
try {
  currentLanguage = localStorage.getItem(LANGUAGE_KEY) === "zh" ? "zh" : "en";
} catch {
  // Storage policies must not prevent the application from starting.
}
let activeView = "overview";
let currentPayload = null;
let lastChannelStatus = { status: "unknown" };
let loading = false;
let resultAnimationTimer = null;
let viewTransitionSequence = 0;
let trackingRequestSequence = 0;
let lastChannelCheck = null;
let channelCheckLoading = false;
const expandedHistoryKeys = new Set();

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
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return code === "UK" ? "GB" : code;
}

function setCountryFlag(element, countryCode) {
  const code = normalizeCountryCode(countryCode);
  element.className = `flag-icon ${code ? "flag-image" : "flag-generic"}`;
  element.replaceChildren();
  if (code) {
    const image = document.createElement("img");
    image.src = `/vendor/flags/4x3/${code.toLowerCase()}.svg`;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      element.className = "flag-icon flag-code";
      element.textContent = code;
    });
    element.append(image);
  }
  element.dataset.countryCode = code;
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
    channel: String(query.channel ?? "AUTO").trim().toUpperCase(),
    type: String(query.type ?? "BILLOFLADING").trim().toUpperCase(),
    number: String(query.number ?? "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
  };
}

function cacheKey(query) {
  const normalized = normalizeQuery(query);
  return `${CACHE_PREFIX}${normalized.carrier}:${normalized.channel}:${normalized.type}:${normalized.number}`;
}

function legacyCacheKey(query) {
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
    const expectedContainerCount = (stored?.snapshot?.summary?.containers ?? []).reduce(
      (total, container) => total + Number(container?.quantity ?? container?.count ?? 0),
      0
    );
    const hasCompleteContainerDetails =
      expectedContainerCount <= 0 || (stored?.snapshot?.containers?.length ?? 0) > 0;
    const valid =
      stored?.version === CACHE_VERSION &&
      stored?.query &&
      stored?.snapshot?.tracking &&
      stored?.snapshot?.summary &&
      hasCompleteContainerDetails &&
      Number.isFinite(savedAt) &&
      Date.now() - savedAt <= CACHE_TTL_MS;

    if (!valid) {
      if (stored) removeCacheKey(key);
      return null;
    }
    return { ...stored, query: normalizeQuery(stored.query) };
  } catch {
    removeCacheKey(key);
    return null;
  }
}

function loadSnapshot(query) {
  const stored = readCacheEntry(cacheKey(query)) ?? readCacheEntry(legacyCacheKey(query));
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
  const records = readCacheIndex()
    .map((key) => ({ key, entry: readCacheEntry(key) }))
    .filter((record) => record.entry)
    .sort((left, right) => Date.parse(right.entry.savedAt) - Date.parse(left.entry.savedAt));
  const seenShipmentNumbers = new Set();
  const duplicateKeys = new Set();
  const latestRecords = [];

  for (const record of records) {
    const shipmentNumber = String(
      record.entry.snapshot?.tracking?.number ?? record.entry.query?.number ?? ""
    )
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();

    if (shipmentNumber && seenShipmentNumbers.has(shipmentNumber)) {
      duplicateKeys.add(record.key);
      continue;
    }

    if (shipmentNumber) seenShipmentNumbers.add(shipmentNumber);
    latestRecords.push(record);
  }

  if (duplicateKeys.size > 0) {
    try {
      for (const key of duplicateKeys) localStorage.removeItem(key);
      writeCacheIndex(readCacheIndex().filter((key) => !duplicateKeys.has(key)));
    } catch {
      // Deduplication is best-effort when browser storage is unavailable.
    }
  }

  return latestRecords.map((record) => record.entry);
}

function migrateLegacyCache() {
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return;
    const legacyKeys = JSON.parse(localStorage.getItem(LEGACY_CACHE_INDEX_KEY) ?? "[]");
    if (Array.isArray(legacyKeys)) {
      for (const legacyKey of legacyKeys) {
        const stored = JSON.parse(localStorage.getItem(legacyKey) ?? "null");
        if (!stored?.snapshot?.tracking) continue;
        if (stored.snapshot.tracking.type === "CONTAINER") continue;
        const query = {
          carrier: "COSCO",
          channel: stored.query?.channel ?? stored.snapshot.channel ?? "AUTO",
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
  submitButton.classList.remove("is-loading");
  submitButton.setAttribute("aria-busy", String(loading));
  const label = submitButton.querySelector(".button-label");
  if (label) label.textContent = t(loading ? "query.loading" : "query.submit");
  submitButton.disabled = loading || !CARRIERS[carrierSelect.value]?.enabled;
  results.classList.toggle("is-refreshing", loading && !results.hidden);
}

function showError(message, variant = "error") {
  errorMessage.textContent = message;
  errorPanel.dataset.variant = variant;
  alertTitle.textContent = variant === "warning" ? t("notice.cacheTitle") : t("error.title");
  errorPanel.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";
  errorPanel.dataset.variant = "error";
  alertTitle.textContent = t("error.title");
  errorPanel.hidden = true;
}

const ROUTE_STAGE_ICONS = Object.freeze({
  origin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5 12 4l7.5 4.5v10L12 22l-7.5-3.5z"/><path d="M4.5 8.5 12 13l7.5-4.5M12 13v9"/></svg>',
  departure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h14l-2 4H7zM8 16V8h8v8M12 8V4M9.5 11h5"/><path d="M3 22c2-1 4-1 6 0 2-1 4-1 6 0 2-1 4-1 6 0"/></svg>',
  arrival: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v12M7 11h10M5 15c1.5 4 4 6 7 6s5.5-2 7-6M7 15H4m13 0h3"/></svg>',
  destination: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-13A7 7 0 0 0 5 9c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/><path d="m9.5 15.5 1.7 1.7 3.5-3.7"/></svg>',
  waypoint: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 12h3.5c3.5 0 3-6 3.5-6M12 12c3.5 0 3 6 3.5 6"/></svg>'
});

function routeStageKind(node, index, total) {
  const locationType = String(node?.locationType ?? "").trim().toUpperCase();
  if (locationType === "FND" || locationType.includes("FINAL")) return "destination";
  if (["LPOD", "POD"].includes(locationType) || locationType.includes("DISCHARGE")) {
    return "arrival";
  }
  if (["FPOL", "POL"].includes(locationType) || locationType.includes("LOAD")) {
    return "departure";
  }
  if (locationType === "POR" || locationType.includes("RECEIPT")) return "origin";
  if (index === 0) return "origin";
  if (index === total - 1) return "destination";
  return "waypoint";
}

function normalizeLocationName(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function selectDisplayRouteNodes(route) {
  const seen = new Set();
  return route.filter((node) => {
    if (!node) return false;
    const identity = [
      node.locationType,
      normalizeLocationName(node.city),
      node.event,
      node.actualTime ?? node.estimatedTime
    ]
      .map((value) => String(value ?? "").trim().toUpperCase())
      .join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function calculateRouteProgress(route, snapshot) {
  if (route.length === 0) return 0;
  const finalNode = route.at(-1);
  const finalLocationType = String(finalNode?.locationType ?? "").toUpperCase();
  const latest = snapshot.summary?.latestEvent;
  const latestStage = `${latest?.stage ?? ""} ${latest?.oceanStage ?? ""}`.toUpperCase();
  const destination = normalizeLocationName(snapshot.summary?.destination?.name);
  const latestLocation = normalizeLocationName(latest?.location);
  const reachedDestination =
    Boolean(snapshot.keyTimes?.estimatedDelivery?.actualTime) ||
    Boolean(finalNode?.actualTime && finalLocationType === "FND") ||
    Boolean(finalNode?.active && finalLocationType === "FND") ||
    /FND|FINAL|DELIVER/.test(latestStage) ||
    Boolean(latest?.occurredAt && destination && latestLocation === destination);

  if (reachedDestination) return 100;

  const activeIndex = route.findIndex((node) => node.active);
  const lastActualIndex = route.reduce(
    (lastIndex, node, index) => (node.actualTime ? index : lastIndex),
    -1
  );
  const reachedIndex = Math.max(activeIndex, lastActualIndex);
  if (reachedIndex < 0) return 0;
  if (route.length === 1) return 100;
  return Math.max(6, Math.round((reachedIndex / (route.length - 1)) * 100));
}

function containerTypeSummary(snapshot) {
  const normalizedContainers = (snapshot.containers ?? []).filter((container) => container?.type);
  const fallbackContainers = (snapshot.summary?.containers ?? [])
    .map((container) => ({
      type: container?.containerType ?? container?.cntrType ?? container?.type,
      quantity: Number(container?.quantity ?? container?.count ?? 1)
    }))
    .filter((container) => container.type);
  const source = fallbackContainers.length > 0 ? fallbackContainers : normalizedContainers;
  const counts = new Map();

  for (const container of source) {
    const type = String(container.type).trim().toUpperCase();
    if (!type) continue;
    const quantity = Number.isFinite(container.quantity) && container.quantity > 0
      ? container.quantity
      : 1;
    counts.set(type, (counts.get(type) ?? 0) + quantity);
  }

  return [...counts.entries()]
    .map(([type, count]) => `${type} × ${count}`)
    .join(" · ");
}

function renderPrimaryFacts(snapshot) {
  const trafficTerm =
    snapshot.summary?.trafficTerm ??
    (snapshot.containers ?? []).find((container) => container?.trafficTerm)?.trafficTerm ??
    "";
  const containerTypes = containerTypeSummary(snapshot);

  elements["result-traffic-term"].textContent = valueOrDash(trafficTerm);
  elements["result-container-types"].textContent = valueOrDash(containerTypes);
  elements["result-traffic-term-fact"].hidden = !trafficTerm;
  elements["result-container-types-fact"].hidden = !containerTypes;
  elements["result-primary-facts"].hidden = !trafficTerm && !containerTypes;
}

function renderRoute(route, snapshot = {}) {
  route = selectDisplayRouteNodes(route);
  elements["route-flow"].replaceChildren();
  elements["route-flow"].style.setProperty("--route-columns", Math.max(route.length, 1));
  elements["route-count"].textContent = t("route.nodes", { count: route.length });
  const progress = calculateRouteProgress(route, snapshot);
  const progressLabel = t("route.progress", { progress });
  elements["route-flow"].style.setProperty("--route-progress", `${progress}%`);
  elements["route-flow"].classList.toggle("is-complete", progress === 100);
  elements["route-summary-line"].style.setProperty("--route-progress", `${progress}%`);
  elements["route-summary-line"].classList.toggle("is-complete", progress === 100);
  elements["route-summary-line"].setAttribute("aria-valuenow", String(progress));
  elements["route-summary-line"].setAttribute("aria-label", progressLabel);
  elements["route-summary-line"].title = progressLabel;
  elements["route-summary-marker"].textContent = progress === 100 ? "✓" : "◭";

  if (route.length === 0) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = t("route.noNodes");
    elements["route-flow"].append(empty);
    return;
  }

  const explicitActiveIndex = route.findIndex((node) => node.active);
  const lastActualIndex = route.reduce(
    (lastIndex, node, index) => (node.actualTime ? index : lastIndex),
    -1
  );
  const currentIndex = explicitActiveIndex >= 0 ? explicitActiveIndex : lastActualIndex;

  route.forEach((node, index) => {
    const stage = routeStageKind(node, index, route.length);
    const item = document.createElement("article");
    item.className = [
      "route-node",
      `route-stage-${stage}`,
      node.actualTime ? "is-complete" : "",
      index === currentIndex ? "is-active is-current" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const dot = document.createElement("span");
    dot.className = `route-dot route-stage-icon route-stage-icon-${stage}`;
    dot.innerHTML = ROUTE_STAGE_ICONS[stage];
    dot.setAttribute("aria-label", t(`route.stage.${stage}`));
    dot.title = t(`route.stage.${stage}`);

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
  });
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
    appendCell(
      row,
      leg.actualDeparture ? formatDateTime(leg.actualDeparture) : t("metrics.notDeparted"),
      `actual-time${leg.actualDeparture ? "" : " pending-time"}`
    );
    appendCell(row, formatDateTime(leg.estimatedArrival));
    appendCell(
      row,
      leg.actualArrival ? formatDateTime(leg.actualArrival) : t("metrics.notArrived"),
      `actual-time${leg.actualArrival ? "" : " pending-time"}`
    );
    appendCell(row, leg.masterBill);
    body.append(row);
  }
}

function renderReferences(references) {
  elements["master-bill"].textContent = valueOrDash(references.masterBill);
  const bookingNumbers = Array.isArray(references.bookingNumbers)
    ? references.bookingNumbers
    : references.bookingNumbers
      ? [references.bookingNumbers]
      : [];
  elements["booking-numbers"].textContent =
    bookingNumbers.length > 0 ? bookingNumbers.join(", ") : "—";

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

function renderJourney(snapshot) {
  const latest = snapshot.summary?.latestEvent;
  journeyStage.textContent = valueOrDash(latest?.name, t("journey.awaiting"));
}

function restartResultAnimation() {
  clearTimeout(resultAnimationTimer);
  results.classList.remove("is-revealing");
  void results.offsetWidth;
  results.classList.add("is-revealing");
  resultAnimationTimer = setTimeout(() => {
    results.classList.remove("is-revealing");
  }, 1_300);
}

function setSummaryService(element, enabled) {
  element.classList.toggle("is-enabled", enabled);
  element.setAttribute("aria-checked", String(enabled));
}

function renderResult(payload) {
  const snapshot = payload.snapshot;
  const summary = snapshot.summary;
  const keyTimes = snapshot.keyTimes ?? {};
  const latest = summary.latestEvent;
  const providerCode = snapshot.provider?.code ?? "COSCO";
  const resultChannel = CHANNELS[snapshot.channel] ?? CHANNELS.NETWORK;
  const isContainerOnly = snapshot.viewMode === "CONTAINER";

  currentPayload = payload;
  results.classList.toggle("is-container-only", isContainerOnly);
  sourceTag.textContent = t(resultChannel.sourceKey);
  elements["result-carrier"].textContent = providerCode;
  elements["result-type"].textContent = trackingTypeLabel(snapshot.tracking.type);
  elements["result-number"].textContent = snapshot.tracking.number;
  renderPrimaryFacts(snapshot);

  const bookingNumbers = Array.isArray(summary.bookingNumbers)
    ? summary.bookingNumbers
    : summary.bookingNumbers
      ? [summary.bookingNumbers]
      : [];
  elements["summary-booking-number"].textContent =
    bookingNumbers.length > 0 ? bookingNumbers.join(", ") : "—";
  elements["summary-origin-name"].textContent = valueOrDash(
    [summary.origin?.name, summary.origin?.countryCode].filter(Boolean).join(", ")
  );
  elements["summary-destination-name"].textContent = valueOrDash(
    [summary.destination?.name, summary.destination?.countryCode].filter(Boolean).join(", ")
  );
  elements["summary-latest-detail"].textContent = [
    latest?.location,
    formatDateTime(latest?.occurredAt)
  ]
    .filter((value) => value && value !== "—")
    .join(" · ") || "—";

  const transportModes = new Set(
    (snapshot.routingLegs ?? [])
      .map((leg) => String(leg?.mode ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
  const serviceScopes = (summary.serviceScopes ?? []).map((scope) =>
    String(scope).trim().toLowerCase()
  );
  setSummaryService(
    elements["summary-service-sea"],
    transportModes.has("SEA") || serviceScopes.some((scope) => scope.includes("ocean"))
  );
  setSummaryService(
    elements["summary-service-inland"],
    ["TRUCK", "RAIL", "ROAD", "INLAND"].some((mode) => transportModes.has(mode)) ||
      serviceScopes.some((scope) => scope.includes("truck") || scope.includes("inland"))
  );
  setSummaryService(
    elements["summary-service-customs"],
    serviceScopes.some((scope) => scope.includes("custom"))
  );
  setSummaryService(
    elements["summary-service-warehouse"],
    serviceScopes.some((scope) => scope.includes("warehouse") || scope.includes("storage"))
  );

  const source = payload.browserCached ? "browser" : payload.cached ? "server" : "live";
  elements["cache-status"].dataset.source = source;
  elements["cache-status"].textContent = t(`cache.${source}`);
  elements["cache-status"].title = payload.browserCachedAt
    ? t("cache.savedAt", { time: formatLocalDateTime(payload.browserCachedAt) })
    : "";
  elements["fetched-at"].textContent = formatLocalDateTime(snapshot.fetchedAt);

  elements["actual-departure"].textContent = keyTimes.actualDeparture?.time
    ? formatDateTime(keyTimes.actualDeparture.time)
    : t("metrics.notDeparted");
  elements["actual-departure-location"].textContent = valueOrDash(
    keyTimes.actualDeparture?.location,
    t("common.notProvided")
  );
  elements["actual-arrival"].textContent = keyTimes.actualArrival?.time
    ? formatDateTime(keyTimes.actualArrival.time)
    : t("metrics.notArrived");
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

  renderRoute(snapshot.route ?? [], snapshot);
  renderJourney(snapshot);
  renderRoutingLegs(snapshot.routingLegs ?? []);
  renderReferences(snapshot.references ?? {});
  renderContainers(snapshot.containers ?? []);
  elements["raw-json"].textContent = payload.raw
    ? JSON.stringify(payload.raw, null, 2)
    : JSON.stringify({ notice: t("raw.cacheNotice"), snapshot }, null, 2);

  emptyState.hidden = true;
  results.hidden = false;
  results.classList.toggle("is-refreshing", loading);
  restartResultAnimation();
}

function formatShipmentDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "—";
  return new Intl.DateTimeFormat(locale(), {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function portCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .match(/\b[A-Z]{5}\b/)?.[0] ?? "";
}

function historyPort(snapshot, side) {
  const route = snapshot.route ?? [];
  const isOrigin = side === "origin";
  const preferredTypes = isOrigin ? ["FPOL", "POR"] : ["LPOD", "FND"];
  const node = preferredTypes
    .map((type) => route.find((item) => item.locationType === type))
    .find(Boolean) ?? (isOrigin ? route[0] : route.at(-1));
  const summary = snapshot.summary?.[side] ?? {};
  const name = node?.city ?? summary.name ?? t("route.unknownLocation");
  const code = portCode(node?.facilityCode) || portCode(name);

  return {
    name,
    code,
    countryCode: node?.countryCode ?? summary.countryCode ?? ""
  };
}

function historyTiming(snapshot) {
  const keyTimes = snapshot.keyTimes ?? {};
  const legs = snapshot.routingLegs ?? [];
  const firstLeg = legs[0] ?? {};
  const lastLeg = legs.at(-1) ?? {};
  const oceanLegs = legs.filter((leg) => String(leg.mode ?? "").toUpperCase() === "SEA");
  const firstOceanLeg = oceanLegs[0] ?? firstLeg;
  const lastOceanLeg = oceanLegs.at(-1) ?? lastLeg;
  const actualDeparture = firstOceanLeg.actualDeparture ?? keyTimes.actualDeparture?.time ?? null;
  const estimatedDeparture = firstOceanLeg.estimatedDeparture ?? null;
  const actualArrival =
    lastOceanLeg.actualArrival ??
    keyTimes.actualArrival?.time ??
    keyTimes.estimatedDelivery?.actualTime ??
    null;
  const estimatedArrival =
    lastOceanLeg.estimatedArrival ?? keyTimes.estimatedDelivery?.time ?? null;

  return {
    departureTime: actualDeparture ?? estimatedDeparture,
    departureIsActual: Boolean(actualDeparture),
    arrivalTime: actualArrival ?? estimatedArrival,
    arrivalIsActual: Boolean(actualArrival),
    actualDeparture,
    actualArrival,
    estimatedArrival
  };
}

function historyProgress(snapshot, timing) {
  if (timing.arrivalIsActual) return 100;
  if (!timing.actualDeparture) return 8;

  const departure = Date.parse(timing.actualDeparture);
  const arrival = Date.parse(timing.estimatedArrival ?? "");
  if (Number.isFinite(departure) && Number.isFinite(arrival) && arrival > departure) {
    const elapsed = (Date.now() - departure) / (arrival - departure);
    return Math.round(Math.min(92, Math.max(18, elapsed * 84 + 8)));
  }

  return snapshot.keyTimes?.actualArrival?.time ? 78 : 52;
}

function historyTimeline(snapshot) {
  const keyTimes = snapshot.keyTimes ?? {};
  const latest = snapshot.summary?.latestEvent;
  const items = [];
  const seen = new Set();
  const add = (name, time, location) => {
    if (!name || !time) return;
    const identity = `${time}|${location ?? ""}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    items.push({ name, time, location });
  };

  add(latest?.name, latest?.occurredAt, latest?.location);
  for (const node of snapshot.route ?? []) {
    add(node.event ?? node.locationType, node.actualTime, node.city);
  }
  for (const status of snapshot.transportStatuses ?? []) {
    if (!status || typeof status !== "object") continue;
    add(
      status.eventName ?? status.event ?? status.status ?? status.description,
      status.actualEventDateTime ?? status.actualTime ?? status.eventTime ?? status.dateTime,
      status.eventLocation ?? status.location ?? status.city
    );
  }
  add(t("metrics.actualArrival"), keyTimes.actualArrival?.time, keyTimes.actualArrival?.location);
  add(t("metrics.actualDeparture"), keyTimes.actualDeparture?.time, keyTimes.actualDeparture?.location);

  return items
    .sort((left, right) => Date.parse(right.time) - Date.parse(left.time))
    .slice(0, 3);
}

function createHistoryPort(port, side) {
  const wrapper = document.createElement("span");
  wrapper.className = `shipment-port shipment-${side}-port`;
  const flag = createCountryFlag(port.countryCode);
  const copy = document.createElement("span");
  const label = document.createElement("small");
  label.className = "shipment-field-label";
  label.textContent = t(side === "origin" ? "history.originPort" : "history.destinationPort");
  const primary = document.createElement("strong");
  primary.textContent = port.code || port.name;
  const secondary = document.createElement("small");
  secondary.textContent = port.code ? port.name : port.countryCode || "—";
  copy.append(label, primary, secondary);
  wrapper.append(flag, copy);
  return wrapper;
}

function setHistoryDetailsExpanded({ item, toggle, details, entryKey, expanded, animate = true }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  details.getAnimations().forEach((animation) => animation.cancel());
  toggle.setAttribute("aria-expanded", String(expanded));
  item.classList.toggle("is-expanded", expanded);
  toggle.setAttribute(
    "aria-label",
    t(expanded ? "history.collapse" : "history.expand", {
      number: item.dataset.shipmentNumber
    })
  );

  if (expanded) expandedHistoryKeys.add(entryKey);
  else expandedHistoryKeys.delete(entryKey);

  if (!animate || reduceMotion) {
    details.hidden = !expanded;
    return;
  }

  if (expanded) {
    details.hidden = false;
    const targetHeight = details.scrollHeight;
    const animation = details.animate(
      [
        { height: "0px", opacity: 0, transform: "translateY(-8px)" },
        { height: `${targetHeight}px`, opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 320, easing: "cubic-bezier(.2,.75,.2,1)" }
    );
    animation.addEventListener("finish", () => {
      if (toggle.getAttribute("aria-expanded") === "true") details.style.height = "";
    });
    return;
  }

  const currentHeight = details.getBoundingClientRect().height || details.scrollHeight;
  const animation = details.animate(
    [
      { height: `${currentHeight}px`, opacity: 1, transform: "translateY(0)" },
      { height: "0px", opacity: 0, transform: "translateY(-8px)" }
    ],
    { duration: 240, easing: "cubic-bezier(.4,0,.6,1)" }
  );
  animation.addEventListener("finish", () => {
    if (toggle.getAttribute("aria-expanded") === "false") details.hidden = true;
  });
}

function renderHistory() {
  const history = readHistory();

  historyEmpty.hidden = history.length > 0;
  historyTableWrap.hidden = history.length === 0;
  clearHistoryButton.hidden = history.length === 0;
  historyTableBody.replaceChildren();

  let rowIndex = 0;
  for (const entry of history) {
    const item = document.createElement("article");
    item.className = "shipment-history-item";
    item.style.setProperty("--row-index", rowIndex);
    rowIndex += 1;
    const snapshot = entry.snapshot;
    const summary = snapshot.summary;
    const origin = historyPort(snapshot, "origin");
    const destination = historyPort(snapshot, "destination");
    const timing = historyTiming(snapshot);
    const progress = historyProgress(snapshot, timing);
    const detailId = `shipment-history-detail-${rowIndex}`;
    const entryKey = cacheKey(entry.query);
    const initiallyExpanded = expandedHistoryKeys.has(entryKey);

    item.dataset.shipmentNumber = entry.query.number;
    item.classList.add(
      timing.arrivalIsActual ? "is-arrived" : timing.actualDeparture ? "is-in-transit" : "is-planned"
    );
    item.style.setProperty("--shipment-progress", `${progress}%`);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "shipment-row-toggle";
    toggle.setAttribute("aria-expanded", String(initiallyExpanded));
    toggle.setAttribute("aria-controls", detailId);
    toggle.setAttribute(
      "aria-label",
      t(initiallyExpanded ? "history.collapse" : "history.expand", {
        number: entry.query.number
      })
    );

    const transportIcon = document.createElement("span");
    transportIcon.className = "shipment-transport-icon";
    transportIcon.setAttribute("aria-hidden", "true");
    transportIcon.textContent = "♒";

    const identity = document.createElement("span");
    identity.className = "shipment-identity";
    const identityLabel = document.createElement("small");
    identityLabel.className = "shipment-field-label";
    identityLabel.textContent = t("history.reference");
    const number = document.createElement("strong");
    number.textContent = entry.query.number;
    const identityMeta = document.createElement("small");
    identityMeta.textContent = `${trackingTypeLabel(entry.query.type)} · ${entry.query.carrier} · ${t((CHANNELS[entry.query.channel] ?? CHANNELS.NETWORK).labelKey)}`;
    identity.append(identityLabel, number, identityMeta);

    const journey = document.createElement("span");
    journey.className = "shipment-journey-dates";
    const dateLabels = document.createElement("span");
    dateLabels.className = "shipment-date-labels";
    const departureDate = document.createElement("span");
    departureDate.innerHTML = `<b>${t(timing.departureIsActual ? "history.departed" : "history.etd")}</b><small>${formatShipmentDate(timing.departureTime)}</small>`;
    const arrivalDate = document.createElement("span");
    arrivalDate.innerHTML = `<b>${t(timing.arrivalIsActual ? "history.arrived" : "history.eta")}</b><small>${formatShipmentDate(timing.arrivalTime)}</small>`;
    dateLabels.append(departureDate, arrivalDate);
    const progressTrack = document.createElement("span");
    progressTrack.className = "shipment-progress-track";
    progressTrack.append(document.createElement("i"));
    journey.append(dateLabels, progressTrack);

    const current = document.createElement("span");
    current.className = "shipment-current-status";
    const currentLabel = document.createElement("span");
    currentLabel.className = "shipment-field-label";
    currentLabel.textContent = t("history.latestStatus");
    const currentName = document.createElement("strong");
    currentName.textContent = valueOrDash(summary.latestEvent?.name, t("metrics.noLatestEvent"));
    const currentTime = document.createElement("small");
    currentTime.textContent = formatLocalDateTime(summary.latestEvent?.occurredAt);
    current.append(currentLabel, currentName, currentTime);

    const chevron = document.createElement("span");
    chevron.className = "shipment-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    toggle.append(
      transportIcon,
      identity,
      createHistoryPort(origin, "origin"),
      journey,
      createHistoryPort(destination, "destination"),
      current,
      chevron
    );

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-delete-button";
    deleteButton.textContent = t("history.delete");
    deleteButton.setAttribute(
      "aria-label",
      t("history.deleteLabel", { number: entry.query.number })
    );
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!window.confirm(t("history.confirmDelete", { number: entry.query.number }))) return;
      removeCacheKey(entryKey);
      expandedHistoryKeys.delete(entryKey);
      renderHistory();
    });

    const details = document.createElement("div");
    details.className = "shipment-row-details";
    details.id = detailId;
    details.hidden = !initiallyExpanded;
    item.classList.toggle("is-expanded", initiallyExpanded);

    const facts = document.createElement("dl");
    facts.className = "shipment-detail-facts";
    const factEntries = [
      [t("history.reference"), entry.query.number],
      [t("history.currentLocation"), summary.latestEvent?.location],
      [t("history.updated"), formatLocalDateTime(entry.savedAt)]
    ];
    for (const [label, value] of factEntries) {
      const fact = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = valueOrDash(value);
      fact.append(dt, dd);
      facts.append(fact);
    }

    const timelineSection = document.createElement("section");
    timelineSection.className = "shipment-timeline-section";
    const timelineTitle = document.createElement("strong");
    timelineTitle.className = "shipment-detail-title";
    timelineTitle.textContent = t("history.recentMovement");
    const timeline = document.createElement("div");
    timeline.className = "shipment-mini-timeline";
    const timelineItems = historyTimeline(snapshot);
    if (timelineItems.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = t("history.noTimeline");
      timeline.append(empty);
    } else {
      for (const event of timelineItems) {
        const eventNode = document.createElement("div");
        const marker = document.createElement("i");
        const copy = document.createElement("span");
        const eventName = document.createElement("strong");
        eventName.textContent = event.name;
        const eventMeta = document.createElement("small");
        eventMeta.textContent = [event.location, formatLocalDateTime(event.time)]
          .filter(Boolean)
          .join(" · ");
        copy.append(eventName, eventMeta);
        eventNode.append(marker, copy);
        timeline.append(eventNode);
      }
    }
    timelineSection.append(timelineTitle, timeline);

    const detailActions = document.createElement("div");
    detailActions.className = "shipment-detail-actions";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "open-history-button";
    openButton.innerHTML = `<span>${t("history.open")}</span><b aria-hidden="true">↗</b>`;
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openHistoryEntry(entry);
    });
    detailActions.append(openButton);
    details.append(facts, timelineSection, detailActions);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      setHistoryDetailsExpanded({
        item,
        toggle,
        details,
        entryKey,
        expanded: !expanded
      });
    });

    item.append(toggle, deleteButton, details);
    historyTableBody.append(item);
  }
}

function updateCarrierUI({ resetResult = false } = {}) {
  const carrier = CARRIERS[carrierSelect.value] ?? CARRIERS.COSCO;
  const channel = CHANNELS[channelSelect.value] ?? CHANNELS.NETWORK;
  sourceTag.textContent = carrier.code === "COSCO" ? t(channel.sourceKey) : carrier.source;
  carrierNotice.hidden = carrier.enabled;
  carrierNotice.textContent = carrier.enabled ? "" : t("carrier.cmaNotice");
  checkChannelsButton.disabled = channelCheckLoading || !carrier.enabled;
  setLoading(loading);

  if (
    resetResult &&
    (currentPayload?.snapshot?.provider?.code !== carrier.code ||
      currentPayload?.snapshot?.channel !== channel.code)
  ) {
    currentPayload = null;
    results.hidden = true;
    emptyState.hidden = false;
    clearError();
  }
}

function probeElements(channel) {
  return channel === "PLAYWRIGHT"
    ? {
        card: playwrightProbe,
        status: playwrightProbeStatus,
        latency: playwrightProbeLatency
      }
    : {
        card: networkProbe,
        status: networkProbeStatus,
        latency: networkProbeLatency
      };
}

function renderProbe(channel, probe) {
  const target = probeElements(channel);
  const status = probe?.status ?? "unknown";
  const available = probe?.available === true || status === "available";
  const unavailable = probe?.available === false || status === "unavailable";
  target.card.dataset.status = status;
  target.status.textContent = available
    ? t("workbench.available")
    : unavailable
      ? t("workbench.unavailable")
      : status === "checking"
        ? t("status.shortChecking")
        : t("workbench.notChecked");
  target.latency.textContent = Number.isFinite(probe?.responseTimeMs)
    ? t("workbench.latency", { time: probe.responseTimeMs })
    : "—";
  target.card.title = probe?.error ?? "";
}

function renderChannelCheck(result) {
  if (!result?.channels) return;
  lastChannelCheck = result;
  renderProbe("NETWORK", result.channels.NETWORK);
  renderProbe("PLAYWRIGHT", result.channels.PLAYWRIGHT);
  channelCheckSummary.textContent = t("workbench.checkedAt", {
    time: formatLocalDateTime(result.checkedAt)
  });
}

function setChannelCheckLoading(value) {
  channelCheckLoading = value;
  checkChannelsButton.disabled = value || !CARRIERS[carrierSelect.value]?.enabled;
  checkChannelsButton.classList.toggle("is-loading", value);
  const label = checkChannelsButton.querySelector("[data-i18n]");
  if (label) label.textContent = t(value ? "workbench.checking" : "workbench.check");
  if (value) {
    renderProbe("NETWORK", { status: "checking" });
    renderProbe("PLAYWRIGHT", { status: "checking" });
    channelCheckSummary.textContent = t("workbench.helper");
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

  if (!lastChannelCheck) {
    renderProbe("NETWORK", lastChannelStatus);
  }
}

async function refreshChannelStatus() {
  try {
    const response = await fetch("/api/channels/network/status", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderChannelStatus(await response.json());
  } catch {
    renderChannelStatus({ status: "unknown" });
  }
}

function updateUrl(query, { push = false } = {}) {
  const normalized = normalizeQuery(query);
  const url = new URL(window.location.href);
  url.searchParams.set("carrier", normalized.carrier);
  url.searchParams.set("channel", normalized.channel);
  url.searchParams.set("type", normalized.type);
  url.searchParams.set("number", normalized.number);
  url.hash = "tracking";
  window.history[push ? "pushState" : "replaceState"]({}, "", url);
}

function showView(name, { updateLocation = true } = {}) {
  const nextView = name === "tracking" ? "tracking" : "overview";
  const incoming = document.querySelector(`[data-view="${nextView}"]`);
  const outgoing = document.querySelector(".app-view:not([hidden])");
  const transitionId = ++viewTransitionSequence;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let resolveShown;
  const shown = new Promise((resolve) => {
    resolveShown = resolve;
  });

  activeView = nextView;
  document.querySelectorAll("[data-view-target]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.viewTarget === activeView);
  });
  activeViewTitle.textContent = t(`nav.${activeView}`);

  if (updateLocation) {
    const url = new URL(window.location.href);
    url.hash = activeView;
    if (activeView === "overview") {
      url.searchParams.delete("carrier");
      url.searchParams.delete("channel");
      url.searchParams.delete("type");
      url.searchParams.delete("number");
    }
    window.history.replaceState({}, "", url);
  }

  const revealIncoming = () => {
    if (transitionId !== viewTransitionSequence) return;
    document.querySelectorAll(".app-view").forEach((view) => {
      view.hidden = view !== incoming;
      view.getAnimations().forEach((animation) => animation.cancel());
    });
    incoming.hidden = false;
    if (!reduceMotion) {
      incoming.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: 320, easing: "cubic-bezier(.2,.75,.2,1)" }
      );
    }
    if (activeView === "overview") renderHistory();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    resolveShown();
  };

  if (outgoing && outgoing !== incoming && !reduceMotion) {
    outgoing
      .animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-6px)" }
        ],
        { duration: 150, easing: "ease-in", fill: "forwards" }
      )
      .finished.catch(() => {})
      .then(revealIncoming);
  } else {
    revealIncoming();
  }

  return shown;
}

function openHistoryEntry(entry) {
  carrierSelect.value = entry.query.carrier;
  channelSelect.value = entry.query.channel ?? "AUTO";
  trackingType.value = entry.query.type;
  trackingNumber.value = entry.query.number;
  updateCarrierUI();
  currentPayload = {
    snapshot: entry.snapshot,
    raw: null,
    cached: false,
    browserCached: true,
    browserCachedAt: entry.savedAt
  };
  renderResult(currentPayload);
  updateUrl(entry.query, { push: true });
  void showView("tracking", { updateLocation: false }).then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentQuery = normalizeQuery({
          carrier: carrierSelect.value,
          channel: channelSelect.value,
          type: trackingType.value,
          number: trackingNumber.value
        });
        if (
          activeView === "tracking" &&
          cacheKey(currentQuery) === cacheKey(entry.query)
        ) {
          form.requestSubmit();
        }
      });
    });
  });
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

  if (!errorPanel.hidden) {
    alertTitle.textContent =
      errorPanel.dataset.variant === "warning" ? t("notice.cacheTitle") : t("error.title");
  }

  if (persist) {
    try {
      localStorage.setItem(LANGUAGE_KEY, currentLanguage);
    } catch {
      // Language switching still works when storage is disabled.
    }
  }
  activeViewTitle.textContent = t(`nav.${activeView}`);
  updateCarrierUI();
  renderChannelStatus(lastChannelStatus);
  if (lastChannelCheck) renderChannelCheck(lastChannelCheck);
  renderHistory();
  if (currentPayload) renderResult(currentPayload);
}

async function postTrackingRequest(path, query) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function requestTracking(query) {
  const primary = await postTrackingRequest("/api/track", query);

  if (
    query.carrier === "COSCO" &&
    [404, 405].includes(primary.response.status)
  ) {
    const compatibilityPath =
      query.channel === "PLAYWRIGHT"
        ? "/api/track/cosco/playwright"
        : "/api/track/cosco";
    return postTrackingRequest(compatibilityPath, query);
  }

  return primary;
}

checkChannelsButton.addEventListener("click", async () => {
  const carrier = CARRIERS[carrierSelect.value];
  if (!carrier?.enabled || channelCheckLoading) return;

  setChannelCheckLoading(true);
  try {
    const response = await fetch("/api/channels/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: trackingType.value || "BILLOFLADING",
        number: trackingNumber.value.trim() || "6502077380"
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || t("error.http", { status: response.status }));
    }
    renderChannelCheck(payload);
  } catch (error) {
    renderProbe("NETWORK", { status: "unknown" });
    renderProbe("PLAYWRIGHT", { status: "unknown" });
    channelCheckSummary.textContent = t("workbench.checkFailed", {
      message: error?.message || t("error.generic")
    });
  } finally {
    setChannelCheckLoading(false);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const query = normalizeQuery({
    carrier: carrierSelect.value,
    channel: channelSelect.value,
    type: trackingType.value,
    number: trackingNumber.value
  });
  const carrier = CARRIERS[query.carrier];

  if (!carrier?.enabled) {
    showError(t("carrier.cmaNotice"), "warning");
    return;
  }

  const requestSequence = ++trackingRequestSequence;
  setLoading(true);
  updateUrl(query);
  const localPayload = loadSnapshot(query);
  if (localPayload) renderResult(localPayload);

  try {
    const { response, payload } = await requestTracking(query);

    if (!response.ok) {
      throw new Error(payload?.error?.message || t("error.http", { status: response.status }));
    }

    saveSnapshot(query, payload);
    renderHistory();
    if (requestSequence !== trackingRequestSequence) return;
    renderResult(payload);
  } catch (error) {
    if (requestSequence !== trackingRequestSequence) return;
    const message = error?.message || t("error.generic");
    showError(
      localPayload ? t("error.localFallback", { message }) : message,
      localPayload ? "warning" : "error"
    );
  } finally {
    if (requestSequence === trackingRequestSequence) setLoading(false);
  }
});

carrierSelect.addEventListener("change", () => {
  trackingRequestSequence += 1;
  setLoading(false);
  updateCarrierUI({ resetResult: true });
});
channelSelect.addEventListener("change", () => updateCarrierUI({ resetResult: true }));

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
  expandedHistoryKeys.clear();
  renderHistory();
});

function syncViewFromLocation() {
  const nextView = window.location.hash === "#tracking" ? "tracking" : "overview";
  if (nextView === activeView) return;
  showView(nextView, { updateLocation: false });
}

window.addEventListener("hashchange", syncViewFromLocation);
window.addEventListener("popstate", syncViewFromLocation);

migrateLegacyCache();
applyLanguage(currentLanguage, { persist: false });

const initial = new URLSearchParams(window.location.search);
const initialNumber = initial.get("number");
if (initialNumber) {
  const initialQuery = normalizeQuery({
    carrier: initial.get("carrier") || "COSCO",
    channel: initial.get("channel") || "AUTO",
    type: initial.get("type") || "BILLOFLADING",
    number: initialNumber
  });
  carrierSelect.value = CARRIERS[initialQuery.carrier] ? initialQuery.carrier : "COSCO";
  channelSelect.value = CHANNELS[initialQuery.channel] ? initialQuery.channel : "AUTO";
  trackingType.value = TYPE_KEYS[initialQuery.type] ? initialQuery.type : "BILLOFLADING";
  trackingNumber.value = initialQuery.number;
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
