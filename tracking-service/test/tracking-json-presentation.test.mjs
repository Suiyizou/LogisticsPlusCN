import test from "node:test";
import assert from "node:assert/strict";
import { adaptTrackingV1 } from "../public/tracking-v1-adapter.mjs";
import { renderReportedTrackingDetails } from "../public/tracking-json-preview.mjs";
import { syntheticByCarrier } from "./fixtures/tracking-v1-carriers.mjs";

class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.value = "";
  }
  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }
  get textContent() {
    return this.value + this.children.map((child) => child.textContent).join(" ");
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
    this.value = "";
  }
}
const visibleText = (element) => {
  if (element.hidden) return "";
  if (element.tag === "details" && !element.open)
    return element.children.find((child) => child.tag === "summary")?.textContent || "";
  return element.value + element.children.map(visibleText).join(" ");
};
function render(snapshot) {
  const target = new Element(),
    summary = new Element();
  const doc = {
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => (selector === "#reported-tracking-details" ? target : summary)
  };
  renderReportedTrackingDetails(doc, snapshot, "zh");
  return { target, summary, visible: visibleText(target) };
}

test("carrier history is readable while raw records and technical provenance start collapsed", () => {
  for (const code of ["HMM", "MSC"]) {
    const snapshot = adaptTrackingV1(syntheticByCarrier.by_carrier[code][0]).snapshot;
    snapshot.events = [
      { name: "RAW PAGE ENTRY", source: "shipment.events", reportedTime: "RAW TIME" }
    ];
    snapshot.sourceDetails.additionalEvents = [
      {
        name: "CARRIER DESCRIPTION",
        reportedTime: "ORIGINAL TIME",
        location: "ORIGINAL PORT",
        source: code === "HMM" ? "hmm_history" : "msc_events"
      }
    ];
    snapshot.sourceDetails.strategy = "BROWSER_PAGE_TEXT";
    snapshot.sourceDetails.confidence = "LOW";
    const before = JSON.stringify(snapshot);
    const { target, summary, visible } = render(snapshot);
    assert.match(visible, /船司报告的历史/);
    for (const value of ["CARRIER DESCRIPTION", "ORIGINAL TIME", "ORIGINAL PORT"])
      assert.ok(visible.includes(value));
    assert.match(visible, /船司原始记录/);
    assert.doesNotMatch(
      visible,
      /RAW PAGE ENTRY|RAW TIME|BROWSER_PAGE_TEXT|hmm_history|msc_events/
    );
    assert.match(target.textContent, /RAW PAGE ENTRY/);
    assert.match(target.textContent, /BROWSER_PAGE_TEXT/);
    assert.match(summary.textContent, /尚未验证/);
    assert.doesNotMatch(visible, /尚未验证/);
    assert.equal(JSON.stringify(snapshot), before);
  }
});

test("no-data and human intervention remain visible while ordinary warnings can be inspected", () => {
  const snapshot = adaptTrackingV1(syntheticByCarrier.by_carrier.HAPAG_LLOYD[0]).snapshot;
  snapshot.sourceDetails.queryStatus = "HUMAN_REQUIRED";
  snapshot.sourceDetails.warnings = [
    "HUMAN_REQUIRED: complete verification",
    "NON_BLOCKING_SOURCE_WARNING"
  ];
  const { target, visible } = render(snapshot);
  assert.match(visible, /没有业务数据/);
  assert.match(visible, /HUMAN_REQUIRED/);
  assert.doesNotMatch(visible, /NON_BLOCKING_SOURCE_WARNING|船司报告的历史/);
  assert.match(target.textContent, /NON_BLOCKING_SOURCE_WARNING/);
});

test("original fields retain values and paths behind disclosures without repeating transport summary", () => {
  const snapshot = adaptTrackingV1(syntheticByCarrier.by_carrier.SML[0]).snapshot;
  snapshot.sourceDetails.vessel = "SUMMARY VESSEL";
  snapshot.sourceDetails.voyage = "SUMMARY VOYAGE";
  snapshot.sourceDetails.fields = [
    { key: "seal_numbers", value: "SOURCE SEAL", source: "shipment.fields_extra" }
  ];
  const { target, visible } = render(snapshot);
  assert.doesNotMatch(visible, /SOURCE SEAL|shipment.fields_extra|SUMMARY VESSEL|SUMMARY VOYAGE/);
  assert.match(target.textContent, /SOURCE SEAL/);
  assert.match(target.textContent, /shipment.fields_extra.seal_numbers/);
});
