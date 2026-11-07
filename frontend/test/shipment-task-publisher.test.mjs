import { effectScope } from "vue";
import assert from "node:assert/strict";
import test from "node:test";
import * as xlsx from "xlsx";
import { prepareSheet, recognizeShipmentBatchSchemas } from "../src/services/shipmentBatchImport.js";
import {
  createTaskEditor,
  readTaskWorkbook,
  recognizeTaskWorkbook,
  restoreTaskEditor,
  reviewTaskRows,
  taskDraftPayload,
  taskMayPublish,
  taskNeedsModelRecognition
} from "../src/features/shipments/shipmentTaskDraft.js";
import { matchesShipmentTask, shipmentTaskName } from "../src/features/shipments/shipmentTaskBatch.js";
import { useShipmentTaskPublisher } from "../src/features/shipments/useShipmentTaskPublisher.js";

const scopeFixture = () =>
  recognizeTaskWorkbook(
    prepareSheet("April", [
      ["Carrier", "B/L NO", "JOB NUMBER"],
      ["OOCL", "OOLU12345", "EX-1"],
      ["OOCL", "", "EX-2"],
      ...Array.from({ length: 60 }, (_, index) => ["OOCL", `OOLU200${index}`, `EX-${index + 3}`])
    ]),
    1
  );
const draftPayload = () => ({
  ...createTaskEditor(),
  ...scopeFixture(),
  sourceMeta: { ...scopeFixture().sourceMeta, recognitionSource: "LLM", modelVerified: true },
  sourceFileName: "ships.xlsx"
});

test("draft payload retains original values and all 62 candidates after edits and exclusions", () => {
  const editor = draftPayload();
  assert.equal(editor.rows.length, 62);
  assert.equal(editor.sourceMeta.total, 62);
  assert.deepEqual(
    reviewTaskRows(editor)[1].errors.map(({ code }) => code),
    ["MISSING_REFERENCE"]
  );
  editor.rows[0].disposition = "EXCLUDE";
  Object.assign(editor.rows[1], { number: "OOLU45678", referenceEdited: true });
  const payload = taskDraftPayload(editor, reviewTaskRows(editor));
  const restored = restoreTaskEditor(JSON.parse(JSON.stringify(payload)));
  assert.equal(payload.items.length, 61);
  assert.equal(payload.items.at(-1).sourceRow, 63);
  assert.equal(restored.rows.length, 62);
  assert.equal(restored.rows[0].disposition, "EXCLUDE");
  assert.equal(restored.rows[1].number, "OOLU45678");
  assert.equal(restored.rows[1].originalReference, "");
  assert.deepEqual(restored.rows[1].sourceCells, ["OOCL", "", "EX-2"]);
  assert.equal(payload.items[0].importedDetails.forwarderJobNumber, "EX-2");
  assert.equal(payload.items[0].importedDetails.originalBillOfLading, "OOLU45678");
  assert.equal(payload.items[0].recognitionErrorCode, "");
});

test("recognized unsupported carriers require an explicit manual booking or exclusion", () => {
  const editor = {
    ...createTaskEditor(),
    ...recognizeTaskWorkbook(
      prepareSheet("manual", [
        ["Carrier", "Booking"],
        ["HEDE", "HED123456"]
      ]),
      1
    )
  };
  assert.equal(reviewTaskRows(editor, "LOCAL_QUEUE")[0].errors[0].code, "CARRIER_NOT_CONFIGURED");
  editor.rows[0].disposition = "MANUAL";
  const manual = reviewTaskRows(editor, "LOCAL_QUEUE")[0];
  assert.deepEqual(manual.errors, []);
  assert.equal(manual.item.manualOnly, true);
  editor.mode = "QUERY_ONLY";
  assert.equal(reviewTaskRows(editor, "LOCAL_QUEUE")[0].errors[0].code, "MANUAL_REQUIRES_IMPORT");
});

