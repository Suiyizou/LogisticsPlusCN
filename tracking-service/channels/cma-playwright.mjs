import { chromium } from "playwright";

const CMA_TRACKING_PAGE = "https://www.cma-cgm.com/ebusiness/tracking/search";
const DEFAULT_TIMEOUT_MS = 45_000;
const EXPANSION_SETTLE_MS = 4_000;
let sharedBrowserHandlePromise = null;
let sessionCookies = [];

export function parseCmaSessionCookies(cookieHeader) {
  return String(cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) return [];
      return [{
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        domain: ".cma-cgm.com",
        path: "/",
        secure: true
      }];
    });
}

function mergeCookies(...cookieGroups) {
  const merged = new Map();
  for (const cookie of cookieGroups.flat()) {
    if (!cookie?.name || !cookie?.domain || !cookie?.path) continue;
    merged.set(`${cookie.name}\n${cookie.domain}\n${cookie.path}`, cookie);
  }
  return [...merged.values()];
}

async function createSharedBrowserHandle() {
  const cdpUrl = String(process.env.CMA_CDP_URL ?? "").trim();
  const browser = cdpUrl
    ? await chromium.connectOverCDP(cdpUrl)
    : await chromium.launch({
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome",
        headless:
          String(process.env.PLAYWRIGHT_HEADLESS ?? "true").toLowerCase() !== "false"
      });
  browser.once("disconnected", () => {
    sharedBrowserHandlePromise = null;
  });
  return {
    browser,
    mode: cdpUrl ? "CDP" : "LAUNCH"
  };
}

async function getSharedBrowserHandle() {
  if (!sharedBrowserHandlePromise) {
    sharedBrowserHandlePromise = createSharedBrowserHandle().catch((error) => {
      sharedBrowserHandlePromise = null;
      throw error;
    });
  }
  return sharedBrowserHandlePromise;
}

async function profileSessionCookies(browser) {
  const [profileContext] = browser.contexts();
  if (!profileContext) return [];
  try {
    return await profileContext.cookies(CMA_TRACKING_PAGE);
  } catch {
    return [];
  }
}

function upstreamError(message, httpStatus = 502, details) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  error.details = details;
  return error;
}

async function expandCard(page, card, timeoutMs) {
  const pdfLink = card.locator('a[href*="/ebusiness/tracking/export-pdf"]');
  if ((await pdfLink.count()) === 0) {
    const label = card.getByText("Display Details", { exact: true });
    const toggle = card.getByRole("checkbox");
    if ((await label.count()) === 1) await label.click();
    else if ((await toggle.count()) === 1) await toggle.check({ force: true });
    await pdfLink.waitFor({ state: "attached", timeout: timeoutMs });
  }

  let previousMoves = card.locator('a[aria-label="Display Previous Moves"]');
  if ((await previousMoves.count()) === 0) {
    previousMoves = card.getByText("Display Previous Moves", { exact: true });
  }
  if ((await previousMoves.count()) !== 1) return;
  const previousCount = await card.locator('[role="gridcell"]').count();
  await previousMoves.click({ force: true });
  const deadline = Date.now() + EXPANSION_SETTLE_MS;
  while (Date.now() < deadline) {
    const currentCount = await card.locator('[role="gridcell"]').count();
    if (currentCount > previousCount) break;
    await page.waitForTimeout(120);
  }
}

