const HEADER_SCAN_LIMIT = 12;
const COSU_NUMBER_PATTERN = /^COSU([0-9]{4,31})$/;

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_.\-\u2013\u2014:\uFF1A()\uFF08\uFF09\[\]\u3010\u3011]/g, "")
    .replace(/[\\/]/g, "");
}

const BOOKING_HEADERS = new Set([
  "booking", "bookingno", "bookingnumber", "bookingnumbers", "bookingnbr",
  "bookingref", "bookingreference", "\u8ba2\u8231\u53f7", "\u8ba2\u8231\u7f16\u53f7",
  "\u8ba2\u8231\u5355\u53f7", "\u8ba2\u8231\u53c2\u8003\u53f7", "\u8ba2\u8231\u53f7\u7801"
].map(normalizeHeader));

const BILL_OF_LADING_HEADERS = new Set([
  "billoflading", "billofladingno", "billofladingnumber", "billofladingnumbers",
  "bl", "blno", "blnumber", "bol", "bolno", "mbl", "mblno", "masterbill",
  "masterbl", "masterbilloflading", "carrierbl", "carrierblno", "oceanbl", "oceanblno",
  "\u63d0\u5355\u53f7", "\u63d0\u5355\u7f16\u53f7", "\u6d77\u8fd0\u63d0\u5355\u53f7",
  "\u4e3b\u63d0\u5355\u53f7", "\u8239\u516c\u53f8\u63d0\u5355\u53f7"
].map(normalizeHeader));

const DETAIL_HEADERS = new Map([
  ["jobnumber", "forwarderJobNumber"], ["jobno", "forwarderJobNumber"],
  ["job", "forwarderJobNumber"], ["\u5de5\u4f5c\u53f7", "forwarderJobNumber"],
  ["\u8d27\u4ee3\u8ba2\u5355\u53f7", "forwarderJobNumber"],
  ["vesselvoy", "vesselVoyage"], ["vesselvoyage", "vesselVoyage"],
  ["vesselvyg", "vesselVoyage"], ["\u8239\u540d\u822a\u6b21", "vesselVoyage"],
  ["pol", "portOfLoading"], ["portofloading", "portOfLoading"],
  ["\u88c5\u8d27\u6e2f", "portOfLoading"], ["\u8d77\u8fd0\u6e2f", "portOfLoading"],
  ["pod", "portOfDischarge"], ["portofdischarge", "portOfDischarge"],
  ["\u5378\u8d27\u6e2f", "portOfDischarge"], ["\u76ee\u7684\u6e2f", "portOfDischarge"],
  ["pono", "clientPoNumber"], ["ponumber", "clientPoNumber"],
  ["purchaseorderno", "clientPoNumber"], ["\u5ba2\u6237\u8ba2\u5355\u53f7", "clientPoNumber"],
  ["etd", "estimatedDeparture"], ["\u9884\u8ba1\u79bb\u6e2f", "estimatedDeparture"],
  ["eta", "estimatedArrival"], ["\u9884\u8ba1\u5230\u6e2f", "estimatedArrival"],
  ["volume", "volume"], ["containerquantity", "volume"], ["\u7bb1\u91cf", "volume"],
  ["clientcode", "clientNameCode"], ["clientnamecode", "clientNameCode"],
  ["\u5ba2\u6237\u4ee3\u7801", "clientNameCode"]
].map(([header, key]) => [normalizeHeader(header), key]));

const CARRIER_BY_PREFIX = Object.freeze({ COSU: "COSCO", CMDU: "CMA" });

function headerType(value) {
  const normalized = normalizeHeader(value);
  if (BOOKING_HEADERS.has(normalized)) return "BOOKING";
  if (BILL_OF_LADING_HEADERS.has(normalized)) return "BILLOFLADING";
  return null;
}

function cleanCellText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 240);
}

