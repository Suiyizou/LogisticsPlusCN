import test from "node:test";
import assert from "node:assert/strict";
import { createCarrierAgentClient } from "../lib/carrier-agent-client.mjs";
import { createMultiCarrierTracker, fetchCarrierDcsa, readCarrierApiConfig } from "../lib/multi-carrier-tracking.mjs";
import { normalizeMultiCarrierSnapshot } from "../lib/multi-carrier-snapshot.mjs";
import { MULTI_CARRIER_CATALOG, sameCarrierReference } from "../lib/multi-carrier-catalog.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const query = { type: "BILLOFLADING", number: "MAEU123456789", label: "提单号" };
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
function found(carrier = "MAERSK", request = query) {
  return {
    status: "FOUND", runId: id, carrier: { code: carrier },
    query: { reference: request.number, referenceType: request.type === "BILLOFLADING" ? "BILL_OF_LADING" : request.type },
    fetchedAt: "2026-10-28T08:00:00Z",
    shipment: { billOfLading: request.number, bookingNumber: null, status: "In transit", eta: "2026-11-04T12:00:00+08:00", origin: "Shanghai", destination: "Los Angeles" },
    containers: [{ number: "MSKU1234567", events: [
      { name: "Departed", actual: true, occurredAt: "2026-10-24T12:00:00+08:00", location: "Shanghai" },
      { name: "Empty returned", actual: false, occurredAt: "2026-11-05T12:00:00+08:00", location: "Los Angeles" }
    ] }],
    evidence: [{ field: "shipment.billOfLading", value: request.number, sourceUrl: MULTI_CARRIER_CATALOG[carrier].trackingUrl, method: "DOM" }]
  };
}

for (const carrier of Object.keys(MULTI_CARRIER_CATALOG)) {
  test(`${carrier} produces a unified snapshot without inventing actual future events`, () => {
    const snapshot = normalizeMultiCarrierSnapshot(found(carrier), carrier, query);
    assert.equal(snapshot.provider.code, carrier);
    assert.equal(snapshot.tracking.type, "BILLOFLADING");
    assert.equal(snapshot.summary.latestEvent.name, "Departed");
    assert.equal(snapshot.containers[0].latestEventTime, "2026-10-24T12:00:00+08:00");
    assert.equal(snapshot.containers[0].milestones[1].occurredAt, null);
    assert.equal(snapshot.keyTimes.actualArrival, null);
    assert.equal(snapshot.route[0].countryCode, null);
    assert.equal(snapshot.references.masterBill, query.number);
  });
}

test("prefix normalization never strips equipment ownership from a container query", () => {
  assert.equal(sameCarrierReference("MAEU123456789", "123456789", "MAERSK", "BILLOFLADING"), true);
  assert.equal(sameCarrierReference("MAEU1234567", "1234567", "MAERSK", "CONTAINER"), false);
});

test("mismatched carrier, reference, demo, missing identity and foreign evidence cannot be saved", () => {
  const mutations = [
    (value) => { value.carrier.code = "MSC"; },
    (value) => { value.query.reference = "OTHER1234"; },
    (value) => { value.shipment.billOfLading = "OTHER1234"; },
    (value) => { value.note = "demo data"; },
    (value) => { value.evidence = []; },
    (value) => { value.evidence[0].sourceUrl = "https://maersk.com.attacker.example/"; },
    (value) => { value.evidence[0].sourceUrl = "https://user:secret@www.maersk.com/"; }
  ];
  for (const mutate of mutations) {
    const value = found(); mutate(value);
    assert.throws(() => normalizeMultiCarrierSnapshot(value, "MAERSK", query), (error) => error.httpStatus === 502);
  }
});

test("human verification and authoritative not-found results are different outcomes", () => {
  for (const [status, httpStatus, code] of [["HUMAN_REQUIRED", 409, "TRACKING_HUMAN_REQUIRED"], ["NOT_FOUND", 404, "UPSTREAM_EMPTY"]]) {
    const value = { ...found(), status };
    assert.throws(() => normalizeMultiCarrierSnapshot(value, "MAERSK", query), (error) => error.httpStatus === httpStatus && error.code === code);
  }
});

test("browser client polls one run, submits only tracking data and never sends credentials or demo flags", async () => {
  const calls = [];
  const client = createCarrierAgentClient({ sleep: async () => {}, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return response({ id, state: "QUEUED" }, 202);
    return response({ id, state: "COMPLETED", result: found() });
  } });
  assert.equal((await client.track("MAERSK", query)).status, "FOUND");
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].options.body), { carrier: "MAERSK", reference: query.number, referenceType: "BILL_OF_LADING", headed: false });
});

test("failed Agent runs are cancelled and model errors are not exposed", async () => {
  const methods = [];
  const client = createCarrierAgentClient({ fetchImpl: async (_url, options) => {
    methods.push(options.method);
    return response({ id, state: "FAILED", error: "Authorization: Bearer PRIVATE" });
  } });
  await assert.rejects(() => client.track("MAERSK", query), (error) => error.code === "TRACKING_AGENT_FAILED" && !error.message.includes("PRIVATE"));
  assert.deepEqual(methods, ["POST", "DELETE"]);
});

