import assert from "node:assert/strict";
import test from "node:test";
import { createCoscoSupplementalWorkflow } from "../services/cosco-supplemental-workflow.mjs";
import { createCoscoFallbackRunner } from "../services/cosco-fallback-runner.mjs";
import { createCoscoUpstream } from "../lib/cosco-upstream.mjs";
import { createCoscoCircuitBreaker, createCoscoQueryGate } from "../lib/cosco-request-guard.mjs";
import { normalizeCoscoSupplementalDetails } from "../lib/cosco-normalize.mjs";
import {
  COSCO_QUERY_CHANNELS as channels,
  COSCO_AUTO_QUERY_STRATEGY as auto
} from "../lib/carrier-adapters.mjs";
import { HttpError } from "../lib/http-utils.mjs";

const request = { type: "BOOKING", number: "6502077380" };
const booking = { externalReferenceNumbers: ["PO-001"], clientPoNumber: "PO-001" };
const containers = [{ containerNumberWithCheckDigit: "TEMU6003424", containerType: "40HQ" }];
const notFound = () => new HttpError(404, "not found", { code: "COSCO_NOT_FOUND" });
function fixture({
  endpoints = {},
  fetchTracking,
  gate,
  proxyConfigured = false,
  proxyPool = null,
  browserEnabled = false
} = {}) {
  const calls = [];
  const cookieStates = new Map();
  const upstream = createCoscoUpstream({
    circuitBreakers: { DIRECT: createCoscoCircuitBreaker(), PROXY: createCoscoCircuitBreaker() },
    cookieStates,
    networkEnrichmentTimeoutMs: 4000,
    proxyNetworkEnrichmentTimeoutMs: 8000
  });
  const fallback = createCoscoFallbackRunner({
    upstream,
    proxyConfigured,
    proxyPool,
    cookieStates,
    playwright: {
      proxy: { server: "socks5://browser.example:1080" },
      proxyAlias: "browser-exit",
      autoFallbackEnabled: browserEnabled
    }
  });
  const workflow = createCoscoSupplementalWorkflow({
    endpoints: {
      fetchCoscoEndpoint: async (...args) => {
        calls.push(args);
        return booking;
      },
      fetchCoscoShipmentContainers: async (...args) => {
        calls.push(["containerInfo", ...args]);
        return containers;
      },
      ...endpoints
    },
    upstream,
    gate: gate ?? createCoscoQueryGate({ minIntervalMs: 0, maxIntervalMs: 0 }),
    runWithFallback: fallback.runCoscoWithAutomaticProxyFallback,
    fetchTracking: fetchTracking ?? (() => assert.fail("unexpected browser query"))
  });
  return { workflow, calls };
}

for (const sources of [undefined, [], ["unknown"]]) {
  test(`empty or unsupported source selection reads both sources (${JSON.stringify(sources)})`, async () => {
    const { workflow, calls } = fixture();
    const result = await workflow.fetchSupplementalDetails(request, channels.NETWORK, { sources });
    assert.deepEqual(
      calls.map(([source]) => source),
      ["bookingInfo", "containerInfo"]
    );
    assert.equal(result.tracking.number, request.number);
    assert.equal(result.references.business.clientPoNumber, "PO-001");
    assert.equal(result.containers[0].number, "TEMU6003424");
    assert.equal(result.partial, false);
    assert.deepEqual(result.warnings, []);
  });
}

for (const source of ["bookingInfo", "containerInfo"]) {
  test(`selected ${source} is trimmed and deduplicated without querying the other source`, async () => {
    const { workflow, calls } = fixture();
    const result = await workflow.fetchSupplementalDetails(request, channels.NETWORK, {
      sources: [` ${source} `, source, "unknown", null]
    });
    assert.deepEqual(
      calls.map(([name]) => name),
      [source]
    );
    assert.equal(calls[0][1], request);
    if (source === "bookingInfo") {
      assert.equal(calls[0][2].timeoutMs, 4000);
      assert.deepEqual(result.containers, []);
    } else {
      assert.equal(result.references.business.clientPoNumber, null);
      assert.equal(result.containers[0].number, "TEMU6003424");
    }
  });
}

