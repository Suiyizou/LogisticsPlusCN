import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { runPiTrackingAgent } from "../src/agent/pi-runner.js";
import { demoCarrierResolution, demoTrackingRequest, startDemoFixture } from "../src/demo-fixture.js";

const fixture = await startDemoFixture();
const request = demoTrackingRequest(fixture.url);
const resolution = demoCarrierResolution(fixture.url);
const baseConfig = loadConfig();
const config = {
  ...baseConfig,
  browser: {
    ...baseConfig.browser,
    headless: true,
    channel: "chrome",
    timeoutMs: 20_000,
  },
  model: {
    ...baseConfig.model,
    requireVision: true,
  },
};
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 180_000);
try {
  const submission = await runPiTrackingAgent({
    runId: "agent-fixture-smoke",
    request,
    resolution,
    config,
    signal: controller.signal,
    testAllowLocalhost: true,
    debugAgentText: true,
    onEvent: (event) => process.stderr.write(`[agent] ${typeof event === "string" ? event : event.message}\n`),
  });
  assert.equal(submission.status, "FOUND");
  assert.equal(submission.shipment?.bookingNumber, "LABBOOKING123");
  assert(submission.evidence.length > 0);
  process.stdout.write(`${JSON.stringify(submission, null, 2)}\n`);
} finally {
  clearTimeout(timeout);
  await fixture.close();
}
