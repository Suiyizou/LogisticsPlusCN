import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Frame,
  type Locator,
  type Page,
} from "playwright";
import { assertNavigableUrl, type NavigationPolicyOptions } from "./navigation-policy.js";
import { SafeNetworkProxy } from "./safe-network-proxy.js";

const MAX_SCREENSHOTS_PER_RUN = 12;
const MAX_AGENT_SCREENSHOTS_PER_RUN = MAX_SCREENSHOTS_PER_RUN - 1;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export type CarrierBrowserState = Exclude<BrowserContextOptions["storageState"], string | undefined>;

export function filterCarrierBrowserState(value: unknown, officialHosts: string[]): CarrierBrowserState {
  const state = value as { cookies?: unknown; origins?: unknown };
  if (!state || !Array.isArray(state.cookies) || !Array.isArray(state.origins))
    throw new Error("Invalid carrier session state");
  const allowed = (hostname: unknown) => typeof hostname === "string" && officialHosts.some(
    (host) => hostname.replace(/^\./, "").toLowerCase() === host
      || hostname.replace(/^\./, "").toLowerCase().endsWith(`.${host}`),
  );
  const cookies = state.cookies.filter((item) => item && typeof item === "object" && allowed((item as { domain?: unknown }).domain));
  const origins = state.origins.filter((item) => {
    try {
      const url = new URL((item as { origin: string }).origin);
      return url.protocol === "https:" && !url.username && !url.password && allowed(url.hostname);
    } catch { return false; }
  });
  return { cookies, origins } as CarrierBrowserState;
}

export interface BrowserSessionOptions {
  headless: boolean;
  channel: string | null;
  timeoutMs: number;
  artifactDir: string;
  navigation: NavigationPolicyOptions;
  preserveArtifacts?: boolean;
  storageState?: CarrierBrowserState;
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: Array<{
    ref: string;
    frameUrl: string;
    tag: string;
    role: string | null;
    text: string;
    placeholder: string | null;
    name: string | null;
    type: string | null;
    href: string | null;
  }>;
  challengeDetected: boolean;
  blockingReason: "ACCESS_DENIED" | "SECURITY_CHECK" | "REQUEST_REJECTED" | "EMPTY_PAGE" | null;
}

export interface ScreenshotArtifact {
  data: string;
  mimeType: "image/jpeg";
  artifactId: string;
  label: string;
  path: string;
  url: string;
}

