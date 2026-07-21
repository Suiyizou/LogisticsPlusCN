import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";

let workerImportCounter = 0;

function workbookBlob(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Blob([
    XLSX.write(workbook, { type: "array", bookType: "xlsx" })
  ]);
}

async function sendWorkerMessage(data) {
  const originalSelf = globalThis.self;
  let handler = null;
  let response = null;
  globalThis.self = {
    addEventListener(type, listener) {
      if (type === "message") handler = listener;
    },
    postMessage(payload) {
      response = payload;
    }
  };
  try {
    workerImportCounter += 1;
    await import(`../public/batch-import-worker.js?test=${workerImportCounter}`);
    assert.equal(typeof handler, "function");
    await handler({ data });
    return response;
  } finally {
    if (originalSelf === undefined) delete globalThis.self;
    else globalThis.self = originalSelf;
  }
}

test("worker previews first, then honors the confirmed sheet, header, column, and type", async () => {
  const file = workbookBlob([
    ["Booking No.", "JOB NUMBER", "M/B/L NO.", "Client Code"],
    ["BOOKING-001", "JOB-01", "COSU6502406170", "Hayden US"],
    ["BOOKING-002", "JOB-02", "COSU6502406171", ""]
  ]);

  const preview = await sendWorkerMessage({ file, limit: 50, xlsxModule: XLSX });
  assert.equal(preview.ok, true);
  assert.equal(preview.phase, "preview");
  assert.equal(preview.suggestedSheetName, "Sheet1");
  assert.equal(preview.suggestedHeaderRowIndex, 0);
  assert.equal(preview.suggestedColumnIndex, 2);
  assert.deepEqual(preview.recommendedColumn, {
    sheetName: "Sheet1",
    headerRowIndex: 0,
    columnIndex: 2,
    type: "BILLOFLADING"
  });
  assert.equal(preview.columns[2].label, "M/B/L NO.");
  assert.equal(preview.previewRows[0].rowIndex, 0);
  assert.equal("items" in preview, false);

  const selected = await sendWorkerMessage({
    file,
    limit: 50,
    xlsxModule: XLSX,
    selectedSheetName: "Sheet1",
    selectedHeaderRowIndex: 0,
    selectedColumnIndex: 0,
    selectedType: "BOOKING"
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.phase, "items");
  assert.deepEqual(selected.selection, {
    sheetName: "Sheet1",
    headerRowIndex: 0,
    columnIndex: 0,
    type: "BOOKING"
  });
  assert.deepEqual(selected.items.map((item) => item.number), ["BOOKING-001", "BOOKING-002"]);
  assert.equal(selected.items.every((item) => item.type === "BOOKING"), true);
  assert.equal(selected.items[1].importedDetails.clientNameCode, "Hayden US");
});
