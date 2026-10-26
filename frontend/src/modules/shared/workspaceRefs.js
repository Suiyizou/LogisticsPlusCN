// @ts-check

/**
 * Vue ref callbacks accept DOM nodes, component instances and null. Retain only
 * the native input this workflow owns, without relying on browser globals.
 * @param {unknown} input
 * @returns {input is HTMLInputElement}
 */
export function isNativeFileInput(input) {
  return (
    typeof input === "object" && input !== null && "tagName" in input && input.tagName === "INPUT"
  );
}

/**
 * Preserve the original table instance; require only the methods workflows use.
 * The row generic describes the consumer's selection contract, not a new object.
 * @template Row
 * @param {unknown} table
 * @returns {table is import("../../types/workspace").TableSelectionHandle<Row>}
 */
export function isSelectionTable(table) {
  return (
    typeof table === "object" &&
    table !== null &&
    "clearSelection" in table &&
    typeof table.clearSelection === "function" &&
    (!("toggleRowSelection" in table) || typeof table.toggleRowSelection === "function")
  );
}
