const WORKBOOK_PROTOCOL = "workbook-evidence-v1";

export function supportsWorkbookRecognition(capabilities) {
  return (
    capabilities?.workbookTools === true && capabilities?.workbookToolProtocol === WORKBOOK_PROTOCOL
  );
}

export function supportsTextRecognition(capabilities) {
  if (supportsWorkbookRecognition(capabilities)) return true;
  const version = /^excel-agent-batch-v(\d+)$/.exec(String(capabilities?.engineVersion || ""));
  return capabilities?.adaptiveBatching === true && Number(version?.[1] || 0) >= 4;
}

export function supportsCreatedRecognitionTask(task, capabilities, workbook = false) {
  const version = String(task?.serverEngineVersion || "");
  if (
    supportsWorkbookRecognition(capabilities) &&
    /^excel-package-evidence-v([7-9]|[1-9]\d+)$/.test(version)
  )
    return true;
  if (workbook) return false;
  const legacy = /^excel-agent-batch-v(\d+)$/.exec(version);
  return task?.serverAdaptiveBatching === true && Number(legacy?.[1] || 0) >= 4;
}

export function taskReconciliation(task) {
  return (
    task?.reconciliation ||
    task?.issues?.find((issue) => issue?.code === "PACKAGE_RECONCILIATION")?.reconciliation ||
    null
  );
}

export function recognitionDataIssues(task) {
  return (task?.issues || []).filter((issue) => issue?.code !== "PACKAGE_RECONCILIATION");
}

export function cargoProvenance(cargo = {}) {
  const info = cargo.packageInfo;
  return {
    ...(cargo.packageNo != null || info?.packageNo != null
      ? { packageNo: cargo.packageNo ?? info.packageNo }
      : {}),
    ...(cargo.marks != null || info?.marks != null ? { marks: cargo.marks ?? info.marks } : {}),
    ...(cargo.sourceSheet != null || info?.sourceSheet != null
      ? { sourceSheet: cargo.sourceSheet ?? info.sourceSheet }
      : {}),
    ...(cargo.sourceRows != null || info?.sourceRows != null
      ? { sourceRows: cargo.sourceRows ?? info.sourceRows }
      : {}),
    packageInfo: info || null
  };
}

export function packingNumbers(cargo = {}) {
  return Object.fromEntries(
    ["lengthCm", "widthCm", "heightCm", "quantity", "weightKg"].map((field) => [
      field,
      Number(cargo[field] ?? 0)
    ])
  );
}

export function packageSourceLabel(cargo = {}) {
  const identity = cargoProvenance(cargo);
  const rows = Array.isArray(identity.sourceRows)
    ? identity.sourceRows.join(", ")
    : String(identity.sourceRows || "");
  return [identity.sourceSheet, rows].filter(Boolean).join(" · ") || "—";
}

export function packageIdentityLabel(cargo = {}) {
  const identity = cargoProvenance(cargo);
  return (
    [identity.packageNo, identity.marks]
      .filter((part) => part != null && part !== "")
      .join(" · ") || "—"
  );
}

export function packingIdentityKey(cargo = {}) {
  const identity = cargoProvenance(cargo);
  return JSON.stringify([
    identity.sourceSheet || "",
    identity.packageNo || "",
    identity.marks || "",
    identity.sourceRows || []
  ]);
}

function numeric(value) {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}

function contentQuantity(cargo) {
  const inner = cargo.packageInfo?.innerCargo;
  const total = numeric(inner?.totalQuantity);
  if (total != null) return total;
  if (!Array.isArray(inner?.lines) || !inner.lines.length) return null;
  const quantities = inner.lines.map((line) => numeric(line.quantity));
  return quantities.every((quantity) => quantity != null)
    ? quantities.reduce((sum, quantity) => sum + quantity, 0)
    : null;
}

export function calculatePackingTotals(rows = []) {
  let hasInnerQuantity = rows.length > 0;
  const totals = { packageCount: 0, innerQuantity: 0, grossWeightKg: 0, calculatedVolumeM3: 0 };
  for (const row of rows) {
    const values = packingNumbers(row);
    totals.packageCount += values.quantity;
    totals.grossWeightKg += values.quantity * values.weightKg;
    totals.calculatedVolumeM3 +=
      (values.quantity * values.lengthCm * values.widthCm * values.heightCm) / 1e6;
    const inner = contentQuantity(row);
    if (inner == null) hasInnerQuantity = false;
    else totals.innerQuantity += inner;
  }
  if (!hasInnerQuantity) totals.innerQuantity = null;
  return totals;
}

