import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { trackingProgressNodes, reportedTrackingHistory, adaptTrackingV1 } from "../public/tracking-v1-adapter.mjs";
import { carrierKeyFacts } from "../public/tracking-carrier-fields.mjs";

test("typed leg progress keeps actual and estimated evidence distinct without fabricating preceding nodes", () => {
  const snapshot = {
    summary: { origin: { name: "Shanghai" }, destination: { name: "Long Beach" } },
    route: [],
    routingLegs: [{
      loadPort: "Shanghai", dischargePort: "Long Beach", loadCountryCode: "CN", dischargeCountryCode: "US",
      actualDeparture: "2026-07-24 23:29:37", estimatedArrival: "2026-08-15 05:25:45"
    }]
  };
  const before = JSON.stringify(snapshot);
  const nodes = trackingProgressNodes(snapshot);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].actualTime, "2026-07-24 23:29:37");
  assert.equal(nodes[0].estimatedTime, null);
  assert.equal(nodes[1].actualTime, null);
  assert.equal(nodes[1].estimatedTime, "2026-08-15 05:25:45");
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(trackingProgressNodes({ summary: snapshot.summary, events: [{ name: "Vessel departure" }] }), []);
});

test("carrier history progress is reported evidence, while generic entries and ambiguous dates never become nodes", () => {
  const snapshot = {
    provider: { code: "HMM" },
    events: [{ name: "Display Previous Moves", reportedTime: "2026-11-04" }],
    sourceDetails: {
      fields: [{ key: "origin_departure", value: "2026-10-01 07:20", source: "shipment.fields_extra" }],
      additionalEvents: [{ source: "hmm_history", name: "Vessel Departure from POL", reportedTime: "2026-10-12 07:00", location: "SHANGHAI,CHINA" }]
    }
  };
  const nodes = trackingProgressNodes(snapshot);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].reportedTime, "2026-10-12 07:00");
  assert.equal(nodes[0].semanticKind, "CARRIER_REPORTED");
  assert.equal(nodes[0].actualTime, null);
  assert.equal(nodes[0].estimatedTime, null);
  assert.equal(nodes[0].locationType, "POL");
  assert.ok(!JSON.stringify(carrierKeyFacts(snapshot)).includes("2026-10-01"));
  assert.deepEqual(trackingProgressNodes({ ...snapshot, sourceDetails: { additionalEvents: [{ ...snapshot.sourceDetails.additionalEvents[0], source: "shipment.events" }] } }), []);
});

test("only labelled OOCL timestamps become reported-time rows, retaining timezone and not assigning a port", () => {
  const snapshot = {
    provider: { code: "OOCL" },
    events: [
      { name: "PDT", reportedTime: "28 Oct 2026 00:23", raw: "28 Oct 2026 00:23 PDT" },
      { name: "ATA: CST", reportedTime: "29 Sep 2026 08:15", raw: "ATA: 29 Sep 2026 08:15 CST" },
      { name: "ATD: CST", reportedTime: "30 Sep 2026 22:13", raw: "ATD: 30 Sep 2026 22:13 CST" },
      { name: "Cargo Available: PDT", reportedTime: "26 Oct 2026 08:00", raw: "Cargo Available: 26 Oct 2026 08:00 PDT" }
    ]
  };
  const groups = carrierKeyFacts(snapshot, "zh");
  const rows = groups.find((group) => group.id === "reported-times").items;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].value, "29 Sep 2026 08:15 CST");
  assert.match(rows[0].label, /船司 ATA/);
  assert.ok(!JSON.stringify(rows).includes("28 Oct"));
  assert.ok(!JSON.stringify(rows).includes("港"));
  assert.deepEqual(trackingProgressNodes(snapshot), []);
});

test("cargo fields are allowlisted and units are never guessed or spread across containers", () => {
  const snapshot = {
    provider: { code: "SML" }, containers: [{ number: "TEST0000001" }],
    sourceDetails: { fields: [
      { key: "weight", value: "18240", source: "shipment.fields" },
      { key: "seal_numbers", rawText: '["SOURCE-SEAL"]', structured: true, source: "shipment.fields" },
      { key: "session_token", value: "DO-NOT-PROMOTE", source: "shipment.fields_extra" },
      { key: "unknown_custom_field", value: "DO-NOT-PROMOTE", source: "shipment.fields_extra" }
    ] }
  };
  const before = JSON.stringify(snapshot);
  const rows = carrierKeyFacts(snapshot, "en").flatMap((group) => group.items);
  assert.equal(rows.find((row) => row.key === "weight").value, "18240");
  assert.equal(rows.find((row) => row.key === "sealNumbers").value, "SOURCE-SEAL");
  assert.ok(!JSON.stringify(rows).includes("DO-NOT-PROMOTE"));
  assert.equal(snapshot.containers[0].seal, undefined);
  assert.equal(JSON.stringify(snapshot), before);
});