test("successful network output retains normalized business references and channel metadata", async () => {
  const { workflow } = fixture();
  const result = await workflow.fetchSupplementalDetails(request, channels.PROXY);
  const expected = normalizeCoscoSupplementalDetails(
    booking,
    containers,
    request,
    result.fetchedAt
  );
  assert.deepEqual(result, {
    ...expected,
    partial: false,
    warnings: [],
    strategy: {
      requested: "PROXY",
      used: "PROXY",
      fallbackUsed: false,
      proxyNode: null,
      proxyAttempts: 1,
      triedNodes: []
    }
  });
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test("ordinary failure preserves successful source data and structured warning context", async () => {
  const { workflow } = fixture({
    endpoints: {
      fetchCoscoEndpoint: async () => {
        throw new HttpError(404, "booking unavailable", {
          code: "COSCO_NOT_FOUND",
          causeCode: "EMPTY",
          route: "NETWORK",
          proxyNode: "exit-A",
          proxyAttempts: 2,
          triedNodes: ["exit-A"],
          retryAfterMs: 9000
        });
      }
    }
  });
  const result = await workflow.fetchSupplementalDetails(request, channels.NETWORK);
  assert.equal(result.partial, true);
  assert.equal(result.containers[0].number, "TEMU6003424");
  assert.deepEqual(result.warnings, [
    {
      source: "bookingInfo",
      message: "booking unavailable",
      code: "COSCO_NOT_FOUND",
      causeCode: "EMPTY",
      route: "NETWORK",
      proxyNode: "exit-A",
      attempts: 2,
      triedNodes: ["exit-A"],
      retryAfterMs: 9000
    }
  ]);
});

test("ordinary container failure retains booking data and labels the missing container source", async () => {
  const { workflow } = fixture({
    endpoints: {
      fetchCoscoShipmentContainers: async () => {
        throw notFound();
      }
    }
  });
  const result = await workflow.fetchSupplementalDetails(request, channels.NETWORK);
  assert.equal(result.references.business.clientPoNumber, "PO-001");
  assert.deepEqual(result.containers, []);
  assert.equal(result.partial, true);
  assert.equal(result.warnings[0].source, "containerInfo");
  assert.equal(result.warnings[0].code, "COSCO_NOT_FOUND");
});

test("supplemental proxy protection enters node rotation before retrying the selected source", async () => {
  let attempts = 0;
  let rotations = 0;
  const { workflow } = fixture({
    proxyConfigured: true,
    proxyPool: {
      maxAttemptsPerShipment: 2,
      prepareAttempt: async () => ({ current: attempts === 0 ? "exit-A" : "exit-B" }),
      rotate: async () => {
        rotations++;
        return { rotated: true, previous: "exit-A", current: "exit-B" };
      }
    },
    endpoints: {
      fetchCoscoEndpoint: () => assert.fail("unrequested bookingInfo"),
      fetchCoscoShipmentContainers: async (input, options) => {
        assert.equal(input, request);
        assert.equal(options.proxyMode, true);
        attempts++;
        if (attempts === 1) throw new HttpError(503, "blocked", { code: "COSCO_UPSTREAM_BLOCKED" });
        return containers;
      }
    }
  });
  const result = await workflow.fetchSupplementalDetails(request, channels.PROXY, {
    sources: ["containerInfo"]
  });
  assert.equal(attempts, 2);
  assert.equal(rotations, 1);
  assert.equal(result.partial, false);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.strategy.proxyAttempts, 2);
  assert.deepEqual(result.strategy.triedNodes, ["exit-A", "exit-B"]);
});

test("all requested network sources failing produces an error with both source warnings", async () => {
  const { workflow } = fixture({
    endpoints: {
      fetchCoscoEndpoint: async () => {
        throw notFound();
      },
      fetchCoscoShipmentContainers: async () => {
        throw notFound();
      }
    }
  });
  await assert.rejects(workflow.fetchSupplementalDetails(request, channels.NETWORK), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.details.code, "COSCO_SUPPLEMENTAL_UNAVAILABLE");
    assert.equal(error.details.partial, false);
    assert.deepEqual(
      error.details.warnings.map(({ source }) => source),
      ["bookingInfo", "containerInfo"]
    );
    return true;
  });
});

test("failure of the only requested source cannot be hidden by an unrequested success", async () => {
  const { workflow, calls } = fixture({
    endpoints: {
      fetchCoscoEndpoint: async () => {
        throw notFound();
      }
    }
  });
  await assert.rejects(
    workflow.fetchSupplementalDetails(request, channels.NETWORK, { sources: ["bookingInfo"] }),
    (error) =>
      error.details.code === "COSCO_SUPPLEMENTAL_UNAVAILABLE" && error.details.warnings.length === 1
  );
  assert.equal(calls.length, 0);
});

