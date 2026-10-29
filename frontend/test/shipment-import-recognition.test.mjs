import { readFileSync } from "node:fs";
import {
  trackingCarriersForMode,
  supportsShipmentReference,
  normalizeTrackingAdapterMode
} from "../src/services/trackingCarriers.js";
import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  prepareSheet,
  parseShipmentBatchWorkbook,
  buildShipmentBatchPreview,
  buildShipmentBatchReview
} from "../src/services/shipmentBatchImport.js";
const operationalHeaders = [
  "提单号",
  "发票号",
  "原ETD",
  "现ETD",
  "原ETA",
  "现ETA",
  "箱量",
  "船名航次",
  "提单号：",
  "CARRIER"
];
function preview(rows, opts = {}) {
  const w = XLSX.utils.book_new();
  const s = XLSX.utils.aoa_to_sheet(rows);
  Object.assign(s, opts);
  XLSX.utils.book_append_sheet(w, s, "Tasks");
  const sheet = parseShipmentBatchWorkbook(w, XLSX)[0];
  return { sheet, result: buildShipmentBatchPreview(sheet, sheet.suggestedColumnIndex) };
}
test("operational workbook uses actual bill column and current schedule, keeps job separately", () => {
  const { sheet, result } = preview([
    operationalHeaders,
    [
      "JOB-001",
      "INV-01",
      "2026-07-01",
      "2026-07-02",
      "2026-08-01",
      "2026-08-02",
      "2*40HC",
      "Vessel",
      "COSU0012345678",
      ""
    ]
  ]);
  assert.equal(sheet.suggestedColumnIndex, 8);
  assert.equal(result.items[0].number, "0012345678");
  assert.equal(result.items[0].displayNumber, "COSU0012345678");
  assert.equal(result.items[0].importedDetails.forwarderJobNumber, "JOB-001");
  assert.equal(result.items[0].importedDetails.estimatedDeparture, "2026-07-02");
  assert.equal(result.items[0].carrier, "COSCO");
  assert.equal(result.rows[0].carrierSource, "prefix");
  assert.equal(result.errors.length, 0);
  assert.ok(
    buildShipmentBatchPreview(sheet, 0).errors.some((e) => e.code === "BUSINESS_ID_COLUMN")
  );
});
test("unknown and carrier conflict block instead of creating manual placeholders", () => {
  const { result } = preview([
    ["BOOKING", "CARRIER"],
    ["00001234", "MYSTERY"],
    ["COSU1234567890", "MSC"],
    ["1234567890", ""]
  ]);
  assert.equal(result.items.length, 0);
  assert.deepEqual(
    result.errors.map((e) => e.code),
    ["UNKNOWN_CARRIER", "CARRIER_CONFLICT", "UNKNOWN_CARRIER"]
  );
});
test("white-listed annotation is removed without truncating arbitrary content", () => {
  const { result } = preview([
    ["提单号", "CARRIER"],
    ["HLCUABC123456(主) 放行", "HPL"],
    ["HLCUABC123457(分)", "HPL"],
    ["HLCUABC123458 unknown note", "HPL"],
    ["1 * 40HC", "OOCL"]
  ]);
  assert.equal(result.items[0].number, "HLCUABC123456");
  assert.equal(result.items[0].type, "BILLOFLADING");
  assert.equal(result.items[1].number, "HLCUABC123457");
  assert.equal(result.errors.length, 2);
  assert.equal(result.rows[0].originalReference, "HLCUABC123456(主) 放行");
});
test("customers are never carried into unrelated rows; conflicting duplicates block", () => {
  const { result } = preview([
    ["BOOKING", "CARRIER", "Client Code", "POL"],
    ["COSU1234567890", "COSCO", "A", "SHANGHAI"],
    ["COSU1234567891", "COSCO", "", ""],
    ["COSU1234567890", "COSCO", "B", "NINGBO"]
  ]);
  assert.equal(result.items[1].importedDetails.clientNameCode, "");
  assert.equal(result.duplicates, 1);
  assert.equal(result.errors.filter((e) => e.code === "DUPLICATE_CONFLICT").length, 2);
});
test("merged continuation is not a task; genuine missing reference is reported at original row", () => {
  const { result } = preview(
    [
      ["title"],
      ["BOOKING", "CARRIER", "JOB NUMBER"],
      ["COSU1234567890", "COSCO", "JOB-01"],
      ["", "COSCO", ""],
      ["", "", "JOB-02"],
      [],
      ["TOTAL", "", ""]
    ],
    { "!merges": [{ s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }] }
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.skipped, 3);
  assert.deepEqual(
    result.errors.map((e) => [e.row, e.code]),
    [[5, "MISSING_REFERENCE"]]
  );
});
test("Excel numeric dates become ISO date-only without timezone conversion", () => {
  const { result } = preview(
    [
      ["BOOKING", "CARRIER", "ETD"],
      ["COSU1234567890", "COSCO", 46229]
    ],
    { C2: { t: "n", v: 46229, z: "d-mmm-yy" } }
  );
  assert.equal(result.items[0].importedDetails.estimatedDeparture, "2026-07-26");
});
test("formatted leading-zero identifiers retain zeros; unsafe numeric precision is blocked", () => {
  const { result } = preview(
    [
      ["BOOKING", "CARRIER"],
      [12345, "MSC"],
      [12345678901234568, "MSC"]
    ],
    { A2: { t: "n", v: 12345, z: "0000000000" }, A3: { t: "n", v: 12345678901234568 } }
  );
  assert.equal(result.items[0].number, "0000012345");
  assert.ok(result.errors.some((e) => e.code === "UNSAFE_REFERENCE"));
});
test("tracking result workbook locates fourth-row header and is explicitly rejected", () => {
  const { sheet, result } = preview([
    ["提单跟踪结果 · tracking.v1"],
    ["batch"],
    ["提单信息"],
    ["船司代码", "船司", "提交单号", "单号类型", "箱号", "ETD"],
    ["MSC", "MSC", "ABC123", "BL", "CONT123", 46229]
  ]);
  assert.equal(sheet.headerRow, 4);
  assert.equal(sheet.resultSheet, true);
  const selected = buildShipmentBatchPreview(sheet, 2);
  assert.ok(selected.errors.some((e) => e.code === "RESULT_WORKBOOK"));
  assert.equal(result.items.length, 0);
});
test("no reference column and cleared selection do not silently select column zero", () => {
  const sheet = prepareSheet("Unknown", [
    ["Job", "Amount"],
    ["JOB001", 5]
  ]);
  assert.equal(sheet.suggestedColumnIndex, null);
  assert.equal(buildShipmentBatchPreview(sheet, null).items.length, 0);
});

