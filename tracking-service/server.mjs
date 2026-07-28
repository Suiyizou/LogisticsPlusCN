import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  brotliCompress,
  constants as zlibConstants,
  gzip
} from "node:zlib";
import {
  closeCoscoPlaywrightBrowser,
  fetchCoscoTrackingViaPlaywright
} from "./channels/cosco-playwright.mjs";
import {
  closeCmaPlaywrightBrowser,
  fetchCmaTrackingViaPlaywright
} from "./channels/cma-playwright.mjs";
import { decodeCoscoPayload } from "./lib/cosco-payload.mjs";
import { normalizeCmaSnapshot } from "./lib/cma-tracking.mjs";
import {
  createCoscoProxyClient,
  proxyStatus,
  readCoscoProxyConfig
} from "./lib/cosco-proxy.mjs";
import {
  createCoscoProxyPool,
  readCoscoProxyPoolConfig,
  runWithProxyPoolRetries
} from "./lib/cosco-proxy-pool.mjs";
import {
  createCoscoCircuitBreaker,
  createCoscoQueryGate
} from "./lib/cosco-request-guard.mjs";
import {
  createBatchTaskRegistry,
  normalizeBatchTaskId
} from "./lib/batch-task-registry.mjs";

export { decodeCoscoPayload } from "./lib/cosco-payload.mjs";
export { normalizeCmaSnapshot, parseCmaLocalDateTime } from "./lib/cma-tracking.mjs";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");
const ELEMENT_PLUS_CSS = join(
  ROOT_DIR,
  "node_modules",
  "element-plus",
  "dist",
  "index.css"
);
const XLSX_MODULE = join(ROOT_DIR, "node_modules", "xlsx", "xlsx.mjs");
const FLAG_ICONS_DIR = join(ROOT_DIR, "node_modules", "flag-icons", "flags");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

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
const PROXY_NETWORK_CORE_TIMEOUT_MS = boundedEnvironmentInteger(
  process.env.COSCO_PROXY_CORE_TIMEOUT_MS,
  15_000,
  NETWORK_CORE_TIMEOUT_MS,
  30_000
);
const PROXY_NETWORK_ENRICHMENT_TIMEOUT_MS = boundedEnvironmentInteger(
  process.env.COSCO_PROXY_ENRICHMENT_TIMEOUT_MS,
  8_000,
  NETWORK_ENRICHMENT_TIMEOUT_MS,
  20_000
);
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
  type: process.env.CHANNEL_C_MONITOR_TYPE ?? "BOOKING",
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
  },
  PROXY: {
    code: "PROXY",
    number: 3,
    label: "SOCKS5 proxy",
    source: "COSCO_INTERNAL_WEB_API_PROXY"
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
    channels: ["NETWORK", "PLAYWRIGHT", "PROXY"],
    defaultChannel: "AUTO",
    enabled: true,
    source: "COSCO_INTERNAL_WEB_API"
  },
  CMA: {
    code: "CMA",
    name: "CMA CGM",
    channel: "PLAYWRIGHT",
    channels: ["PLAYWRIGHT"],
    defaultChannel: "PLAYWRIGHT",
    enabled: true,
    source: "CMA_SERVER_RENDERED_HTML"
  }
});

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
});
const COMPRESSIBLE_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs", ".json", ".svg"]);
const HASHED_ASSET_PATTERN = /[.-][a-z0-9_-]{8,}\.(?:css|gif|ico|jpe?g|js|json|png|svg|woff2?)$/i;
const STATIC_COMPRESSION_CACHE_LIMIT = 64;
const compressWithBrotli = promisify(brotliCompress);
const compressWithGzip = promisify(gzip);
const staticCompressionCache = new Map();

const COSCO_PROXY_CONFIG = readCoscoProxyConfig();
const coscoProxyClient = createCoscoProxyClient(COSCO_PROXY_CONFIG);
const COSCO_PROXY_POOL_CONFIG = readCoscoProxyPoolConfig();
const coscoProxyPool = createCoscoProxyPool(COSCO_PROXY_POOL_CONFIG);
const coscoQueryGate = createCoscoQueryGate({
  minIntervalMs: process.env.COSCO_QUERY_MIN_INTERVAL_MS,
  maxIntervalMs: process.env.COSCO_QUERY_MAX_INTERVAL_MS,
  queueLimit: process.env.COSCO_QUERY_QUEUE_LIMIT,
  queueTimeoutMs: process.env.COSCO_QUERY_QUEUE_TIMEOUT_MS
});

function boundedEnvironmentInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function coscoCoreTimeoutMs(options = {}) {
  return options.proxyMode ? PROXY_NETWORK_CORE_TIMEOUT_MS : NETWORK_CORE_TIMEOUT_MS;
}

function coscoEnrichmentTimeoutMs(options = {}) {
  return options.proxyMode
    ? PROXY_NETWORK_ENRICHMENT_TIMEOUT_MS
    : NETWORK_ENRICHMENT_TIMEOUT_MS;
}
const coscoUpstreamGate = createCoscoQueryGate({
  minIntervalMs: process.env.COSCO_UPSTREAM_MIN_INTERVAL_MS ?? 10_000,
  maxIntervalMs: process.env.COSCO_UPSTREAM_MAX_INTERVAL_MS ?? 12_000,
  queueLimit: process.env.COSCO_UPSTREAM_QUEUE_LIMIT ?? 500,
  queueTimeoutMs: process.env.COSCO_UPSTREAM_QUEUE_TIMEOUT_MS ?? 600_000
});
const coscoCircuitBreakers = Object.freeze({
  DIRECT: createCoscoCircuitBreaker({
    cooldownMs: process.env.COSCO_BLOCK_COOLDOWN_MS,
    failureThreshold: process.env.COSCO_CIRCUIT_FAILURE_THRESHOLD
  }),
  PROXY: createCoscoCircuitBreaker({
    cooldownMs: process.env.COSCO_PROXY_BLOCK_COOLDOWN_MS ?? process.env.COSCO_BLOCK_COOLDOWN_MS,
    failureThreshold: process.env.COSCO_PROXY_CIRCUIT_FAILURE_THRESHOLD
      ?? process.env.COSCO_CIRCUIT_FAILURE_THRESHOLD
  })
});
const batchTaskRegistry = createBatchTaskRegistry({
  minIntervalMs: process.env.BATCH_QUERY_MIN_INTERVAL_MS,
  maxIntervalMs: process.env.BATCH_QUERY_MAX_INTERVAL_MS
});

const cache = new Map();
const inFlightTrackingRequests = new Map();
const coscoPublicCookieStates = new Map();
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

