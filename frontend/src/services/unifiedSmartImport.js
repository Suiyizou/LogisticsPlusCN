import { cargoProvenance, reviewPackingTask, taskReconciliation } from "./packingReconciliation.js";
import { reviewImageImport } from "./imageCargoImport.js";

// Both recognizers return canonical centimetres and kilograms. Never compare raw, inferred units.
export const CROSS_CHECK_FIELDS = ["lengthCm", "widthCm", "heightCm", "quantity", "weightKg"];
const text = (value) => String(value ?? "").trim();
const number = (value) =>
  value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const sameNumber = (a, b) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-10);
const sourceRows = (row) => {
  const value = cargoProvenance(row).sourceRows;
  return Array.isArray(value) ? [...value].map(String).sort().join(",") : text(value);
};
function identity(row) {
  const provenance = cargoProvenance(row);
  const packageNo = text(provenance.packageNo);
  const marks = text(provenance.marks);
  if (packageNo || marks) return `package:${packageNo || marks}`;
  const rows = sourceRows(row);
  return rows && text(provenance.sourceSheet) ? `source:${provenance.sourceSheet}:${rows}` : "";
}

export function classifySmartImportFile(file) {
  const name = text(file?.name).toLowerCase();
  if (/\.(xlsx|xls|csv|tsv)$/.test(name)) return "workbook";
  if (/\.(png|jpe?g)$/.test(name) && ["", "image/png", "image/jpeg"].includes(file?.type || ""))
    return "image";
  return null;
}

/** Compare independent proposals; neither result repairs the other result's source reconciliation. */
export function crossCheckImportEvidence(workbook, image) {
  const differences = [];
  const add = (code, identity = "", field = "", workbookValue = null, imageValue = null) =>
    differences.push({ code, identity, field, workbookValue, imageValue });
  if (!workbook?.task || !image?.task || workbook.busy || image.busy) {
    add("pending");
    return { canImport: false, differences, matchedCount: 0 };
  }
  const workbookReview = reviewPackingTask(workbook.task, workbook.rows, { volumeConfirmed: true });
  const imageReview = reviewImageImport(image.task, image.rows, true);
  if (workbook.task.status !== "SUCCEEDED" || !workbookReview.canImport) add("workbookBlocked");
  if (!imageReview.canImport) add("imageBlocked");
  const left = new Map(),
    right = new Map();
  for (const [rows, index, side] of [
    [workbook.rows, left, "workbook"],
    [image.rows, right, "image"]
  ]) {
    for (const row of rows || []) {
      const key = identity(row);
      if (
        !key ||
        index.has(key) ||
        Number(row.quantity) !== 1 ||
        /\d\s*(?:[-–—~～]|\.\.|\bto\b|\u81f3|\u5230)\s*#?\s*\d/i.test(key)
      ) {
        add("identityUncertain", key, side);
        continue;
      }
      index.set(key, row);
    }
  }
  let matchedCount = 0;
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key),
      b = right.get(key);
    if (!a || !b) {
      add("unmatched", key, "", a ? "present" : null, b ? "present" : null);
      continue;
    }
    const before = differences.length;
    for (const field of CROSS_CHECK_FIELDS) {
      const av = number(a[field]),
        bv = number(b[field]);
      if (av == null || bv == null || av <= 0 || bv <= 0)
        add("missingField", key, field, a[field], b[field]);
      else if (!sameNumber(av, bv)) add("fieldConflict", key, field, av, bv);
    }
    for (const field of ["name", "model", "type", "nonStack", "keepUpright"]) {
      const av = a[field],
        bv = b[field];
      if (field === "model" && !text(av) && !text(bv)) continue;
      if (av == null || bv == null || text(av) === "" || text(bv) === "")
        add("missingField", key, field, av, bv);
      else if (text(av) !== text(bv)) add("fieldConflict", key, field, av, bv);
    }
    const ap = cargoProvenance(a),
      bp = cargoProvenance(b);
    for (const [field, av, bv] of [
      ["sourceSheet", text(ap.sourceSheet), text(bp.sourceSheet)],
      ["sourceRows", sourceRows(a), sourceRows(b)],
      ["marks", text(ap.marks), text(bp.marks)]
    ]) {
      if (av && bv && av !== bv) add("fieldConflict", key, field, av, bv);
    }
    if (before === differences.length) matchedCount++;
  }
  const expectedA = taskReconciliation(workbook.task)?.expected || {};
  const expectedB = taskReconciliation(image.task)?.expected || {};
  for (const field of ["packageCount", "innerQuantity", "grossWeightKg", "declaredVolumeM3"]) {
    const a = number(expectedA[field]),
      b = number(expectedB[field]);
    if (a != null && b != null && !sameNumber(a, b)) add("sourceTotalConflict", "", field, a, b);
  }
  if (!left.size || !right.size) add("noRows");
  return { canImport: differences.length === 0, differences, matchedCount };
}