test("recognized carrier without a query adapter is distinguished from unidentified carrier", () => {
  const { result } = preview([
    ["BOOKING", "CARRIER"],
    ["TEST123456", "HMM"],
    ["TEST123457", "UNKNOWN"]
  ]);
  assert.deepEqual(
    result.errors.map((e) => e.code),
    ["CARRIER_NOT_CONFIGURED", "UNKNOWN_CARRIER"]
  );
  assert.equal(result.rows[0].carrier, "HMM");
  assert.equal(result.items.length, 0);
});

test("carrier result sheets without container columns remain blocked after manual column selection", () => {
  for (const carrier of ["COSCO", "HAPAG_LLOYD"]) {
    const { sheet } = preview([
      [carrier + " result"],
      ["船司代码", "提交单号", "单号类型", "运输状态", "查询方式"],
      [carrier, "SYNTHETIC123456", "BILL_OF_LADING", "UNKNOWN", "PAGE_TEXT"]
    ]);
    assert.equal(sheet.headerRow, 2);
    assert.equal(sheet.resultSheet, true);
    assert.ok(
      buildShipmentBatchPreview(sheet, 1, carrier).errors.some((e) => e.code === "RESULT_WORKBOOK")
    );
  }
});

test("adapter capabilities explicitly distinguish the old preview from the implemented local queue", () => {
  assert.equal(trackingCarriersForMode("LEGACY").length, 6);
  assert.equal(trackingCarriersForMode("LOCAL_QUEUE").length, 15);
  assert.equal(normalizeTrackingAdapterMode("unknown"), "LEGACY");
  assert.equal(supportsShipmentReference("HMM", "BILLOFLADING", "LEGACY"), false);
  assert.equal(supportsShipmentReference("HMM", "BILLOFLADING", "LOCAL_QUEUE"), true);
  assert.equal(supportsShipmentReference("COSCO", "BILLOFLADING", "LEGACY"), false);
  assert.equal(supportsShipmentReference("COSCO", "BILLOFLADING", "LOCAL_QUEUE"), true);
  assert.equal(supportsShipmentReference("CMA", "BILLOFLADING", "LOCAL_QUEUE"), false);
  assert.equal(supportsShipmentReference("CMA", "BOOKING", "LOCAL_QUEUE"), true);
  assert.equal(supportsShipmentReference("UNKNOWN", "BOOKING", "LOCAL_QUEUE"), false);
  assert.equal(supportsShipmentReference("HEDE", "BILLOFLADING", "LOCAL_QUEUE"), false);
});

