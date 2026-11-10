import test from "node:test";
import assert from "node:assert/strict";
import { adaptTrackingV1 } from "../public/tracking-v1-adapter.mjs";
import {
  renderReportedTrackingDetails,
  renderTrackingHistory
} from "../public/tracking-json-preview.mjs";
import { syntheticByCarrier } from "./fixtures/tracking-v1-carriers.mjs";

class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.value = "";
    this.listeners = new Map();
  }
  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }
  get textContent() {
    return this.value + this.children.map((child) => child.textContent).join(" ");
  }
  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }
  removeEventListener(type) {
    this.listeners.delete(type);
  }
  expand() {
    this.open = true;
    this.listeners.get("toggle")?.();
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
const disclosure = (element, label) => {
  if (element.tag === "details" &&
      element.children.find((child) => child.tag === "summary")?.textContent.startsWith(label))
    return element;
  return element.children.map((child) => disclosure(child, label)).find(Boolean);
};
function render(snapshot) {
  const target = new Element();
  const history = new Element();
  const doc = {
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => (selector === "#reported-tracking-details" ? target : history)
  };
  renderReportedTrackingDetails(doc, snapshot, "zh");
  renderTrackingHistory(doc, snapshot, "zh");
  return { target, history, visible: visibleText(target) };
}

test("carrier history is readable while raw records and technical provenance start collapsed", () => {
  for (const code of ["HMM", "MSC"]) {
    const snapshot = adaptTrackingV1(syntheticByCarrier.by_carrier[code][0]).snapshot;
    snapshot.events = [
      { name: "RAW PAGE ENTRY", source: "shipment.events", reportedTime: "RAW TIME" }
    ];
    snapshot.sourceDetails.additionalEvents = [
      {
        name: code === "MSC" ? "Gate in empty depot" : "CARRIER DESCRIPTION",
        reportedTime: "ORIGINAL TIME",
        location: "ORIGINAL PORT",
        source: code === "HMM" ? "hmm_history" : "msc_events"
      }
    ];
    snapshot.sourceDetails.strategy = "BROWSER_PAGE_TEXT";
    snapshot.sourceDetails.confidence = "LOW";
    const before = JSON.stringify(snapshot);
    const { target, history, visible } = render(snapshot);
    const visibleHistory = visibleText(history);
    assert.match(visibleHistory, /船司报告的历史/);
    for (const value of [code === "MSC" ? "Gate in empty depot" : "CARRIER DESCRIPTION", "ORIGINAL TIME", "ORIGINAL PORT"])
      assert.ok(visibleHistory.includes(value));
    assert.doesNotMatch(visible, /船司报告的历史|CARRIER DESCRIPTION/);
    assert.match(visible, /查看船司原始资料/);
    assert.doesNotMatch(visible, /船司原始记录|原始字段与扩展字段|来源详情/);
    assert.doesNotMatch(
      visible,
      /RAW PAGE ENTRY|RAW TIME|BROWSER_PAGE_TEXT|hmm_history|msc_events/
    );
    assert.doesNotMatch(target.textContent, /RAW PAGE ENTRY/);
    disclosure(target, "船司原始记录").expand();
    assert.match(target.textContent, /RAW PAGE ENTRY/);
    assert.match(target.textContent, /BROWSER_PAGE_TEXT/);
    assert.match(target.textContent, /尚未验证/);
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
  assert.match(visible, /船司要求完成验证/);
  assert.doesNotMatch(visible, /HUMAN_REQUIRED/);
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
  assert.doesNotMatch(target.textContent, /SOURCE SEAL/);
  const section = disclosure(target, "原始字段（核对用）");
  section.expand();
  assert.match(target.textContent, /SOURCE SEAL/);
  assert.match(target.textContent, /shipment.fields_extra.seal_numbers/);
});

test("opening an event builds its raw value and source as text once", () => {
  const { target } = render({
    events: [
      {
        name: "Mapped event",
        source: "shipment.events",
        raw: { count: 0, flag: false, markup: "<img src=x>" }
      }
    ]
  });
  const find = (element, tag) =>
    element.tag === tag ? element : element.children.map((child) => find(child, tag)).find(Boolean);
  const events = disclosure(target, "船司原始记录");
  assert.equal(find(events, "table"), undefined);
  events.expand();
  assert.match(events.textContent, /Mapped event/);
  const source = find(find(events, "table"), "details");
  assert.equal(find(source, "pre"), undefined);
  source.expand();
  assert.match(source.textContent, /shipment.events/);
  assert.deepEqual(JSON.parse(find(source, "pre").textContent), {
    count: 0,
    flag: false,
    markup: "<img src=x>"
  });
  assert.equal(find(source, "img"), undefined);
  const childCount = source.children.length;
  source.open = false;
  source.expand();
  assert.equal(source.children.length, childCount);
});