async function extractCard(card) {
  return card.evaluate((root) => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const exportLink = root.querySelector('a[href*="/ebusiness/tracking/export-pdf"]');
    const exportUrl = exportLink?.href ?? null;
    let bookingReference = null;
    let number = root.textContent.match(/\b[A-Z]{4}\d{7}\b/)?.[0] ?? null;
    if (exportUrl) {
      const url = new URL(exportUrl);
      bookingReference = url.searchParams.get("bookingReference");
      number = url.searchParams.get("containerID") ?? number;
    }

    const terms = Array.from(root.querySelectorAll("dt")).map((item) => clean(item.innerText));
    const definitions = Array.from(root.querySelectorAll("dd")).map((item) => clean(item.innerText));
    const identityText = terms.find((value) => value.includes(number ?? "")) ?? terms[0] ?? "";
    const typeCode = identityText.match(/\b\d{2}[A-Z]\d\b/)?.[0] ?? null;
    const typeLabel = identityText.match(/\(([^)]+)\)/)?.[1] ?? null;

    const labelValue = (label) => {
      const block = Array.from(root.querySelectorAll("li, div")).find((element) => {
        const text = clean(element.innerText);
        return text.startsWith(`${label} `) && text.length < 220;
      });
      return clean(block?.querySelector("strong")?.innerText) || null;
    };

    const etaLabel = Array.from(root.querySelectorAll("*"))
      .find((element) => clean(element.innerText) === "ETA Berth at POD");
    let etaText = null;
    let etaScope = etaLabel;
    for (let depth = 0; etaScope && depth < 4; depth += 1, etaScope = etaScope.parentElement) {
      const text = clean(etaScope.innerText);
      const match = text.match(/(?:MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*\.?\s*,?\s*\d{1,2}-[A-Z]{3}-\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/i);
      if (match) {
        etaText = match[0];
        break;
      }
    }

    const grid = root.querySelector(
      '[id^="gridTrackingDetails"], [data-role="grid"], [role="treegrid"]'
    );
    const milestones = grid
      ? Array.from(grid.querySelectorAll('[role="row"]')).flatMap((row) => {
          // The previous-moves section nests a table inside an outer grid row. Only direct
          // grid cells belong to the current event; descendant queries duplicate all nested rows.
          if (row.querySelector('[role="row"]')) return [];
          const cells = Array.from(row.children)
            .filter((cell) => cell.getAttribute("role") === "gridcell");
          const values = cells.map((cell) => clean(cell.innerText));
          const dateIndex = values.findIndex((value) =>
            /\d{1,2}-[A-Z]{3}-\d{4}/i.test(value)
          );
          if (dateIndex < 0 || !values[dateIndex + 1]) return [];

          const locationCell = cells[dateIndex + 2] ?? null;
          const locationLines = String(locationCell?.innerText ?? "")
            .split(/\r?\n/)
            .map(clean)
            .filter(Boolean);
          const terminalElement = locationCell
            ? Array.from(locationCell.querySelectorAll("[aria-label], [title]")).find((element) =>
                /^Terminal name\s*:/i.test(
                  element.getAttribute("aria-label") ?? element.getAttribute("title") ?? ""
                )
              )
            : null;
          const terminalLabel = terminalElement
            ?.getAttribute("aria-label") ?? terminalElement?.getAttribute("title") ?? "";
          const terminal =
            clean(terminalLabel.replace(/^Terminal name\s*:\s*/i, "")) ||
            (locationLines.length > 1 ? clean(locationLines.slice(1).join(" ")) : null);
          return [{
            dateText: values[dateIndex],
            name: values[dateIndex + 1],
            location: locationLines[0] ?? values[dateIndex + 2] ?? null,
            terminal,
            vesselVoyage: values[dateIndex + 3] ?? null
          }];
        })
      : [];
    const originName = labelValue("POL");
    const destinationName = labelValue("POD");
    const countryCode = (value) => value?.match(/\(([A-Z]{2})\)\s*$/)?.[1] ?? null;

    return {
      number,
      typeCode,
      typeLabel,
      latestEvent: definitions[0] ?? null,
      currentLocation: terms[1] ?? null,
      latestEventTime: definitions[1] ?? null,
      etaAtPod: etaText,
      bookingReference,
      pdfUrl: exportUrl,
      origin: { name: originName, countryCode: countryCode(originName) },
      destination: { name: destinationName, countryCode: countryCode(destinationName) },
      milestones
    };
  });
}

export async function closeCmaPlaywrightBrowser() {
  if (!sharedBrowserHandlePromise) return;
  const handlePromise = sharedBrowserHandlePromise;
  sharedBrowserHandlePromise = null;
  try {
    const handle = await handlePromise;
    await handle.browser.close();
  } catch {
    // A failed or already disconnected browser does not need additional cleanup.
  }
}

