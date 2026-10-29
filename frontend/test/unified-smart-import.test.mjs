import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import ts from "typescript";
import {
  classifySmartImportFile,
  crossCheckImportEvidence
} from "../src/services/unifiedSmartImport.js";
import { taskReconciliation } from "../src/services/packingReconciliation.js";
import { unifiedImportMessages } from "../src/i18n/unifiedImportMessages.js";

const row = (packageNo = "P1", weightKg = 60) => ({
  packageNo,
  sourceSheet: "Packing",
  sourceRows: [3],
  name: "Pump",
  model: "A",
  lengthCm: 120,
  widthCm: 100,
  heightCm: 52.5,
  quantity: 1,
  weightKg,
  type: "pallet",
  nonStack: true,
  keepUpright: true,
  sourceText: `${packageNo}: 120 x 100 x 52.5 cm, gross ${weightKg} kg`
});
function evidence() {
  const rows = [row()];
  const reconciliation = {
    status: "matched",
    expected: { packageCount: 1, grossWeightKg: 60, declaredVolumeM3: 0.63 },
    blockingIssues: [],
    warnings: []
  };
  return {
    workbook: {
      rows,
      task: { id: 1, status: "SUCCEEDED", _workbookUpload: true, cleanedRows: rows, reconciliation }
    },
    image: {
      rows: structuredClone(rows),
      task: {
        id: 2,
        status: "SUCCEEDED",
        taskType: "IMAGE",
        inputContract: "cargo-image-v1",
        cleanedRows: structuredClone(rows),
        reconciliation: {
          ...structuredClone(reconciliation),
          imageProtocol: "cargo-image-v1",
          complete: true
        }
      }
    }
  };
}
test("one selector routes workbook and image formats, rejecting unsupported or disguised image MIME", () => {
  for (const name of ["table.XLSX", "table.xls", "table.csv", "table.tsv"])
    assert.equal(classifySmartImportFile({ name }), "workbook");
  for (const name of ["table.PNG", "table.jpg", "table.jpeg"])
    assert.equal(classifySmartImportFile({ name, type: "image/png" }), "image");
  assert.equal(classifySmartImportFile({ name: "table.pdf" }), null);
  assert.equal(classifySmartImportFile({ name: "table.png", type: "application/pdf" }), null);
});
test("independent canonical-unit proposals compare by physical identity, preserving decimal precision and sources", () => {
  const { workbook, image } = evidence();
  const original = JSON.stringify({ workbook, image });
  assert.deepEqual(crossCheckImportEvidence(workbook, image), {
    canImport: true,
    differences: [],
    matchedCount: 1
  });
  assert.equal(JSON.stringify({ workbook, image }), original);
  image.rows[0].weightKg = "60";
  assert.equal(crossCheckImportEvidence(workbook, image).canImport, true);
  image.rows[0].lengthCm = 120.0001;
  const review = crossCheckImportEvidence(workbook, image);
  assert.equal(review.canImport, false);
  assert.ok(
    review.differences.some((item) => item.code === "fieldConflict" && item.field === "lengthCm")
  );
});
test("package IDs drive matching, never row order; missing, duplicated, ranged or grouped packages block", () => {
  const { workbook, image } = evidence();
  workbook.rows.push({ ...row("P2"), sourceRows: [4] });
  image.rows.push({ ...row("P2"), sourceRows: [4] });
  for (const side of [workbook, image]) {
    side.task.cleanedRows = structuredClone(side.rows);
    side.task.reconciliation.expected = { packageCount: 2, grossWeightKg: 120 };
  }
  image.rows.reverse();
  assert.equal(crossCheckImportEvidence(workbook, image).canImport, true);
  for (const edit of [
    (r) => {
      r.packageNo = "P3";
    },
    (r) => {
      r.packageNo = "P2";
    },
    (r) => {
      r.packageNo = "1-2";
    },
    (r) => {
      r.quantity = 2;
    },
    (r) => {
      delete r.packageNo;
      delete r.sourceRows;
    }
  ]) {
    const changed = structuredClone(image);
    edit(changed.rows[1]);
    assert.equal(crossCheckImportEvidence(workbook, changed).canImport, false);
  }
});
test("missing core fields, source row conflicts and unit scaling conflicts are visible and cannot auto-merge", () => {
  for (const [field, value] of [
    ["heightCm", null],
    ["weightKg", ""],
    ["widthCm", 1000],
    ["sourceRows", [8]],
    ["nonStack", false],
    ["model", ""]
  ]) {
    const { workbook, image } = evidence();
    image.rows[0][field] = value;
    const review = crossCheckImportEvidence(workbook, image);
    assert.equal(review.canImport, false, field);
    assert.ok(
      review.differences.some((item) => item.field === field),
      field
    );
  }
});
test("agreement cannot erase backend blocks, failed/partial tasks, missing reports or independent printed totals", () => {
  for (const change of [
    ({ workbook }) => {
      workbook.task.reconciliation.blockingIssues.push({ code: "PACKAGE_UNITS_CONFLICT" });
    },
    ({ image }) => {
      image.task.status = "FAILED";
    },
    ({ workbook }) => {
      workbook.task.partial = true;
    },
    ({ workbook }) => {
      delete workbook.task.reconciliation;
    },
    ({ image }) => {
      image.task.reconciliation.expected = { packageCount: 9, grossWeightKg: 900 };
    }
  ]) {
    const pair = evidence();
    change(pair);
    assert.equal(crossCheckImportEvidence(pair.workbook, pair.image).canImport, false);
  }
  const { workbook, image } = evidence();
  image.task.reconciliation.expected.declaredVolumeM3 = 6.3;
  assert.ok(
    crossCheckImportEvidence(workbook, image).differences.some(
      (item) => item.code === "sourceTotalConflict"
    )
  );
  delete image.task.reconciliation.expected;
  assert.equal(crossCheckImportEvidence(workbook, image).canImport, true);
  assert.equal(
    taskReconciliation(image.task).expected,
    undefined,
    "unknown printed totals stay unknown"
  );
  assert.equal(crossCheckImportEvidence(workbook, null).canImport, false);
  image.busy = true;
  assert.equal(crossCheckImportEvidence(workbook, image).canImport, false);
});
function coordinator() {
  const source = readFileSync(
    new URL("../src/components/UnifiedSmartImport.vue", import.meta.url),
    "utf8"
  );
  const { descriptor } = parse(source);
  const ast = ts.createSourceFile(
    "coordinator.js",
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true
  );
  const body = ast.statements
    .filter((node) => !ts.isImportDeclaration(node))
    .map((node) => node.getText(ast))
    .join("\n");
  const events = [],
    props = reactive({ reviewSource: null, currentCargoCount: 0, importMode: "excel" });
  const scope = effectScope();
  const api = scope.run(() =>
    new Function(
      "defineProps",
      "defineEmits",
      "computed",
      "ref",
      "watch",
      "currentLocale",
      "unifiedImportMessages",
      "classifySmartImportFile",
      "crossCheckImportEvidence",
      "taskReconciliation",
      body +
        "\nreturn { primaryFile, kind, auxiliaryFile, crossConfirmed, crossBlocked, crossReview, selectPrimary, selectAuxiliary, updateWorkbookReview, updateImageReview, forwardWorkbookImport, forwardImageImport, forwardTextImport, removeAuxiliary }; "
    )(
      () => props,
      () =>
        (...args) =>
          events.push(args),
      computed,
      ref,
      watch,
      ref("en-US"),
      unifiedImportMessages,
      classifySmartImportFile,
      crossCheckImportEvidence,
      taskReconciliation
    )
  );
  return { api, props, events, stop: () => scope.stop() };
}
const fileEvent = (file) => ({ target: { files: [file], value: "selected" } });
test("actual coordinator blocks until image completes and human confirms, resets confirmation on changes, preserves both reports", async () => {
  const h = coordinator(),
    { workbook, image } = evidence();
  h.api.selectPrimary(fileEvent({ name: "packing.xlsx", size: 100 }));
  h.api.selectAuxiliary(fileEvent({ name: "packing.png", type: "image/png", size: 100 }));
  assert.equal(h.api.crossBlocked.value, true);
  const payload = { cargos: workbook.rows, mode: "append" };
  h.api.forwardWorkbookImport(payload);
  assert.equal(h.events.length, 0);
  h.api.updateWorkbookReview(workbook);
  h.api.updateImageReview(image);
  assert.equal(h.api.crossReview.value.canImport, true);
  assert.equal(h.api.crossConfirmed.value, false);
  h.api.forwardWorkbookImport(payload);
  assert.equal(h.events.length, 0);
  h.api.crossConfirmed.value = true;
  h.api.forwardWorkbookImport(payload);
  assert.equal(h.events.length, 1);
  const report = h.events[0][1].cargos[0].packageInfo.crossCheck;
  assert.equal(report.imageTaskId, 2);
  assert.equal(report.humanConfirmed, true);
  assert.deepEqual(report.imageSourceReport.expected, image.task.reconciliation.expected);
  h.api.updateImageReview({ ...image, rows: [{ ...image.rows[0], weightKg: 61 }] });
  assert.equal(h.api.crossConfirmed.value, false);
  assert.equal(h.api.crossBlocked.value, true);
  h.props.importMode = "image";
  h.api.selectPrimary(fileEvent({ name: "other.jpg", type: "image/jpeg", size: 100 }));
  await nextTick();
  assert.equal(h.api.kind.value, "image");
  assert.equal(h.api.auxiliaryFile.value, null);
  h.stop();
});
test("dedicated import modes reject other source types, reset evidence and only forward their own import path", async () => {
  const h = coordinator();
  const workbook = { name: "source.xlsx", size: 100 };
  const image = { name: "source.png", type: "image/png", size: 100 };
  const payload = { cargos: [], mode: "append" };
  h.api.selectPrimary(fileEvent(image));
  assert.equal(h.api.primaryFile.value, null, "Excel page rejects image as its primary source");
  h.api.selectPrimary(fileEvent(workbook));
  h.api.selectAuxiliary(fileEvent(image));
  h.api.crossConfirmed.value = true;
  h.props.importMode = "image";
  assert.equal(h.api.primaryFile.value, null);
  assert.equal(h.api.auxiliaryFile.value, null);
  assert.equal(h.api.crossConfirmed.value, false);
  h.api.selectPrimary(fileEvent(workbook));
  assert.equal(h.api.primaryFile.value, null, "Image page rejects a workbook");
  h.api.selectPrimary(fileEvent(image));
  assert.equal(h.api.primaryFile.value.name, image.name);
  h.api.selectAuxiliary(fileEvent(image));
  assert.equal(h.api.auxiliaryFile.value, null, "Only Excel can add comparison evidence");
  h.api.forwardWorkbookImport(payload);
  h.api.forwardTextImport(payload);
  assert.equal(h.events.length, 0);
  h.api.forwardImageImport(payload);
  assert.equal(h.events.length, 1);
  h.props.importMode = "text";
  h.api.selectPrimary(fileEvent(workbook));
  assert.equal(h.api.primaryFile.value, null, "Text page does not accept primary files");
  h.api.forwardImageImport(payload);
  h.api.forwardWorkbookImport(payload);
  assert.equal(h.events.length, 1);
  h.api.forwardTextImport(payload);
  assert.equal(h.events.length, 2);
  h.props.reviewSource = { file: workbook };
  await nextTick();
  assert.equal(
    h.api.primaryFile.value,
    null,
    "Workbook review handoffs cannot replace a text source"
  );
  h.stop();
});

