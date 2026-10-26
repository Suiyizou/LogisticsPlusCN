import assert from "node:assert/strict";
import test from "node:test";
import { createCoscoChannelExecutor } from "../services/cosco-channel-executor.mjs";
import { createCoscoUpstream } from "../lib/cosco-upstream.mjs";
import { createCoscoCircuitBreaker } from "../lib/cosco-request-guard.mjs";
import { COSCO_QUERY_CHANNELS, COSCO_AUTO_QUERY_STRATEGY } from "../lib/carrier-adapters.mjs";
import { HttpError } from "../lib/http-utils.mjs";

const request = { type: "BOOKING", number: "6502077380" };
const detail = {
  cargoTrackingSummary: {
    blNumber: request.number,
    containerSummaryInfos: [{ cntrType: "40HQ", quantity: "1" }]
  },
  cargoTrackingFullChain: []
};
const containers = [{ containerNumberWithCheckDigit: "TEMU6003424", containerType: "40HQ" }];
const channels = { ...COSCO_QUERY_CHANNELS, AUTO: COSCO_AUTO_QUERY_STRATEGY };
const proxy = { server: "socks5://browser.example:1080" };
function executor({ endpoints = {}, fetchBrowser, playwright = {} } = {}) {
  const circuitBreakers = {
    DIRECT: createCoscoCircuitBreaker(),
    PROXY: createCoscoCircuitBreaker()
  };
  const upstream = createCoscoUpstream({
    circuitBreakers,
    cookieStates: new Map(),
    networkCoreTimeoutMs: 10000,
    proxyNetworkCoreTimeoutMs: 15000,
    networkEnrichmentTimeoutMs: 4000,
    proxyNetworkEnrichmentTimeoutMs: 8000
  });
  const client = createCoscoChannelExecutor({
    endpoints: {
      fetchCoscoEndpoint: async () => detail,
      optionalCoscoEndpoint: async () => ({}),
      fetchCoscoShipmentContainers: async () => containers,
      fetchCoscoContainers: async () => containers,
      ...endpoints
    },
    upstream,
    fetchBrowser:
      fetchBrowser ?? (async () => ({ detail, bookingInfo: {}, containerInfo: containers })),
    playwright: { proxy: null, proxyAlias: null, timeoutMs: 20000, ...playwright }
  });
  return { client, circuitBreakers };
}

test("proxy execution preserves injected request context and proxy timeout budgets", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const { client } = executor({
    endpoints: {
      fetchCoscoEndpoint: async (...args) => {
        calls.push(args);
        return detail;
      },
      optionalCoscoEndpoint: async (...args) => {
        calls.push(args);
        return {};
      },
      fetchCoscoShipmentContainers: async (...args) => {
        calls.push(args);
        return containers;
      }
    }
  });
  const result = await client.fetchCoscoTracking(request, channels.PROXY, { signal });
  assert.equal(calls[0][1], request);
  assert.deepEqual(calls[0][2], { timeoutMs: 15000, signal, proxyMode: true });
  assert.deepEqual(calls[1][3], { timeoutMs: 8000, signal, proxyMode: true });
  assert.equal(calls[2][1].signal, signal);
  assert.equal(calls[2][1].queryChannel, channels.PROXY);
  assert.equal(result.snapshot.channel, "PROXY");
  assert.deepEqual(result.strategy, { requested: "PROXY", used: "PROXY", fallbackUsed: false });
});

test("AUTO executes only network; batch mode avoids both enrichment endpoints", async () => {
  const calls = [];
  const { client } = executor({
    endpoints: {
      fetchCoscoEndpoint: async (name) => {
        calls.push(name);
        return detail;
      },
      optionalCoscoEndpoint: () => assert.fail("batch enrichment"),
      fetchCoscoShipmentContainers: () => assert.fail("batch containers")
    },
    fetchBrowser: () => assert.fail("AUTO must not jump directly to browser")
  });
  const result = await client.fetchCoscoTracking(request, channels.AUTO, { batch: true });
  assert.deepEqual(calls, ["detail"]);
  assert.equal(result.enrichment.partial, true);
  assert.equal(result.strategy.used, "NETWORK");
});

test("container query normalizes the container endpoint without booking enrichment", async () => {
  const containerRequest = { type: "CONTAINER", number: "TEMU6003424" };
  const { client } = executor({
    endpoints: {
      fetchCoscoEndpoint: () => assert.fail("booking endpoint"),
      fetchCoscoContainers: async (input) => {
        assert.equal(input, containerRequest);
        return containers;
      }
    }
  });
  const result = await client.fetchCoscoTracking(containerRequest, channels.NETWORK);
  assert.equal(result.snapshot.containers[0].number, containerRequest.number);
  assert.equal(result.raw.containers, containers);
});

test("ordinary container enrichment failure preserves the core snapshot", async () => {
  const { client } = executor({
    endpoints: {
      fetchCoscoShipmentContainers: async () => {
        throw new HttpError(404, "no containers");
      }
    }
  });
  const result = await client.fetchCoscoTracking(request, channels.NETWORK);
  assert.equal(result.snapshot.tracking.number, request.number);
  assert.deepEqual(result.raw.containerInfo, []);
  assert.equal(result.enrichment.containerDetailsComplete, false);
  assert.equal(result.enrichment.warning, null);
});

