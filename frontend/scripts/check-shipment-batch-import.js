import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { buildShipmentBatchItems, prepareSheet } from "../src/services/shipmentBatchImport.js";
import {
  buildManualShipmentImportResultWorkbook,
  buildManualShipmentImportTemplate,
  parseManualShipmentImportWorkbook
} from "../src/services/manualShipmentExcelImport.js";

const headers = ["JOB NUMBER", "VESSEL /VOY", "BOOKING NO.", "POL", "POD", "PO NO.", "ETD", "ETA", "", "Client Code", "MB/L NO."];
const bookingNumbers = Array.from({ length: 35 }, (_, index) => `BK${String(6502406170 + index)}`);
const rows = [headers, ...bookingNumbers.map((bookingNumber, index) => [
  `LJSH${26060000 + index}`,
  `VESSEL ${index + 1}E`,
  bookingNumber,
  "SHANGHAI",
  "LONG BEACH",
  `HW2026${String(index).padStart(5, "0")}`,
  "2026-07-01",
  "2026-07-16",
  index === 0 ? "VOLUME" : "2*40HC",
  index === 0 ? "Hayden US" : "",
  index < 30 ? `COSU${String(6502406170 + index)}` : ""
])];

const sheet = prepareSheet("Sheet1", rows);
assert.equal(sheet.suggestedColumnIndex, 2);
assert.equal(sheet.columns[8].label, "VOLUME");
assert.equal(sheet.previewRows.length, 9);

const items = buildShipmentBatchItems(sheet, 2);
assert.equal(items.length, 35);
assert.equal(items.filter((item) => !item.manualOnly).length, 35);
assert.equal(items.filter((item) => item.manualOnly).length, 0);
assert.ok(items.every((item) => item.type === "BOOKING"));
assert.deepEqual(items.map((item) => item.number), bookingNumbers);
assert.ok(items.every((item) => item.importedDetails.clientNameCode === "Hayden US"));
assert.equal(items[0].importedDetails.volume, "");
assert.equal(items[1].importedDetails.volume, "2*40HC");
assert.equal(items[0].importedDetails.originalBillOfLading, "COSU6502406170");

const completeTemplate = buildManualShipmentImportTemplate(XLSX);
assert.deepEqual(completeTemplate.SheetNames, [
  "填写说明",
  "票单主表",
  "中转港",
  "分段运输",
  "箱型数量",
  "箱级详情"
]);
const completeImport = parseManualShipmentImportWorkbook(completeTemplate, XLSX);
assert.equal(completeImport.total, 1);
assert.equal(completeImport.valid, 1);
assert.equal(completeImport.invalid, 0);
assert.equal(completeImport.items[0].payload.routeNodes.length, 5);
assert.equal(completeImport.items[0].payload.routeNodes[2].locationType, "TSP");
assert.equal(completeImport.items[0].payload.routingLegs[0].mode, "SEA");
assert.deepEqual(completeImport.items[0].payload.containerTypes, [{ type: "40HQ", quantity: 2 }]);
assert.equal(completeImport.items[0].payload.containers[0].number, "TEMU6003424");
assert.deepEqual(completeImport.items[0].payload.serviceScopes, ["OCEAN", "INLAND"]);

const cosuCompleteTemplate = buildManualShipmentImportTemplate(XLSX);
const cosuMainSheet = cosuCompleteTemplate.Sheets[cosuCompleteTemplate.SheetNames[1]];
cosuMainSheet.C2 = { t: "s", v: "COSU6508205930" };
const cosuCompleteImport = parseManualShipmentImportWorkbook(cosuCompleteTemplate, XLSX);
assert.equal(cosuCompleteImport.valid, 1);
assert.equal(cosuCompleteImport.items[0].referenceType, "BOOKING");
assert.equal(cosuCompleteImport.items[0].referenceNo, "6508205930");
assert.equal(cosuCompleteImport.items[0].payload.bookingNumber, "6508205930");

const legacyTrackingWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  legacyTrackingWorkbook,
  XLSX.utils.aoa_to_sheet([
    ["JOB NUMBER", "VESSEL /VOY", "MB/L NO.", "POL", "POD", "PO NO.", "ETD", "ETA", "", "Client Code"],
    ["LJSH26060011", "OOCL BRUSSELS 070E", "COSU6503686790", "SHANGHAI", "LONG BEACH", "HW202600063", "2026-06-22", "2026-07-06", "2*40FQ", "Hayden US"]
  ]),
  "HAYDEN"
);
const legacyTrackingImport = parseManualShipmentImportWorkbook(legacyTrackingWorkbook, XLSX);
assert.equal(legacyTrackingImport.total, 1);
assert.equal(legacyTrackingImport.valid, 1);
assert.equal(legacyTrackingImport.items[0].referenceNo, "6503686790");
assert.equal(legacyTrackingImport.items[0].payload.billOfLading, "COSU6503686790");
assert.deepEqual(legacyTrackingImport.items[0].payload.containerTypes, [{ type: "40FQ", quantity: 2 }]);
assert.equal(legacyTrackingImport.items[0].payload.routeNodes.length, 4);

const invalidTemplate = buildManualShipmentImportTemplate(XLSX);
invalidTemplate.Sheets["箱型数量"] = XLSX.utils.aoa_to_sheet([
  ["导入编号*", "箱型*", "数量*"]
]);
const invalidImport = parseManualShipmentImportWorkbook(invalidTemplate, XLSX);
assert.equal(invalidImport.valid, 0);
assert.equal(invalidImport.invalid, 1);
assert.match(invalidImport.rows[0].errors.join(" "), /至少需要一种箱型和数量/);

const resultWorkbook = buildManualShipmentImportResultWorkbook([
  {
    importKey: "SHIP-001",
    carrier: "COSCO",
    referenceType: "BOOKING",
    referenceNo: "6508205930",
    status: "CREATED",
    message: "Created"
  }
], XLSX);
assert.deepEqual(resultWorkbook.SheetNames, ["导入结果"]);

const punctuationSheet = prepareSheet("Manual", [
  ["BOOKING NO."],
  ["ABC/123.45 manual note"]
]);
const punctuationItems = buildShipmentBatchItems(punctuationSheet, 0);
assert.equal(punctuationItems.length, 1);
assert.equal(punctuationItems[0].number, "ABC/123.45");
assert.equal(punctuationItems[0].manualOnly, false);
assert.equal(punctuationItems[0].type, "BOOKING");

const cosuBookingSheet = prepareSheet("COSU", [
  ["BOOKING NO."],
  ["COSU 6502406170"]
]);
const cosuBookingItems = buildShipmentBatchItems(cosuBookingSheet, 0);
assert.equal(cosuBookingItems.length, 1);
assert.equal(cosuBookingItems[0].carrier, "COSCO");
assert.equal(cosuBookingItems[0].type, "BOOKING");
assert.equal(cosuBookingItems[0].number, "6502406170");

const duplicateBookingSheet = prepareSheet("Duplicates", [
  ["BOOKING NO.", "JOB NUMBER", "POL"],
  ["6502406170", "JOB-001", ""],
  ["COSU6502406170", "", "SHANGHAI"]
]);
const duplicateBookingItems = buildShipmentBatchItems(duplicateBookingSheet, 0);
assert.equal(duplicateBookingItems.length, 1);
assert.equal(duplicateBookingItems[0].number, "6502406170");
assert.equal(duplicateBookingItems[0].importedDetails.forwarderJobNumber, "JOB-001");
assert.equal(duplicateBookingItems[0].importedDetails.portOfLoading, "SHANGHAI");