interface ElementHandle {
  locator: Locator;
  frameUrl: string;
}

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private networkProxy: SafeNetworkProxy | null = null;
  private readonly handles = new Map<string, ElementHandle>();
  private readonly requestValidation = new Map<string, Promise<void>>();
  private readonly visitedUrls = new Set<string>();
  private readonly observedText = new Map<string, string>();
  private readonly screenshotUrls = new Set<string>();
  private readonly blockingReasons = new Map<string, NonNullable<PageSnapshot["blockingReason"]>>();
  private screenshotCount = 0;

  constructor(private readonly options: BrowserSessionOptions) {}

  async launch(): Promise<void> {
    if (this.browser) return;
    this.networkProxy = new SafeNetworkProxy(this.options.navigation);
    const proxyServer = await this.networkProxy.listen();
    const baseOptions = {
      headless: this.options.headless,
      proxy: { server: proxyServer },
      args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    };
    try {
      this.browser = await chromium.launch({
        ...baseOptions,
        ...(this.options.channel ? { channel: this.options.channel } : {}),
      });
    } catch (error) {
      try {
        if (!this.options.channel) throw error;
        this.browser = await chromium.launch(baseOptions);
      } catch (fallbackError) {
        await this.networkProxy.close();
        this.networkProxy = null;
        throw fallbackError;
      }
    }
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "en-US",
      acceptDownloads: false,
      serviceWorkers: "block",
      ...(this.options.storageState ? { storageState: this.options.storageState } : {}),
    });
    await this.context.route("**/*", async (route) => {
      const request = route.request();
      try {
        await this.assertRequestUrl(request.url(), request.isNavigationRequest());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.options.timeoutMs);
  }

  async open(rawUrl: string): Promise<PageSnapshot> {
    await assertNavigableUrl(rawUrl, this.options.navigation);
    const page = this.requirePage();
    await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: this.options.timeoutMs });
    // Carrier SPAs often hydrate after DOMContentLoaded. An empty initial shell
    // is a loading state, not proof that tracking failed or a security challenge.
    await page.waitForFunction(
      () => Boolean(document.body?.innerText.trim() || document.querySelector("input, button, select, [role='textbox']")),
      undefined,
      { timeout: Math.min(8_000, this.options.timeoutMs) },
    ).catch(() => undefined);
    // Return and record the first DOM snapshot as part of navigation. Small
    // tool-capable models may correctly recognize a blocking title and submit
    // immediately; without recording the DOM here, that otherwise-valid
    // evidence is rejected simply because they skipped a redundant snapshot
    // call.
    return this.snapshot();
  }

  async snapshot(): Promise<PageSnapshot> {
    const page = this.requirePage();
    // An actual navigation remains visited even if the response has no body text.
    this.visitedUrls.add(canonicalEvidenceUrl(page.url()));
    this.handles.clear();
    const elements: PageSnapshot["elements"] = [];
    const textParts: string[] = [];
    let nextRef = 1;
    for (const frame of page.frames()) {
      const frameText = await bodyText(frame);
      if (frameText) textParts.push(`[Frame ${frame.url()}]\n${frameText}`);
      if (frameText) {
        this.recordObservedText(frame.url(), frameText);
        this.recordBlockingReason(
          frame.url(),
          detectBlockingReason(frame.url(), "", frameText, 1),
        );
      }
      const locator = frame.locator(
        "a[href], button, input, textarea, select, [role='button'], [role='link'], [role='textbox'], [contenteditable='true']",
      );
      const count = Math.min(await safeCount(locator), 250);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (!(await safeVisible(candidate))) continue;
        const ref = `e${nextRef++}`;
        this.handles.set(ref, { locator: candidate, frameUrl: frame.url() });
        elements.push({
          ref,
          frameUrl: frame.url(),
          tag: await safeEvaluate(candidate, (element) => element.tagName.toLowerCase(), "unknown"),
          role: await safeAttribute(candidate, "role"),
          text: truncate(await safeText(candidate), 300),
          placeholder: await safeAttribute(candidate, "placeholder"),
          name: (await safeAttribute(candidate, "aria-label")) ?? (await safeAttribute(candidate, "name")),
          type: await safeAttribute(candidate, "type"),
          href: await safeAttribute(candidate, "href"),
        });
      }
    }
    const text = truncate(textParts.join("\n\n"), 30_000);
    const blockingReason = detectBlockingReason(page.url(), await page.title(), text, elements.length);
    this.recordBlockingReason(page.url(), blockingReason);
    return {
      url: page.url(),
      title: await page.title(),
      text,
      elements,
      challengeDetected: blockingReason !== null,
      blockingReason,
    };
  }

  async click(ref: string): Promise<void> {
    const handle = this.handle(ref);
    await this.assertTrustedInteraction(handle.frameUrl);
    await handle.locator.click();
  }

  async fill(ref: string, value: string): Promise<void> {
    const handle = this.handle(ref);
    await this.assertTrustedInteraction(handle.frameUrl);
    await handle.locator.fill(value);
  }

  async selectOption(ref: string, value: string): Promise<void> {
    const handle = this.handle(ref);
    await this.assertTrustedInteraction(handle.frameUrl);
    await handle.locator.selectOption(value);
  }

  async press(key: string, ref?: string): Promise<void> {
    if (ref) {
      const handle = this.handle(ref);
      await this.assertTrustedInteraction(handle.frameUrl);
      await handle.locator.press(key);
      return;
    }
    if (!/^(Enter|Escape|Tab|Space|Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End)$/i.test(key)) {
      throw new Error("Global browser key is limited to navigation controls");
    }
    await this.requirePage().keyboard.press(key);
  }

  async scroll(deltaY: number): Promise<void> {
    await this.requirePage().mouse.wheel(0, Math.max(-5000, Math.min(5000, deltaY)));
  }

  async wait(milliseconds: number): Promise<void> {
    await this.requirePage().waitForTimeout(Math.max(0, Math.min(10_000, milliseconds)));
  }

  async screenshot(_label = "page"): Promise<ScreenshotArtifact> {
    return this.captureScreenshot("浏览器页面截图");
  }

  async screenshotForAgent(_label = "page"): Promise<ScreenshotArtifact> {
    if (this.screenshotCount >= MAX_AGENT_SCREENSHOTS_PER_RUN) {
      throw new Error(
        `Screenshot limit reached (${MAX_AGENT_SCREENSHOTS_PER_RUN} Agent screenshots plus 1 final screenshot per run)`,
      );
    }
    return this.captureScreenshot("浏览器页面截图");
  }

  async captureFinalScreenshot(): Promise<ScreenshotArtifact> {
    // The Agent tool is capped one slot below the run limit, so the executor
    // can always preserve the last official page without depending on model
    // behaviour. This captures the existing page and performs no navigation.
    return this.captureScreenshot("最终浏览器页面截图");
  }

  private async captureScreenshot(label: string): Promise<ScreenshotArtifact> {
    if (this.screenshotCount >= MAX_SCREENSHOTS_PER_RUN) {
      throw new Error(`Screenshot limit reached (${MAX_SCREENSHOTS_PER_RUN} per run)`);
    }
    const page = this.requirePage();
    await mkdir(this.options.artifactDir, { recursive: true });
    // Do not use a model-provided label in a filename. It can contain a booking
    // reference and would then leak through the public artifact identifier.
    const artifactId = `${randomUUID()}.jpg`;
    const path = join(this.options.artifactDir, artifactId);
    const buffer = await page.screenshot({ path, type: "jpeg", quality: 82, fullPage: false });
    if (buffer.byteLength > MAX_SCREENSHOT_BYTES) {
      await rm(path, { force: true }).catch(() => undefined);
      throw new Error("Screenshot exceeds the 5 MB artifact limit");
    }
    this.screenshotCount += 1;
    this.screenshotUrls.add(canonicalEvidenceUrl(page.url()));
    return {
      data: buffer.toString("base64"),
      mimeType: "image/jpeg",
      artifactId,
      label,
      path,
      url: page.url(),
    };
  }

  hasScreenshots(): boolean {
    return this.screenshotCount > 0;
  }

  currentUrl(): string {
    return this.requirePage().url();
  }

  wasVisited(rawUrl: string): boolean {
    try {
      return this.visitedUrls.has(canonicalEvidenceUrl(rawUrl));
    } catch {
      return false;
    }
  }

  evidenceWasObserved(rawUrl: string, method: "DOM" | "VISION" | "HYBRID", value: string): boolean {
    try {
      const url = canonicalEvidenceUrl(rawUrl);
      const hasDomText = normalizeObservedText(this.observedText.get(url) ?? "")
        .includes(normalizeObservedText(value));
      const hasScreenshot = this.screenshotUrls.has(url);
      if (method === "DOM") return hasDomText;
      if (method === "VISION") return hasScreenshot;
      return hasDomText && hasScreenshot;
    } catch {
      return false;
    }
  }

  resolveObservedEvidenceSource(
    rawUrl: string,
    method: "DOM" | "VISION" | "HYBRID",
    value: string,
  ): string | null {
    try {
      const claimedUrl = canonicalEvidenceUrl(rawUrl);
      if (this.visitedUrls.has(claimedUrl) && this.evidenceWasObserved(claimedUrl, method, value)) {
        return claimedUrl;
      }

      const claimedOrigin = new URL(claimedUrl).origin.toLowerCase();
      for (const visitedUrl of this.visitedUrls) {
        const sameOrigin = new URL(visitedUrl).origin.toLowerCase() === claimedOrigin;
        const approvedCarrierRedirect = this.options.navigation.mode === "official-only"
          && this.isApprovedOfficialHost(new URL(claimedUrl).hostname)
          && this.isApprovedOfficialHost(new URL(visitedUrl).hostname);
        if (!sameOrigin && !approvedCarrierRedirect) continue;
        if (this.evidenceWasObserved(visitedUrl, method, value)) return visitedUrl;
      }
      // Carrier SPAs can move between approved subdomains. Normalize only to
      // an actually visited carrier URL where the declared method observed the
      // claim; an unrelated or unapproved model-authored source stays invalid.
      return null;
    } catch {
      return null;
    }
  }

  private isApprovedOfficialHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/\.$/, "");
    return (this.options.navigation.allowedHosts ?? []).some((rawHost) => {
      const allowed = rawHost.toLowerCase().replace(/\.$/, "");
      return normalized === allowed || normalized.endsWith(`.${allowed}`);
    });
  }

  blockingReasonFor(rawUrl: string): PageSnapshot["blockingReason"] {
    try {
      return this.blockingReasons.get(canonicalEvidenceUrl(rawUrl)) ?? null;
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    this.handles.clear();
    this.requestValidation.clear();
    this.visitedUrls.clear();
    this.observedText.clear();
    this.screenshotUrls.clear();
    this.screenshotCount = 0;
    this.blockingReasons.clear();
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    await this.networkProxy?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
    this.networkProxy = null;
    if (!this.options.preserveArtifacts) {
      await rm(this.options.artifactDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async assertRequestUrl(rawUrl: string, navigation: boolean): Promise<void> {
    const url = new URL(rawUrl);
    if (url.username || url.password) throw new Error("Browser navigation does not allow URL credentials");
    if (!["http:", "https:"].includes(url.protocol)) {
      if (["about:", "blob:", "data:"].includes(url.protocol)) return;
      throw new Error(`Browser request protocol is blocked: ${url.protocol}`);
    }
    const policy = navigation
      ? this.options.navigation
      : { ...this.options.navigation, mode: "public-https" as const };
    const cacheKey = `${navigation ? policy.mode : "public-resource"}:${url.origin.toLowerCase()}`;
    let validation = this.requestValidation.get(cacheKey);
    if (!validation) {
      validation = assertNavigableUrl(url.href, policy).then(() => undefined);
      this.requestValidation.set(cacheKey, validation);
    }
    try {
      await validation;
      if (navigation) this.visitedUrls.add(canonicalEvidenceUrl(rawUrl));
    } catch (error) {
      this.requestValidation.delete(cacheKey);
      throw error;
    }
  }

  private async assertTrustedInteraction(frameUrl: string): Promise<void> {
    await assertNavigableUrl(frameUrl, this.options.navigation);
  }

  private recordObservedText(rawUrl: string, text: string): void {
    try {
      const url = canonicalEvidenceUrl(rawUrl);
      const previous = this.observedText.get(url) ?? "";
      this.observedText.set(url, `${previous}\n${text}`.slice(-100_000));
    } catch {
      // about:blank and other non-network frames cannot be evidence sources.
    }
  }

  private recordBlockingReason(rawUrl: string, reason: PageSnapshot["blockingReason"]): void {
    try {
      const url = canonicalEvidenceUrl(rawUrl);
      if (reason) this.blockingReasons.set(url, reason);
      else this.blockingReasons.delete(url);
    } catch {
      // about:blank and other non-network frames cannot be evidence sources.
    }
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("Browser session has not been launched");
    return this.page;
  }

  private handle(ref: string): ElementHandle {
    const handle = this.handles.get(ref);
    if (!handle) throw new Error(`Unknown or stale element reference: ${ref}. Take a new snapshot.`);
    return handle;
  }
}

function canonicalEvidenceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Evidence URL must be HTTP(S)");
  url.hash = "";
  return url.href;
}

function normalizeObservedText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

async function bodyText(frame: Frame): Promise<string> {
  try {
    return truncate(await frame.locator("body").innerText({ timeout: 5_000 }), 12_000);
  } catch {
    return "";
  }
}

async function safeCount(locator: Locator): Promise<number> {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

async function safeVisible(locator: Locator): Promise<boolean> {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function safeText(locator: Locator): Promise<string> {
  try {
    return (await locator.innerText()).trim();
  } catch {
    return "";
  }
}

async function safeAttribute(locator: Locator, name: string): Promise<string | null> {
  try {
    return await locator.getAttribute(name);
  } catch {
    return null;
  }
}

async function safeEvaluate<T>(locator: Locator, callback: (element: HTMLElement) => T, fallback: T): Promise<T> {
  try {
    return await locator.evaluate(callback);
  } catch {
    return fallback;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n…[truncated]`;
}

function detectBlockingReason(
  url: string,
  title: string,
  text: string,
  elementCount: number,
): PageSnapshot["blockingReason"] {
  const content = `${title}\n${text}`;
  if (/access denied|permission to access|forbidden|拒绝访问/i.test(content)) return "ACCESS_DENIED";
  if (/__cf_chl|captcha|challenge/i.test(url)
    || /captcha|verify you are human|security verification|security check|checking your browser|slide.{0,20}(verify|puzzle)|人机验证|安全验证/i.test(content)) {
    return "SECURITY_CHECK";
  }
  if (/page request is unrecognized|request (?:was )?rejected|incident id/i.test(content)) return "REQUEST_REJECTED";
  if (/\b(?:404\s+)?page not found\b|\b404\s+not\s+found\b|\b(?:gateway|request|connection|operation)\s+timed?\s*out\b|\btimeout\b|service unavailable|internal server error|bad gateway/i.test(content)
    || /(?:页面|网页)(?:未找到|不存在|无法访问)|(?:未找到|找不到).{0,20}(?:页面|网页)|您访问的(?:页面|网页).{0,20}(?:不存在|未找到)|404(?:错误|页面)/u.test(content)) {
    return "REQUEST_REJECTED";
  }
  if (!text.trim() && elementCount === 0) return "EMPTY_PAGE";
  return null;
}
