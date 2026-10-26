import test from "node:test";
import { createCoscoRuntime } from "../services/cosco-runtime.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCoscoCircuitBreaker, createCoscoQueryGate } from "../lib/cosco-request-guard.mjs";
import {
  decorateProxySuccess,
  enrichCoscoShipmentContainers,
  isIndependentCoscoPlaywrightProxy,
  normalizeCoscoSnapshot,
  normalizeTrackingRequest,
  parseRetryAfter,
  proxyPoolExhaustedError,
  safeSupplementalWarnings,
  shouldFallbackCoscoAutoToProxy,
  shouldRotateCoscoProxy
} from "../server.mjs";

async function readServerSource() {
  const sources = await Promise.all(
    [
      "../services/cosco-channel-executor.mjs",
      "../services/cosco-fallback-runner.mjs",
      "../services/cosco-supplemental-workflow.mjs",
      "../services/cosco-runtime.mjs",
      "../http/tracking-controller.mjs",
      "../services/cosco-policy.mjs"
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );
  // Remove only the factory's outer indent so the legacy routing contracts retain their boundaries.
  return sources.map((text) => text.replace(/\r\n/g, "\n").replace(/^ {2}/gm, "")).join("\n");
}
test("proxy exhaustion reports safe node names, attempt count, and root cause", () => {
  const error = proxyPoolExhaustedError(
    {
      status: 502,
      message: "Configured COSCO proxy is unavailable",
      details: { code: "COSCO_PROXY_UNAVAILABLE" }
    },
    3,
    ["🇭🇰 香港S01", "🇭🇰 香港S02", "🇯🇵 日本S01"]
  );

  assert.match(error.message, /已尝试 3 个出口节点/);
  assert.match(error.message, /香港S01.*香港S02.*日本S01/);
  assert.match(error.message, /COSCO_PROXY_UNAVAILABLE/);
  assert.deepEqual(error.details.triedNodes, ["🇭🇰 香港S01", "🇭🇰 香港S02", "🇯🇵 日本S01"]);
  assert.equal(error.details.proxyNode, "🇯🇵 日本S01");
  assert.equal(error.details.proxyAttempts, 3);
  assert.doesNotMatch(error.message, /socks5:\/\//i);
});

test("successful proxy results expose only safe structured route diagnostics", () => {
  const result = decorateProxySuccess(
    {
      snapshot: { tracking: { number: "6505740970" } },
      strategy: { requested: "AUTO", fallbackUsed: true }
    },
    {
      proxyNode: "socks5://operator:private-password@proxy.example:1080",
      proxyAttempts: 2,
      triedNodes: ["HK-S01", "socks5://operator:private-password@proxy.example:1080"]
    }
  );

  assert.equal(result.strategy.requested, "AUTO");
  assert.equal(result.strategy.used, "PROXY");
  assert.equal(result.strategy.proxyAttempts, 2);
  assert.deepEqual(result.strategy.triedNodes, ["HK-S01", result.strategy.proxyNode]);
  assert.match(result.strategy.proxyNode, /^proxy-[a-f0-9]{10}$/);
  assert.doesNotMatch(JSON.stringify(result.strategy), /operator|private-password|proxy\.example/i);
});

test("supplemental warning diagnostics retain source context without leaking proxy credentials", () => {
  const warnings = safeSupplementalWarnings([
    {
      source: "bookingInfo",
      code: "COSCO_UPSTREAM_BLOCKED",
      message: "blocked",
      route: "PROXY",
      proxyNode: "socks5://operator:private-password@proxy.example:1080",
      attempts: 2,
      triedNodes: ["HK-S01", "socks5://operator:private-password@proxy.example:1080"]
    }
  ]);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].source, "bookingInfo");
  assert.equal(warnings[0].code, "COSCO_UPSTREAM_BLOCKED");
  assert.equal(warnings[0].attempts, 2);
  assert.match(warnings[0].proxyNode, /^proxy-[a-f0-9]{10}$/);
  assert.deepEqual(warnings[0].triedNodes, ["HK-S01", warnings[0].proxyNode]);
  assert.doesNotMatch(JSON.stringify(warnings), /operator|private-password|proxy\.example/i);
});

class VirtualTimers {
  constructor(now = 1_000) {
    this.now = now;
    this.nextId = 1;
    this.timers = new Map();
    this.scheduledDelays = [];
  }

  setTimer = (callback, delayMs = 0) => {
    const id = this.nextId++;
    const delay = Math.max(0, Number(delayMs) || 0);
    this.scheduledDelays.push(delay);
    this.timers.set(id, { callback, dueAt: this.now + delay });
    return id;
  };

