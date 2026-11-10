import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { adaptTrackingV1, normalizeTrackingPayload, trackingProgressNodes, reportedTrackingHistory, progressContainerNumbers } from "../public/tracking-v1-adapter.mjs";
import { detailCaptureLabel, normalizeDetailCapture, eventVesselLabel, eventTerminalLabel, eventLoadLabel, containerBusinessFacts, reportedTimeLabel, progressEventPresentation, routeLocationLabel } from "../public/tracking-detail-data.mjs";
import { carrierKeyFacts } from "../public/tracking-carrier-fields.mjs";
import { currentMilestoneIndex, uniqueMilestones, containerMilestoneTiming } from "../public/tracking-milestones.mjs";
import { renderTrackingHistory, renderReportedTrackingDetails } from "../public/tracking-json-preview.mjs";

function detailRecord() {
  const containers = ["BOX0000001", "BOX0000002"].map((number, box) => ({
    number, type: "40HC", tare_kg: 3800, payload_kg: 26680, weight: null,
    eta: "2026-11-12T15:00", eta_raw: "12 Nov 2026 15:00", eta_label: "ETA",
    events: Array.from({ length: 8 }, (_, index) => ({
      description: index % 2 ? "Vessel Departure" : "Loaded", location: "SOURCE PORT",
      terminal: "SOURCE TERMINAL", vessel: box ? "SOURCE VESSEL B" : "SOURCE VESSEL A",
      voyage: box ? "002E" : "001E", container_number: number,
      time: `2020-01-0${index + 1}T0${box + 1}:00`, time_raw: `Jan ${index + 1} 2020 0${box + 1}:00`,
      time_type: "REPORTED", timezone: null, source: { kind: "PAGE_DETAILS", container: number }
    }))
  }));
  return {
    schema: "tracking.v1", carrier: { code: "CMA_CGM" },
    query: { status: "QUERY_COMPLETED", reference_type: "BOOKING", reference_input: "QA12345" },
    meta: { detail_capture: {
      status: "captured", reason: "PRIVATE REASON", errors: [{ message: "PRIVATE ERROR" }],
      coverage: { scope: "visible_container_histories_and_pdf", scope_complete: true, declared_containers: 2,
        overview_containers: containers.map((c) => c.number), detailed_containers: containers.map((c) => c.number), pending_containers: [] },
      sources: [{ kind: "PAGE_DETAILS", url: "https://www.cma-cgm.com/source" }, { kind: "PDF_DOWNLOAD", url: "file:///private/document.pdf" }],
      pdf: [{ state: "saved", parsed: false }]
    } },
    shipment: { route: { origin: "SOURCE ORIGIN", destination: "SOURCE DESTINATION" },
      containers, events: containers.flatMap((c) => c.events), fields_extra: { official_url: "https://www.cma-cgm.com/source" } }
  };
}

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.value = ""; this.listeners = new Map(); }
  set textContent(value) { this.value = String(value); this.children = []; }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(" "); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.value = ""; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  expand() { this.open = true; this.listeners.get("toggle")?.(); }
}
function elementsByTag(root, tag) {
  return [...(root.tag === tag ? [root] : []), ...root.children.flatMap((child) => elementsByTag(child, tag))];
}
function expandAll(root) {
  if (root.tag === "details") root.expand();
  root.children.forEach(expandAll);
}

test("carrier timezone labels are retained once without converting the source clock", () => {
  assert.equal(reportedTimeLabel("28 Oct 2026 00:01 PDT", "PDT"), "28 Oct 2026 00:01 PDT");
  assert.equal(reportedTimeLabel("30 Sep 2026 22:13 CST", "CST"), "30 Sep 2026 22:13 CST");
  assert.equal(reportedTimeLabel("2026-10-28T00:01:00", "PDT"), "2026-10-28 00:01:00 PDT");
  assert.equal(reportedTimeLabel("25/09/2025", null), "25/09/2025");
  assert.equal(reportedTimeLabel("Thursday, 30-APR-2026 04:44 AM", null), "Thursday, 30-APR-2026 04:44 AM");
});