test("UTF-8 CSV retains Chinese headers, quoted values, and long identifiers with leading zeros", () => {
  const contents =
    '船公司,提单号,业务单号,起运港\r\nOOCL,OOLU12345,000123456789012345678,"上海,中国"';
  for (const bom of ["", "\uFEFF"]) {
    const [sheet] = readTaskWorkbook(new TextEncoder().encode(bom + contents), xlsx, "运单.CSV");
    const { rows, sourceMeta, problems } = recognizeTaskWorkbook(sheet, sheet.suggestedColumnIndex);
    assert.deepEqual(problems, []);
    assert.equal(sourceMeta.total, 1);
    assert.equal(sourceMeta.columnLabel, "提单号");
    assert.equal(rows[0].carrier, "OOCL");
    assert.equal(rows[0].number, "OOLU12345");
    assert.equal(rows[0].importedDetails.forwarderJobNumber, "000123456789012345678");
    assert.equal(rows[0].importedDetails.portOfLoading, "上海,中国");
  }
});

test("a carrier directory CSV with a trailing bill column imports bilingual names and flags conflicts", () => {
  const contents = [
    "船东简称,全称,全球官网,中国区 / 中文入口,货物跟踪直达,,,,提单号码",
    "MSC 地中海,,,,,,,,MEDU12345678",
    "CMA‑CGM 达飞,,,,,,,,NAM1234567",
    "WHL 万海,,,,,,,,WHLC12345678",
    "MAERSK 马士基,,,,,,,,COSU1234567890"
  ].join("\r\n");
  const [sheet] = readTaskWorkbook(new TextEncoder().encode(contents), xlsx, "carriers.csv");
  assert.equal(sheet.suggestedColumnIndex, 8);
  const { rows, problems } = recognizeTaskWorkbook(sheet, sheet.suggestedColumnIndex);
  assert.deepEqual(problems, []);
  assert.deepEqual(rows.map(({ carrier }) => carrier), ["MSC", "CMA", "WAN_HAI", "MAERSK"]);
  assert.deepEqual(
    reviewTaskRows({ ...createTaskEditor(), rows }, "LOCAL_QUEUE").map(({ errors }) =>
      errors.map(({ code }) => code)
    ),
    [[], [], [], ["CARRIER_CONFLICT"]]
  );
});

test("schema assistance sends only safe labels and retains accepted suggestions in the draft", async () => {
  const input = prepareSheet("Private customer workbook", [
    ["海运主单编号", "Ocean Operator", "secret@example.com", "https://example.com", "XYZ12345", "客户甲有限公司"],
    ["MEDU1234567", "MSC", "internal", "", ""],
    ["00001234", "海洋轮船", "internal", "", ""],
    ["COSU12345678", "海洋轮船", "internal", "", ""],
    ["00005678", "送货备注", "internal", "", ""],
    ["00009876", "SHIP12345", "internal", "", ""]
  ]);
  const calls = [];
  const [sheet] = await recognizeShipmentBatchSchemas([input], async (payload) => {
    calls.push(payload);
    return payload.headers.length
      ? {
          recognitionSource: "LLM", modelVerified: true, status: "SUGGESTED",
          referenceColumnIndex: 0,
          referenceType: "BILLOFLADING",
          carrierColumnIndex: 1
        }
      : { recognitionSource: "LLM", modelVerified: true, status: "SUGGESTED", carrierMappings: [{ label: "海洋轮船", carrier: "MSC" }] };
  });
  assert.deepEqual(calls, [
    {
      headers: [
        { index: 0, label: "海运主单编号" },
        { index: 1, label: "Ocean Operator" }
      ],
      carrierLabels: []
    },
    { headers: [], carrierLabels: ["海洋轮船"] }
  ]);
  assert.deepEqual(sheet.rows, input.rows);
  const editor = { ...createTaskEditor(), ...recognizeTaskWorkbook(sheet, 0) };
  const review = reviewTaskRows(editor, "LOCAL_QUEUE");
  assert.equal(editor.sourceMeta.schemaStatus, "SUGGESTED");
  assert.equal(editor.sourceMeta.referenceSuggested, true);
  assert.equal(editor.sourceMeta.columnLabel, "海运主单编号");
  assert.equal(editor.rows[1].number, "00001234");
  assert.equal(editor.rows[1].type, "BILLOFLADING");
  assert.equal(editor.rows[1].carrierEvidence, "ai");
  assert.equal(editor.rows[1].sourceCarrierLabel, "海洋轮船");
  assert.deepEqual(review[1].errors, []);
  assert.equal(editor.rows[2].carrier, "COSCO");
  assert.equal(editor.rows[2].carrierEvidence, "prefix");
  assert.equal(review[3].errors[0].code, "UNKNOWN_CARRIER");
  const reopened = restoreTaskEditor(JSON.parse(JSON.stringify(taskDraftPayload(editor, review))));
  assert.deepEqual(reopened.sourceMeta, editor.sourceMeta);
  assert.deepEqual(reopened.rows, editor.rows);
});

