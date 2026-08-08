import { chromium } from "playwright";
import { decodeCoscoPayload } from "../lib/cosco-payload.mjs";

const COSCO_TRACKING_PAGE =
  "https://elines.coscoshipping.com/scct/public/ct/base?lang=en";
const DEFAULT_TIMEOUT_MS = 30_000;
const OPTIONAL_RESPONSE_SETTLE_MS = 1_200;
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_QUEUE_LIMIT = 8;
const DEFAULT_QUEUE_TIMEOUT_MS = 15_000;
const SUPPORTED_PROXY_PROTOCOLS = new Set(["http:", "https:", "socks5:"]);

const TRACKING_LABELS = Object.freeze({
  BILLOFLADING: "B/L No.",
  BOOKING: "Booking No.",
  CONTAINER: "Container No."
});

let sharedBrowserPromise = null;

function configuredInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function readCoscoPlaywrightProxyConfig(environment = process.env) {
  const rawServer = String(environment.COSCO_PLAYWRIGHT_PROXY_SERVER ?? "").trim();
  if (!rawServer) return null;
  const serverUrl = new URL(rawServer.includes("://") ? rawServer : `http://${rawServer}`);
  if (!SUPPORTED_PROXY_PROTOCOLS.has(serverUrl.protocol)) {
    throw new Error("COSCO Playwright proxy must use http://, https:// or socks5://");
  }
  if (serverUrl.username || serverUrl.password) {
    throw new Error(
      "Put COSCO Playwright proxy credentials in COSCO_PLAYWRIGHT_PROXY_USERNAME/PASSWORD, not in the URL"
    );
  }
  const username = String(environment.COSCO_PLAYWRIGHT_PROXY_USERNAME ?? "");
  const password = String(environment.COSCO_PLAYWRIGHT_PROXY_PASSWORD ?? "");
  return Object.freeze({
    server: serverUrl.toString(),
    ...(username ? { username } : {}),
    ...(password ? { password } : {})
  });
}

const configuredPlaywrightProxy = readCoscoPlaywrightProxyConfig();

export function coscoBrowserContextOptions(proxy = configuredPlaywrightProxy) {
  return {
    locale: "en-US",
    timezoneId: "Asia/Shanghai",
    ...(proxy ? { proxy } : {})
  };
}

export class PlaywrightCapacityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PlaywrightCapacityError";
    this.code = "PLAYWRIGHT_BUSY";
    this.httpStatus = 429;
    this.retryAfterMs = details.retryAfterMs ?? null;
  }
}

export function createPlaywrightConcurrencyGate(options = {}) {
  const maxConcurrency = configuredInteger(
    options.maxConcurrency,
    DEFAULT_MAX_CONCURRENCY,
    { min: 1, max: 16 }
  );
  const queueLimit = configuredInteger(
    options.queueLimit,
    DEFAULT_QUEUE_LIMIT,
    { min: 0, max: 100 }
  );
  const queueTimeoutMs = configuredInteger(
    options.queueTimeoutMs,
    DEFAULT_QUEUE_TIMEOUT_MS,
    { min: 100, max: 120_000 }
  );
  let active = 0;
  const queue = [];

  function capacityError(reason) {
    return new PlaywrightCapacityError(
      `Playwright channel is busy (${reason}); retry later`,
      { retryAfterMs: queueTimeoutMs }
    );
  }

  function dispatch() {
    while (active < maxConcurrency && queue.length > 0) {
      const entry = queue.shift();
      if (entry.settled) continue;
      entry.settled = true;
      clearTimeout(entry.timer);
      active += 1;
      entry.resolve(createRelease());
    }
  }

  function createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
      dispatch();
    };
  }

  function acquire() {
    if (active < maxConcurrency) {
      active += 1;
      return Promise.resolve(createRelease());
    }
    if (queue.length >= queueLimit) {
      return Promise.reject(capacityError("queue full"));
    }

    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, settled: false, timer: null };
      entry.timer = setTimeout(() => {
        if (entry.settled) return;
        entry.settled = true;
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
        reject(capacityError("queue timeout"));
      }, queueTimeoutMs);
      queue.push(entry);
    });
  }

  return Object.freeze({
    acquire,
    async run(operation) {
      const release = await acquire();
      try {
        return await operation();
      } finally {
        release();
      }
    },
    stats() {
      return { active, queued: queue.length, maxConcurrency, queueLimit, queueTimeoutMs };
    }
  });
}

const sharedPlaywrightGate = createPlaywrightConcurrencyGate({
  maxConcurrency:
    process.env.COSCO_PLAYWRIGHT_MAX_CONCURRENCY ?? process.env.PLAYWRIGHT_MAX_CONCURRENCY,
  queueLimit: process.env.PLAYWRIGHT_QUEUE_LIMIT,
  queueTimeoutMs: process.env.PLAYWRIGHT_QUEUE_TIMEOUT_MS
});
const dedicatedProxyFallbackGate = createPlaywrightConcurrencyGate({
  maxConcurrency: 1,
  queueLimit: process.env.COSCO_PLAYWRIGHT_FALLBACK_QUEUE_LIMIT,
  queueTimeoutMs:
    process.env.COSCO_PLAYWRIGHT_FALLBACK_QUEUE_TIMEOUT_MS
      ?? process.env.PLAYWRIGHT_QUEUE_TIMEOUT_MS
});

async function launchSharedBrowser() {
  const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";
  const launchOptions = {
    headless:
      String(process.env.PLAYWRIGHT_HEADLESS ?? "true").toLowerCase() !== "false"
  };

  if (channel && channel !== "chromium") {
    launchOptions.channel = channel;
  }
  const browser = await chromium.launch(launchOptions);

  browser.once("disconnected", () => {
    sharedBrowserPromise = null;
  });

  return browser;
}

