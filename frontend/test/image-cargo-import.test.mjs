import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import {
  buildImageImportPayload,
  reviewImageImport,
  supportsImageRecognition
} from "../src/services/imageCargoImport.js";
import {
  reviewCargoPreview,
  supportsCreatedRecognitionTask
} from "../src/services/packingReconciliation.js";

const row = () => ({
  name: "Pump",
  model: "A",
  lengthCm: 120,
  widthCm: 100,
  heightCm: 150,
  quantity: 2,
  weightKg: 250,
  type: "pallet",
  nonStack: true,
  keepUpright: true,
  sourceText: "2 pallets 120x100x150 cm each gross 250 kg",
  packageInfo: { imageProtocol: "cargo-image-v1" }
});
const task = () => ({
  id: 91,
  status: "SUCCEEDED",
  taskType: "IMAGE",
  inputContract: "cargo-image-v1",
  cleanedRows: [row()],
  reconciliation: {
    imageProtocol: "cargo-image-v1",
    complete: true,
    status: "review-required",
    warnings: [{ code: "IMAGE_SOURCE_CONFIRMATION_REQUIRED" }]
  }
});

test("image tasks require their own capability contract and cannot pass the workbook task gate", () => {
  const caps = {
    workbookTools: true,
    workbookToolProtocol: "workbook-evidence-v1",
    imageRecognition: true,
    imageTaskProtocol: "cargo-image-v1"
  };
  assert.equal(supportsImageRecognition(caps), true);
  assert.equal(supportsImageRecognition({ workbookTools: true }), false);
  assert.equal(
    supportsCreatedRecognitionTask(
      { ...task(), serverEngineVersion: "excel-package-evidence-v7" },
      caps,
      true
    ),
    false
  );
});

test("every screenshot needs human confirmation; missing fields and incomplete sources cannot pass", () => {
  assert.equal(reviewImageImport(task(), [row()]).canImport, false);
  assert.equal(reviewImageImport(task(), [row()], true).canImport, true);
  const incomplete = task();
  incomplete.reconciliation.complete = false;
  assert.equal(reviewImageImport(incomplete, [row()], true).canImport, false);
  for (const key of [
    "name",
    "lengthCm",
    "widthCm",
    "heightCm",
    "quantity",
    "weightKg",
    "sourceText"
  ]) {
    const candidate = row();
    candidate[key] = "";
    assert.equal(reviewImageImport(task(), [candidate], true).canImport, false, key);
  }
  for (const quantity of [0, -1, 1.5, Infinity, 2147483648]) {
    assert.equal(reviewImageImport(task(), [{ ...row(), quantity }], true).canImport, false);
  }
  assert.equal(reviewImageImport(task(), [row(), row()], true).canImport, false);
});

test("explicit corrections preserve screenshot provenance and enter the existing packing review boundary", () => {
  const original = task();
  original.cleanedRows[0].lengthCm = 0;
  const fixed = { ...original.cleanedRows[0], lengthCm: 120 };
  assert.equal(reviewImageImport(original, [fixed], true).canImport, true);
  const payload = buildImageImportPayload(original, [fixed], true);
  assert.equal(payload.importKind, "image");
  assert.equal(payload.cargos[0].packageInfo.requiresSourceReview, false);
  assert.equal(payload.cargos[0].packageInfo.sourceReconciliation.humanSourceConfirmed, true);
  assert.equal(reviewCargoPreview(null, payload.cargos, { volumeConfirmed: true }).canImport, true);
  assert.deepEqual(payload.cargos[0].packageInfo.sourceReconciliation.expected, {});
  assert.equal(payload.cargos[0].packageInfo.sourceReconciliation.sourceTotalsStatus, "unknown");
  assert.equal(payload.cargos[0].packageInfo.sourceReconciliation.status, "review-required");
  assert.equal(reviewCargoPreview(null, payload.cargos).canImport, false);
  assert.equal(original.cleanedRows[0].lengthCm, 0);
  assert.throws(() => buildImageImportPayload(original, [fixed], false));
});

