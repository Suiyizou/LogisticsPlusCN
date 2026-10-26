import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createTrackingController } from "../http/tracking-controller.mjs";
import { createTrackingServer } from "../http/create-tracking-server.mjs";
import { createTrackingCache } from "../lib/tracking-cache.mjs";
import { createBatchTaskRegistry } from "../lib/batch-task-registry.mjs";
import { HttpError } from "../lib/http-utils.mjs";

const input = { type: "BOOKING", number: "6502077380", carrier: "COSCO", channel: "NETWORK" };
const snapshot = { snapshot: { tracking: input, summary: { containers: [] }, containers: [] } };

async function fixture(t, options = {}) {
  const calls = [];
  const batchTaskRegistry = createBatchTaskRegistry({ minIntervalMs: 0, maxIntervalMs: 0 });
  let closed = 0;
  const cosco = {
    hasPlaywrightProxy: false,
    runTracking: async (...args) => {
      calls.push(args);
      return snapshot;
    },
    fetchShipmentContainers: async () => [],
    fetchSupplementalDetails: async () => ({ partial: false }),
    getHealth: () => ({ ok: true, channel: "NETWORK" }),
    getChannelCHealthStatus: () => ({ status: "unknown" }),
    runCoscoChannelChecks: async (probe) => ({ probe }),
    ...options.cosco
  };
  const controller = createTrackingController({
    cosco,
    batchTaskRegistry,
    trackingCache: createTrackingCache({ ttlMs: 300000 }),
    adapterKey: "internal-key",
    ...options.controller
  });
  const server = createTrackingServer({
    cosco,
    controller,
    staticRouter: {
      serveStatic(request, response) {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end(request.method === "HEAD" ? undefined : "static-page");
      },
      serveFlag(_request, response, ratio, country) {
        response.end(`${ratio}:${country}`);
      }
    },
    onClose: () => {
      closed++;
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = async (path = "/api/track", body = input, headers = {}) => {
    const response = await fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  return { server, url, calls, post, batchTaskRegistry, closed: () => closed };
}

test("all existing tracking aliases preserve forced carrier and channel", async (t) => {
  const cma = [];
  const h = await fixture(t, {
    controller: {
      fetchCma: async (...args) => {
        cma.push(args);
        return snapshot;
      }
    }
  });
  for (const [path, channel] of [
    ["/api/track", "NETWORK"],
    ["/api/track/cosco", "NETWORK"],
    ["/api/track/cosco/network", "NETWORK"],
    ["/api/track/cosco/playwright", "PLAYWRIGHT"]
  ]) {
    const result = await h.post(path, { ...input, forceRefresh: true });
    assert.equal(result.status, 200);
    assert.equal(h.calls.at(-1)[1].code, channel);
  }
  assert.equal((await h.post("/api/track/cma", { ...input, forceRefresh: true })).status, 200);
  assert.equal(cma.length, 1);
  assert.equal(h.calls.length, 4);
});

test("proxy authorization runs before cached responses and before fallback execution", async (t) => {
  const h = await fixture(t);
  const body = { ...input, channel: "PROXY" };
  assert.equal(
    (await h.post("/api/track", body, { "x-tracking-adapter-key": "internal-key" })).status,
    200
  );
  const cached = await h.post("/api/track", body, { "x-tracking-adapter-key": "internal-key" });
  assert.equal(cached.data.cached, true);
  const forbidden = await h.post("/api/track", body);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.data.error.details.code, "COSCO_PROXY_FORBIDDEN");
  assert.equal(h.calls.length, 1);
  const fallback = await fixture(t, {
    cosco: {
      runTracking: async (_request, _channel, options) => {
        options.authorizeProxyFallback();
        return snapshot;
      }
    }
  });
  assert.equal((await fallback.post("/api/track", { ...input, channel: "AUTO" })).status, 403);
});

test("COSCO AUTO cache separates proxy-authorized results from anonymous and invalid keys", async (t) => {
  let calls = 0;
  const h = await fixture(t, {
    cosco: {
      runTracking: async (_request, _channel, options) => {
        calls++;
        try {
          options.authorizeProxyFallback();
          return { ...snapshot, route: "private-proxy" };
        } catch {
          return { ...snapshot, route: "public-direct" };
        }
      }
    }
  });
  const body = { ...input, channel: "AUTO" };
  const authorized = { "x-tracking-adapter-key": "internal-key" };
  const first = await h.post("/api/track", body, authorized);
  assert.equal(first.data.route, "private-proxy");
  const anonymous = await h.post("/api/track", body);
  assert.equal(anonymous.data.route, "public-direct");
  assert.equal(anonymous.data.cached, false);
  const invalid = await h.post("/api/track", body, {
    "x-tracking-adapter-key": "wrong-key"
  });
  assert.equal(invalid.data.route, "public-direct");
  assert.equal(invalid.data.cached, true);
  const cachedPrivate = await h.post("/api/track", body, authorized);
  assert.equal(cachedPrivate.data.route, "private-proxy");
  assert.equal(cachedPrivate.data.cached, true);
  assert.equal(calls, 2);
  assert.equal(
    JSON.stringify([first.data, anonymous.data, invalid.data]).includes("internal-key"),
    false
  );
});

test("COSCO AUTO in-flight proxy work is never joined by anonymous or invalid keys", async (t) => {
  let release;
  let started;
  let calls = 0;
  const privateStarted = new Promise((resolve) => {
    started = resolve;
  });
  const privateWork = new Promise((resolve) => {
    release = resolve;
  });
  const h = await fixture(t, {
    cosco: {
      runTracking: async (_request, _channel, options) => {
        calls++;
        try {
          options.authorizeProxyFallback();
        } catch {
          return { ...snapshot, route: "public-direct" };
        }
        started();
        await privateWork;
        return { ...snapshot, route: "private-proxy" };
      }
    }
  });
  const body = { ...input, channel: "AUTO" };
  const privateResponse = h.post("/api/track", body, {
    "x-tracking-adapter-key": "internal-key"
  });
  await privateStarted;
  try {
    const publicResponses = await Promise.all([
      h.post("/api/track", body),
      h.post("/api/track", body, { "x-tracking-adapter-key": "wrong-key" })
    ]);
    assert.deepEqual(
      publicResponses.map((result) => result.data.route),
      ["public-direct", "public-direct"]
    );
    assert.equal(calls, 2);
  } finally {
    release();
    const result = await privateResponse;
    assert.equal(result.data.route, "private-proxy");
  }
});

test("missing internal key and configured browser proxies retain authorization guards", async (t) => {
  const missing = await fixture(t, { controller: { adapterKey: "" } });
  const unavailable = await missing.post("/api/track", { ...input, channel: "PROXY" });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.data.error.details.code, "COSCO_PROXY_ACCESS_NOT_CONFIGURED");
  const browser = await fixture(t, { cosco: { hasPlaywrightProxy: true } });
  assert.equal((await browser.post("/api/track/cosco/playwright")).status, 403);
  assert.equal(
    (
      await browser.post("/api/track/cosco/playwright", input, {
        "x-tracking-adapter-key": "internal-key"
      })
    ).status,
    200
  );
});

test("supplemental browser queries share the private proxy authorization policy", async (t) => {
  let calls = 0;
  const h = await fixture(t, {
    cosco: {
      hasPlaywrightProxy: true,
      fetchSupplementalDetails: async () => {
        calls++;
        return { partial: false };
      }
    }
  });
  const path = "/api/track/cosco/supplemental-details";
  const body = { ...input, channel: "PLAYWRIGHT" };
  for (const headers of [{}, { "x-tracking-adapter-key": "wrong-key" }]) {
    const result = await h.post(path, body, headers);
    assert.equal(result.status, 403);
    assert.equal(result.data.error.details.code, "COSCO_PROXY_FORBIDDEN");
  }
  assert.equal(calls, 0);
  assert.equal(
    (await h.post(path, body, { "x-tracking-adapter-key": "internal-key" })).status,
    200
  );
  assert.equal(calls, 1);
  const missing = await fixture(t, {
    cosco: { hasPlaywrightProxy: true },
    controller: { adapterKey: "" }
  });
  assert.equal((await missing.post(path, body)).status, 503);
  const direct = await fixture(t);
  assert.equal((await direct.post(path, body)).status, 200);
});

test("CMA receives matching cookie and browser identity without leaking them in output", async (t) => {
  let credentials;
  const h = await fixture(t, {
    controller: {
      fetchCma: async (_input, auth) => {
        credentials = auth;
        return snapshot;
      }
    }
  });
  const result = await h.post("/api/track/cma", input, {
    "x-cma-session-cookie": "session=value",
    "x-cma-browser-user-agent": "matching-browser"
  });
  assert.deepEqual(credentials, { sessionCookie: "session=value", userAgent: "matching-browser" });
  assert.equal(JSON.stringify(result.data).includes("session=value"), false);
  assert.equal(h.calls.length, 0);
});

test("ordinary concurrent requests share work; force refresh always starts new work", async (t) => {
  let release;
  let started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const h = await fixture(t, {
    cosco: {
      runTracking: async () => {
        calls++;
        started();
        return pending;
      }
    }
  });
  const first = h.post();
  await start;
  const second = h.post();
  const third = h.post("/api/track", { ...input, forceRefresh: true });
  // Wait for both HTTP requests to reach the controller, without relying on a fixed delay.
  while (calls < 2) await new Promise((resolve) => setImmediate(resolve));
  release(snapshot);
  assert.deepEqual(
    (await Promise.all([first, second, third])).map((r) => r.status),
    [200, 200, 200]
  );
  assert.equal(calls, 2);
  assert.equal((await h.post()).data.cached, true);
  assert.equal((await h.post("/api/track", { ...input, forceRefresh: true })).data.cached, false);
  assert.equal(calls, 3);
});

test("failed shared work is removed so the next request can recover", async (t) => {
  let calls = 0;
  const h = await fixture(t, {
    cosco: {
      runTracking: async () => {
        if (++calls === 1) throw new HttpError(502, "upstream failed");
        return snapshot;
      }
    }
  });
  assert.equal((await h.post()).status, 502);
  assert.equal((await h.post()).status, 200);
  assert.equal(calls, 2);
});

test("batch cancellation aborts the adapter and closes the request lease", async (t) => {
  let started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  let signal;
  const h = await fixture(t, {
    cosco: {
      runTracking: (_request, _channel, options) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          started();
        })
    }
  });
  const taskId = "batch_http_1234567890";
  const pending = h.post("/api/track", { ...input, batchTaskId: taskId });
  await start;
  const cancelled = await h.post(`/api/batch-tasks/${taskId}/cancel`, {});
  assert.equal(cancelled.status, 202);
  assert.equal(cancelled.data.activeRequestCancelled, true);
  assert.equal(signal.aborted, true);
  const response = await pending;
  assert.equal(response.status, 409);
  assert.equal(response.data.error.details.code, "BATCH_CANCELLED");
  assert.equal(h.batchTaskRegistry.status(taskId).active, false);
});

