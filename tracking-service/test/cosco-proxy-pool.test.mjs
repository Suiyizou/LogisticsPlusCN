import assert from "node:assert/strict";
import test from "node:test";
import {
  createCoscoProxyPool,
  prioritizeProxyNodes,
  readCoscoProxyPoolConfig,
  runWithProxyPoolRetries,
  safeProxyNodeAlias
} from "../lib/cosco-proxy-pool.mjs";

test("orders usable airport nodes with Hong Kong first and excludes download-only nodes", () => {
  assert.deepEqual(prioritizeProxyNodes([
    "🇺🇲 美国S01",
    "🇯🇵 日本S02",
    "🇭🇰 香港S10",
    "🇭🇰 香港S02",
    "🇯🇵 日本S05 | 下载专用",
    "🇨🇳 台湾S01"
  ]), [
    "🇭🇰 香港S02",
    "🇭🇰 香港S10",
    "🇨🇳 台湾S01",
    "🇯🇵 日本S02",
    "🇺🇲 美国S01"
  ]);
});

test("rotates a rejected Hong Kong exit to the next Hong Kong node through Mihomo", async () => {
  const calls = [];
  const config = readCoscoProxyPoolConfig({
    COSCO_PROXY_POOL_CONTROLLER: "http://proxy-pool:9090",
    COSCO_PROXY_POOL_GROUP: "TRACKING-POOL",
    COSCO_PROXY_POOL_SECRET: "internal-secret"
  });
  const pool = createCoscoProxyPool(config, {
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if ((options.method ?? "GET") === "PUT") {
        return { ok: true, status: 204, json: async () => null };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          now: "🇭🇰 香港S01",
          all: ["🇯🇵 日本S01", "🇭🇰 香港S02", "🇭🇰 香港S01", "🇨🇳 台湾S01"]
        })
      };
    }
  });

  const result = await pool.rotate("COSCO_UPSTREAM_BLOCKED");

  assert.equal(result.rotated, true);
  assert.equal(result.current, "🇭🇰 香港S02");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, "Bearer internal-secret");
  assert.deepEqual(JSON.parse(calls[1].options.body), { name: "🇭🇰 香港S02" });
});

test("does not expose credentials in pool status", () => {
  const config = readCoscoProxyPoolConfig({
    COSCO_PROXY_POOL_CONTROLLER: "http://proxy-pool:9090",
    COSCO_PROXY_POOL_SECRET: "internal-secret",
    COSCO_PROXY_POOL_MAX_ATTEMPTS_PER_SHIPMENT: "5"
  });
  const pool = createCoscoProxyPool(config, {
    fetchImpl: async () => { throw new Error("unused"); }
  });

  assert.deepEqual(pool.status(), {
    enabled: true,
    controller: "proxy-pool:9090",
    group: "TRACKING-POOL",
    currentNode: null,
    maxAttemptsPerShipment: 5,
    maxRequestsPerNode: 12
  });
});

test("turns credential-like node names into stable opaque aliases", () => {
  const sensitive = "socks5://operator:private-password@proxy.example:1080";
  const alias = safeProxyNodeAlias(sensitive);

  assert.match(alias, /^proxy-[a-f0-9]{10}$/);
  assert.equal(alias, safeProxyNodeAlias(sensitive));
  assert.doesNotMatch(alias, /operator|private-password|proxy\.example/i);
  assert.equal(safeProxyNodeAlias("  HK-S01\u0000  "), "HK-S01");
});

test("rotates a node before its configured request budget is exceeded", async () => {
  const calls = [];
  let current = "HK-S01";
  const config = readCoscoProxyPoolConfig({
    COSCO_PROXY_POOL_CONTROLLER: "http://proxy-pool:9090",
    COSCO_PROXY_POOL_MAX_REQUESTS_PER_NODE: "2",
    COSCO_PROXY_POOL_NODE_COOLDOWN_MS: "60000"
  });
  const pool = createCoscoProxyPool(config, {
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if ((options.method ?? "GET") === "PUT") {
        current = JSON.parse(options.body).name;
        return { ok: true, status: 204, json: async () => null };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ now: current, all: ["HK-S01", "HK-S02", "JP-S01"] })
      };
    }
  });

  assert.deepEqual(await pool.prepareAttempt(), {
    rotated: false,
    reason: null,
    previous: null,
    current: "HK-S01",
    requestCount: 1,
    requestBudget: 2,
    budgetDeferred: false,
    candidateCount: 3
  });
  assert.equal((await pool.prepareAttempt()).requestCount, 2);
  const rotated = await pool.prepareAttempt();

  assert.equal(rotated.rotated, true);
  assert.equal(rotated.reason, "REQUEST_BUDGET");
  assert.equal(rotated.previous, "HK-S01");
  assert.equal(rotated.current, "HK-S02");
  assert.equal(rotated.requestCount, 1);
  assert.equal(current, "HK-S02");
  assert.equal(calls.filter((call) => (call.options.method ?? "GET") === "PUT").length, 1);
  assert.equal(pool.status().currentNode, "HK-S02");
});

test("treats the deprecated rotations variable as a total-attempt cap", () => {
  const config = readCoscoProxyPoolConfig({
    COSCO_PROXY_POOL_CONTROLLER: "http://proxy-pool:9090",
    COSCO_PROXY_POOL_MAX_ROTATIONS_PER_REQUEST: "3"
  });

  assert.equal(config.maxAttemptsPerShipment, 3);
});

test("caps one proxy request at three total attempts and rotates only between attempts", async () => {
  let attempts = 0;
  let rotations = 0;
  const timeout = Object.assign(new Error("COSCO query timed out"), { status: 504 });

  await assert.rejects(
    runWithProxyPoolRetries({
      maximumAttempts: 3,
      shouldRetry: (error) => error.status === 504,
      rotate: async () => {
        rotations += 1;
        return { rotated: true, previous: `HK-S0${rotations}`, current: `HK-S0${rotations + 1}` };
      },
      exhaustedError: (error, count) => Object.assign(error, {
        code: "COSCO_PROXY_POOL_EXHAUSTED",
        attempts: count
      })
    }, async () => {
      attempts += 1;
      throw timeout;
    }),
    (error) => error.code === "COSCO_PROXY_POOL_EXHAUSTED" && error.attempts === 3
  );

  assert.equal(attempts, 3);
  assert.equal(rotations, 2);
});