test("unified entry and both review components compile; legacy quick controls are no longer offered", () => {
  for (const file of [
    "UnifiedSmartImport.vue",
    "ExcelTemplatePage.vue",
    "ScreenshotImportReview.vue"
  ]) {
    const source = readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");
    const { descriptor, errors } = parse(source);
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
  const excel = readFileSync(
    new URL("../src/components/ExcelTemplatePage.vue", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(excel, /id="quick-import-tab"/);
  assert.match(excel, /!props.externalImportBlocked/);
  const app = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
  assert.doesNotMatch(app, /:on-change="handleWorkbookQuickUpload"|v-model="smartImportKind"/);
  assert.equal((app.match(/<UnifiedSmartImport/g) || []).length, 1);
  assert.doesNotMatch(app, /embedded-smart-import/);
  assert.match(app, /v-else-if="isImportPage"/);
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function workbookRequests(props = { sourceFile: null }) {
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
  const names = new Set([
    "loadWorkbookFileForRecognition",
    "submitTextRecognitionTask",
    "fillRecognitionSample",
    "clearRecognition",
    "handlePreciseDrop",
    "handlePreciseFile",
    "useWorkspaceFile",
    "selectPreciseQueueItem",
    "applyPreciseSnapshot"
  ]);
  const body = ast.statements
    .filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
    .map((node) => node.getText(ast))
    .join("\n");
  const requests = new Map();
  const create = (file) => {
    const request = deferred();
    requests.set(file.name, request);
    return request.promise;
  };
  const state = new Function(
    "create",
    "props",
    `
    let componentActive = true, recognitionRunVersion = 0;
    const cell = (value) => ({ value });
    const sourceWorkbookFile = cell(null), recognitionWorkbook = cell(null), recognitionAgentTask = cell(null), preciseImportBusy = cell(false), recognitionAgentBusy = cell(false), recognitionText = cell(""), excelMode = cell("recognition"), recognitionPreview = cell(null), recognitionVolumeConfirmed = cell(false), recognitionReviewIndexOverrides = cell({}), recognitionBlockingIssues = cell([]), recognitionPackingReview = cell({ blockingIssues: [] }), recognitionRows = cell([]), recognitionQuantity = cell(0);
    const isSupportedWorkbookFile = () => true, readWorkbookInWorker = async (file) => ({ fileName: file.name }), clearWorkbookPreview = () => {}, resetRecognitionResult = () => { recognitionAgentTask.value = null; }, startRecognitionTimer = () => {}, stopRecognitionTimer = () => {}, setRecognitionStatus = () => {}, clearRecognitionStatus = () => {}, assertExcelAgentBackendReady = async () => ({}), createWorkbookRecognitionTask = create, createTextRecognitionTask = () => create({ name: "pasted-text" }), assertCreatedExcelTaskEngine = () => {}, waitForTextRecognitionTask = () => { throw new Error("unexpected poll"); }, closeRecognitionEdit = () => {}, setRecognitionStatusFactory = () => {}, recognitionTaskFailureMessage = () => "failed", recognitionBlockingMessage = () => "blocked", closeRecognitionReviewDialog = () => {}, openRecognitionReviewDialog = () => {}, ui = (key) => key;
    ${body}
    return { run: loadWorkbookFileForRecognition, submit: submitTextRecognitionTask, fillRecognitionSample, clearRecognition, handlePreciseDrop, handlePreciseFile, useWorkspaceFile, selectPreciseQueueItem, applyPreciseSnapshot, sourceWorkbookFile, recognitionWorkbook, recognitionAgentTask, preciseImportBusy, recognitionAgentBusy, dispose: () => { componentActive = false; } };
  `
  )(create, props);
  return { ...state, requests };
}
test("actual workbook request generation keeps source B and result B when request A resolves late", async () => {
  const h = workbookRequests();
  const a = h.run({ name: "A.xlsx" });
  await new Promise(setImmediate);
  const b = h.run({ name: "B.xlsx" });
  await new Promise(setImmediate);
  h.requests.get("B.xlsx").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "B" }] });
  await b;
  h.requests.get("A.xlsx").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "A" }] });
  await a;
  assert.equal(h.sourceWorkbookFile.value.name, "B.xlsx");
  assert.equal(h.recognitionWorkbook.value.fileName, "B.xlsx");
  assert.equal(h.recognitionAgentTask.value.cleanedRows[0].name, "B");
  assert.equal(h.recognitionAgentBusy.value, false);
});
test("stale workbook finally cannot clear current busy state; disposed components discard results", async () => {
  const h = workbookRequests();
  const a = h.run({ name: "A.xlsx" });
  await new Promise(setImmediate);
  const b = h.run({ name: "B.xlsx" });
  await new Promise(setImmediate);
  h.requests.get("A.xlsx").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "A" }] });
  await a;
  assert.equal(h.recognitionAgentBusy.value, true);
  assert.equal(h.preciseImportBusy.value, true);
  assert.equal(h.recognitionAgentTask.value, null);
  h.dispose();
  h.requests.get("B.xlsx").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "B" }] });
  await b;
  assert.equal(h.recognitionAgentTask.value, null);
});