export async function fetchCmaTrackingViaPlaywright(request, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const browserUserAgent = String(
    options.userAgent ?? process.env.CMA_BROWSER_USER_AGENT ?? ""
  ).trim();
  const handle = options.browser
    ? { browser: options.browser, mode: "INJECTED" }
    : await getSharedBrowserHandle();
  const browser = handle.browser;
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "Asia/Shanghai",
    acceptDownloads: false,
    ...(browserUserAgent
      ? { userAgent: browserUserAgent }
      : {})
  });

  try {
    const providedSessionCookie = options.sessionCookie ?? process.env.CMA_SESSION_COOKIE;
    const providedCookies = parseCmaSessionCookies(providedSessionCookie);
    const profileCookies = await profileSessionCookies(browser);
    const seedCookies = mergeCookies(
      providedCookies.length > 0 ? [] : sessionCookies,
      profileCookies,
      providedCookies
    );
    if (seedCookies.length > 0) await context.addCookies(seedCookies);
    const page = await context.newPage();
    const entryResponse = await page.goto(CMA_TRACKING_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });

    const form = page.locator('form[action="/ebusiness/tracking/search"]');
    if ((await form.count()) !== 1) {
      if (entryResponse?.status() === 403) {
        throw upstreamError(
          "CMA CGM 触发 DataDome 验证，请更新有效会话或检查 Chrome CDP 服务",
          503,
          { challenge: "DATADOME" }
        );
      }
      throw upstreamError("CMA CGM 搜索表单结构已变化");
    }

    let searchInput = form.locator("#Reference");
    if ((await searchInput.count()) !== 1) {
      searchInput = form.locator('input[name="SearchViewModel.Reference"]');
    }
    if ((await searchInput.count()) !== 1) {
      throw upstreamError("CMA CGM 搜索输入框结构已变化");
    }
    await searchInput.fill(request.number);

    const searchButton = form.getByRole("button", { name: "Search", exact: true });
    if ((await searchButton.count()) !== 1) throw upstreamError("CMA CGM 搜索按钮结构已变化");
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/ebusiness/tracking/search",
      { timeout: timeoutMs }
    );
    await searchButton.click();
    const searchResponse = await responsePromise;
    if (!searchResponse.ok()) {
      throw upstreamError(
        `CMA CGM 查询返回 HTTP ${searchResponse.status()}`,
        searchResponse.status() === 404 ? 404 : 502
      );
    }
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

    let cards = page.locator("#multiresultssection li.cardelem");
    if ((await cards.count()) === 0) cards = page.locator("li.cardelem");
    if ((await cards.count()) === 0) cards = page.locator("article.result-card");
    const cardCount = await cards.count();
    if (cardCount === 0) {
      const errorText = await page.locator("main").innerText().catch(() => "");
      const notFound = /no result|not found|invalid reference/i.test(errorText);
      throw upstreamError(
        notFound ? "CMA CGM 未找到该票货物" : "CMA CGM 未返回可解析的跟踪结果",
        notFound ? 404 : 502
      );
    }

    const containers = [];
    for (let index = 0; index < cardCount; index += 1) {
      const card = cards.nth(index);
      await expandCard(page, card, timeoutMs);
      containers.push(await extractCard(card));
    }

    const usableContainers = containers.filter((container) => container.number);
    if (usableContainers.length === 0) {
      throw upstreamError("CMA CGM 返回的页面中没有可识别箱号");
    }
    if (request.type === "CONTAINER") {
      const exact = usableContainers.filter(
        (container) => container.number?.toUpperCase() === request.number
      );
      if (exact.length > 0) usableContainers.splice(0, usableContainers.length, ...exact);
    }

    return {
      bookingReference:
        usableContainers.find((container) => container.bookingReference)?.bookingReference ?? null,
      containers: usableContainers,
      browser: {
        responseUrl: searchResponse.url(),
        responseStatus: searchResponse.status(),
        pageUrl: page.url(),
        cardCount,
        extraction: "SERVER_RENDERED_HTML",
        browserConnection: handle.mode
      }
    };
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw upstreamError("CMA CGM Playwright 查询超时", 504);
    }
    throw error;
  } finally {
    try {
      const refreshedCookies = await context.cookies(CMA_TRACKING_PAGE);
      if (typeof options.onSessionCookies === "function") {
        await options.onSessionCookies(refreshedCookies);
      }
      if (options.sessionCookie == null) sessionCookies = refreshedCookies;
    } catch {
      // Cookie persistence is an optimization; context cleanup must still continue.
    }
    await context.close();
  }
}