test("resolved rule sheets still require the model while result and unsafe workbooks are rejected", async () => {
  const rule = prepareSheet("Tasks", [
    ["船东简称", "提单号码"],
    ["MAERSK 马士基", "COSU12345678"],
    ["WHL 万海", "WHLC12345678"]
  ]);
  const result = prepareSheet("Results", [
    ["提交单号", "箱号", "主提单号码"],
    ["MEDU12345", "MSCU98765", "MEDU12345"]
  ]);
  const calls = [];
  const recognize = async (payload) => {
    calls.push(payload);
    return { recognitionSource: "LLM", modelVerified: true, status: "SUGGESTED",
      referenceColumnIndex: 1, referenceType: "BILLOFLADING", carrierColumnIndex: 0 };
  };
  const [recognized, blocked] = await recognizeShipmentBatchSchemas([rule, result], recognize);
  assert.equal(recognized.modelVerified, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].headers, [{index:0,label:"船东简称"},{index:1,label:"提单号码"}]);
  assert.deepEqual(recognized.rows, rule.rows);
  assert.equal(blocked, result);
  const { rows } = recognizeTaskWorkbook(recognized, recognized.suggestedColumnIndex);
  assert.equal(reviewTaskRows({ ...createTaskEditor(), rows }, "LOCAL_QUEUE")[0].errors[0].code, "CARRIER_CONFLICT");
  const headerless = prepareSheet("Private records", [
    ["客户甲有限公司", "上海市浦东新区张江路"],
    ["EX12345678", "MSC"]
  ]);
  const [blockedAlone, ignored] = await recognizeShipmentBatchSchemas([result, headerless], recognize);
  assert.equal(recognizeTaskWorkbook(blockedAlone, null).problems[0].code, "RESULT_WORKBOOK");
  assert.equal(ignored.modelVerified, false);
  assert.equal(calls.length, 1);
});
test("a known carrier in a model-suggested carrier column still conflicts with a reference prefix", async () => {
  const input = prepareSheet("Tasks", [
    ["B/L NO", "Shipping Line"],
    ["COSU123456789", "MSC"],
    ["OTHER123456", "MAERSK"]
  ]);
  const [sheet] = await recognizeShipmentBatchSchemas([input], async () => ({
    recognitionSource: "LLM", modelVerified: true, status: "SUGGESTED",
    referenceColumnIndex: 0, referenceType: "BILLOFLADING", carrierColumnIndex: 1
  }));
  const { rows } = recognizeTaskWorkbook(sheet, 0);
  assert.equal(rows[0].carrierEvidence, "ai");
  assert.equal(rows[0].carrier, "MSC");
  assert.deepEqual(
    reviewTaskRows({ ...createTaskEditor(), rows }, "LOCAL_QUEUE")[0].errors.map(({ code }) => code),
    ["CARRIER_CONFLICT"]
  );
});