test("parent-owned workbook A rejects internal file, text, library, queue, sample and clear source changes", async () => {
  const fileA = { name: "A.xlsx" },
    fileB = { name: "B.xlsx" };
  const h = workbookRequests({ sourceFile: fileA });
  const run = h.run(fileA);
  await new Promise(setImmediate);
  h.requests.get("A.xlsx").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "A" }] });
  await run;
  const taskA = h.recognitionAgentTask.value;
  assert.equal(await h.run(fileB), false);
  assert.equal(await h.submit({ textOverride: "unrelated source B" }), false);
  h.fillRecognitionSample();
  h.clearRecognition();
  h.handlePreciseFile(fileEvent(fileB));
  await h.handlePreciseDrop({ dataTransfer: { files: [fileB] } });
  await h.useWorkspaceFile({ id: "B" });
  h.selectPreciseQueueItem({ file: fileB, snapshot: { file: fileB } });
  h.applyPreciseSnapshot({ file: fileB });
  assert.equal(h.requests.size, 1);
  assert.equal(h.sourceWorkbookFile.value, fileA);
  assert.equal(h.recognitionAgentTask.value, taskA);
  assert.equal(h.recognitionWorkbook.value.fileName, "A.xlsx");
});
test("parent-owned image A cannot be replaced through a hidden picker or internal file application", () => {
  const source = readFileSync(
    new URL("../src/components/ScreenshotImportReview.vue", import.meta.url),
    "utf8"
  );
  const { descriptor } = parse(source);
  const ast = ts.createSourceFile(
    "image.js",
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true
  );
  const functions = ast.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) && ["selectFile", "applyFile"].includes(node.name?.text)
    )
    .map((node) => node.getText(ast))
    .join("\n");
  const fileA = { name: "A.png", type: "image/png", size: 100 },
    fileB = { name: "B.png", type: "image/png", size: 100 };
  const state = new Function(
    "props",
    `
    const file = { value: null }, previewUrl = { value: "" }, task = { value: null }, rows = { value: [] }, confirmed = { value: false }, status = { value: "" }, copy = { value: { invalidFile: "invalid" } };
    const stopWaiting = () => {}, URL = { revokeObjectURL: () => {}, createObjectURL: (value) => value.name };
    ${functions}
    return { file, previewUrl, task, applyFile, selectFile };
  `
  )({ sourceFile: fileA });
  state.applyFile(fileA);
  state.task.value = { id: "A" };
  const event = fileEvent(fileB);
  state.selectFile(event);
  state.applyFile(fileB);
  assert.equal(event.target.value, "");
  assert.equal(state.file.value, fileA);
  assert.equal(state.previewUrl.value, "A.png");
  assert.equal(state.task.value.id, "A");
});

