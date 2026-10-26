import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useAdminFiles } from "../src/features/admin/useAdminFiles.js";
const admin = (id = 1) => ({ id, username: `admin-${id}`, role: "ADMIN" });
const file = (id = 0) => ({ id, originalFileName: `cargo-${id}.pdf`, status: "READY" });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const currentUser = ref(admin()),
    hostBusy = ref(false),
    calls = [],
    events = [];
  const implementations = {
    fetchWorkspaceFiles: async () => ({
      items: [{ id: 1, originalFileName: "packing.xlsx" }],
      total: 1
    }),
    fetchShipmentFiles: async () => ({ items: [file()], total: 1 }),
    downloadWorkspaceFile: async () => {},
    downloadShipmentFile: async () => {},
    deleteShipmentFile: async () => {},
    confirmDelete: async () => true
  };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return implementations[name](...args);
    };
  const scope = effectScope();
  const workflow = scope.run(() =>
    useAdminFiles({
      currentUser,
      isHostBusy: () => hostBusy.value,
      services: Object.fromEntries(
        Object.keys(implementations)
          .filter((name) => name !== "confirmDelete")
          .map((name) => [name, invoke(name)])
      ),
      confirmDelete: invoke("confirmDelete"),
      onDeleted: (id) => events.push(["deleted", id]),
      t: (key) => key,
      translate: (text) => text,
      feedback: {
        clear: () => events.push(["clear"]),
        success: (text) => events.push(["success", text]),
        error: (text) => events.push(["error", text]),
        handled: (error) => events.push(["handled", error])
      }
    })
  );
  t.after(() => scope.stop());
  return {
    workflow,
    currentUser,
    hostBusy,
    scope,
    calls,
    events,
    implementations,
    called: (name) => calls.filter((call) => call[0] === name)
  };
}
test("file initialization preserves both lists and server query scopes", async (t) => {
  const h = harness(t);
  assert.equal(await h.workflow.loadAdminFileListsWithoutLoading(), true);
  assert.deepEqual(h.called("fetchWorkspaceFiles")[0][1], {
    page: 0,
    size: 20,
    includeExpired: false
  });
  assert.deepEqual(h.called("fetchShipmentFiles")[0][1], {
    page: 0,
    size: 20,
    includeDeleted: true
  });
  assert.equal(h.workflow.adminFilesLoaded.value, true);
  assert.equal(h.workflow.adminShipmentFiles.value[0].id, 0);
});
test("partial initialization retains the successful list but does not mark both loaded", async (t) => {
  const h = harness(t);
  h.implementations.fetchShipmentFiles = async () => {
    throw Error("shipment denied");
  };
  await assert.rejects(h.workflow.loadAdminFileListsWithoutLoading(), /shipment denied/);
  assert.equal(h.workflow.adminWorkspaceFiles.value.length, 1);
  assert.equal(h.workflow.adminFilesLoaded.value, false);
  assert.equal(h.workflow.busy.value, false);
  h.implementations.fetchShipmentFiles = async () => ({ items: [file(2)] });
  await h.workflow.loadAdminFileListsWithoutLoading();
  assert.equal(h.workflow.adminFilesLoaded.value, true);
  assert.equal(h.workflow.adminShipmentFileTotal.value, 1);
});
test("only the latest shipment page can commit while workspace reads remain independent", async (t) => {
  const h = harness(t),
    old = deferred();
  h.implementations.fetchShipmentFiles = () => old.promise;
  const first = h.workflow.loadAdminShipmentFiles();
  h.implementations.fetchShipmentFiles = async () => ({ items: [file(21)], total: 21 });
  await h.workflow.changeAdminShipmentFilePage(2);
  await h.workflow.loadAdminWorkspaceFiles();
  old.resolve({ items: [file()], total: 1 });
  assert.equal(await first, false);
  assert.equal(h.workflow.adminShipmentFiles.value[0].id, 21);
  assert.equal(h.workflow.adminShipmentFilePage.value, 2);
  assert.equal(h.workflow.adminWorkspaceFiles.value.length, 1);
  assert.equal(h.workflow.busy.value, false);
});
test("expired filter resets page and discards old-filter workspace responses", async (t) => {
  const h = harness(t),
    old = deferred();
  h.implementations.fetchWorkspaceFiles = () => old.promise;
  const first = h.workflow.loadAdminWorkspaceFiles();
  h.workflow.adminWorkspaceFilePage.value = 2;
  h.workflow.includeExpiredFiles.value = true;
  h.implementations.fetchWorkspaceFiles = async () => ({
    items: [{ id: 5, expired: true }],
    total: 1
  });
  await h.workflow.handleWorkspaceExpiredToggle();
  old.resolve({ items: [{ id: 1 }], total: 1 });
  assert.equal(await first, false);
  assert.equal(h.workflow.adminWorkspaceFiles.value[0].id, 5);
  assert.equal(h.workflow.adminWorkspaceFilePage.value, 1);
  assert.equal(h.called("fetchWorkspaceFiles").at(-1)[1].includeExpired, true);
});
test("page correction cannot move a newer selection backwards", async (t) => {
  const h = harness(t),
    corrected = deferred();
  let count = 0;
  h.implementations.fetchShipmentFiles = async () =>
    ++count === 1 ? { items: [], total: 1 } : corrected.promise;
  const old = h.workflow.changeAdminShipmentFilePage(3);
  await new Promise((resolve) => setImmediate(resolve));
  h.implementations.fetchShipmentFiles = async () => ({ items: [file(21)], total: 21 });
  await h.workflow.changeAdminShipmentFilePage(2);
  corrected.resolve({ items: [file()], total: 1 });
  assert.equal(await old, false);
  assert.equal(h.workflow.adminShipmentFilePage.value, 2);
  assert.equal(h.workflow.adminShipmentFiles.value[0].id, 21);
});
test("an empty last page corrects once, including workspace files", async (t) => {
  const h = harness(t);
  await h.workflow.changeAdminWorkspaceFilePage(2);
  assert.equal(h.workflow.adminWorkspaceFilePage.value, 1);
  assert.deepEqual(
    h.called("fetchWorkspaceFiles").map((c) => c[1].page),
    [1, 0]
  );
});
for (const reason of ["switch-back", "role", "dispose"])
  test("files clear all private state on " + reason, async (t) => {
    const h = harness(t);
    await h.workflow.loadAdminFileListsWithoutLoading();
    const response = deferred();
    h.implementations.fetchShipmentFiles = () => response.promise;
    const reading = h.workflow.loadAdminShipmentFiles();
    if (reason === "switch-back") {
      h.currentUser.value = admin(2);
      h.currentUser.value = admin();
    }
    if (reason === "role") h.currentUser.value = { ...admin(), role: "BUSINESS" };
    if (reason === "dispose") h.scope.stop();
    response.resolve({ items: [file(99)], total: 99 });
    assert.equal(await reading, false);
    assert.deepEqual(h.workflow.adminShipmentFiles.value, []);
    assert.deepEqual(h.workflow.adminWorkspaceFiles.value, []);
    assert.equal(h.workflow.adminFilesLoaded.value, false);
    assert.equal(h.workflow.busy.value, false);
  });
