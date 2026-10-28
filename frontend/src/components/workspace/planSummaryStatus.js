/** UI status for the existing candidate classifications; does not select or recalculate a plan.
 * @param {{green:number,yellow:number,estimated:number,red:number,oversize:number}} counts
 * @returns {{tone:"success"|"warning"|"danger"|"info",labelKey:string}}
 */
export function planSummaryStatus(counts) {
  if (counts.green > 0) return { tone: "success", labelKey: "resultQualified" };
  if (counts.yellow > 0) return { tone: "warning", labelKey: "resultWarning" };
  if (counts.estimated > 0) return { tone: "warning", labelKey: "resultEstimated" };
  if (counts.red > 0 || counts.oversize > 0) return { tone: "danger", labelKey: "resultUnusable" };
  return { tone: "info", labelKey: "resultNone" };
}