test("protection during enrichment retains safe retry diagnostics with a partial snapshot", async () => {
  const secretNode = "socks5://user:test-password@proxy.example:1080";
  const { client } = executor({
    endpoints: {
      optionalCoscoEndpoint: async () => {
        throw new HttpError(429, "deferred", {
          code: "COSCO_UPSTREAM_RATE_LIMITED",
          route: "PROXY",
          proxyNode: secretNode,
          proxyAttempts: 2,
          triedNodes: [secretNode, secretNode],
          retryAfterMs: 7000
        });
      },
      fetchCoscoShipmentContainers: () => assert.fail("stop enrichment after protection")
    }
  });
  const result = await client.fetchCoscoTracking(request, channels.PROXY);
  assert.equal(result.enrichment.partial, true);
  assert.equal(result.enrichment.warning.attempts, 2);
  assert.equal(result.enrichment.warning.retryAfterMs, 7000);
  assert.equal(result.enrichment.warning.triedNodes.length, 1);
  assert.doesNotMatch(JSON.stringify(result.enrichment.warning), /test-password|socks5:\/\//);
});

for (const status of [403, 429]) {
  test(`dedicated browser ${status} does not change either API circuit`, async () => {
    const { client, circuitBreakers } = executor({
      playwright: { proxy, proxyAlias: "browser-exit" },
      fetchBrowser: async () => {
        throw Object.assign(new Error("blocked"), { upstreamStatus: status, retryAfterMs: 9000 });
      }
    });
    await assert.rejects(client.fetchCoscoTracking(request, channels.PLAYWRIGHT), (error) => {
      assert.equal(error.status, status === 403 ? 503 : 429);
      assert.equal(error.details.route, "PLAYWRIGHT_PROXY");
      assert.equal(error.details.proxyNode, "browser-exit");
      assert.equal(error.details.playwrightAttempts, 1);
      assert.equal(error.details.retryAfterMs, status === 403 ? 900000 : 9000);
      return true;
    });
    assert.equal(circuitBreakers.DIRECT.remainingMs(), 0);
    assert.equal(circuitBreakers.PROXY.remainingMs(), 0);
  });
  test(`direct browser ${status} protects only the direct API exit`, async () => {
    const { client, circuitBreakers } = executor({
      fetchBrowser: async () => {
        throw Object.assign(new Error("blocked"), { upstreamStatus: status });
      }
    });
    await assert.rejects(client.fetchCoscoTracking(request, channels.PLAYWRIGHT), (error) => {
      assert.equal(error.details.route, "DIRECT");
      return true;
    });
    assert.ok(circuitBreakers.DIRECT.remainingMs() > 0);
    assert.equal(circuitBreakers.PROXY.remainingMs(), 0);
  });
}

test("browser receives the same signal, proxy override and dedicated-fallback flag", async () => {
  const signal = new AbortController().signal;
  const { client } = executor({
    playwright: { proxy, proxyAlias: "browser-exit" },
    fetchBrowser: async (input, options) => {
      assert.equal(input, request);
      assert.deepEqual(options, { signal, proxy: null, timeoutMs: 20000, dedicatedFallback: true });
      return { detail, bookingInfo: {}, containerInfo: containers };
    }
  });
  const result = await client.fetchCoscoTracking(request, channels.PLAYWRIGHT, {
    signal,
    playwrightProxy: null,
    dedicatedPlaywrightProxy: true
  });
  assert.equal(result.strategy.used, "PLAYWRIGHT");
  assert.equal(result.enrichment.partial, false);
});

test("caller cancellation takes precedence over browser upstream protection", async () => {
  const controller = new AbortController();
  const { client, circuitBreakers } = executor({
    fetchBrowser: async () => {
      controller.abort();
      throw Object.assign(new Error("blocked"), { upstreamStatus: 403 });
    }
  });
  await assert.rejects(
    client.fetchCoscoTracking(request, channels.PLAYWRIGHT, { signal: controller.signal }),
    (error) => error.details.code === "BATCH_CANCELLED"
  );
  assert.equal(circuitBreakers.DIRECT.remainingMs(), 0);
});

test("browser missing container details remains partial and keeps structured failure codes", async () => {
  const { client } = executor({
    fetchBrowser: async () => ({ detail, bookingInfo: {}, containerInfo: [] })
  });
  const result = await client.fetchCoscoTracking(request, channels.PLAYWRIGHT);
  assert.equal(result.enrichment.partial, true);
  assert.equal(result.enrichment.containerDetailsComplete, false);
  const failing = executor({
    fetchBrowser: async () => {
      throw Object.assign(new Error("browser timeout"), {
        code: "COSCO_BROWSER_TIMEOUT",
        httpStatus: 504
      });
    }
  });
  await assert.rejects(failing.client.fetchCoscoTracking(request, channels.PLAYWRIGHT), (error) => {
    assert.equal(error.status, 504);
    assert.equal(error.details.code, "COSCO_BROWSER_TIMEOUT");
    assert.equal(error.details.route, "PLAYWRIGHT");
    return true;
  });
});