function matches(actual, expected, tolerance = 1e-6) {
  return (
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * 1e-10)
  );
}

export function reviewPackingTask(
  task,
  rows = task?.cleanedRows || [],
  { volumeConfirmed = false } = {}
) {
  const reconciliation = taskReconciliation(task);
  const strict = Boolean(
    reconciliation || task?._workbookUpload || task?.workbookToolProtocol === WORKBOOK_PROTOCOL
  );
  const actual = calculatePackingTotals(rows);
  const expected = reconciliation?.expected || {};
  const blockingIssues = [...(reconciliation?.blockingIssues || [])];
  const warnings = [...(reconciliation?.warnings || [])];
  const addBlock = (code) => {
    if (!blockingIssues.some((issue) => issue?.code === code)) blockingIssues.push({ code });
  };
  const addWarning = (code) => {
    if (!warnings.some((issue) => issue?.code === code)) warnings.push({ code });
  };
  if (strict) {
    if (!reconciliation) addBlock("PACKAGE_RECONCILIATION_MISSING");
    if (task?.partial === true) addBlock("PACKAGE_PARTIAL_RESULT");
    if (reconciliation?.status === "blocked" && !blockingIssues.length)
      addBlock("PACKAGE_SOURCE_INVALID");
    for (const field of ["packageCount", "innerQuantity", "grossWeightKg"]) {
      const source = numeric(expected[field]);
      if (source != null && !matches(actual[field], source))
        addBlock(`PACKAGE_EDIT_${field.toUpperCase()}`);
    }
    const identities = new Set();
    for (const row of rows) {
      const values = packingNumbers(row);
      if (
        !Number.isInteger(values.quantity) ||
        values.quantity <= 0 ||
        !Number.isFinite(values.weightKg) ||
        values.weightKg <= 0 ||
        [values.lengthCm, values.widthCm, values.heightCm].some(
          (value) => !Number.isFinite(value) || value <= 0
        )
      )
        addBlock("PACKAGE_INVALID_VALUES");
      const identity = cargoProvenance(row);
      const physical = Boolean(identity.packageNo || identity.marks);
      if (physical) {
        const key = JSON.stringify([
          identity.sourceSheet || "",
          identity.packageNo || "",
          identity.marks || ""
        ]);
        if (values.quantity !== 1 || identities.has(key)) addBlock("PACKAGE_IDENTITY_AMBIGUOUS");
        identities.add(key);
      }
      const lines = row.packageInfo?.innerCargo?.lines;
      if (Array.isArray(lines) && lines.length) {
        const counts = lines.map((line) => numeric(line.quantity));
        if (
          lines.some((line) => line.quantity != null && line.quantity !== "") &&
          (counts.some((count) => count == null || !Number.isInteger(count) || count <= 0) ||
            !matches(
              counts.reduce((sum, count) => sum + count, 0),
              contentQuantity(row)
            ))
        )
          addBlock("PACKAGE_CONTENT_MISMATCH");
      }
    }
    const declaredVolume = numeric(
      expected.declaredVolumeM3 ?? reconciliation?.actual?.declaredVolumeM3
    );
    const originalVolume = numeric(expected.calculatedVolumeM3);
    if (declaredVolume != null && !matches(actual.calculatedVolumeM3, declaredVolume, 1e-9))
      addWarning("PACKAGE_SOURCE_VOLUME_MISMATCH");
    if (originalVolume != null && !matches(actual.calculatedVolumeM3, originalVolume, 1e-9))
      addWarning("PACKAGE_EDIT_VOLUME_MISMATCH");
    if (reconciliation?.status === "review-required" && !warnings.length)
      addWarning("PACKAGE_SOURCE_VOLUME_MISMATCH");
  }
  const requiresVolumeConfirmation = strict && warnings.length > 0;
  return {
    strict,
    visible: strict,
    expected,
    actual,
    blockingIssues,
    warnings,
    declaredVolumeM3: numeric(
      expected.declaredVolumeM3 ?? reconciliation?.actual?.declaredVolumeM3
    ),
    requiresVolumeConfirmation,
    canImport:
      rows.length > 0 && !blockingIssues.length && (!requiresVolumeConfirmation || volumeConfirmed),
    status: blockingIssues.length
      ? "blocked"
      : requiresVolumeConfirmation
        ? "review-required"
        : "matched"
  };
}

