const DEFAULT_LIMIT = 50;
const SHEET_SCAN_LIMIT = 5;
import {
  buildBatchPreview,
  collectBatchItems,
  selectBatchColumn
} from "./batch-import-rules.mjs";

function workerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

self.addEventListener("message", async (event) => {
  try {
    const file = event.data?.file;
    const limit = Math.max(1, Math.min(Number(event.data?.limit) || DEFAULT_LIMIT, DEFAULT_LIMIT));
    if (!(file instanceof Blob)) throw workerError("invalid_file", "Invalid spreadsheet file");

    const XLSX = event.data?.xlsxModule ?? await import("./vendor/xlsx.mjs");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
      // Read beyond the 50-result cap so blank or duplicated rows near the
      // top of a worksheet do not prevent us from finding 50 unique numbers.
      sheetRows: limit * 4 + 20
    });
    const sheetNames = (workbook.SheetNames ?? []).slice(0, SHEET_SCAN_LIMIT);
    const parsedSheets = [];
    for (const [sheetIndex, sheetName] of sheetNames.entries()) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false
      });
      parsedSheets.push({
        name: sheetName,
        index: sheetIndex,
        rows,
        ...buildBatchPreview(rows)
      });
    }

    if (parsedSheets.length === 0) {
      throw workerError("no_sheets", "No readable worksheet was found");
    }

    const suggestedSheet = parsedSheets.find((sheet) => sheet.suggestedColumnIndex != null)
      ?? parsedSheets[0];
    const nestedSelection = event.data?.selection ?? {};
    const selectedColumnValue = event.data?.selectedColumnIndex
      ?? nestedSelection.columnIndex;
    const hasSelection = selectedColumnValue !== undefined
      && selectedColumnValue !== null
      && selectedColumnValue !== "";

    if (!hasSelection) {
      const sheets = parsedSheets.map(({ rows, ...sheet }) => sheet);
      self.postMessage({
        ok: true,
        phase: "preview",
        sheets,
        recommendedColumn: suggestedSheet.suggestedColumnIndex == null
          ? null
          : {
              sheetName: suggestedSheet.name,
              headerRowIndex: suggestedSheet.headerRowIndex,
              columnIndex: suggestedSheet.suggestedColumnIndex,
              type: suggestedSheet.suggestedType
            },
        suggestedSheetName: suggestedSheet.name,
        suggestedHeaderRowIndex: suggestedSheet.headerRowIndex,
        suggestedColumnIndex: suggestedSheet.suggestedColumnIndex,
        suggestedType: suggestedSheet.suggestedType,
        columns: suggestedSheet.columns,
        previewRows: suggestedSheet.previewRows
      });
      return;
    }

    const selectedSheetName = String(
      event.data?.selectedSheetName
        ?? nestedSelection.sheetName
        ?? suggestedSheet.name
    );
    const selectedSheet = parsedSheets.find((sheet) => sheet.name === selectedSheetName);
    if (!selectedSheet) {
      throw workerError("invalid_selection", "Selected worksheet was not found");
    }
    const selectedHeaderRowIndex = event.data?.selectedHeaderRowIndex
      ?? nestedSelection.headerRowIndex
      ?? selectedSheet.headerRowIndex;
    const selectedType = event.data?.selectedType ?? nestedSelection.type;
    let header;
    try {
      header = selectBatchColumn(selectedSheet.rows, {
        headerRowIndex: selectedHeaderRowIndex,
        columnIndex: selectedColumnValue,
        type: selectedType
      });
    } catch (error) {
      throw workerError("invalid_selection", error?.message || "Selected tracking column is invalid");
    }

    const unique = collectBatchItems(selectedSheet.rows, header, new Map());
    if (unique.size === 0) {
      throw workerError("no_rows", "No valid shipment number was found");
    }

    const items = [...unique.values()].sort(
      (left, right) => Number(left.manualOnly) - Number(right.manualOnly)
    );
    self.postMessage({
      ok: true,
      phase: "items",
      // Trackable COSU bills stay ahead of manual-only placeholders when the
      // workbook contains more rows than the import cap.
      items: items.slice(0, limit),
      found: unique.size,
      sheetsScanned: 1,
      selection: {
        sheetName: selectedSheet.name,
        headerRowIndex: header.rowIndex,
        columnIndex: header.queryColumns[0].columnIndex,
        type: header.queryColumns[0].type
      }
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: {
        code: error?.code || "parse_failed",
        message: error?.message || "Spreadsheet parsing failed"
      }
    });
  }
});