test("model outages use labelled header review; a model cannot invent a column", async () => {
  const input = prepareSheet("Tasks", [
    ["Booking", "B/L NO", "CARRIER"],
    ["00001234", "OOXX12345", "海洋轮船"]
  ]);
  for (const response of [
    () => { throw new Error("Timeout"); },
    () => ({ status: "SUGGESTED", referenceColumnIndex: 0, referenceType: "BOOKING" }),
    () => ({ recognitionSource:"LLM", modelVerified:true, status:"SUGGESTED", referenceColumnIndex: 99, referenceType:"BOOKING" })
  ]) {
    const [sheet] = await recognizeShipmentBatchSchemas([input], response);
    assert.equal(sheet.modelVerified, false);
    if (sheet.schemaStatus === "REVIEW_HEADERS") {
      assert.equal(sheet.recognitionSource, "HEADERS");
      assert.equal(sheet.modelRequired, false);
    } else {
      assert.equal(sheet.schemaStatus, "NO_MATCH");
      assert.ok(recognizeTaskWorkbook(sheet, 0).problems.some(({code})=>code==="MODEL_RECOGNITION_REQUIRED"));
    }
  }
  const [assisted] = await recognizeShipmentBatchSchemas([input], async ({headers}) => headers.length
    ? { recognitionSource:"LLM", modelVerified:true, status:"SUGGESTED", referenceColumnIndex:0, referenceType:"BOOKING", carrierColumnIndex:2 }
    : { recognitionSource:"LLM", modelVerified:true, status:"SUGGESTED", carrierMappings:[{label:"海洋轮船",carrier:"MSC"},{label:"MSC",carrier:"OOCL"}] });
  for (const [index, type] of [[0, "BOOKING"], [1, "BILLOFLADING"]]) {
    const { rows } = recognizeTaskWorkbook(assisted, index);
    assert.equal(rows[0].carrier, "MSC");
    assert.equal(rows[0].type, type);
  }
});

test("an XLSX round trip preserves row-level reference type, source address, and padded booking numbers", async () => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["承运船司", "提单号 (B/L No.)", "订舱号 (Booking No.)", "箱号 (Container No.)", "参考号", "单号类型", "客户订单号", "封条号"],
    ["MSC","MEDUW8444954","BK000011","CSQU3054383"],
    ["COSCO","",45,"CSQU3054383"],
    ["MSC","","","OOLU1234567"],
    ["MSC","","","","CSQU3054383"],
    ["MSC","","","","OOLU1234567","箱子号"]
  ]);
  ws.C3.z = "00000000";
  const wb=xlsx.utils.book_new(); xlsx.utils.book_append_sheet(wb,ws,"运单");
  const [source]=readTaskWorkbook(xlsx.write(wb,{type:"array",bookType:"xlsx"}),xlsx,"运单.xlsx");
  const [sheet]=await recognizeShipmentBatchSchemas([source],async({headers})=>{
    assert.equal(headers.some(({label})=>label==="客户订单号" || label==="封条号"),false);
    return {status:"SUGGESTED",recognitionSource:"LLM",modelVerified:true,referenceColumnIndex:3,referenceType:"CONTAINER",carrierColumnIndex:0};
  });
  const read=(column,autoReferenceColumns) => recognizeTaskWorkbook(sheet,column,{autoReferenceColumns,adapterMode:"LOCAL_QUEUE"});
  const auto=read(sheet.suggestedColumnIndex,true);
  assert.deepEqual(auto.rows.map(r=>[r.carrier,r.type,r.number,r.sourceAddress]),[
    ["MSC","BILLOFLADING","MEDUW8444954","B2"],["COSCO","BOOKING","00000045","C3"],
    ["MSC","CONTAINER","OOLU1234567","D4"],["MSC","BOOKING","CSQU3054383","E5"],
    ["MSC","CONTAINER","OOLU1234567","E6"]
  ]);
  assert.deepEqual(reviewTaskRows({...createTaskEditor(), ...auto},"LOCAL_QUEUE")[3].errors,[]);
  assert.equal(read(3,false).rows[0].number,"CSQU3054383");
  assert.equal(read(2,false).rows[2].number,"");
});

