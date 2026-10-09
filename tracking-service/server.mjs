import { createServer } from "node:http";
import { fetchCmaTracking, snapshotHasCompleteContainerDetails } from "./lib/cma-query.mjs";
import { createCoscoUpstream } from "./lib/cosco-upstream.mjs";
import { createCoscoHealthMonitor } from "./lib/cosco-health.mjs";
import {
  decorateProxyFailure,
  decorateProxySuccess,
  proxyAttemptDiagnostics,
  proxyPoolExhaustedError,
  safeSupplementalWarnings,
  uniqueSafeProxyNodes
} from "./lib/cosco-diagnostics.mjs";
import { createStaticRouter } from "./lib/static-routes.mjs";
import { isCoscoProtectionError } from "./lib/cosco-errors.mjs";
import {
  normalizeCoscoContainerList,
  normalizeCoscoContainerSnapshot,
  normalizeCoscoSnapshot,
  normalizeCoscoSupplementalDetails
} from "./lib/cosco-normalize.mjs";
import {
  CARRIER_ADAPTERS,
  COSCO_QUERY_CHANNELS,
  listCarrierAdapters,
  listCoscoQueryChannels,
  normalizeCarrierCode,
  normalizeQueryChannel,
  normalizeTrackingRequest
} from "./lib/carrier-adapters.mjs";
import { createTrackingCache } from "./lib/tracking-cache.mjs";
import {
  HttpError,
  batchCancelledHttpError,
  readJsonBody,
  secureTextEquals,
  sendJson
} from "./lib/http-utils.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeCoscoPlaywrightBrowser,
  fetchCoscoTrackingViaPlaywright,
  readCoscoPlaywrightProxyConfig
} from "./channels/cosco-playwright.mjs";
import { closeCmaPlaywrightBrowser } from "./channels/cma-playwright.mjs";
import { decodeCoscoPayload } from "./lib/cosco-payload.mjs";
import {
  createCoscoProxyClient,
  proxyStatus,
  readCoscoProxyConfig
} from "./lib/cosco-proxy.mjs";
import {
  createCoscoProxyPool,
  readCoscoProxyPoolConfig,
  runWithProxyPoolRetries,
  safeProxyNodeAlias
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


export {
  listCarrierAdapters,
  listCoscoQueryChannels,
  normalizeCarrierCode,
  normalizeQueryChannel,
  normalizeTrackingRequest
};


export {
  buildRoutingLegs,
  enrichCoscoShipmentContainers,
  normalizeCoscoContainerList,
  normalizeCoscoContainerSnapshot,
  normalizeCoscoSnapshot,
  normalizeCoscoSupplementalDetails
} from "./lib/cosco-normalize.mjs";


export {
  decorateProxySuccess,
  proxyPoolExhaustedError,
  safeSupplementalWarnings
} from "./lib/cosco-diagnostics.mjs";


export {
  getChannelCHealthStatus,
  runChannelCHealthCheck,
  runCoscoChannelChecks,
  startChannelCMonitor,
  stopChannelCMonitor
};

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

const staticRouter = createStaticRouter({ publicDir: PUBLIC_DIR, elementPlusCss: ELEMENT_PLUS_CSS, xlsxModule: XLSX_MODULE, flagIconsDir: FLAG_ICONS_DIR });
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


const COSCO_PROXY_CONFIG = readCoscoProxyConfig();
const coscoProxyClient = createCoscoProxyClient(COSCO_PROXY_CONFIG);
const COSCO_PROXY_POOL_CONFIG = readCoscoProxyPoolConfig();
const coscoProxyPool = createCoscoProxyPool(COSCO_PROXY_POOL_CONFIG);
const COSCO_PLAYWRIGHT_PROXY_CONFIG = readCoscoPlaywrightProxyConfig();
const COSCO_PLAYWRIGHT_PROXY_ALIAS = safeProxyNodeAlias(
  COSCO_PLAYWRIGHT_PROXY_CONFIG?.server
);
const COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED = isIndependentCoscoPlaywrightProxy(
  COSCO_PLAYWRIGHT_PROXY_CONFIG,
  COSCO_PROXY_CONFIG
);
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

export function isIndependentCoscoPlaywrightProxy(playwrightProxy, apiProxy) {
  if (!playwrightProxy?.server) return false;
  if (!apiProxy?.server) return true;
  try {
    const playwrightUrl = new URL(playwrightProxy.server);
    const apiUrl = new URL(apiProxy.server);
    return playwrightUrl.host.toLowerCase() !== apiUrl.host.toLowerCase()
      || String(playwrightProxy.username ?? "") !== String(apiProxy.username ?? "");
  } catch {
    return false;
  }
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

const trackingCache = createTrackingCache({ ttlMs: CACHE_TTL_MS });
const coscoPublicCookieStates = new Map();

const coscoUpstream = createCoscoUpstream({
  circuitBreakers: coscoCircuitBreakers,
  proxyClient: coscoProxyClient,
  cookieStates: coscoPublicCookieStates,
  networkCoreTimeoutMs: NETWORK_CORE_TIMEOUT_MS,
  proxyNetworkCoreTimeoutMs: PROXY_NETWORK_CORE_TIMEOUT_MS,
  networkEnrichmentTimeoutMs: NETWORK_ENRICHMENT_TIMEOUT_MS,
  proxyNetworkEnrichmentTimeoutMs: PROXY_NETWORK_ENRICHMENT_TIMEOUT_MS
});
const {
  coscoBlockedHttpError,
  coscoCircuitBreakerFor,
  coscoCoreTimeoutMs,
  coscoEnrichmentTimeoutMs,
  coscoPublicCookieState,
  coscoRateLimitedHttpError,
  ensureCoscoCircuitAvailable,
  fetchCoscoUpstream,
  signalForTimeout
} = coscoUpstream;
const coscoHealthMonitor = createCoscoHealthMonitor({
  request: CHANNEL_C_MONITOR_REQUEST,
  enabled: CHANNEL_C_MONITOR_ENABLED,
  intervalMs: CHANNEL_C_MONITOR_INTERVAL_MS,
  normalizeTrackingRequest,
  fetchCoscoContainers,
  fetchCoscoEndpoint,
  fetchCoscoTrackingViaPlaywright,
  playwrightTimeoutMs: PLAYWRIGHT_TIMEOUT_MS
});
const {
  getChannelCHealthStatus,
  runChannelCHealthCheck,
  runCoscoChannelChecks,
  startChannelCMonitor,
  stopChannelCMonitor
} = coscoHealthMonitor;


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
      const errorDetails = error?.details && typeof error.details === "object"
        ? error.details
        : {};
      enrichmentWarning = {
        code: errorDetails.code ?? error?.code ?? "COSCO_ENRICHMENT_DEFERRED",
        message: error?.message ?? "Optional COSCO enrichment was deferred",
        causeCode: errorDetails.causeCode ?? null,
        route: errorDetails.route ?? (options.proxyMode ? "PROXY" : "NETWORK"),
        proxyNode: safeProxyNodeAlias(errorDetails.proxyNode),
        attempts: Math.max(
          0,
          Number(errorDetails.proxyAttempts ?? errorDetails.attempts) || 0
        ),
        triedNodes: uniqueSafeProxyNodes(errorDetails.triedNodes),
        retryAfterMs: Math.max(
          0,
          Number(errorDetails.retryAfterMs ?? error?.retryAfterMs) || 0
        ) || null
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
  const playwrightProxy = options.playwrightProxy === undefined
    ? COSCO_PLAYWRIGHT_PROXY_CONFIG
    : options.playwrightProxy;
  const usesDedicatedProxy = Boolean(playwrightProxy);

  try {
    result = await fetchCoscoTrackingViaPlaywright(request, {
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
      signal: options.signal,
      proxy: playwrightProxy,
      dedicatedFallback: options.dedicatedPlaywrightProxy === true
    });
  } catch (error) {
    if (options.signal?.aborted || error?.code === "BATCH_CANCELLED") {
      throw batchCancelledHttpError();
    }
    if (error?.upstreamStatus === 403) {
      if (usesDedicatedProxy) {
        throw new HttpError(503, "COSCO rejected the dedicated Playwright proxy", {
          code: "COSCO_UPSTREAM_BLOCKED",
          upstreamStatus: 403,
          route: "PLAYWRIGHT_PROXY",
          proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
          proxyAttempts: 1,
          triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : [],
          playwrightAttempts: 1,
          retryAfterMs: 15 * 60_000
        });
      }
      coscoCircuitBreakerFor(options).trip();
      throw coscoBlockedHttpError(options);
    }
    if (error?.upstreamStatus === 429
        || error?.code === "COSCO_UPSTREAM_RATE_LIMITED") {
      if (usesDedicatedProxy) {
        throw new HttpError(429, "COSCO rate-limited the dedicated Playwright proxy", {
          code: "COSCO_UPSTREAM_RATE_LIMITED",
          upstreamStatus: 429,
          route: "PLAYWRIGHT_PROXY",
          proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
          proxyAttempts: 1,
          triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : [],
          playwrightAttempts: 1,
          retryAfterMs: Math.max(1_000, Number(error?.retryAfterMs) || 60_000)
        });
      }
      throw coscoRateLimitedHttpError(error?.retryAfterMs, options);
    }
    const details = error?.code
      ? {
          code: error.code,
          retryAfterMs: error?.retryAfterMs ?? undefined,
          route: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
          ...(usesDedicatedProxy ? {
            proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
            proxyAttempts: 1,
            triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
          } : {}),
          playwrightAttempts: 1
        }
      : error?.upstreamCode
        ? {
            upstreamCode: error.upstreamCode,
            route: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
            ...(usesDedicatedProxy ? {
              proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
              proxyAttempts: 1,
              triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
            } : {}),
            playwrightAttempts: 1
          }
        : {
            route: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
            ...(usesDedicatedProxy ? {
              proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
              proxyAttempts: 1,
              triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
            } : {}),
            playwrightAttempts: 1
          };
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
  if (queryChannel.code !== "PLAYWRIGHT" || !COSCO_PLAYWRIGHT_PROXY_CONFIG) {
    ensureCoscoCircuitAvailable(routeOptions);
  }
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
    const result = await fetchCoscoTrackingViaNetwork(request, options);
    return {
      ...result,
      strategy: {
        requested: "AUTO",
        used: "NETWORK",
        fallbackUsed: false
      }
    };
  }

  if (queryChannel.code === "PLAYWRIGHT") {
    const result = await fetchCoscoTrackingWithPlaywright(request, options);
    const usesDedicatedProxy = Boolean(
      options.playwrightProxy === undefined
        ? COSCO_PLAYWRIGHT_PROXY_CONFIG
        : options.playwrightProxy
    );
    return {
      ...result,
      strategy: {
        requested: "PLAYWRIGHT",
        used: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
        fallbackUsed: false,
        ...(usesDedicatedProxy ? {
          proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
          proxyAttempts: 1,
          triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
        } : {}),
        playwrightAttempts: 1
      }
    };
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
  const proxyRoute = queryChannel.code === "PROXY";
  const poolEnabled = proxyRoute && coscoProxyPool;
  const triedNodes = [];
  let activeProxyNode = null;
  let latestProxyAttempt = 0;
  return runWithProxyPoolRetries({
    maximumAttempts: poolEnabled ? coscoProxyPool.maxAttemptsPerShipment : 1,
    shouldRetry: (error) => Boolean(poolEnabled && shouldRotateCoscoProxy(error)),
    rotate: (error) => rotateCoscoProxy(error),
    exhaustedError: (error, attempts) => proxyPoolExhaustedError(
      error,
      attempts,
      triedNodes,
      activeProxyNode
    ),
    onRotated: (rotation, attempt, maximumAttempts) => {
      console.warn(
        `COSCO proxy attempt ${attempt}/${maximumAttempts} failed; rotated ${rotation.previous ?? "unknown"} -> ${rotation.current}`
      );
      coscoCircuitBreakerFor(routeOptions).reset();
      coscoPublicCookieStates.delete("PROXY");
    }
  }, async ({ attempt }) => {
    latestProxyAttempt = proxyRoute ? attempt : 0;
    let budget = null;
    if (poolEnabled) {
      try {
        budget = await coscoProxyPool.prepareAttempt();
        activeProxyNode = budget?.current ?? null;
        if (activeProxyNode) triedNodes.push(activeProxyNode);
        if (budget?.rotated) {
          console.info(
            `COSCO proxy request budget rotated ${budget.previous ?? "unknown"} -> ${budget.current}`
          );
          coscoCircuitBreakerFor(routeOptions).reset();
          coscoPublicCookieStates.delete("PROXY");
        }
      } catch (budgetError) {
        console.warn(
          "COSCO proxy request budget check failed; continuing with the configured proxy",
          budgetError?.message ?? budgetError
        );
      }
    }
    const diagnostics = proxyAttemptDiagnostics(
      activeProxyNode,
      latestProxyAttempt,
      triedNodes
    );
    try {
      ensureCoscoCircuitAvailable(routeOptions);
      const result = await operation(routeOptions);
      coscoCircuitBreakerFor(routeOptions).recordSuccess();
      return proxyRoute ? decorateProxySuccess(result, diagnostics, budget) : result;
    } catch (error) {
      throw proxyRoute ? decorateProxyFailure(error, diagnostics) : error;
    }
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

function decorateAutomaticPlaywrightFallback(result, directError, proxyError) {
  if (!result || typeof result !== "object") return result;
  const existingStrategy = result.strategy && typeof result.strategy === "object"
    ? result.strategy
    : {};
  const proxyDetails = proxyError?.details && typeof proxyError.details === "object"
    ? proxyError.details
    : {};
  return {
    ...result,
    proxyFallback: true,
    playwrightFallback: true,
    strategy: {
      ...existingStrategy,
      requested: "AUTO",
      used: "PLAYWRIGHT_PROXY",
      fallbackUsed: true,
      proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
      proxyAttempts: 1,
      triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : [],
      apiProxyNode: proxyDetails.proxyNode ?? null,
      apiProxyAttempts: Math.max(0, Number(proxyDetails.proxyAttempts) || 0),
      apiTriedNodes: Array.isArray(proxyDetails.triedNodes) ? proxyDetails.triedNodes : [],
      playwrightAttempts: 1,
      primaryError: directError?.message ?? "Direct COSCO channel failed",
      proxyError: proxyError?.message ?? "COSCO proxy API channel failed"
    }
  };
}

function automaticPlaywrightFallbackError(directError, proxyError, playwrightError) {
  const directDetails = directError?.details && typeof directError.details === "object"
    ? directError.details
    : {};
  const proxyDetails = proxyError?.details && typeof proxyError.details === "object"
    ? proxyError.details
    : {};
  const playwrightDetails = playwrightError?.details && typeof playwrightError.details === "object"
    ? playwrightError.details
    : {};
  const warnings = safeSupplementalWarnings(
    directDetails.warnings,
    proxyDetails.warnings,
    playwrightDetails.warnings
  );
  return new HttpError(
    Number.isInteger(playwrightError?.status) ? playwrightError.status : 503,
    "Direct API, proxy API pool and dedicated-proxy Playwright all failed",
    {
      code: "COSCO_CHANNELS_UNAVAILABLE",
      causeCode: playwrightDetails.code ?? playwrightError?.code ?? "PLAYWRIGHT_FAILURE",
      directError: directError?.message ?? "Direct COSCO channel failed",
      proxyError: proxyError?.message ?? "COSCO proxy API channel failed",
      playwrightError: playwrightError?.message ?? "Dedicated-proxy Playwright failed",
      proxyNode: proxyDetails.proxyNode ?? null,
      proxyAttempts: Math.max(0, Number(proxyDetails.proxyAttempts) || 0),
      triedNodes: Array.isArray(proxyDetails.triedNodes) ? proxyDetails.triedNodes : [],
      playwrightProxyNode: playwrightDetails.proxyNode ?? COSCO_PLAYWRIGHT_PROXY_ALIAS,
      playwrightAttempts: 1,
      route: "PLAYWRIGHT_PROXY",
      ...(warnings.length > 0 ? { warnings } : {}),
      retryAfterMs: Math.max(
        1_000,
        Number(playwrightDetails.retryAfterMs) || 0,
        Number(proxyDetails.retryAfterMs) || 0
      )
    }
  );
}

async function runCoscoWithAutomaticProxyFallback(queryChannel, options, operation) {
  try {
    return await runCoscoWithProxyRotation(
      queryChannel,
      options,
      (routeOptions) => operation(queryChannel, routeOptions)
    );
  } catch (directError) {
    if (
      queryChannel.code !== "AUTO"
      || !shouldFallbackCoscoAutoToProxy(directError)
      || options.signal?.aborted
    ) {
      throw directError;
    }
    try {
      options.authorizeProxyFallback?.();
    } catch {
      // Public AUTO requests are not allowed to consume the private proxy pool. Keep the
      // original upstream failure instead of exposing an authorization-specific response.
      throw directError;
    }

    let proxyError = null;
    if (coscoProxyClient) {
      try {
        const result = await runCoscoWithProxyRotation(
          COSCO_QUERY_CHANNELS.PROXY,
          options,
          (routeOptions) => operation(COSCO_QUERY_CHANNELS.PROXY, routeOptions)
        );
        return decorateAutomaticProxyFallback(result, directError);
      } catch (error) {
        proxyError = error;
      }
    } else {
      proxyError = new HttpError(503, "COSCO proxy API channel is not configured", {
        code: "COSCO_PROXY_NOT_CONFIGURED",
        route: "PROXY",
        proxyAttempts: 0,
        triedNodes: []
      });
    }

    if (
      !options.allowPlaywrightFallback
      || !COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED
      || !shouldFallbackCoscoAutoToProxy(proxyError)
      || options.signal?.aborted
    ) {
      throw proxyError;
    }

    try {
      const result = await operation(COSCO_QUERY_CHANNELS.PLAYWRIGHT, {
        ...options,
        dedicatedPlaywrightProxy: true,
        playwrightProxy: COSCO_PLAYWRIGHT_PROXY_CONFIG
      });
      return decorateAutomaticPlaywrightFallback(result, directError, proxyError);
    } catch (playwrightError) {
      if (options.signal?.aborted || playwrightError?.details?.code === "BATCH_CANCELLED") {
        throw playwrightError;
      }
      throw automaticPlaywrightFallbackError(directError, proxyError, playwrightError);
    }
  }
}

function runCoscoTrackingRequest(request, queryChannel, options = {}) {
  return coscoQueryGate.run(
    () => runCoscoWithAutomaticProxyFallback(
      queryChannel,
      { ...options, allowPlaywrightFallback: true },
      (activeChannel, routeOptions) => fetchCoscoTracking(request, activeChannel, routeOptions)
    ),
    { signal: options.signal }
  );
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
  const allowedSources = new Set(["bookingInfo", "containerInfo"]);
  const requestedSources = new Set(
    (Array.isArray(input.sources) ? input.sources : [])
      .map((source) => String(source ?? "").trim())
      .filter((source) => allowedSources.has(source))
  );
  if (requestedSources.size === 0) {
    allowedSources.forEach((source) => requestedSources.add(source));
  }
  const allowPlaywrightFallback = input.allowPlaywrightFallback === true;
  requireProxyAdapterAuthorization(request, queryChannel);
  if (trackingRequest.type === "CONTAINER") {
    throw new HttpError(400, "补充详情查询必须使用提单号或订舱号");
  }

  const result = await coscoQueryGate.run(
    () => runCoscoWithAutomaticProxyFallback(queryChannel, {
      allowPlaywrightFallback,
      authorizeProxyFallback: () => requireProxyAdapterAuthorization(
        request, COSCO_QUERY_CHANNELS.PROXY
      )
    }, async (activeChannel, routeOptions) => {
      if (activeChannel.code === "PLAYWRIGHT") {
        const playwrightResult = await fetchCoscoTracking(
          trackingRequest,
          activeChannel,
          routeOptions
        );
        const snapshot = playwrightResult?.snapshot ?? {};
        const details = {
          fetchedAt: snapshot.fetchedAt ?? new Date().toISOString(),
          tracking: {
            type: trackingRequest.type,
            number: trackingRequest.number
          },
          containers: requestedSources.has("containerInfo")
            ? (Array.isArray(snapshot.containers) ? snapshot.containers : [])
            : [],
          references: requestedSources.has("bookingInfo")
            ? {
                external: Array.isArray(snapshot.references?.external)
                  ? snapshot.references.external
                  : [],
                business: snapshot.references?.business ?? {},
                information: Array.isArray(snapshot.references?.information)
                  ? snapshot.references.information
                  : []
              }
            : { external: [], business: {}, information: [] },
          partial: false,
          warnings: [],
          strategy: playwrightResult?.strategy ?? null
        };
        const hasContainerData = details.containers.length > 0;
        const hasReferenceData = details.references.external.length > 0
          || details.references.information.length > 0
          || Object.values(details.references.business).some(Boolean);
        if (requestedSources.has("bookingInfo") && !hasReferenceData) {
          details.warnings.push({
            source: "bookingInfo",
            code: "COSCO_SUPPLEMENTAL_EMPTY",
            message: "COSCO 浏览器兜底未返回订舱参考信息",
            route: "PLAYWRIGHT_PROXY"
          });
        }
        if (requestedSources.has("containerInfo") && !hasContainerData) {
          details.warnings.push({
            source: "containerInfo",
            code: "COSCO_SUPPLEMENTAL_EMPTY",
            message: "COSCO 浏览器兜底未返回运输详情",
            route: "PLAYWRIGHT_PROXY"
          });
        }
        details.partial = details.warnings.length > 0;
        if (details.warnings.length === requestedSources.size) {
          throw new HttpError(502, "COSCO 浏览器兜底未返回可用的补充详情", {
            code: "COSCO_SUPPLEMENTAL_UNAVAILABLE",
            route: "PLAYWRIGHT_PROXY",
            warnings: details.warnings
          });
        }
        return details;
      }

      const warnings = [];
      let bookingInfo = {};
      let containerInfo = [];
      if (requestedSources.has("bookingInfo")) {
        try {
          bookingInfo = await fetchCoscoEndpoint("bookingInfo", trackingRequest, {
            ...routeOptions,
            timeoutMs: coscoEnrichmentTimeoutMs(routeOptions)
          });
        } catch (error) {
          if (shouldRotateCoscoProxy(error)) throw error;
          const errorDetails = error?.details ?? {};
          warnings.push({
            source: "bookingInfo",
            message: error?.message ?? "订舱参考信息查询失败",
            code: errorDetails.code ?? error?.code ?? `HTTP_${error?.status ?? 502}`,
            causeCode: errorDetails.causeCode ?? null,
            route: errorDetails.route ?? activeChannel.code,
            proxyNode: errorDetails.proxyNode ?? null,
            attempts: errorDetails.proxyAttempts ?? errorDetails.attempts ?? 0,
            triedNodes: Array.isArray(errorDetails.triedNodes) ? errorDetails.triedNodes : [],
            retryAfterMs: errorDetails.retryAfterMs ?? null
          });
        }
      }
      if (requestedSources.has("containerInfo")) {
        try {
          containerInfo = await fetchCoscoShipmentContainers(trackingRequest, routeOptions);
        } catch (error) {
          if (shouldRotateCoscoProxy(error)) throw error;
          const errorDetails = error?.details ?? {};
          warnings.push({
            source: "containerInfo",
            message: error?.message ?? "运输详情查询失败",
            code: errorDetails.code ?? error?.code ?? `HTTP_${error?.status ?? 502}`,
            causeCode: errorDetails.causeCode ?? null,
            route: errorDetails.route ?? activeChannel.code,
            proxyNode: errorDetails.proxyNode ?? null,
            attempts: errorDetails.proxyAttempts ?? errorDetails.attempts ?? 0,
            triedNodes: Array.isArray(errorDetails.triedNodes) ? errorDetails.triedNodes : [],
            retryAfterMs: errorDetails.retryAfterMs ?? null
          });
        }
      }

      const details = normalizeCoscoSupplementalDetails(
        bookingInfo,
        containerInfo,
        trackingRequest,
        new Date().toISOString()
      );
      const allRequestedSourcesFailed = [...requestedSources].every((source) => (
        warnings.some((warning) => warning.source === source)
      ));
      if (allRequestedSourcesFailed || (allowPlaywrightFallback && warnings.length > 0)) {
        throw new HttpError(502, allRequestedSourcesFailed
          ? "COSCO 未返回可用的补充详情"
          : "COSCO 返回的补充详情不完整，继续尝试下一查询通道", {
          code: "COSCO_SUPPLEMENTAL_UNAVAILABLE",
          warnings,
          partial: !allRequestedSourcesFailed
        });
      }
      return {
        ...details,
        partial: warnings.length > 0,
        warnings,
        strategy: {
          requested: queryChannel.code,
          used: activeChannel.code === "AUTO" ? "NETWORK" : activeChannel.code,
          fallbackUsed: false
        }
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
  if (carrierCode === "COSCO"
      && queryChannel.code === "PLAYWRIGHT"
      && COSCO_PLAYWRIGHT_PROXY_CONFIG) {
    requireProxyAdapterAuthorization(request, COSCO_QUERY_CHANNELS.PROXY);
  }
  const cmaCredentials = carrierCode === "CMA"
    ? {
        sessionCookie: String(request.headers["x-cma-session-cookie"] ?? "").trim(),
        userAgent: String(request.headers["x-cma-browser-user-agent"] ?? "").trim()
      }
    : null;
  const batchLease = batchTaskId ? batchTaskRegistry.begin(batchTaskId) : null;

  try {
  const cacheKey = `${carrierCode}:${queryChannel.code}:${trackingRequest.type}:${trackingRequest.number}`;
  const cached = trackingCache.peek(cacheKey);

  if (
    !forceRefresh &&
    cached &&
    cached.expiresAt > Date.now() &&
    snapshotHasCompleteContainerDetails(cached.value?.snapshot, trackingRequest)
  ) {
    sendJson(response, 200, { ...cached.value, cached: true });
    return;
  }

  if (cached) trackingCache.invalidate(cacheKey);

  await batchLease?.waitForTurn();

  let requestPromise = batchTaskId || forceRefresh
    ? null
    : trackingCache.getInFlight(cacheKey);
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
    if (!batchTaskId && !forceRefresh) trackingCache.setInFlight(cacheKey, requestPromise);
  }

  let value;
  try {
    value = await requestPromise;
  } finally {
    if (!batchTaskId && !forceRefresh) {
      trackingCache.clearInFlight(cacheKey, requestPromise);
    }
  }
  trackingCache.store(cacheKey, value);

  sendJson(response, 200, { ...value, cached: false });
  } catch (error) {
    if (batchLease?.signal.aborted) throw batchCancelledHttpError();
    throw error;
  } finally {
    batchLease?.finish();
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
            status: COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED
              ? "dedicated-proxy-configured"
              : COSCO_PLAYWRIGHT_PROXY_CONFIG
                ? "shared-proxy-auto-disabled"
                : "direct-only",
            enabled: true,
            autoFallbackEnabled: COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED,
            defaultMaxConcurrency: 1
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
      await staticRouter.serveFlag(request, response, ratio, countryCode);
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
      await staticRouter.serveStatic(request, response);
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
