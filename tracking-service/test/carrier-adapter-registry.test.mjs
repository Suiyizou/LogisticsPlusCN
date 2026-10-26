import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createCarrierAdapterRegistry } from "../lib/carrier-adapter-registry.mjs";
import { createTrackingController } from "../http/tracking-controller.mjs";
import { createTrackingServer } from "../http/create-tracking-server.mjs";
import { createTrackingCache } from "../lib/tracking-cache.mjs";
import { createBatchTaskRegistry } from "../lib/batch-task-registry.mjs";
function adapter(overrides = {}) {
  return {
    code: "TEST",
    name: "Test Carrier",
    capabilities: { types: ["BOOKING"], channels: ["FIXTURE"], defaultChannel: "FIXTURE" },
    prepare: (input) => ({
      tracking: { type: input.type, number: input.number },
      channel: { code: "FIXTURE" }
    }),
    track: async () => ({ snapshot: { summary: { containers: [] }, containers: [] } }),
    ...overrides
  };
}
async function httpFixture(t, adapters) {
  const controller = createTrackingController({
    adapters,
    trackingCache: createTrackingCache({ ttlMs: 300000 }),
    batchTaskRegistry: createBatchTaskRegistry({ minIntervalMs: 0, maxIntervalMs: 0 })
  });
  const server = createTrackingServer({
    controller,
    cosco: { getHealth: () => ({ ok: true }) },
    staticRouter: {
      serveStatic: (_request, response) => {
        response.writeHead(404);
        response.end();
      }
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    post: async (body) => {
      const response = await fetch(url + "/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "BOOKING", number: "TEST1234", carrier: "TEST", ...body })
      });
      return { status: response.status, data: await response.json() };
    }
  };
}
test("third executable adapter is discovered, queried, cached and checked without HTTP dispatch changes", async (t) => {
  let calls = 0;
  const registry = createCarrierAdapterRegistry([
    adapter({
      track: async () => {
        calls++;
        return { snapshot: { summary: { containers: [] }, containers: [] } };
      },
      health: () => ({ carrier: "TEST", ok: true })
    })
  ]);
  const h = await httpFixture(t, registry);
  assert.equal((await h.post()).status, 200);
  assert.equal((await h.post()).data.cached, true);
  assert.equal(calls, 1);
  const listing = await (await fetch(h.url + "/api/carriers")).json();
  assert.equal(listing.carriers[0].code, "TEST");
  assert.deepEqual(listing.carriers[0].capabilities.channels, ["FIXTURE"]);
  assert.equal(JSON.stringify(listing).includes("prepare"), false);
  assert.deepEqual(await (await fetch(h.url + "/api/carriers/TEST/health")).json(), {
    carrier: "TEST",
    ok: true
  });
});
test("adapter preparation authorization runs before cached data and capabilities reject unsupported types", async (t) => {
  let authorized = true,
    calls = 0;
  const registry = createCarrierAdapterRegistry([
    adapter({
      prepare: (input) => {
        if (!authorized) throw Object.assign(Error("no permission"), { httpStatus: 403 });
        return {
          tracking: { type: input.type, number: input.number },
          channel: { code: "FIXTURE" }
        };
      },
      track: async () => {
        calls++;
        return { snapshot: { summary: { containers: [] }, containers: [] } };
      }
    })
  ]);
  const h = await httpFixture(t, registry);
  assert.equal((await h.post()).status, 200);
  authorized = false;
  assert.equal((await h.post()).status, 403);
  assert.equal(calls, 1);
  authorized = true;
  assert.equal((await h.post({ type: "CONTAINER" })).status, 400);
  assert.equal(calls, 1);
});
test("adapter cleanup is idempotent, attempts every resource, and reports failures", async () => {
  const closed = [];
  const registry = createCarrierAdapterRegistry([
    adapter({
      dispose: () => {
        closed.push("TEST");
        throw Error("close failed");
      }
    }),
    adapter({ code: "OTHER", dispose: () => closed.push("OTHER") })
  ]);
  const first = registry.dispose(),
    second = registry.dispose();
  assert.equal(first, second);
  await assert.rejects(first, AggregateError);
  assert.deepEqual(closed.sort(), ["OTHER", "TEST"]);
});
test("duplicate, invalid and disabled executable adapters fail clearly", () => {
  assert.throws(() => createCarrierAdapterRegistry([adapter(), adapter()]), /duplicate/);
  assert.throws(() => createCarrierAdapterRegistry([adapter({ track: null })]), /Invalid/);
  assert.throws(
    () =>
      createCarrierAdapterRegistry([
        adapter({
          capabilities: { types: ["BOOKING"], channels: ["NETWORK"], defaultChannel: "MISSING" }
        })
      ]),
    /Invalid/
  );
  assert.throws(
    () => createCarrierAdapterRegistry([adapter({ enabled: false })]).get("TEST"),
    (error) => error.status === 501
  );
});
