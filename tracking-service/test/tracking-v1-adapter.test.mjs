import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  adaptTrackingV1,
  normalizeTrackingPayload,
  readTrackingPreview,
  detailSections,
  carrierIdentity,
  CARRIER_LOGOS
} from "../public/tracking-v1-adapter.mjs";
import { syntheticByCarrier, expectedCarrierShapes } from "./fixtures/tracking-v1-carriers.mjs";
for (const spec of expectedCarrierShapes)
  test(`${spec.code} keeps its supplied capabilities and data gaps`, () => {
    const record = syntheticByCarrier.by_carrier[spec.code][0];
    const original = JSON.stringify(record);
    const { snapshot: s } = adaptTrackingV1(record);
    const sections = detailSections(s);
    assert.equal(s.provider.code, spec.code);
    assert.equal(s.containers.length, spec.containers);
    assert.equal(s.events.length, spec.events);
    assert.equal(s.routingLegs.length, spec.legs || 0);
    assert.equal(Boolean(s.summary.origin), Boolean(spec.origin));
    assert.equal(Boolean(s.summary.destination), Boolean(spec.destination));
    assert.equal(sections.noBusinessData, Boolean(spec.noData));
    assert.equal(sections.schedule, Boolean(spec.etd || spec.eta));
    assert.equal(sections.vessel, Boolean(spec.vessel));
    assert.equal(sections.events, spec.events > 0);
    assert.ok(
      s.containers.every((c) => c.milestones.length === 0),
      "shipment events must never be broadcast to every container"
    );
    assert.equal(s.route.length, 0, "summary endpoints are not fabricated milestones");
    assert.equal(s.keyTimes.actualDeparture, undefined);
    assert.equal(s.keyTimes.actualArrival, undefined);
    assert.equal(JSON.stringify(record), original);
    assert.equal(s.tracking.number, record.query.reference_submitted);
    assert.equal(s.sourceDetails.businessVerified, false);
    if (spec.warning) assert.equal(s.sourceDetails.warnings.length, 1);
  });
test("by_carrier preview is ephemeral and preserves exact references", () => {
  const records = readTrackingPreview(syntheticByCarrier);
  assert.equal(records.length, 12);
  for (const p of records) {
    assert.equal(p.localPreview, true);
    assert.equal(p.snapshot.localPreview, true);
    assert.equal(p.shipmentId, null);
    assert.equal(p.shipmentRecord, null);
    assert.equal(p.raw, null);
    assert.match(p.snapshot.tracking.number, /^0000/);
  }
  assert.equal(
    records.find((p) => p.snapshot.provider.code === "COSCO").snapshot.containers.length,
    0
  );
});
test("canonical snapshot queries remain unchanged; preview does not acquire persisted shipment metadata", () => {
  const original = {
    snapshot: {
      provider: { code: "MSC" },
      tracking: { number: "00001234" },
      summary: {},
      containers: []
    },
    shipmentId: "real-id",
    shipmentRecord: { id: "real-id" },
    databaseStored: true,
    raw: { secret: "private" }
  };
  assert.equal(normalizeTrackingPayload(original), original);
  const [preview] = readTrackingPreview(original);
  assert.equal(preview.shipmentId, null);
  assert.equal(preview.shipmentRecord, null);
  assert.equal(preview.databaseStored, false);
  assert.equal(original.snapshot.localPreview, undefined);
});
test("unknown provider is never COSCO and grouping conflicts are rejected", () => {
  const record = structuredClone(syntheticByCarrier.by_carrier.HMM[0]);
  record.carrier = { code: "NEW_CARRIER", name: "New carrier" };
  assert.equal(adaptTrackingV1(record).snapshot.provider.code, "NEW_CARRIER");
  assert.equal(carrierIdentity("").code, "UNKNOWN");
  assert.throws(() => adaptTrackingV1(record, { carrierCode: "COSCO" }), /conflicts/);
  assert.deepEqual(Object.keys(CARRIER_LOGOS).sort(), ["COSCO", "OOCL"]);
});
test("untyped source time remains text instead of claiming actual or estimated time", () => {
  const r = structuredClone(syntheticByCarrier.by_carrier.MATSON[0]);
  r.shipment.events[0].time = null;
  r.shipment.events[0].time_raw = "No reliable timestamp";
  const s = adaptTrackingV1(r).snapshot;
  assert.equal(s.events[0].occurredAt, null);
  assert.equal(s.events[0].reportedTime, "No reliable timestamp");
  assert.deepEqual(s.keyTimes, {});
});
test("preview rejects malformed, empty, oversized record sets and unsupported schemas", () => {
  assert.throws(() => readTrackingPreview({ by_carrier: { MSC: {} } }), /array/);
  assert.throws(() => readTrackingPreview({ by_carrier: {} }), /between/);
  assert.throws(() => readTrackingPreview({ schema: "tracking.v2" }), /Expected/);
  assert.throws(
    () =>
      readTrackingPreview(Array.from({ length: 501 }, () => syntheticByCarrier.by_carrier.MSC[0])),
    /between/
  );
});
test("preview cannot call APIs, read credentials or store local records", () => {
  const source = fs.readFileSync(
    new URL("../public/tracking-json-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /\b(?:fetch|localStorage|sessionStorage|indexedDB|XMLHttpRequest)\b/);
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /setRelatedFilesContext\(payload.localPreview \? null : payload\)/);
  assert.match(app, /if \(snapshot\?\.localPreview\) return fallback/);
  assert.match(app, /if \(snapshot\?\.localPreview\) return;/);
});

test("explicit source ETA and box-status time keep their original format without guessed date conversion", () => {
  const r = structuredClone(syntheticByCarrier.by_carrier.MSC[0]);
  r.shipment.fields.eta = "Dec 05, 2026";
  r.shipment.containers[0].status_time = "19/10/2026 12:00";
  const s = adaptTrackingV1(r).snapshot;
  assert.equal(s.keyTimes.estimatedArrival.time, "Dec 05, 2026");
  assert.equal(s.containers[0].latestEventTime, "19/10/2026 12:00");
  assert.equal(s.keyTimes.actualArrival, undefined);
});
