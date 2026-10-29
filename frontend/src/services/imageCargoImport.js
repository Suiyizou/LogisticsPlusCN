import {
  calculatePackingTotals,
  invalidPackingIdentity,
  isImageFieldIssueResolved,
  taskReconciliation
} from "./packingReconciliation.js";

export const IMAGE_IMPORT_PROTOCOL = "cargo-image-v1";

export function supportsImageRecognition(capabilities) {
  return (
    capabilities?.imageRecognition === true &&
    capabilities?.imageTaskProtocol === IMAGE_IMPORT_PROTOCOL
  );
}

export function reviewImageImport(task, rows, confirmed = false) {
  const report = taskReconciliation(task);
  const contract =
    task?.taskType === "IMAGE" &&
    task?.inputContract === IMAGE_IMPORT_PROTOCOL &&
    report?.imageProtocol === IMAGE_IMPORT_PROTOCOL;
  const complete = contract && report?.complete === true && task?.status === "SUCCEEDED";
  const identities = new Set();
  const invalidRows = (rows || []).flatMap((row, index) => {
    const missing = [];
    if (!String(row.name || "").trim()) missing.push("name");
    for (const key of ["lengthCm", "widthCm", "heightCm", "weightKg"]) {
      if (!(Number.isFinite(Number(row[key])) && Number(row[key]) > 0)) missing.push(key);
    }
    if (!(
      Number.isSafeInteger(Number(row.quantity)) &&
      Number(row.quantity) > 0 &&
      Number(row.quantity) <= 2147483647
    ))
      missing.push("quantity");
    if (
      !["normal", "pallet"].includes(row.type) ||
      typeof row.nonStack !== "boolean" ||
      typeof row.keepUpright !== "boolean"
    )
      missing.push("handling");
    if (!String(row.sourceText || "").trim()) missing.push("sourceText");
    if (invalidPackingIdentity(row, identities)) missing.push("packageIdentity");
    return missing.length ? [{ index, fields: missing }] : [];
  });
  const sameRows = Array.isArray(task?.cleanedRows) && rows?.length === task.cleanedRows.length;
  const blockingIssues = (report?.blockingIssues || []).filter(
    (issue) => !isImageFieldIssueResolved(issue, rows || [], task?.cleanedRows)
  );
  if (report?.status === "blocked" && !(report?.blockingIssues || []).length)
    blockingIssues.push({ code: "IMAGE_SOURCE_INVALID" });
  const actual = calculatePackingTotals(rows);
  const expected = report?.expected || {};
  for (const field of ["packageCount", "innerQuantity", "grossWeightKg"]) {
    const source = expected[field];
    if (
      source != null &&
      (!Number.isFinite(Number(source)) ||
        actual[field] == null ||
        Math.abs(actual[field] - Number(source)) > 1e-6)
    )
      blockingIssues.push({ code: "IMAGE_SOURCE_TOTAL_MISMATCH", field });
  }
  return {
    complete,
    invalidRows,
    blockingIssues,
    actual,
    expected,
    sourceTotalsKnown: expected.packageCount != null && expected.grossWeightKg != null,
    canImport:
      complete &&
      sameRows &&
      rows.length > 0 &&
      !invalidRows.length &&
      !blockingIssues.length &&
      confirmed
  };
}

export function buildImageImportPayload(task, rows, confirmed) {
  const review = reviewImageImport(task, rows, confirmed);
  if (!review.canImport) throw new Error("Image source and cargo fields require review");
  const totals = calculatePackingTotals(rows);
  const sourceReport = taskReconciliation(task);
  const warnings = [...(sourceReport?.warnings || [])];
  if (
    !review.sourceTotalsKnown &&
    !warnings.some((issue) => issue.code === "IMAGE_SOURCE_TOTALS_UNKNOWN")
  )
    warnings.push({ code: "IMAGE_SOURCE_TOTALS_UNKNOWN" });
  const sourceVolume = sourceReport?.expected?.declaredVolumeM3;
  if (sourceVolume != null && Math.abs(totals.calculatedVolumeM3 - Number(sourceVolume)) > 1e-9)
    warnings.push({ code: "PACKAGE_SOURCE_VOLUME_MISMATCH" });
  const report = {
    basis: "image-reviewed",
    imageProtocol: IMAGE_IMPORT_PROTOCOL,
    sourceTaskId: task.id,
    status: "review-required",
    blockingIssues: [],
    warnings,
    expected: { ...(sourceReport?.expected || {}) },
    actual: totals,
    reviewedTotals: totals,
    sourceTotalsStatus: review.sourceTotalsKnown ? "provided" : "unknown",
    sourceTotalsEvidence: sourceReport?.sourceTotalsEvidence || "",
    sourceReport,
    humanSourceConfirmed: true,
    complete: true
  };
  const cargos = rows.map((row) => ({
    ...row,
    lengthCm: Number(row.lengthCm),
    widthCm: Number(row.widthCm),
    heightCm: Number(row.heightCm),
    weightKg: Number(row.weightKg),
    quantity: Number(row.quantity),
    packageInfo: {
      ...(row.packageInfo || {}),
      algorithmBasis: "image-reviewed",
      requiresSourceReview: false,
      sourceText: row.sourceText,
      sourceReconciliation: report
    }
  }));
  return { cargos, mode: "append", skippedRows: 0, importKind: "image", volumeConfirmed: true };
}
