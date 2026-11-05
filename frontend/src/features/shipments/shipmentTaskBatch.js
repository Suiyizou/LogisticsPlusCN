export const canDeleteShipmentTask = (task) =>
  task?.status === "DRAFT" || (["COMPLETED", "STOPPED"].includes(task?.status) && task.pending === 0);

export const taskWasRemoved = (cause) =>
  cause?.code === "TASK_NOT_FOUND" || cause?.status === 404;

export const shipmentTaskSourceName = (fileName = "") =>
  fileName.replace(/\.[^.]+$/, "").trim() || fileName.trim();

export const shipmentTaskName = (task) =>
  task.taskName?.trim() || shipmentTaskSourceName(task.sourceFileName || "") || task.taskId;

export const shortShipmentTaskId = (id) => id.length > 12 ? id.slice(-10) : id;

export function matchesShipmentTask(task, query) {
  const search = query.trim().toLowerCase();
  return [shipmentTaskName(task), task.sourceFileName, task.taskId].some((value) =>
    value?.toLowerCase().includes(search)
  );
}

export function formatShipmentTaskTime(value, locale) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "";
}
