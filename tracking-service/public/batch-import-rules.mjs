const HEADER_SCAN_LIMIT = 12;

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_.\-—–:：#()（）\[\]【】]/g, "")
    .replace(/[\\/]/g, "");
}

const BOOKING_HEADERS = new Set([
  "booking", "bookingno", "bookingnumber", "bookingnumbers", "bookingnbr",
  "bookingref", "bookingreference", "订舱号", "订舱编号", "订舱单号", "订舱参考号", "订舱号码"
]);

const BILL_OF_LADING_HEADERS = new Set([
  "billoflading", "billofladingno", "billofladingnumber", "billofladingnumbers",
  "bl", "blno", "blnumber", "bol", "bolno", "mbl", "mblno", "masterbill",
  "masterbl", "masterbilloflading", "提单号", "提单编号", "海运提单号", "主提单号", "船公司提单号"
]);

const DETAIL_HEADERS = new Map([
  ["jobnumber", "forwarderJobNumber"],
  ["jobno", "forwarderJobNumber"],
  ["job", "forwarderJobNumber"],
  ["工作号", "forwarderJobNumber"],
  ["货代订单号", "forwarderJobNumber"],
  ["vesselvoy", "vesselVoyage"],
  ["vesselvoyage", "vesselVoyage"],
  ["vesselvyg", "vesselVoyage"],
  ["船名航次", "vesselVoyage"],
  ["pol", "portOfLoading"],
  ["portofloading", "portOfLoading"],
  ["装货港", "portOfLoading"],
  ["起运港", "portOfLoading"],
  ["pod", "portOfDischarge"],
  ["portofdischarge", "portOfDischarge"],
  ["卸货港", "portOfDischarge"],
  ["目的港", "portOfDischarge"],
  ["pono", "clientPoNumber"],
  ["ponumber", "clientPoNumber"],
  ["purchaseorderno", "clientPoNumber"],
  ["客户订单号", "clientPoNumber"],
  ["etd", "estimatedDeparture"],
  ["预计离港", "estimatedDeparture"],
  ["eta", "estimatedArrival"],
  ["预计到港", "estimatedArrival"],
  ["volume", "volume"],
  ["containerquantity", "volume"],
  ["箱量", "volume"],
  ["clientcode", "clientNameCode"],
  ["clientnamecode", "clientNameCode"],
  ["客户代码", "clientNameCode"]
]);

const CARRIER_BY_PREFIX = Object.freeze({
  COSU: "COSCO",
  CMDU: "CMA"
});

function headerType(value) {
  const normalized = normalizeHeader(value);
  if (BOOKING_HEADERS.has(normalized)) return "BOOKING";
  if (BILL_OF_LADING_HEADERS.has(normalized)) return "BILLOFLADING";
  return null;
}

function cleanCellText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function findBatchColumns(rows) {
  const scanLimit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const queryColumns = [];
    const detailColumns = new Map();
    for (const [columnIndex, value] of (rows[rowIndex] ?? []).entries()) {
      const type = headerType(value);
      if (type) queryColumns.push({ columnIndex, type });
      const detailKey = DETAIL_HEADERS.get(normalizeHeader(value));
      if (detailKey && !detailColumns.has(detailKey)) detailColumns.set(detailKey, columnIndex);
    }
    if (queryColumns.length > 0) {
      for (
        let detailRowIndex = rowIndex + 1;
        detailRowIndex < Math.min(rows.length, rowIndex + 3);
        detailRowIndex += 1
      ) {
        for (const [columnIndex, value] of (rows[detailRowIndex] ?? []).entries()) {
          const detailKey = DETAIL_HEADERS.get(normalizeHeader(value));
          if (detailKey && !detailColumns.has(detailKey)) {
            detailColumns.set(detailKey, columnIndex);
          }
        }
      }
      return { rowIndex, queryColumns, detailColumns };
    }
  }
  return null;
}

export function normalizeShipmentCandidate(type, rawValue) {
  const sourceText = String(rawValue ?? "").normalize("NFKC").trim();
  if (type === "BILLOFLADING" && /(?:\bBY\s*AIR\b|空运)/i.test(sourceText)) return null;
  const compact = sourceText
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!compact || compact.length > 39) return null;

  if (type === "BILLOFLADING") {
    const prefixed = compact.match(/^([A-Z]{4})([A-Z0-9-]{4,31})$/);
    if (prefixed) {
      const [, carrierPrefix, number] = prefixed;
      if (!/^[A-Z0-9-]{4,35}$/.test(number)) return null;
      return {
        carrier: CARRIER_BY_PREFIX[carrierPrefix] ?? null,
        carrierPrefix,
        number,
        originalBillOfLading: compact,
        unsupportedCarrierPrefix: !CARRIER_BY_PREFIX[carrierPrefix]
      };
    }
  }

  if (!/^[A-Z0-9-]{4,35}$/.test(compact)) return null;
  return {
    carrier: "COSCO",
    carrierPrefix: null,
    number: compact,
    originalBillOfLading: type === "BILLOFLADING" ? compact : null,
    unsupportedCarrierPrefix: false
  };
}

function importedDetailsForRow(row, header, candidate) {
  const details = {};
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
  for (const row of rows.slice(header.rowIndex + 1)) {
    for (const column of header.queryColumns) {
      const candidates = String(row?.[column.columnIndex] ?? "").split(/[\n,;，；]+/);
      for (const rawCandidate of candidates) {
        const candidate = normalizeShipmentCandidate(column.type, rawCandidate);
        if (!candidate) continue;
        const carrierKey = candidate.carrier ?? candidate.carrierPrefix ?? "UNKNOWN";
        const key = `${carrierKey}:${column.type}:${candidate.number}`;
        if (unique.has(key)) continue;
        const importedDetails = importedDetailsForRow(row, header, candidate);
        unique.set(key, {
          id: key,
          carrier: candidate.carrier,
          type: column.type,
          number: candidate.number,
          displayNumber: candidate.originalBillOfLading ?? candidate.number,
          importedDetails,
          status: candidate.unsupportedCarrierPrefix ? "failed" : "pending",
          source: null,
          error: candidate.unsupportedCarrierPrefix
            ? `Unsupported carrier prefix ${candidate.carrierPrefix}`
            : null,
          attempts: 0,
          updatedAt: null
        });
      }
    }
  }
  return unique;
}
