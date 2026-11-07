import {
  buildShipmentBatchReview,
  identifyShipmentCarrier,
  parseShipmentBatchWorkbook,
  validShipmentBatchReference,
  isShipmentContainerReference,
  isShipmentContainerNumber
} from "../../services/shipmentBatchImport.js";
import {
  ALL_TRACKING_CARRIERS,
  supportsShipmentReference,
  trackingCarriersForMode
} from "../../services/trackingCarriers.js";
import { shipmentTaskSourceName } from "./shipmentTaskBatch.js";

const knownCarriers = new Set(ALL_TRACKING_CARRIERS.map(({ code }) => code));
export const taskRuns = new Set(["QUEUED", "RUNNING", "WAITING", "STOPPING", "RETRY_WAIT"]);
const issue = (code, message = "") => ({ code, message });

export function readTaskWorkbook(bytes, xlsx, fileName) {
  const workbook = /\.csv$/i.test(fileName)
    // Preserve references with leading zeros and decode Chinese headers with or without a BOM.
    ? xlsx.read(new TextDecoder().decode(bytes), { type: "string", raw: true })
    : xlsx.read(bytes, { type: "array", cellDates: false, cellNF: true });
  return parseShipmentBatchWorkbook(workbook, xlsx);
}

export function recognizeTaskWorkbook(sheet, column, { autoReferenceColumns = false, adapterMode } = {}) {
  const recognized = buildShipmentBatchReview(sheet, column, "", "BOOKING", { sourceCandidateLimit: 500, autoReferenceColumns, adapterMode });
  const sourceMeta = {
    sheetName: sheet?.name || "",
    column,
    autoReferenceColumns,
    needsColumnSelection: Boolean(autoReferenceColumns && sheet?.needsColumnSelection),
    columnLabel: sheet?.columns.find((entry) => entry.index === column)?.label || "",
    headers: sheet?.columns.map(({ label }) => label) || [],
    schemaStatus: sheet?.schemaStatus || "",
    modelRequired: Boolean(sheet?.modelRequired),
    modelVerified: Boolean(sheet?.modelVerified),
    recognitionSource: sheet?.recognitionSource || "",
    referenceSuggested: Number.isInteger(column) && sheet?.schemaSuggestion?.referenceColumnIndex === column,
    total: recognized.totalCandidates
  };
  return {
    sourceMeta,
    problems: [
      ...recognized.errors.filter(({ row }) => row <= (sheet?.headerRow || 0)),
      ...(sheet?.modelRequired && !sheet.modelVerified ? [issue("MODEL_RECOGNITION_REQUIRED")] : []),
      ...(recognized.outsideLimit ? [issue("BATCH_LIMIT")] : [])
    ],
    rows: recognized.rows.map((row, index) => ({
      id: recognized.queryItems[index]?.id || `${sheet.name}-row-${row.sourceRow}`,
      sourceRow: row.sourceRow,
      sourceCells: row.sourceCells,
      originalReference: row.originalReference,
      originalCarrier: row.carrier || "",
      carrierEvidence: row.carrierSource || "unknown",
      ...(row.carrierSource === "ai" ? { sourceCarrierLabel: row.carrierRemark } : {}),
      originalType: row.sourceReference?.type || row.type || "",
      defaultedBooking: Boolean(row.defaultedBooking),
      sourceAddress: row.sourceReference?.address || "",
      sourceIssues: row.errors,
      importedDetails: row.importedDetails || {},
      carrier: row.carrier || "",
      type: row.type || "",
      number: row.number || "",
      referenceEdited: false,
      disposition: "QUERY"
    }))
  };
}

export function createTaskEditor() {
  return {
    taskName: "",
    sourceFileName: "",
    channel: "AUTO",
    mode: "IMPORT",
    customerId: "",
    publishToCustomer: false,
    sourceMeta: null,
    rows: []
  };
}

export function restoreTaskEditor(task) {
  const rows = task.sourceRows || [];
  const sourceFileName = task.sourceFileName || "";
  const taskName = task.taskName || "";
  const editor = {
    ...createTaskEditor(),
    taskName: taskName === shipmentTaskSourceName(sourceFileName) ? "" : taskName,
    sourceFileName,
    channel: task.channel || "AUTO",
    mode: task.mode || "IMPORT",
    customerId: task.customerId || "",
    publishToCustomer: Boolean(task.publishToCustomer),
    sourceMeta: rows[0]?.sourceMeta || null
  };
  if (rows.length) {
    editor.rows = rows.map(({ sourceMeta: _meta, ...row }) => row);
  } else {
    editor.rows = (task.items || []).map((item, index) => ({
      ...item,
      sourceRow: item.sourceRow || index + 1,
      sourceCells: [],
      sourceIssues: [],
      originalReference: item.sourceReference || item.displayNumber || item.number || "",
      originalCarrier: item.carrier || "",
      originalType: item.type || "",
      disposition: item.manualOnly ? "MANUAL" : "QUERY"
    }));
  }
  return editor;
}

