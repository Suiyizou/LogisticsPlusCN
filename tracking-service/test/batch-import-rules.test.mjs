import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchPreview,
  collectBatchItems,
  findBatchColumns,
  normalizeShipmentCandidate,
  selectBatchColumn
} from "../public/batch-import-rules.mjs";

test("parses mixed Hayden rows, strips COSU, and keeps non-COSU bills for manual entry", () => {
  const rows = [
    ["JOB NUMBER", "VESSEL /VOY", "M/B/L NO.", "POL", "POD", "PO NO.", "ETD", "ETA", "", "Client Code"],
    ["JSH2606018", "CZ5221 22059.74-100", "784-84422343 空运", "SHA", "IAH", "HW202600059", "6-Jun-26", "11-Jun-26", "VOLUME", "Hayden US"],
    ["JSH2606003", "COSCO EUROPE 113E-44", "COSU6502406170", "SHA", "LONG BEACH", "HW202600057-2", "7-Jun-26", "22-Jun-26", "4*40HC", ""],
    ["JSH2606020", "OTHER VESSEL 100E", "SMLMSHZY5B667700", "SHA", "NORFOLK", "HW202600061", "8-Jun-26", "25-Jun-26", "1*40HC", ""],
    ["JSH2606021", "UNKNOWN", "6506041590", "SHA", "NORFOLK", "HW202600062", "9-Jun-26", "26-Jun-26", "2*40HC", ""]
  ];
  const header = findBatchColumns(rows);
  assert.equal(header.queryColumns.length, 1);
  assert.equal(header.queryColumns[0].columnIndex, 2);
  const items = [...collectBatchItems(rows, header).values()];
  const item = items.find((candidate) => candidate.number === "6502406170");
  const airWaybill = items.find((candidate) => candidate.number === "784-84422343");
  const unknownCarrier = items.find((candidate) => candidate.number === "SMLMSHZY5B667700");
  const bareNumber = items.find((candidate) => candidate.number === "6506041590");

  assert.equal(item.carrier, "COSCO");
  assert.equal(item.number, "6502406170");
  assert.equal(item.displayNumber, "COSU6502406170");
  assert.equal(item.status, "pending");
  assert.equal(item.manualOnly, false);
  assert.deepEqual(item.importedDetails, {
    forwarderJobNumber: "JSH2606003",
    vesselVoyage: "COSCO EUROPE 113E-44",
    portOfLoading: "SHA",
    portOfDischarge: "LONG BEACH",
    clientPoNumber: "HW202600057-2",
    estimatedDeparture: "7-Jun-26",
    estimatedArrival: "22-Jun-26",
    volume: "4*40HC",
    clientNameCode: "Hayden US",
    carrierPrefix: "COSU",
    originalBillOfLading: "COSU6502406170"
  });
  assert.deepEqual(
    {
      carrier: unknownCarrier.carrier,
      number: unknownCarrier.number,
      displayNumber: unknownCarrier.displayNumber,
      status: unknownCarrier.status,
      manualOnly: unknownCarrier.manualOnly,
      source: unknownCarrier.source,
      error: unknownCarrier.error
    },
    {
      carrier: null,
      number: "SMLMSHZY5B667700",
      displayNumber: "SMLMSHZY5B667700",
      status: "manual",
      manualOnly: true,
      source: "manual",
      error: null
    }
  );
  assert.equal(bareNumber.number, "6506041590");
  assert.equal(bareNumber.status, "manual");
  assert.equal(bareNumber.manualOnly, true);
  assert.equal(airWaybill.status, "manual");
  assert.match(airWaybill.displayNumber, /784-84422343/);
  assert.equal(airWaybill.importedDetails.originalBillOfLading, "784-84422343");
  assert.equal(items.every((candidate) => candidate.importedDetails.clientNameCode === "Hayden US"), true);
});

test("keeps an unknown carrier prefix but does not send it to COSCO", () => {
  const candidate = normalizeShipmentCandidate("BILLOFLADING", "SMLMSHZY5B667700");
  assert.equal(candidate.carrier, null);
  assert.equal(candidate.carrierPrefix, "SMLM");
  assert.equal(candidate.number, "SMLMSHZY5B667700");
  assert.equal(candidate.manualOnly, true);
  assert.equal(candidate.unsupportedCarrierPrefix, true);
});

test("keeps punctuation in unsupported manual references without querying COSCO", () => {
  const candidate = normalizeShipmentCandidate(
    "BILLOFLADING",
    "ABC/123.45 manual note"
  );
  assert.equal(candidate.number, "ABC/123.45");
  assert.equal(candidate.originalBillOfLading, "ABC/123.45");
  assert.equal(candidate.manualOnly, true);
  assert.equal(candidate.carrier, null);
});

test("selects the COSU-bearing bill column instead of the first recognized column", () => {
  const rows = [
    ["Booking No.", "JOB NUMBER", "M/B/L NO.", "POD"],
    ["LJSH2606018", "JOB-18", "COSU6502406170", "LONG BEACH"],
    ["LJSH2606019", "JOB-19", "CMDUTJN0940917", "SAVANNAH"]
  ];
  const header = findBatchColumns(rows);
  assert.equal(header.queryColumns[0].columnIndex, 2);
  const items = [...collectBatchItems(rows, header).values()];
  assert.deepEqual(items.map((item) => item.displayNumber), [
    "COSU6502406170",
    "CMDUTJN0940917"
  ]);
  assert.equal(items[1].carrier, "CMA");
  assert.equal(items[1].status, "manual");
  assert.equal(items[1].manualOnly, true);
});

