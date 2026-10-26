import assert from "node:assert/strict";
import test from "node:test";
import { createCoscoRuntime } from "../services/cosco-runtime.mjs";
import {
  COSCO_QUERY_CHANNELS,
  COSCO_AUTO_QUERY_STRATEGY,
  normalizeTrackingRequest
} from "../lib/carrier-adapters.mjs";

const request = normalizeTrackingRequest({ type: "BOOKING", number: "6502077380" });
const detail = {
  cargoTrackingSummary: {
    blNumber: "6502077380",
    por: "Shanghai",
    fnd: "Atlanta",
    containerSummaryInfos: [{ cntrType: "40HQ", quantity: "1" }]
  },
  cargoTrackingFullChain: [],
  cargoTrackingSailingSchedule: []
};
const containers = [
  { containerNumberWithCheckDigit: "TEMU6003424", containerType: "40HQ", milestones: [] }
];
const env = {
  CHANNEL_C_MONITOR_ENABLED: "false",
  COSCO_QUERY_MIN_INTERVAL_MS: "0",
  COSCO_QUERY_MAX_INTERVAL_MS: "0",
  COSCO_UPSTREAM_MIN_INTERVAL_MS: "0",
  COSCO_UPSTREAM_MAX_INTERVAL_MS: "0"
};
function runtime(t, options = {}) {
  const instance = createCoscoRuntime({ env, closeBrowser: async () => {}, ...options });
  t.after(() => instance.dispose());
  return instance;
}
function upstream(result) {
  return new Response(JSON.stringify({ code: "200", success: true, result }));
}

test("runtime wires authorized AUTO fallback through the executor to a dedicated browser", async (t) => {
  const calls = [];
  const signal = new AbortController().signal;
  const instance = runtime(t, {
    env: { ...env, COSCO_PLAYWRIGHT_PROXY_SERVER: "socks5://browser.example:1080" },
    fetchDirect: async () => {
      calls.push("direct");
      return new Response("unavailable", { status: 503 });
    },
    fetchBrowser: async (input, options) => {
      calls.push("browser");
      assert.equal(input, request);
      assert.equal(options.signal, signal);
      assert.equal(options.proxy.server, "socks5://browser.example:1080");
      assert.equal(options.dedicatedFallback, true);
      return { detail, bookingInfo: {}, containerInfo: containers };
    }
  });
  const result = await instance.runTracking(request, COSCO_AUTO_QUERY_STRATEGY, {
    signal,
    authorizeProxyFallback: () => calls.push("authorize")
  });
  assert.deepEqual(calls, ["direct", "authorize", "browser"]);
  assert.equal(result.snapshot.tracking.number, request.number);
  assert.equal(result.enrichment.containerDetailsComplete, true);
  assert.equal(result.strategy.used, "PLAYWRIGHT_PROXY");
  assert.equal(result.strategy.apiProxyAttempts, 0);
  assert.equal(result.strategy.playwrightAttempts, 1);
});

test("runtime keeps upstream failure when private fallback authorization is denied", async (t) => {
  const instance = runtime(t, {
    env: { ...env, COSCO_PLAYWRIGHT_PROXY_SERVER: "socks5://browser.example:1080" },
    fetchDirect: async () => new Response("unavailable", { status: 503 }),
    fetchBrowser: () => assert.fail("public request must not consume private browser exit")
  });
  let authorizations = 0;
  await assert.rejects(
    instance.runTracking(request, COSCO_AUTO_QUERY_STRATEGY, {
      authorizeProxyFallback: () => {
        authorizations++;
        throw new Error("denied");
      }
    }),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.details.code, "COSCO_UPSTREAM_UNAVAILABLE");
      return true;
    }
  );
  assert.equal(authorizations, 1);
});

test("network runtime assembles a complete booking without per-container child requests", async (t) => {
  const calls = [];
  const instance = runtime(t, {
    fetchDirect: async (url) => {
      const endpoint = url.split("/").at(-1);
      calls.push(endpoint);
      return upstream({ detail, bookingInfo: {}, containerInfo: containers }[endpoint]);
    }
  });
  const result = await instance.runTracking(request, COSCO_QUERY_CHANNELS.NETWORK);
  assert.deepEqual(calls, ["detail", "bookingInfo", "containerInfo"]);
  assert.equal(result.snapshot.tracking.number, request.number);
  assert.equal(result.snapshot.containers[0].number, "TEMU6003424");
  assert.equal(result.enrichment.containerDetailsComplete, true);
  assert.equal(result.enrichment.partial, false);
});

test("batch core queries skip supplemental requests and retain incomplete-detail metadata", async (t) => {
  const calls = [];
  const instance = runtime(t, {
    fetchDirect: async (url) => {
      calls.push(url.split("/").at(-1));
      return upstream(detail);
    }
  });
  const result = await instance.runTracking(request, COSCO_QUERY_CHANNELS.NETWORK, { batch: true });
  assert.deepEqual(calls, ["detail"]);
  assert.equal(result.enrichment.partial, true);
  assert.equal(result.enrichment.containerDetailsComplete, false);
});

