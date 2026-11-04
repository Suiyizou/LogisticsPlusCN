import {
  buildShipmentBatchReview,
  identifyShipmentCarrier,
  validShipmentBatchReference
} from "../../services/shipmentBatchImport.js";
import {
  ALL_TRACKING_CARRIERS,
  supportsShipmentReference,
  trackingCarriersForMode
} from "../../services/trackingCarriers.js";

const knownCarriers = new Set(ALL_TRACKING_CARRIERS.map(({ code }) => code));
export const taskRuns = new Set(["QUEUED", "RUNNING", "WAITING", "STOPPING", "RETRY_WAIT"]);
const issue = (code, message = "") => ({ code, message });

export function recognizeTaskWorkbook(sheet, column) {
  const recognized = buildShipmentBatchReview(sheet, column);
  const sourceMeta = {
    sheetName: sheet?.name || "",
    column,
    columnLabel: sheet?.columns.find((entry) => entry.index === column)?.label || "",
    headers: sheet?.columns.map(({ label }) => label) || [],
    total: recognized.totalCandidates
  };
  return {
    sourceMeta,
    problems: recognized.errors.filter(({ row }) => row <= (sheet?.headerRow || 0)),
    rows: recognized.rows.map((row, index) => ({
      id: recognized.queryItems[index]?.id || `${sheet.name}-row-${row.sourceRow}`,
      sourceRow: row.sourceRow,
      sourceCells: row.sourceCells,
      originalReference: row.originalReference,
      originalCarrier: row.carrier || "",
      carrierEvidence: row.carrierSource || "unknown",
      originalType: row.sourceReference?.type || row.type || "",
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
  const editor = {
    ...createTaskEditor(),
    sourceFileName: task.sourceFileName || "",
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
    if (!validShipmentBatchReference(number))
      errors.push(issue(number ? "INVALID_REFERENCE" : "MISSING_REFERENCE"));
    if (!row.referenceEdited && row.sourceIssues?.some(({ code }) => code === "UNSAFE_REFERENCE"))
      errors.push(issue("UNSAFE_REFERENCE"));
    if (!knownCarriers.has(carrier)) errors.push(issue("UNKNOWN_CARRIER"));
    else if (!manual && !configured.has(carrier)) errors.push(issue("CARRIER_NOT_CONFIGURED"));
    const inferred = identifyShipmentCarrier(number);
    if (inferred && carrier && inferred !== carrier) errors.push(issue("CARRIER_CONFLICT"));
    if (!["BILLOFLADING", "BOOKING"].includes(type)) errors.push(issue("MISSING_TYPE"));
    else if (
      !manual &&
      configured.has(carrier) &&
      !supportsShipmentReference(carrier, type, adapterMode)
    )
      errors.push(issue("UNSUPPORTED_REFERENCE"));
    if (carrier === "COSCO" && type === "BOOKING" && /^COSU\d+$/i.test(number))
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

export function taskMayPublish(task, { dirty, reviewed, issues, items }) {
  return Boolean(
    task?.status === "DRAFT" &&
    task.revision &&
    !dirty &&
    reviewed &&
    !issues &&
    !task.validationErrors?.length &&
    items &&
    (task.mode === "QUERY_ONLY" || task.customerId)
  );
}
