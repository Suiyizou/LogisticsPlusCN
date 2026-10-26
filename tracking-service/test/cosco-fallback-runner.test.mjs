import assert from "node:assert/strict";
import test from "node:test";
import { createCoscoFallbackRunner } from "../services/cosco-fallback-runner.mjs";
import { createCoscoUpstream } from "../lib/cosco-upstream.mjs";
import { createCoscoCircuitBreaker } from "../lib/cosco-request-guard.mjs";
import { COSCO_QUERY_CHANNELS, COSCO_AUTO_QUERY_STRATEGY } from "../lib/carrier-adapters.mjs";
import { HttpError, batchCancelledHttpError } from "../lib/http-utils.mjs";

const channels = { ...COSCO_QUERY_CHANNELS, AUTO: COSCO_AUTO_QUERY_STRATEGY };
const proxy = { server: "socks5://browser.example:1080" };
const failure = (code = "COSCO_UPSTREAM_UNAVAILABLE", extras = {}) =>
  new HttpError(503, "upstream unavailable", { code, ...extras });
function runner({ proxyPool = null, proxyConfigured = true, playwright = {} } = {}) {
  const circuitBreakers = {
    DIRECT: createCoscoCircuitBreaker(),
    PROXY: createCoscoCircuitBreaker()
  };
  const cookieStates = new Map();
  const upstream = createCoscoUpstream({ circuitBreakers, cookieStates });
  const client = createCoscoFallbackRunner({
    upstream,
    proxyPool,
    proxyConfigured,
    cookieStates,
    playwright: { proxy, proxyAlias: "browser-exit", autoFallbackEnabled: true, ...playwright }
  });
  return { run: client.runCoscoWithAutomaticProxyFallback, circuitBreakers, cookieStates };
}

test("successful AUTO leaves private channels and authorization unused", async () => {
  const { run } = runner();
  const result = { snapshot: { tracking: { number: "6502077380" } } };
  const output = await run(
    channels.AUTO,
    { authorizeProxyFallback: () => assert.fail("unnecessary authorization") },
    async (channel) => {
      assert.equal(channel, channels.AUTO);
      return result;
    }
  );
  assert.equal(output, result);
});

test("denied authorization preserves the original upstream error and never enters private channels", async () => {
  const { run } = runner();
  const original = failure();
  const calls = [];
  await assert.rejects(
    run(
      channels.AUTO,
      {
        allowPlaywrightFallback: true,
        authorizeProxyFallback: () => {
          calls.push("authorize");
          throw new HttpError(403, "private access denied");
        }
      },
      async (channel) => {
        calls.push(channel.code);
        throw original;
      }
    ),
    (error) => error === original
  );
  assert.deepEqual(calls, ["AUTO", "authorize"]);
});

for (const [channel, error] of [
  [channels.NETWORK, failure()],
  [channels.AUTO, new HttpError(400, "invalid tracking input")]
]) {
  test(`${channel.code} ${error.status} failure does not fall back`, async () => {
    const { run } = runner();
    const calls = [];
    await assert.rejects(
      run(
        channel,
        {
          allowPlaywrightFallback: true,
          authorizeProxyFallback: () => assert.fail("authorization must not run")
        },
        async (active) => {
          calls.push(active.code);
          throw error;
        }
      ),
      (thrown) => thrown === error
    );
    assert.deepEqual(calls, [channel.code]);
  });
}

test("AUTO authorizes once before API proxy success and decorates the final strategy", async () => {
  const { run } = runner();
  const calls = [];
  const signal = new AbortController().signal;
  const output = await run(
    channels.AUTO,
    {
      signal,
      allowPlaywrightFallback: true,
      authorizeProxyFallback: () => calls.push("authorize")
    },
    async (channel, options) => {
      calls.push(channel.code);
      assert.equal(options.signal, signal);
      if (channel.code === "AUTO") throw failure();
      assert.equal(options.proxyMode, true);
      return { snapshot: { value: 1 } };
    }
  );
  assert.deepEqual(calls, ["AUTO", "authorize", "PROXY"]);
  assert.equal(output.proxyFallback, true);
  assert.equal(output.strategy.requested, "AUTO");
  assert.equal(output.strategy.used, "PROXY");
  assert.equal(output.strategy.fallbackUsed, true);
  assert.equal(output.strategy.proxyAttempts, 1);
});