for (const source of ["bookingInfo", "containerInfo"]) {
  test(`${source} protection and gateway failures escape partial warnings`, async () => {
    for (const [status, code] of [
      [503, "COSCO_UPSTREAM_BLOCKED"],
      [429, "COSCO_UPSTREAM_RATE_LIMITED"],
      [504, "COSCO_UPSTREAM_UNAVAILABLE"]
    ]) {
      const original = new HttpError(status, "protected", { code, retryAfterMs: 12000 });
      const { workflow } = fixture({
        endpoints: {
          fetchCoscoEndpoint: async () => {
            if (source === "bookingInfo") throw original;
            return booking;
          },
          fetchCoscoShipmentContainers: async () => {
            if (source === "containerInfo") throw original;
            return containers;
          }
        }
      });
      await assert.rejects(
        workflow.fetchSupplementalDetails(request, channels.NETWORK),
        (error) => error === original
      );
    }
  });
}

test("partial network results return without consuming private channels when fallback is not requested", async () => {
  let authorizations = 0;
  const { workflow } = fixture({
    proxyConfigured: true,
    browserEnabled: true,
    endpoints: {
      fetchCoscoEndpoint: async () => {
        throw notFound();
      }
    }
  });
  const result = await workflow.fetchSupplementalDetails(request, auto, {
    authorizeProxyFallback: () => {
      authorizations++;
    }
  });
  assert.equal(result.partial, true);
  assert.equal(result.strategy.used, "NETWORK");
  assert.equal(authorizations, 0);
});

