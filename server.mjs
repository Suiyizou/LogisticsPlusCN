import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeCoscoPlaywrightBrowser,
  fetchCoscoTrackingViaPlaywright
} from "./channels/cosco-playwright.mjs";
import { decodeCoscoPayload } from "./lib/cosco-payload.mjs";

export { decodeCoscoPayload } from "./lib/cosco-payload.mjs";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");
const ELEMENT_PLUS_CSS = join(
  ROOT_DIR,
  "node_modules",
  "element-plus",
  "dist",
  "index.css"
);
const FLAG_ICONS_DIR = join(ROOT_DIR, "node_modules", "flag-icons", "flags");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

const COSCO_TRACKING_BASE =
  "https://elines.coscoshipping.com/scct/scct_customer/public/cargoTracking";
const COSCO_TRACKING_EX_BASE =
  "https://elines.coscoshipping.com/scct/scct_customer_ex/public/cargoTracking";
const COSCO_PUBLIC_TRACKING_PAGE =
  "https://elines.coscoshipping.com/scct/public/ct/base";
const COSCO_PAGE_URL =
  "https://elines.coscoshipping.com/ebusiness/cargoTracking";
const UPSTREAM_TIMEOUT_MS = 30_000;
const NETWORK_CORE_TIMEOUT_MS = 10_000;
const NETWORK_ENRICHMENT_TIMEOUT_MS = 4_000;
const PLAYWRIGHT_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CHANNEL_C_MONITOR_INTERVAL_MS = 6 * 60 * 60_000;
const configuredMonitorInterval = Number.parseInt(
  process.env.CHANNEL_C_MONITOR_INTERVAL_MS ?? "",
  10
);
const CHANNEL_C_MONITOR_INTERVAL_MS =
  Number.isFinite(configuredMonitorInterval) && configuredMonitorInterval > 0
    ? configuredMonitorInterval
    : DEFAULT_CHANNEL_C_MONITOR_INTERVAL_MS;
const CHANNEL_C_MONITOR_ENABLED =
  String(process.env.CHANNEL_C_MONITOR_ENABLED ?? "true").toLowerCase() !== "false";
const CHANNEL_C_MONITOR_REQUEST = Object.freeze({
  type: process.env.CHANNEL_C_MONITOR_TYPE ?? "BILLOFLADING",
  number: process.env.CHANNEL_C_MONITOR_NUMBER ?? "6502077380"
});

const TRACKING_TYPES = Object.freeze({
  BILLOFLADING: {
    label: "提单号",
    businessNumberType: "blNumber"
  },
  BOOKING: {
    label: "订舱号",
    businessNumberType: "bookingNumber"
  },
  CONTAINER: {
    label: "箱号",
    businessNumberType: "containerNumber"
  }
});

const COSCO_QUERY_CHANNELS = Object.freeze({
  NETWORK: {
    code: "NETWORK",
    number: 1,
    label: "网络接口",
    source: "COSCO_INTERNAL_WEB_API"
  },
  PLAYWRIGHT: {
    code: "PLAYWRIGHT",
    number: 2,
    label: "Playwright 浏览器",
    source: "COSCO_WEB_UI_PLAYWRIGHT"
  }
});

const COSCO_AUTO_QUERY_STRATEGY = Object.freeze({
  code: "AUTO",
  number: 0,
  label: "接口优先 · DOM 托底",
  source: "COSCO_NETWORK_WITH_PLAYWRIGHT_FALLBACK"
});

const CARRIER_ADAPTERS = Object.freeze({
  COSCO: {
    code: "COSCO",
    name: "COSCO SHIPPING Lines",
    channel: "AUTO",
    channels: ["NETWORK", "PLAYWRIGHT"],
    defaultChannel: "AUTO",
    enabled: true,
    source: "COSCO_INTERNAL_WEB_API"
  },
  CMA: {
    code: "CMA",
    name: "CMA CGM",
    channel: null,
    enabled: false,
    source: null
  }
});

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
});

const cache = new Map();
const inFlightTrackingRequests = new Map();
let coscoPublicCookieCache = null;
const channelCHealth = {
  status: CHANNEL_C_MONITOR_ENABLED ? "unknown" : "disabled",
  available: null,
  intervalMs: CHANNEL_C_MONITOR_INTERVAL_MS,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  responseTimeMs: null,
  lastAttemptCount: 0,
  consecutiveFailures: 0,
  nextCheckAt: null,
  lastError: null
};
let channelCMonitorTimer = null;
let channelCMonitorPromise = null;

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

function setCommonHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
}

function sendJson(response, status, payload) {
  setCommonHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      throw new HttpError(413, "请求内容过大");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "请求内容不是有效的 JSON");
  }
}

export function normalizeTrackingRequest(input) {
  const type = String(input?.type ?? "BILLOFLADING").toUpperCase();
  const typeConfig = TRACKING_TYPES[type];

  if (!typeConfig) {
    throw new HttpError(400, "不支持的查询类型");
  }

  const number = String(input?.number ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!/^[A-Z0-9-]{4,35}$/.test(number)) {
    throw new HttpError(400, `${typeConfig.label}格式不正确`);
  }

  return { type, number, ...typeConfig };
}

export function normalizeCarrierCode(value = "COSCO") {
  const code = String(value).trim().toUpperCase();

  if (!CARRIER_ADAPTERS[code]) {
    throw new HttpError(400, "不支持的船司");
  }

  return code;
}

export function listCarrierAdapters() {
  return Object.values(CARRIER_ADAPTERS).map((carrier) => ({ ...carrier }));
}

export function normalizeQueryChannel(value = "NETWORK") {
  const code = String(value).trim().toUpperCase();
  if (code === COSCO_AUTO_QUERY_STRATEGY.code) {
    return COSCO_AUTO_QUERY_STRATEGY;
  }
  const channel = COSCO_QUERY_CHANNELS[code];

  if (!channel) {
    throw new HttpError(400, "不支持的查询通道");
  }

  return channel;
}

export function listCoscoQueryChannels() {
  return Object.values(COSCO_QUERY_CHANNELS).map((channel) => ({ ...channel }));
}

function normalizeContainerNumber(container) {
  return (
    container?.containerNumberWithCheckDigit ??
    container?.containerNumber ??
    null
  );
}

function normalizeContainerMilestone(milestone) {
  if (!milestone) return null;

  return {
    name: milestone.eventName ?? null,
    occurredAt: milestone.actualEventDateTime ?? null,
    location: milestone.eventLocationName ?? milestone.eventLocation ?? null,
    stage: milestone.stageType ?? milestone.stage ?? null,
    oceanStage: milestone.eventStage ?? milestone.oceanStage ?? null,
    transportMode: milestone.transportMode ?? null
  };
}

function selectRequestedContainers(containers, request) {
  const source = Array.isArray(containers) ? containers : [];
  const exact = source.filter(
    (container) => normalizeContainerNumber(container)?.toUpperCase() === request.number
  );
  const selected = exact.length > 0 ? exact : source;
  const unique = new Map();

  for (const container of selected) {
    const number = normalizeContainerNumber(container);
    if (!number || unique.has(number)) continue;
    unique.set(number, container);
  }

  return [...unique.values()];
}

function normalizeReferenceValue(reference) {
  if (typeof reference === "string") return reference;
  return (
    reference?.value ??
    reference?.referenceNumber ??
    reference?.refNumber ??
    reference?.number ??
    null
  );
}

export function buildRoutingLegs(result) {
  const summary = result?.cargoTrackingSummary ?? {};
  const route = result?.cargoTrackingFullChain ?? [];
  const schedules = result?.cargoTrackingSailingSchedule ?? [];
  const countryForCity = (city) =>
    route.find(
      (node) =>
        node.city && city && node.city.trim().toLowerCase() === city.trim().toLowerCase()
    )?.countryCode ?? null;
  const legs = schedules.map((sailing, index) => ({
    sequence: index + 1,
    mode: "SEA",
    vesselName: sailing.vesselName ?? null,
    service: sailing.service ?? null,
    voyage: sailing.voyage ?? null,
    estimatedDeparture: sailing.etd ?? null,
    actualDeparture: sailing.atd ?? null,
    estimatedArrival: sailing.eta ?? null,
    actualArrival: sailing.ata ?? null,
    loadPort: sailing.polPort ?? null,
    loadCountryCode: countryForCity(sailing.polPort),
    dischargePort: sailing.podPort ?? null,
    dischargeCountryCode: countryForCity(sailing.podPort),
    masterBill: summary.blNumber ?? null
  }));

  const finalNode = [...route].reverse().find((node) => node.locationType === "FND");
  const podNode = [...route].reverse().find((node) => node.locationType === "LPOD");
  const lastSchedule = schedules.at(-1);
  const latest = summary.latestMilestone;
  const hasInlandDestination =
    finalNode?.city &&
    lastSchedule?.podPort &&
    finalNode.city.trim().toLowerCase() !== lastSchedule.podPort.trim().toLowerCase();

  if (hasInlandDestination) {
    const latestIsDeparture = /depart/i.test(latest?.eventName ?? "");
    legs.push({
      sequence: legs.length + 1,
      mode: latest?.transportMode ?? "INLAND",
      vesselName: null,
      service: null,
      voyage: null,
      estimatedDeparture: null,
      actualDeparture: latestIsDeparture ? latest.actualEventDateTime ?? null : null,
      estimatedArrival: finalNode.estimatedTime ?? null,
      actualArrival: finalNode.actualTime ?? null,
      loadPort: podNode?.city ?? lastSchedule.podPort,
      loadCountryCode: podNode?.countryCode ?? countryForCity(lastSchedule.podPort),
      dischargePort: finalNode.city,
      dischargeCountryCode: finalNode.countryCode ?? null,
      masterBill: summary.blNumber ?? null
    });
  }

  return legs;
}