test("browser runtime applies the same snapshot completeness rule as network runtime", async (t) => {
  const calls = [];
  const instance = runtime(t, {
    fetchDirect: () => {
      throw Error("network must not run");
    },
    fetchBrowser: async (...args) => {
      calls.push(args);
      return { detail, bookingInfo: {}, containerInfo: containers };
    }
  });
  const result = await instance.runTracking(request, COSCO_QUERY_CHANNELS.PLAYWRIGHT);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].number, request.number);
  assert.equal(result.snapshot.channel, "PLAYWRIGHT");
  assert.equal(result.enrichment.containerDetailsComplete, true);
});

test("supplemental retries request only selected sources and never the core snapshot", async (t) => {
  const calls = [];
  const instance = runtime(t, {
    fetchDirect: async (url) => {
      calls.push(url.split("/").at(-1));
      return upstream(containers);
    }
  });
  const result = await instance.fetchSupplementalDetails(request, COSCO_QUERY_CHANNELS.NETWORK, {
    sources: ["containerInfo", "ignored"]
  });
  assert.deepEqual(calls, ["containerInfo"]);
  assert.equal(result.containers[0].number, "TEMU6003424");
  assert.equal(result.partial, false);
});

test("main and supplemental runtime queries serialize through the original shared gate", async (t) => {
  const calls = [];
  let entered;
  let release;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const instance = runtime(t, {
    fetchDirect: async (url) => {
      const endpoint = url.split("/").at(-1);
      calls.push(endpoint);
      if (endpoint === "detail") {
        entered();
        return new Promise((resolve) => {
          release = () => resolve(upstream(detail));
        });
      }
      return upstream({ clientPoNumber: "PO-001" });
    }
  });
  const main = instance.runTracking(request, COSCO_QUERY_CHANNELS.NETWORK, { batch: true });
  await started;
  const supplemental = instance.fetchSupplementalDetails(request, COSCO_QUERY_CHANNELS.NETWORK, {
    sources: ["bookingInfo"]
  });
  assert.equal(instance.getHealth().coscoProtection.queue.queued, 1);
  assert.deepEqual(calls, ["detail"]);
  release();
  const [mainResult, supplementalResult] = await Promise.all([main, supplemental]);
  assert.deepEqual(calls, ["detail", "bookingInfo"]);
  assert.equal(mainResult.snapshot.tracking.number, request.number);
  assert.equal(supplementalResult.references.business.clientPoNumber, "PO-001");
});

test("circuit state is isolated between runtime instances", async (t) => {
  const blocked = runtime(t, { fetchDirect: async () => new Response("blocked", { status: 403 }) });
  const healthy = runtime(t, {
    fetchDirect: async (url) =>
      upstream(url.endsWith("/detail") ? detail : url.endsWith("/containerInfo") ? containers : {})
  });
  await assert.rejects(
    blocked.runTracking(request, COSCO_QUERY_CHANNELS.NETWORK),
    (error) => error.details.code === "COSCO_UPSTREAM_BLOCKED"
  );
  assert.equal(blocked.getHealth().coscoProtection.circuitBreakers.direct.blocked, true);
  assert.equal(healthy.getHealth().coscoProtection.circuitBreakers.direct.blocked, false);
  assert.equal(
    (await healthy.runTracking(request, COSCO_QUERY_CHANNELS.NETWORK)).snapshot.tracking.number,
    request.number
  );
});

test("runtime disposal is idempotent and a closed runtime cannot restart its monitor", async (t) => {
  let closed = 0;
  let requests = 0;
  const instance = runtime(t, {
    env: { ...env, CHANNEL_C_MONITOR_ENABLED: "true" },
    closeBrowser: async () => {
      closed++;
    },
    fetchDirect: async () => {
      requests++;
      return upstream(detail);
    }
  });
  await instance.dispose();
  await instance.dispose();
  instance.startChannelCMonitor();
  await Promise.resolve();
  assert.equal(closed, 1);
  assert.equal(requests, 0);
  assert.equal(instance.getChannelCHealthStatus().nextCheckAt, null);
});

test("health probes use the extracted endpoint client and coalesce concurrent checks", async (t) => {
  const calls = [];
  let started;
  let release;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const instance = runtime(t, {
    fetchDirect: async (url) => {
      calls.push(url);
      if (url.endsWith("/detail")) {
        started();
        return new Promise((resolve) => {
          release = () => resolve(upstream(detail));
        });
      }
      return url.includes("/ct/base?") ? new Response("page") : upstream(containers);
    },
    fetchBrowser: async () => ({ containers })
  });
  const first = instance.runChannelCHealthCheck();
  await entered;
  const second = instance.runChannelCHealthCheck();
  release();
  const health = await Promise.all([first, second]);
  assert.equal(calls.length, 1);
  assert.ok(health.every((status) => status.available && status.lastAttemptCount === 1));
  const probes = await instance.runCoscoChannelChecks({ type: "CONTAINER", number: "TEMU6003424" });
  assert.equal(probes.channels.NETWORK.available, true);
  assert.equal(probes.channels.PLAYWRIGHT.available, true);
  assert.match(calls[1], /\/ct\/base\?/);
  assert.match(calls[2], /\/containers$/);
  assert.equal(instance.getChannelCHealthStatus().nextCheckAt, null);
});
