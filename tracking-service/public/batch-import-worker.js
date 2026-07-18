const DEFAULT_LIMIT = 50;
const HEADER_SCAN_LIMIT = 12;
const SHEET_SCAN_LIMIT = 5;

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_.\-—–:：#()（）\[\]【】]/g, "")
    .replace(/[\\/]/g, "");
}

const BOOKING_HEADERS = new Set([
  "booking",
  "bookingno",
  "bookingnumber",
  "bookingnumbers",
  "bookingnbr",
  "bookingref",
  "bookingreference",
  "订舱号",
  "订舱编号",
  "订舱单号",
  "订舱参考号",
  "订舱号码"
]);

const BILL_OF_LADING_HEADERS = new Set([
  "billoflading",
  "billofladingno",
  "billofladingnumber",
  "billofladingnumbers",
  "bl",
  "blno",
  "blnumber",
  "bol",
  "bolno",
  "mbl",
  "mblno",
  "masterbill",
  "masterbl",
  "masterbilloflading",
  "提单号",
  "提单编号",
  "海运提单号",
  "主提单号",
  "船公司提单号"
]);

function headerType(value) {
  const normalized = normalizeHeader(value);
  if (BOOKING_HEADERS.has(normalized)) return "BOOKING";
  if (BILL_OF_LADING_HEADERS.has(normalized)) return "BILLOFLADING";
  return null;
}

function findColumns(rows) {
  const scanLimit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const columns = (rows[rowIndex] ?? [])
      .map((value, columnIndex) => ({
        columnIndex,
        type: headerType(value)
      }))
      .filter((column) => column.type);
    if (columns.length > 0) return { rowIndex, columns };
  }
  return null;
}

function collectItems(rows, header, unique) {
  for (const row of rows.slice(header.rowIndex + 1)) {
    for (const column of header.columns) {
      const candidates = String(row?.[column.columnIndex] ?? "").split(/[\n,;，；]+/);
      for (const candidate of candidates) {
        const number = candidate.trim().replace(/\s+/g, "").toUpperCase();
        if (!/^[A-Z0-9-]{4,35}$/.test(number)) continue;
        const key = `${column.type}:${number}`;
        if (!unique.has(key)) {
          unique.set(key, {
            id: key,
            type: column.type,
            number,
            status: "pending",
            source: null,
            error: null,
            attempts: 0,
            updatedAt: null
          });
        }
      }
    }
  }
}

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
      const header = findColumns(rows);
      if (!header) continue;
      recognizedColumns = true;
      collectItems(rows, header, unique);
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
