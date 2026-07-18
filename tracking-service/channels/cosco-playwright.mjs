import { chromium } from "playwright";
import { decodeCoscoPayload } from "../lib/cosco-payload.mjs";

const COSCO_TRACKING_PAGE =
  "https://elines.coscoshipping.com/scct/public/ct/base?lang=en";
const DEFAULT_TIMEOUT_MS = 30_000;
const OPTIONAL_RESPONSE_SETTLE_MS = 1_200;
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_QUEUE_LIMIT = 8;
const DEFAULT_QUEUE_TIMEOUT_MS = 15_000;

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
  maxConcurrency: process.env.PLAYWRIGHT_MAX_CONCURRENCY,
  queueLimit: process.env.PLAYWRIGHT_QUEUE_LIMIT,
  queueTimeoutMs: process.env.PLAYWRIGHT_QUEUE_TIMEOUT_MS
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
  const decoded = decodeCoscoPayload(await response.text());

  if (!response.ok()) {
    const error = new Error(`COSCO Playwright 查询返回 HTTP ${response.status()}`);
    error.httpStatus = 502;
    throw error;
  }

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
  const browser = options.browser ?? (await getSharedBrowser());
  let context = null;

  try {
    context = await browser.newContext({
      locale: "en-US",
      timezoneId: "Asia/Shanghai"
    });
    const page = await context.newPage();
    const optionalPayloads = new Map();
    const optionalCaptures = new Set();
    const primaryEndpoint = request.type === "CONTAINER" ? "containers" : "detail";

    page.on("response", (response) => {
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
    if (error?.name === "TimeoutError") {
      const timeoutError = new Error("COSCO Playwright 查询超时");
      timeoutError.httpStatus = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (context) await context.close();
  }
}

export async function fetchCoscoTrackingViaPlaywright(request, options = {}) {
  const concurrencyGate = options.concurrencyGate ?? sharedPlaywrightGate;
  return concurrencyGate.run(() => fetchCoscoTrackingInBrowserContext(request, options));
}
