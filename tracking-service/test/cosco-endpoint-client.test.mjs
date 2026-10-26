import assert from "node:assert/strict";
import test from "node:test";
import { createCoscoEndpointClient } from "../services/cosco-endpoint-client.mjs";
import { createCoscoUpstream } from "../lib/cosco-upstream.mjs";
import { createCoscoCircuitBreaker, createCoscoQueryGate } from "../lib/cosco-request-guard.mjs";
import { normalizeTrackingRequest } from "../lib/carrier-adapters.mjs";
import { COSCO_XOR_KEY } from "../lib/cosco-payload.mjs";

const booking = normalizeTrackingRequest({ type: "BOOKING", number: "6502077380" });
const container = normalizeTrackingRequest({ type: "CONTAINER", number: "TEMU6003424" });
const result = [{ containerNumberWithCheckDigit: container.number }];
const ok = (value = result) =>
  new Response(JSON.stringify({ code: "200", success: true, result: value }));

function setup(fetchDirect, proxyFetch = fetchDirect) {
  const breakers = {
    DIRECT: createCoscoCircuitBreaker({ cooldownMs: 1_000 }),
    PROXY: createCoscoCircuitBreaker({ cooldownMs: 1_000 })
  };
  const cookieStates = new Map();
  const upstream = createCoscoUpstream({
    fetchDirect,
    circuitBreakers: breakers,
    proxyClient: { fetch: proxyFetch },
    cookieStates,
    networkCoreTimeoutMs: 1_000,
    proxyNetworkCoreTimeoutMs: 2_000,
    networkEnrichmentTimeoutMs: 500,
    proxyNetworkEnrichmentTimeoutMs: 1_000
  });
  const gate = createCoscoQueryGate({ minIntervalMs: 0, maxIntervalMs: 0 });
  return { client: createCoscoEndpointClient({ upstream, gate }), breakers, cookieStates, gate };
}

test("endpoint transport preserves POST payload, encoded referer, route and cookie headers", async () => {
  const calls = [];
  const { client } = setup(async (url, init) => {
    calls.push({ url, init });
    return ok({ found: true });
  });
  const request = { type: "BOOKING", number: "A/B +1", businessNumberType: "booking" };
  assert.deepEqual(await client.fetchCoscoEndpoint("detail", request), { found: true });
  assert.match(calls[0].url, /scct_customer\/public\/cargoTracking\/detail$/);
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].init.headers.Referer, /number=A%2FB%20%2B1$/);
  assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    businessNumber: request.number,
    businessNumberType: request.businessNumberType,
    notFilterResult: false
  });
  await client.fetchCoscoEndpoint("containers", request, {
    baseUrl: "https://example.test/session",
    referer: "https://example.test/page",
    cookie: "sid=abc"
  });
  assert.equal(calls[1].url, "https://example.test/session/containers");
  assert.equal(calls[1].init.headers.Referer, "https://example.test/page");
  assert.equal(calls[1].init.headers.Cookie, "sid=abc");
  assert.equal(calls[1].init.signal.aborted, false);
});

test("encoded success bodies use the production XOR decoder", async () => {
  const plain = Buffer.from(JSON.stringify({ code: "200", success: true, result }), "utf8");
  const key = Buffer.from(COSCO_XOR_KEY);
  const encoded = Buffer.from(
    plain.map((value, index) => value ^ key[index % key.length])
  ).toString("base64");
  const { client } = setup(async () => new Response(JSON.stringify(encoded)));
  assert.deepEqual(await client.fetchCoscoEndpoint("detail", booking), result);
});

for (const [status, expectedStatus, code] of [
  [403, 503, "COSCO_UPSTREAM_BLOCKED"],
  [429, 429, "COSCO_UPSTREAM_RATE_LIMITED"],
  [503, 503, "COSCO_UPSTREAM_UNAVAILABLE"],
  [401, 502, "COSCO_COOKIE_EXPIRED"],
  [404, 502, undefined]
]) {
  test(`HTTP ${status} preserves adapter status and route-specific protection`, async () => {
    let directCalls = 0;
    const { client, breakers } = setup(
      async () => {
        directCalls++;
        return ok();
      },
      async () => new Response("upstream failure", { status, headers: { "retry-after": "2" } })
    );
    await assert.rejects(
      client.fetchCoscoEndpoint("detail", booking, { proxyMode: true }),
      (error) => {
        assert.equal(error.status, expectedStatus);
        assert.equal(error.details?.code, code);
        if (status === 429 || status === 503) assert.ok(error.details.retryAfterMs >= 1_000);
        return true;
      }
    );
    assert.equal(directCalls, 0);
    assert.equal(breakers.DIRECT.status().blocked, false);
    assert.equal(breakers.PROXY.status().blocked, [403, 429, 503].includes(status));
  });
}