test("a carrier transport state remains useful when no latest event is supplied", () => {
  const snapshot = { provider: { code: "HMM" }, summary: { status: "IN_TRANSIT" }, sourceDetails: {} };
  const status = (language) => carrierKeyFacts(snapshot, language).flatMap((group) => group.items).find((item) => item.key === "status");
  assert.equal(status("zh").value, "运输中");
  assert.equal(status("en").value, "In transit");
  snapshot.summary.status = "UNKNOWN";
  assert.equal(status("zh"), undefined);
  snapshot.summary.status = "QUERY_COMPLETED";
  assert.equal(status("zh"), undefined);
});

test("MSC price and container-table fragments never become progress or history, while source and 29 boxes remain", () => {
  const mscEvents = [
    { description: "CONTAINERS", date: "01/09/2025", location: "* Price calculation date is indicative. Please contact your local MSC office.", mode: "" },
    ...Array.from({ length: 29 }, (_, index) => ({ description: `MSDU${String(index).padStart(7, "0")}`, date: "01/09/2025", location: "Container", mode: "Type" }))
  ];
  const snapshot = adaptTrackingV1({
    schema: "tracking.v1", carrier: { code: "MSC" }, query: { reference_input: "MEDU1234567", reference_submitted: "MEDU1234567", status: "QUERY_COMPLETED" },
    shipment: { containers: mscEvents.slice(1).map((event) => ({ number: event.description })), fields_extra: { msc_events: mscEvents } }
  }).snapshot;
  const before = JSON.stringify(snapshot);
  assert.equal(snapshot.containers.length, 29);
  assert.deepEqual(trackingProgressNodes(snapshot), []);
  assert.deepEqual(reportedTrackingHistory(snapshot), []);
  assert.equal(JSON.parse(snapshot.sourceDetails.fields.find((field) => field.key === "msc_events").rawText).length, 30);
  assert.equal(JSON.stringify(snapshot), before);
  snapshot.sourceDetails.additionalEvents.push({ source: "msc_events", name: "Gate in empty depot", reportedTime: "2026-10-12 07:00", location: "Shanghai" });
  assert.equal(reportedTrackingHistory(snapshot).length, 1);
  assert.deepEqual(trackingProgressNodes(snapshot), []);
});

test("container lookups keep associated bill and booking facts if no other visible region presents them", () => {
  class Element {
    constructor() { this.children = []; this.dataset = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    get textContent() { return (this.value || "") + this.children.map((child) => child.textContent).join(" "); }
    set textContent(value) { this.value = value; }
  }
  const elements = Object.fromEntries([
    "carrier-facts-panel", "carrier-facts-grid", "carrier-facts-title", "carrier-facts-note",
    "master-bill-reference", "summary-booking-reference", "result-container-types-fact", "result-vessel-fact", "result-number"
  ].map((key) => [key, new Element()]));
  for (const name of ["master-bill-reference", "summary-booking-reference", "result-container-types-fact", "result-vessel-fact"])
    elements[name].hidden = true;
  elements["result-number"].textContent = "TEST0000001";
  const context = vm.createContext({
    document: { createElement: () => new Element() }, elements, currentLanguage: "en", carrierKeyFacts,
    carrierFactsProvenance: () => "", t: (key) => key,
    bookingNumbersForSnapshot: (snapshot) => snapshot.references.bookingNumbers,
    hasText: (value) => typeof value === "string" && value.trim()
  });
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = app.indexOf("function renderCarrierFacts(snapshot) {");
  vm.runInContext(app.slice(start, app.indexOf("function renderJourney(snapshot)", start)), context);
  context.renderCarrierFacts({
    provider: { code: "OOCL" }, tracking: { type: "CONTAINER", number: "TEST0000001" },
    references: { masterBill: "REALBILL123", bookingNumbers: ["BOOKING456"] }
  });
  assert.match(elements["carrier-facts-grid"].textContent, /REALBILL123/);
  assert.match(elements["carrier-facts-grid"].textContent, /BOOKING456/);
});
