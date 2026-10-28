import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createDefaultCarrierAdapters } from "../services/default-carrier-adapters.mjs";
import { createTrackingController } from "../http/tracking-controller.mjs";
import { createTrackingServer } from "../http/create-tracking-server.mjs";
import { createTrackingCache } from "../lib/tracking-cache.mjs";
import { createBatchTaskRegistry } from "../lib/batch-task-registry.mjs";
import { normalizeTrackingRequest } from "../lib/carrier-adapters.mjs";
import { SUPPORTED_CARRIER_CODES, trackingFailure } from "../lib/multi-carrier-catalog.mjs";
import { TRACKING_CARRIERS, supportsShipmentReference } from "../../frontend/src/services/trackingCarriers.js";

test("UI, Java and tracking registry agree on all six carrier identities", async () => {
  const java = await readFile(new URL("../../backend/src/main/java/com/cargoplanner/backend/shipment/TrackingCarriers.java", import.meta.url), "utf8");
  assert.deepEqual(TRACKING_CARRIERS.map((item) => item.code).sort(), [...SUPPORTED_CARRIER_CODES].sort());
  for (const code of SUPPORTED_CARRIER_CODES) assert.ok(java.includes(`"${code}"`));
  assert.equal(supportsShipmentReference("MAERSK", "BILLOFLADING"), true);
  assert.equal(supportsShipmentReference("COSCO", "BILLOFLADING"), false);
  assert.equal(supportsShipmentReference("UNKNOWN", "BOOKING"), false);
});

test("new carrier bills retain type and prefix while legacy COSCO stays compatible", () => {
  const request = normalizeTrackingRequest({ carrier: "MAERSK", type: "BILLOFLADING", number: "MAEU123456789" });
  assert.equal(request.type, "BILLOFLADING");
  assert.equal(request.number, "MAEU123456789");
  assert.equal(normalizeTrackingRequest({ carrier: "COSCO", type: "BILLOFLADING", number: "COSU6502077380" }).number, "6502077380");
});

async function fixture(t, trackMulti, adapterKey = "fixture-only-key") {
  const cosco = { getHealth: () => ({ status: "ok" }) };
  const adapters = createDefaultCarrierAdapters({ cosco, adapterKey, trackMulti, closeCma: () => {} });
  const controller = createTrackingController({
    cosco, adapters, trackingCache: createTrackingCache({ ttlMs: 300000 }),
    batchTaskRegistry: createBatchTaskRegistry({ minIntervalMs: 0, maxIntervalMs: 0 })
  });
  const server = createTrackingServer({ cosco, controller, staticRouter: {
    serveStatic: (_req, res) => { res.writeHead(404); res.end(); }
  } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  return {
    list: async () => (await fetch(root + "/api/carriers")).json(),
    async post(carrier, authorized = true, channel = "AUTO") {
      const response = await fetch(root + "/api/track", {
        method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { "X-Tracking-Adapter-Key": "fixture-only-key" } : {}) },
        body: JSON.stringify({ carrier, channel, type: "BILLOFLADING", number: "TEST12345" })
      });
      return { status: response.status, data: await response.json() };
    }
  };
}

test("all new adapters authorize before work or cache access and preserve the bill identity", async (t) => {
  const calls = [];
  const h = await fixture(t, async (carrier, request, channel) => {
    calls.push([carrier, request.type, channel]);
    return { snapshot: { provider: { code: carrier }, tracking: request, summary: { containers: [] }, containers: [] } };
  });
  assert.equal((await h.list()).carriers.length, 6);
  for (const code of ["MAERSK", "HAPAG_LLOYD", "MSC", "OOCL"]) {
    assert.equal((await h.post(code, false)).status, 403);
    const first = await h.post(code);
    assert.equal(first.status, 200);
    assert.equal(first.data.snapshot.tracking.type, "BILLOFLADING");
    assert.equal((await h.post(code)).data.cached, true);
    assert.equal((await h.post(code, false)).status, 403);
  }
  assert.equal(calls.length, 4);
  assert.equal((await h.post("MSC", true, "PROXY")).status, 400);
});

test("missing internal authorization fails closed before starting an Agent", async (t) => {
  const h = await fixture(t, () => assert.fail("must not run"), "");
  const result = await h.post("OOCL");
  assert.equal(result.status, 503);
  assert.equal(result.data.error.details.code, "TRACKING_ACCESS_NOT_CONFIGURED");
});

test("human verification details survive the HTTP boundary", async (t) => {
  const h = await fixture(t, () => { throw trackingFailure(409, "TRACKING_HUMAN_REQUIRED", "Verify on carrier website", { carrier: "MSC", pageState: "SECURITY_CHECK" }); });
  const result = await h.post("MSC");
  assert.equal(result.status, 409);
  assert.equal(result.data.error.details.code, "TRACKING_HUMAN_REQUIRED");
  assert.equal(result.data.error.details.pageState, "SECURITY_CHECK");
});