test("local queue keeps source COSCO bills and canonical backend carrier codes", () => {
  const { sheet } = preview([
    operationalHeaders,
    ["JOB-001", "", "", "", "", "", "", "", "COSU0012345678", ""],
    ["JOB-002", "", "", "", "", "", "", "", "WHZTEST123456(主) 放行", "wanhai"],
    ["JOB-003", "", "", "", "", "", "", "", "HDMUTEST123456", "HMM"],
    ["JOB-004", "", "", "", "", "", "", "", "CMDUTEST123456", "CMA CGM"]
  ]);
  const local = buildShipmentBatchPreview(sheet, 8, "", "BOOKING", { adapterMode: "LOCAL_QUEUE" });
  assert.equal(local.errors.length, 0);
  assert.deepEqual(
    local.items.map((i) => [i.carrier, i.type, i.number]),
    [
      ["COSCO", "BILLOFLADING", "COSU0012345678"],
      ["WAN_HAI", "BILLOFLADING", "WHZTEST123456"],
      ["HMM", "BILLOFLADING", "HDMUTEST123456"],
      ["CMA", "BOOKING", "CMDUTEST123456"]
    ]
  );
  assert.equal(local.items[0].importedDetails.originalBillOfLading, "COSU0012345678");
  assert.deepEqual(local.rows[0].sourceReference, {
    raw: "COSU0012345678",
    normalized: "COSU0012345678",
    type: "BILLOFLADING",
    address: "I2"
  });
  assert.equal(local.rows[0].adapterMode, "LOCAL_QUEUE");
  const legacy = buildShipmentBatchPreview(sheet, 8, "", "BOOKING", { adapterMode: "LEGACY" });
  assert.equal(legacy.items[0].type, "BOOKING");
  assert.equal(legacy.items[0].number, "0012345678");
  assert.equal(legacy.errors.filter((e) => e.code === "CARRIER_NOT_CONFIGURED").length, 2);
});

test("local capability never bypasses unknown carrier, conflict, unsafe number or ambiguous reference type", () => {
  const { sheet } = preview([
    ["BOOKING", "CARRIER"],
    ["COSU1234567890", "COSCO"],
    ["TEST123456", "MYSTERY"],
    ["COSU1234567891", "MSC"],
    [12345678901234568, "MSC"]
  ]);
  const local = buildShipmentBatchPreview(sheet, 0, "", "BOOKING", { adapterMode: "LOCAL_QUEUE" });
  assert.equal(local.items.length, 0);
  assert.ok(local.errors.some((e) => e.code === "REFERENCE_TYPE_CONFLICT"));
  assert.ok(local.errors.some((e) => e.code === "UNKNOWN_CARRIER"));
  assert.ok(local.errors.some((e) => e.code === "CARRIER_CONFLICT"));
  assert.ok(local.errors.some((e) => e.code === "UNSAFE_REFERENCE"));
});

