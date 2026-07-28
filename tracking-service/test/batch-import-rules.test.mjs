import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchPreview,
  collectBatchItems,
  findBatchColumns,
  normalizeShipmentCandidate,
  selectBatchColumn
} from "../public/batch-import-rules.mjs";

test("selects the booking column and keeps the bill of lading as supplementary data", () => {
  const rows = [
    ["Booking No.", "M/B/L NO.", "JOB NUMBER", "POD", "Client Code"],
    ["BOOKING-001", "COSU6502406170", "JOB-01", "LONG BEACH", "Hayden US"],
    ["BOOKING-002", "", "JOB-02", "SAVANNAH", ""]
  ];

  const header = findBatchColumns(rows);
  assert.ok(header);
  assert.deepEqual(header.queryColumns, [{
    columnIndex: 0,
    type: "BOOKING",
    inferred: false,
    cosuCount: 0
  }]);

  const items = [...collectBatchItems(rows, header).values()];
  assert.deepEqual(items.map((item) => item.number), ["BOOKING-001", "BOOKING-002"]);
  assert.equal(items.every((item) => item.type === "BOOKING"), true);
  assert.equal(items[0].importedDetails.originalBillOfLading, "COSU6502406170");
  assert.equal(items[0].importedDetails.forwarderJobNumber, "JOB-01");
  assert.equal(items[0].importedDetails.clientNameCode, "Hayden US");
  assert.equal(items[1].importedDetails.clientNameCode, "Hayden US");
});

test("never recommends a bill-of-lading-only column as a shipment identity", () => {
  const rows = [
    ["M/B/L NO.", "JOB NUMBER"],
    ["COSU6502406170", "JOB-01"]
  ];

  assert.equal(findBatchColumns(rows), null);
  const preview = buildBatchPreview(rows);
  assert.equal(preview.suggestedColumnIndex, null);
  assert.equal(preview.suggestedType, "BOOKING");
  assert.equal(preview.columns[0].type, null);
});

test("normalizes booking candidates without deriving a bill identity", () => {
  const candidate = normalizeShipmentCandidate("BOOKING", " TJN0940917 booking ");
  assert.deepEqual(candidate, {
    carrier: null,
    carrierPrefix: null,
    type: "BOOKING",
    number: "TJN0940917",
    originalBillOfLading: null,
    displayNumber: "TJN0940917 booking",
    manualOnly: true,
    unsupportedCarrierPrefix: false
  });
  assert.equal(
    normalizeShipmentCandidate("BILLOFLADING", "COSU6502406170"),
    null
  );
});

test("recognizes a COSU-prefixed booking and queries only its numeric suffix", () => {
  const candidate = normalizeShipmentCandidate(
    "BOOKING",
    " COSU 6502406170 "
  );
  assert.deepEqual(candidate, {
    carrier: "COSCO",
    carrierPrefix: "COSU",
    type: "BOOKING",
    number: "6502406170",
    originalBillOfLading: null,
    displayNumber: "COSU 6502406170",
    manualOnly: false,
    unsupportedCarrierPrefix: false
  });
});

test("manual column selection is fixed to booking numbers", () => {
  const rows = [
    ["Reference", "Job"],
    ["BOOKING-001", "JOB-01"]
  ];

  const selected = selectBatchColumn(rows, {
    headerRowIndex: 0,
    columnIndex: 0,
    type: "BOOKING"
  });
  assert.equal(selected.queryColumns[0].type, "BOOKING");
  assert.throws(
    () => selectBatchColumn(rows, {
      headerRowIndex: 0,
      columnIndex: 0,
      type: "BILLOFLADING"
    }),
    /must be BOOKING/
  );
});

test("deduplicates repeated booking rows while retaining punctuation", () => {
  const rows = [
    ["订舱号", "提单号"],
    ["ABC/123.45", "COSU6502406170"],
    ["ABC/123.45", "COSU6502406170"]
  ];
  const header = findBatchColumns(rows);
  const items = [...collectBatchItems(rows, header).values()];

  assert.equal(items.length, 1);
  assert.equal(items[0].type, "BOOKING");
  assert.equal(items[0].number, "ABC/123.45");
  assert.equal(items[0].importedDetails.originalBillOfLading, "COSU6502406170");
});