test("AUTO exhausts API proxy before exactly one dedicated browser attempt", async () => {
  const { run } = runner();
  const calls = [];
  const output = await run(
    channels.AUTO,
    { allowPlaywrightFallback: true },
    async (channel, options) => {
      calls.push(channel.code);
      if (channel.code !== "PLAYWRIGHT") throw failure();
      assert.equal(options.dedicatedPlaywrightProxy, true);
      assert.equal(options.playwrightProxy, proxy);
      return { snapshot: { value: 1 }, strategy: { used: "PLAYWRIGHT_PROXY" } };
    }
  );
  assert.deepEqual(calls, ["AUTO", "PROXY", "PLAYWRIGHT"]);
  assert.equal(output.playwrightFallback, true);
  assert.equal(output.strategy.used, "PLAYWRIGHT_PROXY");
  assert.equal(output.strategy.apiProxyAttempts, 1);
  assert.equal(output.strategy.playwrightAttempts, 1);
});

test("missing API proxy can fall back to the independently configured browser", async () => {
  const { run } = runner({ proxyConfigured: false });
  const calls = [];
  const result = await run(channels.AUTO, { allowPlaywrightFallback: true }, async (channel) => {
    calls.push(channel.code);
    if (channel.code === "AUTO") throw failure();
    return { snapshot: {} };
  });
  assert.deepEqual(calls, ["AUTO", "PLAYWRIGHT"]);
  assert.equal(result.strategy.apiProxyAttempts, 0);
});

for (const options of [
  { allowPlaywrightFallback: false },
  { allowPlaywrightFallback: true, independent: false }
]) {
  test(`browser fallback requires caller opt-in and independent exit (${JSON.stringify(options)})`, async () => {
    const { run } = runner({ playwright: { autoFallbackEnabled: options.independent !== false } });
    const proxyError = failure();
    const calls = [];
    await assert.rejects(
      run(channels.AUTO, options, async (channel) => {
        calls.push(channel.code);
        throw channel.code === "AUTO" ? failure() : proxyError;
      }),
      (error) => error === proxyError
    );
    assert.deepEqual(calls, ["AUTO", "PROXY"]);
  });
}

test("rotation retries on the new exit and invalidates the same proxy circuit and Cookie state", async () => {
  let index = 0;
  let rotations = 0;
  const proxyPool = {
    maxAttemptsPerShipment: 3,
    prepareAttempt: async () => ({ current: ["exit-A", "exit-B"][index] }),
    rotate: async () => {
      rotations++;
      index++;
      return { rotated: true, previous: "exit-A", current: "exit-B" };
    }
  };
  const { run, circuitBreakers, cookieStates } = runner({ proxyPool });
  cookieStates.set("DIRECT", { cache: "direct" });
  cookieStates.set("PROXY", { cache: "old-exit" });
  let attempts = 0;
  const result = await run(channels.PROXY, {}, async (channel, options) => {
    assert.equal(channel, channels.PROXY);
    assert.equal(options.proxyMode, true);
    attempts++;
    if (attempts === 1) {
      circuitBreakers.PROXY.trip();
      throw failure();
    }
    assert.equal(cookieStates.has("PROXY"), false);
    assert.equal(circuitBreakers.PROXY.remainingMs(), 0);
    return { snapshot: {} };
  });
  assert.equal(rotations, 1);
  assert.equal(attempts, 2);
  assert.equal(cookieStates.get("DIRECT").cache, "direct");
  assert.deepEqual(result.strategy.triedNodes, ["exit-A", "exit-B"]);
  assert.equal(result.strategy.proxyNode, "exit-B");
  assert.equal(result.strategy.proxyAttempts, 2);
});

test("request-budget rotation clears stale state before executing the first attempt", async () => {
  const { run, cookieStates, circuitBreakers } = runner({
    proxyPool: {
      maxAttemptsPerShipment: 1,
      prepareAttempt: async () => ({
        rotated: true,
        previous: "exit-A",
        current: "exit-B",
        budgetDeferred: true
      }),
      rotate: () => assert.fail("success does not need failure rotation")
    }
  });
  cookieStates.set("PROXY", { cache: "stale" });
  circuitBreakers.PROXY.trip();
  const result = await run(channels.PROXY, {}, async () => {
    assert.equal(cookieStates.has("PROXY"), false);
    assert.equal(circuitBreakers.PROXY.remainingMs(), 0);
    return { snapshot: {} };
  });
  assert.equal(result.strategy.proxyBudgetDeferred, true);
});

