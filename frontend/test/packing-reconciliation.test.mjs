import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { computed } from "vue";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import ts from "typescript";
import * as XLSX from "xlsx";
import { assignCargoModels } from "../src/utils/cargoModels.js";
import { normalizeCargoConstraints, cargoHandlingUnitType } from "../src/utils/cargoConstraints.js";
import {
  calculatePackingTotals,
  cargoProvenance,
  packageIdentityLabel,
  packageSourceLabel,
  packingIdentityKey,
  packingNumbers,
  recognitionDataIssues,
  reviewCargoPreview,
  reviewPackingTask,
  supportsCreatedRecognitionTask,
  supportsTextRecognition,
  supportsWorkbookRecognition,
  taskReconciliation
} from "../src/services/packingReconciliation.js";
import { translateUiText } from "../src/i18n/uiText.js";
import {
  aggregateCargos,
  buildPreview,
  detectFinalHandlingUnitCandidates,
  readWorkbook,
  serializeCargoCsv
} from "../src/services/excelImport.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../backend/src/test/resources/packing-lists/mixed-package-source.json",
      import.meta.url
    ),
    "utf8"
  )
);
const rows = detectFinalHandlingUnitCandidates(fixture.sheet).map((candidate) => candidate.cargo);
const task = (changes = {}) => ({
  status: "SUCCEEDED",
  cleanedRows: structuredClone(rows),
  partial: false,
  reconciliation: {
    status: "matched",
    blockingIssues: [],
    warnings: [],
    expected: { ...fixture.expected },
    actual: { ...fixture.expected }
  },
  ...changes
});

test("successful package recognition reports pending source confirmation instead of zero auto-approved issues", () => {
  const source = readFileSync(
    new URL("../src/components/ExcelTemplatePage.vue", import.meta.url),
    "utf8"
  );
  const { descriptor } = parse(source);
  const ast = ts.createSourceFile(
    "excel.js",
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true
  );
  const initializer = (name) => {
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(
        (entry) => entry.name.getText(ast) === name
      );
      if (declaration) return declaration.initializer.getText(ast);
    }
    throw new Error(`Missing component computed: ${name}`);
  };
  const evaluate = (review, report = {}, confirmed = false) =>
    new Function(
      "computed",
      "taskReconciliation",
      "ui",
      "state",
      `const { recognitionPackingReview, recognitionHasResult, recognitionVolumeConfirmed, recognitionAgentTask, recognitionQuantity, recognitionMessageFactory, recognitionMessageKey, recognitionMessageParams, recognitionMessage } = state;
     const tr = (text) => text;
     const recognitionSourceConfirmationPending = ${initializer("recognitionSourceConfirmationPending")};
     const recognitionStatusMessage = ${initializer("recognitionStatusMessage")};
     return { pending: recognitionSourceConfirmationPending.value, message: recognitionStatusMessage.value };`
    )(computed, taskReconciliation, (key, params) => translateUiText(key, "zh-CN", params), {
      recognitionPackingReview: {
        value: { blockingIssues: [], requiresVolumeConfirmation: false, ...review }
      },
      recognitionHasResult: { value: true },
      recognitionVolumeConfirmed: { value: confirmed },
      recognitionAgentTask: { value: { reconciliation: report } },
      recognitionQuantity: { value: 2 },
      recognitionMessageFactory: { value: null },
      recognitionMessageKey: { value: "excel.recognitionCompleteMessage" },
      recognitionMessageParams: { value: { types: 2, pieces: 2, review: 0 } },
      recognitionMessage: { value: "" }
    });
  for (const pending of [
    evaluate({ requiresVolumeConfirmation: true }),
    evaluate({}, { requiresSourceConfirmation: true })
  ]) {
    assert.equal(pending.pending, true);
    assert.match(pending.message, /来源单位 \/ 原单体积待确认/);
    assert.doesNotMatch(pending.message, /自动放行|0 条硬性问题/);
  }
  assert.equal(evaluate({ requiresVolumeConfirmation: true }, {}, true).pending, false);
  assert.equal(
    evaluate({
      blockingIssues: [{ code: "PACKAGE_INVALID_VALUES" }],
      requiresVolumeConfirmation: true
    }).pending,
    false
  );
  assert.equal(evaluate({}).pending, false);
  assert.match(
    source,
    /recognitionSourceConfirmationPending\s*\?\s*"excel\.recognitionSourceReviewTitle"/
  );
});