export function normalizeCoscoSnapshot(result, request, fetchedAt, extras = {}) {
  const queryChannel = extras.queryChannel ?? COSCO_QUERY_CHANNELS.NETWORK;
  const summary = result?.cargoTrackingSummary ?? {};
  const latest = summary.latestMilestone ?? null;
  const bookingInfo = extras.bookingInfo ?? {};
  const containerInfo = extras.containerInfo ?? [];
  const externalReferences = (bookingInfo.externalReferenceNumbers ?? [])
    .map(normalizeReferenceValue)
    .filter(Boolean);
  const containerReferences = containerInfo.flatMap((container) =>
    (container.refNumbers ?? []).map(normalizeReferenceValue).filter(Boolean)
  );
  const routingLegs = buildRoutingLegs(result);
  const actualDepartureLeg = routingLegs.find((leg) => leg.actualDeparture);
  const actualArrivalLeg = [...routingLegs].reverse().find((leg) => leg.actualArrival);
  const finalRouteNode = [...(result?.cargoTrackingFullChain ?? [])]
    .reverse()
    .find((node) => node.locationType === "FND");

  return {
    channel: queryChannel.code,
    channelNumber: queryChannel.number,
    channelLabel: queryChannel.label,
    source: queryChannel.source,
    carrier: "COSCO SHIPPING Lines",
    provider: {
      code: "COSCO",
      name: "COSCO SHIPPING Lines",
      channel: queryChannel.code
    },
    fetchedAt,
    tracking: {
      type: request.type,
      typeLabel: request.label,
      number: request.number
    },
    summary: {
      billOfLading: summary.blNumber ?? null,
      bookingNumbers: summary.bookingNumber ?? [],
      origin: {
        name: summary.por ?? null,
        countryCode: summary.porCountryCode ?? null
      },
      destination: {
        name: summary.fnd ?? null,
        countryCode: summary.fndCountryCode ?? null
      },
      trafficTerm: summary.trafficTerm ?? null,
      serviceScopes: (summary.serviceScopes ?? []).filter(Boolean),
      containers: summary.containerSummaryInfos ?? [],
      latestEvent: latest
        ? {
            name: latest.eventName ?? null,
            occurredAt: latest.actualEventDateTime ?? null,
            location: latest.eventLocation ?? null,
            stage: latest.stage ?? null,
            oceanStage: latest.oceanStage ?? null,
            transportMode: latest.transportMode ?? null
          }
        : null
    },
    keyTimes: {
      actualDeparture: actualDepartureLeg
        ? {
            time: actualDepartureLeg.actualDeparture,
            location: actualDepartureLeg.loadPort
          }
        : null,
      actualArrival: actualArrivalLeg
        ? {
            time: actualArrivalLeg.actualArrival,
            location: actualArrivalLeg.dischargePort
          }
        : null,
      estimatedDelivery: finalRouteNode
        ? {
            time: finalRouteNode.estimatedTime ?? null,
            actualTime: finalRouteNode.actualTime ?? null,
            location: finalRouteNode.city ?? null,
            timezone: finalRouteNode.localTimezone ?? null
          }
        : null
    },
    route: (result?.cargoTrackingFullChain ?? []).map((item, index) => ({
      sequence: index + 1,
      locationType: item.locationType ?? null,
      city: item.city ?? null,
      countryName: item.countryName ?? null,
      countryCode: item.countryCode ?? null,
      facilityCode: item.facilityCode ?? null,
      event: item.event ?? null,
      estimatedTime: item.estimatedTime ?? null,
      actualTime: item.actualTime ?? null,
      timezone: item.localTimezone ?? null,
      transportModes: item.transportModes ?? [],
      active: Boolean(item.active)
    })),
    transportStatuses: result?.cargoTrackingTransportStatus ?? [],
    sailingSchedule: result?.cargoTrackingSailingSchedule ?? [],
    routingLegs,
    containers: containerInfo.map((container) => ({
      number: container.containerNumber ?? null,
      type: container.containerType ?? null,
      sealNumber: container.sealNumber ?? null,
      trafficTerm: container.trafficTerm ?? null,
      transportMode: container.currentMilestone?.transportMode ?? null,
      currentLocation: container.currentMilestone?.eventLocation ?? null,
      latestEvent: container.currentMilestone?.eventName ?? null,
      latestEventTime: container.currentMilestone?.actualEventDateTime ?? null,
      referenceNumbers: (container.refNumbers ?? [])
        .map(normalizeReferenceValue)
        .filter(Boolean)
    })),
    references: {
      masterBill: summary.blNumber ?? null,
      bookingNumbers: summary.bookingNumber ?? [],
      external: [...new Set([...externalReferences, ...containerReferences])],
      information: (bookingInfo.referenceInformation ?? []).map((item) => ({
        name: item.name ?? null,
        value: item.value ?? null,
        sequence: item.seq ?? null
      }))
    }
  };
}

