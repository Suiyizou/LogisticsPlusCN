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
  "\u8ba2\u8231\u53f7\u7801",
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
  "\u63d0\u5355\u53f7\u7801",
  "\u4e3b\u63d0\u5355\u53f7"
];
const CONTAINER_HEADERS = ["CONTAINER", "CONTAINERNO", "CONTAINERNUMBER", "CONTAINERID", "CNTRNO", "CNTRNUMBER", "\u7bb1\u53f7", "\u67dc\u53f7", "\u96c6\u88c5\u7bb1\u53f7", "\u96c6\u88c5\u7bb1\u7f16\u53f7", "\u8d27\u67dc\u53f7"];
const GENERIC_HEADERS = ["REFERENCE", "REFERENCENO", "REFERENCENUMBER", "SHIPMENTREF", "SHIPMENTREFERENCE", "SHIPMENTNO", "TRACKINGNO", "TRACKINGNUMBER", "\u5355\u53f7", "\u8fd0\u5355\u53f7", "\u7968\u53f7", "\u8d27\u8fd0\u5355\u53f7", "\u8d27\u8fd0\u53c2\u8003\u53f7", "\u8fd0\u8f93\u5355\u53f7", "\u8ffd\u8e2a\u5355\u53f7"];
const TYPE_HEADERS = ["REFERENCETYPE", "SHIPMENTNUMBERTYPE", "DOCUMENTTYPE", "\u5355\u53f7\u7c7b\u578b", "\u53f7\u7801\u7c7b\u578b", "\u7968\u53f7\u7c7b\u578b", "\u8fd0\u8f93\u5355\u53f7\u7c7b\u578b"];
const headerTypes = new Map([
  ...BILL_HEADERS.concat(["BL", "BOL", "MBL", "OCEANBILL", "BILLOFLADINGNO", "BILLOFLADINGNUMBER", "\u6d77\u8fd0\u63d0\u5355\u53f7", "\u6d77\u8fd0\u4e3b\u5355\u7f16\u53f7"]).map(key => [key, "BILLOFLADING"]),
  ...BOOKING_HEADERS.concat(["BOOKINGREF", "BKG", "BKGNO", "\u8ba2\u8231\u5355\u53f7", "\u6d77\u8fd0\u8ba2\u8231\u7f16\u53f7"]).map(key => [key, "BOOKING"]),
  ...CONTAINER_HEADERS.concat(["\u7bb1\u5b50\u53f7", "\u7bb1\u5b50\u53f7\u7801", "\u67dc\u53f7\u7801"]).map(key => [key, "CONTAINER"]),
  ...GENERIC_HEADERS.map(key => [key, "GENERIC"])
]);
const typeRank = { BILLOFLADING: 3, BOOKING: 2, CONTAINER: 1, GENERIC: 0 };
for (const key of ["\u53c2\u8003\u53f7", "\u53c2\u8003\u53f7\u7801", "\u53c2\u8003\u7f16\u53f7"]) headerTypes.set(key, "GENERIC");
function referenceHeaderKind(value) {
  const header = cellText(value);
  if (!safeReferenceHeader(header)) return null;
  const exact = headerTypes.get(normalizeHeader(header));
  if (exact) return exact;
  // A bilingual label must describe the same type on both sides. Keep B/L
  // intact when splitting separate translations on a spaced slash.
  const labels = header.split(/[()（）\n]+|\s+[/／]\s+/u).map(label => label.trim()).filter(Boolean);
  if (labels.length < 2) return null;
  const types = labels.map(label => headerTypes.get(normalizeHeader(label)));
  return types.every(type => type === types[0]) ? types[0] : null;
}
const equipmentShape = /^[A-Z]{3}[UJZ][0-9]{6}-?[0-9]$/i;
export function isShipmentContainerNumber(value) {
  return equipmentShape.test(value);
}
function rowReferenceType(value) {
  const key = normalizeHeader(value);
  if (["BL", "BOL", "MBL", "\u63d0\u5355", "\u4e3b\u63d0\u5355", "BILLOFLADING"].includes(key)) return "BILLOFLADING";
  if (["BK", "BKG", "\u8ba2\u8231"].includes(key)) return "BOOKING";
  if (["CN", "CNTR", "\u7bb1", "\u67dc"].includes(key)) return "CONTAINER";
  const type = headerTypes.get(key);
  return type === "GENERIC" ? null : type;
}