test("workbook protocol enables v7 while legacy text v4+ remains compatible", () => {
  const caps = {
    workbookTools: true,
    workbookToolProtocol: "workbook-evidence-v1",
    engineVersion: "excel-package-evidence-v7"
  };
  assert.equal(supportsWorkbookRecognition(caps), true);
  assert.equal(supportsTextRecognition(caps), true);
  assert.equal(
    supportsCreatedRecognitionTask(
      { serverEngineVersion: "excel-package-evidence-v7" },
      caps,
      true
    ),
    true
  );
  assert.equal(
    supportsCreatedRecognitionTask(
      { serverEngineVersion: "excel-package-evidence-v17" },
      caps,
      true
    ),
    true
  );
  assert.equal(
    supportsCreatedRecognitionTask(
      { serverEngineVersion: "excel-package-evidence-v6" },
      caps,
      true
    ),
    false
  );
  for (const version of [4, 5, 15]) {
    const old = { adaptiveBatching: true, engineVersion: `excel-agent-batch-v${version}` };
    assert.equal(supportsTextRecognition(old), true);
    assert.equal(supportsWorkbookRecognition(old), false);
    assert.equal(
      supportsCreatedRecognitionTask(
        { serverAdaptiveBatching: true, serverEngineVersion: old.engineVersion },
        old
      ),
      true
    );
    assert.equal(
      supportsCreatedRecognitionTask(
        { serverAdaptiveBatching: true, serverEngineVersion: old.engineVersion },
        old,
        true
      ),
      false
    );
  }
  assert.equal(
    supportsTextRecognition({ adaptiveBatching: true, engineVersion: "excel-agent-batch-v3" }),
    false
  );
  assert.equal(supportsWorkbookRecognition({ workbookTools: true }), false);
});

test("75 packages preserve 6925 goods, 74575kg and geometric volume; 96m³ needs explicit review", () => {
  const result = reviewPackingTask(task());
  assert.equal(result.actual.packageCount, 75);
  assert.equal(result.actual.innerQuantity, 6925);
  assert.equal(result.actual.grossWeightKg, 74575);
  assert.ok(Math.abs(result.actual.calculatedVolumeM3 - 93.528148) < 1e-9);
  assert.equal(result.declaredVolumeM3, 96);
  assert.deepEqual(result.blockingIssues, []);
  assert.equal(result.canImport, false);
  assert.equal(reviewPackingTask(task(), rows, { volumeConfirmed: true }).canImport, true);
});