test("opt-in partial retry authorizes before proxy and browser and reads only the failed source", async () => {
  const calls = [];
  const { workflow } = fixture({
    proxyConfigured: true,
    browserEnabled: true,
    endpoints: {
      fetchCoscoEndpoint: async (source, input, options) => {
        assert.equal(input, request);
        calls.push(options.proxyMode ? "proxy" : "direct");
        assert.equal(options.timeoutMs, options.proxyMode ? 8000 : 4000);
        throw notFound();
      },
      fetchCoscoShipmentContainers: () => assert.fail("unrequested containers")
    },
    fetchTracking: async (input, channel, options) => {
      calls.push("browser");
      assert.equal(channel, channels.PLAYWRIGHT);
      assert.equal(input, request);
      assert.equal(options.dedicatedPlaywrightProxy, true);
      return {
        snapshot: {
          fetchedAt: "2026-10-11T00:00:00.000Z",
          references: { external: ["PO-NEW"] },
          containers: [{ number: "UNREQUESTED" }]
        }
      };
    }
  });
  const result = await workflow.fetchSupplementalDetails(request, auto, {
    sources: ["bookingInfo"],
    allowPlaywrightFallback: true,
    authorizeProxyFallback: () => calls.push("authorize")
  });
  assert.deepEqual(calls, ["direct", "authorize", "proxy", "browser"]);
  assert.deepEqual(result.references.external, ["PO-NEW"]);
  assert.deepEqual(result.containers, []);
  assert.equal(result.fetchedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(result.strategy.used, "PLAYWRIGHT_PROXY");
  assert.equal(result.strategy.apiProxyAttempts, 1);
  assert.equal(result.partial, false);
});

test("partial retry denied authorization retains the source error without browser execution", async () => {
  const { workflow } = fixture({
    proxyConfigured: true,
    browserEnabled: true,
    endpoints: {
      fetchCoscoEndpoint: async () => {
        throw notFound();
      }
    }
  });
  await assert.rejects(
    workflow.fetchSupplementalDetails(request, auto, {
      allowPlaywrightFallback: true,
      authorizeProxyFallback: () => {
        throw new Error("denied");
      }
    }),
    (error) => {
      assert.equal(error.details.code, "COSCO_SUPPLEMENTAL_UNAVAILABLE");
      assert.equal(error.details.partial, true);
      assert.equal(error.details.warnings[0].source, "bookingInfo");
      return true;
    }
  );
});

test("proxy completion ends supplemental fallback and retains proxy options", async () => {
  const calls = [];
  const { workflow } = fixture({
    proxyConfigured: true,
    browserEnabled: true,
    endpoints: {
      fetchCoscoEndpoint: async (source, input, options) => {
        calls.push(options.proxyMode ? "proxy" : "direct");
        if (!options.proxyMode) throw new HttpError(503, "unavailable");
        assert.equal(options.timeoutMs, 8000);
        return booking;
      }
    }
  });
  const result = await workflow.fetchSupplementalDetails(request, auto, {
    sources: ["bookingInfo"]
  });
  assert.deepEqual(calls, ["direct", "proxy"]);
  assert.equal(result.strategy.requested, "AUTO");
  assert.equal(result.strategy.used, "PROXY");
  assert.equal(result.strategy.fallbackUsed, true);
  assert.equal(result.references.business.clientPoNumber, "PO-001");
});

for (const source of ["bookingInfo", "containerInfo"]) {
  test(`browser ${source} selection projects only the requested snapshot fields`, async () => {
    const references = {
      external: ["PO-001"],
      business: { clientPoNumber: "PO-001" },
      information: []
    };
    const { workflow, calls } = fixture({
      fetchTracking: async () => ({
        snapshot: { references, containers: [{ number: "TEMU6003424" }] },
        strategy: { used: "PLAYWRIGHT" }
      })
    });
    const result = await workflow.fetchSupplementalDetails(request, channels.PLAYWRIGHT, {
      sources: [source]
    });
    assert.equal(calls.length, 0);
    assert.equal(result.partial, false);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(
      result.containers,
      source === "containerInfo" ? [{ number: "TEMU6003424" }] : []
    );
    assert.deepEqual(
      result.references,
      source === "bookingInfo" ? references : { external: [], business: {}, information: [] }
    );
    assert.deepEqual(result.strategy, { used: "PLAYWRIGHT" });
  });
}

test("browser can return partial selected data with an actionable missing-source warning", async () => {
  const { workflow } = fixture({
    fetchTracking: async () => ({ snapshot: { containers: [{ number: "TEMU6003424" }] } })
  });
  const result = await workflow.fetchSupplementalDetails(request, channels.PLAYWRIGHT);
  assert.equal(result.partial, true);
  assert.equal(result.warnings[0].source, "bookingInfo");
  assert.equal(result.warnings[0].code, "COSCO_SUPPLEMENTAL_EMPTY");
  assert.equal(result.containers.length, 1);
});

test("browser missing or malformed collections cannot become complete selected data", async () => {
  for (const snapshot of [
    undefined,
    { containers: {}, references: { external: {}, information: "invalid" } }
  ]) {
    const { workflow } = fixture({ fetchTracking: async () => ({ snapshot }) });
    await assert.rejects(
      workflow.fetchSupplementalDetails(request, channels.PLAYWRIGHT),
      (error) => {
        assert.equal(error.details.code, "COSCO_SUPPLEMENTAL_UNAVAILABLE");
        assert.deepEqual(
          error.details.warnings.map(({ source }) => source),
          ["bookingInfo", "containerInfo"]
        );
        return true;
      }
    );
  }
});

for (const references of [
  { external: ["PO-001"] },
  { information: [{ name: "PO", value: "001" }] },
  { business: { clientPoNumber: "PO-001" } }
]) {
  test(`browser recognizes available references through ${Object.keys(references)[0]}`, async () => {
    const { workflow } = fixture({ fetchTracking: async () => ({ snapshot: { references } }) });
    const result = await workflow.fetchSupplementalDetails(request, channels.PLAYWRIGHT, {
      sources: ["bookingInfo"]
    });
    assert.equal(result.partial, false);
    assert.deepEqual(result.warnings, []);
  });
}

test("supplemental work stays behind the same shared query gate", async () => {
  const gate = createCoscoQueryGate({ minIntervalMs: 0, maxIntervalMs: 0 });
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocker = gate.run(
    () =>
      new Promise((resolve) => {
        release = resolve;
        entered();
      })
  );
  await started;
  const { workflow, calls } = fixture({ gate });
  const pending = workflow.fetchSupplementalDetails(request, channels.NETWORK, {
    sources: ["bookingInfo"]
  });
  assert.equal(gate.stats().queued, 1);
  assert.equal(calls.length, 0);
  release();
  await blocker;
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(gate.stats().queued, 0);
});

test("concurrent requests keep source selection and tracking identity independent", async () => {
  const { workflow, calls } = fixture();
  const other = { type: "BOL", number: "6502077399" };
  const [first, second] = await Promise.all([
    workflow.fetchSupplementalDetails(request, channels.NETWORK, { sources: ["bookingInfo"] }),
    workflow.fetchSupplementalDetails(other, channels.NETWORK, { sources: ["containerInfo"] })
  ]);
  assert.deepEqual(
    calls.map(([source, input]) => [source, input.number]),
    [
      ["bookingInfo", request.number],
      ["containerInfo", other.number]
    ]
  );
  assert.equal(first.tracking.number, request.number);
  assert.deepEqual(first.containers, []);
  assert.equal(second.tracking.number, other.number);
  assert.equal(second.references.business.clientPoNumber, null);
  assert.equal(second.containers.length, 1);
});