test("an aborted request cancels queued browser work", async () => {
  const abort = new AbortController();
  const methods = [];
  const client = createCarrierAgentClient({
    fetchImpl: async (_url, options) => { methods.push(options.method); return response({ id, state: "QUEUED" }); },
    sleep: async () => { abort.abort(); }
  });
  await assert.rejects(() => client.track("MAERSK", query, { signal: abort.signal }), (error) => error.code === "BATCH_CANCELLED");
  assert.deepEqual(methods, ["POST", "DELETE"]);
});

test("Agent creation refuses invalid task IDs without constructing arbitrary poll URLs", async () => {
  let calls = 0;
  const client = createCarrierAgentClient({ fetchImpl: async () => { calls++; return response({ id: "../../private", state: "QUEUED" }); } });
  await assert.rejects(() => client.track("MAERSK", query), (error) => error.code === "TRACKING_AGENT_INVALID_RESULT");
  assert.equal(calls, 1);
});

test("observed carrier verification is retained even if the model cannot submit a valid result", async () => {
  const client = createCarrierAgentClient({ fetchImpl: async () => response({
    id, state: "FAILED", events: [{ toolName: "browser_snapshot", outcome: "SUCCESS",
      toolOutput: { success: true, blockingReason: "SECURITY_CHECK" } }]
  }) });
  await assert.rejects(() => client.track("HAPAG_LLOYD", query), (error) => error.code === "TRACKING_HUMAN_REQUIRED" && error.httpStatus === 409);
});

test("a rejected page is never treated as authoritative shipment not-found", async () => {
  const client = createCarrierAgentClient({ fetchImpl: async () => response({
    id, state: "COMPLETED", result: { status: "ERROR" }, events: [{ toolName: "browser_snapshot", outcome: "SUCCESS",
      toolOutput: { success: true, blockingReason: "REQUEST_REJECTED" } }]
  }) });
  await assert.rejects(() => client.track("OOCL", query), (error) => error.code === "TRACKING_PAGE_UNAVAILABLE" && error.httpStatus === 503);
});

test("API credentials require an official HTTPS host and header-based keys", () => {
  assert.equal(readCarrierApiConfig("MAERSK", {}), null);
  for (const url of ["http://api.maersk.com/events", "https://attacker.example/events", "https://api.maersk.com/events?token=secret"]) {
    assert.throws(() => readCarrierApiConfig("MAERSK", { MAERSK_TRACKING_API_URL: url, MAERSK_TRACKING_API_KEY: "secret" }));
  }
});

function event(number = "MSKU1234567") {
  return { eventType: "EQUIPMENT", eventClassifierCode: "ACT", eventDateTime: "2026-10-24T12:00:00Z", equipmentReference: number, equipmentEventTypeCode: "LOAD", transportDocumentReference: query.number };
}
const config = { endpoint: "https://api.maersk.com/events", key: "private-key", header: "Consumer-Key" };

test("DCSA pagination retains every container and sends the correct reference filter", async () => {
  const urls = [];
  const snapshot = await fetchCarrierDcsa("MAERSK", query, config, { fetchImpl: async (url, options) => {
    urls.push(new URL(url));
    assert.equal(options.headers["Consumer-Key"], "private-key");
    return urls.length === 1 ? response([event()], 200, { "Next-Page-Cursor": "next" }) : response([event("MSKU7654321")]);
  } });
  assert.equal(urls[0].searchParams.get("transportDocumentReference"), query.number);
  assert.equal(urls[1].searchParams.get("cursor"), "next");
  assert.equal(snapshot.containers.length, 2);
  assert.equal(JSON.stringify(snapshot).includes("private-key"), false);
});

test("API mismatches and incomplete pagination never replace a valid snapshot", async () => {
  await assert.rejects(() => fetchCarrierDcsa("MAERSK", query, config, { fetchImpl: async () => response([{ ...event(), transportDocumentReference: "OTHER1234" }]) }), (error) => error.code === "TRACKING_IDENTITY_MISMATCH");
  await assert.rejects(() => fetchCarrierDcsa("MAERSK", query, config, { fetchImpl: async () => response([event()], 200, { "Next-Page-Cursor": "same" }) }), (error) => error.code === "TRACKING_API_PAGINATION");
});

test("AUTO uses the browser when no API subscription is configured", async () => {
  let calls = 0;
  const track = createMultiCarrierTracker({ env: {}, agent: { track: async () => { calls++; return found(); } } });
  assert.equal((await track("MAERSK", query)).strategy.used, "AGENT");
  assert.equal(calls, 1);
  await assert.rejects(() => track("MAERSK", query, "NETWORK"), (error) => error.code === "TRACKING_API_NOT_CONFIGURED");
});

test("AUTO falls back on API transport failure, but never on not-found or rate limits", async () => {
  let browserCalls = 0;
  let status = 503;
  const track = createMultiCarrierTracker({
    env: { MAERSK_TRACKING_API_URL: config.endpoint, MAERSK_TRACKING_API_KEY: config.key },
    fetchImpl: async () => response({}, status),
    agent: { track: async () => { browserCalls++; return found(); } }
  });
  assert.equal((await track("MAERSK", query)).strategy.fallbackUsed, true);
  for (status of [404, 429]) await assert.rejects(() => track("MAERSK", query), (error) => error.httpStatus === status);
  assert.equal(browserCalls, 1);
});