function compactShipmentNumber(value) {
  const normalized = String(value ?? "").normalize("NFKC").toUpperCase();
  const spacedCosu = normalized.match(/COSU\s*([0-9]{4,31})/);
  if (spacedCosu) return `COSU${spacedCosu[1]}`;
  return (normalized.match(/[A-Z0-9][A-Z0-9./-]*/g) ?? [])
    .map((token) => token.replace(/[./-]+$/g, ""))
    .find(
      (token) =>
        token.length >= 4 &&
        token.length <= 64 &&
        /^[A-Z0-9](?:[A-Z0-9./-]*[A-Z0-9])?$/.test(token)
    ) ?? "";
}

function splitShipmentCell(value) {
  // One source cell represents one shipment row. Notes may contain newlines,
  // commas, or secondary references, so extract only its first valid token.
  return [String(value ?? "")];
}

export function normalizeShipmentCandidate(type, rawValue) {
  const sourceText = String(rawValue ?? "").normalize("NFKC").trim();
  const compact = compactShipmentNumber(sourceText);
  if (!compact) return null;
  const displayText = cleanCellText(sourceText) || compact;

  const cosuMatch = compact.match(COSU_NUMBER_PATTERN);
  if (cosuMatch) {
    return {
      carrier: "COSCO",
      carrierPrefix: "COSU",
      type: "BILLOFLADING",
      number: cosuMatch[1],
      originalBillOfLading: compact,
      displayNumber: displayText,
      manualOnly: false,
      unsupportedCarrierPrefix: false
    };
  }

  const prefixMatch = type === "BILLOFLADING"
    ? compact.match(/^([A-Z]{4})([A-Z0-9./-]{4,60})$/)
    : null;
  const carrierPrefix = prefixMatch?.[1] ?? null;
  return {
    carrier: carrierPrefix ? (CARRIER_BY_PREFIX[carrierPrefix] ?? null) : null,
    carrierPrefix,
    type,
    number: compact,
    originalBillOfLading: type === "BILLOFLADING" ? compact : null,
    displayNumber: displayText,
    manualOnly: true,
    unsupportedCarrierPrefix: carrierPrefix !== "COSU"
  };
}

function countCosuNumbers(rows, rowIndex, columnIndex) {
  let count = 0;
  for (const row of rows.slice(rowIndex + 1)) {
    for (const value of splitShipmentCell(row?.[columnIndex])) {
      if (COSU_NUMBER_PATTERN.test(compactShipmentNumber(value))) count += 1;
    }
  }
  return count;
}

function countCandidateNumbers(rows, rowIndex, columnIndex, type) {
  let count = 0;
  for (const row of rows.slice(rowIndex + 1)) {
    for (const value of splitShipmentCell(row?.[columnIndex])) {
      if (normalizeShipmentCandidate(type, value)) count += 1;
    }
  }
  return count;
}

function detailColumnsNear(rows, rowIndex) {
  const detailColumns = new Map();
  for (
    let detailRowIndex = rowIndex;
    detailRowIndex < Math.min(rows.length, rowIndex + 3);
    detailRowIndex += 1
  ) {
    for (const [columnIndex, value] of (rows[detailRowIndex] ?? []).entries()) {
      const detailKey = DETAIL_HEADERS.get(normalizeHeader(value));
      if (detailKey && !detailColumns.has(detailKey)) detailColumns.set(detailKey, columnIndex);
    }
  }
  return detailColumns;
}

function recognizedHeaderOptions(rows) {
  const options = [];
  const scanLimit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    for (const [columnIndex, value] of (rows[rowIndex] ?? []).entries()) {
      const type = headerType(value);
      if (!type) continue;
      options.push({
        rowIndex,
        columnIndex,
        type,
        inferred: false,
        cosuCount: countCosuNumbers(rows, rowIndex, columnIndex),
        candidateCount: countCandidateNumbers(rows, rowIndex, columnIndex, type)
      });
    }
  }
  return options;
}