test("unlabelled and entirely headerless input retains the first shipment and requires a choice for competing columns", async () => {
  const fromCSV = async text => {
    const sheets = readTaskWorkbook(new TextEncoder().encode(text), xlsx, "task.csv");
    const [sheet] = await recognizeShipmentBatchSchemas(sheets, () => {throw Error("No reference labels to send");});
    return sheet;
  };
  for (const csv of ["MSC,00000041\nCOSCO,00000042","船司,\nMSC,00000041\nCOSCO,00000042"]) {
    const sheet=await fromCSV(csv);
    const { rows }=recognizeTaskWorkbook(sheet,sheet.suggestedColumnIndex,{autoReferenceColumns:true,adapterMode:"LOCAL_QUEUE"});
    assert.deepEqual(rows.map(row=>[row.carrier,row.type,row.number]),[["MSC","BOOKING","00000041"],["COSCO","BOOKING","00000042"]]);
    assert.equal(rows[0].sourceAddress,csv.startsWith("MSC") ? "B1" : "B2");
  }
  const sheet=await fromCSV("船司,,,封号,订单号\nMSC,00001234,00005678,SEAL111,PO222");
  const get=(idx,autoReferenceColumns)=>recognizeTaskWorkbook(sheet,idx,{autoReferenceColumns,adapterMode:"LOCAL_QUEUE"});
  const [pending]=reviewTaskRows({...createTaskEditor(),...get(sheet.suggestedColumnIndex,true)},"LOCAL_QUEUE");
  assert.ok(pending.errors.some(({code})=>code==="CHOOSE_COLUMN"));
  assert.equal(get(2,false).rows[0].number,"00005678");
  assert.deepEqual(sheet.columns.filter(c=>c.score>0).map(c=>c.index),[1,2]);
});

test("task recognition retains every row through 500, rejects overflow, and flags a container in a bill column", () => {
  const sheet = prepareSheet("Tasks", [["Carrier", "B/L NO"],
    ...Array.from({length: 501}, (_, index) => ["MSC", `MEDU${10000000+index}`])]);
  const recognized = recognizeTaskWorkbook(sheet, 1);
  assert.equal(recognized.sourceMeta.total, 501);
  assert.equal(recognized.rows.length, 500);
  assert.ok(recognized.problems.some(({code})=>code==="BATCH_LIMIT"));
  const container = recognizeTaskWorkbook(prepareSheet("Tasks", [["Carrier","B/L NO"],["MSC","CSQU3054383"]]),1);
  assert.ok(reviewTaskRows({...createTaskEditor(), ...container},"LOCAL_QUEUE")[0].errors.some(({code})=>code==="CONTAINER_REFERENCE"));
});
test("model types and carrier columns cannot silently contradict explicit source headers", async () => {
  const input = prepareSheet("Tasks", [["Carrier", "B/L NO", "Shipping Line"], ["MSC", "MEDU12345678", "OOCL"]]);
  for (const [referenceType, carrierColumnIndex] of [["BOOKING", 0], ["BILLOFLADING", 2]]) {
    const [sheet] = await recognizeShipmentBatchSchemas([input], async () => ({
      recognitionSource:"LLM", modelVerified:true, status:"SUGGESTED",
      referenceColumnIndex:1, referenceType, carrierColumnIndex
    }));
    assert.equal(sheet.modelVerified, false);
    assert.equal(sheet.schemaStatus, "NO_MATCH");
    assert.deepEqual(sheet.rows, input.rows);
  }
});

test("an unambiguous model reference may retain a null carrier column for local row validation", async () => {
  const input=prepareSheet("Tasks",[["船东简称","全称","提单号码"],
    ["MAERSK 马士基","Maersk","COSU1234567890"]]);
  const [sheet]=await recognizeShipmentBatchSchemas([input],async()=>({
    recognitionSource:"LLM",modelVerified:true,status:"SUGGESTED",
    referenceColumnIndex:2,referenceType:"BILLOFLADING",carrierColumnIndex:null
  }));
  assert.equal(sheet.modelVerified,true);
  const recognized=recognizeTaskWorkbook(sheet,2);
  assert.equal(recognized.rows[0].number,"COSU1234567890");
  const review=reviewTaskRows({...createTaskEditor(),...recognized},"LOCAL_QUEUE");
  assert.ok(review[0].errors.some(({code})=>code==="CARRIER_CONFLICT"));
});

