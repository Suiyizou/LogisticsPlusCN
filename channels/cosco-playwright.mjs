import { chromium } from "playwright";
import { decodeCoscoPayload } from "../lib/cosco-payload.mjs";

const COSCO_TRACKING_PAGE =
  "https://elines.coscoshipping.com/scct/public/ct/base?lang=zh";
const DEFAULT_TIMEOUT_MS = 30_000;
const OPTIONAL_RESPONSE_SETTLE_MS = 1_200;

const TRACKING_LABELS = Object.freeze({
  BILLOFLADING: "提单号",
  BOOKING: "订舱号",
  CONTAINER: "箱号"
});

let sharedBrowserPromise = null;

async function launchSharedBrowser() {
  const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";
  const browser = await chromium.launch({
    channel,
    headless:
      String(process.env.PLAYWRIGHT_HEADLESS ?? "true").toLowerCase() !== "false"
  });

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
  return response.url().match(/\/public\/cargoTracking\/(detail|bookingInfo|containerInfo)$/)?.[1] ?? null;
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

export async function fetchCoscoTrackingViaPlaywright(request, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const browser = options.browser ?? (await getSharedBrowser());
  const context = await browser.newContext({
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai"
  });

  try {
    const page = await context.newPage();
    const optionalPayloads = new Map();
    const optionalCaptures = new Set();

    page.on("response", (response) => {
      const endpoint = endpointName(response);
      if (!endpoint || endpoint === "detail" || !responseMatchesRequest(response, request, endpoint)) {
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
      (response) => responseMatchesRequest(response, request),
      { timeout: timeoutMs }
    );

    await page.getByRole("button", { name: /搜\s*索/ }).click();
    const response = await responsePromise;
    const detail = await decodeSuccessfulResponse(response);

    await page.waitForTimeout(OPTIONAL_RESPONSE_SETTLE_MS);
    await Promise.allSettled([...optionalCaptures]);
    const pageText = await page.locator("body").innerText();

    return {
      detail,
      bookingInfo: optionalPayloads.get("bookingInfo") ?? {},
      containerInfo: optionalPayloads.get("containerInfo") ?? [],
      browser: {
        pageRenderedTrackingResult:
          pageText.includes(request.number) || pageText.includes("最新动态"),
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
    await context.close();
  }
}
