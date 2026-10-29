import {
  ALL_TRACKING_CARRIERS,
  TRACKING_ADAPTER_MODE,
  trackingCarriersForMode,
  normalizeTrackingAdapterMode,
  supportsShipmentReference
} from "./trackingCarriers.js";

const BOOKING_HEADERS = [
  "BOOKING",
  "BOOKINGNO",
  "BOOKINGNUMBER",
  "BOOKINGREFERENCE",
  "\u8ba2\u8231\u53f7",
  "\u8ba2\u8231\u7f16\u53f7",
  "\u8ba2\u8231\u53c2\u8003\u53f7"
];
const BILL_HEADERS = [
  "MBLNO",
  "MASTERBLNO",
  "MASTERBILLOFLADING",
  "BLNO",
  "BILLOFLADING",
  "\u63d0\u5355\u53f7",
  "\u4e3b\u63d0\u5355\u53f7"
];
const FIELD_ALIASES = {
  carrier: [
    "CARRIER",
    "CARRIERCODE",
    "\u627f\u8fd0\u4eba",
    "\u8239\u516c\u53f8",
    "\u8239\u53f8\u4ee3\u7801"
  ],
  originalBillOfLading: BILL_HEADERS,
  forwarderJobNumber: ["JOBNUMBER", "FORWARDERJOBNUMBER", "\u4e1a\u52a1\u5355\u53f7"],
  vesselVoyage: ["VESSELVOY", "VESSELVOYAGE", "\u8239\u540d\u822a\u6b21"],
  portOfLoading: ["POL", "PORTOFLOADING", "\u8d77\u8fd0\u6e2f"],
  portOfDischarge: ["POD", "PORTOFDISCHARGE", "\u76ee\u7684\u6e2f"],
  clientPoNumber: ["PONO", "CLIENTPONUMBER", "PONUMBER", "\u53d1\u7968\u53f7"],
  estimatedDeparture: ["ETD", "ESTIMATEDDEPARTURE", "\u73b0ETD"],
  estimatedArrival: ["ETA", "ESTIMATEDARRIVAL", "\u73b0ETA"],
  clientNameCode: ["CLIENTCODE", "CLIENTNAMECODE", "\u5ba2\u6237\u4ee3\u7801"],
  volume: ["VOLUME", "\u7bb1\u91cf", "\u4f53\u79ef"]
};
const CARRIER_ALIASES = {
  COSCOSHIPPING: "COSCO",
  CMACGM: "CMA",
  HPL: "HAPAG_LLOYD",
  HAPAGLLOYD: "HAPAG_LLOYD",
  MSK: "MAERSK",
  MATSN: "MATSON",
  EMC: "EVERGREEN",
  WANHAI: "WAN_HAI"
};
const RECOGNIZED_IMPORT_CARRIERS = new Set([
  "COSCO",
  "CMA",
  "MAERSK",
  "HAPAG_LLOYD",
  "MSC",
  "OOCL",
  "HMM",
  "SML",
  "MATSON",
  "EVERGREEN",
  "KMTC",
  "ONE",
  "WAN_HAI",
  "YML",
  "ZIM",
  "HEDE"
]);
const PREFIXES = [
  [/^COSU\d+$/i, "COSCO"],
  [/^OOLU[A-Z0-9]+$/i, "OOCL"],
  [/^HLCU[A-Z0-9]+$/i, "HAPAG_LLOYD"],
  [/^HDMU[A-Z0-9]+$/i, "HMM"],
  [/^MATS[A-Z0-9]+$/i, "MATSON"],
  [/^EGLV[A-Z0-9]+$/i, "EVERGREEN"],
  [/^KORP[A-Z0-9]+$/i, "KMTC"],
  [/^ZIMU[A-Z0-9]+$/i, "ZIM"]
];