for (const [code, status, diagnostic] of [
  ["403", 503, "COSCO_UPSTREAM_BLOCKED"],
  ["429", 429, "COSCO_UPSTREAM_RATE_LIMITED"],
  ["503", 503, "COSCO_UPSTREAM_UNAVAILABLE"],
  ["401", 502, "COSCO_COOKIE_EXPIRED"],
  ["404", 404, undefined]
]) {
  test(`business code ${code} is classified before generic adapter failure`, async () => {
    const { client, breakers } = setup(
      async () => new Response(JSON.stringify({ code, success: false, retryAfterMs: 2_000 }))
    );
    await assert.rejects(client.fetchCoscoEndpoint("detail", booking), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.details?.code, diagnostic);
      if (code === "404") assert.equal(error.details.upstreamCode, "404");
      return true;
    });
    assert.equal(breakers.DIRECT.status().blocked, ["403", "429", "503"].includes(code));
    assert.equal(breakers.PROXY.status().blocked, false);
  });
}

test("malformed and incomplete payloads fail instead of producing a snapshot", async () => {
  for (const payload of [
    "broken encoded data",
    JSON.stringify({ code: "200", success: false, result }),
    JSON.stringify({ code: "200", success: true, result: null })
  ]) {
    const { client } = setup(async () => new Response(payload));
    await assert.rejects(
      client.fetchCoscoEndpoint("detail", booking),
      (error) => error.status === 502
    );
  }
});

test("timeout and caller cancellation retain distinct errors and abort the actual transport", async () => {
  let entered;
  let transportSignal;
  const { client } = setup(async (_url, { signal }) => {
    transportSignal = signal;
    entered?.();
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
        once: true
      })
    );
  });
  await assert.rejects(
    client.fetchCoscoEndpoint("detail", booking, { timeoutMs: 10 }),
    (error) => error.status === 504
  );
  assert.equal(transportSignal.aborted, true);
  const controller = new AbortController();
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const pending = client.fetchCoscoEndpoint("detail", booking, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error.status === 409 && error.details.code === "BATCH_CANCELLED"
  );
  assert.equal(transportSignal.aborted, true);
});

test("cancelled queued work never sends an endpoint request", async () => {
  let release;
  let started;
  let calls = 0;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const { client, gate } = setup(async () => {
    calls++;
    started();
    return new Promise((resolve) => {
      release = () => resolve(ok());
    });
  });
  const first = client.fetchCoscoEndpoint("detail", booking);
  await entered;
  const controller = new AbortController();
  const queued = client.fetchCoscoEndpoint("detail", booking, { signal: controller.signal });
  assert.equal(gate.stats().queued, 1);
  controller.abort();
  await assert.rejects(queued, (error) => error.code === "BATCH_CANCELLED");
  release();
  await first;
  assert.equal(calls, 1);
  assert.equal(gate.stats().queued, 0);
});

test("container sessions merge page/header cookies, reuse the cache and reinitialize after expiry", async (t) => {
  let clock = 1_000;
  t.mock.method(Date, "now", () => clock);
  let pages = 0;
  const cookies = [];
  const { client } = setup(async (url, init) => {
    if (url.includes("/ct/base?")) {
      pages++;
      return new Response(
        '<script>document.cookie = "proof=page; Path=/";document.cookie = "sid=header; Path=/";</script>',
        { headers: { "set-cookie": "sid=header; HttpOnly; Path=/" } }
      );
    }
    assert.match(url, /scct_customer_ex\/public\/cargoTracking\/containers$/);
    cookies.push(init.headers.Cookie);
    return ok();
  });
  assert.deepEqual(await client.fetchCoscoContainers(container), result);
  await client.fetchCoscoContainers(container);
  assert.equal(pages, 1);
  assert.deepEqual(cookies, ["sid=header; proof=page", "sid=header; proof=page"]);
  clock += 5 * 60_000 + 1;
  await client.fetchCoscoContainers(container);
  assert.equal(pages, 2);
});