test("proxy exhaustion respects the attempt cap and exposes safe ordered exit diagnostics", async () => {
  let attempts = 0;
  let rotations = 0;
  const secret = "socks5://user:test-password@exit.example:1080";
  const { run } = runner({
    proxyPool: {
      maxAttemptsPerShipment: 2,
      prepareAttempt: async () => ({ current: attempts === 0 ? secret : "exit-B" }),
      rotate: async () => {
        rotations++;
        return { rotated: true, current: "exit-B" };
      }
    }
  });
  await assert.rejects(
    run(channels.PROXY, {}, async () => {
      attempts++;
      throw failure();
    }),
    (error) => {
      assert.equal(error.details.code, "COSCO_PROXY_POOL_EXHAUSTED");
      assert.equal(error.details.causeCode, "COSCO_UPSTREAM_UNAVAILABLE");
      assert.equal(error.details.proxyAttempts, 2);
      assert.equal(error.details.triedNodes.length, 2);
      assert.equal(error.details.proxyNode, "exit-B");
      assert.doesNotMatch(JSON.stringify(error.details), /test-password|socks5:\/\//);
      return true;
    }
  );
  assert.equal(attempts, 2);
  assert.equal(rotations, 1);
});

test("non-retryable proxy errors and failed rotations stop the proxy attempt chain", async () => {
  for (const invalidInput of [true, false]) {
    let attempts = 0;
    let rotations = 0;
    const error = invalidInput ? new HttpError(400, "invalid input") : failure();
    const { run } = runner({
      proxyPool: {
        maxAttemptsPerShipment: 3,
        prepareAttempt: async () => ({ current: "exit-A" }),
        rotate: async () => {
          rotations++;
          throw new Error("controller unavailable");
        }
      }
    });
    await assert.rejects(
      run(channels.PROXY, {}, async () => {
        attempts++;
        throw error;
      })
    );
    assert.equal(attempts, 1);
    assert.equal(rotations, invalidInput ? 0 : 1);
  }
});

test("cancellation after either API stage stops the next fallback stage", async () => {
  for (const abortAt of ["AUTO", "PROXY"]) {
    const controller = new AbortController();
    const { run } = runner();
    const calls = [];
    await assert.rejects(
      run(
        channels.AUTO,
        { signal: controller.signal, allowPlaywrightFallback: true },
        async (channel) => {
          calls.push(channel.code);
          if (channel.code === abortAt) controller.abort();
          throw failure();
        }
      )
    );
    assert.deepEqual(calls, abortAt === "AUTO" ? ["AUTO"] : ["AUTO", "PROXY"]);
  }
});

test("browser cancellation is preserved instead of becoming aggregate channel failure", async () => {
  const { run } = runner();
  const cancelled = batchCancelledHttpError();
  await assert.rejects(
    run(channels.AUTO, { allowPlaywrightFallback: true }, async (channel) => {
      throw channel.code === "PLAYWRIGHT" ? cancelled : failure();
    }),
    (error) => error === cancelled
  );
});

test("all-channel failure retains source warnings, final cause and maximum retry delay", async () => {
  const { run } = runner();
  const warning = {
    source: "bookingInfo",
    code: "COSCO_SUPPLEMENTAL_EMPTY",
    message: "missing",
    proxyNode: "socks5://user:test-password@exit.example:1080"
  };
  await assert.rejects(
    run(channels.AUTO, { allowPlaywrightFallback: true }, async (channel) => {
      if (channel.code === "PLAYWRIGHT")
        throw new HttpError(504, "browser failed", {
          code: "COSCO_BROWSER_TIMEOUT",
          retryAfterMs: 9000,
          warnings: [warning]
        });
      throw failure("COSCO_SUPPLEMENTAL_UNAVAILABLE", { warnings: [warning], retryAfterMs: 12000 });
    }),
    (error) => {
      assert.equal(error.status, 504);
      assert.equal(error.details.code, "COSCO_CHANNELS_UNAVAILABLE");
      assert.equal(error.details.causeCode, "COSCO_BROWSER_TIMEOUT");
      assert.equal(error.details.proxyAttempts, 1);
      assert.equal(error.details.playwrightAttempts, 1);
      assert.equal(error.details.retryAfterMs, 12000);
      assert.equal(error.details.warnings.length, 1);
      assert.doesNotMatch(JSON.stringify(error.details.warnings), /test-password|socks5:\/\//);
      return true;
    }
  );
});
