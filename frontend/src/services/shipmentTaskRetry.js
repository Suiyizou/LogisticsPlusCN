// The API expects its persistent zero-based rowIndex, never an Excel sourceRow
// or the row's current position in a filtered/sorted view.
export function shipmentTaskRetryRows(task, item, busy = false) {
  if (busy || task?.status !== "COMPLETED" || item?.status !== "FAILED" ||
      !Array.isArray(task.items) || !task.items.includes(item) ||
      !Number.isSafeInteger(item.rowIndex) || item.rowIndex < 0 ||
      task.items.filter((entry) => entry.rowIndex === item.rowIndex).length !== 1) return null;
  return [item.rowIndex];
}

export function shipmentTaskRetryBody(rowNumbers) {
  // Omission deliberately keeps the existing whole-task retry action. An empty
  // or malformed selection must not accidentally turn into "retry every row".
  if (rowNumbers === undefined) return {};
  if (!Array.isArray(rowNumbers) || !rowNumbers.length ||
      rowNumbers.some((row) => !Number.isSafeInteger(row) || row < 0) ||
      new Set(rowNumbers).size !== rowNumbers.length) {
    throw new TypeError("A retry selection requires distinct nonnegative integer row indices");
  }
  return { rowNumbers: [...rowNumbers] };
}