export function normalizeCoscoContainerSnapshot(
  containerResult,
  request,
  fetchedAt,
  extras = {}
) {
  const queryChannel = extras.queryChannel ?? COSCO_QUERY_CHANNELS.NETWORK;
  const selectedContainers = selectRequestedContainers(containerResult, request);

  if (selectedContainers.length === 0) {
    throw new HttpError(404, "COSCO 没有返回该箱号的动态");
  }

  const primaryContainer = selectedContainers[0];
  const primaryMilestone = primaryContainer.milestones?.[0] ?? null;
  const latest = normalizeContainerMilestone(primaryMilestone);
  const containers = selectedContainers.map((container) => {
    const milestone = container.milestones?.[0] ?? null;
    return {
      number: normalizeContainerNumber(container),
      type: container.containerType ?? null,
      sealNumber: container.sealNumber ?? null,
      trafficTerm: null,
      transportMode: milestone?.transportMode ?? null,
      currentLocation: milestone?.eventLocationName ?? milestone?.eventLocation ?? null,
      latestEvent: milestone?.eventName ?? null,
      latestEventTime: milestone?.actualEventDateTime ?? null,
      etaAtLastPod: container.etaAtLastPod ?? null,
      ataAtLastPod: container.ataAtLastPod ?? null,
      referenceNumbers: [],
      milestones: (container.milestones ?? []).map(normalizeContainerMilestone).filter(Boolean)
    };
  });

  return {
    channel: queryChannel.code,
    channelNumber: queryChannel.number,
    channelLabel: queryChannel.label,
    source: queryChannel.source,
    carrier: "COSCO SHIPPING Lines",
    provider: {
      code: "COSCO",
      name: "COSCO SHIPPING Lines",
      channel: queryChannel.code
    },
    fetchedAt,
    viewMode: "CONTAINER",
    tracking: {
      type: request.type,
      typeLabel: request.label,
      number: request.number
    },
    summary: {
      billOfLading: null,
      bookingNumbers: [],
      origin: { name: null, countryCode: null },
      destination: { name: null, countryCode: null },
      trafficTerm: null,
      serviceScopes: [],
      containers: containers.map((container) => ({
        containerNumber: container.number,
        containerType: container.type,
        quantity: 1
      })),
      latestEvent: latest
    },
    keyTimes: {
      actualDeparture: null,
      actualArrival: primaryContainer.ataAtLastPod
        ? { time: primaryContainer.ataAtLastPod, location: null }
        : null,
      estimatedDelivery: primaryContainer.etaAtLastPod
        ? { time: primaryContainer.etaAtLastPod, actualTime: null, location: null, timezone: null }
        : null
    },
    route: [],
    transportStatuses: primaryContainer.milestones ?? [],
    sailingSchedule: [],
    routingLegs: [],
    containers,
    references: {
      masterBill: null,
      bookingNumbers: [],
      external: [],
      information: []
    }
  };
}