export function parseShipmentBatchWorkbook(workbook, xlsx) {
  xlsx = xlsx.default || xlsx;
  return (workbook?.SheetNames || [])
    .map((name) => {
      const worksheet = workbook.Sheets[name];
      if (!worksheet?.["!ref"]) return null;
      // Read date serials without JS timezone conversion and retain exact string identifiers.
      const sourceRows = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
        range: 0
      });
      const unsafeCells = [];
      for (const [address, cell] of Object.entries(worksheet)) {
        if (address.startsWith("!")) continue;
        const { r, c } = xlsx.utils.decode_cell(address);
        if (cell.t === "n" && xlsx.SSF.is_date(cell.z || "")) {
          const d = xlsx.SSF.parse_date_code(cell.v);
          if (d)
            sourceRows[r][c] =
              `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        } else if (cell.t === "d") {
          // Date objects from external callers: use the workbook formatter, never toISOString().
          sourceRows[r][c] = xlsx.utils.format_cell({ ...cell, w: undefined, z: "yyyy-mm-dd" });
        }
        if (cell.t === "n" && (!Number.isSafeInteger(cell.v) || /[eE][+-]\d/.test(cell.w || "")))
          unsafeCells.push({ r, c });
        if (cell.f) unsafeCells.push({ r, c });
      }
      return prepareSheet(name, sourceRows, { merges: worksheet["!merges"] || [], unsafeCells });
    })
    .filter(Boolean);
}

export function prepareSheet(name, sourceRows, metadata = {}) {
  const first = sourceRows.findIndex((row) => row?.some((value) => cellText(value)));
  if (first < 0) return null;
  let last = sourceRows.length - 1;
  while (last > first && !sourceRows[last]?.some((value) => cellText(value))) last--;
  const scoreHeader = (row) =>
    row.reduce(
      (score, value) =>
        score +
        (Object.values(FIELD_ALIASES)
          .flat()
          .concat(BOOKING_HEADERS)
          .some((alias) => normalizeHeader(value) === normalizeHeader(alias))
          ? 1
          : 0),
      0
    );
  let headerIndex = first;
  for (let r = first; r <= Math.min(last, first + 30); r++)
    if (scoreHeader(sourceRows[r] || []) > scoreHeader(sourceRows[headerIndex] || []))
      headerIndex = r;
  const width = Math.max(...sourceRows.slice(first, last + 1).map((row) => row.length));
  const rows = sourceRows
    .slice(headerIndex, last + 1)
    .map((row) => Array.from({ length: width }, (_, c) => cellText(row[c])));
  const headers = rows[0];
  const operational =
    headers.includes("\u539fETD") &&
    headers.includes("\u73b0ETD") &&
    headers.filter((h) => normalizeHeader(h) === "\u63d0\u5355\u53f7").length > 1;
  const referenceColumn = operational
    ? headers.findIndex((h) => /\u63d0\u5355\u53f7\s*[:\uff1a]/.test(h))
    : -1;
  const columns = headers.map((header, index) => {
    const values = rows
      .slice(1)
      .map((row) => row[index])
      .filter(Boolean);
    const reference = BOOKING_HEADERS.concat(BILL_HEADERS).includes(normalizeHeader(header));
    const score =
      index === referenceColumn
        ? 30000
        : BOOKING_HEADERS.includes(normalizeHeader(header))
          ? 20000
          : reference
            ? 10000
            : 0;
    const label =
      header ||
      (normalizeHeader(values[0]) === "VOLUME" ? "VOLUME" : `Column ${columnLetter(index)}`);
    return {
      index,
      header,
      label,
      nonEmptyCount: values.length,
      score,
      cosuCount: values.filter((v) => /^COSU\s*\d+$/.test(v)).length
    };
  });
  const suggested = [...columns].filter((c) => c.score > 0).sort((a, b) => b.score - a.score)[0];
  return {
    name,
    headers,
    rows,
    columns,
    headerRow: headerIndex + 1,
    sourceRowNumbers: rows.map((_, i) => headerIndex + i + 1),
    operational,
    referenceColumn,
    merges: metadata.merges || [],
    unsafeCells: metadata.unsafeCells || [],
    resultSheet:
      headers.includes("\u63d0\u4ea4\u5355\u53f7") &&
      (headers.includes("\u7bb1\u53f7") ||
        (headers.includes("\u5355\u53f7\u7c7b\u578b") &&
          headers.includes("\u8fd0\u8f93\u72b6\u6001")) ||
        (headers.includes("\u8239\u53f8\u4ee3\u7801") &&
          headers.includes("\u67e5\u8be2\u65b9\u5f0f"))),
    suggestedColumnIndex: suggested?.index ?? null,
    previewRows: rows.slice(0, 9)
  };
}

/** @param {{ adapterMode?: string }} [options] */
export function buildShipmentBatchPreview(
  sheet,
  selectedColumnIndex,
  defaultCarrier = "",
  referenceType = "BOOKING",
  options = {}
) {
  const adapterMode = normalizeTrackingAdapterMode(options.adapterMode ?? TRACKING_ADAPTER_MODE);
  const localQueue = adapterMode === "LOCAL_QUEUE";
  const configuredCarriers = trackingCarriersForMode(adapterMode);
  /** @type {{ items: any[], rows: any[], errors: {row:number,code:string,message:string}[], skipped:number, duplicates:number, mappings:{field:string,index:number,header:string}[], adapterMode:string }} */
  const preview = {
    items: [],
    rows: [],
    errors: [],
    skipped: 0,
    duplicates: 0,
    mappings: [],
    adapterMode
  };
  if (sheet?.resultSheet)
    preview.errors.push({
      row: sheet.headerRow,
      code: "RESULT_WORKBOOK",
      message: "Tracking result workbook is not a task import workbook"
    });
  if (
    !sheet ||
    selectedColumnIndex === null ||
    selectedColumnIndex === "" ||
    !Number.isInteger(Number(selectedColumnIndex))
  )
    return preview;
  const col = Number(selectedColumnIndex);
  const headers = sheet.headers;
  const fieldIndexes = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
      field,
      findHeaderIndex(headers, aliases)
    ])
  );
  if (sheet.operational) {
    fieldIndexes.originalBillOfLading = sheet.referenceColumn;
    fieldIndexes.forwarderJobNumber = 0;
  }
  if (fieldIndexes.volume < 0)
    fieldIndexes.volume = headers.findIndex(
      (h, i) => !h && normalizeHeader(sheet.rows[1]?.[i]) === "VOLUME"
    );
  preview.mappings = Object.entries(fieldIndexes)
    .filter(([, i]) => i >= 0)
    .map(([field, index]) => ({
      field,
      index,
      header: headers[index] || sheet.columns[index].label
    }));
  if (sheet.operational && col !== sheet.referenceColumn)
    preview.errors.push({
      row: sheet.headerRow,
      code: "BUSINESS_ID_COLUMN",
      message:
        "Select the annotated bill-of-lading column; the first column contains internal job numbers"
    });
  const byIdentity = new Map();
  const mergedValue = (r, c) => {
    const value = sheet.rows[r]?.[c] || "";
    if (value || c < 0) return value;
    const sourceRow = sheet.sourceRowNumbers[r] - 1;
    const merge = sheet.merges.find(
      (m) => m.s.c === c && m.e.c === c && m.s.r <= sourceRow && m.e.r >= sourceRow
    );
    return merge ? sheet.rows[merge.s.r - sheet.headerRow + 1]?.[c] || "" : "";
  };
  for (let r = 1; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r];
    const row = sheet.sourceRowNumbers[r];
    const original = cellText(cells[col]);
    if (!cells.some(Boolean)) {
      preview.skipped++;
      continue;
    }
    if (!original) {
      // Only actual merged-reference continuations are safely ignored.
      const merged = sheet.merges.some(
        (m) => m.s.c === col && m.e.c === col && m.s.r < row - 1 && m.e.r >= row - 1
      );
      const meaningful = cells.some((v, i) => v && i !== fieldIndexes.carrier);
      if (meaningful && !merged)
        preview.errors.push({
          row,
          code: "MISSING_REFERENCE",
          message: "Non-empty row has no tracking reference"
        });
      else preview.skipped++;
      continue;
    }
    if (
      /^(?:\u5408\u8ba1|\u603b\u8ba1|\u5c0f\u8ba1|TOTAL|SUBTOTAL)(?:\b|\s|[:\uff1a]|$)/i.test(
        original
      )
    ) {
      preview.skipped++;
      continue;
    }
    if (normalizeHeader(original) === normalizeHeader(headers[col])) {
      preview.skipped++;
      continue;
    }
    const cleaned = original
      .replace(/\s*[(\uff08](?:\u4e3b|\u5206)[)\uff09]\s*(?:\u653e\u884c)?\s*$/u, "")
      .replace(/\s+\u653e\u884c\s*$/u, "")
      .trim();
    const rawReference = cleaned.replace(/^COSU\s+(\d+)$/i, "COSU$1");
    const rowErrors = [];
    const add = (code, message) => {
      const error = { row, code, message };
      rowErrors.push(error);
      preview.errors.push(error);
    };
    if (!/^[A-Za-z0-9][A-Za-z0-9./-]{3,127}$/.test(rawReference) || !/[0-9]/.test(rawReference))
      add("INVALID_REFERENCE", "Reference contains unrecognized text or multiple identifiers");
    if (sheet.unsafeCells.some((c) => c.r === row - 1 && c.c === col))
      add(
        "UNSAFE_REFERENCE",
        "Numeric reference or formula cannot be preserved precisely; use a text cell"
      );
    const explicit = cellText(cells[fieldIndexes.carrier]);
    const inferred = PREFIXES.find(([pattern]) => pattern.test(rawReference))?.[1] || "";
    const carrier = normalizeCarrier(explicit || inferred || defaultCarrier);
    if (explicit && inferred && normalizeCarrier(explicit) !== inferred)
      add("CARRIER_CONFLICT", "Carrier cell conflicts with the reference prefix");
    if (!configuredCarriers.some((c) => c.code === carrier)) {
      if (RECOGNIZED_IMPORT_CARRIERS.has(carrier))
        add(
          "CARRIER_NOT_CONFIGURED",
          `Carrier is recognized but has no configured query adapter in the ${adapterMode} profile`
        );
      else
        add(
          "UNKNOWN_CARRIER",
          "Carrier is missing or unrecognized; choose an explicit carrier or correct the source cell"
        );
    }
    const headerType = BILL_HEADERS.includes(normalizeHeader(headers[col]))
      ? "BILLOFLADING"
      : referenceType;
    // Only the legacy COSCO route converts a bill to its numeric BOOKING query.
    // LOCAL_QUEUE receives the original bill identity; CMA still requires BOOKING.
    const type = carrier === "CMA" || (carrier === "COSCO" && !localQueue) ? "BOOKING" : headerType;
    if (localQueue && carrier === "COSCO" && type === "BOOKING" && /^COSU\d+$/i.test(rawReference))
      add(
        "REFERENCE_TYPE_CONFLICT",
        "A COSU-prefixed bill must use BILLOFLADING in LOCAL_QUEUE; select the bill column or reference type"
      );
    if (
      !supportsShipmentReference(carrier, type, adapterMode) &&
      configuredCarriers.some((c) => c.code === carrier)
    )
      add("UNSUPPORTED_REFERENCE", "Carrier does not support the selected reference type");
    const number =
      !localQueue && carrier === "COSCO" && /^COSU\d+$/i.test(rawReference)
        ? rawReference.slice(4)
        : rawReference;
    const importedDetails = Object.fromEntries(
      Object.entries(fieldIndexes)
        .filter(([field]) => field !== "carrier")
        .map(([field, c]) => [field, c >= 0 ? mergedValue(r, c) : ""])
    );
    if (normalizeHeader(importedDetails.volume) === "VOLUME") importedDetails.volume = "";
    if (headerType === "BILLOFLADING") importedDetails.originalBillOfLading = rawReference;
    const item = {
      id: `${sheet.name}-row-${row}`,
      carrier: carrier || null,
      type,
      number,
      displayNumber: original,
      manualOnly: false,
      importedDetails
    };
    const view = {
      sourceRow: row,
      originalReference: original,
      number,
      carrier,
      carrierSource: explicit ? "cell" : inferred ? "prefix" : "selection",
      sourceReference: {
        raw: original,
        normalized: rawReference,
        type: headerType,
        address: columnLetter(col) + row
      },
      adapterMode,
      type,
      errors: rowErrors,
      status: rowErrors.length ? "BLOCKED" : "READY"
    };
    preview.rows.push(view);
    const identity = `${carrier}|${type}|${number}`;
    const existing = byIdentity.get(identity);
    if (existing) {
      preview.duplicates++;
      for (const [field, value] of Object.entries(importedDetails)) {
        if (value && existing.importedDetails[field] && value !== existing.importedDetails[field])
          add("DUPLICATE_CONFLICT", `Duplicate reference has conflicting ${field}`);
        else if (value) existing.importedDetails[field] = value;
      }
      view.status = rowErrors.length ? "BLOCKED" : "DUPLICATE";
    } else {
      byIdentity.set(identity, item);
      if (!rowErrors.length) preview.items.push(item);
    }
  }
  if (preview.items.length > 500)
    preview.errors.push({
      row: sheet.headerRow,
      code: "BATCH_LIMIT",
      message: "A shipment batch cannot exceed 500 references"
    });
  return preview;
}

export function buildShipmentBatchItems(sheet, column, carrier = "", type = "BOOKING") {
  return buildShipmentBatchPreview(sheet, column, carrier, type).items;
}
export function normalizeHeader(value) {
  return cellText(value)
    .toUpperCase()
    .replace(/[\s/\\._()\uff08\uff09\-:\uff1a]+/g, "");
}
function normalizeCarrier(value) {
  const n = normalizeHeader(value);
  return (
    CARRIER_ALIASES[n] ||
    ALL_TRACKING_CARRIERS.find(
      (c) => normalizeHeader(c.code) === n || normalizeHeader(c.name) === n
    )?.code ||
    n
  );
}
function findHeaderIndex(headers, aliases) {
  return headers.findIndex((h) => aliases.some((a) => normalizeHeader(a) === normalizeHeader(h)));
}
function cellText(value) {
  return String(value ?? "").trim();
}
function columnLetter(index) {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