  clearTimer = (id) => {
    this.timers.delete(id);
  };

  async runNext() {
    const next = [...this.timers.entries()].sort(
      (left, right) => left[1].dueAt - right[1].dueAt
    )[0];
    assert.ok(next, "Expected a pending virtual timer");
    const [id, timer] = next;
    this.timers.delete(id);
    this.now = timer.dueAt;
    timer.callback();
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  }
}

test("query gate applies deterministic 10-12 second jitter while keeping operations serial", async () => {
  const timers = new VirtualTimers();
  const randomValues = [0.5, 0, 0.999999];
  const gate = createCoscoQueryGate({
    minIntervalMs: 10_000,
    maxIntervalMs: 12_000,
    queueTimeoutMs: 600_000,
    random: () => randomValues.shift() ?? 0,
    now: () => timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });
  let active = 0;
  let maximumActive = 0;
  const startTimes = [];
  const operation = (id) => async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    startTimes.push([id, timers.now]);
    await Promise.resolve();
    active -= 1;
    return id;
  };

  const jobs = [gate.run(operation(1)), gate.run(operation(2)), gate.run(operation(3))];
  await timers.runNext();
  await timers.runNext();
  await timers.runNext();

  assert.deepEqual(await Promise.all(jobs), [1, 2, 3]);
  assert.equal(maximumActive, 1);
  assert.deepEqual(startTimes, [
    [1, 1_000],
    [2, 11_000],
    [3, 23_000]
  ]);
  assert.deepEqual(
    timers.scheduledDelays.filter((delay) => delay <= 12_000),
    [0, 10_000, 12_000]
  );
  assert.deepEqual(gate.stats(), {
    active: 0,
    queued: 0,
    minIntervalMs: 10_000,
    maxIntervalMs: 12_000,
    queueLimit: 50,
    queueTimeoutMs: 600_000
  });
});