test("each task worksheet is model-checked independently and carrier-only rows remain visible problems", async () => {
  const sheets = ["First", "Second"].map((name) => prepareSheet(name,
    [["Carrier","B/L NO"],["MSC","MEDU12345678"],["MSC",""]]));
  let calls = 0;
  const parsed = await recognizeShipmentBatchSchemas(sheets, async () => {
    calls++;
    return {recognitionSource:"LLM",modelVerified:true,status:"SUGGESTED",
      referenceColumnIndex:1,referenceType:"BILLOFLADING",carrierColumnIndex:0};
  });
  assert.equal(calls, 2);
  for (const sheet of parsed) {
    const recognized = recognizeTaskWorkbook(sheet,1);
    assert.equal(recognized.sourceMeta.total,2);
    assert.equal(recognized.rows.length,2);
    assert.equal(recognized.rows[1].sourceRow,3);
    assert.ok(recognized.rows[1].sourceIssues.some(({code})=>code==="MISSING_REFERENCE"));
  }
});

test("historical file drafts stay editable but cannot publish without completed LLM recognition", () => {
  const publishState = {dirty:false,reviewed:true,issues:0,items:1};
  const task = {status:"DRAFT",revision:1,mode:"QUERY_ONLY",sourceFileName:"legacy.xlsx",
    sourceRows:[{sourceMeta:{sheetName:"Orders",schemaStatus:"SUGGESTED"}}]};
  assert.equal(taskNeedsModelRecognition(task),true);
  assert.equal(taskMayPublish(task,publishState),false);
  assert.equal(restoreTaskEditor(task).sourceFileName,"legacy.xlsx");
  for (const partial of [{modelVerified:true},{recognitionSource:"LLM"}]) {
    task.sourceRows[0].sourceMeta={sheetName:"Orders",...partial};
    assert.equal(taskMayPublish(task,publishState),false);
  }
  task.sourceRows[0].sourceMeta={sheetName:"Orders",modelVerified:true,recognitionSource:"LLM"};
  assert.equal(taskMayPublish(task,publishState),true);
  const metadataOnly={...task,sourceFileName:"",sourceRows:[{sourceMeta:{sheetName:"Orders"}}]};
  assert.equal(taskMayPublish(metadataOnly,publishState),false);
  const manual={...task,sourceFileName:"",sourceRows:[]};
  assert.equal(taskNeedsModelRecognition(manual),false);
  assert.equal(taskMayPublish(manual,publishState),true);
});

test("automatically named and legacy drafts use a file name fallback without setting an override", () => {
  const sourceFileName = "a".repeat(125) + ".2026.csv";
  const derivedName = "a".repeat(125) + ".2026";
  for (const taskName of [undefined, derivedName]) {
    const task = { taskId: "legacy", sourceFileName, taskName };
    assert.equal(shipmentTaskName(task), derivedName);
    assert.equal(taskDraftPayload(restoreTaskEditor(task), []).taskName, null);
  }
});