test("eight explicit CMA movement titles are readable in both languages without changing reported evidence or source text", () => {
  const events = ["Gate out empty from depot", "Ready to be loaded", "Loaded on board", "Vessel Departure", "Vessel Arrival", "Discharged from Vessel", "Gate out to consignee", "Gate in empty at Depot"];
  const nodes = events.map((event) => ({ event, semanticKind: "CARRIER_REPORTED", containerNumber: "TLLU4745847", reportedTime: "Thursday, 30-APR-2026 04:44 AM", actualTime: null, estimatedTime: null }));
  const before = JSON.stringify(nodes);
  assert.deepEqual(nodes.map((node) => progressEventPresentation(node, "zh").label), ["提空", "待装船", "装船", "离港", "到港", "卸船", "提货", "还空箱"]);
  assert.deepEqual(nodes.map((node) => progressEventPresentation(node, "en").label), ["Empty pickup", "Ready for loading", "Loaded", "Vessel departure", "Vessel arrival", "Discharged", "Cargo pickup", "Empty return"]);
  assert.ok(new Set(nodes.map((node) => progressEventPresentation(node).icon)).size > 1);
  assert.equal(currentMilestoneIndex(nodes), -1);
  assert.equal(JSON.stringify(nodes), before);
  assert.equal(progressEventPresentation({ ...nodes[0], event: "UNKNOWN SOURCE EVENT" }), null);
  assert.equal(progressEventPresentation({ ...nodes[0], semanticKind: "CARRIER_EVENT" }), null);
  assert.equal(routeLocationLabel({ city: "TIANJIN XINGANG (CN)", countryCode: "CN" }), "TIANJIN XINGANG, CN");
  assert.equal(routeLocationLabel({ city: "SAVANNAH, GA (US)", countryCode: "US" }), "SAVANNAH, GA, US");
  assert.equal(routeLocationLabel({ city: "NINGBO, CN", countryCode: "CN" }), "NINGBO, CN");
});

test("two detailed containers keep all sixteen distinct local reported moves without actual completion", () => {
  const record = detailRecord();
  const before = JSON.stringify(record);
  const snapshot = adaptTrackingV1(record).snapshot;
  const nodes = trackingProgressNodes(snapshot);
  assert.equal(nodes.length, 16);
  assert.equal(uniqueMilestones(nodes).length, 16, "box identity and reported time take part in node identity");
  assert.equal(currentMilestoneIndex(nodes), -1);
  assert.ok(nodes.every((node) => node.semanticKind === "CARRIER_REPORTED" && node.actualTime === null && node.estimatedTime === null));
  assert.equal(nodes[0].reportedTime, "Jan 1 2020 01:00");
  assert.equal(nodes[8].reportedTime, "Jan 1 2020 02:00");
  assert.equal(nodes[8].containerNumber, "BOX0000002");
  assert.deepEqual(progressContainerNumbers(snapshot), ["BOX0000001", "BOX0000002"]);
  assert.equal(trackingProgressNodes(snapshot, { containerNumber: "BOX0000002" }).length, 8);
  assert.ok(trackingProgressNodes(snapshot, { containerNumber: "BOX0000002" }).every((node) => node.containerNumber === "BOX0000002"));
  assert.equal(reportedTrackingHistory(snapshot).length, 16, "shipment and box copies are deduplicated only by the full business identity");
  assert.equal(snapshot.containers[0].milestones.length, 8);
  assert.equal(containerMilestoneTiming(snapshot.containers[0].milestones[0]).state, "unknown");
  assert.equal(JSON.stringify(record), before);
});

test("explicit actual and estimated types remain separate and overview page fragments never become progress", () => {
  const record = detailRecord();
  record.shipment.events[0].time_type = "ACTUAL";
  record.shipment.events[1].time_type = "ESTIMATED";
  const snapshot = adaptTrackingV1(record).snapshot;
  const nodes = trackingProgressNodes(snapshot);
  assert.equal(nodes[0].actualTime, "2020-01-01T01:00");
  assert.equal(nodes[0].estimatedTime, null);
  assert.equal(nodes[1].estimatedTime, "2020-01-02T01:00");
  assert.equal(nodes[1].actualTime, null);
  assert.equal(snapshot.containers[0].milestones[0].occurredAt, "2020-01-01T01:00");
  assert.equal(containerMilestoneTiming(snapshot.containers[0].milestones[1]).state, "estimated");
  for (const event of record.shipment.events) event.source.kind = "PAGE_OVERVIEW";
  assert.deepEqual(trackingProgressNodes(adaptTrackingV1(record).snapshot), []);
});