test("totals use handling-unit quantity times unit weight and unit volume, never multiply inner goods again", () => {
  const group = {
    lengthCm: 100,
    widthCm: 100,
    heightCm: 100,
    quantity: 6,
    weightKg: 1130,
    packageInfo: {
      algorithmBasis: "source-package-group",
      sourceSheet: "Sheet",
      sourceRows: [10],
      innerCargo: { totalQuantity: 36, lines: [{ quantity: 36 }] }
    }
  };
  assert.deepEqual(calculatePackingTotals([group]), {
    packageCount: 6,
    innerQuantity: 36,
    grossWeightKg: 6780,
    calculatedVolumeM3: 6
  });
  const grouped = aggregateCargos([
    group,
    { ...structuredClone(group), packageInfo: { ...group.packageInfo, sourceRows: [11] } }
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(calculatePackingTotals(grouped).innerQuantity, 72);
  const current = {
    status: "SUCCEEDED",
    reconciliation: {
      expected: { packageCount: 6, innerQuantity: 36, grossWeightKg: 6780, calculatedVolumeM3: 6 },
      status: "matched"
    }
  };
  assert.equal(reviewPackingTask(current, [group]).canImport, true);
});

test("workbook partial, server blocks and missing reconciliation cannot be overridden by volume approval", () => {
  for (const current of [
    task({ partial: true }),
    task({
      reconciliation: { status: "blocked", blockingIssues: [{ code: "PACKAGE_SOURCE_INVALID" }] }
    }),
    task({ reconciliation: null, _workbookUpload: true })
  ]) {
    assert.equal(reviewPackingTask(current, rows, { volumeConfirmed: true }).canImport, false);
  }
  assert.equal(reviewPackingTask({ status: "SUCCEEDED", partial: true }, rows).strict, false);
  assert.equal(
    reviewPackingTask({ status: "SUCCEEDED", partial: true }, rows).canImport,
    true,
    "legacy text partial keeps its existing separate manual-review gate"
  );
});

test("unknown inner quantities remain unknown for a legitimate package group; partially missing contents block", () => {
  const group = {
    lengthCm: 120,
    widthCm: 100,
    heightCm: 90,
    quantity: 2,
    weightKg: 200,
    packageInfo: {
      algorithmBasis: "source-package-group",
      innerCargo: { totalQuantity: null, lines: [{ name: "Packed goods", quantity: null }] }
    }
  };
  const current = {
    status: "SUCCEEDED",
    reconciliation: {
      status: "matched",
      expected: { packageCount: 2, innerQuantity: null, grossWeightKg: 400 }
    }
  };
  assert.equal(reviewPackingTask(current, [group]).actual.innerQuantity, null);
  assert.equal(reviewPackingTask(current, [group]).canImport, true);
  group.packageInfo.innerCargo.lines.push({ name: "Known goods", quantity: 12 });
  assert.equal(reviewPackingTask(current, [group]).canImport, false);
});

test("edited quantity, weight and mixed contents fail conservation, regardless of warning approval", () => {
  for (const edit of [
    (values) => {
      values[0].quantity = 2;
    },
    (values) => {
      values[0].weightKg += 1;
    },
    (values) => {
      values[0].packageInfo.innerCargo.totalQuantity -= 1;
    },
    (values) => {
      values[0].packageInfo.innerCargo.lines.pop();
    },
    (values) => {
      values[0].packageInfo.innerCargo.lines[0].quantity = null;
    },
    (values) => {
      values[0].lengthCm = NaN;
    }
  ]) {
    const current = task();
    edit(current.cleanedRows);
    const review = reviewPackingTask(current, current.cleanedRows, { volumeConfirmed: true });
    assert.equal(review.canImport, false);
    assert.ok(review.blockingIssues.length);
  }
});

test("physical package identity stays unique per sheet; duplicate packages cannot enter packing", () => {
  const source = rows[0];
  const expected = {
    packageCount: 2,
    innerQuantity: source.packageInfo.innerCargo.totalQuantity * 2,
    grossWeightKg: source.weightKg * 2
  };
  const base = { status: "SUCCEEDED", reconciliation: { status: "matched", expected } };
  assert.equal(reviewPackingTask(base, [source, source]).canImport, false);
  const other = structuredClone(source);
  other.sourceSheet = "Other";
  other.packageInfo.sourceSheet = "Other";
  assert.equal(reviewPackingTask(base, [source, other]).canImport, true);
  assert.notEqual(packingIdentityKey(source), packingIdentityKey(other));
});

test("warning state never implies approval; edited dimensions need a fresh decision", () => {
  const current = task();
  current.reconciliation.status = "review-required";
  assert.equal(reviewPackingTask(current).canImport, false);
  assert.equal(
    reviewPackingTask(current, current.cleanedRows, { volumeConfirmed: true }).canImport,
    true
  );
  current.cleanedRows[0].lengthCm += 0.001;
  const edited = reviewPackingTask(current);
  assert.ok(edited.warnings.some((issue) => issue.code === "PACKAGE_EDIT_VOLUME_MISMATCH"));
  assert.equal(edited.canImport, false);
});

test("normalization keeps all decimal precision and provenance, including mixed inner cargo lines", () => {
  const source = structuredClone(rows[0]);
  source.lengthCm = 110.123456;
  source.weightKg = 810.1234567;
  const normalized = { ...packingNumbers(source), ...cargoProvenance(source) };
  assert.equal(normalized.lengthCm, source.lengthCm);
  assert.equal(normalized.weightKg, source.weightKg);
  assert.deepEqual(normalized.packageInfo.innerCargo, source.packageInfo.innerCargo);
  assert.equal(normalized.marks, source.marks);
  assert.ok(packageIdentityLabel(source).includes(source.marks));
  assert.ok(packageSourceLabel(source).includes(source.sourceSheet));
});

test("reconciliation metadata is available for the panel, never an ordinary error row", () => {
  const rec = task().reconciliation;
  const source = {
    status: "SUCCEEDED",
    issues: [
      { code: "PACKAGE_RECONCILIATION", reconciliation: rec },
      { code: "PACKAGE_SOURCE_INVALID" }
    ]
  };
  assert.deepEqual(recognitionDataIssues(source), [{ code: "PACKAGE_SOURCE_INVALID" }]);
  assert.equal(reviewPackingTask(source, rows).strict, true);
});

test("UI compiles and binds original-file upload, import gates, source detail and reset-on-edit/task-change", () => {
  const source = readFileSync(
    new URL("../src/components/ExcelTemplatePage.vue", import.meta.url),
    "utf8"
  );
  const panelSource = readFileSync(
    new URL("../src/components/PackingReconciliationPanel.vue", import.meta.url),
    "utf8"
  );
  for (const [file, text] of [
    ["ExcelTemplatePage.vue", source],
    ["PackingReconciliationPanel.vue", panelSource]
  ]) {
    const { descriptor, errors } = parse(text, { filename: file });
    assert.deepEqual(errors, []);
    const script = compileScript(descriptor, { id: file });
    const template = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: file,
      compilerOptions: { bindingMetadata: script.bindings }
    });
    assert.deepEqual(template.errors, []);
  }
  const functionBody = (name, end) =>
    source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${end}(`));
  const fileFlow = functionBody("loadWorkbookFileForRecognition", "loadWorkbookFileLocally");
  assert.match(fileFlow, /submitTextRecognitionTask\(\{\s*file,/);
  assert.doesNotMatch(fileFlow, /formatWorkbookForRecognition|textOverride/);
  assert.match(source, /createWorkbookRecognitionTask\(options\.file/);
  assert.match(source, /:disabled="!recognitionCanImport"/);
  assert.match(
    functionBody("importRecognitionRows", "openRecognitionReviewDialog"),
    /!recognitionCanImport\.value/
  );
  assert.match(
    functionBody("applyPreciseSnapshot", "syncActivePreciseQueueSnapshot"),
    /recognitionVolumeConfirmed\.value = false/
  );
  assert.match(
    functionBody("applyRecognitionEdit", "normalizeRecognitionEditCargo"),
    /recognitionVolumeConfirmed\.value = false/
  );
  assert.match(source, /packingIdentityKey\(cargo\)/);
  assert.match(source, /packageSourceLabel\(cargo\)/);
  assert.doesNotMatch(
    functionBody("normalizeImportedCargo", "openRecognitionEdit"),
    /round2|Math\.round/
  );
});

test("workbook API sends the original file in multipart form and does not set a JSON content type", async () => {
  const calls = [];
  globalThis.__packingApiTest = async (path, options) => {
    calls.push({ path, options });
    return { id: 77 };
  };
  const stub =
    "data:text/javascript;base64," +
    Buffer.from(
      "export const requestJson = (...args) => globalThis.__packingApiTest(...args); export const fetchWithApiFallback = () => {};"
    ).toString("base64");
  const source = readFileSync(new URL("../src/services/excelAgentApi.js", import.meta.url), "utf8")
    .replace('"./apiClient"', JSON.stringify(stub))
    .replace("import.meta.env.VITE_API_BASE_URL", '""');
  const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const file = new File([new Uint8Array([80, 75, 3, 4])], "packing.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  assert.deepEqual(await api.createWorkbookRecognitionTask(file, { languageHint: "zh" }), {
    id: 77
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/text-recognition/tasks/workbook");
  assert.equal(calls[0].options.method, "POST");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.deepEqual(
    [...new Uint8Array(await calls[0].options.body.get("file").arrayBuffer())],
    [80, 75, 3, 4]
  );
  assert.equal(calls[0].options.body.get("file").name, "packing.xlsx");
  assert.equal(calls[0].options.body.get("languageHint"), "zh");
  assert.deepEqual(calls[0].options.headers, {});
  delete globalThis.__packingApiTest;
});

test("the actual App import and runtime chain retains sub-kilogram weights, precise dimensions, source identity and mixed contents", () => {
  const source = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
  const { descriptor } = parse(source);
  const script = ts.createSourceFile(
    "App.js",
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const names = [
    "normalizeImportedCargo",
    "importExcelCargos",
    "normalizeCargoForRuntime",
    "normalizeCargoModels",
    "systemColorFor"
  ];
  const functions = script.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
  );
  assert.equal(functions.length, names.length);
  const state = {
    cargos: { value: [] },
    result: { value: "old" },
    selectedBoxIndex: { value: 4 },
    cargoImportNotice: { value: null },
    colors: ["#234567"],
    uid: () => "new-cargo",
    router: {
      push: (path) => {
        state.path = path;
      }
    },
    ui: () => "message",
    showToast: () => {},
    assignCargoModels,
    normalizeCargoConstraints,
    cargoHandlingUnitType,
    cargoProvenance,
    packingNumbers,
    reviewCargoPreview,
    smartImportOpen: { value: false },
    pendingImportReview: { value: null }
  };
  const api = new Function(
    "state",
    `const { ${Object.keys(state).join(",")} } = state; ${functions.map((node) => node.getText(script)).join("\n")} return { ${names.join(",")} };`
  )(state);
  const cargo = {
    id: "source-box",
    name: "Precision package",
    model: "DN100",
    lengthCm: 110.123456,
    widthCm: 45.987654,
    heightCm: 82.001,
    quantity: 1,
    weightKg: 0.125,
    type: "normal",
    nonStack: true,
    keepUpright: true,
    packageNo: "1",
    marks: "PACK#1",
    sourceSheet: "Packages",
    sourceRows: [9, 10],
    packageInfo: {
      algorithmBasis: "source-explicit-package",
      packageNo: "1",
      marks: "PACK#1",
      sourceSheet: "Packages",
      sourceRows: [9, 10],
      innerCargo: {
        totalQuantity: 22,
        lines: [
          { name: "Valve", model: "DN200", quantity: 20, sourceRowNumber: 9 },
          { name: "Valve", model: "DN100", quantity: 2, sourceRowNumber: 10 }
        ]
      }
    }
  };
  api.importExcelCargos({ cargos: [cargo], mode: "replace", importKind: "precise" });
  const saved = state.cargos.value[0];
  for (const field of [
    "id",
    "lengthCm",
    "widthCm",
    "heightCm",
    "weightKg",
    "quantity",
    "packageNo",
    "marks",
    "sourceSheet",
    "nonStack",
    "keepUpright"
  ])
    assert.equal(saved[field], cargo[field], field);
  assert.deepEqual(saved.sourceRows, cargo.sourceRows);
  assert.deepEqual(saved.packageInfo, cargo.packageInfo);
  assert.equal(state.path, "/planner/cargos");
  assert.equal(state.result.value, null);
  assert.equal(state.selectedBoxIndex.value, 1);
  const second = structuredClone(cargo);
  second.id = "source-box-2";
  second.packageNo = "2";
  second.marks = "PACK#2";
  second.packageInfo.packageNo = "2";
  second.packageInfo.marks = "PACK#2";
  api.importExcelCargos({ cargos: [second], mode: "append", importKind: "precise" });
  assert.equal(state.cargos.value.length, 2);
  assert.equal(calculatePackingTotals(state.cargos.value).grossWeightKg, 0.25);
  assert.equal(calculatePackingTotals(state.cargos.value).innerQuantity, 44);
  assert.equal(state.cargos.value[0].marks, "PACK#1");
  assert.equal(state.cargos.value[1].marks, "PACK#2");
});

test("the App CSV export uses the existing spreadsheet importer and roundtrips precise package evidence with quoted mixed contents", async () => {
  const source = structuredClone(rows[0]);
  Object.assign(source, {
    name: 'Valve, "export"\npackage',
    lengthCm: 110.123456,
    widthCm: 45.987654,
    heightCm: 82.001,
    weightKg: 0.125
  });
  source.packageInfo.innerCargo.lines[0].name = 'Valve, "mixed"';
  const second = structuredClone(source);
  second.packageNo = "2";
  second.marks = "PACK#2";
  second.packageInfo.packageNo = "2";
  second.packageInfo.marks = "PACK#2";
  const csv = serializeCargoCsv([source, second]);
  assert.equal(
    csv.split("\n")[0].split(",").slice(0, 11).join(","),
    "name,model,lengthCm,widthCm,heightCm,quantity,weightKg,type,nonStack,keepUpright,color"
  );
  const file = new File([csv], "cargo-list.csv", { type: "text/csv" });
  const workbook = await readWorkbook(file);
  const sheet = workbook.sheets[0];
  const preview = buildPreview(sheet, sheet.mapping, { dimensionUnit: "auto", weightUnit: "auto" });
  assert.deepEqual(preview.invalidRows, []);
  assert.equal(preview.aggregated.length, 2);
  for (const [index, expected] of [source, second].entries()) {
    const actual = preview.aggregated[index];
    for (const field of [
      "name",
      "model",
      "lengthCm",
      "widthCm",
      "heightCm",
      "weightKg",
      "quantity",
      "packageNo",
      "marks",
      "sourceSheet"
    ])
      assert.equal(actual[field], expected[field], field);
    assert.deepEqual(actual.packageInfo, expected.packageInfo);
  }
  assert.equal(calculatePackingTotals(preview.aggregated).grossWeightKg, 0.25);
  assert.equal(calculatePackingTotals(preview.aggregated).innerQuantity, 44);
  const app = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
  assert.match(app, /serializeCargoCsv\(cargos\.value\)/);
  assert.match(
    app,
    /function importCsvFile\(file: File\)\s*\{\s*return importStructuredCargoFile\(file, "CSV"\)/
  );
  assert.doesNotMatch(app, /line\.split\(","\)/);
});

function sourceExportRows(report, count = rows.length) {
  return rows.slice(0, count).map((cargo) => ({
    ...structuredClone(cargo),
    packageInfo: {
      ...structuredClone(cargo.packageInfo),
      sourceReconciliation: structuredClone(report)
    }
  }));
}

function exportReport(changes = {}) {
  return {
    ...structuredClone(task().reconciliation),
    sourceTaskId: 77,
    engineVersion: "excel-package-evidence-v7",
    partial: false,
    ...changes
  };
}

function exportFile(cargos, format, report) {
  const csv = serializeCargoCsv(cargos);
  if (format === "csv") return new File([csv], "cleaned.csv", { type: "text/csv" });
  const sheet = XLSX.read(csv, { type: "string" });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet.Sheets[sheet.SheetNames[0]], "cargos");
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["field", "value"],
      ["reconciliation", JSON.stringify(report)]
    ]),
    "reconciliation"
  );
  return new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "cleaned.xlsx");
}

async function exportedPreview(cargos, format, report) {
  const file = exportFile(cargos, format, report);
  const workbook = await readWorkbook(file);
  const sheet = workbook.sheets[0];
  return {
    file,
    workbook,
    preview: buildPreview(sheet, sheet.mapping, { dimensionUnit: "auto", weightUnit: "auto" })
  };
}

for (const format of ["xlsx", "csv"]) {
  test(`${format} export → first sheet preview keeps blocking/partial/missing-package evidence and volume confirmation`, async () => {
    const report = exportReport();
    const complete = await exportedPreview(sourceExportRows(report), format, report);
    assert.equal(complete.preview.sourceReconciliations.length, 1);
    assert.equal(complete.preview.packingReview.canImport, false);
    assert.equal(
      reviewCargoPreview(complete.preview, complete.preview.aggregated, { volumeConfirmed: true })
        .canImport,
      true
    );
    assert.equal(complete.preview.packingReview.actual.packageCount, 75);
    assert.equal(complete.preview.packingReview.actual.innerQuantity, 6925);
    for (const [source, count] of [
      [
        exportReport({ status: "blocked", blockingIssues: [{ code: "PACKAGE_SOURCE_INVALID" }] }),
        75
      ],
      [exportReport({ partial: true }), 75],
      [report, 74]
    ]) {
      const parsed = await exportedPreview(sourceExportRows(source, count), format, source);
      const review = reviewCargoPreview(parsed.preview, parsed.preview.aggregated, {
        volumeConfirmed: true
      });
      assert.equal(review.canImport, false);
      assert.ok(review.blockingIssues.length);
    }
  });
}

test("the local original packing-list preview also enforces its package totals and explicit 96m³ review", () => {
  const preview = buildPreview(fixture.sheet, fixture.sheet.mapping, {
    dimensionUnit: "auto",
    weightUnit: "auto"
  });
  assert.equal(preview.packingReview.canImport, false);
  assert.equal(preview.packingReview.actual.packageCount, 75);
  assert.equal(preview.packingReview.actual.innerQuantity, 6925);
  assert.equal(
    reviewCargoPreview(preview, preview.aggregated, { volumeConfirmed: true }).canImport,
    true
  );
  assert.ok(preview.aggregated.every((cargo) => cargo.packageInfo.sourceReconciliation));
});

test("multiple source tasks reconcile independently; offsetting edits, mixed anonymous rows and conflicting source reports cannot bypass", () => {
  const a = structuredClone(rows[0]);
  const b = structuredClone(rows[1]);
  const simpleReport = (id, cargo) => ({
    sourceTaskId: id,
    status: "matched",
    blockingIssues: [],
    warnings: [],
    expected: calculatePackingTotals([cargo])
  });
  a.packageInfo.sourceReconciliation = simpleReport(100, a);
  b.packageInfo.sourceReconciliation = simpleReport(200, b);
  assert.equal(reviewCargoPreview(null, [a, b]).canImport, true);
  a.weightKg += 1;
  b.weightKg -= 1;
  assert.equal(reviewCargoPreview(null, [a, b]).canImport, false);
  a.weightKg -= 1;
  b.weightKg += 1;
  const anonymous = { ...a, packageInfo: null };
  assert.equal(reviewCargoPreview(null, [a, anonymous]).canImport, false);
  const conflicting = structuredClone(a);
  conflicting.packageInfo.sourceReconciliation.expected.grossWeightKg += 1;
  assert.equal(reviewCargoPreview(null, [a, conflicting]).canImport, false);
  const malformed = { ...a, packageInfo: { ...a.packageInfo, sourceReconciliation: "invalid" } };
  assert.equal(reviewCargoPreview(null, [malformed]).canImport, false);
});

test("source reconciliation is recovered from invalid rows too, so dropping the only evidence-bearing row does not enable quick import", async () => {
  const values = sourceExportRows(exportReport());
  for (const cargo of values.slice(1)) delete cargo.packageInfo.sourceReconciliation;
  values[0].weightKg = -1;
  const parsed = await exportedPreview(values, "csv", exportReport());
  assert.equal(parsed.preview.invalidRows.length, 1);
  assert.equal(parsed.preview.sourceReconciliations.length, 1);
  assert.equal(parsed.preview.packingReview.canImport, false);
});

test("the actual App quick handler transfers the parsed workbook and preview to manual review, and the final import boundary checks again", async () => {
  const source = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
  const { descriptor } = parse(source);
  const script = ts.createSourceFile(
    "App.ts",
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const names = [
    "importStructuredCargoFile",
    "normalizeImportedCargo",
    "normalizeCargoForRuntime",
    "systemColorFor",
    "importExcelCargos",
    "normalizeCargoModels"
  ];
  const functions = script.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
  );
  const content = ts.transpileModule(functions.map((node) => node.getText(script)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2023 }
  }).outputText;
  const state = {
    readWorkbookInWorker: readWorkbook,
    buildPreviewInWorker: async (...args) => buildPreview(...args),
    reviewCargoPreview,
    packingNumbers,
    cargoProvenance,
    normalizeCargoConstraints,
    cargoHandlingUnitType,
    assignCargoModels,
    fileImporting: { value: false },
    smartImportOpen: { value: false },
    pendingImportReview: { value: null },
    cargos: { value: [] },
    result: { value: "unchanged" },
    selectedBoxIndex: { value: 0 },
    cargoImportNotice: { value: null },
    quickImportMode: { value: "replace" },
    colors: ["#234567"],
    uid: () => "cargo",
    router: { push: () => {} },
    ui: (key) => key,
    showToast: () => {}
  };
  const api = new Function(
    "state",
    `const { ${Object.keys(state).join(",")} } = state; ${content} return { ${names.join(",")} };`
  )(state);
  const report = exportReport();
  const file = exportFile(sourceExportRows(report), "xlsx", report);
  await api.importStructuredCargoFile(file, "Excel");
  assert.equal(state.smartImportOpen.value, true);
  assert.equal(state.fileImporting.value, false);
  assert.equal(state.cargos.value.length, 0);
  const reviewSource = state.pendingImportReview.value;
  assert.equal(reviewSource.file, file);
  assert.equal(reviewSource.workbook.sheets.length, 2);
  assert.equal(reviewSource.preview.aggregated.length, 75);
  assert.equal(reviewSource.preview.packingReview.canImport, false);
  api.importExcelCargos({ cargos: reviewSource.preview.aggregated, mode: "replace" });
  assert.equal(
    state.cargos.value.length,
    0,
    "an unchecked manual callback cannot bypass the final boundary"
  );
  api.importExcelCargos({
    cargos: reviewSource.preview.aggregated,
    mode: "replace",
    volumeConfirmed: true
  });
  assert.equal(state.cargos.value.length, 75);
  assert.equal(state.pendingImportReview.value, null);
});

test("manual preview exposes the same panel, import gate and reset-on-change wiring", () => {
  const source = readFileSync(
    new URL("../src/components/ExcelTemplatePage.vue", import.meta.url),
    "utf8"
  );
  assert.match(source, /:review="manualPackingReview"/);
  assert.match(source, /:disabled="!manualCanImport"/);
  assert.match(source, /function importPreview\(\)\s*\{\s*if \(!manualCanImport\.value\)/);
  assert.match(source, /watch\(approvedAggregated,/);
  assert.match(source, /watch\(recognitionRows,/);
  assert.match(source, /props\.reviewSource/);
  assert.match(source, /preview: source\.preview/);
  assert.match(source, /workbook: source\.workbook/);
});