test("container and supplemental routes validate references and forward only requested work", async (t) => {
  let options;
  const h = await fixture(t, {
    cosco: {
      fetchSupplementalDetails: async (_request, _channel, value) => {
        options = value;
        return { partial: false };
      }
    }
  });
  assert.equal((await h.post("/api/track/cosco/container-list")).data.total, 0);
  const invalid = { ...input, type: "CONTAINER", number: "TEMU6003424" };
  assert.equal((await h.post("/api/track/cosco/container-list", invalid)).status, 400);
  assert.equal((await h.post("/api/track/cosco/supplemental-details", invalid)).status, 400);
  const result = await h.post("/api/track/cosco/supplemental-details", {
    ...input,
    sources: ["bookingInfo"],
    allowPlaywrightFallback: true
  });
  assert.equal(result.status, 200);
  assert.deepEqual(options.sources, ["bookingInfo"]);
  assert.equal(options.allowPlaywrightFallback, true);
  assert.throws(options.authorizeProxyFallback, (error) => error.status === 403);
});

test("HTTP error conversion retains upstream cooldown diagnostics and Retry-After", async (t) => {
  const h = await fixture(t, {
    cosco: {
      runTracking: async () => {
        throw Object.assign(new Error("rate limited"), {
          httpStatus: 429,
          code: "COSCO_UPSTREAM_RATE_LIMITED",
          retryAfterMs: 45001
        });
      }
    }
  });
  const result = await h.post();
  assert.equal(result.status, 429);
  assert.equal(result.headers.get("Retry-After"), "46");
  assert.deepEqual(result.data.error.details, {
    code: "COSCO_UPSTREAM_RATE_LIMITED",
    retryAfterMs: 45001
  });
});