function batchCancelledHttpError() {
  return new HttpError(409, "Batch tracking task was cancelled", {
    code: "BATCH_CANCELLED"
  });
}

function coscoRouteKey(options = {}) {
  return options.proxyMode ? "PROXY" : "DIRECT";
}

function coscoCircuitBreakerFor(options = {}) {
  return coscoCircuitBreakers[coscoRouteKey(options)];
}

function coscoBlockedHttpError(options = {}) {
  const breaker = coscoCircuitBreakerFor(options);
  const retryAfterMs = Math.max(1_000, breaker.remainingMs());
  return new HttpError(503, "COSCO temporarily rejected this outbound IP", {
    code: "COSCO_UPSTREAM_BLOCKED",
    upstreamStatus: 403,
    route: coscoRouteKey(options),
    retryAfterMs
  });
}

export function parseRetryAfter(value, now = Date.now()) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1_000, Math.ceil(seconds * 1_000));
  }
  const date = Date.parse(normalized);
  return Number.isFinite(date) ? Math.max(1_000, date - now) : null;
}

function coscoRateLimitedHttpError(retryAfterMs, options = {}) {
  const breaker = coscoCircuitBreakerFor(options);
  const safeRetryAfterMs = Math.max(1_000, Number(retryAfterMs) || 60_000);
  breaker.recordFailure({ retryAfterMs: safeRetryAfterMs, immediate: true });
  return new HttpError(429, "COSCO temporarily rate-limited this server", {
    code: "COSCO_UPSTREAM_RATE_LIMITED",
    upstreamStatus: 429,
    route: coscoRouteKey(options),
    retryAfterMs: Math.max(safeRetryAfterMs, breaker.remainingMs())
  });
}

function ensureCoscoCircuitAvailable(options = {}) {
  if (coscoCircuitBreakerFor(options).remainingMs() > 0) {
    throw coscoBlockedHttpError(options);
  }
}

function isCoscoBlockedError(error) {
  return error?.details?.code === "COSCO_UPSTREAM_BLOCKED" || error?.upstreamStatus === 403;
}

function isCoscoProtectionError(error) {
  return isCoscoBlockedError(error)
    || error?.details?.code === "COSCO_UPSTREAM_RATE_LIMITED"
    || error?.details?.code === "COSCO_UPSTREAM_UNAVAILABLE"
    || error?.code === "COSCO_QUEUE_BUSY"
    || error?.status === 429
    || error?.httpStatus === 429
    || error?.upstreamStatus === 429;
}

function signalForTimeout(timeoutController, externalSignal) {
  return externalSignal
    ? AbortSignal.any([timeoutController.signal, externalSignal])
    : timeoutController.signal;
}

async function fetchCoscoUpstream(url, requestOptions = {}, routeOptions = {}) {
  if (!routeOptions.proxyMode) return fetch(url, requestOptions);
  if (!coscoProxyClient) {
    throw new HttpError(503, "COSCO proxy channel is not configured", {
      code: "COSCO_PROXY_NOT_CONFIGURED",
      route: "PROXY"
    });
  }
  try {
    return await coscoProxyClient.fetch(url, requestOptions);
  } catch (error) {
    if (requestOptions.signal?.aborted || error?.name === "AbortError") throw error;
    throw new HttpError(502, "Configured COSCO proxy is unavailable", {
      code: "COSCO_PROXY_UNAVAILABLE",
      route: "PROXY"
    });
  }
}

function coscoPublicCookieState(options = {}) {
  const key = coscoRouteKey(options);
  if (!coscoPublicCookieStates.has(key)) {
    coscoPublicCookieStates.set(key, { cache: null, promise: null });
  }
  return coscoPublicCookieStates.get(key);
}

function secureTextEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");
  return leftBuffer.length === rightBuffer.length
    && leftBuffer.length > 0
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireProxyAdapterAuthorization(request, queryChannel) {
  if (queryChannel.code !== "PROXY") return;
  const expected = String(process.env.TRACKING_ADAPTER_KEY ?? "").trim();
  if (!expected) {
    throw new HttpError(503, "Proxy channel internal authorization is not configured", {
      code: "COSCO_PROXY_ACCESS_NOT_CONFIGURED"
    });
  }
  const provided = String(request.headers["x-tracking-adapter-key"] ?? "").trim();
  if (!secureTextEquals(provided, expected)) {
    throw new HttpError(403, "Proxy tracking channel requires business authorization", {
      code: "COSCO_PROXY_FORBIDDEN"
    });
  }
}

function setCommonHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
}

function staticCacheControl(pathname) {
  if (pathname.endsWith(".html") || pathname === "/") {
    return "no-cache, no-store, must-revalidate";
  }
  if (HASHED_ASSET_PATTERN.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache, must-revalidate";
}

function staticEtag(content) {
  const digest = createHash("sha256").update(content).digest("base64url").slice(0, 16);
  return `W/\"${content.length.toString(16)}-${digest}\"`;
}

function acceptsEncoding(request, encoding) {
  const value = String(request.headers["accept-encoding"] || "").toLowerCase();
  const entries = value.split(",").map((entry) => {
    const [name, ...parameters] = entry.trim().split(";");
    return {
      name,
      allowed: !parameters.some((parameter) => /^q=0(?:\.0*)?$/.test(parameter.trim()))
    };
  });
  const explicit = entries.find((entry) => entry.name === encoding);
  if (explicit) return explicit.allowed;
  return entries.some((entry) => entry.name === "*" && entry.allowed);
}

function rememberCompressedStatic(key, content) {
  if (staticCompressionCache.has(key)) staticCompressionCache.delete(key);
  staticCompressionCache.set(key, content);
  while (staticCompressionCache.size > STATIC_COMPRESSION_CACHE_LIMIT) {
    staticCompressionCache.delete(staticCompressionCache.keys().next().value);
  }
}

async function cachedCompressedStatic(key, compress) {
  let pending = staticCompressionCache.get(key);
  if (!pending) {
    pending = Promise.resolve().then(compress);
    rememberCompressedStatic(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    if (staticCompressionCache.get(key) === pending) staticCompressionCache.delete(key);
    throw error;
  }
}

async function compressStaticContent(request, content, extension, etag) {
  if (content.length < 1024 || !COMPRESSIBLE_EXTENSIONS.has(extension)) {
    return { content, encoding: null };
  }
  if (acceptsEncoding(request, "br")) {
    const key = `${etag}:br`;
    const compressed = await cachedCompressedStatic(key, () =>
      compressWithBrotli(content, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 5
        }
      })
    );
    return { content: compressed, encoding: "br" };
  }
  if (acceptsEncoding(request, "gzip")) {
    const key = `${etag}:gzip`;
    const compressed = await cachedCompressedStatic(key, () =>
      compressWithGzip(content, { level: 6 })
    );
    return { content: compressed, encoding: "gzip" };
  }
  return { content, encoding: null };
}