test("aborting during a delayed start rejects immediately without running the operation", async () => {
  const timers = new VirtualTimers();
  const gate = createCoscoQueryGate({
    minIntervalMs: 3_000,
    maxIntervalMs: 3_000,
    queueTimeoutMs: 600_000,
    now: () => timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  const first = gate.run(async () => "first");
  await timers.runNext();
  assert.equal(await first, "first");

  const controller = new AbortController();
  let ran = false;
  const delayed = gate.run(
    async () => {
      ran = true;
    },
    { signal: controller.signal }
  );
  controller.abort();

  await assert.rejects(delayed, (error) => error.code === "BATCH_CANCELLED");
  assert.equal(ran, false);
  assert.equal(gate.stats().active, 0);
  assert.equal(gate.stats().queued, 0);
});

test("query gate preserves upstream error metadata for retry and cooldown decisions", async () => {
  const timers = new VirtualTimers();
  const gate = createCoscoQueryGate({
    minIntervalMs: 0,
    maxIntervalMs: 0,
    queueTimeoutMs: 600_000,
    now: () => timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });
  const upstream = Object.assign(new Error("rate limited"), {
    httpStatus: 429,
    code: "COSCO_UPSTREAM_RATE_LIMITED",
    retryAfterMs: 45_000
  });

  const pending = gate.run(async () => {
    throw upstream;
  });
  await timers.runNext();

  await assert.rejects(pending, (error) => {
    assert.equal(error, upstream);
    assert.equal(error.httpStatus, 429);
    assert.equal(error.code, "COSCO_UPSTREAM_RATE_LIMITED");
    assert.equal(error.retryAfterMs, 45_000);
    return true;
  });
});

test("circuit breaker honors immediate Retry-After and reset clears the circuit", () => {
  let now = Date.parse("2026-07-21T00:00:00Z");
  const breaker = createCoscoCircuitBreaker({
    cooldownMs: 60_000,
    failureThreshold: 2,
    now: () => now
  });

  const opened = breaker.recordFailure({ retryAfterMs: 45_000, immediate: true });
  assert.equal(opened.blocked, true);
  assert.equal(opened.retryAfterMs, 45_000);
  assert.equal(opened.consecutiveFailures, 1);

  now += 20_000;
  assert.equal(breaker.remainingMs(), 25_000);
  breaker.reset();
  assert.deepEqual(breaker.status(), {
    blocked: false,
    blockedUntil: null,
    retryAfterMs: 0,
    cooldownMs: 60_000,
    consecutiveFailures: 0,
    failureThreshold: 2
  });
});

test("Retry-After parser supports seconds and HTTP dates without real waiting", () => {
  const now = Date.parse("2026-07-21T00:00:00Z");
  assert.equal(parseRetryAfter("2.5", now), 2_500);
  assert.equal(parseRetryAfter("Tue, 21 Jul 2026 00:00:09 GMT", now), 9_000);
  assert.equal(parseRetryAfter("Tue, 21 Jul 2026 00:00:00 GMT", now), 1_000);
  assert.equal(parseRetryAfter("not-a-retry-value", now), null);
  assert.equal(parseRetryAfter("", now), null);
});

test("proxy pool retries gateway timeouts but not invalid tracking input", () => {
  assert.equal(shouldRotateCoscoProxy({ status: 504 }), true);
  assert.equal(shouldRotateCoscoProxy({ status: 400 }), false);
});

test("optional container enrichment remains partial on an ordinary child failure", async () => {
  const request = normalizeTrackingRequest({ type: "BILLOFLADING", number: "6502406170" });
  const originalContainer = {
    containerNumberWithCheckDigit: "TEMU6003424",
    containerType: "40HQ",
    milestones: []
  };
  let childCalls = 0;
  const containers = await enrichCoscoShipmentContainers([originalContainer], async () => {
    childCalls += 1;
    throw Object.assign(new Error("optional container endpoint failed"), {
      httpStatus: 502,
      code: "OPTIONAL_ENRICHMENT_FAILED"
    });
  });
  const snapshot = normalizeCoscoSnapshot(
    {
      cargoTrackingSummary: {
        blNumber: "6502406170",
        containerSummaryInfos: [{ cntrType: "40HQ", quantity: "1" }]
      },
      cargoTrackingFullChain: [],
      cargoTrackingSailingSchedule: []
    },
    request,
    "2026-07-21T00:00:00.000Z",
    { bookingInfo: {}, containerInfo: containers }
  );

  assert.equal(childCalls, 1);
  assert.equal(snapshot.tracking.number, "6502406170");
  assert.equal(snapshot.containers.length, 1);
  assert.equal(snapshot.containers[0].number, "TEMU6003424");
  assert.equal(snapshot.containers[0].detailSource, "SHIPMENT_QUERY");
});

test("optional enrichment propagates 403 and 429 protection errors", async () => {
  const container = {
    containerNumberWithCheckDigit: "TEMU6003424",
    milestones: []
  };
  const blocked = Object.assign(new Error("blocked"), { upstreamStatus: 403 });
  await assert.rejects(
    enrichCoscoShipmentContainers([container], async () => {
      throw blocked;
    }),
    (error) => error === blocked
  );

  const limited = Object.assign(new Error("limited"), {
    code: "COSCO_UPSTREAM_RATE_LIMITED",
    status: 429,
    details: { code: "COSCO_UPSTREAM_RATE_LIMITED" },
    retryAfterMs: 30_000
  });
  await assert.rejects(
    enrichCoscoShipmentContainers([container], async () => {
      throw limited;
    }),
    (error) => error === limited && error.retryAfterMs === 30_000
  );
});

test("AUTO primary strategy never jumps from the direct API to direct Playwright", async () => {
  const source = await readServerSource();
  const autoStrategy = source.slice(
    source.indexOf("async function fetchCoscoTracking(request, queryChannel"),
    source.indexOf("export function shouldRotateCoscoProxy")
  );

  assert.match(
    autoStrategy,
    /if \(queryChannel\.code === "AUTO"\)[\s\S]*?fetchCoscoTrackingViaNetwork/
  );
  assert.doesNotMatch(
    autoStrategy.match(/if \(queryChannel\.code === "AUTO"\)[\s\S]*?\n {2}\}/)?.[0] ?? "",
    /fetchCoscoTrackingWithPlaywright/
  );
});

test("AUTO uses direct API, then proxy API pool, then one dedicated-proxy Playwright attempt", async () => {
  const source = await readServerSource();
  const routing = source.slice(
    source.indexOf("async function runCoscoWithAutomaticProxyFallback"),
    source.indexOf("function runCoscoTrackingRequest")
  );
  const direct = routing.search(/runCoscoWithProxyRotation\(\s*queryChannel/);
  const proxy = routing.search(/runCoscoWithProxyRotation\(\s*COSCO_QUERY_CHANNELS\.PROXY/);
  const playwright = routing.indexOf("operation(COSCO_QUERY_CHANNELS.PLAYWRIGHT");
  const configuredGuard = routing.indexOf("!COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED");

  assert.ok(direct >= 0, "AUTO must start with the requested direct route");
  assert.ok(proxy > direct, "proxy API pool must follow the direct API");
  assert.ok(playwright > proxy, "dedicated-proxy Playwright must be the last fallback");
  assert.ok(configuredGuard > proxy && configuredGuard < playwright);
  assert.equal((routing.match(/operation\(COSCO_QUERY_CHANNELS\.PLAYWRIGHT/g) ?? []).length, 1);
  assert.match(routing, /playwrightProxy: COSCO_PLAYWRIGHT_PROXY_CONFIG/);
  const fallbackError = source.slice(
    source.indexOf("function automaticPlaywrightFallbackError"),
    source.indexOf("async function runCoscoWithAutomaticProxyFallback")
  );
  assert.match(fallbackError, /safeSupplementalWarnings\([\s\S]*?playwrightDetails\.warnings/);
});

test("main-query enrichment warnings preserve route and proxy diagnostics", async () => {
  const source = await readServerSource();
  const network = source.slice(
    source.indexOf("async function fetchCoscoTrackingViaNetwork"),
    source.indexOf("async function fetchCoscoTrackingWithPlaywright")
  );

  assert.match(network, /enrichmentWarning = \{[\s\S]*?proxyNode: safeProxyNodeAlias/);
  assert.match(network, /attempts:[\s\S]*?triedNodes:[\s\S]*?retryAfterMs:/);
});

test("AUTO Playwright fallback requires an exit independent from the API proxy", () => {
  assert.equal(isIndependentCoscoPlaywrightProxy(null, null), false);
  assert.equal(
    isIndependentCoscoPlaywrightProxy({ server: "socks5://browser-proxy:1080" }, null),
    true
  );
  assert.equal(
    isIndependentCoscoPlaywrightProxy(
      { server: "socks5://mihomo:7891" },
      { server: "socks5://mihomo:7891" }
    ),
    false
  );
  assert.equal(
    isIndependentCoscoPlaywrightProxy(
      { server: "socks5://provider:1080", username: "browser-route" },
      { server: "socks5://provider:1080", username: "api-route" }
    ),
    true
  );
});

test("AUTO falls back to the proxy pool for block, timeout, and gateway failures", () => {
  assert.equal(
    shouldFallbackCoscoAutoToProxy(
      Object.assign(new Error("blocked"), {
        upstreamStatus: 403
      })
    ),
    true
  );
  assert.equal(
    shouldFallbackCoscoAutoToProxy(
      Object.assign(new Error("timed out"), {
        status: 504
      })
    ),
    true
  );
  assert.equal(
    shouldFallbackCoscoAutoToProxy(
      Object.assign(new Error("bad gateway"), {
        status: 502
      })
    ),
    true
  );
  assert.equal(shouldFallbackCoscoAutoToProxy(new Error("invalid reference")), false);
});

test("supplemental upstream protection is preserved instead of becoming a partial warning", async (t) => {
  for (const [source, status, code] of [
    ["bookingInfo", 403, "COSCO_UPSTREAM_BLOCKED"],
    ["containerInfo", 429, "COSCO_UPSTREAM_RATE_LIMITED"]
  ]) {
    const runtime = createCoscoRuntime({
      env: {
        CHANNEL_C_MONITOR_ENABLED: "false",
        COSCO_QUERY_MIN_INTERVAL_MS: "0",
        COSCO_QUERY_MAX_INTERVAL_MS: "0",
        COSCO_UPSTREAM_MIN_INTERVAL_MS: "0",
        COSCO_UPSTREAM_MAX_INTERVAL_MS: "0"
      },
      fetchDirect: async (url) =>
        url.endsWith(`/${source}`)
          ? new Response("protected", { status })
          : new Response(JSON.stringify({ code: "200", success: true, result: {} })),
      closeBrowser: async () => {}
    });
    t.after(() => runtime.dispose());
    await assert.rejects(
      runtime.fetchSupplementalDetails(
        normalizeTrackingRequest({ type: "BOOKING", number: "6502077380" }),
        { code: "NETWORK" }
      ),
      (error) => error.details.code === code
    );
    assert.equal(runtime.getHealth().coscoProtection.circuitBreakers.direct.blocked, true);
    assert.equal(runtime.getHealth().coscoProtection.circuitBreakers.proxy.blocked, false);
  }
});

test("delayed supplemental retry queries only failed sources before one authorized browser fallback", async (t) => {
  const calls = [];
  const runtime = createCoscoRuntime({
    env: {
      CHANNEL_C_MONITOR_ENABLED: "false",
      COSCO_QUERY_MIN_INTERVAL_MS: "0",
      COSCO_QUERY_MAX_INTERVAL_MS: "0",
      COSCO_UPSTREAM_MIN_INTERVAL_MS: "0",
      COSCO_UPSTREAM_MAX_INTERVAL_MS: "0",
      COSCO_PLAYWRIGHT_PROXY_SERVER: "socks5://browser.example:1080"
    },
    fetchDirect: async (url) => {
      calls.push(url.split("/").at(-1));
      return new Response("not found", { status: 404 });
    },
    fetchBrowser: async (request, options) => {
      calls.push("browser");
      assert.equal(options.dedicatedFallback, true);
      return {
        detail: { cargoTrackingSummary: { blNumber: request.number }, cargoTrackingFullChain: [] },
        bookingInfo: { clientPoNumber: "UNREQUESTED" },
        containerInfo: [{ containerNumberWithCheckDigit: "TEMU6003424", containerType: "40HQ" }]
      };
    },
    closeBrowser: async () => {}
  });
  t.after(() => runtime.dispose());
  const result = await runtime.fetchSupplementalDetails(
    normalizeTrackingRequest({ type: "BOOKING", number: "6502077380" }),
    { code: "AUTO" },
    {
      sources: ["containerInfo"],
      allowPlaywrightFallback: true,
      authorizeProxyFallback: () => calls.push("authorize")
    }
  );
  assert.deepEqual(calls, ["containerInfo", "authorize", "browser"]);
  assert.equal(result.containers[0].number, "TEMU6003424");
  assert.deepEqual(result.references, { external: [], business: {}, information: [] });
  assert.equal(result.partial, false);
  assert.equal(result.strategy.used, "PLAYWRIGHT_PROXY");
  assert.equal(result.strategy.playwrightAttempts, 1);
});

test("business-code 403 opens protection before the generic adapter failure path", async (t) => {
  const runtime = createCoscoRuntime({
    env: {
      CHANNEL_C_MONITOR_ENABLED: "false",
      COSCO_QUERY_MIN_INTERVAL_MS: "0",
      COSCO_QUERY_MAX_INTERVAL_MS: "0",
      COSCO_UPSTREAM_MIN_INTERVAL_MS: "0",
      COSCO_UPSTREAM_MAX_INTERVAL_MS: "0"
    },
    fetchDirect: async () => new Response(JSON.stringify({ code: "403", success: false })),
    closeBrowser: async () => {}
  });
  t.after(() => runtime.dispose());
  await assert.rejects(
    runtime.runTracking(normalizeTrackingRequest({ type: "BOOKING", number: "6502077380" }), {
      code: "NETWORK"
    }),
    (error) => error.status === 503 && error.details.code === "COSCO_UPSTREAM_BLOCKED"
  );
  assert.equal(runtime.getHealth().coscoProtection.circuitBreakers.direct.blocked, true);
  assert.equal(runtime.getHealth().coscoProtection.circuitBreakers.proxy.blocked, false);
});

test("shipment queries never start per-container enrichment", async () => {
  const source = await readServerSource();
  const network = source.slice(
    source.indexOf("async function fetchCoscoTrackingViaNetwork"),
    source.indexOf("async function fetchCoscoTrackingWithPlaywright")
  );
  const playwright = source.slice(
    source.indexOf("async function fetchCoscoTrackingWithPlaywright"),
    source.indexOf("async function fetchCoscoTracking(request")
  );

  assert.doesNotMatch(network, /enrichCoscoShipmentContainers\(/);
  assert.doesNotMatch(playwright, /enrichCoscoShipmentContainers\(/);
  assert.match(network, /fetchCoscoShipmentContainers\(request, options\)/);
  assert.match(playwright, /partial:\s*Boolean\(options\.batch \|\| enrichmentWarning\)/);
});

test("forced refresh bypasses the Node cache and in-flight reuse", async () => {
  const source = await readServerSource();
  const handler = source.slice(
    source.indexOf("async function handleTrackRequest"),
    source.indexOf("export function isIndependentCoscoPlaywrightProxy")
  );

  assert.match(handler, /const forceRefresh = input\.forceRefresh === true/);
  assert.match(handler, /!forceRefresh &&\s*cached/);
  assert.match(handler, /batchTaskId \|\| forceRefresh\s*\? null/);
});