test("health, probes, static HEAD, flags, and close lifecycle work without live adapters", async (t) => {
  const h = await fixture(t);
  assert.deepEqual(await (await fetch(h.url + "/api/health")).json(), {
    ok: true,
    channel: "NETWORK"
  });
  assert.deepEqual((await h.post("/api/channels/check", { number: "6502406170" })).data, {
    probe: { number: "6502406170" }
  });
  assert.equal(await (await fetch(h.url + "/api/flags/4x3/cn")).text(), "4x3:cn");
  assert.equal(await (await fetch(h.url + "/", { method: "HEAD" })).text(), "");
  assert.equal((await h.post("/unknown", {})).status, 405);
  const malformed = await fetch(h.url + "/api/track", { method: "POST", body: "{" });
  assert.equal(malformed.status, 400);
  await new Promise((resolve) => h.server.close(resolve));
  assert.equal(h.closed(), 1);
});

test("CMA cached responses never cross cookie or browser identities", async (t) => {
  let calls = 0;
  const h = await fixture(t, {
    controller: {
      fetchCma: async () => {
        calls++;
        return snapshot;
      }
    }
  });
  const firstIdentity = {
    "x-cma-session-cookie": "fixture-session=A",
    "x-cma-browser-user-agent": "browser-A"
  };
  assert.equal((await h.post("/api/track/cma", input, firstIdentity)).data.cached, false);
  assert.equal((await h.post("/api/track/cma", input, firstIdentity)).data.cached, true);
  assert.equal(calls, 1);
  const otherCookie = await h.post("/api/track/cma", input, {
    ...firstIdentity,
    "x-cma-session-cookie": "fixture-session=B"
  });
  assert.equal(otherCookie.data.cached, false);
  assert.equal(
    (
      await h.post("/api/track/cma", input, {
        ...firstIdentity,
        "x-cma-browser-user-agent": "browser-B"
      })
    ).data.cached,
    false
  );
  assert.equal(calls, 3);
  assert.equal(JSON.stringify(otherCookie.data).includes("fixture-session"), false);
});