const businessCustomerPage = readFileSync(
  new URL("../src/components/BusinessCustomerPage.vue", import.meta.url),
  "utf8"
);
const businessCustomerApi = readFileSync(
  new URL("../src/services/businessCustomerApi.js", import.meta.url),
  "utf8"
);
assert.match(businessCustomerApi, /request\(`\/business\/shipments\?\$\{query\}`\)/);
assert.match(businessCustomerApi, /request\(`\/business\/shipments\/\$\{encodeURIComponent\(shipmentId\)\}`\)/);
assert.match(
  businessCustomerApi,
  /request\("\/business\/customers\/shipments", \{\s*method: "POST",\s*body: \{ customerId, publishToCustomer, shipment: payload, overwriteExisting \}\s*\}\)/
);
assert.match(
  businessCustomerApi,
  /request\("\/business\/customers\/shipments\/import-conflicts"/
);
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

const manualCreateDialogSource = businessCustomerPage.slice(
  businessCustomerPage.indexOf('v-if="shipmentCreateDialogOpen"'),
  businessCustomerPage.indexOf('<div v-if="toastMessage"')
);
assert.doesNotMatch(
  manualCreateDialogSource,
  /@click\.self="shipmentCreateDialogOpen = false"/
);
assert.match(manualCreateDialogSource, /@keydown\.esc\.stop\.prevent/);
assert.match(manualCreateDialogSource, /v-for="\(node, index\) in shipmentCreateForm\.routeNodes"/);
assert.match(manualCreateDialogSource, /:required="node\.required"/);
assert.match(manualCreateDialogSource, /shipmentCreateForm\.containerTypes/);
assert.match(manualCreateDialogSource, /shipmentCreateForm\.routingLegs/);
assert.match(manualCreateDialogSource, /shipmentCreateForm\.containers/);

const manualCreateSource = businessCustomerPage.slice(
  businessCustomerPage.indexOf("function buildManualShipmentPayload"),
  businessCustomerPage.indexOf("async function saveManualSnapshot")
);
assert.match(manualCreateSource, /trackingStatus: form\.latestEventName/);
assert.match(manualCreateSource, /routeNodes,/);
assert.match(manualCreateSource, /routingLegs,/);
assert.match(manualCreateSource, /containerTypes,/);
assert.match(manualCreateSource, /containers/);
assert.match(
  manualCreateSource,
  /prepareShipmentOverwriteReview\(\[payload\]\)[\s\S]*?createBusinessShipment\([\s\S]*?overwriteReview\.existingIdentities\.has/
);
assert.match(businessCustomerPage, /@click="openShipmentExcelImport"/);
assert.match(businessCustomerPage, /v-if="shipmentExcelImportDialogOpen"/);
assert.match(businessCustomerPage, /downloadShipmentExcelTemplate/);
assert.match(businessCustomerPage, /parseManualShipmentImportWorkbook/);
assert.match(
  businessCustomerPage,
  /prepareShipmentOverwriteReview\([\s\S]*?allItems\.map\(\(item\) => item\.payload\)[\s\S]*?const workItems = allItems[\s\S]*?const response = await createBusinessShipment\([\s\S]*?overwriteReview\.action === "OVERWRITE_EXISTING"/
);
assert.match(businessCustomerPage, /response\?\.overwritten === true/);
assert.match(businessCustomerPage, /status: overwritten \? "UPDATED" : "CREATED"/);
assert.match(businessCustomerPage, /allowSkipExisting: true/);
assert.match(businessCustomerPage, /action: "SKIP_EXISTING"/);
assert.match(businessCustomerPage, /action: "OVERWRITE_EXISTING"/);
assert.match(businessCustomerPage, /status: wasSkipped \? "SKIPPED" : "PENDING"/);
assert.match(businessCustomerPage, /importSkippedExisting/);
assert.match(businessCustomerPage, /shipmentExcelImportResults/);
const shipmentTableSource = businessCustomerPage.slice(
  businessCustomerPage.indexOf('ref="shipmentTableRef"'),
  businessCustomerPage.indexOf("</el-table>", businessCustomerPage.indexOf('ref="shipmentTableRef"'))
);
assert.match(shipmentTableSource, /type="index"[^>]*width="70"/);
assert.match(shipmentTableSource, /customers\.shipmentStatus[^>]*min-width="205"/);
assert.match(shipmentTableSource, /customers\.remark[^>]*width="200"/);
assert.match(shipmentTableSource, /customers\.lastTrackedAt[^>]*width="164"/);
assert.match(shipmentTableSource, /shipmentBusinessStateLabel\(row\)/);
assert.doesNotMatch(shipmentTableSource, /row\.lastTrackedAt \|\| row\.updatedAt/);
assert.match(businessCustomerPage, /confirmExistingBatchBookings\(batchTrackItems\.value\)/);
assert.match(businessCustomerPage, /customers\.elapsedUnderSecond/);

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