test("equipment capacities and each box ETA retain their meanings and never become cargo weight or whole-shipment arrival", () => {
  const snapshot = adaptTrackingV1(detailRecord()).snapshot;
  assert.equal(snapshot.containers[0].tareKg, 3800);
  assert.equal(snapshot.containers[0].payloadKg, 26680);
  assert.equal(snapshot.containers[0].weight, "");
  assert.equal(snapshot.containers[0].estimatedArrivalRaw, "12 Nov 2026 15:00");
  assert.equal(snapshot.keyTimes.estimatedArrival, undefined);
  assert.equal(snapshot.keyTimes.actualArrival, undefined);
});

test("full detailed histories supersede legacy summaries and keep location-free customs rows out of transport progress", () => {
  const record = detailRecord();
  record.shipment.events.push({ description: "HOLD RELEASED - Customs Clearance", time: "2020-01-09T02:00", time_raw: "Jan 9 2020 02:00", time_type: "REPORTED", container_number: "BOX0000002", source: { kind: "PAGE_DETAILS" } });
  record.shipment.fields_extra.hmm_history = [{ status: "Vessel Departure from POL", date: "2020-01-08", time: "02:00", location: "SOURCE PORT" }];
  const snapshot = adaptTrackingV1(record).snapshot;
  assert.equal(reportedTrackingHistory(snapshot).length, 17);
  assert.equal(reportedTrackingHistory(snapshot).filter((event) => /Customs/.test(event.name)).length, 1);
  assert.equal(trackingProgressNodes(snapshot, { containerNumber: "BOX0000002" }).length, 8);
});

test("coverage exposes only business counts, does not claim PDF parsing, and legacy coverage stays hidden", () => {
  const snapshot = adaptTrackingV1(detailRecord()).snapshot;
  assert.equal(detailCaptureLabel(snapshot, "zh"), "已读取 2/2 箱详情");
  assert.equal(detailCaptureLabel(snapshot, "en"), "Read details for 2/2 containers");
  assert.doesNotMatch(JSON.stringify(snapshot.sourceDetails.detailCapture), /PRIVATE|url|file:|https:|errors|parsed|pdf/);
  snapshot.sourceDetails.detailCapture.status = "partial";
  assert.equal(detailCaptureLabel(snapshot, "zh"), "已读取 2/2 箱详情 · 部分补充信息未取得");
  snapshot.sourceDetails.detailCapture.detailedCount = 1;
  snapshot.sourceDetails.detailCapture.pendingCount = 1;
  assert.match(detailCaptureLabel(snapshot, "zh"), /1\/2.*部分详情未读取/);
  snapshot.sourceDetails.detailCapture.status = "unverified";
  assert.equal(detailCaptureLabel(snapshot), "");
  assert.equal(detailCaptureLabel({ sourceDetails: {} }), "");
  assert.doesNotThrow(() => normalizeDetailCapture({ status: "partial", sources: {} }));
});