test("unowned workbook view clears its prior file identity before recognizing pasted text", async () => {
  const h = workbookRequests();
  const run = h.run({ name: "A.xlsx" });
  await new Promise(setImmediate);
  h.requests.get("A.xlsx").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "A" }] });
  await run;
  const textRun = h.submit({ textOverride: "cargo source B" });
  await new Promise(setImmediate);
  assert.equal(h.sourceWorkbookFile.value, null);
  assert.equal(h.recognitionWorkbook.value, null);
  h.requests.get("pasted-text").resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "B" }] });
  await textRun;
  assert.equal(h.recognitionAgentTask.value.cleanedRows[0].name, "B");
  assert.equal(h.sourceWorkbookFile.value, null);
});

test("text import cannot switch to a workbook through file drop or direct recognition submission", async () => {
  const h = workbookRequests({ sourceFile: null, recognitionInput: "text" });
  const file = { name: "unrelated.xlsx", size: 100 };
  assert.equal(await h.run(file), false);
  assert.equal(await h.submit({ file }), false);
  h.handlePreciseFile(fileEvent(file));
  await h.handlePreciseDrop({ dataTransfer: { files: [file] } });
  assert.equal(h.requests.size, 0);
  assert.equal(h.sourceWorkbookFile.value, null);
  const run = h.submit({ textOverride: "P1 120 x 100 x 52.5 cm, 1 package, gross 60 kg" });
  await new Promise(setImmediate);
  assert.equal(h.requests.size, 1);
  h.requests
    .get("pasted-text")
    .resolve({ status: "SUCCEEDED", cleanedRows: [{ name: "text cargo" }] });
  await run;
  assert.equal(h.recognitionAgentTask.value.cleanedRows[0].name, "text cargo");
});