function plausibleUnlabelledNumber(value) {
  const text = cellText(value);
  return /^[A-Z0-9][A-Z0-9-]{3,34}$/i.test(text) && /\d/.test(text) &&
    !/^(?:\d{4}-\d{1,2}-\d{1,2}|(?:PO|JOB|SEAL|ORDER|INVOICE)[-_]?\d+)$/i.test(text);
}
const FIELD_ALIASES = {
  carrier: [
    "\u627f\u8fd0\u8239\u53f8",
    "CARRIER",
    "CARRIERCODE",
    "\u627f\u8fd0\u4eba",
    "\u8239\u516c\u53f8",
    "\u8239\u53f8",
    "\u8239\u53f8\u4ee3\u7801",
    "\u8239\u4e1c\u7b80\u79f0"
  ],
  originalBillOfLading: BILL_HEADERS,
  forwarderJobNumber: [
    "JOBNUMBER",
    "FORWARDERJOBNUMBER",
    "\u4e1a\u52a1\u5355\u53f7",
    "\u8d27\u4ee3\u8ba2\u5355\u53f7"
  ],
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
  WANHAI: "WAN_HAI",
  // Carrier labels from bilingual shipping schedules.
  "MATSON\u7f8e\u68ee": "MATSON",
  "HMM\u97e9\u65b0\u6d77\u8fd0": "HMM",
  "EVERGREEN\u957f\u8363EMC": "EVERGREEN",
  "MAERSK\u9a6c\u58eb\u57fa": "MAERSK",
  "MSC\u5730\u4e2d\u6d77": "MSC",
  "CMACGM\u8fbe\u98de": "CMA",
  "HPL\u8d6b\u4f2f\u7f57\u7279": "HAPAG_LLOYD",
  "OOCL\u4e1c\u65b9\u6d77\u5916": "OOCL",
  "YML\u9633\u660e": "YML",
  "WHL\u4e07\u6d77": "WAN_HAI"
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
  [/^MAEU[A-Z0-9]+$/i, "MAERSK"],
  [/^MEDU[A-Z0-9]+$/i, "MSC"],
  [/^(?:CMDU|TJN)[A-Z0-9]+$/i, "CMA"],
  [/^ONEY[A-Z0-9]+$/i, "ONE"],
  [/^(?:YMJ|YMLU)[A-Z0-9]+$/i, "YML"],
  [/^WHLC[A-Z0-9]+$/i, "WAN_HAI"],
  [/^SMLM[A-Z0-9]+$/i, "SML"],
  [/^OOLU[A-Z0-9]+$/i, "OOCL"],
  [/^HLCU[A-Z0-9]+$/i, "HAPAG_LLOYD"],
  [/^HDMU[A-Z0-9]+$/i, "HMM"],
  [/^MATS[A-Z0-9]+$/i, "MATSON"],
  [/^EGLV[A-Z0-9]+$/i, "EVERGREEN"],
  [/^KORP[A-Z0-9]+$/i, "KMTC"],
  [/^ZIMU[A-Z0-9]+$/i, "ZIM"]
];

export function identifyShipmentCarrier(reference) {
  return PREFIXES.find(([pattern]) => pattern.test(reference))?.[1] || "";
}

export function validShipmentBatchReference(reference) {
  return /^[A-Za-z0-9][A-Za-z0-9./-]{3,127}$/.test(reference) && /[0-9]/.test(reference);
}

