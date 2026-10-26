import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useShipmentListMutations } from "../src/features/shipments/useShipmentListMutations.js";
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const a = { shipmentId: "A", carrier: "COSCO", referenceNo: "111111111" },
    b = { shipmentId: "B", carrier: "COSCO", referenceNo: "222222222" };
  const list = {
    availableShipments: ref([a, b]),
    selectedShipmentRows: ref([a]),
    shipmentTableRef: ref({ clearSelection: () => clears++ }),
    shipmentPage: ref(1),
    shipmentPageSize: ref(20),
    shipmentCustomerFilter: ref(""),
    shipmentBusinessFilter: ref(""),
    refreshIssuesOnly: ref(false),
    loadAvailableShipments: async () => {
      reloads++;
      return read();
    }
  };
  let reloads = 0,
    clears = 0,
    read = async () => true;
  const directory = { shipments: ref([a, b]) },
    detail = {
      deletingShipment: ref(false),
      refreshingShipment: ref(false),
      refreshAbortController: ref(null)
    };
  const ownerIdentity = ref("business-A"),
    canManage = ref(true),
    selectedShipmentId = ref("A"),
    locked = ref(false),
    calls = [],
    notices = [];
  const queued =
    (kind) =>
    (...args) => {
      const pending = deferred();
      calls.push({ kind, args, ...pending });
      return pending.promise;
    };
  const scope = effectScope();
  const w = scope.run(() =>
    useShipmentListMutations({
      list,
      detail,
      directory,
      ownerIdentity,
      canManage,
      selectedShipmentId,
      isLocked: () => locked.value,
      confirm: () => true,
      formatters: {
        primaryBoundCustomerName: () => "Customer A",
        preferredTrackingReference: (row) => ({ type: "BOOKING", number: row?.referenceNo })
      },
      services: {
        deleteShipment: queued("delete"),
        deleteShipments: queued("batch-delete"),
        updateFields: queued("fields"),
        requestTracking: queued("tracking"),
        readChannel: () => "AUTO"
      },
      feedback: {
        t: (key) => key,
        showSuccess: (...args) => notices.push({ kind: "success", args }),
        showError: (...args) => notices.push({ kind: "error", args })
      }
    })
  );
  t.after(() => scope.stop());
  return {
    w,
    list,
    detail,
    directory,
    ownerIdentity,
    canManage,
    selectedShipmentId,
    locked,
    calls,
    notices,
    scope,
    a,
    b,
    get reloads() {
      return reloads;
    },
    get clears() {
      return clears;
    },
    setRead: (fn) => (read = fn)
  };
}
test("list writes require permission even when invoked without UI", async (t) => {
  const h = harness(t);
  h.canManage.value = false;
  assert.equal(h.w.openBatchBusinessFieldsEditor(), false);
  await h.w.deleteShipmentRow(h.a);
  await h.w.batchDeleteSelectedShipments();
  await h.w.updateShipmentTracking(h.a);
  await h.w.saveBatchBusinessFields();
  assert.deepEqual(h.calls, []);
});
test("batch fields capture payload and hold the gate through list refresh", async (t) => {
  const h = harness(t),
    reload = deferred();
  h.setRead(() => reload.promise);
  h.w.openBatchBusinessFieldsEditor();
  h.w.batchBusinessFieldRows.value[0].forwarderJobNumber = " JOB-1 ";
  const saving = h.w.saveBatchBusinessFields();
  assert.equal(h.w.closeBatchBusinessFieldsEditor(), false);
  await h.w.deleteShipmentRow(h.a);
  await h.w.saveBatchBusinessFields();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].args[0][0].forwarderJobNumber, "JOB-1");
  h.calls[0].resolve({ updated: 1 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.w.batchSavingBusinessFields.value, true);
  reload.resolve(true);
  await saving;
  assert.equal(h.w.batchSavingBusinessFields.value, false);
  assert.equal(h.notices[0].kind, "success");
});
test("fields API failure retains draft and allows explicit retry", async (t) => {
  const h = harness(t);
  h.w.openBatchBusinessFieldsEditor();
  h.w.batchBusinessFieldRows.value[0].clientPoNumber = "PO-1";
  const saving = h.w.saveBatchBusinessFields();
  h.calls[0].reject(Error("failed"));
  await saving;
  assert.equal(h.w.batchBusinessFieldsDialogOpen.value, true);
  assert.equal(h.w.batchBusinessFieldRows.value[0].clientPoNumber, "PO-1");
  const retry = h.w.saveBatchBusinessFields();
  h.calls[1].resolve({ updated: 1 });
  await retry;
  assert.equal(h.w.batchBusinessFieldsDialogOpen.value, false);
});
test("fields success does not clear a newer selection", async (t) => {
  const h = harness(t);
  h.w.openBatchBusinessFieldsEditor();
  const saving = h.w.saveBatchBusinessFields();
  h.list.selectedShipmentRows.value = [h.b];
  h.calls[0].resolve({ updated: 1 });
  await saving;
  assert.equal(h.list.selectedShipmentRows.value[0].shipmentId, "B");
  assert.equal(h.clears, 0);
});
test("selection A to B to A is a new selection, not the submitted selection", async (t) => {
  const h = harness(t);
  h.w.openBatchBusinessFieldsEditor();
  const saving = h.w.saveBatchBusinessFields();
  h.list.selectedShipmentRows.value = [h.b];
  h.list.selectedShipmentRows.value = [h.a];
  h.calls[0].resolve({ updated: 1 });
  await saving;
  assert.equal(h.list.selectedShipmentRows.value.length, 1);
  assert.equal(h.clears, 0);
});
test("batch delete captures unique IDs and preserves another selected detail", async (t) => {
  const h = harness(t);
  h.list.selectedShipmentRows.value = [h.a, h.a];
  const deleting = h.w.batchDeleteSelectedShipments();
  h.list.selectedShipmentRows.value = [h.b];
  h.selectedShipmentId.value = "B";
  assert.deepEqual(h.calls[0].args[0], ["A"]);
  h.calls[0].resolve({ deleted: 1 });
  await deleting;
  assert.equal(h.selectedShipmentId.value, "B");
  assert.deepEqual(
    h.list.availableShipments.value.map((row) => row.shipmentId),
    ["B"]
  );
  assert.equal(h.list.selectedShipmentRows.value[0].shipmentId, "B");
});
test("single delete invalidates the deleted detail and cannot race another list write", async (t) => {
  const h = harness(t),
    pending = h.w.deleteShipmentRow(h.a);
  await h.w.updateShipmentTracking(h.b);
  await h.w.batchDeleteSelectedShipments();
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({});
  await pending;
  assert.equal(h.selectedShipmentId.value, "");
  assert.equal(h.detail.deletingShipment.value, false);
});
test("committed fields write with failed reload is not reported as failed write", async (t) => {
  const h = harness(t);
  h.setRead(async () => {
    throw Error("read failed");
  });
  h.w.openBatchBusinessFieldsEditor();
  const saving = h.w.saveBatchBusinessFields();
  h.calls[0].resolve({ updated: 1 });
  await saving;
  assert.equal(h.w.batchBusinessFieldsDialogOpen.value, false);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].args[1], "customers.loadAvailableShipmentsFailed");
});
for (const mode of ["owner", "permission", "dispose"])
  test(`${mode} change ignores late delete results and feedback`, async (t) => {
    const h = harness(t),
      pending = h.w.deleteShipmentRow(h.a);
    if (mode === "owner") h.ownerIdentity.value = "business-B";
    if (mode === "permission") {
      h.canManage.value = false;
      h.canManage.value = true;
    }
    if (mode === "dispose") h.scope.stop();
    h.calls[0].resolve({});
    await pending;
    assert.equal(h.reloads, 0);
    assert.deepEqual(h.notices, []);
    assert.equal(h.directory.shipments.value.length, 2);
  });
