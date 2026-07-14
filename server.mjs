import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

const COSCO_TRACKING_BASE =
  "https://elines.coscoshipping.com/scct/scct_customer/public/cargoTracking";
const COSCO_PAGE_URL =
  "https://elines.coscoshipping.com/ebusiness/cargoTracking";
const COSCO_XOR_KEY = "b3Ay6#9f1a@%&2^6";
const UPSTREAM_TIMEOUT_MS = 30_000;
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

const CARRIER_ADAPTERS = Object.freeze({
  COSCO: {
    code: "COSCO",
    name: "COSCO SHIPPING Lines",
    channel: "C",
    enabled: true,
    source: "COSCO_PUBLIC_WEB_INTERFACE"
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

export function decodeCoscoPayload(rawText) {
  let payload;

  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = rawText;
  }

  // COSCO occasionally returns a normal JSON error instead of the encoded body.
  if (payload && typeof payload === "object") {
    return payload;
  }

  if (typeof payload !== "string" || payload.length === 0) {
    throw new Error("COSCO 返回了无法识别的响应");
  }

  const encrypted = Buffer.from(payload, "base64");
  const key = Buffer.from(COSCO_XOR_KEY, "utf8");
  const decoded = Buffer.allocUnsafe(encrypted.length);

  for (let index = 0; index < encrypted.length; index += 1) {
    decoded[index] = encrypted[index] ^ key[index % key.length];
  }

  return JSON.parse(decoded.toString("utf8"));
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
    channel: "C",
    source: "COSCO_PUBLIC_WEB_INTERFACE",
    carrier: "COSCO SHIPPING Lines",
    provider: {
      code: "COSCO",
      name: "COSCO SHIPPING Lines",
      channel: "C"
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

async function fetchCoscoEndpoint(endpoint, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const referer = `${COSCO_PAGE_URL}?trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

  try {
    const upstream = await fetch(`${COSCO_TRACKING_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        tz: "Asia/Shanghai"
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

async function optionalCoscoEndpoint(endpoint, request, fallback) {
  try {
    return await fetchCoscoEndpoint(endpoint, request);
  } catch {
    return fallback;
  }
}

async function fetchCoscoTracking(request) {
  const [detail, bookingInfo, containerInfo] = await Promise.all([
    fetchCoscoEndpoint("detail", request),
    optionalCoscoEndpoint("bookingInfo", request, {}),
    optionalCoscoEndpoint("containerInfo", request, [])
  ]);
  const fetchedAt = new Date().toISOString();

  return {
    snapshot: normalizeCoscoSnapshot(detail, request, fetchedAt, {
      bookingInfo,
      containerInfo
    }),
    raw: {
      detail,
      bookingInfo,
      containerInfo
    }
  };
}

export function getChannelCHealthStatus() {
  return {
    channel: "C",
    source: "COSCO_PUBLIC_WEB_INTERFACE",
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
      channelCHealth.lastError = error?.message || "通道 C 探测失败";
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
    console.log(`[channel-c-monitor] ${message}`);
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

async function handleTrackRequest(request, response, forcedCarrier) {
  const input = await readJsonBody(request);
  const carrierCode = normalizeCarrierCode(forcedCarrier ?? input.carrier ?? "COSCO");
  const carrier = CARRIER_ADAPTERS[carrierCode];

  if (!carrier.enabled) {
    throw new HttpError(501, `${carrier.name} 适配器尚未接入`);
  }

  const trackingRequest = normalizeTrackingRequest(input);
  const cacheKey = `${carrierCode}:${trackingRequest.type}:${trackingRequest.number}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    sendJson(response, 200, { ...cached.value, cached: true });
    return;
  }

  const value = await fetchCoscoTracking(trackingRequest);
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  sendJson(response, 200, { ...value, cached: false });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
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
        channel: "C",
        channels: {
          C: getChannelCHealthStatus()
        },
        time: new Date().toISOString()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/channels/c/status") {
      sendJson(response, 200, getChannelCHealthStatus());
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
      await handleTrackRequest(request, response, "COSCO");
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Channel C tracker running at http://127.0.0.1:${PORT}`);
    startChannelCMonitor();
  });
}
