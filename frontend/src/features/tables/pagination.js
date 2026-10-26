// @ts-check
/** @param {unknown} value @param {number} fallback */
export function positiveInteger(value, fallback = 1) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** @param {unknown} page @param {unknown} total @param {unknown} pageSize */
export function boundedPage(page, total, pageSize) {
  return Math.min(
    positiveInteger(page),
    Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / positiveInteger(pageSize)))
  );
}

/**
 * @template Row
 * @param {readonly Row[]} items
 * @param {unknown} page
 * @param {unknown} pageSize
 * @returns {Row[]}
 */
export function pageSlice(items, page, pageSize) {
  const size = positiveInteger(pageSize);
  const start = (positiveInteger(page) - 1) * size;
  return items.slice(start, start + size);
}