test("detail, entry or batch busy state blocks list mutations", async (t) => {
  const h = harness(t);
  h.locked.value = true;
  h.w.openBatchBusinessFieldsEditor();
  await h.w.deleteShipmentRow(h.a);
  await h.w.updateShipmentTracking(h.a);
  assert.equal(h.calls.length, 0);
});
test("list refresh uses shared transport, fixed payload and cancel controller", async (t) => {
  const h = harness(t),
    pending = h.w.updateShipmentTracking(h.a),
    signal = h.calls[0].args[1];
  assert.deepEqual(h.calls[0].args[0], {
    carrier: "COSCO",
    channel: "AUTO",
    type: "BOOKING",
    number: "111111111",
    forceRefresh: true
  });
  h.detail.refreshAbortController.value.abort();
  h.calls[0].resolve({ response: { ok: true }, data: {} });
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(h.reloads, 0);
  assert.equal(h.detail.refreshAbortController.value, null);
  assert.deepEqual(h.notices, []);
});
for (const cause of [
  { response: { ok: false, status: 500 }, data: { message: "carrier failed" } },
  { response: { ok: true }, data: { cacheSource: "MYSQL_STALE", warning: "old snapshot" } }
])
  test(`tracking failure does not count cached response as success: ${cause.data.message || cause.data.warning}`, async (t) => {
    const h = harness(t),
      pending = h.w.updateShipmentTracking(h.a);
    h.calls[0].resolve(cause);
    await pending;
    assert.equal(h.reloads, 0);
    assert.equal(h.notices[0].kind, "error");
    assert.equal(h.detail.refreshingShipment.value, false);
  });
test("disposal aborts a list tracking request and ignores a late response", async (t) => {
  const h = harness(t),
    pending = h.w.updateShipmentTracking(h.a),
    signal = h.calls[0].args[1];
  h.scope.stop();
  assert.equal(signal.aborted, true);
  h.calls[0].resolve({ response: { ok: true }, data: {} });
  await pending;
  assert.equal(h.reloads, 0);
});