async function fetchCoscoEndpoint(endpoint, request, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const baseUrl = options.baseUrl ?? COSCO_TRACKING_BASE;
  const referer =
    options.referer ??
    `${COSCO_PAGE_URL}?trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

  try {
    const upstream = await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        tz: "Asia/Shanghai",
        ...(options.cookie ? { Cookie: options.cookie } : {})
      },
      body: JSON.stringify({
        businessNumber: request.number,
        businessNumberType: request.businessNumberType,
        notFilterResult: false
      }),
      signal: controller.signal
    });

    const rawText = await upstream.text();

    if (!upstream.ok) {
      throw new HttpError(502, `COSCO 接口返回 HTTP ${upstream.status}`);
    }

    let decoded;
    try {
      decoded = decodeCoscoPayload(rawText);
    } catch (error) {
      throw new HttpError(502, "COSCO 响应解码失败", error.message);
    }

    if (decoded?.code !== "200" || decoded?.success !== true || decoded?.result == null) {
      const status = decoded?.code === "404" ? 404 : 502;
      throw new HttpError(
        status,
        decoded?.message || "COSCO 没有返回有效的跟踪结果",
        { upstreamCode: decoded?.code ?? null }
      );
    }

    return decoded.result;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "COSCO 查询超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCoscoPageCookies(html, headers) {
  const cookies = [];
  const setCookies = headers?.getSetCookie?.() ?? [];
  for (const value of setCookies) {
    const cookie = value.split(";", 1)[0];
    if (cookie) cookies.push(cookie);
  }

  for (const match of String(html).matchAll(/document\.cookie\s*=\s*"([^;]+);/g)) {
    cookies.push(match[1]);
  }

  return [...new Set(cookies)].join("; ");
}

async function getCoscoPublicCookies(request) {
  if (coscoPublicCookieCache?.expiresAt > Date.now()) {
    return coscoPublicCookieCache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_CORE_TIMEOUT_MS);
  const pageUrl = `${COSCO_PUBLIC_TRACKING_PAGE}?lang=en&trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

  try {
    const response = await fetch(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    const html = await response.text();
    const value = extractCoscoPageCookies(html, response.headers);
    coscoPublicCookieCache = {
      value,
      expiresAt: Date.now() + 5 * 60_000
    };
    return value;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "COSCO 公共查询页初始化超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoscoContainers(request) {
  const referer = `${COSCO_PUBLIC_TRACKING_PAGE}?lang=en&trackingType=CONTAINER&number=${encodeURIComponent(request.number)}`;
  let finalError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const cookie = await getCoscoPublicCookies(request);
      return await fetchCoscoEndpoint("containers", request, {
        baseUrl: COSCO_TRACKING_EX_BASE,
        referer,
        cookie,
        timeoutMs: NETWORK_CORE_TIMEOUT_MS
      });
    } catch (error) {
      finalError = error;
      coscoPublicCookieCache = null;
    }
  }

  throw finalError;
}

async function optionalCoscoEndpoint(endpoint, request, fallback, options = {}) {
  try {
    return await fetchCoscoEndpoint(endpoint, request, options);
  } catch {
    return fallback;
  }
}

async function fetchCoscoShipmentContainers(request) {
  const result = await fetchCoscoEndpoint("containerInfo", request, {
    timeoutMs: NETWORK_ENRICHMENT_TIMEOUT_MS
  });
  return Array.isArray(result) ? result : [];
}

async function fetchCoscoTrackingViaNetwork(request) {
  if (request.type === "CONTAINER") {
    const containers = await fetchCoscoContainers(request);
    const fetchedAt = new Date().toISOString();
    return {
      snapshot: normalizeCoscoContainerSnapshot(containers, request, fetchedAt, {
        queryChannel: COSCO_QUERY_CHANNELS.NETWORK
      }),
      raw: { containers }
    };
  }

  const [detail, bookingInfo, containerInfo] = await Promise.all([
    fetchCoscoEndpoint("detail", request, { timeoutMs: NETWORK_CORE_TIMEOUT_MS }),
    optionalCoscoEndpoint("bookingInfo", request, {}, {
      timeoutMs: NETWORK_ENRICHMENT_TIMEOUT_MS
    }),
    fetchCoscoShipmentContainers(request).catch(() => [])
  ]);
  const fetchedAt = new Date().toISOString();
  const snapshot = normalizeCoscoSnapshot(detail, request, fetchedAt, {
    queryChannel: COSCO_QUERY_CHANNELS.NETWORK,
    bookingInfo,
    containerInfo
  });

  return {
    snapshot,
    enrichment: {
      containerDetailsComplete: snapshotHasCompleteContainerDetails(snapshot, request)
    },
    raw: {
      detail,
      bookingInfo,
      containerInfo
    }
  };
}