function publisher({ confirmDelete } = {}) {
  const scope = effectScope();
  const calls = [];
  const records = new Map();
  let nextTimeout;
  let discard = false;
  let conflict = false;
  const capture = (name, value) => calls.push([name, structuredClone(value)]);
  const store = (id, payload, revision, status = "DRAFT") => {
    const task = JSON.parse(
      JSON.stringify({
        ...payload,
        taskId: id,
        revision,
        status,
        validationErrors: []
      })
    );
    records.set(id, task);
    return structuredClone(task);
  };
  const api = {
    async list() {
      return [...records.values()].map((task) => structuredClone(task));
    },
    async get(id) {
      capture("get", id);
      return structuredClone(records.get(id));
    },
    async create(payload) {
      capture("create", JSON.parse(JSON.stringify(payload)));
      return store("one", payload, 1);
    },
    async update(id, payload) {
      capture("update", JSON.parse(JSON.stringify(payload)));
      if (conflict) throw Object.assign(new Error("changed"), { status: 409 });
      return store(id, payload, payload.expectedRevision + 1);
    },
    async publish(id, revision) {
      capture("publish", { id, revision });
      return store(id, records.get(id), revision, "QUEUED");
    },
    async remove(id, revision) {
      capture("remove", { id, revision });
      records.delete(id);
    }
  };
  const scheduler = {
    setTimeout(callback) {
      nextTimeout = callback;
      return 1;
    },
    clearTimeout() {
      nextTimeout = undefined;
    }
  };
  const state = scope.run(() =>
    useShipmentTaskPublisher({
      api,
      scheduler,
      confirmDiscard: () => discard,
      confirmDelete,
      reportError: () => {}
    })
  );
  return {
    state,
    calls,
    api,
    records,
    store,
    scope,
    tick: () => nextTimeout?.(),
    permitDiscard: () => {
      discard = true;
    },
    simulateConflict: () => {
      conflict = true;
    }
  };
}

test("upload and save never publish, and only the reviewed current server revision can publish", async () => {
  const { state, calls, scope } = publisher();
  try {
    assert.equal(await state.importFile(draftPayload), true);
    assert.deepEqual(
      calls.map(([action]) => action),
      ["create"]
    );
    assert.equal(state.selected.value.status, "DRAFT");
    assert.equal(state.dirty.value, false);
    state.reviewed.value = true;
    assert.equal(state.canPublish.value, false);
    state.editor.value.rows[1].disposition = "EXCLUDE";
    state.editor.value.customerId = "client-1";
    assert.equal(state.reviewed.value, false);
    assert.equal(state.dirty.value, true);
    state.reviewed.value = true;
    assert.equal(await state.publish(), false);
    assert.equal(await state.save(), true);
    assert.deepEqual(
      calls.map(([action]) => action),
      ["create", "update"]
    );
    assert.equal(calls[1][1].expectedRevision, 1);
    assert.equal(state.selected.value.revision, 2);
    assert.equal(state.reviewed.value, false);
    state.reviewed.value = true;
    assert.equal(await state.publish(), true);
    assert.deepEqual(calls.at(-1), ["publish", { id: "one", revision: 2 }]);
    assert.equal(state.selected.value.status, "QUEUED");
    assert.equal(await state.publish(), false);
  } finally {
    scope.stop();
  }
});

test("an optional name survives first upload and can be renamed independently of the file", async () => {
  const { state, calls, scope } = publisher();
  try {
    state.editor.value.taskName = "  上海出口  ";
    assert.equal(state.dirty.value, true);
    assert.equal(await state.importFile(draftPayload), true);
    assert.equal(calls[0][1].taskName, "上海出口");
    assert.equal(calls[0][1].sourceFileName, "ships.xlsx");
    assert.equal(state.dirty.value, false);
    state.editor.value.taskName = "本周出口";
    assert.equal(await state.save(), true);
    assert.equal(calls[1][1].taskName, "本周出口");
    assert.equal(calls[1][1].sourceFileName, "ships.xlsx");
    assert.equal(await state.open("one"), true);
    assert.equal(state.editor.value.taskName, "本周出口");
    assert.equal(shipmentTaskName(state.selected.value), "本周出口");
    assert.equal(matchesShipmentTask(state.selected.value, "本周"), true);
    assert.equal(matchesShipmentTask(state.selected.value, "ships.xlsx"), true);
  } finally {
    scope.stop();
  }
});