test("concurrent container lookups initialize one public session and retain one shared gate", async () => {
  let releasePage;
  let pageStarted;
  const entered = new Promise((resolve) => {
    pageStarted = resolve;
  });
  let pages = 0;
  let containers = 0;
  const { client } = setup(async (url) => {
    if (url.includes("/ct/base?")) {
      pages++;
      pageStarted();
      return new Promise((resolve) => {
        releasePage = () => resolve(new Response("page"));
      });
    }
    containers++;
    return ok();
  });
  const first = client.fetchCoscoContainers(container);
  await entered;
  const second = client.fetchCoscoContainers(container);
  assert.equal(pages, 1);
  releasePage();
  await Promise.all([first, second]);
  assert.equal(pages, 1);
  assert.equal(containers, 2);
});

test("direct and proxy sessions remain separate and proxy rotation invalidates its cached session", async () => {
  const pages = { direct: 0, proxy: 0 };
  const cookies = [];
  const fetchRoute = (route) => async (url, init) => {
    if (url.includes("/ct/base?")) {
      pages[route]++;
      return new Response("page", { headers: { "set-cookie": `sid=${route}; Path=/` } });
    }
    cookies.push([route, init.headers.Cookie]);
    return ok();
  };
  const { client, cookieStates } = setup(fetchRoute("direct"), fetchRoute("proxy"));
  await client.fetchCoscoContainers(container);
  await client.fetchCoscoContainers(container, { proxyMode: true });
  await client.fetchCoscoContainers(container, { proxyMode: true });
  cookieStates.delete("PROXY");
  await client.fetchCoscoContainers(container, { proxyMode: true });
  await client.fetchCoscoContainers(container);
  assert.deepEqual(pages, { direct: 1, proxy: 2 });
  assert.deepEqual(cookies, [
    ["direct", "sid=direct"],
    ["proxy", "sid=proxy"],
    ["proxy", "sid=proxy"],
    ["proxy", "sid=proxy"],
    ["direct", "sid=direct"]
  ]);
});

test("an expired container session refreshes once; persistent expiry does not loop", async () => {
  for (const persistent of [false, true]) {
    let pages = 0;
    let queries = 0;
    const { client } = setup(async (url) => {
      if (url.includes("/ct/base?")) {
        pages++;
        return new Response("page");
      }
      queries++;
      return persistent || queries === 1 ? new Response("expired", { status: 401 }) : ok();
    });
    if (persistent)
      await assert.rejects(
        client.fetchCoscoContainers(container),
        (error) => error.details.code === "COSCO_COOKIE_EXPIRED"
      );
    else assert.deepEqual(await client.fetchCoscoContainers(container), result);
    assert.equal(pages, 2);
    assert.equal(queries, 2);
  }
});

test("public-page protection escapes without retrying or calling the container endpoint", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    const { client } = setup(async () => {
      calls++;
      return new Response("blocked", { status });
    });
    await assert.rejects(client.fetchCoscoContainers(container), (error) =>
      ["COSCO_UPSTREAM_BLOCKED", "COSCO_UPSTREAM_RATE_LIMITED"].includes(error.details.code)
    );
    assert.equal(calls, 1);
  }
});

test("optional reads return their fallback only for non-protection errors", async () => {
  const fallback = { empty: true };
  const unavailable = setup(async () => new Response("not found", { status: 404 }));
  assert.equal(
    await unavailable.client.optionalCoscoEndpoint("bookingInfo", booking, fallback),
    fallback
  );
  const blocked = setup(async () => new Response("blocked", { status: 403 }));
  await assert.rejects(
    blocked.client.optionalCoscoEndpoint("bookingInfo", booking, fallback),
    (error) => error.details.code === "COSCO_UPSTREAM_BLOCKED"
  );
  const malformed = setup(async () => ok({ invalid: "container list" }));
  assert.deepEqual(await malformed.client.fetchCoscoShipmentContainers(booking), []);
});