function reportKey(report) {
  if (report?.sourceTaskId != null) return `task:${report.sourceTaskId}`;
  return JSON.stringify(report);
}

export function collectSourceReconciliations(cargos = []) {
  const reports = new Map();
  for (const cargo of cargos) {
    const report = cargo?.packageInfo?.sourceReconciliation;
    if (report != null) reports.set(JSON.stringify(report), report);
  }
  return [...reports.values()];
}

export function explicitPreviewReconciliation(summary) {
  if (summary?.basis !== "explicit-package") return null;
  return {
    basis: summary.basis,
    status: summary.blockedItems?.length ? "blocked" : "matched",
    blockingIssues: summary.blockedItems || [],
    warnings: [],
    expected: {
      packageCount: summary.declaredPackageCount ?? summary.packageCount,
      innerQuantity: summary.declaredInnerQuantity ?? summary.innerQuantity,
      grossWeightKg: summary.declaredGrossWeightKg ?? summary.grossWeightKg,
      calculatedVolumeM3: summary.calculatedVolumeM3,
      declaredVolumeM3: summary.declaredVolumeM3
    },
    actual: {
      packageCount: summary.packageCount,
      innerQuantity: summary.innerQuantity,
      grossWeightKg: summary.grossWeightKg,
      calculatedVolumeM3: summary.calculatedVolumeM3
    }
  };
}

export function reviewCargoPreview(preview, rows = preview?.aggregated || [], options = {}) {
  const sources = [
    ...(preview?.sourceReconciliations || []),
    ...collectSourceReconciliations(rows)
  ];
  const reports = new Map();
  const extraBlocks = [];
  for (const report of sources) {
    if (
      !report ||
      typeof report !== "object" ||
      Array.isArray(report) ||
      !report.expected ||
      !["blocked", "matched", "review-required"].includes(report.status) ||
      numeric(report.expected.packageCount) == null ||
      numeric(report.expected.grossWeightKg) == null
    ) {
      extraBlocks.push({ code: "PACKAGE_RECONCILIATION_MISSING" });
      continue;
    }
    const key = reportKey(report);
    const previous = reports.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(report))
      extraBlocks.push({ code: "PACKAGE_SOURCE_INVALID" });
    reports.set(key, report);
  }
  if (!sources.length) return reviewPackingTask(null, rows, options);
  const groups = [...reports.entries()].map(([key, report]) => {
    const sourceRows = rows.filter(
      (cargo) =>
        cargo.packageInfo?.sourceReconciliation &&
        reportKey(cargo.packageInfo.sourceReconciliation) === key
    );
    return reviewPackingTask(
      { reconciliation: report, partial: report.partial === true },
      sourceRows,
      options
    );
  });
  if (rows.some((cargo) => cargo.packageInfo?.sourceReconciliation == null))
    extraBlocks.push({ code: "PACKAGE_SOURCE_INVALID" });
  const sumExpected = (field) => {
    const values = groups.map((group) => numeric(group.expected[field]));
    return values.length && values.every((value) => value != null)
      ? values.reduce((sum, value) => sum + value, 0)
      : null;
  };
  const expected = Object.fromEntries(
    [
      "packageCount",
      "innerQuantity",
      "grossWeightKg",
      "calculatedVolumeM3",
      "declaredVolumeM3"
    ].map((field) => [field, sumExpected(field)])
  );
  const blockingIssues = [...extraBlocks, ...groups.flatMap((group) => group.blockingIssues)];
  const warnings = groups.flatMap((group) => group.warnings);
  const requiresVolumeConfirmation = warnings.length > 0;
  return {
    strict: true,
    visible: true,
    expected,
    actual: calculatePackingTotals(rows),
    declaredVolumeM3: expected.declaredVolumeM3,
    blockingIssues,
    warnings,
    requiresVolumeConfirmation,
    canImport:
      rows.length > 0 &&
      !blockingIssues.length &&
      (!requiresVolumeConfirmation || options.volumeConfirmed === true),
    status: blockingIssues.length
      ? "blocked"
      : requiresVolumeConfirmation
        ? "review-required"
        : "matched"
  };
}