async function fetchCoscoTrackingWithPlaywright(request) {
  let result;

  try {
    result = await fetchCoscoTrackingViaPlaywright(request, {
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS
    });
  } catch (error) {
    throw new HttpError(
      error?.httpStatus ?? 502,
      error?.message || "COSCO Playwright 通道查询失败",
      error?.upstreamCode ? { upstreamCode: error.upstreamCode } : undefined
    );
  }

  const fetchedAt = new Date().toISOString();
  const { detail, bookingInfo, containerInfo, containers, browser } = result;

  if (request.type === "CONTAINER") {
    return {
      snapshot: normalizeCoscoContainerSnapshot(containers, request, fetchedAt, {
        queryChannel: COSCO_QUERY_CHANNELS.PLAYWRIGHT
      }),
      raw: { containers, browser }
    };
  }

  const snapshot = normalizeCoscoSnapshot(detail, request, fetchedAt, {
      queryChannel: COSCO_QUERY_CHANNELS.PLAYWRIGHT,
      bookingInfo,
      containerInfo
    });

  if (!snapshotHasCompleteContainerDetails(snapshot, request)) {
    throw new HttpError(502, "COSCO DOM 通道未捕获到箱号明细");
  }

  return {
    snapshot,
    raw: {
      detail,
      bookingInfo,
      containerInfo,
      browser
    }
  };
}

async function fetchCoscoTracking(request, queryChannel) {
  if (queryChannel.code === "AUTO") {
    try {
      const result = await fetchCoscoTrackingViaNetwork(request);
      return {
        ...result,
        strategy: {
          requested: "AUTO",
          used: "NETWORK",
          fallbackUsed: false
        }
      };
    } catch (networkError) {
      try {
        const result = await fetchCoscoTrackingWithPlaywright(request);
        return {
          ...result,
          strategy: {
            requested: "AUTO",
            used: "PLAYWRIGHT",
            fallbackUsed: true,
            primaryError: networkError?.message ?? "网络接口不可用"
          }
        };
      } catch (playwrightError) {
        throw new HttpError(502, "COSCO 两个查询通道均不可用", {
          network: networkError?.message ?? "网络接口失败",
          playwright: playwrightError?.message ?? "DOM 通道失败"
        });
      }
    }
  }

  if (queryChannel.code === "PLAYWRIGHT") {
    return fetchCoscoTrackingWithPlaywright(request);
  }

  return fetchCoscoTrackingViaNetwork(request);
}

function probeResult(channel, available, startedAt, finishedAt, error = null) {
  return {
    channel,
    available,
    status: available ? "available" : "unavailable",
    responseTimeMs: Math.max(0, finishedAt - startedAt),
    error: error?.message ?? null
  };
}

export async function runCoscoChannelChecks(input = CHANNEL_C_MONITOR_REQUEST, options = {}) {
  const request = normalizeTrackingRequest(input);
  const now = options.now ?? Date.now;
  const networkProbe =
    options.networkProbe ??
    (async () => {
      if (request.type === "CONTAINER") {
        const result = await fetchCoscoContainers(request);
        if (!Array.isArray(result) || result.length === 0) {
          throw new Error("箱号接口没有返回动态");
        }
        return;
      }
      const detail = await fetchCoscoEndpoint("detail", request);
      if (!detail?.cargoTrackingSummary) throw new Error("运输详情缺少摘要");
    });
  const playwrightProbe =
    options.playwrightProbe ??
    (async () => {
      const result = await fetchCoscoTrackingViaPlaywright(request, {
        timeoutMs: PLAYWRIGHT_TIMEOUT_MS
      });
      if (request.type === "CONTAINER") {
        if (!Array.isArray(result?.containers) || result.containers.length === 0) {
          throw new Error("DOM 通道没有捕获到箱号结果");
        }
        return;
      }
      if (!result?.detail?.cargoTrackingSummary) {
        throw new Error("DOM 通道没有捕获到运输摘要");
      }
    });

  const runProbe = async (channel, probe) => {
    const startedAt = now();
    try {
      await probe(request);
      return probeResult(channel, true, startedAt, now());
    } catch (error) {
      return probeResult(channel, false, startedAt, now(), error);
    }
  };

  const [network, playwright] = await Promise.all([
    runProbe("NETWORK", networkProbe),
    runProbe("PLAYWRIGHT", playwrightProbe)
  ]);

  return {
    checkedAt: new Date(now()).toISOString(),
    strategy: {
      preferred: "NETWORK",
      fallback: "PLAYWRIGHT"
    },
    request: { type: request.type, number: request.number },
    channels: { NETWORK: network, PLAYWRIGHT: playwright }
  };
}