test("reopening a saved draft restores exclusions, while conflicting updates retain unsaved edits", async () => {
  const { state, scope, permitDiscard, simulateConflict } = publisher();
  try {
    await state.importFile(draftPayload);
    state.editor.value.rows[1].disposition = "EXCLUDE";
    await state.save();
    assert.equal(state.startNew(), true);
    await state.list();
    assert.equal(state.tasks.value.length, 1);
    await state.open("one");
    assert.equal(state.editor.value.rows[1].disposition, "EXCLUDE");
    state.editor.value.rows[0].number = "OOLU999999";
    simulateConflict();
    assert.equal(await state.save(), false);
    assert.equal(state.error.value.cause.status, 409);
    assert.equal(state.editor.value.rows[0].number, "OOLU999999");
    assert.equal(await state.open("one"), false);
    permitDiscard();
    assert.equal(await state.open("one"), true);
    assert.equal(state.editor.value.rows[0].number, "OOLU12345");
  } finally {
    scope.stop();
  }
});

test("late polling cannot overwrite a newly opened draft or reschedule after disposal", async () => {
  const { state, scope, api, store, tick } = publisher();
  store("active", { items: [] }, 1, "RUNNING");
  store("draft", taskDraftPayload(draftPayload(), reviewTaskRows(draftPayload())), 1);
  await state.open("active");
  const get = api.get;
  let settle;
  api.get = (id) =>
    id === "active"
      ? new Promise((resolve) => {
          settle = resolve;
        })
      : get(id);
  const polling = tick();
  assert.equal(await state.open("draft"), true);
  scope.stop();
  settle({ taskId: "active", status: "COMPLETED", items: [] });
  await polling;
  assert.equal(state.selected.value.taskId, "draft");
  assert.equal(tick(), undefined);
});
test("server validation survives a history refresh and blocks repeat publishing", async () => {
  const { state, api, scope } = publisher();
  const serverIssue = { itemId: "April-row-2", sourceRow: 2, code: "CARRIER_CONFLICT" };
  try {
    await state.importFile(draftPayload);
    state.editor.value.rows[1].disposition = "EXCLUDE";
    state.editor.value.customerId = "client-1";
    await state.save();
    state.reviewed.value = true;
    api.publish = async () => {
      throw Object.assign(new Error("invalid"), {
        status: 422,
        details: { validationErrors: [serverIssue] }
      });
    };
    assert.equal(await state.publish(), false);
    assert.deepEqual(state.selected.value.validationErrors, [serverIssue]);
    assert.equal(state.reviewed.value, false);
    await state.list();
    assert.equal(state.error.value.action, "publish");
    state.reviewed.value = true;
    assert.equal(state.canPublish.value, false);
  } finally {
    scope.stop();
  }
});


test("deleting requires confirmation, uses the saved revision, and discards late history entries", async () => {
  let confirm;
  const { state, api, calls, scope } = publisher({
    confirmDelete: () => new Promise((resolve) => { confirm = resolve; })
  });
  try {
    await state.importFile(draftPayload);
    const draft = state.selected.value;
    const declined = state.remove();
    confirm(false);
    assert.equal(await declined, false);
    assert.equal(state.selected.value.taskId, draft.taskId);
    assert.equal(calls.length, 1);

    let finishList;
    api.list = () => new Promise((resolve) => { finishList = resolve; });
    const listing = state.list();
    const deleting = state.remove();
    assert.equal(await state.remove(), false);
    confirm(true);
    assert.equal(await deleting, true);
    assert.deepEqual(calls.at(-1), ["remove", { id: draft.taskId, revision: draft.revision }]);
    finishList([draft]);
    await listing;
    assert.equal(state.selected.value, null);
    assert.deepEqual(state.tasks.value, []);
  } finally {
    scope.stop();
  }
});

test("active and unsettled task batches cannot be deleted", async () => {
  const { state, calls, scope, store } = publisher();
  try {
    store("active", { items: [], pending: 1 }, 1, "RUNNING");
    store("unsettled", { items: [], pending: 1 }, 1, "STOPPED");
    for (const id of ["active", "unsettled"]) {
      await state.open(id);
      assert.equal(await state.remove(), false);
    }
    assert.deepEqual(calls, [["get", "active"], ["get", "unsettled"]]);
  } finally {
    scope.stop();
  }
});