test("recursive customer and preview projection hide nested artifacts and local paths while retaining official links", () => {
  const record = detailRecord();
  record.detail_artifacts = [{ path: "C:/private/raw.pdf" }];
  record.shipment.fields_extra.nested = { detail_artifacts: [{ path: "/opt/private/details.pdf" }], freeDays: 0, note: "saved to /tmp/private/file.pdf" };
  record.shipment.fields_extra.embedded_json = JSON.stringify({ nested: { detail_artifacts: [{ path: "C:/private/nested.pdf" }] }, source_url: "https://www.cma-cgm.com/source" });
  const snapshot = adaptTrackingV1(record).snapshot;
  snapshot.sourceDetails.fields.push({ key: "detail_artifacts", value: "PRIVATE ARTIFACT" }, { key: "old_note", value: "file:///private/old.pdf" });
  const normalized = normalizeTrackingPayload({ snapshot }).snapshot;
  assert.doesNotMatch(JSON.stringify(normalized), /private\/|PRIVATE ARTIFACT|detail_artifacts/);
  assert.match(JSON.stringify(normalized), /https:\/\/www.cma-cgm.com\/source/);
  const target = new Element();
  renderReportedTrackingDetails({ createElement: (tag) => new Element(tag), querySelector: () => target }, snapshot, "zh");
  expandAll(target);
  assert.doesNotMatch(target.textContent, /private\/|PRIVATE ARTIFACT|detail_artifacts/);
  assert.match(target.textContent, /https:\/\/www.cma-cgm.com\/source/);
});

test("ordinary history and per-box tables render all detailed moves with box, time, terminal and vessel attribution", () => {
  const snapshot = adaptTrackingV1(detailRecord()).snapshot;
  for (const language of ["zh", "en"]) {
    const target = new Element();
    const panel = new Element();
    renderTrackingHistory({ createElement: (tag) => new Element(tag), querySelector: (selector) => selector === "#reported-history-panel" ? panel : target }, snapshot, language);
    assert.equal(elementsByTag(target, "tbody")[0].children.length, 16);
    assert.match(target.textContent, /BOX0000001/);
    assert.match(target.textContent, /BOX0000002/);
    assert.match(target.textContent, /Jan 1 2020 01:00/);
    assert.match(target.textContent, /Jan 1 2020 02:00/);
    assert.match(target.textContent, /SOURCE VESSEL A/);
    assert.match(target.textContent, /SOURCE VESSEL B/);
    assert.match(target.textContent, /SOURCE TERMINAL/);
    assert.match(target.textContent, language === "zh" ? /船司报告/ : /Reported/);
    assert.equal(panel.hidden, false);
    const select = elementsByTag(target, "select")[0];
    select.value = "BOX0000002";
    select.listeners.get("change")();
    assert.equal(elementsByTag(target, "tbody")[0].children.length, 8);
    assert.match(target.textContent, /8\/16/);
    assert.doesNotMatch(elementsByTag(target, "tbody")[0].textContent, /BOX0000001/);
  }
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = app.indexOf("function renderContainerMilestones(cell, container) {");
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag) },
    containerMilestoneTiming, eventTerminalLabel, eventVesselLabel, eventLoadLabel, containerBusinessFacts, currentLanguage: "en", t: (key) => key, formatDateTime: (value) => value || "—",
    appendCell(row, value) { const td = new Element("td"); td.textContent = value || "—"; row.append(td); } });
  vm.runInContext(app.slice(start, app.indexOf("function renderContainers(snapshot)", start)), context);
  const box = new Element();
  context.renderContainerMilestones(box, snapshot.containers[1]);
  assert.equal(elementsByTag(box, "tbody")[0].children.length, 8);
  assert.match(box.textContent, /BOX0000002.*route.time.reported/);
  assert.doesNotMatch(box.textContent, /route.time.actual/);
});

