import assert from "node:assert/strict";
import test from "node:test";
import {
  createCoscoProxyPool,
  prioritizeProxyNodes,
  readCoscoProxyPoolConfig,
  runWithProxyPoolRetries
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
    maxAttemptsPerShipment: 5
  });
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