test("display name changes do not invalidate current file reads", async (t) => {
  const h = harness(t),
    response = deferred();
  h.implementations.fetchShipmentFiles = () => response.promise;
  const reading = h.workflow.loadAdminShipmentFiles();
  h.currentUser.value.displayName = "new name";
  response.resolve({ items: [file()], total: 1 });
  assert.equal(await reading, true);
});
test("stale read errors do not replace newer feedback", async (t) => {
  const h = harness(t),
    response = deferred();
  h.implementations.fetchShipmentFiles = () => response.promise;
  const old = h.workflow.loadAdminShipmentFiles();
  h.implementations.fetchShipmentFiles = async () => ({ items: [file(2)] });
  await h.workflow.loadAdminShipmentFiles();
  response.reject(Error("stale"));
  assert.equal(await old, false);
  assert.equal(h.events.filter((e) => e[0] === "error").length, 0);
});
test("file actions refuse expired/deleted/missing IDs and unauthorized callers", async (t) => {
  const h = harness(t);
  assert.equal(await h.workflow.handleDownloadWorkspaceFile({ id: 1, expired: true }), false);
  assert.equal(await h.workflow.handleDownloadShipmentFile({ id: 1, deletedAt: "today" }), false);
  assert.equal(await h.workflow.handleDeleteShipmentFile({ status: "READY" }), false);
  h.currentUser.value = { ...admin(), role: "BUSINESS" };
  assert.equal(await h.workflow.loadAdminFileListsWithoutLoading(), false);
  assert.equal(await h.workflow.handleDownloadShipmentFile(file()), false);
  assert.equal(h.calls.length, 0);
});
test("host busy and invalid page parameters do not change pagination", async (t) => {
  const h = harness(t);
  h.hostBusy.value = true;
  assert.equal(await h.workflow.changeAdminShipmentFilePage(2), false);
  assert.equal(await h.workflow.handleDeleteShipmentFile(file()), false);
  h.hostBusy.value = false;
  for (const page of [0, -1, 1.5, NaN, "2"])
    assert.equal(await h.workflow.changeAdminShipmentFilePage(page), false);
  assert.equal(h.workflow.adminShipmentFilePage.value, 1);
  assert.equal(h.calls.length, 0);
});
test("downloads preserve ID zero and public ID fallback, with a single pending action", async (t) => {
  const h = harness(t),
    download = deferred();
  h.implementations.downloadShipmentFile = () => download.promise;
  const pending = h.workflow.handleDownloadShipmentFile(file());
  assert.equal(await h.workflow.handleDownloadShipmentFile(file()), false);
  assert.equal(await h.workflow.handleDeleteShipmentFile(file()), false);
  download.resolve();
  assert.equal(await pending, true);
  assert.deepEqual(h.called("downloadShipmentFile")[0].slice(1), [0, "cargo-0.pdf"]);
  await h.workflow.handleDownloadShipmentFile({ publicId: "F-1", fileName: "invoice.csv" });
  assert.deepEqual(h.called("downloadShipmentFile")[1].slice(1), ["F-1", "invoice.csv"]);
});
test("late download failures cannot leak feedback into another session", async (t) => {
  const h = harness(t),
    download = deferred();
  h.implementations.downloadWorkspaceFile = () => download.promise;
  const pending = h.workflow.handleDownloadWorkspaceFile({ id: 1 });
  h.currentUser.value = admin(2);
  download.reject(Error("old denied"));
  assert.equal(await pending, false);
  assert.equal(h.workflow.busy.value, false);
  assert.equal(h.events.filter((e) => e[0] === "error").length, 0);
});
test("delete confirmation fixes its target and blocks duplicate confirmation", async (t) => {
  const h = harness(t),
    confirmation = deferred(),
    record = file();
  await h.workflow.loadAdminShipmentFiles();
  h.implementations.confirmDelete = () => confirmation.promise;
  const pending = h.workflow.handleDeleteShipmentFile(record);
  record.id = 99;
  assert.equal(await h.workflow.handleDeleteShipmentFile(record), false);
  confirmation.resolve(true);
  assert.equal(await pending, true);
  assert.equal(h.called("confirmDelete")[0][1].id, 0);
  assert.equal(h.called("deleteShipmentFile")[0][1], 0);
  assert.deepEqual(
    h.events.find((e) => e[0] === "deleted"),
    ["deleted", 0]
  );
});
test("cancelled and invalidated confirmations never delete files", async (t) => {
  const h = harness(t);
  h.implementations.confirmDelete = async () => false;
  assert.equal(await h.workflow.handleDeleteShipmentFile(file()), false);
  const confirmation = deferred();
  h.implementations.confirmDelete = () => confirmation.promise;
  const pending = h.workflow.handleDeleteShipmentFile(file());
  h.currentUser.value = admin(2);
  confirmation.resolve(true);
  assert.equal(await pending, false);
  assert.equal(h.called("deleteShipmentFile").length, 0);
});
test("soft deletion survives a refresh failure without removing the audit row", async (t) => {
  const h = harness(t);
  await h.workflow.loadAdminShipmentFiles();
  h.implementations.fetchShipmentFiles = async () => {
    throw Error("refresh failed");
  };
  assert.equal(await h.workflow.handleDeleteShipmentFile(file()), true);
  assert.equal(h.workflow.adminShipmentFiles.value[0].status, "DELETED");
  assert.equal(h.workflow.adminShipmentFileTotal.value, 1);
  assert.equal(
    h.events.filter((e) => e[0] === "error").at(-1)[1],
    "adminWorkflow.savedRefreshFailed"
  );
  assert.equal(
    await h.workflow.handleDeleteShipmentFile(h.workflow.adminShipmentFiles.value[0]),
    false
  );
  assert.equal(h.called("deleteShipmentFile").length, 1);
});
test("delete failure retains the row and allows a deliberate retry", async (t) => {
  const h = harness(t);
  await h.workflow.loadAdminShipmentFiles();
  h.implementations.deleteShipmentFile = async () => {
    throw Error("denied");
  };
  assert.equal(await h.workflow.handleDeleteShipmentFile(file()), false);
  assert.equal(h.workflow.adminShipmentFiles.value[0].status, "READY");
  h.implementations.deleteShipmentFile = async () => {};
  assert.equal(await h.workflow.handleDeleteShipmentFile(file()), true);
});
