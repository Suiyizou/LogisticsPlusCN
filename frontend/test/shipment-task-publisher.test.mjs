import { effectScope } from "vue";
import assert from "node:assert/strict";
import test from "node:test";
import { prepareSheet } from "../src/services/shipmentBatchImport.js";
import {
  createTaskEditor,
  recognizeTaskWorkbook,
  restoreTaskEditor,
  reviewTaskRows,
  taskDraftPayload
} from "../src/features/shipments/shipmentTaskDraft.js";
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
  sourceFileName: "ships.xlsx"
});

test("draft payload retains original values and the first 60 candidates after edits and exclusions", () => {
  const editor = draftPayload();
  assert.equal(editor.rows.length, 60);
  assert.equal(editor.sourceMeta.total, 62);
  assert.deepEqual(
    reviewTaskRows(editor)[1].errors.map(({ code }) => code),
    ["MISSING_REFERENCE"]
  );
  editor.rows[0].disposition = "EXCLUDE";
  Object.assign(editor.rows[1], { number: "OOLU45678", referenceEdited: true });
  const payload = taskDraftPayload(editor, reviewTaskRows(editor));
  const restored = restoreTaskEditor(JSON.parse(JSON.stringify(payload)));
  assert.equal(payload.items.length, 59);
  assert.equal(payload.items.at(-1).sourceRow, 61);
  assert.equal(restored.rows.length, 60);
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

function publisher() {
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