export function isShipmentContainerReference(reference) {
  const value = String(reference).toUpperCase();
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(value)) return false;
  const checksum = [...value.slice(0, 10)].reduce((total, character, index) => {
    let number = Number(character);
    if (/[A-Z]/.test(character)) {
      number = character.charCodeAt(0) - 55;
      number += Math.floor((number - 1) / 10);
    }
    return total + number * 2 ** index;
  }, 0);
  return checksum % 11 % 10 === Number(value[10]);
}

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
        (referenceHeaderKind(value) || Object.values(FIELD_ALIASES)
          .flat()
          .concat([...headerTypes.keys()])
          .some((alias) => normalizeHeader(value) === normalizeHeader(alias))
          ? 1
          : 0),
      0
    );
  const headerless = scoreHeader(sourceRows[first]) === 0 &&
    !sourceRows[first].some(value => referenceHeaderHint.test(cellText(value)) || carrierHeaderHint.test(cellText(value))) &&
    sourceRows[first].some(plausibleUnlabelledNumber) &&
    sourceRows[first].every(value => !cellText(value) || plausibleUnlabelledNumber(value) ||
      RECOGNIZED_IMPORT_CARRIERS.has(normalizeCarrier(value)));
  let headerIndex = first;
  for (let r = first; r <= Math.min(last, first + 30); r++)
    if (scoreHeader(sourceRows[r] || []) > scoreHeader(sourceRows[headerIndex] || []))
      headerIndex = r;
  const width = Math.max(...sourceRows.slice(first, last + 1).map((row) => row.length));
  const hasHeader = !headerless || headerIndex !== first;
  const rows = sourceRows
    .slice(headerIndex, last + 1)
    .map((row) => Array.from({ length: width }, (_, c) => cellText(row[c])));
  if (!hasHeader) {
    rows.unshift(Array(width).fill(""));
    headerIndex--;
  }
  const headers = rows[0];
  const carrierColumns = headers.flatMap((header, index) => {
    if (header) return [];
    const values = rows.slice(1).map(row => row[index]).filter(Boolean);
    return values.length && values.every(value => RECOGNIZED_IMPORT_CARRIERS.has(normalizeCarrier(value))) ? [index] : [];
  });
  const carrierColumn = carrierColumns.length === 1 ? carrierColumns[0] : -1;
  const carrierContext = carrierColumn >= 0 || findHeaderIndex(headers, FIELD_ALIASES.carrier) >= 0;
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
    const unlabelled = !header && index !== carrierColumn && (carrierContext || (!hasHeader && width === 1)) &&
      values.some(plausibleUnlabelledNumber);
    const referenceKind = unlabelled ? "GENERIC" : referenceHeaderKind(header);
    const score = index === referenceColumn ? 30000
      : unlabelled ? 1 : referenceKind ? (typeRank[referenceKind] + 1) * 5000 : 0;
    const label =
      header ||
      (normalizeHeader(values[0]) === "VOLUME" ? "VOLUME" : `Column ${columnLetter(index)}`);
    return {
      index,
      header,
      label,
      nonEmptyCount: values.length,
      score,
      unlabelled,
      referenceKind,
      cosuCount: values.filter((v) => /^COSU\s*\d+$/.test(v)).length
    };
  });
  const ranked = [...columns].filter(c => c.score > 0).sort((a, b) => b.score - a.score);
  const suggested = ranked.find(c => c.nonEmptyCount) ?? ranked[0];
  return {
    name,
    headers,
    rows,
    columns,
    headerRow: headerIndex + 1,
    sourceRowNumbers: rows.map((_, i) => headerIndex + i + 1),
    operational,
    carrierColumn,
    needsColumnSelection: Boolean(suggested?.unlabelled && ranked.filter(c => c.unlabelled).length > 1),
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

const schemaLabelLimit = 32;
const schemaSampleLimit = 500;
const schemaTimeout = 45000;
const schemaCallLimit = 8;
const referenceHeaderHint =
  /\b(?:b\s*\/\s*l|bol|mbl|bkg|booking|lading|waybill|master bill|shipment ref(?:erence)?|ocean ref(?:erence)?|transport document|connaissement|conocimiento de embarque)\b|\u63d0\u5355|\u8ba2\u8231|\u8ba2\u8239|\u8231\u4f4d|\u6d77\u8fd0.*(?:\u5355|\u7f16\u53f7)|\u8fd0\u8f93\u5355\u636e/iu;
const carrierHeaderHint =
  /\b(?:carrier|shipping\s+(?:company|line)|ocean\s+(?:line|operator)|liner|scac|reederei|armateur|naviera)\b|\u8239\u53f8|\u8239\u516c\u53f8|\u627f\u8fd0|\u822a\u8fd0|\u8239\u4e1c/iu;
const carrierRemarkHint =
  /\b(?:remark|note|delivery|pickup|return|pending|hold|unknown|contact|address|street|road)\b|\u5907\u6ce8|\u9001\u8d27|\u63d0\u7bb1|\u8fd8\u7bb1|\u5f85\u786e\u8ba4|\u672a\u786e\u8ba4|\u672a\u77e5|\u8054\u7cfb|\u5ba2\u6237|\u5730\u5740|\u65b0\u533a|(?:\u5e02|\u53bf|\u533a).{0,8}(?:\u8def|\u8857|\u5927\u9053)/iu;

function safeSchemaLabel(label) {
  return (
    label.length <= 64 &&
    /^[\p{L}\p{M}][\p{L}\p{M} ._/'()\uff08\uff09\p{Dash_Punctuation}]*$/u.test(label) &&
    !/(?:www\.|[\p{L}][.][\p{L}]{2,}(?:$|[ /])|\/\/|\.\.)/iu.test(label)
  );
}

function safeReferenceHeader(header) {
  return !/house\s*(?:bill|b\s*\/\s*l)|\bhbl\b|\u5206\u63d0\u5355|\u8d27\u4ee3\u63d0\u5355|container\s*(?:type|size|count|quantity)|\u5c01\u53f7|\u94c5\u5c01|\u7bb1\u578b|\u7bb1\u91cf|\u67dc\u578b|\u67dc\u91cf/iu.test(header);
}
function validModelCarrierColumn(sheet, index, referenceIndex) {
  return (
    index !== referenceIndex &&
    (carrierHeaderHint.test(sheet.headers[index]) ||
      sheet.rows
        .slice(1, schemaSampleLimit + 1)
        .some((row) => RECOGNIZED_IMPORT_CARRIERS.has(normalizeCarrier(row[index]))))
  );
}

function safeCarrierLabel(label) {
  return (
    safeSchemaLabel(label) &&
    !carrierRemarkHint.test(label) &&
    !label.includes("/") &&
    label.split(/ +/).length <= 4 &&
    (!label.includes("\u6709\u9650\u516c\u53f8") ||
      /\u6d77\u8fd0|\u822a\u8fd0|\u8f6e\u8239|\u8239\u52a1|\u96c6\u8fd0|\u8239\u516c\u53f8/u.test(label))
  );
}

function schemaPreviewRows(sheet) {
  return buildShipmentBatchPreview(sheet, sheet.suggestedColumnIndex, "", "BOOKING", {
    includedSourceRows: sheet.sourceRowNumbers.slice(1, schemaSampleLimit + 1)
  }).rows;
}

/** The model selects sanitized column labels; identifiers are always read from source cells. */
export async function recognizeShipmentBatchSchemas(sheets, recognize) {
  const ruleSheets = sheets
    .filter(({ resultSheet, suggestedColumnIndex }) => !resultSheet && suggestedColumnIndex !== null)
    .sort((a, b) => b.columns[b.suggestedColumnIndex].score - a.columns[a.suggestedColumnIndex].score);
  const candidates = [
    ...ruleSheets,
    ...sheets.filter((sheet) => !sheet.resultSheet && !ruleSheets.includes(sheet))
  ];
  let calls = 0;
  async function request(headers, carrierLabels) {
    if ((!headers.length && !carrierLabels.length) || calls >= schemaCallLimit)
      return { status: "UNAVAILABLE", reasonCode: "RECOGNITION_LIMIT", modelVerified: false };
    calls++;
    const controller = new AbortController();
    let timeout;
    try {
      const timedOut = new Promise((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve({ status: "UNAVAILABLE", reasonCode: "MODEL_TIMEOUT", modelVerified: false });
        }, schemaTimeout);
      });
      const result = await Promise.race([
        recognize({ headers, carrierLabels }, { signal: controller.signal }),
        timedOut
      ]);
      if (result?.recognitionSource !== "LLM" || result.modelVerified !== true)
        return { status: "UNAVAILABLE", reasonCode: result?.reasonCode || "MODEL_UNAVAILABLE", modelVerified: false };
      return result;
    } catch {
      return { status: "UNAVAILABLE", reasonCode: "MODEL_UNAVAILABLE", modelVerified: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  const enriched = new Map();
  for (const sheet of candidates) {
    if (sheet.columns[sheet.suggestedColumnIndex]?.unlabelled) {
      // There are no reference headers for an LLM to classify. Keep the raw
      // identifiers on this machine and make ambiguous column choices explicit.
      enriched.set(sheet, { ...sheet, modelVerified: false, modelRequired: false,
        recognitionSource: "HEADERS", schemaStatus: "REVIEW_HEADERS" });
      continue;
    }
    const plausibleReferenceColumns = new Set(
      sheet.columns.filter(({ index, header, score }) =>
        // This operational template labels its internal job number and ocean
        // bill alike. The verified template mapping identifies the real bill.
        (!sheet.operational || index === sheet.referenceColumn) &&
        safeReferenceHeader(header) && (score > 0 || referenceHeaderHint.test(header)) &&
        sheet.rows.slice(1).some((row) => validShipmentBatchReference(row[index]))
      ).map(({ index }) => index)
    );
    const headers = (plausibleReferenceColumns.size ? sheet.columns : []).filter(({ index, header }) =>
      index <= 16383 && safeSchemaLabel(header.replace(/[:：]\s*$/, "")) &&
      (plausibleReferenceColumns.has(index) ||
        ((!sheet.operational || index !== 0) && validModelCarrierColumn(sheet, index, null)))
    ).map(({ index, header }) => ({ index, label: header.replace(/[:：]\s*$/, "").trim() }));
    const base = { ...sheet, modelRequired: true, recognitionSource: "LLM", modelVerified: false };
    if (!headers.length || headers.length > schemaLabelLimit) {
      enriched.set(sheet, { ...base, schemaStatus: "NO_MATCH", schemaReasonCode: "NO_SAFE_COLUMNS" });
      continue;
    }
    const suggestion = await request(headers, []);
    const eligible = (index) => Number.isInteger(index) && headers.some((entry) => entry.index === index);
    const referenceColumnIndex = suggestion.referenceColumnIndex;
    const type = suggestion.referenceType;
    const carrierColumnIndex = suggestion.carrierColumnIndex;
    const ruleCarrierIndex = findHeaderIndex(sheet.headers, FIELD_ALIASES.carrier);
    const headerKind = sheet.columns[referenceColumnIndex]?.referenceKind;
    const knownReferenceType = headerKind === "GENERIC" ? "BOOKING" : headerKind;
    if (suggestion.status !== "SUGGESTED" || !eligible(referenceColumnIndex) ||
        !plausibleReferenceColumns.has(referenceColumnIndex) ||
        !["BOOKING", "BILLOFLADING", "CONTAINER"].includes(type) ||
        (knownReferenceType && knownReferenceType !== type) ||
        (sheet.operational && referenceColumnIndex !== sheet.referenceColumn) ||
        (ruleCarrierIndex >= 0 && carrierColumnIndex != null && carrierColumnIndex !== ruleCarrierIndex) ||
        (carrierColumnIndex != null && (!eligible(carrierColumnIndex) ||
          !validModelCarrierColumn(sheet, carrierColumnIndex, referenceColumnIndex)))) {
      if (suggestion.status === "UNAVAILABLE" && sheet.columns[sheet.suggestedColumnIndex]?.referenceKind) {
        enriched.set(sheet, { ...sheet, modelVerified: false, modelRequired: false, recognitionSource: "HEADERS",
          schemaStatus: "REVIEW_HEADERS", schemaReasonCode: suggestion.reasonCode });
        continue;
      }
      enriched.set(sheet, { ...base,
        schemaStatus: suggestion.status === "UNAVAILABLE" ? "UNAVAILABLE" : "NO_MATCH",
        schemaReasonCode: suggestion.reasonCode || "AMBIGUOUS_COLUMNS"
      });
      continue;
    }
    let resolved = {
      ...base,
      modelVerified: true,
      schemaStatus: "SUGGESTED",
      columns: sheet.columns.map((column) => column.index === referenceColumnIndex ? { ...column, score: Math.max(1, column.score) } : column),
      suggestedColumnIndex: sheet.suggestedColumnIndex ?? referenceColumnIndex,
      schemaSuggestion: { referenceColumnIndex, referenceType: type, carrierColumnIndex }
    };
    const carrierIndex = ruleCarrierIndex >= 0 ? ruleCarrierIndex : carrierColumnIndex;
    if (Number.isInteger(carrierIndex) && carrierIndex >= 0) {
      const unresolvedLabels = schemaPreviewRows(resolved)
        .filter(({ errors }) => errors.length === 1 && errors[0].code === "UNKNOWN_CARRIER")
        .map(({ sourceRow }) => sheet.rows[sourceRow - sheet.headerRow]?.[carrierIndex])
        .filter((label) => label && safeCarrierLabel(label));
      const carrierLabels = [...new Set(unresolvedLabels)];
      const carrierMappings = {};
      for (let offset = 0; offset < carrierLabels.length; offset += schemaLabelLimit) {
        const labels = carrierLabels.slice(offset, offset + schemaLabelLimit);
        const mapped = await request([], labels);
        if (mapped.status === "UNAVAILABLE") {
          resolved = { ...resolved, modelVerified: false, schemaStatus: "UNAVAILABLE", schemaReasonCode: mapped.reasonCode };
          break;
        }
        const mappings = Array.isArray(mapped.carrierMappings) ? mapped.carrierMappings : [];
        for (const label of labels) {
          const matches = mappings.filter((entry) => entry?.label === label);
          if (mapped.status === "SUGGESTED" && matches.length === 1 && RECOGNIZED_IMPORT_CARRIERS.has(matches[0].carrier))
            carrierMappings[label] = matches[0].carrier;
        }
      }
      resolved.schemaSuggestion.carrierMappings = carrierMappings;
    }
    enriched.set(sheet, resolved);
  }
  return sheets.map((sheet) => enriched.get(sheet) || sheet);
}
/** @param {{ adapterMode?: string, includedSourceRows?: number[], queryOnly?: boolean, autoReferenceColumns?: boolean }} [options] */
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
  const includedSourceRows = options.includedSourceRows
    ? new Set(options.includedSourceRows)
    : null;
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
  if (sheet?.resultSheet) {
    preview.errors.push({
      row: sheet.headerRow,
      code: "RESULT_WORKBOOK",
      message: "Tracking result workbook is not a task import workbook"
    });
    return preview;
  }
  if (sheet && !sheet.resultSheet && !sheet.columns.some((column) => column.score > 0)) {
    preview.errors.push({
      row: sheet.headerRow,
      code: "UNRECOGNIZED_TASK_SHEET",
      message:
        "This sheet has no recognized booking or bill-of-lading header. Packing cargo is not a tracking task workbook."
    });
    return preview;
  }
  if (
    !sheet ||
    selectedColumnIndex === null ||
    selectedColumnIndex === "" ||
    !Number.isInteger(Number(selectedColumnIndex))
  )
    return preview;
  const selected = Number(selectedColumnIndex);
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
  if (fieldIndexes.carrier < 0 && sheet.carrierColumn >= 0) fieldIndexes.carrier = sheet.carrierColumn;
  const suggestion = sheet.schemaSuggestion;
  const suggestedCarrierColumn =
    fieldIndexes.carrier < 0 && Number.isInteger(suggestion?.carrierColumnIndex);
  if (suggestedCarrierColumn) fieldIndexes.carrier = suggestion.carrierColumnIndex;
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
  if (sheet.operational && selected !== sheet.referenceColumn)
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
  const importedFields = (r) => {
    const fields = Object.fromEntries(
      Object.entries(fieldIndexes)
        .filter(([field]) => field !== "carrier")
        .map(([field, c]) => [field, c >= 0 ? mergedValue(r, c) : ""])
    );
    if (normalizeHeader(fields.volume) === "VOLUME") fields.volume = "";
    return fields;
  };
  const fallbackColumns = options.autoReferenceColumns && !sheet.operational
    ? [...sheet.columns].filter(column => column.referenceKind && !column.unlabelled && column.index !== selected)
        .sort((a, b) => b.score - a.score).map(column => column.index)
    : [];
  const typeColumn = findHeaderIndex(headers, TYPE_HEADERS);
  for (let r = 1; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r];
    const row = sheet.sourceRowNumbers[r];
    if (includedSourceRows && !includedSourceRows.has(row)) continue;
    // A merged reference owns its continuation rows; never import an extra ticket
    // for the container or booking printed alongside such a continuation.
    const col = [selected, ...fallbackColumns].find(index => mergedValue(r, index)) ?? selected;
    const original = cellText(cells[col]);
    const kind = sheet.columns[col]?.referenceKind;
    const declared = typeColumn >= 0 ? mergedValue(r, typeColumn) : "";
    const rowType = declared ? rowReferenceType(declared) : null;
    const generic = kind === "GENERIC";
    const selectedType = generic ? "BOOKING"
      : kind || (suggestion?.referenceColumnIndex === col ? suggestion.referenceType : referenceType);
    const headerType = declared ? rowType || "" : selectedType;
    const defaultedBooking = generic && !declared;
    if (!cells.some(Boolean)) {
      preview.skipped++;
      continue;
    }
    if (!original) {
      // Only actual merged-reference continuations are safely ignored.
      const merged = sheet.merges.some(
        (m) => m.s.c === col && m.e.c === col && m.s.r < row - 1 && m.e.r >= row - 1
      );
      if (!merged) {
        const error = {
          row,
          code: "MISSING_REFERENCE",
          message: "Non-empty row has no tracking reference"
        };
        preview.errors.push(error);
        const carrierCell = cellText(mergedValue(r, fieldIndexes.carrier));
        const explicit =
          suggestedCarrierColumn && !RECOGNIZED_IMPORT_CARRIERS.has(normalizeCarrier(carrierCell))
            ? ""
            : carrierCell;
        preview.rows.push({
          sourceRow: row,
          originalReference: "",
          number: "",
          carrier: normalizeCarrier(explicit),
          carrierSource: explicit ? (suggestedCarrierColumn ? "ai" : "cell") : "selection",
          carrierRemark: suggestedCarrierColumn ? carrierCell : "",
          type: headerType,
          sourceReference: {
            raw: "",
            normalized: "",
            type: headerType,
            address: columnLetter(col) + row
          },
          importedDetails: importedFields(r),
          errors: [error],
          status: "BLOCKED"
        });
      } else preview.skipped++;
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
    let rawReference = cleaned.replace(/^COSU\s+(\d+)$/i, "COSU$1");
    if (headerType === "CONTAINER" && isShipmentContainerNumber(rawReference)) rawReference = rawReference.replace("-", "").toUpperCase();
    const rowErrors = [];
    const add = (code, message) => {
      const error = { row, code, message };
      rowErrors.push(error);
      preview.errors.push(error);
    };
    if (!validShipmentBatchReference(rawReference))
      add("INVALID_REFERENCE", "Reference contains unrecognized text or multiple identifiers");
    if (declared && !rowType) add("MISSING_TYPE", "Unknown reference type in the source type column");
    if (headerType === "CONTAINER" && !isShipmentContainerNumber(rawReference))
      add("INVALID_CONTAINER", "Container references require the full equipment number");
    if (headerType !== "CONTAINER" && !defaultedBooking && isShipmentContainerReference(rawReference))
      add("CONTAINER_REFERENCE", "A container identifier must not be submitted as a booking or ocean bill");
    if (sheet.unsafeCells.some((c) => c.r === row - 1 && c.c === col))
      add(
        "UNSAFE_REFERENCE",
        "Numeric reference or formula cannot be preserved precisely; use a text cell"
      );
    const carrierCell = cellText(mergedValue(r, fieldIndexes.carrier));
    const inferred = headerType === "CONTAINER" || isShipmentContainerNumber(rawReference) ? "" : identifyShipmentCarrier(rawReference);
    const vessel = cellText(cells[fieldIndexes.vesselVoyage]);
    const vesselCarrier = headerType !== "CONTAINER" && /^SM\s+(?:SEOUL|KWANGYANG|YANTIAN)\b/i.test(vessel) ? "SML" : "";
    // A carrier cell may contain a delivery remark. Preserve it as source text
    // when independent evidence identifies the carrier. Known aliases still bind.
    const knownExplicit = RECOGNIZED_IMPORT_CARRIERS.has(normalizeCarrier(carrierCell));
    const suggestedCarrier =
      !inferred && !vesselCarrier && !defaultCarrier
        ? Object.hasOwn(suggestion?.carrierMappings || {}, carrierCell)
          ? suggestion.carrierMappings[carrierCell]
          : ""
        : "";
    const explicit =
      suggestedCarrier ||
      (!knownExplicit && (suggestedCarrierColumn || options.queryOnly || inferred || vesselCarrier))
        ? ""
        : carrierCell;
    const carrier = normalizeCarrier(
      explicit || inferred || vesselCarrier || suggestedCarrier || (options.queryOnly ? "" : defaultCarrier)
    );
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
    // Only the legacy COSCO route converts a bill to its numeric BOOKING query.
    // LOCAL_QUEUE receives the original bill identity; CMA still requires BOOKING.
    const type = !localQueue && headerType === "BILLOFLADING" && ["CMA", "COSCO"].includes(carrier) ? "BOOKING" : headerType;
    if (!defaultedBooking && localQueue && carrier === "COSCO" && type === "BOOKING" && /^COSU\d+$/i.test(rawReference))
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
    const importedDetails = importedFields(r);
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
      defaultedBooking,
      originalReference: original,
      number,
      carrier,
      carrierSource: explicit
        ? suggestedCarrierColumn ? "ai" : "cell"
        : inferred
          ? "prefix"
          : vesselCarrier
            ? "vessel"
            : suggestedCarrier
              ? "ai"
              : "selection",
      carrierRemark: suggestedCarrierColumn || carrierCell !== explicit ? carrierCell : "",
      sourceReference: {
        raw: original,
        normalized: rawReference,
        type: headerType,
        address: columnLetter(col) + row
      },
      adapterMode,
      type,
      importedDetails: { ...importedDetails },
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

/** Local-only review scope; every parsing pass uses the same production parser.
 * @param {{adapterMode?:string,sourceCandidateLimit?:number,excludedSourceRows?:number[],queryOnly?:boolean,autoReferenceColumns?:boolean}} [options]
 */
export function buildShipmentBatchReview(
  sheet,
  column,
  carrier = "",
  type = "BOOKING",
  options = {}
) {
  const full = buildShipmentBatchPreview(sheet, column, carrier, type, options);
  const candidates = [
    ...new Set([
      ...full.rows.map((row) => row.sourceRow),
      ...full.errors
        .filter((issue) => issue.row > (sheet?.headerRow || 0))
        .map((issue) => issue.row)
    ])
  ].sort((a, b) => a - b);
  const sourceLimit = Math.max(1, Math.min(500, Number(options.sourceCandidateLimit) || 60));
  const windowRows = candidates.slice(0, sourceLimit);
  const excluded = new Set(
    (options.excludedSourceRows || []).filter((row) => windowRows.includes(row))
  );
  const displayed = buildShipmentBatchPreview(sheet, column, carrier, type, {
    ...options,
    includedSourceRows: windowRows
  });
  const selected = buildShipmentBatchPreview(sheet, column, carrier, type, {
    ...options,
    includedSourceRows: windowRows.filter((row) => !excluded.has(row))
  });
  const rows = windowRows.map((sourceRow) => {
    const original = displayed.rows.find((row) => row.sourceRow === sourceRow);
    const errors = displayed.errors.filter((issue) => issue.row === sourceRow);
    return {
      ...(original || {
        sourceRow,
        originalReference: "",
        number: "",
        carrier: "",
        carrierSource: "",
        type: "",
        errors,
        status: "BLOCKED"
      }),
      sourceCells: sheet?.rows?.[sheet.sourceRowNumbers.indexOf(sourceRow)] || [],
      excluded: excluded.has(sourceRow),
      status: excluded.has(sourceRow) ? "EXCLUDED" : original?.status || "BLOCKED"
    };
  });
  const queryItems = displayed.errors.some((issue) => issue.row <= (sheet?.headerRow || 0))
    ? []
    : rows.map((row) => {
        const item = selected.items.find(
          (entry) => entry.id === `${sheet.name}-row-${row.sourceRow}`
        );
        const issue = row.errors[0];
        return {
          ...(item || {
            id: `${sheet.name}-row-${row.sourceRow}`,
            carrier: row.carrier || null,
            type: row.type || "BILLOFLADING",
            number: row.number || "",
            displayNumber: row.originalReference || "",
            manualOnly: false,
            importedDetails: {}
          }),
          sourceRow: row.sourceRow,
          sourceReference: row.sourceReference?.raw || row.originalReference || "",
          recognitionErrorCode: issue?.code || "",
          recognitionError: issue?.message || ""
        };
      });
  return {
    ...selected,
    queryItems,
    rows,
    totalCandidates: candidates.length,
    sourceLimit,
    windowCount: windowRows.length,
    outsideLimit: Math.max(0, candidates.length - windowRows.length),
    excludedCount: excluded.size
  };
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
  const n = normalizeHeader(value).replace(/\p{Dash_Punctuation}/gu, "");
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