test("infers a COSU column from data but never falls back to column zero", () => {
  const rows = [
    ["JOB NUMBER", "Carrier reference", "Remark"],
    ["JSH2606003", "COSU6502406170", "ready"]
  ];
  const inferred = findBatchColumns(rows);
  assert.equal(inferred.queryColumns[0].columnIndex, 1);
  assert.equal(inferred.queryColumns[0].inferred, true);
  assert.equal(findBatchColumns([["JOB NUMBER", "Remark"], ["JSH2606003", "ready"]]), null);
});

test("builds an A1:J36 Hayden preview and retains 30 COSU plus 5 manual tickets", () => {
  const header = [
    "JOB NUMBER", "VESSEL /VOY", "M/B/L NO.", "POL", "POD",
    "PO NO.", "ETD", "ETA", "VOLUME", "Client Code"
  ];
  const shipmentNumbers = [
    ...Array.from({ length: 30 }, (_, index) => `COSU${6502406170 + index}`),
    "784-84422343 空运",
    "SMLMSHZY5B667700 -船东SML",
    "SHFO6C125200",
    "784-84594366 BY AIR",
    "CPJQTA45TACHOU09\n集港编号 GANG-001"
  ];
  const rows = [
    header,
    ...shipmentNumbers.map((shipmentNumber, index) => [
      `JSH2606${String(index + 1).padStart(3, "0")}`,
      `COSCO VESSEL ${index + 1}E`,
      shipmentNumber,
      "SHA",
      "NORFOLK",
      `HW2026${String(index + 1).padStart(5, "0")}`,
      "7-Jun-26",
      "22-Jun-26",
      "1*40HC",
      index === 0 ? "Hayden US" : ""
    ])
  ];
  const preview = buildBatchPreview(rows);
  assert.equal(rows.length, 36);
  assert.equal(preview.headerRowIndex, 0);
  assert.equal(preview.columns.length, 10);
  assert.deepEqual(preview.columns[2], {
    index: 2,
    label: "M/B/L NO.",
    type: "BILLOFLADING",
    suggestedType: "BILLOFLADING"
  });
  assert.equal(preview.suggestedColumnIndex, 2);
  assert.equal(preview.suggestedType, "BILLOFLADING");
  assert.equal(preview.previewRows.length, 8);
  assert.equal(preview.previewRows[0].rowIndex, 0);
  assert.equal(preview.previewRows[0].values[2], "M/B/L NO.");

  const items = [...collectBatchItems(rows, findBatchColumns(rows)).values()];
  assert.equal(items.length, 35);
  assert.equal(items.filter((item) => item.status === "pending").length, 30);
  assert.equal(items.filter((item) => item.status === "manual").length, 5);
  assert.deepEqual(
    items.filter((item) => item.status === "manual").map((item) => item.number),
    ["784-84422343", "SMLMSHZY5B667700", "SHFO6C125200", "784-84594366", "CPJQTA45TACHOU09"]
  );
  assert.match(
    items.find((item) => item.number === "CPJQTA45TACHOU09").displayNumber,
    /集港编号 GANG-001/
  );
  assert.equal(
    items.find((item) => item.number === "CPJQTA45TACHOU09")
      .importedDetails.originalBillOfLading,
    "CPJQTA45TACHOU09"
  );
  assert.equal(items.every((item) => item.importedDetails.clientNameCode === "Hayden US"), true);
});

test("explicit sheet-column selection overrides the automatic recommendation and preserves its type", () => {
  const rows = [
    ["Booking No.", "JOB NUMBER", "M/B/L NO.", "POD"],
    ["BOOKING-001", "JOB-18", "COSU6502406170", "LONG BEACH"],
    ["BOOKING-002", "JOB-19", "COSU6502406171", "SAVANNAH"]
  ];
  assert.equal(findBatchColumns(rows).queryColumns[0].columnIndex, 2);

  const bookingHeader = selectBatchColumn(rows, {
    headerRowIndex: 0,
    columnIndex: 0,
    type: "BOOKING"
  });
  const bookings = [...collectBatchItems(rows, bookingHeader).values()];
  assert.deepEqual(bookings.map((item) => item.displayNumber), ["BOOKING-001", "BOOKING-002"]);
  assert.equal(bookings.every((item) => item.type === "BOOKING"), true);
  assert.equal(bookings[0].importedDetails.forwarderJobNumber, "JOB-18");
  assert.equal(bookings[0].importedDetails.portOfDischarge, "LONG BEACH");

  const forcedBookingHeader = selectBatchColumn(rows, {
    headerRowIndex: 0,
    columnIndex: 2,
    type: "BOOKING"
  });
  const [forcedBooking] = [...collectBatchItems(rows, forcedBookingHeader).values()];
  assert.equal(forcedBooking.type, "BOOKING");
  assert.equal(forcedBooking.number, "6502406170");
  assert.equal(forcedBooking.status, "pending");
});

test("keeps annotated air waybills as manual-only imported tickets", () => {
  const chineseAnnotation = normalizeShipmentCandidate("BILLOFLADING", "784-84422343 空运");
  const englishAnnotation = normalizeShipmentCandidate("BILLOFLADING", "784-84594366 BY AIR");
  assert.equal(chineseAnnotation.number, "784-84422343");
  assert.equal(chineseAnnotation.manualOnly, true);
  assert.equal(englishAnnotation.number, "784-84594366");
  assert.equal(englishAnnotation.manualOnly, true);
});