test("date precision, per-box sequence and empty/laden metadata stay factual", () => {
  const record = detailRecord();
  const moves = [
    { description: "Estimated Time of Arrival", time: "2025-09-25", time_raw: "25/09/2025", time_type: "ESTIMATED" },
    { description: "Export Loaded on Vessel", time: "2025-09-11", time_raw: "11/09/2025", time_type: "REPORTED" },
    { description: "Export received at CY", time: "2025-09-08", time_raw: "08/09/2025", time_type: "REPORTED", load_status: "LADEN" },
    { description: "Empty to Shipper", time: "2025-08-27", time_raw: "27/08/2025", time_type: "REPORTED", load_status: "EMPTY" }
  ].map((event) => ({ ...event, time_precision: "DATE", location: "SOURCE PORT", container_number: "BOX0000001", source: { kind: "PAGE_DETAILS" },
    vessel_details: { imo: "9983671", flag: "LIBERIA", built: "2024" }, terminal_details: { firms: "Z952", bic: "CNSHAAODP" } }));
  record.shipment.containers = [{ number: "BOX0000001", events: moves }];
  record.shipment.events = moves;
  const snapshot = adaptTrackingV1(record).snapshot;
  const nodes = trackingProgressNodes(snapshot, { containerNumber: "BOX0000001" });
  assert.equal(nodes.length, 4);
  assert.equal(nodes[0].event, "Empty to Shipper");
  assert.equal(nodes[3].estimatedTime, "2025-09-25");
  assert.ok(nodes.every((event) => event.actualTime === null));
  assert.doesNotMatch(JSON.stringify(nodes), /00:00|Z"/);
  assert.equal(snapshot.events[0].timePrecision, "DATE");
  assert.match(eventVesselLabel(snapshot.events[0], "en"), /IMO 9983671.*LIBERIA.*Built 2024/);
  assert.match(eventTerminalLabel(snapshot.events[0]), /FIRMS Z952.*BIC CNSHAAODP/);
  assert.equal(eventLoadLabel(snapshot.events[2], "zh"), "重箱");
});

test("VGM, cargo gross weight and standard tariff references are distinct business facts; masked seals and unknown extras are not promoted", () => {
  const record = detailRecord();
  record.shipment.containers[0].extra = {
    seal: "********", quantity_raw: "21 CARTONS", measurement_raw: "4.2 CBM",
    vgm: { raw: "7200 KGS", method: "2" }, reported_cargo_gross_weight_raw: "3,500.000 KGS",
    detention: { last_free_day_raw: "Aug-24-2026", free_time_raw: "4 WORKING DAYS", basis: "TARIFF_STANDARD_REFERENCE", guaranteed: false, contract_terms_prevail: true },
    unknown: "DO NOT PROMOTE"
  };
  record.shipment.fields_extra.evergreen_release = { customs_status: "RELEASED", customs_date_raw: "Aug-19-2026", bill_type: "ORIGINAL" };
  record.shipment.fields_extra.evergreen_pickup_reference = { terminal_name: "SOURCE TERMINAL", address: "SOURCE ADDRESS", city: "SOURCE CITY" };
  const snapshot = adaptTrackingV1(record).snapshot;
  assert.equal(snapshot.containers[0].seal, "");
  assert.equal(snapshot.containers[0].weight, "");
  const facts = containerBusinessFacts(snapshot.containers[0]);
  assert.equal(facts.find((row) => row.key === "vgm").value, "7200 KGS · 方法 2");
  assert.equal(facts.find((row) => row.key === "cargoGross").value, "3,500.000 KGS");
  assert.match(facts.find((row) => row.key === "freeTimeReference").label, /参考.*合同条款优先.*非保证/);
  assert.doesNotMatch(JSON.stringify(facts), /DO NOT PROMOTE|\*\*\*\*/);
  const groups = carrierKeyFacts(snapshot);
  assert.match(JSON.stringify(groups.find((group) => group.id === "release")), /RELEASED.*Aug-19-2026/);
  assert.match(JSON.stringify(groups.find((group) => group.id === "pickup")), /SOURCE TERMINAL.*SOURCE ADDRESS/);
  assert.equal(reportedTrackingHistory(snapshot).length, 16, "customs and tariff dates are not transport events");
});

test("ONE release tables retain four source times and two box-bound FIRMS codes without promoting contacts or logistics events", () => {
  const record = detailRecord();
  record.carrier.code = "ONE";
  const release = { obl_received: "2026-07-27 06:47", ocean_freight_collection: "2026-07-21 02:02",
    customs_clearance: "2026-08-13 15:58", importer_security_filing: "2026-07-21 09:28",
    firms_code_port_of_discharging: "Y549", firms_code_place_of_delivery: "Y549",
    telephone: "DO-NOT-DISPLAY-CONTACT", work_order_number: "DO-NOT-PROMOTE" };
  record.shipment.containers[0].extra = { cargo_release: release };
  record.shipment.containers[1].extra = { cargo_release: { obl_received: "N/A", customs_clearance: "Click to Check", firms_code_port_of_discharging: "-" } };
  record.shipment.fields_extra.extra = { one_release: [{ container_number: "BOX0000001", ...release }, { container_number: "FOREIGN0001", ...release }] };
  const snapshot = adaptTrackingV1(record).snapshot, before = JSON.stringify(snapshot);
  assert.equal(containerBusinessFacts(snapshot.containers[0]).length, 6);
  assert.equal(containerBusinessFacts(snapshot.containers[1]).length, 0);
  for (const language of ["zh", "en"]) {
    const rows = carrierKeyFacts(snapshot, language).find((group) => group.id === "container-release").items;
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.label.startsWith("BOX0000001 · ")));
    assert.deepEqual(rows.slice(0, 4).map((row) => row.value), ["2026-07-27 06:47", "2026-07-21 02:02", "2026-08-13 15:58", "2026-07-21 09:28"]);
    assert.deepEqual(rows.slice(4).map((row) => row.value), ["Y549", "Y549"]);
    assert.match(rows[0].label, language === "zh" ? /船司报告/ : /reported/);
    assert.doesNotMatch(JSON.stringify(rows), /DO-NOT|FOREIGN|Click to Check|N\/A/);
  }
  assert.equal(reportedTrackingHistory(snapshot).length, 16);
  assert.equal(trackingProgressNodes(snapshot).length, 16);
  assert.equal(JSON.stringify(snapshot), before);
  delete snapshot.containers[0].extra.cargo_release;
  assert.equal(carrierKeyFacts(snapshot).find((group) => group.id === "container-release").items.length, 6, "the known box may use the shipment's exact one_release source when its container copy is absent");
});