export function reviewTaskRows(editor, adapterMode) {
  const seen = new Set();
  const configured = new Set(trackingCarriersForMode(adapterMode).map(({ code }) => code));
  return editor.rows.map((row) => {
    const errors = [];
    const number = (row.number || "").trim();
    const carrier = row.carrier || "";
    const type = row.type || "";
    const manual = row.disposition === "MANUAL";
    if (row.disposition === "EXCLUDE") return { row, errors, item: null };
    if (editor.sourceMeta?.needsColumnSelection) errors.push(issue("CHOOSE_COLUMN"));
    if (!validShipmentBatchReference(number))
      errors.push(issue(number ? "INVALID_REFERENCE" : "MISSING_REFERENCE"));
    if (type === "CONTAINER" && !isShipmentContainerNumber(number)) errors.push(issue("INVALID_CONTAINER"));
    if (type !== "CONTAINER" && !(type === "BOOKING" && row.defaultedBooking) && isShipmentContainerReference(number))
      errors.push(issue("CONTAINER_REFERENCE"));
    if (editor.sourceMeta?.modelRequired && !editor.sourceMeta.modelVerified)
      errors.push(issue("MODEL_RECOGNITION_REQUIRED"));
    if (!row.referenceEdited && row.sourceIssues?.some(({ code }) => code === "UNSAFE_REFERENCE"))
      errors.push(issue("UNSAFE_REFERENCE"));
    if (!knownCarriers.has(carrier)) errors.push(issue("UNKNOWN_CARRIER"));
    else if (!manual && !configured.has(carrier)) errors.push(issue("CARRIER_NOT_CONFIGURED"));
    const inferred = type === "CONTAINER" || isShipmentContainerNumber(number) ? "" : identifyShipmentCarrier(number);
    if (inferred && carrier && inferred !== carrier) errors.push(issue("CARRIER_CONFLICT"));
    if (!["BILLOFLADING", "BOOKING", "CONTAINER"].includes(type)) errors.push(issue("MISSING_TYPE"));
    else if (
      !manual &&
      configured.has(carrier) &&
      !supportsShipmentReference(carrier, type, adapterMode)
    )
      errors.push(issue("UNSUPPORTED_REFERENCE"));
    if (!row.defaultedBooking && carrier === "COSCO" && type === "BOOKING" && /^COSU\d+$/i.test(number))
      errors.push(issue("REFERENCE_TYPE_CONFLICT"));
    if (manual && type !== "BOOKING") errors.push(issue("MANUAL_REQUIRES_BOOKING"));
    if (manual && editor.mode !== "IMPORT") errors.push(issue("MANUAL_REQUIRES_IMPORT"));
    if (number && type && carrier) {
      const identity = [carrier, type, number.toUpperCase()].join("|");
      if (seen.has(identity)) errors.push(issue("DUPLICATE_REFERENCE"));
      seen.add(identity);
    }
    const importedDetails = { ...row.importedDetails };
    if (type === "BILLOFLADING" && row.referenceEdited)
      importedDetails.originalBillOfLading = number;
    const item = {
      id: row.id,
      carrier: carrier || null,
      type,
      number,
      displayNumber: number,
      manualOnly: manual,
      importedDetails,
      sourceRow: row.sourceRow,
      sourceReference: row.originalReference || "",
      recognitionErrorCode: errors[0]?.code || "",
      recognitionError: errors[0]?.message || ""
    };
    return { row, errors, item };
  });
}

export function taskDraftPayload(editor, review) {
  const imports = editor.mode === "IMPORT";
  return {
    taskName: editor.taskName?.trim() || null,
    sourceFileName: editor.sourceFileName,
    channel: editor.channel,
    mode: editor.mode,
    customerId: imports ? editor.customerId || null : null,
    publishToCustomer: imports && editor.publishToCustomer,
    sourceRows: editor.rows.map((row, index) => ({
      ...row,
      ...(index === 0 ? { sourceMeta: editor.sourceMeta } : {})
    })),
    items: review.map(({ item }) => item).filter(Boolean)
  };
}

export function taskNeedsModelRecognition(task) {
  const sourceMeta = task?.sourceRows?.[0]?.sourceMeta || task?.sourceMeta;
  const fileSource = Boolean(task?.sourceFileName?.trim() || sourceMeta?.sheetName ||
    sourceMeta?.workbookSheetNames?.length || sourceMeta?.sourceFileName);
  const reviewedHeaders = sourceMeta?.recognitionSource === "HEADERS" && sourceMeta?.schemaStatus === "REVIEW_HEADERS";
  return fileSource && !reviewedHeaders && !(sourceMeta?.modelVerified === true && sourceMeta?.recognitionSource === "LLM");
}

export function taskMayPublish(task, { dirty, reviewed, issues, items }) {
  return Boolean(
    task?.status === "DRAFT" &&
    task.revision &&
    !dirty &&
    reviewed &&
    !issues &&
    !task.validationErrors?.length &&
    !taskNeedsModelRecognition(task) &&
    items &&
    (task.mode === "QUERY_ONLY" || task.customerId)
  );
}
