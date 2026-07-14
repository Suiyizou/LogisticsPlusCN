import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

const COSCO_DETAIL_ENDPOINT =
  "https://elines.coscoshipping.com/scct/scct_customer/public/cargoTracking/detail";
const COSCO_PAGE_URL =
  "https://elines.coscoshipping.com/ebusiness/cargoTracking";
const COSCO_XOR_KEY = "b3Ay6#9f1a@%&2^6";
const UPSTREAM_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 5 * 60_000;

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

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
});

const cache = new Map();

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

export function normalizeCoscoSnapshot(result, request, fetchedAt) {
  const summary = result?.cargoTrackingSummary ?? {};
  const latest = summary.latestMilestone ?? null;

  return {
    channel: "C",
    source: "COSCO_PUBLIC_WEB_INTERFACE",
    carrier: "COSCO SHIPPING Lines",
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
    sailingSchedule: result?.cargoTrackingSailingSchedule ?? []
  };
}

async function fetchCoscoTracking(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const referer = `${COSCO_PAGE_URL}?trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

  try {
    const upstream = await fetch(COSCO_DETAIL_ENDPOINT, {
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

    if (decoded?.code !== "200" || decoded?.success !== true || !decoded?.result) {
      const status = decoded?.code === "404" ? 404 : 502;
      throw new HttpError(
        status,
        decoded?.message || "COSCO 没有返回有效的跟踪结果",
        { upstreamCode: decoded?.code ?? null }
      );
    }

    const fetchedAt = new Date().toISOString();
    return {
      snapshot: normalizeCoscoSnapshot(decoded.result, request, fetchedAt),
      raw: decoded.result
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "COSCO 查询超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleTrackRequest(request, response) {
  const input = await readJsonBody(request);
  const trackingRequest = normalizeTrackingRequest(input);
  const cacheKey = `${trackingRequest.type}:${trackingRequest.number}`;
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
        time: new Date().toISOString()
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/track/cosco") {
      await handleTrackRequest(request, response);
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
  });
}
