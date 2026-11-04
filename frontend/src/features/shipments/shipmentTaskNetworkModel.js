export const taskStateColors = Object.freeze({
  draft: "#64748b",
  pending: "#536b83",
  waiting: "#a16207",
  running: "#0369a1",
  persisting: "#6d28d9",
  done: "#15803d",
  attention: "#b45309",
  failed: "#be123c",
  cancelled: "#64748b",
  excluded: "#64748b",
  unknown: "#475569"
});

const displayStates = new Map(Object.entries({
  DRAFT: "draft",
  QUEUED: "pending",
  PENDING: "pending",
  WAITING: "waiting",
  RETRY_WAIT: "waiting",
  PAUSED: "waiting",
  RUNNING: "running",
  PERSISTING: "persisting",
  SUCCEEDED: "done",
  MANUAL: "attention",
  PARTIAL: "attention",
  FAILED: "failed",
  STOPPING: "cancelled",
  STOPPED: "cancelled",
  CANCELLED: "cancelled",
  EXCLUDED: "excluded"
}));

export function stateOf(status) {
  return displayStates.get(status) || "unknown";
}

export const isTaskActive = (status) =>
  ["QUEUED", "RUNNING", "WAITING", "RETRY_WAIT", "STOPPING"].includes(status);

export function taskStatusTone(task) {
  if (task?.status === "COMPLETED") {
    if (task.failed) return "failed";
    if (task.manual || task.partial) return "attention";
    if (task.cancelled) return "cancelled";
    if (task.total > 0 && task.succeeded === task.total) return "done";
  }
  return stateOf(task?.status);
}

export function hasTrackingResult(item) {
  return Boolean(item?.shipmentId || item?.payload?.snapshot);
}

export function sourceReferenceText(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  return [value.raw, value.normalized].find((reference) => typeof reference === "string" && reference.trim()) || "";
}

function graphItem(item, status, source) {
  const originalReference = sourceReferenceText(item.sourceReference) || sourceReferenceText(source?.originalReference);
  return {
    carrier: item.carrier || null,
    reference: item.displayNumber || item.number || originalReference,
    originalReference,
    status,
    resultReady: hasTrackingResult(item),
    item,
    source
  };
}

function indexRows(rows, field) {
  return new Map(rows.filter((row) => row[field] != null && row[field] !== "").map((row) => [row[field], row]));
}

export function toShipmentTaskNetwork(task) {
  if (!task?.taskId) return null;
  const sourceRows = Array.isArray(task.sourceRows) ? task.sourceRows : [];
  const items = Array.isArray(task.items) ? task.items : [];
  const draft = task.status === "DRAFT";
  const sourceById = indexRows(sourceRows, "id");
  const sourceByRow = indexRows(sourceRows, "sourceRow");
  const itemsById = indexRows(items, "id");
  const itemsByRow = indexRows(items, "sourceRow");
  const entries = draft && sourceRows.length
    ? sourceRows.map((row) => {
        const item = itemsById.get(row.id) || itemsByRow.get(row.sourceRow) || row;
        return graphItem(item, row.disposition === "EXCLUDE" ? "EXCLUDED" : "DRAFT", row);
      })
    : items.map((item) =>
        graphItem(
          item,
          draft ? "DRAFT" : item.status || "UNKNOWN",
          sourceById.get(item.id) || sourceByRow.get(item.sourceRow)
        )
      );
  return {
    id: task.taskId,
    label: task.sourceFileName || task.taskId,
    status: task.status,
    tone: taskStatusTone(task),
    draft,
    items: entries
  };
}

export function groupTaskStates(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.status, (counts.get(item.status) || 0) + 1);
  return [...counts].map(([status, count]) => ({ status, count }));
}

export function taskStatusForGroup(items) {
  const states = new Set(items.map(({ status }) => stateOf(status)));
  for (const state of [
    "running", "persisting", "failed", "attention", "waiting", "pending", "unknown", "draft"
  ]) if (states.has(state)) return state;
  return states.has("done") ? "done" : states.has("cancelled") ? "cancelled" : "excluded";
}

export function taskIdFromQuery(query) {
  return typeof query === "string" ? query.trim().slice(0, 128) : "";
}

export function shouldLoadTaskDetail(detail, summary, observedTimestamp, force = false) {
  if (force || !detail) return true;
  if (!summary) return isTaskActive(detail.status);
  return summary.status !== detail.status || Boolean(summary.updatedAt && summary.updatedAt !== observedTimestamp);
}