test("HMM bill receipt, customs release, FIRMS and empty return address use only exact useful source rows", () => {
  const record = detailRecord();
  record.carrier.code = "HMM";
  record.shipment.fields_extra.extra = {
    cargo_delivery: [["Original B/L", "Recovered : 2026-10-13"], ["US Custom", "Cleared : 2026-11-04"], ["Firms Code", "W185"], ["Delivery Order", "N/A"], ["Telephone", "DO-NOT-DISPLAY-CONTACT"]],
    empty_return_locations: { headers: ["Empty Container Return Location", "Address"], rows: [["APM TERMINALS", "2500 NAVY WAY ( BERTH 401-406 TERMINAL ISLAND. CA"], ["N/A", "Click to Check"]] }
  };
  const snapshot = adaptTrackingV1(record).snapshot, before = JSON.stringify(snapshot);
  for (const language of ["zh", "en"]) {
    const groups = carrierKeyFacts(snapshot, language);
    const delivery = groups.find((group) => group.id === "bill-customs-release").items;
    assert.deepEqual(delivery.map((row) => row.value), ["Recovered : 2026-10-13", "Cleared : 2026-11-04", "W185"]);
    const returns = groups.find((group) => group.id === "empty-return-location").items;
    assert.equal(returns.length, 1);
    assert.equal(returns[0].value, "APM TERMINALS · 2500 NAVY WAY ( BERTH 401-406 TERMINAL ISLAND. CA");
    assert.doesNotMatch(JSON.stringify([...delivery, ...returns]), /Click to Check|N\/A|DO-NOT/);
  }
  assert.equal(trackingProgressNodes(snapshot).length, 16);
  assert.equal(reportedTrackingHistory(snapshot).length, 16);
  assert.equal(JSON.stringify(snapshot), before);
  record.shipment.fields_extra.extra = {};
  const missing = carrierKeyFacts(adaptTrackingV1(record).snapshot);
  assert.ok(!missing.some((group) => ["bill-customs-release", "empty-return-location"].includes(group.id)), "missing source data does not become a receipt or clearance state");
});

