const TRACKING_HEADER_ALIASES = new Set([
  "BOOKING",
  "BOOKINGNO",
  "BOOKINGNUMBER",
  "BOOKINGREFERENCE",
  "\u8ba2\u8231\u53f7",
  "\u8ba2\u8231\u7f16\u53f7",
  "\u8ba2\u8231\u53c2\u8003\u53f7"
]);

const FIELD_ALIASES = {
  carrier: ["CARRIER", "CARRIERCODE", "\u627f\u8fd0\u4eba", "\u8239\u516c\u53f8"],
  originalBillOfLading: [
    "MBLNO",
    "MASTERBLNO",
    "MASTERBILLOFLADING",
    "BLNO",
    "BILLOFLADING",
    "\u63d0\u5355\u53f7",
    "\u4e3b\u63d0\u5355\u53f7"
  ],
  forwarderJobNumber: ["JOBNUMBER", "FORWARDERJOBNUMBER", "\u4e1a\u52a1\u5355\u53f7"],
  vesselVoyage: ["VESSELVOY", "VESSELVOYAGE", "\u8239\u540d\u822a\u6b21"],
  portOfLoading: ["POL", "PORTOFLOADING", "\u8d77\u8fd0\u6e2f"],
  portOfDischarge: ["POD", "PORTOFDISCHARGE", "\u76ee\u7684\u6e2f"],
  clientPoNumber: ["PONO", "CLIENTPONUMBER", "PONUMBER"],
  estimatedDeparture: ["ETD", "ESTIMATEDDEPARTURE"],
  estimatedArrival: ["ETA", "ESTIMATEDARRIVAL"],
  clientNameCode: ["CLIENTCODE", "CLIENTNAMECODE", "\u5ba2\u6237\u4ee3\u7801"],
  volume: ["VOLUME", "\u7bb1\u91cf", "\u4f53\u79ef"]
};

export function parseShipmentBatchWorkbook(workbook, xlsx) {
  return (workbook?.SheetNames || [])
    .map((name) => {
      const worksheet = workbook.Sheets[name];
      const sourceRows = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd"
      });
      return prepareSheet(name, sourceRows);
    })
    .filter(Boolean);
}

export function prepareSheet(name, sourceRows) {
  const rows = trimEmptyEdges(sourceRows || []);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((row) => row.length), 0);
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => cellText(row[index])));
  const headers = normalizedRows[0] || [];
  const dataRows = normalizedRows.slice(1);
  const columns = headers.map((header, index) => {
    const values = dataRows.map((row) => row[index]).filter(Boolean);
    const cosuCount = values.filter((value) => /COSU\s*[0-9]{6,20}/i.test(value)).length;
    const inferredVolume = !header && normalizeHeader(values[0]) === "VOLUME";
    const label = header || (inferredVolume ? "VOLUME" : `Column ${columnLetter(index)}`);
    const aliasScore = TRACKING_HEADER_ALIASES.has(normalizeHeader(header)) ? 10000 : 0;
    return { index, header, label, cosuCount, nonEmptyCount: values.length, score: aliasScore + cosuCount * 100 + values.length };
  });
  const suggested = [...columns]
    .filter((column) => column.nonEmptyCount > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
  return {
    name,
    headers,
    rows: normalizedRows,
    columns,
    suggestedColumnIndex: suggested?.index ?? 0,
    previewRows: normalizedRows.slice(0, 9)
  };
}

export function buildShipmentBatchItems(sheet, selectedColumnIndex, defaultCarrier = "COSCO") {
  if (!sheet || !Number.isInteger(Number(selectedColumnIndex))) return [];
  const columnIndex = Number(selectedColumnIndex);
  const headers = sheet.headers || [];
  const fieldIndexes = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, findHeaderIndex(headers, aliases)])
  );
  if (fieldIndexes.volume < 0) {
    fieldIndexes.volume = headers.findIndex((header, index) =>
      !cellText(header) && normalizeHeader(sheet.rows?.[1]?.[index]) === "VOLUME"
    );
  }

  let clientNameCode = "";
  const itemsByBooking = new Map();
  for (let rowIndex = 1; rowIndex < (sheet.rows || []).length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    const selectedValue = cellText(row[columnIndex]);
    if (!selectedValue) continue;

    const rowClientCode = valueAt(row, fieldIndexes.clientNameCode);
    if (rowClientCode) clientNameCode = rowClientCode;
    const carrier = normalizeCarrier(
      valueAt(row, fieldIndexes.carrier) || defaultCarrier
    );
    const bookingNumber = extractManualReference(selectedValue, carrier);
    if (!bookingNumber) continue;
    const supportedCarrier = ["COSCO", "CMA"].includes(carrier);
    let volume = valueAt(row, fieldIndexes.volume);
    if (normalizeHeader(volume) === "VOLUME") volume = "";
    const item = {
      id: `${sheet.name}-row-${rowIndex + 1}`,
      carrier: carrier || null,
      type: "BOOKING",
      number: bookingNumber,
      displayNumber: bookingNumber,
      manualOnly: !supportedCarrier,
      importedDetails: {
        originalBillOfLading: valueAt(row, fieldIndexes.originalBillOfLading),
        forwarderJobNumber: valueAt(row, fieldIndexes.forwarderJobNumber),
        vesselVoyage: valueAt(row, fieldIndexes.vesselVoyage),
        portOfLoading: valueAt(row, fieldIndexes.portOfLoading),
        portOfDischarge: valueAt(row, fieldIndexes.portOfDischarge),
        clientPoNumber: valueAt(row, fieldIndexes.clientPoNumber),
        estimatedDeparture: valueAt(row, fieldIndexes.estimatedDeparture),
        estimatedArrival: valueAt(row, fieldIndexes.estimatedArrival),
        volume,
        clientNameCode
      }
    };
    const identity = `${carrier}|${bookingNumber}`;
    const existing = itemsByBooking.get(identity);
    if (!existing) {
      itemsByBooking.set(identity, item);
      continue;
    }
    for (const [field, value] of Object.entries(item.importedDetails)) {
      if (!existing.importedDetails[field] && value) existing.importedDetails[field] = value;
    }
  }
  return [...itemsByBooking.values()];
}

function normalizeCarrier(value) {
  const normalized = normalizeHeader(value);
  if (normalized === "COSCO" || normalized === "COSCOSHIPPING") return "COSCO";
  if (normalized === "CMA" || normalized === "CMACGM") return "CMA";
  return normalized;
}

export function normalizeHeader(value) {
  return cellText(value).toUpperCase().replace(/[\s/\\._()（）\-]+/g, "");
}

function findHeaderIndex(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
}

function extractManualReference(value, carrier) {
  const upper = cellText(value).toUpperCase();
  const tokens = upper.match(/[A-Z0-9][A-Z0-9./-]{3,}/g) || [];
  const selected = tokens
    .map((token) => token.replace(/[./-]+$/g, ""))
    .find((token) => /\d/.test(token) && token.length >= 4) || "";
  if (carrier === "COSCO" && /^COSU[0-9]{6,20}$/.test(selected)) {
    return selected.slice(4);
  }
  return selected;
}

function valueAt(row, index) {
  return index >= 0 ? cellText(row[index]) : "";
}

function cellText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function trimEmptyEdges(sourceRows) {
  const rows = sourceRows.map((row) => Array.isArray(row) ? row : []);
  const first = rows.findIndex((row) => row.some((cell) => cellText(cell)));
  if (first < 0) return [];
  let last = rows.length - 1;
  while (last >= first && !rows[last].some((cell) => cellText(cell))) last -= 1;
  return rows.slice(first, last + 1);
}

function columnLetter(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