async function sendStaticContent(request, response, content, options) {
  const extension = options.extension || "";
  const etag = staticEtag(content);
  const headers = {
    "Content-Type": options.contentType,
    "Cache-Control": options.cacheControl,
    ETag: etag
  };

  if (COMPRESSIBLE_EXTENSIONS.has(extension)) headers.Vary = "Accept-Encoding";

  if (request.headers["if-none-match"] === etag) {
    setCommonHeaders(response);
    response.writeHead(304, headers);
    response.end();
    return;
  }

  const representation = await compressStaticContent(request, content, extension, etag);
  if (representation.encoding) headers["Content-Encoding"] = representation.encoding;
  headers["Content-Length"] = representation.content.length;
  setCommonHeaders(response);
  response.writeHead(200, headers);
  response.end(request.method === "HEAD" ? undefined : representation.content);
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
  const requestedType = String(input?.type ?? "BOOKING").toUpperCase();
  const type = requestedType === "BILLOFLADING" ? "BOOKING" : requestedType;
  const typeConfig = TRACKING_TYPES[type];

  if (!typeConfig) {
    throw new HttpError(400, "不支持的查询类型");
  }

  const normalizedNumber = String(input?.number ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  const number = normalizedNumber;

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

function normalizeShipmentContainer(container) {
  const currentMilestone = container?.currentMilestone ?? container?.milestones?.[0] ?? null;
  return {
    number: normalizeContainerNumber(container),
    type: container?.containerType ?? null,
    sealNumber: container?.sealNumber ?? null,
    trafficTerm: container?.trafficTerm ?? null,
    transportMode: currentMilestone?.transportMode ?? null,
    currentLocation:
      currentMilestone?.eventLocationName ?? currentMilestone?.eventLocation ?? null,
    latestEvent: currentMilestone?.eventName ?? null,
    latestEventTime: currentMilestone?.actualEventDateTime ?? null,
    etaAtLastPod: container?.etaAtLastPod ?? null,
    ataAtLastPod: container?.ataAtLastPod ?? null,
    detailSource: container?.detailSource ?? "SHIPMENT_QUERY",
    needsEnrichment: containerNeedsSubquery(container),
    milestones: (container?.milestones ?? [])
      .map(normalizeContainerMilestone)
      .filter(Boolean),
    referenceNumbers: (container?.refNumbers ?? [])
      .map(normalizeReferenceValue)
      .filter(Boolean)
  };
}

export function normalizeCoscoContainerList(containerInfo) {
  return (Array.isArray(containerInfo) ? containerInfo : [])
    .map(normalizeShipmentContainer)
    .filter((container) => container.number);
}

function normalizeCoscoBookingReferences(bookingInfo = {}, containerInfo = []) {
  const externalReferences = (bookingInfo.externalReferenceNumbers ?? [])
    .map(normalizeReferenceValue)
    .filter(Boolean);
  const containerReferences = (Array.isArray(containerInfo) ? containerInfo : [])
    .flatMap((container) =>
      (container.refNumbers ?? []).map(normalizeReferenceValue).filter(Boolean)
    );

  return {
    external: [...new Set([...externalReferences, ...containerReferences])],
    business: extractBusinessReferences(bookingInfo),
    information: (bookingInfo.referenceInformation ?? [])
      .map((item) => ({
        name: item.name ?? null,
        value: item.value ?? null,
        sequence: item.seq ?? null
      }))
      .filter((item) => item.name && item.value)
  };
}

export function normalizeCoscoSupplementalDetails(
  bookingInfo,
  containerInfo,
  request,
  fetchedAt
) {
  return {
    fetchedAt,
    tracking: {
      type: request.type,
      number: request.number
    },
    containers: normalizeCoscoContainerList(containerInfo),
    references: normalizeCoscoBookingReferences(bookingInfo, containerInfo)
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

function normalizeReferenceName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function extractBusinessReferences(bookingInfo = {}) {
  const information = Array.isArray(bookingInfo.referenceInformation)
    ? bookingInfo.referenceInformation
    : [];
  const findByName = (patterns) => {
    const match = information.find((item) => {
      const name = normalizeReferenceName(item?.name ?? item?.label ?? item?.type);
      return patterns.some((pattern) => pattern.test(name));
    });
    return normalizeReferenceValue(match);
  };

  return {
    clientNameCode:
      bookingInfo.clientNameCode ??
      bookingInfo.customerCode ??
      findByName([/client name/, /client code/, /customer.*code/, /客户.*代码/]) ??
      null,
    clientPoNumber:
      bookingInfo.clientPoNumber ??
      bookingInfo.customerPoNumber ??
      findByName([/client.*po/, /customer.*po/, /purchase order/, /客户订单/]) ??
      null,
    forwarderJobNumber:
      bookingInfo.forwarderJobNumber ??
      bookingInfo.jobNumber ??
      findByName([/forwarder.*job/, /job number/, /freight.*order/, /货代订单/]) ??
      null
  };
}

function containerNeedsSubquery(container) {
  const currentMilestone = container?.currentMilestone ?? container?.milestones?.[0] ?? null;
  return Boolean(
    normalizeContainerNumber(container) &&
      (!Array.isArray(container?.milestones) ||
        container.milestones.length === 0 ||
        !currentMilestone?.eventName ||
        !currentMilestone?.actualEventDateTime ||
        !(currentMilestone?.eventLocationName ?? currentMilestone?.eventLocation) ||
        !currentMilestone?.transportMode)
  );
}

function mergeContainerMilestone(primary, fallback) {
  const merged = { ...(fallback ?? {}) };
  for (const [key, value] of Object.entries(primary ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export async function enrichCoscoShipmentContainers(containerInfo, fetchContainerDetails) {
  const containers = Array.isArray(containerInfo) ? containerInfo : [];
  if (containers.length === 0 || typeof fetchContainerDetails !== "function") return containers;

  const enriched = [...containers];
  const batchSize = 4;

  for (let offset = 0; offset < containers.length; offset += batchSize) {
    const batch = containers.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (container) => {
        if (!containerNeedsSubquery(container)) return container;

        const number = normalizeContainerNumber(container);
        const request = normalizeTrackingRequest({ type: "CONTAINER", number });

        try {
          const response = await fetchContainerDetails(request);
          const detail = selectRequestedContainers(response, request)[0];
          if (!detail) return container;

          return {
            ...detail,
            ...container,
            containerNumber: container.containerNumber ?? detail.containerNumber ?? null,
            containerNumberWithCheckDigit:
              container.containerNumberWithCheckDigit ??
              detail.containerNumberWithCheckDigit ??
              null,
            containerType: container.containerType ?? detail.containerType ?? null,
            sealNumber: container.sealNumber ?? detail.sealNumber ?? null,
            milestones: Array.isArray(detail.milestones) && detail.milestones.length > 0
              ? detail.milestones
              : container.milestones ?? [],
            currentMilestone: mergeContainerMilestone(
              container.currentMilestone,
              detail.milestones?.[0] ?? detail.currentMilestone
            ),
            etaAtLastPod: container.etaAtLastPod ?? detail.etaAtLastPod ?? null,
            ataAtLastPod: container.ataAtLastPod ?? detail.ataAtLastPod ?? null,
            detailSource: "CONTAINER_SUBQUERY"
          };
        } catch (error) {
          if (isCoscoProtectionError(error)) throw error;
          return { ...container, detailSource: "SHIPMENT_QUERY" };
        }
      })
    );

    results.forEach((container, index) => {
      enriched[offset + index] = container;
    });
  }

  return enriched;
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
  const normalizedReferences = normalizeCoscoBookingReferences(bookingInfo, containerInfo);
  const routingLegs = buildRoutingLegs(result);
  const actualDepartureLeg = routingLegs.find((leg) => leg.actualDeparture);
  const actualArrivalLeg = [...routingLegs].reverse().find((leg) => leg.actualArrival);
  const finalRouteNode = [...(result?.cargoTrackingFullChain ?? [])]
    .reverse()
    .find((node) => node.locationType === "FND");
  const businessReferences = normalizedReferences.business;

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
            // The COSCO payload uses both pairs depending on which query path
            // answered. Preserve the source phase (for example EXPORT) in the
            // durable snapshot instead of keeping only the display event name.
            stage: latest.stageType ?? latest.stage ?? null,
            oceanStage: latest.eventStage ?? latest.oceanStage ?? null,
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
    containers: normalizeCoscoContainerList(containerInfo),
    references: {
      masterBill: summary.blNumber ?? null,
      bookingNumbers: summary.bookingNumber ?? [],
      ...normalizedReferences,
      business: businessReferences
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
      business: {
        clientNameCode: null,
        clientPoNumber: null,
        forwarderJobNumber: null
      },
      information: []
    }
  };
}

async function fetchCoscoEndpoint(endpoint, request, options = {}) {
  ensureCoscoCircuitAvailable(options);
  return coscoUpstreamGate.run(
    () => {
      ensureCoscoCircuitAvailable(options);
      return fetchCoscoEndpointNow(endpoint, request, options);
    },
    { signal: options.signal }
  );
}

async function fetchCoscoEndpointNow(endpoint, request, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const baseUrl = options.baseUrl ?? COSCO_TRACKING_BASE;
  const referer =
    options.referer ??
    `${COSCO_PAGE_URL}?trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

  try {
    const upstream = await fetchCoscoUpstream(`${baseUrl}/${endpoint}`, {
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
      signal: signalForTimeout(controller, options.signal)
    }, options);

    const rawText = await upstream.text();

    if (!upstream.ok) {
      if (upstream.status === 403) {
        coscoCircuitBreakerFor(options).trip();
        throw coscoBlockedHttpError(options);
      }
      if (upstream.status === 401) {
        throw new HttpError(502, "COSCO public session expired", {
          code: "COSCO_COOKIE_EXPIRED",
          upstreamStatus: 401
        });
      }
      if (upstream.status === 429) {
        throw coscoRateLimitedHttpError(
          parseRetryAfter(upstream.headers.get("retry-after")),
          options
        );
      }
      if (upstream.status === 503) {
        const retryAfterMs = parseRetryAfter(upstream.headers.get("retry-after")) ?? 30_000;
        coscoCircuitBreakerFor(options).recordFailure({ retryAfterMs, immediate: true });
        throw new HttpError(503, "COSCO upstream is temporarily unavailable", {
          code: "COSCO_UPSTREAM_UNAVAILABLE",
          upstreamStatus: 503,
          retryAfterMs: Math.max(retryAfterMs, coscoCircuitBreakerFor(options).remainingMs())
        });
      }
      throw new HttpError(502, `COSCO 接口返回 HTTP ${upstream.status}`);
    }

    let decoded;
    try {
      decoded = decodeCoscoPayload(rawText);
    } catch (error) {
      throw new HttpError(502, "COSCO 响应解码失败", error.message);
    }

    const decodedCode = String(decoded?.code ?? "");
    if (decodedCode === "429") {
      throw coscoRateLimitedHttpError(Number(decoded?.retryAfterMs) || 60_000, options);
    }
    if (decodedCode === "403") {
      coscoCircuitBreakerFor(options).trip(Number(decoded?.retryAfterMs) || undefined);
      throw coscoBlockedHttpError(options);
    }
    if (decodedCode === "503") {
      const retryAfterMs = Math.max(1_000, Number(decoded?.retryAfterMs) || 30_000);
      coscoCircuitBreakerFor(options).recordFailure({ retryAfterMs, immediate: true });
      throw new HttpError(503, decoded?.message || "COSCO upstream is temporarily unavailable", {
        code: "COSCO_UPSTREAM_UNAVAILABLE",
        upstreamStatus: 503,
        retryAfterMs: Math.max(retryAfterMs, coscoCircuitBreakerFor(options).remainingMs())
      });
    }
    if (decodedCode === "401") {
      throw new HttpError(502, "COSCO public session expired", {
        code: "COSCO_COOKIE_EXPIRED",
        upstreamCode: decoded?.code
      });
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
    if (options.signal?.aborted) throw batchCancelledHttpError();
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

async function getCoscoPublicCookies(request, options = {}) {
  const state = coscoPublicCookieState(options);
  if (state.cache?.expiresAt > Date.now()) {
    return state.cache.value;
  }
  if (!state.promise) {
    state.promise = getCoscoPublicCookiesOnce(request, options)
      .finally(() => {
        state.promise = null;
      });
  }
  return state.promise;
}

async function getCoscoPublicCookiesOnce(request, options = {}) {
  const state = coscoPublicCookieState(options);
  if (state.cache?.expiresAt > Date.now()) {
    return state.cache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), coscoCoreTimeoutMs(options));
  const pageUrl = `${COSCO_PUBLIC_TRACKING_PAGE}?lang=en&trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

  try {
    const response = await coscoUpstreamGate.run(() => {
      ensureCoscoCircuitAvailable(options);
      return fetchCoscoUpstream(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
      },
      signal: signalForTimeout(controller, options.signal)
      }, options);
    }, { signal: options.signal });
    if (response.status === 403) {
      coscoCircuitBreakerFor(options).trip();
      throw coscoBlockedHttpError(options);
    }
    if (response.status === 429) {
      throw coscoRateLimitedHttpError(
        parseRetryAfter(response.headers.get("retry-after")),
        options
      );
    }
    if (!response.ok) {
      throw new HttpError(502, `COSCO public page returned HTTP ${response.status}`);
    }
    const html = await response.text();
    const value = extractCoscoPageCookies(html, response.headers);
    state.cache = {
      value,
      expiresAt: Date.now() + 5 * 60_000
    };
    return value;
  } catch (error) {
    if (options.signal?.aborted) throw batchCancelledHttpError();
    if (error?.name === "AbortError") {
      throw new HttpError(504, "COSCO 公共查询页初始化超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoscoContainers(request, options = {}) {
  const referer = `${COSCO_PUBLIC_TRACKING_PAGE}?lang=en&trackingType=CONTAINER&number=${encodeURIComponent(request.number)}`;
  let finalError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const cookie = await getCoscoPublicCookies(request, options);
      return await fetchCoscoEndpoint("containers", request, {
        baseUrl: COSCO_TRACKING_EX_BASE,
        referer,
        cookie,
        timeoutMs: coscoCoreTimeoutMs(options),
        signal: options.signal,
        proxyMode: options.proxyMode
      });
    } catch (error) {
      finalError = error;
      if (options.signal?.aborted || isCoscoProtectionError(error)
          || error?.details?.code !== "COSCO_COOKIE_EXPIRED") {
        throw error;
      }
      coscoPublicCookieState(options).cache = null;
    }
  }

  throw finalError;
}

async function optionalCoscoEndpoint(endpoint, request, fallback, options = {}) {
  try {
    return await fetchCoscoEndpoint(endpoint, request, options);
  } catch (error) {
    if (isCoscoProtectionError(error)) throw error;
    return fallback;
  }
}

async function fetchCoscoShipmentContainers(request, options = {}) {
  const result = await fetchCoscoEndpoint("containerInfo", request, {
    timeoutMs: coscoEnrichmentTimeoutMs(options),
    signal: options.signal,
    proxyMode: options.proxyMode
  });
  return Array.isArray(result) ? result : [];
}

async function fetchCoscoTrackingViaNetwork(request, options = {}) {
  const queryChannel = options.queryChannel ?? COSCO_QUERY_CHANNELS.NETWORK;
  if (request.type === "CONTAINER") {
    const containers = await fetchCoscoContainers(request, options);
    const fetchedAt = new Date().toISOString();
    return {
      snapshot: normalizeCoscoContainerSnapshot(containers, request, fetchedAt, {
        queryChannel
      }),
      raw: { containers }
    };
  }

  const detail = await fetchCoscoEndpoint("detail", request, {
    timeoutMs: coscoCoreTimeoutMs(options),
    signal: options.signal,
    proxyMode: options.proxyMode
  });
  let bookingInfo = {};
  let containerInfo = [];
  let enrichmentWarning = null;
  if (!options.batch) {
    try {
      bookingInfo = await optionalCoscoEndpoint("bookingInfo", request, {}, {
        timeoutMs: coscoEnrichmentTimeoutMs(options),
        signal: options.signal,
        proxyMode: options.proxyMode
      });
      containerInfo = await fetchCoscoShipmentContainers(request, options)
        .catch((error) => {
          if (isCoscoProtectionError(error)) throw error;
          return [];
        });
    } catch (error) {
      if (!isCoscoProtectionError(error)) throw error;
      enrichmentWarning = {
        code: error?.details?.code ?? error?.code ?? "COSCO_ENRICHMENT_DEFERRED",
        message: error?.message ?? "Optional COSCO enrichment was deferred"
      };
    }
  }
  const fetchedAt = new Date().toISOString();
  const snapshot = normalizeCoscoSnapshot(detail, request, fetchedAt, {
    queryChannel,
    bookingInfo,
    containerInfo
  });

  return {
    snapshot,
    enrichment: {
      containerDetailsComplete: snapshotHasCompleteContainerDetails(snapshot, request),
      partial: Boolean(options.batch || enrichmentWarning),
      warning: enrichmentWarning
    },
    raw: {
      detail,
      bookingInfo,
      containerInfo
    }
  };
}

async function fetchCoscoTrackingWithPlaywright(request, options = {}) {
  let result;

  try {
    result = await fetchCoscoTrackingViaPlaywright(request, {
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
      signal: options.signal
    });
  } catch (error) {
    if (options.signal?.aborted || error?.code === "BATCH_CANCELLED") {
      throw batchCancelledHttpError();
    }
    if (error?.upstreamStatus === 403) {
      coscoCircuitBreakerFor(options).trip();
      throw coscoBlockedHttpError(options);
    }
    if (error?.upstreamStatus === 429
        || error?.code === "COSCO_UPSTREAM_RATE_LIMITED") {
      throw coscoRateLimitedHttpError(error?.retryAfterMs, options);
    }
    const details = error?.code
      ? { code: error.code, retryAfterMs: error?.retryAfterMs ?? undefined }
      : error?.upstreamCode
        ? { upstreamCode: error.upstreamCode }
        : undefined;
    throw new HttpError(
      error?.httpStatus ?? 502,
      error?.message || "COSCO Playwright 通道查询失败",
      details
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

  let enrichmentWarning = null;
  const snapshot = normalizeCoscoSnapshot(detail, request, fetchedAt, {
      queryChannel: COSCO_QUERY_CHANNELS.PLAYWRIGHT,
      bookingInfo,
      containerInfo
    });

  return {
    snapshot,
    enrichment: {
      containerDetailsComplete: snapshotHasCompleteContainerDetails(snapshot, request),
      partial: Boolean(options.batch || enrichmentWarning)
        || !snapshotHasCompleteContainerDetails(snapshot, request),
      warning: enrichmentWarning
    },
    raw: {
      detail,
      bookingInfo,
      containerInfo,
      browser
    }
  };
}

async function fetchCoscoTracking(request, queryChannel, options = {}) {
  const routeOptions = queryChannel.code === "PROXY"
    ? { ...options, proxyMode: true, queryChannel: COSCO_QUERY_CHANNELS.PROXY }
    : options;
  ensureCoscoCircuitAvailable(routeOptions);
  if (queryChannel.code === "PROXY") {
    const result = await fetchCoscoTrackingViaNetwork(request, routeOptions);
    return {
      ...result,
      strategy: {
        requested: "PROXY",
        used: "PROXY",
        fallbackUsed: false
      }
    };
  }
  if (queryChannel.code === "AUTO") {
    try {
      const result = await fetchCoscoTrackingViaNetwork(request, options);
      return {
        ...result,
        strategy: {
          requested: "AUTO",
          used: "NETWORK",
          fallbackUsed: false
        }
      };
    } catch (networkError) {
      if (isCoscoProtectionError(networkError) || options.signal?.aborted) throw networkError;
      try {
        const result = await fetchCoscoTrackingWithPlaywright(request, options);
        coscoCircuitBreakerFor(options).recordSuccess();
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
        if (isCoscoProtectionError(playwrightError)) throw playwrightError;
        if (playwrightError instanceof HttpError && playwrightError.status === 429) {
          throw playwrightError;
        }
        const circuit = coscoCircuitBreakerFor(options).recordFailure({ retryAfterMs: 2 * 60_000 });
        throw new HttpError(503, "Both COSCO tracking channels are temporarily unavailable", {
          code: "COSCO_CHANNELS_UNAVAILABLE",
          retryAfterMs: circuit.retryAfterMs || 15_000,
          network: networkError?.message ?? "Network channel failed",
          playwright: playwrightError?.message ?? "Playwright channel failed"
        });
      }
    }
  }

  if (queryChannel.code === "PLAYWRIGHT") {
    return fetchCoscoTrackingWithPlaywright(request, options);
  }

  return fetchCoscoTrackingViaNetwork(request, options);
}

export function shouldRotateCoscoProxy(error) {
  return isCoscoProtectionError(error)
    || [502, 503, 504].includes(error?.status)
    || error?.details?.code === "COSCO_PROXY_UNAVAILABLE"
    || error?.details?.code === "COSCO_CHANNELS_UNAVAILABLE"
    || error?.details?.code === "COSCO_SUPPLEMENTAL_UNAVAILABLE";
}

export function shouldFallbackCoscoAutoToProxy(error) {
  const message = String(error?.message ?? "");
  return shouldRotateCoscoProxy(error)
    || [502, 503, 504].includes(error?.status)
    || /timeout|timed out|fetch failed|network|socket|econn|enet|ehost/i.test(message);
}

export function proxyPoolExhaustedError(error, attempts, triedNodes = []) {
  const upstreamDetails = error?.details && typeof error.details === "object"
    ? error.details
    : {};
  const causeCode = upstreamDetails.code ?? error?.code ?? `HTTP_${error?.status ?? 503}`;
  const nodes = [...new Set(triedNodes.map((node) => String(node ?? "").trim()).filter(Boolean))];
  const nodeSummary = nodes.length > 0 ? `；节点：${nodes.join(" → ")}` : "";
  return new HttpError(
    Number.isInteger(error?.status) ? error.status : 503,
    `${error?.message ?? "COSCO proxy request failed"}；代理池已尝试 ${attempts} 个出口节点${nodeSummary}；原因代码：${causeCode}`,
    {
      ...upstreamDetails,
      code: "COSCO_PROXY_POOL_EXHAUSTED",
      causeCode,
      attempts,
      triedNodes: nodes
    }
  );
}

async function rotateCoscoProxy(error) {
  if (!coscoProxyPool || !shouldRotateCoscoProxy(error)) return null;
  try {
    return await coscoProxyPool.rotate(
      error?.details?.code ?? error?.code ?? "COSCO_PROXY_FAILURE"
    );
  } catch (rotationError) {
    console.warn("COSCO proxy pool rotation failed", rotationError?.message ?? rotationError);
    return null;
  }
}

async function runCoscoWithProxyRotation(queryChannel, options, operation) {
  const routeOptions = queryChannel.code === "PROXY" ? { ...options, proxyMode: true } : options;
  const poolEnabled = queryChannel.code === "PROXY" && coscoProxyPool;
  const triedNodes = [];
  return runWithProxyPoolRetries({
    maximumAttempts: poolEnabled ? coscoProxyPool.maxAttemptsPerShipment : 1,
    shouldRetry: (error) => Boolean(poolEnabled && shouldRotateCoscoProxy(error)),
    rotate: async (error) => {
      const rotation = await rotateCoscoProxy(error);
      if (rotation?.previous) triedNodes.push(rotation.previous);
      if (rotation?.current) triedNodes.push(rotation.current);
      return rotation;
    },
    exhaustedError: (error, attempts) => proxyPoolExhaustedError(error, attempts, triedNodes),
    onRotated: (rotation, attempt, maximumAttempts) => {
      console.warn(
        `COSCO proxy attempt ${attempt}/${maximumAttempts} failed; rotated ${rotation.previous ?? "unknown"} -> ${rotation.current}`
      );
      coscoCircuitBreakerFor(routeOptions).reset();
      coscoPublicCookieStates.delete("PROXY");
    }
  }, async () => {
    ensureCoscoCircuitAvailable(routeOptions);
    const result = await operation(routeOptions);
    coscoCircuitBreakerFor(routeOptions).recordSuccess();
    return result;
  });
}

function decorateAutomaticProxyFallback(result, primaryError) {
  if (!result || typeof result !== "object") return result;
  const existingStrategy = result.strategy && typeof result.strategy === "object"
    ? result.strategy
    : {};
  return {
    ...result,
    proxyFallback: true,
    strategy: {
      ...existingStrategy,
      requested: "AUTO",
      used: "PROXY",
      fallbackUsed: true,
      primaryError: primaryError?.message ?? "Direct COSCO channel failed"
    }
  };
}

async function runCoscoWithAutomaticProxyFallback(queryChannel, options, operation) {
  try {
    return await runCoscoWithProxyRotation(
      queryChannel,
      options,
      (routeOptions) => operation(queryChannel, routeOptions)
    );
  } catch (error) {
    if (
      queryChannel.code !== "AUTO"
      || !coscoProxyClient
      || !shouldFallbackCoscoAutoToProxy(error)
      || options.signal?.aborted
    ) {
      throw error;
    }
    try {
      options.authorizeProxyFallback?.();
    } catch {
      // Public AUTO requests are not allowed to consume the private proxy pool. Keep the
      // original upstream failure instead of exposing an authorization-specific response.
      throw error;
    }
    const result = await runCoscoWithProxyRotation(
      COSCO_QUERY_CHANNELS.PROXY,
      options,
      (routeOptions) => operation(COSCO_QUERY_CHANNELS.PROXY, routeOptions)
    );
    return decorateAutomaticProxyFallback(result, error);
  }
}

function runCoscoTrackingRequest(request, queryChannel, options = {}) {
  return coscoQueryGate.run(
    () => runCoscoWithAutomaticProxyFallback(
      queryChannel,
      options,
      (activeChannel, routeOptions) => fetchCoscoTracking(request, activeChannel, routeOptions)
    ),
    { signal: options.signal }
  );
}

async function fetchCmaTracking(request, credentials = {}, options = {}) {
  let result;
  try {
    result = await fetchCmaTrackingViaPlaywright(request, {
      timeoutMs: Number.parseInt(process.env.CMA_PLAYWRIGHT_TIMEOUT_MS ?? "45000", 10),
      sessionCookie: credentials.sessionCookie || undefined,
      userAgent: credentials.userAgent || undefined,
      signal: options.signal
    });
  } catch (error) {
    if (options.signal?.aborted || error?.code === "BATCH_CANCELLED") {
      throw batchCancelledHttpError();
    }
    throw new HttpError(
      error?.httpStatus ?? 502,
      error?.message || "CMA CGM Playwright 查询失败",
      error?.details
    );
  }

  return {
    snapshot: normalizeCmaSnapshot(result, request, new Date().toISOString()),
    raw: result,
    strategy: {
      requested: "PLAYWRIGHT",
      used: "PLAYWRIGHT",
      fallbackUsed: false
    }
  };
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
  if (expectedContainerCount <= 0) return true;

  const actualContainerCount = new Set(
    (snapshot?.containers ?? [])
      .map((container) => String(container?.number ?? "").trim().toUpperCase())
      .filter(Boolean)
  ).size;
  return actualContainerCount >= expectedContainerCount;
}

async function handleCoscoContainerListRequest(request, response) {
  const input = await readJsonBody(request);
  const batchTaskId = normalizeBatchTaskId(input.batchTaskId);
  const trackingRequest = normalizeTrackingRequest(input);
  if (trackingRequest.type === "CONTAINER") {
    throw new HttpError(400, "箱号清单查询必须使用提单号或订舱号");
  }

  const batchLease = batchTaskId ? batchTaskRegistry.begin(batchTaskId) : null;
  try {
    await batchLease?.waitForTurn();
    const containerInfo = await fetchCoscoShipmentContainers(trackingRequest, {
      signal: batchLease?.signal
    });
    const containers = normalizeCoscoContainerList(containerInfo);
    sendJson(response, 200, {
      tracking: {
        type: trackingRequest.type,
        number: trackingRequest.number
      },
      total: containers.length,
      containers
    });
  } catch (error) {
    if (batchLease?.signal.aborted) throw batchCancelledHttpError();
    throw error;
  } finally {
    batchLease?.finish();
  }
}

async function handleCoscoSupplementalDetailsRequest(request, response) {
  const input = await readJsonBody(request);
  const trackingRequest = normalizeTrackingRequest(input);
  const queryChannel = normalizeQueryChannel(input.channel ?? "AUTO");
  requireProxyAdapterAuthorization(request, queryChannel);
  if (trackingRequest.type === "CONTAINER") {
    throw new HttpError(400, "补充详情查询必须使用提单号或订舱号");
  }

  const result = await coscoQueryGate.run(
    () => runCoscoWithAutomaticProxyFallback(queryChannel, {
      authorizeProxyFallback: () => requireProxyAdapterAuthorization(
        request, COSCO_QUERY_CHANNELS.PROXY
      )
    }, async (_activeChannel, routeOptions) => {
      const warnings = [];
      let bookingInfo = {};
      let containerInfo = [];
      try {
        bookingInfo = await fetchCoscoEndpoint("bookingInfo", trackingRequest, {
          ...routeOptions,
          timeoutMs: coscoEnrichmentTimeoutMs(routeOptions)
        });
      } catch (error) {
        if (shouldRotateCoscoProxy(error)) throw error;
        warnings.push({
          source: "bookingInfo",
          message: error?.message ?? "订舱参考信息查询失败",
          code: error?.details?.code ?? error?.code ?? `HTTP_${error?.status ?? 502}`,
          attempts: error?.details?.attempts ?? 0
        });
      }
      try {
        containerInfo = await fetchCoscoShipmentContainers(trackingRequest, routeOptions);
      } catch (error) {
        if (shouldRotateCoscoProxy(error)) throw error;
        warnings.push({
          source: "containerInfo",
          message: error?.message ?? "运输详情查询失败",
          code: error?.details?.code ?? error?.code ?? `HTTP_${error?.status ?? 502}`,
          attempts: error?.details?.attempts ?? 0
        });
      }

      const details = normalizeCoscoSupplementalDetails(
        bookingInfo,
        containerInfo,
        trackingRequest,
        new Date().toISOString()
      );
      if (details.containers.length === 0 && details.references.information.length === 0
          && warnings.length === 2) {
        throw new HttpError(502, "COSCO 未返回可用的补充详情", {
          code: "COSCO_SUPPLEMENTAL_UNAVAILABLE",
          warnings
        });
      }
      return {
        ...details,
        partial: warnings.length > 0,
        warnings
      };
    })
  );
  sendJson(response, 200, result);
}

async function handleTrackRequest(request, response, forcedCarrier, forcedChannel) {
  const input = await readJsonBody(request);
  const forceRefresh = input.forceRefresh === true;
  const batchTaskId = normalizeBatchTaskId(input.batchTaskId);
  const carrierCode = normalizeCarrierCode(forcedCarrier ?? input.carrier ?? "COSCO");
  const carrier = CARRIER_ADAPTERS[carrierCode];

  if (!carrier.enabled) {
    throw new HttpError(501, `${carrier.name} 适配器尚未接入`);
  }

  const trackingRequest = normalizeTrackingRequest(input);
  const queryChannel = normalizeQueryChannel(
    carrierCode === "CMA"
      ? "PLAYWRIGHT"
      : forcedChannel ?? input.channel ?? carrier.defaultChannel ?? "NETWORK"
  );
  requireProxyAdapterAuthorization(request, queryChannel);
  const cmaCredentials = carrierCode === "CMA"
    ? {
        sessionCookie: String(request.headers["x-cma-session-cookie"] ?? "").trim(),
        userAgent: String(request.headers["x-cma-browser-user-agent"] ?? "").trim()
      }
    : null;
  const batchLease = batchTaskId ? batchTaskRegistry.begin(batchTaskId) : null;

  try {
  const cacheKey = `${carrierCode}:${queryChannel.code}:${trackingRequest.type}:${trackingRequest.number}`;
  const cached = cache.get(cacheKey);

  if (
    !forceRefresh &&
    cached &&
    cached.expiresAt > Date.now() &&
    snapshotHasCompleteContainerDetails(cached.value?.snapshot, trackingRequest)
  ) {
    sendJson(response, 200, { ...cached.value, cached: true });
    return;
  }

  if (cached) cache.delete(cacheKey);

  await batchLease?.waitForTurn();

  let requestPromise = batchTaskId || forceRefresh
    ? null
    : inFlightTrackingRequests.get(cacheKey);
  if (!requestPromise) {
    requestPromise = carrierCode === "CMA"
      ? fetchCmaTracking(trackingRequest, cmaCredentials, { signal: batchLease?.signal })
      : runCoscoTrackingRequest(trackingRequest, queryChannel, {
          signal: batchLease?.signal,
          batch: Boolean(batchTaskId),
          authorizeProxyFallback: () => requireProxyAdapterAuthorization(
            request, COSCO_QUERY_CHANNELS.PROXY
          )
        });
    if (!batchTaskId && !forceRefresh) inFlightTrackingRequests.set(cacheKey, requestPromise);
  }

  let value;
  try {
    value = await requestPromise;
  } finally {
    if (!batchTaskId && !forceRefresh
        && inFlightTrackingRequests.get(cacheKey) === requestPromise) {
      inFlightTrackingRequests.delete(cacheKey);
    }
  }
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  sendJson(response, 200, { ...value, cached: false });
  } catch (error) {
    if (batchLease?.signal.aborted) throw batchCancelledHttpError();
    throw error;
  } finally {
    batchLease?.finish();
  }
}

async function serveFlag(request, response, ratio, countryCode) {
  try {
    const content = await readFile(join(FLAG_ICONS_DIR, ratio, `${countryCode}.svg`));
    await sendStaticContent(request, response, content, {
      extension: ".svg",
      contentType: MIME_TYPES[".svg"],
      cacheControl: "public, max-age=604800"
    });
  } catch (error) {
    if (error?.code === "ENOENT") throw new HttpError(404, "国旗资源不存在");
    throw error;
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/vendor/element-plus.css") {
    const content = await readFile(ELEMENT_PLUS_CSS);
    await sendStaticContent(request, response, content, {
      extension: ".css",
      contentType: MIME_TYPES[".css"],
      cacheControl: "no-cache, must-revalidate"
    });
    return;
  }

  if (url.pathname === "/vendor/xlsx.mjs") {
    const content = await readFile(XLSX_MODULE);
    await sendStaticContent(request, response, content, {
      extension: ".mjs",
      contentType: MIME_TYPES[".mjs"],
      cacheControl: "public, max-age=604800"
    });
    return;
  }

  const flagMatch = url.pathname.match(/^\/vendor\/flags\/(1x1|4x3)\/([a-z]{2})\.svg$/);
  if (flagMatch) {
    const [, ratio, countryCode] = flagMatch;
    await serveFlag(request, response, ratio, countryCode);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    throw new HttpError(404, "页面不存在");
  }

  try {
    const content = await readFile(filePath);
    const extension = extname(filePath);
    await sendStaticContent(request, response, content, {
      extension,
      contentType: MIME_TYPES[extension] ?? "application/octet-stream",
      cacheControl: staticCacheControl(url.pathname)
    });
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
        coscoProtection: {
          proxy: proxyStatus(COSCO_PROXY_CONFIG),
          proxyPool: coscoProxyPool?.status() ?? { enabled: false },
          circuitBreakers: {
            direct: coscoCircuitBreakers.DIRECT.status(),
            proxy: coscoCircuitBreakers.PROXY.status()
          },
          queue: coscoQueryGate.stats()
        },
        channels: {
          NETWORK: getChannelCHealthStatus(),
          PLAYWRIGHT: {
            channel: "PLAYWRIGHT",
            channelNumber: 2,
            channelLabel: "Playwright 浏览器",
            status: "configured",
            enabled: true
          },
          PROXY: {
            channel: "PROXY",
            channelNumber: 3,
            channelLabel: "SOCKS5 proxy",
            status: COSCO_PROXY_CONFIG ? "configured" : "missing",
            enabled: Boolean(COSCO_PROXY_CONFIG)
          }
        },
        time: new Date().toISOString()
      });
      return;
    }

    const batchCancelMatch = url.pathname.match(/^\/api\/batch-tasks\/([^/]+)\/cancel$/);
    if (request.method === "POST" && batchCancelMatch) {
      const taskId = decodeURIComponent(batchCancelMatch[1]);
      sendJson(response, 202, batchTaskRegistry.cancel(taskId));
      return;
    }

    const flagApiMatch = url.pathname.match(/^\/api\/flags\/(1x1|4x3)\/([a-z]{2})$/);
    if (request.method === "GET" && flagApiMatch) {
      const [, ratio, countryCode] = flagApiMatch;
      await serveFlag(request, response, ratio, countryCode);
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

    if (request.method === "POST" && url.pathname === "/api/track/cosco/container-list") {
      await handleCoscoContainerListRequest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/track/cosco/supplemental-details") {
      await handleCoscoSupplementalDetailsRequest(request, response);
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

    if (request.method === "POST" && url.pathname === "/api/track/cma") {
      await handleTrackRequest(request, response, "CMA", "PLAYWRIGHT");
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    throw new HttpError(405, "不支持的请求方法");
  } catch (error) {
    const status = error instanceof HttpError
      ? error.status
      : Number.isInteger(error?.httpStatus)
        ? error.httpStatus
        : 500;
    const details = error instanceof HttpError
      ? error.details
      : (error?.code || error?.retryAfterMs)
        ? {
            code: error?.code ?? undefined,
            retryAfterMs: error?.retryAfterMs ?? undefined
          }
        : undefined;
    if ([429, 503].includes(status)) {
      const retryAfterMs = Number(details?.retryAfterMs);
      response.setHeader(
        "Retry-After",
        String(Number.isFinite(retryAfterMs) ? Math.max(1, Math.ceil(retryAfterMs / 1_000)) : 5)
      );
    }
    sendJson(response, status, {
      error: {
        message: error?.message || "服务器内部错误",
        details
      }
    });
  }
});

server.on("close", () => {
  stopChannelCMonitor();
  void closeCoscoPlaywrightBrowser();
  void closeCmaPlaywrightBrowser();
  void coscoProxyClient?.close();
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`Dual-channel COSCO tracker running at http://${HOST}:${PORT}`);
    startChannelCMonitor();
  });
}