test("recognized HEDE stays blocked until a desktop adapter actually exists", () => {
  const { sheet } = preview([
    ["提单号", "CARRIER"],
    ["HDUJTEST123456", "HEDE"]
  ]);
  const result = buildShipmentBatchPreview(sheet, 0, "", "BILLOFLADING", {
    adapterMode: "LOCAL_QUEUE"
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.rows[0].carrier, "HEDE");
  assert.equal(result.errors[0].code, "CARRIER_NOT_CONFIGURED");
});

test("source review scope counts missing references and keeps explicit exclusions inside the first 60", () => {
  const rows = [
    ["BOOKING", "CARRIER", "JOB NUMBER"],
    ["COSU1234567890", "COSCO", "JOB-1"],
    ["", "COSCO", "MISSING-REF"],
    ...Array.from({ length: 63 }, (_, i) => ["COSU" + String(1234567891 + i), "COSCO", ""])
  ];
  const sheet = prepareSheet("SourceOrder", rows);
  const first = buildShipmentBatchReview(sheet, 0);
  assert.equal(first.totalCandidates, 65);
  assert.equal(first.windowCount, 60);
  assert.equal(first.outsideLimit, 5);
  assert.ok(first.errors.some((e) => e.row === 3 && e.code === "MISSING_REFERENCE"));
  assert.equal(first.rows[1].status, "BLOCKED");
  const approved = buildShipmentBatchReview(sheet, 0, "", "BOOKING", {
    excludedSourceRows: [3, 2]
  });
  assert.equal(approved.excludedCount, 2);
  assert.equal(approved.items.length, 58);
  assert.equal(approved.errors.length, 0);
  assert.equal(approved.items.at(-1).id, "SourceOrder-row-61");
  assert.equal(approved.rows[1].status, "EXCLUDED");
  assert.ok(approved.rows[1].errors.some((e) => e.code === "MISSING_REFERENCE"));
});

test("out-of-window duplicate conflicts do not pollute the reviewed task payload", () => {
  const sheet = prepareSheet("DuplicateWindow", [
    ["BOOKING", "CARRIER", "POL"],
    ...Array.from({ length: 60 }, (_, i) => [
      "COSU" + String(1234567890 + i),
      "COSCO",
      "SOURCE PORT"
    ]),
    ["COSU1234567890", "COSCO", "CONFLICTING PORT"]
  ]);
  const review = buildShipmentBatchReview(sheet, 0);
  assert.equal(review.totalCandidates, 61);
  assert.equal(review.items.length, 60);
  assert.equal(review.errors.length, 0);
  assert.equal(review.items[0].importedDetails.portOfLoading, "SOURCE PORT");
});

test("cargo files cannot become tracking tasks by manually selecting an arbitrary numeric column", () => {
  const sheet = prepareSheet("Cargo", [
    ["SKU", "Quantity", "Length", "Width", "Height"],
    ["SKU12345", 2, 120, 80, 90]
  ]);
  const review = buildShipmentBatchReview(sheet, 0, "COSCO");
  assert.equal(review.items.length, 0);
  assert.ok(review.errors.some((e) => e.code === "UNRECOGNIZED_TASK_SHEET"));
});

test("downloaded task template is UTF-8 BOM headers only and produces no query tasks", () => {
  const contents = readFileSync(new URL("../public/tracking-task-example.csv", import.meta.url));
  assert.equal(contents.subarray(0, 3).toString("hex"), "efbbbf");
  assert.equal(
    contents.toString("utf8").trim(),
    "\uFEFF船司,提单号,货代订单号,发票号,原ETD,现ETD,原ETA,现ETA,箱量,船名航次".trim()
  );
  const workbook = XLSX.read(contents, { type: "buffer" });
  const sheet = parseShipmentBatchWorkbook(workbook, XLSX)[0];
  assert.equal(sheet.suggestedColumnIndex, 1);
  const review = buildShipmentBatchReview(sheet, sheet.suggestedColumnIndex);
  assert.equal(review.items.length, 0);
  assert.equal(review.totalCandidates, 0);
  assert.equal(review.errors.length, 0);
  const filled = prepareSheet("Template", [
    sheet.headers,
    ["COSCO", "COSU1234567890", "JOB-01", "INV-01"]
  ]);
  const filledReview = buildShipmentBatchReview(filled, 1, "", "BILLOFLADING", {
    adapterMode: "LOCAL_QUEUE"
  });
  assert.equal(filledReview.items.length, 1);
  assert.equal(filledReview.items[0].carrier, "COSCO");
  assert.equal(filledReview.items[0].importedDetails.forwarderJobNumber, "JOB-01");
});
