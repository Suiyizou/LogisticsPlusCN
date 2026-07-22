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
const businessCustomerApi = readFileSync(
  new URL("../src/services/businessCustomerApi.js", import.meta.url),
  "utf8"
);
assert.match(businessCustomerApi, /request\("\/business\/shipments"\)/);
assert.match(businessCustomerApi, /request\(`\/business\/shipments\/\$\{encodeURIComponent\(shipmentId\)\}`\)/);
assert.match(businessCustomerApi, /request\("\/business\/shipments\/batch-refresh"/);
assert.doesNotMatch(businessCustomerApi, /business\/customers\/available-shipments/);
assert.doesNotMatch(businessCustomerApi, /business\/customers\/shipments\/\$\{encodeURIComponent\(shipmentId\)\}\/snapshot/);
assert.match(
  businessCustomerPage,
  /batchTrackCancelRequested\.value = true;[\s\S]*?if \(!batchTrackTaskId\.value\) return;/
);
assert.match(
  businessCustomerPage,
  /if \(batchTrackCancelRequested\.value && task\.taskId\)[\s\S]*?cancelShipmentBatchTask\(task\.taskId\)/
);
assert.match(businessCustomerPage, /v-model="batchTrackDialogOpen"/);
assert.match(businessCustomerPage, /batchTrackDialogOpen = false/);
assert.doesNotMatch(businessCustomerPage, /@(?:close|closed)="cancelBatchTrack"/);
assert.doesNotMatch(businessCustomerPage, /function viewShipmentDetail/);
assert.doesNotMatch(businessCustomerPage, /<el-tag v-if="row\.note"/);
assert.match(businessCustomerPage, /customers\.batchTrackStopConfirm/);
assert.match(businessCustomerPage, /status === "RETRY_WAIT"/);
assert.match(businessCustomerPage, /v-show="!batchTrackRunning" class="batch-track-form"/);
assert.match(businessCustomerPage, /customers\.batchTrackAllTasks/);
assert.match(businessCustomerPage, /batch-track-result-index/);
assert.match(businessCustomerPage, /customers\.batchRefreshSelected/);
assert.match(
  businessCustomerPage,
  /selectedShipmentRows\.value\.map[\s\S]*?createShipmentBatchRefreshTask\(shipmentIds, shipmentTrackingChannel\.value\)/
);
assert.doesNotMatch(businessCustomerPage, /includeContainerDetails/);
const listRefreshSource = businessCustomerPage.slice(
  businessCustomerPage.indexOf("async function updateShipmentTracking"),
  businessCustomerPage.indexOf("function trackShipmentInWorkspace")
);
assert.match(listRefreshSource, /forceRefresh: true/);
assert.match(listRefreshSource, /data\?\.cacheSource === "MYSQL_STALE" \|\| data\?\.warning/);

const manualSaveSource = businessCustomerPage.slice(
  businessCustomerPage.indexOf("async function saveManualSnapshot"),
  businessCustomerPage.indexOf("function emptyManualShipmentFields")
);
const manualRequestSource = manualSaveSource.slice(
  manualSaveSource.indexOf("updateBusinessShipmentManualSnapshot"),
  manualSaveSource.indexOf("\n    );", manualSaveSource.indexOf("updateBusinessShipmentManualSnapshot"))
);
assert.match(manualRequestSource, /trackingStatus: detailForm\.trackingStatus/);
assert.doesNotMatch(manualRequestSource, /note: detailForm\.note/);
assert.doesNotMatch(manualRequestSource, /referenceNo: detailForm\.referenceNo/);
assert.match(manualSaveSource, /Object\.assign\(detailForm, unsavedTicketFields\)/);

const shipmentSaveSource = businessCustomerPage.slice(
  businessCustomerPage.indexOf("async function saveShipmentDetail"),
  businessCustomerPage.indexOf("async function refreshShipmentFromCarrier")
);
const shipmentRequestSource = shipmentSaveSource.slice(
  shipmentSaveSource.indexOf("updateBusinessShipment"),
  shipmentSaveSource.indexOf("\n    });", shipmentSaveSource.indexOf("updateBusinessShipment"))
);
assert.match(shipmentRequestSource, /referenceNo: detailForm\.referenceNo/);
assert.match(shipmentRequestSource, /note: detailForm\.note/);
assert.doesNotMatch(shipmentRequestSource, /trackingStatus: detailForm\.trackingStatus/);
assert.match(shipmentSaveSource, /Object\.assign\(detailForm, unsavedManualFields\)/);

console.log("shipment batch import checks passed");