export function getChannelCHealthStatus() {
  return {
    channel: "NETWORK",
    channelNumber: 1,
    channelLabel: "网络接口",
    legacyChannel: "C",
    source: "COSCO_INTERNAL_WEB_API",
    ...channelCHealth
  };
}

export async function runChannelCHealthCheck(options = {}) {
  if (channelCMonitorPromise) return channelCMonitorPromise;

  const now = options.now ?? Date.now;
  const fetchDetail =
    options.fetchDetail ?? ((request) => fetchCoscoEndpoint("detail", request));
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1_500);
  const wait =
    options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const startedAt = now();
  channelCHealth.status = "checking";
  channelCHealth.available = null;
  channelCHealth.lastError = null;

  channelCMonitorPromise = (async () => {
    let attemptCount = 0;

    try {
      const trackingRequest = normalizeTrackingRequest(CHANNEL_C_MONITOR_REQUEST);
      let detail = null;
      let finalError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attemptCount = attempt;

        try {
          detail = await fetchDetail(trackingRequest);
          if (!detail?.cargoTrackingSummary) {
            throw new Error("COSCO 返回结果缺少运输摘要");
          }
          finalError = null;
          break;
        } catch (error) {
          finalError = error;
          if (attempt < maxAttempts) await wait(retryDelayMs);
        }
      }

      if (finalError) throw finalError;

      channelCHealth.status = "available";
      channelCHealth.available = true;
      channelCHealth.consecutiveFailures = 0;
    } catch (error) {
      channelCHealth.status = "unavailable";
      channelCHealth.available = false;
      channelCHealth.lastError = error?.message || "通道一网络接口探测失败";
      channelCHealth.consecutiveFailures += 1;
    } finally {
      const finishedAt = now();
      const checkedAt = new Date(finishedAt).toISOString();
      channelCHealth.lastCheckedAt = checkedAt;
      channelCHealth.responseTimeMs = Math.max(0, finishedAt - startedAt);
      channelCHealth.lastAttemptCount = attemptCount;

      if (channelCHealth.available) {
        channelCHealth.lastSuccessAt = checkedAt;
      } else {
        channelCHealth.lastFailureAt = checkedAt;
      }
    }

    return getChannelCHealthStatus();
  })();

  try {
    return await channelCMonitorPromise;
  } finally {
    channelCMonitorPromise = null;
  }
}

export function startChannelCMonitor() {
  if (!CHANNEL_C_MONITOR_ENABLED || channelCMonitorTimer) return;

  const executeCheck = async () => {
    const status = await runChannelCHealthCheck();
    channelCHealth.nextCheckAt = new Date(
      Date.now() + CHANNEL_C_MONITOR_INTERVAL_MS
    ).toISOString();

    const message = status.available
      ? `available (${status.responseTimeMs} ms)`
      : `unavailable: ${status.lastError}`;
    console.log(`[channel-network-monitor] ${message}`);
  };

  void executeCheck();
  channelCMonitorTimer = setInterval(() => {
    void executeCheck();
  }, CHANNEL_C_MONITOR_INTERVAL_MS);
  channelCMonitorTimer.unref();
}

export function stopChannelCMonitor() {
  if (channelCMonitorTimer) {
    clearInterval(channelCMonitorTimer);
    channelCMonitorTimer = null;
  }
  channelCHealth.nextCheckAt = null;
}

function snapshotHasCompleteContainerDetails(snapshot, trackingRequest) {
  if (trackingRequest.type === "CONTAINER") {
    return Array.isArray(snapshot?.containers) && snapshot.containers.length > 0;
  }

  const expectedContainerCount = (snapshot?.summary?.containers ?? []).reduce(
    (total, container) => total + Number(container?.quantity ?? container?.count ?? 0),
    0
  );
  return expectedContainerCount <= 0 || (snapshot?.containers?.length ?? 0) > 0;
}