test("ambiguous or duplicate screenshot identities are repairable before the final import boundary", () => {
  assert.equal(reviewImageImport(task(), [{ ...row(), packageNo: "1-2" }], true).canImport, false);
  assert.equal(reviewImageImport(task(), [{ ...row(), packageNo: "1" }], true).canImport, false);
  const first = { ...row(), packageNo: "1", quantity: 1 },
    second = { ...row(), packageNo: "1", quantity: 1 };
  const source = task();
  source.cleanedRows = [first, second];
  assert.equal(reviewImageImport(source, [first, second], true).canImport, false);
  second.packageNo = "2";
  assert.equal(reviewImageImport(source, [first, second], true).canImport, true);
  assert.equal(
    reviewCargoPreview(null, buildImageImportPayload(source, [first, second], true).cargos, {
      volumeConfirmed: true
    }).canImport,
    true
  );
});

test("confirmation cannot erase source blocks or replace independent source totals with edited row sums", () => {
  const blocked = task();
  blocked.reconciliation.expected = { packageCount: 10, grossWeightKg: 1000, declaredVolumeM3: 10 };
  blocked.reconciliation.status = "blocked";
  blocked.reconciliation.blockingIssues = [{ code: "PACKAGE_CONSERVATION_MISMATCH" }];
  assert.equal(reviewImageImport(blocked, [row()], true).canImport, false);
  assert.throws(() => buildImageImportPayload(blocked, [row()], true));
  const known = task();
  known.reconciliation.expected = { packageCount: 2, grossWeightKg: 500, declaredVolumeM3: 5 };
  known.reconciliation.sourceTotalsEvidence = "TOTAL 2 packages, 500 kg, 5 m3";
  const payload = buildImageImportPayload(known, [row()], true);
  const report = payload.cargos[0].packageInfo.sourceReconciliation;
  assert.deepEqual(report.expected, known.reconciliation.expected);
  assert.equal(report.sourceTotalsStatus, "provided");
  assert.equal(report.sourceReport, known.reconciliation);
  assert.equal(report.sourceTotalsEvidence, known.reconciliation.sourceTotalsEvidence);
  assert.equal(report.reviewedTotals.calculatedVolumeM3, 3.6);
  assert.equal(reviewCargoPreview(null, payload.cargos, { volumeConfirmed: true }).canImport, true);
  payload.cargos[0].lengthCm = 125;
  assert.equal(
    reviewCargoPreview(null, payload.cargos, { volumeConfirmed: true }).canImport,
    false
  );
});

test("only missing fields explicitly repaired on their original row can resolve a source block", () => {
  const source = task();
  source.cleanedRows[0].lengthCm = 0;
  const missing = {
    code: "IMAGE_FIELD_MISSING",
    sourceRowNumber: 1,
    fields: ["lengthCm"],
    cargo: structuredClone(source.cleanedRows[0])
  };
  source.reconciliation.status = "blocked";
  source.reconciliation.blockingIssues = [missing];
  assert.equal(reviewImageImport(source, source.cleanedRows, true).canImport, false);
  const corrected = { ...source.cleanedRows[0], lengthCm: 120 };
  const payload = buildImageImportPayload(source, [corrected], true);
  assert.equal(reviewCargoPreview(null, payload.cargos, { volumeConfirmed: true }).canImport, true);
  assert.deepEqual(payload.cargos[0].packageInfo.sourceReconciliation.sourceReport.blockingIssues, [
    missing
  ]);
  for (const issue of [
    { ...missing, fields: [] },
    { ...missing, fields: ["unrecognizedField"] },
    { ...missing, sourceRowNumber: 2 },
    { ...missing, cargo: { ...missing.cargo, lengthCm: 120 } },
    { code: "IMAGE_TOTAL_INVALID" },
    { code: "PACKAGE_CONSERVATION_MISMATCH" },
    { code: "IMAGE_SOURCE_INCOMPLETE" }
  ]) {
    source.reconciliation.blockingIssues = [issue];
    assert.equal(
      reviewImageImport(source, [corrected], true).canImport,
      false,
      JSON.stringify(issue)
    );
    assert.throws(() => buildImageImportPayload(source, [corrected], true));
  }
  // The final import boundary must also reject a malformed claim of field repair.
  payload.cargos[0].packageInfo.sourceReconciliation.sourceReport.blockingIssues = [
    { code: "IMAGE_FIELD_MISSING", sourceRowNumber: 1 }
  ];
  assert.equal(
    reviewCargoPreview(null, payload.cargos, { volumeConfirmed: true }).canImport,
    false
  );
});

