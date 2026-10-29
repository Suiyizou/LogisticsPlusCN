import vm from "node:vm";
import {
  trackingSourceSummary,
  renderReportedTrackingDetails
} from "../public/tracking-json-preview.mjs";
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

test("page text entries remain source entries and never claim event completion", () => {
  const record = structuredClone(syntheticByCarrier.by_carrier.OOCL[0]);
  record.shipment.events = [
    { sequence: 1, time: "2026-01-02", time_raw: "Source time", description: "PDT / CY: CST" },
    { sequence: 2, description: "Original ETA / Current ETA" }
  ];
  const snapshot = adaptTrackingV1(record).snapshot;
  assert.deepEqual(
    snapshot.events.map((entry) => entry.name),
    ["PDT / CY: CST", "Original ETA / Current ETA"]
  );
  assert.ok(
    snapshot.events.every(
      (entry) => entry.semanticKind === "SOURCE_ENTRY" && entry.occurredAt === null
    )
  );
  assert.equal(snapshot.events[0].reportedTime, "Source time");
  assert.deepEqual(snapshot.route, []);
});

test("summary separates declared containers from returned details and exposes unverified page text", () => {
  const record = structuredClone(syntheticByCarrier.by_carrier.COSCO[0]);
  record.shipment.container_count.declared = 7;
  record.query.strategy = "PAGE_TEXT";
  const snapshot = adaptTrackingV1(record).snapshot;
  assert.equal(snapshot.containers.length, 0);
  const summary = trackingSourceSummary(snapshot, "zh");
  assert.match(summary, /声明箱数: 7/);
  assert.match(summary, /返回箱明细: 0/);
  assert.match(summary, /尚未验证/);
  assert.match(summary, /PAGE_TEXT/);
  const source = fs.readFileSync(
    new URL("../public/tracking-json-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /源数据条目/);
  assert.match(source, /源条目数/);
  assert.doesNotMatch(source, /票级运输事件|eventTitle: "Shipment events"/);
});

test("structured source fields and all carrier extensions keep their source paths without box assignment", () => {
  const r = structuredClone(syntheticByCarrier.by_carrier.SML[0]);
  r.shipment.fields.seal_numbers = ["SYNTHETIC-SEAL"];
  r.shipment.fields_extra = {
    board_date: "Source date without inferred timezone",
    transshipment: { port: "SOURCE PORT", details: ["SOURCE DETAIL"] },
    load_port_detail: "SOURCE LOAD DETAIL",
    discharge_port_detail: "SOURCE DISCHARGE DETAIL"
  };
  const s = adaptTrackingV1(r).snapshot;
  const seal = s.sourceDetails.fields.find((f) => f.key === "seal_numbers");
  assert.equal(seal.source, "shipment.fields");
  assert.deepEqual(JSON.parse(seal.rawText), ["SYNTHETIC-SEAL"]);
  assert.equal(seal.truncated, false);
  for (const key of Object.keys(r.shipment.fields_extra)) {
    const f = s.sourceDetails.fields.find((f) => f.key === key);
    assert.equal(f.source, "shipment.fields_extra");
    assert.equal(f.truncated, false);
  }
  assert.ok(s.containers.every((c) => c.seal === ""));
  assert.deepEqual(s.keyTimes, {});
  assert.deepEqual(s.route, []);
});

test("source JSON display is depth and size bounded with explicit truncation notices", () => {
  const r = structuredClone(syntheticByCarrier.by_carrier.YML[0]);
  let deep = { leaf: "SOURCE VALUE" };
  for (let i = 0; i < 20; i++) deep = { nested: deep };
  r.shipment.fields_extra = {
    deep,
    large: Array.from({ length: 300 }, () => "x".repeat(10000)),
    ordinary: { flag: false, count: 0, items: ["<img src=x onerror=alert(1)>"] }
  };
  const fields = adaptTrackingV1(r).snapshot.sourceDetails.fields;
  for (const key of ["deep", "large"]) {
    const f = fields.find((f) => f.key === key);
    assert.equal(f.truncated, true);
    assert.ok(f.rawText.length < 65600);
    assert.match(f.rawText, /source display limit/);
  }
  const ordinary = fields.find((f) => f.key === "ordinary");
  assert.deepEqual(JSON.parse(ordinary.rawText), r.shipment.fields_extra.ordinary);
  const renderer = fs.readFileSync(
    new URL("../public/tracking-json-preview.mjs", import.meta.url),
    "utf8"
  );
  assert.match(renderer, /node\(doc, "pre", field.rawText\)/);
  assert.doesNotMatch(renderer, /innerHTML/);
});

test("Java mapper sourceDetails fields and extraFields render typed source values without object coercion", () => {
  // Mirrors TrackingV1SnapshotMapper: fields[].value is JsonNode, extraFields is an object.
  const javaPayload = {
    shipmentId: "SYNTHETIC-ID",
    snapshot: {
      provider: { code: "SML" },
      tracking: { type: "BILLOFLADING", number: "SYNTHETIC123456" },
      summary: { containerCount: { declared: 2, extracted: 0 } },
      containers: [],
      sourceDetails: {
        schema: "tracking.v1",
        strategy: "BROWSER",
        confidence: "PAGE_TEXT",
        businessVerified: false,
        queryStatus: "QUERY_COMPLETED",
        warnings: [],
        fields: [
          { key: "seal_numbers", value: ["SYNTHETIC-SEAL"] },
          { key: "weight", value: { unit: "KG", value: 1200 } }
        ],
        extraFields: {
          board_date: "SOURCE DATE WITHOUT CONVERSION",
          transshipment: { port: "SOURCE PORT" },
          load_port_detail: "SOURCE LOAD DETAIL",
          discharge_port_detail: "SOURCE DISCHARGE DETAIL"
        },
        additionalEvents: []
      }
    }
  };
  const original = JSON.stringify(javaPayload);
  const normalized = normalizeTrackingPayload(javaPayload);
  const fields = normalized.snapshot.sourceDetails.fields;
  assert.deepEqual(JSON.parse(fields.find((f) => f.key === "seal_numbers").rawText), [
    "SYNTHETIC-SEAL"
  ]);
  assert.deepEqual(JSON.parse(fields.find((f) => f.key === "weight").rawText), {
    unit: "KG",
    value: 1200
  });
  for (const key of Object.keys(javaPayload.snapshot.sourceDetails.extraFields))
    assert.equal(fields.find((f) => f.key === key).source, "shipment.fields_extra");
  assert.equal(JSON.stringify(javaPayload), original);
  assert.deepEqual(normalized.snapshot.containers, []);
  assert.equal(normalized.snapshot.keyTimes, undefined);
  class TextNode {
    constructor() {
      this.children = [];
      this.value = "";
    }
    set textContent(value) {
      this.value = String(value);
      this.children = [];
    }
    get textContent() {
      return (
        this.value + this.children.map((child) => child.textContent || String(child)).join(" ")
      );
    }
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = children;
      this.value = "";
    }
  }
  const target = new TextNode(),
    summary = new TextNode();
  const doc = {
    createElement: () => new TextNode(),
    querySelector: (selector) =>
      selector === "#reported-tracking-details"
        ? target
        : selector === "#tracking-json-source-summary"
          ? summary
          : null
  };
  renderReportedTrackingDetails(doc, normalized.snapshot, "zh");
  assert.match(target.textContent, /SYNTHETIC-SEAL/);
  assert.match(target.textContent, /shipment.fields_extra.board_date/);
  assert.match(target.textContent, /SOURCE DATE WITHOUT CONVERSION/);
  assert.match(target.textContent, /SOURCE LOAD DETAIL/);
  assert.doesNotMatch(target.textContent, /\[object Object\]/);
  assert.match(summary.textContent, /尚未验证/);
  assert.deepEqual(normalizeTrackingPayload(normalized), normalized);
});

test("normalizing Java source fields preserves the request session fingerprint for file permissions", () => {
  const payload = {
    snapshot: {
      provider: { code: "SML" },
      tracking: { number: "SYNTHETIC123456" },
      summary: {},
      sourceDetails: {
        fields: [{ key: "seal_numbers", value: ["SYNTHETIC-SEAL"] }],
        extraFields: { board_date: "SOURCE DATE" }
      }
    }
  };
  const fingerprints = new WeakMap([[payload, "SYNTHETIC-SESSION"]]);
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = app.indexOf("function renderResult(payload) {");
  const end = app.indexOf("  const snapshot = payload.snapshot;", start);
  const render = vm.runInNewContext("(" + app.slice(start, end) + "return payload;\n})", {
    trackingPayloadSessionFingerprints: fingerprints,
    normalizeTrackingPayload
  });
  const normalized = render(payload);
  assert.notEqual(normalized, payload);
  assert.equal(fingerprints.get(normalized), "SYNTHETIC-SESSION");
  assert.equal(fingerprints.get(payload), "SYNTHETIC-SESSION");
  assert.equal(normalized.snapshot.sourceDetails.fields[0].structured, true);
});