function inferredCosuOptions(rows) {
  const occurrences = new Map();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (const [columnIndex, value] of (rows[rowIndex] ?? []).entries()) {
      const matches = splitShipmentCell(value)
        .map(compactShipmentNumber)
        .filter((candidate) => COSU_NUMBER_PATTERN.test(candidate)).length;
      if (matches === 0) continue;
      const current = occurrences.get(columnIndex) ?? { count: 0, firstRowIndex: rowIndex };
      current.count += matches;
      current.firstRowIndex = Math.min(current.firstRowIndex, rowIndex);
      occurrences.set(columnIndex, current);
    }
  }

  return [...occurrences.entries()].map(([columnIndex, occurrence]) => {
    const maxHeaderIndex = Math.min(occurrence.firstRowIndex - 1, HEADER_SCAN_LIMIT - 1);
    let rowIndex = Math.max(0, maxHeaderIndex);
    let bestDetailCount = -1;
    for (let candidateRowIndex = 0; candidateRowIndex <= maxHeaderIndex; candidateRowIndex += 1) {
      const detailCount = (rows[candidateRowIndex] ?? []).reduce(
        (total, value) => total + (DETAIL_HEADERS.has(normalizeHeader(value)) ? 1 : 0),
        0
      );
      if (detailCount >= bestDetailCount) {
        bestDetailCount = detailCount;
        rowIndex = candidateRowIndex;
      }
    }
    return {
      rowIndex,
      columnIndex,
      type: "BILLOFLADING",
      inferred: true,
      cosuCount: occurrence.count,
      candidateCount: countCandidateNumbers(rows, rowIndex, columnIndex, "BILLOFLADING")
    };
  });
}

function compareColumnOptions(left, right) {
  if ((right.cosuCount > 0) !== (left.cosuCount > 0)) {
    return Number(right.cosuCount > 0) - Number(left.cosuCount > 0);
  }
  if (right.cosuCount !== left.cosuCount) return right.cosuCount - left.cosuCount;
  if (left.inferred !== right.inferred) return Number(left.inferred) - Number(right.inferred);
  if (left.type !== right.type) return left.type === "BILLOFLADING" ? -1 : 1;
  if (right.candidateCount !== left.candidateCount) return right.candidateCount - left.candidateCount;
  if (left.rowIndex !== right.rowIndex) return left.rowIndex - right.rowIndex;
  return left.columnIndex - right.columnIndex;
}

export function findBatchColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const recognized = recognizedHeaderOptions(rows);
  const inferred = inferredCosuOptions(rows).filter(
    (option) => !recognized.some(
      (candidate) => candidate.rowIndex === option.rowIndex && candidate.columnIndex === option.columnIndex
    )
  );
  const [selected] = [...recognized, ...inferred].sort(compareColumnOptions);
  if (!selected) return null;

  return {
    rowIndex: selected.rowIndex,
    queryColumns: [{
      columnIndex: selected.columnIndex,
      type: selected.type,
      inferred: selected.inferred,
      cosuCount: selected.cosuCount
    }],
    detailColumns: detailColumnsNear(rows, selected.rowIndex)
  };
}

function likelyHeaderRowIndex(rows) {
  const scanLimit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  let best = { rowIndex: 0, score: -1 };
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const score = (rows[rowIndex] ?? []).reduce((total, value) => {
      const normalized = normalizeHeader(value);
      if (!normalized) return total;
      if (headerType(value)) return total + 5;
      if (DETAIL_HEADERS.has(normalized)) return total + 3;
      return total + 1;
    }, 0);
    if (score > best.score) best = { rowIndex, score };
  }
  return best.rowIndex;
}

function spreadsheetColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function buildBatchPreview(rows, options = {}) {
  const recommended = findBatchColumns(rows);
  const headerRowIndex = recommended?.rowIndex ?? likelyHeaderRowIndex(rows);
  const suggestedColumnIndex = recommended?.queryColumns?.[0]?.columnIndex ?? null;
  const previewRowLimit = Math.max(5, Math.min(Number(options.previewRowLimit) || 8, 12));
  const previewStartRowIndex = Math.max(0, headerRowIndex - 1);
  const previewSource = rows.slice(previewStartRowIndex, previewStartRowIndex + previewRowLimit);
  const columnCount = Math.max(
    0,
    ...previewSource.map((row) => row?.length ?? 0),
    rows[headerRowIndex]?.length ?? 0
  );
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const label = cleanCellText(rows[headerRowIndex]?.[index]) || `Column ${spreadsheetColumnName(index)}`;
    const type = headerType(label);
    return {
      index,
      label,
      type,
      suggestedType: type ?? (
        index === suggestedColumnIndex
          ? recommended.queryColumns[0].type
          : "BILLOFLADING"
      )
    };
  });
  return {
    headerRowIndex,
    suggestedColumnIndex,
    suggestedType: suggestedColumnIndex == null
      ? "BILLOFLADING"
      : columns[suggestedColumnIndex]?.suggestedType ?? "BILLOFLADING",
    columns,
    previewRows: previewSource.map((row, offset) => ({
      rowIndex: previewStartRowIndex + offset,
      values: Array.from({ length: columnCount }, (_, index) => cleanCellText(row?.[index]))
    }))
  };
}

