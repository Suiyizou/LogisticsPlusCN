import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadConfig, resolvePackageRoot } from "../src/config.js";

test("deployment defaults bind locally and cap browser work", () => {
  const config = loadConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4317);
  assert.deepEqual(config.execution, {
    maxConcurrency: 1,
    queueLimit: 5,
    runTimeoutMs: 300_000,
    maxAgentTurns: 12,
  });
  assert.deepEqual(config.artifacts, { ttlMs: 24 * 60 * 60 * 1000 });
  assert.deepEqual(config.demo, { enabled: false });
});

test("deployment settings are configurable", () => {
  const config = loadConfig({
    TRACKING_HOST: "0.0.0.0",
    TRACKING_PORT: "9000",
    TRACKING_MAX_CONCURRENCY: "2",
    TRACKING_QUEUE_LIMIT: "9",
    TRACKING_RUN_TIMEOUT_MS: "12345",
    TRACKING_MAX_AGENT_TURNS: "7",
    TRACKING_ARTIFACT_TTL_HOURS: "48",
    TRACKING_BROWSER_HEADLESS: "true",
    TRACKING_BROWSER_ALLOW_HEADED: "false",
    TRACKING_ENABLE_DEMO: "true",
  });
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 9000);
  assert.deepEqual(config.execution, {
    maxConcurrency: 2,
    queueLimit: 9,
    runTimeoutMs: 12345,
    maxAgentTurns: 7,
  });
  assert.deepEqual(config.artifacts, { ttlMs: 48 * 60 * 60 * 1000 });
  assert.equal(config.browser.headless, true);
  assert.equal(config.browser.allowHeaded, false);
  assert.deepEqual(config.demo, { enabled: true });
});

test("artifact retention is clamped to the supported one-hour through seven-day range", () => {
  assert.equal(loadConfig({ TRACKING_ARTIFACT_TTL_HOURS: "0" }).artifacts.ttlMs, 60 * 60 * 1000);
  assert.equal(loadConfig({ TRACKING_ARTIFACT_TTL_HOURS: "999" }).artifacts.ttlMs, 7 * 24 * 60 * 60 * 1000);
  assert.equal(loadConfig({ TRACKING_ARTIFACT_TTL_HOURS: "not-a-number" }).artifacts.ttlMs, 24 * 60 * 60 * 1000);
});

test("package root resolves from both source and compiled module directories", () => {
  const root = resolve("carrier-agent-lab-fixture");
  assert.equal(resolvePackageRoot(join(root, "src")), root);
  assert.equal(resolvePackageRoot(join(root, "dist", "src")), root);
});