async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = launchSharedBrowser().catch((error) => {
      sharedBrowserPromise = null;
      throw error;
    });
  }

  return sharedBrowserPromise;
}

function endpointName(response) {
  return response
    .url()
    .match(/\/public\/cargoTracking\/(detail|bookingInfo|containerInfo|containers)$/)?.[1] ?? null;
}

function responseMatchesRequest(response, request, endpoint = "detail") {
  if (
    response.request().method() !== "POST" ||
    endpointName(response) !== endpoint
  ) {
    return false;
  }

  try {
    return response.request().postDataJSON()?.businessNumber === request.number;
  } catch {
    return true;
  }
}

async function decodeSuccessfulResponse(response) {
  const rawText = await response.text();

  if (!response.ok()) {
    const error = new Error(`COSCO Playwright 查询返回 HTTP ${response.status()}`);
    error.httpStatus = 502;
    error.upstreamStatus = response.status();
    throw error;
  }

  const decoded = decodeCoscoPayload(rawText);
  if (decoded?.code !== "200" || decoded?.result == null) {
    const error = new Error(
      decoded?.message || `COSCO Playwright 查询失败：${decoded?.code ?? "UNKNOWN"}`
    );
    error.httpStatus = decoded?.code === "404" ? 404 : 502;
    error.upstreamCode = decoded?.code ?? null;
    throw error;
  }

  return decoded.result;
}

export async function closeCoscoPlaywrightBrowser() {
  if (!sharedBrowserPromise) return;

  const browserPromise = sharedBrowserPromise;
  sharedBrowserPromise = null;

  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // A failed or already disconnected browser does not need additional cleanup.
  }
}

async function fetchCoscoTrackingInBrowserContext(request, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = options.signal;
  if (signal?.aborted) {
    const error = new Error("Batch tracking task was cancelled");
    error.code = "BATCH_CANCELLED";
    error.httpStatus = 409;
    throw error;
  }
  const browser = options.browser ?? (await getSharedBrowser());
  let context = null;
  let sawUpstream403 = false;
  const closeOnAbort = () => {
    if (context) void context.close().catch(() => {});
  };
  if (signal) signal.addEventListener("abort", closeOnAbort, { once: true });

  try {
    const proxy = options.proxy === undefined ? configuredPlaywrightProxy : options.proxy;
    context = await browser.newContext(coscoBrowserContextOptions(proxy));
    const page = await context.newPage();
    const optionalPayloads = new Map();
    const optionalCaptures = new Set();
    const primaryEndpoint = request.type === "CONTAINER" ? "containers" : "detail";

    page.on("response", (response) => {
      if (response.status() === 403 && response.url().startsWith("https://elines.coscoshipping.com/")) {
        sawUpstream403 = true;
      }
      const endpoint = endpointName(response);
      if (
        !endpoint ||
        endpoint === primaryEndpoint ||
        !responseMatchesRequest(response, request, endpoint)
      ) {
        return;
      }

      const capture = decodeSuccessfulResponse(response)
        .then((value) => optionalPayloads.set(endpoint, value))
        .catch(() => {})
        .finally(() => optionalCaptures.delete(capture));
      optionalCaptures.add(capture);
    });

    await page.goto(COSCO_TRACKING_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });

    await page.locator(".ant-select-selector").click();
    await page
      .getByText(TRACKING_LABELS[request.type] ?? TRACKING_LABELS.BILLOFLADING, {
        exact: true
      })
      .last()
      .click();
    await page.locator("input:not([readonly])").first().fill(request.number);

    const responsePromise = page.waitForResponse(
      (response) => responseMatchesRequest(response, request, primaryEndpoint),
      { timeout: timeoutMs }
    );

    await page.getByRole("button", { name: /Search/i }).click();
    const response = await responsePromise;
    const primaryResult = await decodeSuccessfulResponse(response);

    await page.waitForTimeout(OPTIONAL_RESPONSE_SETTLE_MS);
    await Promise.allSettled([...optionalCaptures]);
    const pageText = await page.locator("body").innerText();

    return {
      detail: request.type === "CONTAINER" ? null : primaryResult,
      containers: request.type === "CONTAINER" ? primaryResult : [],
      bookingInfo: optionalPayloads.get("bookingInfo") ?? {},
      containerInfo: optionalPayloads.get("containerInfo") ?? [],
      browser: {
        pageRenderedTrackingResult:
          pageText.includes(request.number) ||
          pageText.includes("Dynamic Node") ||
          pageText.includes("Latest Event"),
        responseUrl: response.url(),
        responseStatus: response.status()
      }
    };
  } catch (error) {
    if (signal?.aborted) {
      const cancelled = new Error("Batch tracking task was cancelled");
      cancelled.code = "BATCH_CANCELLED";
      cancelled.httpStatus = 409;
      throw cancelled;
    }
    if (sawUpstream403) {
      const blocked = new Error("COSCO Playwright request was rejected with HTTP 403");
      blocked.httpStatus = 503;
      blocked.upstreamStatus = 403;
      throw blocked;
    }
    if (error?.name === "TimeoutError") {
      const timeoutError = new Error("COSCO Playwright 查询超时");
      timeoutError.httpStatus = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (signal) signal.removeEventListener("abort", closeOnAbort);
    if (context) await context.close();
  }
}

export async function fetchCoscoTrackingViaPlaywright(request, options = {}) {
  const concurrencyGate = options.concurrencyGate
    ?? (options.dedicatedFallback ? dedicatedProxyFallbackGate : sharedPlaywrightGate);
  return concurrencyGate.run(() => fetchCoscoTrackingInBrowserContext(request, options));
}