export function selectBatchColumn(rows, selection = {}) {
  const preview = buildBatchPreview(rows);
  const rowIndex = selection.headerRowIndex == null
    ? preview.headerRowIndex
    : Number(selection.headerRowIndex);
  const columnIndex = Number(selection.columnIndex);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
    throw new RangeError("Selected header row is invalid");
  }
  const columnCount = Math.max(0, ...rows.map((row) => row?.length ?? 0));
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= columnCount) {
    throw new RangeError("Selected tracking column is invalid");
  }
  const inferredType = headerType(rows[rowIndex]?.[columnIndex]) ?? "BILLOFLADING";
  const type = String(selection.type ?? inferredType).trim().toUpperCase();
  if (!["BILLOFLADING", "BOOKING"].includes(type)) {
    throw new RangeError("Selected tracking type is invalid");
  }
  return {
    rowIndex,
    queryColumns: [{
      columnIndex,
      type,
      inferred: selection.type == null,
      selected: true,
      preserveType: true
    }],
    detailColumns: detailColumnsNear(rows, rowIndex)
  };
}

function importedDetailsForRow(row, header, candidate, inheritedDetails = {}) {
  const details = { ...inheritedDetails };
  for (const [key, columnIndex] of header.detailColumns.entries()) {
    if (DETAIL_HEADERS.get(normalizeHeader(row?.[columnIndex])) === key) continue;
    const value = cleanCellText(row?.[columnIndex]);
    if (value) details[key] = value;
  }
  if (candidate.carrierPrefix) details.carrierPrefix = candidate.carrierPrefix;
  if (candidate.originalBillOfLading) {
    details.originalBillOfLading = candidate.originalBillOfLading;
  }
  return details;
}

export function collectBatchItems(rows, header, unique = new Map()) {
  if (!header) return unique;
  let inheritedClientNameCode = null;
  for (const row of rows.slice(header.rowIndex + 1)) {
    const clientCodeColumn = header.detailColumns.get("clientNameCode");
    if (clientCodeColumn != null) {
      const clientCode = cleanCellText(row?.[clientCodeColumn]);
      if (
        clientCode &&
        DETAIL_HEADERS.get(normalizeHeader(clientCode)) !== "clientNameCode"
      ) {
        inheritedClientNameCode = clientCode;
      }
    }
    for (const column of header.queryColumns) {
      for (const rawCandidate of splitShipmentCell(row?.[column.columnIndex])) {
        const candidate = normalizeShipmentCandidate(column.type, rawCandidate);
        if (!candidate) continue;
        const itemType = column.preserveType ? column.type : (candidate.type ?? column.type);
        const carrierKey = candidate.carrier ?? candidate.carrierPrefix ?? "MANUAL";
        const key = `${carrierKey}:${itemType}:${candidate.number}`;
        if (unique.has(key)) continue;
        unique.set(key, {
          id: key,
          carrier: candidate.carrier,
          type: itemType,
          number: candidate.number,
          displayNumber: candidate.displayNumber
            ?? candidate.originalBillOfLading
            ?? candidate.number,
          importedDetails: importedDetailsForRow(
            row,
            header,
            candidate,
            inheritedClientNameCode ? { clientNameCode: inheritedClientNameCode } : {}
          ),
          status: candidate.manualOnly ? "manual" : "pending",
          manualOnly: candidate.manualOnly,
          source: candidate.manualOnly ? "manual" : null,
          error: null,
          attempts: 0,
          updatedAt: null
        });
      }
    }
  }
  return unique;
}