test("the dedicated business extra projection survives source-field saturation and repeated customer normalization", () => {
  const record = detailRecord();
  record.carrier.code = "HMM";
  record.shipment.events.push(...Array.from({ length: 500 }, (_, index) => ({ description: "Source movement", time_raw: "2026-11-08 12:00", extra: { reported_mode: `SOURCE EVENT EXTRA ${index}` } })));
  record.shipment.fields_extra.extra = {
    cargo_delivery: [["Firms Code", "W185"]], empty_return_locations: { rows: [["APM TERMINALS", "2500 NAVY WAY"]] },
    customs_history: Array.from({ length: 7 }, (_, index) => ({ "Date/Time": `2026/08/${index + 1} 12:00`, Event: "55", "Code Activity": `SOURCE CUSTOMS ${index}` })),
    nested: { detail_artifacts: [{ path: "C:/private/details.pdf" }] }
  };
  const snapshot = adaptTrackingV1(record).snapshot;
  assert.equal(snapshot.sourceDetails.businessExtras.customs_history.length, 7);
  // Match Java's bounded archive shape: the first 200 source fields belong to
  // event extras, so archival fields can no longer carry shipment business data.
  snapshot.sourceDetails.fields = Array.from({ length: 200 }, (_, index) => ({ key: "extra", source: `shipment.events.${index + 1}`, value: { reported_mode: "EVENT EXTRA ONLY" } }));
  const normalized = normalizeTrackingPayload(normalizeTrackingPayload({ snapshot })).snapshot;
  const groups = carrierKeyFacts(normalized);
  assert.equal(groups.find((group) => group.id === "bill-customs-release").items[0].value, "W185");
  assert.equal(groups.find((group) => group.id === "empty-return-location").items[0].value, "APM TERMINALS · 2500 NAVY WAY");
  assert.equal(groups.find((group) => group.id === "customs-records").items.length, 7);
  assert.doesNotMatch(JSON.stringify(normalized.sourceDetails.businessExtras), /private\/|detail_artifacts/);
  normalized.provider.code = "YML";
  assert.equal(carrierKeyFacts(normalized).find((group) => group.id === "customs-records").items.length, 7);
});

test("the real Evergreen Java extraFields shape renders release and pickup objects before and after customer normalization", () => {
  const snapshot = { provider: { code: "EVERGREEN" }, route: [], events: [], containers: [], sourceDetails: {
    fields: [{ key: "evergreen_release", source: "shipment.events.1", value: { carrier_status: "WRONG EVENT OBJECT" } }],
    extraFields: {
      evergreen_release: { carrier_status: "Released", freight_status: "Received", bill_type: "Sea Waybill", bill_date_raw: "N/A",
        customs_status: "RELEASED", customs_description: "RELEASED BY US.CUSTOMS AT LOS ANGELES, CA", customs_date_raw: "AUG-12-2026", unknown: "DO-NOT-PROMOTE" },
      evergreen_pickup_reference: { terminal_name: "Berth 233, Terminal Island (LAX)", address: "389 TERMINAL WAY", city: "TERMINAL ISLAND", state: "CA", postal_code: "90731" }
    }
  } };
  const before = JSON.stringify(snapshot);
  const normalized = normalizeTrackingPayload(normalizeTrackingPayload({ snapshot })).snapshot;
  for (const source of [snapshot, normalized]) for (const language of ["zh", "en"]) {
    const groups = carrierKeyFacts(source, language);
    const release = groups.find((group) => group.id === "release").items;
    assert.equal(release.length, 6, "the N/A bill date is omitted while all six meaningful release facts remain");
    assert.deepEqual(release.map((row) => row.value), ["Released", "Received", "Sea Waybill", "RELEASED", "RELEASED BY US.CUSTOMS AT LOS ANGELES, CA", "AUG-12-2026"]);
    const pickup = groups.find((group) => group.id === "pickup").items;
    assert.deepEqual(pickup.map((row) => row.value), ["Berth 233, Terminal Island (LAX)", "389 TERMINAL WAY, TERMINAL ISLAND, CA, 90731"]);
    assert.doesNotMatch(JSON.stringify([...release, ...pickup]), /N\/A|DO-NOT-PROMOTE|WRONG EVENT/);
    assert.deepEqual(trackingProgressNodes(source), []);
  }
  assert.equal(JSON.stringify(snapshot), before);
});
