/** Read shared CSS tokens when a chart renders; keep server-side builders DOM-independent.
 * @param {string} name
 * @returns {string}
 */
export function chartToken(name) {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined")
    return "currentColor";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "currentColor";
}
