import { join } from "node:path";
import { BrowserSession } from "../src/browser/browser-session.js";
import { BROWSER_CARRIERS } from "../src/carriers.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const browser = new BrowserSession({
  headless: true,
  channel: config.browser.channel,
  timeoutMs: Math.min(config.browser.timeoutMs, 25_000),
  artifactDir: join(config.rootDir, "artifacts", "site-smoke"),
  navigation: { mode: "public-https" },
  preserveArtifacts: true,
});
const results: Array<Record<string, unknown>> = [];
try {
  await browser.launch();
  for (const carrier of BROWSER_CARRIERS) {
    const startedAt = Date.now();
    try {
      const opened = await browser.open(carrier.trackingUrl!);
      await browser.wait(1_500);
      const snapshot = await browser.snapshot();
      const screenshot = await browser.screenshot(carrier.code.toLowerCase());
      results.push({
        carrier: carrier.code,
        ok: true,
        usable: snapshot.blockingReason === null && snapshot.elements.length > 0,
        requestedUrl: carrier.trackingUrl,
        finalUrl: opened.url,
        title: opened.title,
        interactiveElements: snapshot.elements.length,
        challengeDetected: snapshot.challengeDetected,
        blockingReason: snapshot.blockingReason,
        screenshot: screenshot.path,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        carrier: carrier.code,
        ok: false,
        requestedUrl: carrier.trackingUrl,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
    }
  }
} finally {
  await browser.close();
}
process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`);
if (results.every((result) => result.ok === false)) process.exitCode = 1;
