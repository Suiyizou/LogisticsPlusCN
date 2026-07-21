import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShipmentBatchItems, prepareSheet } from "../src/services/shipmentBatchImport.js";

const headers = ["JOB NUMBER", "VESSEL /VOY", "MB/L NO.", "POL", "POD", "PO NO.", "ETD", "ETA", "", "Client Code"];
const cosuNumbers = Array.from({ length: 30 }, (_, index) => `COSU${String(6502406170 + index)}`);
const manualNumbers = [
  "784-84422343 \u7a7a\u8fd0",
  "SMLMSHZY5B667700 -\u8239\u4e1cSML",
  "SHFO6C125200",
  "784-84594366 BY AIR",
  "CPJQTA45TACHOU09\n\u96c6\u6e2f\u7f16\u53f7SIS2607045"
];
const references = [
  manualNumbers[0],
  ...cosuNumbers.slice(0, 4),
  manualNumbers[1],
  ...cosuNumbers.slice(4, 10),
  manualNumbers[2],
  manualNumbers[3],
  ...cosuNumbers.slice(10),
  manualNumbers[4]
];
const rows = [headers, ...references.map((reference, index) => [
  `LJSH${26060000 + index}`,
  `VESSEL ${index + 1}E`,
  reference,
  "SHANGHAI",
  "LONG BEACH",
  `HW2026${String(index).padStart(5, "0")}`,
  "2026-07-01",
  "2026-07-16",
  index === 0 ? "VOLUME" : "2*40HC",
  index === 0 ? "Hayden US" : ""
])];

const sheet = prepareSheet("Sheet1", rows);
assert.equal(sheet.suggestedColumnIndex, 2);
assert.equal(sheet.columns[8].label, "VOLUME");
assert.equal(sheet.previewRows.length, 9);

const items = buildShipmentBatchItems(sheet, 2);
assert.equal(items.length, 35);
assert.equal(items.filter((item) => !item.manualOnly).length, 30);
assert.equal(items.filter((item) => item.manualOnly).length, 5);
assert.ok(items.filter((item) => !item.manualOnly).every((item) => /^\d+$/.test(item.number)));
assert.ok(items.every((item) => item.importedDetails.clientNameCode === "Hayden US"));
assert.equal(items[0].importedDetails.volume, "");
assert.equal(items[1].importedDetails.volume, "2*40HC");
assert.deepEqual(items.filter((item) => item.manualOnly).map((item) => item.number), [
  "784-84422343",
  "SMLMSHZY5B667700",
  "SHFO6C125200",
  "784-84594366",
  "CPJQTA45TACHOU09"
]);

const punctuationSheet = prepareSheet("Manual", [
  ["MB/L NO."],
  ["ABC/123.45 manual note"]
]);
const punctuationItems = buildShipmentBatchItems(punctuationSheet, 0);
assert.equal(punctuationItems.length, 1);
assert.equal(punctuationItems[0].number, "ABC/123.45");
assert.equal(punctuationItems[0].manualOnly, true);

const businessCustomerPage = readFileSync(
  new URL("../src/components/BusinessCustomerPage.vue", import.meta.url),
  "utf8"
);
assert.match(
  businessCustomerPage,
  /batchTrackCancelRequested\.value = true;[\s\S]*?if \(!batchTrackTaskId\.value\) return;/
);
assert.match(
  businessCustomerPage,
  /if \(batchTrackCancelRequested\.value && task\.taskId\)[\s\S]*?cancelShipmentBatchTask\(task\.taskId\)/
);

console.log("shipment batch import checks passed");
