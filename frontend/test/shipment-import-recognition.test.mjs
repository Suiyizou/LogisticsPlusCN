import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  prepareSheet,
  parseShipmentBatchWorkbook,
  buildShipmentBatchPreview
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