async function handleTrackRequest(request, response, forcedCarrier, forcedChannel) {
  const input = await readJsonBody(request);
  const carrierCode = normalizeCarrierCode(forcedCarrier ?? input.carrier ?? "COSCO");
  const carrier = CARRIER_ADAPTERS[carrierCode];

  if (!carrier.enabled) {
    throw new HttpError(501, `${carrier.name} 适配器尚未接入`);
  }

  const trackingRequest = normalizeTrackingRequest(input);
  const queryChannel = normalizeQueryChannel(
    forcedChannel ?? input.channel ?? carrier.defaultChannel ?? "NETWORK"
  );
  const cacheKey = `${carrierCode}:${queryChannel.code}:${trackingRequest.type}:${trackingRequest.number}`;
  const cached = cache.get(cacheKey);

  if (
    cached &&
    cached.expiresAt > Date.now() &&
    snapshotHasCompleteContainerDetails(cached.value?.snapshot, trackingRequest)
  ) {
    sendJson(response, 200, { ...cached.value, cached: true });
    return;
  }

  if (cached) cache.delete(cacheKey);

  let requestPromise = inFlightTrackingRequests.get(cacheKey);
  if (!requestPromise) {
    requestPromise = fetchCoscoTracking(trackingRequest, queryChannel);
    inFlightTrackingRequests.set(cacheKey, requestPromise);
  }

  let value;
  try {
    value = await requestPromise;
  } finally {
    if (inFlightTrackingRequests.get(cacheKey) === requestPromise) {
      inFlightTrackingRequests.delete(cacheKey);
    }
  }
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  sendJson(response, 200, { ...value, cached: false });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/vendor/element-plus.css") {
    const content = await readFile(ELEMENT_PLUS_CSS);
    setCommonHeaders(response);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[".css"],
      "Cache-Control": "public, max-age=86400"
    });
    response.end(content);
    return;
  }

  const flagMatch = url.pathname.match(/^\/vendor\/flags\/(1x1|4x3)\/([a-z]{2})\.svg$/);
  if (flagMatch) {
    const [, ratio, countryCode] = flagMatch;
    try {
      const content = await readFile(join(FLAG_ICONS_DIR, ratio, `${countryCode}.svg`));
      setCommonHeaders(response);
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[".svg"],
        "Cache-Control": "public, max-age=86400"
      });
      response.end(content);
      return;
    } catch (error) {
      if (error?.code === "ENOENT") throw new HttpError(404, "国旗资源不存在");
      throw error;
    }
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    throw new HttpError(404, "页面不存在");
  }

  try {
    const content = await readFile(filePath);
    setCommonHeaders(response);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new HttpError(404, "页面不存在");
    }
    throw error;
  }
}

export const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        channel: "NETWORK",
        channels: {
          NETWORK: getChannelCHealthStatus(),
          PLAYWRIGHT: {
            channel: "PLAYWRIGHT",
            channelNumber: 2,
            channelLabel: "Playwright 浏览器",
            status: "configured",
            enabled: true
          }
        },
        time: new Date().toISOString()
      });
      return;
    }

    if (
      request.method === "GET" &&
      ["/api/channels/c/status", "/api/channels/network/status"].includes(url.pathname)
    ) {
      sendJson(response, 200, getChannelCHealthStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/channels") {
      sendJson(response, 200, { channels: listCoscoQueryChannels() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/channels/check") {
      const input = await readJsonBody(request);
      const probeRequest = {
        type: input.type ?? CHANNEL_C_MONITOR_REQUEST.type,
        number: input.number ?? CHANNEL_C_MONITOR_REQUEST.number
      };
      sendJson(response, 200, await runCoscoChannelChecks(probeRequest));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/carriers") {
      sendJson(response, 200, { carriers: listCarrierAdapters() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/track") {
      await handleTrackRequest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/track/cosco") {
      await handleTrackRequest(request, response, "COSCO", "NETWORK");
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/track/cosco/network") {
      await handleTrackRequest(request, response, "COSCO", "NETWORK");
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/track/cosco/playwright") {
      await handleTrackRequest(request, response, "COSCO", "PLAYWRIGHT");
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    throw new HttpError(405, "不支持的请求方法");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    sendJson(response, status, {
      error: {
        message: error?.message || "服务器内部错误",
        details: error instanceof HttpError ? error.details : undefined
      }
    });
  }
});

server.on("close", () => {
  stopChannelCMonitor();
  void closeCoscoPlaywrightBrowser();
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Dual-channel COSCO tracker running at http://127.0.0.1:${PORT}`);
    startChannelCMonitor();
  });
}