test("image and final packing review share package ID and marks ambiguity checks", () => {
  for (const identity of [
    { packageNo: "1-2" },
    { packageNo: "1 to 2" },
    { packageNo: "1\u81f32" },
    { marks: "1\u52302" },
    { marks: "2" },
    { packageInfo: { packageNo: "1-2" } }
  ]) {
    const candidate = { ...row(), quantity: 1, ...identity };
    assert.equal(reviewImageImport(task(), [candidate], true).canImport, false);
    const original = { ...row(), quantity: 1, packageNo: "1" };
    const payload = buildImageImportPayload(task(), [original], true);
    const info = payload.cargos[0].packageInfo;
    Object.assign(payload.cargos[0], { packageNo: "", marks: "" }, identity, {
      packageInfo: { ...info, ...(identity.packageInfo || {}) }
    });
    if (identity.packageInfo) delete payload.cargos[0].packageNo;
    assert.equal(
      reviewCargoPreview(null, payload.cargos, { volumeConfirmed: true }).canImport,
      false
    );
  }
  const first = { ...row(), quantity: 1, packageNo: "P1", marks: "A" };
  const second = { ...row(), quantity: 1, packageNo: "P1", marks: "B" };
  const source = task();
  source.cleanedRows = [first, second];
  assert.equal(reviewImageImport(source, [first, second], true).canImport, false);
});

test("printed 10/1000/10 remains distinct from proposed 2/200/2 even without a provider block", () => {
  const source = task();
  source.reconciliation.expected = { packageCount: 10, grossWeightKg: 1000, declaredVolumeM3: 10 };
  source.reconciliation.sourceTotalsEvidence = "TOTAL 10 packages 1000 kg 10 m3";
  const candidate = {
    ...row(),
    lengthCm: 100,
    widthCm: 100,
    heightCm: 100,
    quantity: 2,
    weightKg: 100
  };
  const result = reviewImageImport(source, [candidate], true);
  assert.equal(result.canImport, false);
  assert.deepEqual(result.actual, {
    packageCount: 2,
    innerQuantity: null,
    grossWeightKg: 200,
    calculatedVolumeM3: 2
  });
  assert.deepEqual(result.expected, {
    packageCount: 10,
    grossWeightKg: 1000,
    declaredVolumeM3: 10
  });
  assert.throws(() => buildImageImportPayload(source, [candidate], true));
});

test("image component compiles and isolates input, stale responses, session expiry and confirmation", () => {
  const source = readFileSync(
    new URL("../src/components/ScreenshotImportReview.vue", import.meta.url),
    "utf8"
  );
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: "image-review" });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: "ScreenshotImportReview.vue",
    id: "image-review",
    compilerOptions: { bindingMetadata: script.bindings }
  });
  assert.deepEqual(template.errors, []);
  assert.match(source, /data-i18n-ignore/);
  assert.match(source, /createImageRecognitionTask/);
  assert.doesNotMatch(source, /createWorkbookRecognitionTask/);
  assert.match(source, /run === revision && session === storedToken\(\)/);
  assert.match(source, /isSessionExpired\(\)/);
  assert.match(source, /onBeforeUnmount/);
  assert.match(source, /watch\(\s*rows,[\s\S]*confirmed.value = false/);
  assert.match(source, /URL.revokeObjectURL/);
});
