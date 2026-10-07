import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCoscoProxyClient, proxyStatus, readCoscoProxyConfig } from "../lib/cosco-proxy.mjs";
import { createCoscoCircuitBreaker, createCoscoQueryGate } from "../lib/cosco-request-guard.mjs";
import { createBatchTaskRegistry } from "../lib/batch-task-registry.mjs";

test("loads an authenticated SOCKS5 proxy without exposing credentials", async () => {
  assert.equal(readCoscoProxyConfig({}), null);
  const config = readCoscoProxyConfig({
    COSCO_PROXY_ENABLED: "true",
    COSCO_PROXY_SERVER: "socks5://proxy.example:443",
    COSCO_PROXY_USERNAME: "proxy-user",
    COSCO_PROXY_PASSWORD: "proxy-secret"
  });
  assert.deepEqual(proxyStatus(config), {
    enabled: true,
    server: "socks5://proxy.example:443",
    authenticated: true
  });
  const client = createCoscoProxyClient(config);
  assert.equal(client.protocol, "socks5:");
  await client.close();
  assert.throws(
    () =>
      readCoscoProxyConfig({
        COSCO_PROXY_ENABLED: "true",
        COSCO_PROXY_SERVER: "socks5://proxy-user:proxy-secret@proxy.example:443"
      }),
    /credentials in COSCO_PROXY_USERNAME\/PASSWORD/
  );
});

test("protects the proxy channel with a timing-safe internal adapter key", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const httpUtils = await readFile(new URL("../lib/http-utils.mjs", import.meta.url), "utf8");
  assert.match(
    source,
    /function requireProxyAdapterAuthorization[\s\S]*?TRACKING_ADAPTER_KEY[\s\S]*?x-tracking-adapter-key[\s\S]*?secureTextEquals/
  );
  // 常量时间比较已下沉到 lib/http-utils.mjs，行为不变。
  assert.match(httpUtils, /timingSafeEqual\(leftBuffer, rightBuffer\)/);
  assert.match(source, /requireProxyAdapterAuthorization\(request, queryChannel\)/);
});

test("cancels an active batch request and rejects further work for the cancelled task id", () => {
  const registry = createBatchTaskRegistry();
  const taskId = "batch_1234567890abcdef";
  const lease = registry.begin(taskId);
  assert.equal(lease.signal.aborted, false);
  assert.deepEqual(registry.cancel(taskId), {
    taskId,
    status: "cancelled",
    activeRequestCancelled: true
  });
  assert.equal(lease.signal.aborted, true);
  assert.throws(
    () => registry.begin(taskId),
    (error) => error.code === "BATCH_CANCELLED"
  );
});

test("spaces requests in one batch task by a random interval between ten and twelve seconds", async () => {
  let currentTime = 1_000;
  const waits = [];
  const registry = createBatchTaskRegistry({
    now: () => currentTime,
    random: () => 0.5,
    wait: async (delayMs) => {
      waits.push(delayMs);
      currentTime += delayMs;
    }
  });
  const taskId = "batch_interval_1234567890";

  const first = registry.begin(taskId);
  assert.deepEqual(await first.waitForTurn(), { delayMs: 0, intervalMs: 0 });
  first.finish();

  currentTime += 500;
  const second = registry.begin(taskId);
  assert.deepEqual(await second.waitForTurn(), { delayMs: 10_500, intervalMs: 11_000 });
  second.finish();
  assert.deepEqual(waits, [0, 10_500]);
});

test("cancels a batch request while it is waiting for its query window", async () => {
  let currentTime = 1_000;
  const registry = createBatchTaskRegistry({
    now: () => currentTime,
    random: () => 0,
    wait(delayMs, signal) {
      if (delayMs === 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
  });
  const taskId = "batch_waiting_1234567890";
  const first = registry.begin(taskId);
  await first.waitForTurn();
  first.finish();

  currentTime += 100;
  const second = registry.begin(taskId);
  const waiting = second.waitForTurn();
  registry.cancel(taskId);
  await assert.rejects(waiting, (error) => error.code === "BATCH_CANCELLED");
});

test("removes an aborted queued query without running it", async () => {
  const gate = createCoscoQueryGate({ minIntervalMs: 0, queueLimit: 3, queueTimeoutMs: 2_000 });
  let releaseFirst;
  const first = gate.run(
    () =>
      new Promise((resolve) => {
        releaseFirst = resolve;
      })
  );
  while (typeof releaseFirst !== "function") await new Promise((resolve) => setTimeout(resolve, 1));
  const controller = new AbortController();
  let ran = false;
  const queued = gate.run(
    async () => {
      ran = true;
    },
    { signal: controller.signal }
  );
  controller.abort();
  await assert.rejects(queued, (error) => error.code === "BATCH_CANCELLED");
  assert.equal(ran, false);
  releaseFirst();
  await first;
});

test("opens a cooldown circuit after COSCO returns 403", () => {
  let now = Date.parse("2026-07-19T00:00:00Z");
  const breaker = createCoscoCircuitBreaker({ cooldownMs: 10_000, now: () => now });
  breaker.trip();
  assert.equal(breaker.status().blocked, true);
  assert.equal(breaker.remainingMs(), 10_000);
  now += 10_001;
  assert.equal(breaker.status().blocked, false);
});

test("public batch UI delegates work and cancellation to the Spring background task", async () => {
  const [html, source] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="batch-stop-button"/);
  assert.match(source, /batchTaskId/);
  assert.match(source, /cancelBatchTask/);
  assert.match(source, /\/api\/business\/shipment-batch-tasks/);
  assert.match(source, /applyBusinessBatchTask/);
  assert.doesNotMatch(source, /beginSystemWait\("batch"/);
});
