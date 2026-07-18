const DEFAULT_LIMIT = 50;
const SHEET_SCAN_LIMIT = 5;
import { collectBatchItems, findBatchColumns } from "./batch-import-rules.mjs";

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

    const XLSX = await import("./vendor/xlsx.mjs");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
      // Read beyond the 50-result cap so blank or duplicated rows near the
      // top of a worksheet do not prevent us from finding 50 unique numbers.
      sheetRows: limit * 4 + 20
    });
    const unique = new Map();
    let recognizedColumns = false;
    const sheetNames = (workbook.SheetNames ?? []).slice(0, SHEET_SCAN_LIMIT);

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false
      });
      const header = findBatchColumns(rows);
      if (!header) continue;
      recognizedColumns = true;
      collectBatchItems(rows, header, unique);
    }

    if (!recognizedColumns) {
      throw workerError("no_columns", "No supported shipment column was found");
    }
    if (unique.size === 0) {
      throw workerError("no_rows", "No valid shipment number was found");
    }

    self.postMessage({
      ok: true,
      items: [...unique.values()].slice(0, limit),
      found: unique.size,
      sheetsScanned: sheetNames.length
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
