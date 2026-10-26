import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref, computed, nextTick, createRenderer, h, onScopeDispose } from "vue";
import { useShipmentOperations } from "../src/modules/workspace/useShipmentOperations.js";
import { createShipmentModulePages } from "../src/modules/shipments/createShipmentModulePages.js";
import { workspaceSessionKey } from "../src/modules/workspaceContext.js";
function deferred() {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
}
const row = (id) => ({
  shipmentId: id,
  carrier: "COSCO",
  referenceType: "BOOKING",
  referenceNo: "123456789",
  bookingNumber: "123456789",
  note: id
});
function harness(t, overrides = {}) {
  const scope = effectScope(),
    canManage = ref(true),
    user = ref({ id: "business-A", username: "alice", role: "BUSINESS" }),
    notices = [],
    calls = [];
  const directory = {
    customers: ref([{ id: "C", shipmentCount: 2 }]),
    customersLoaded: ref(true),
    shipments: ref([row("A")]),
    selectedCustomer: ref({ id: "C" }),
    selectedCustomerId: ref("C"),
    assignableCustomers: ref([{ id: "C" }]),
    selectCustomer: async () => {}
  };
  const context = {
    canManage,
    currentUser: () => user.value,
    selectedShipmentId: ref(""),
    menuItem: ref("shipments"),
    subView: ref("list")
  };
  const services = {
    fetchAvailableBusinessShipments: async () => {
      calls.push("list");
      return { items: [row("A"), row("B")], total: 2, page: 1, pageSize: 20 };
    },
    fetchBusinessShipmentSnapshot: async (id) => ({ item: row(id) }),
    updateBusinessShipment: async (id, body) => ({ ...row(id), ...body }),
    updateBusinessShipmentManualSnapshot: async (id, body) => ({ ...row(id), ...body }),
    invalidateBusinessShipmentSnapshot: async () => {},
    deleteBusinessShipment: async () => {},
    requestTracking: async () => ({ response: { ok: true, status: 200 }, data: {} }),
    createBusinessShipment: async (...args) => {
      calls.push({ created: args });
      return { shipment: row("N") };
    },
    inspectBusinessShipmentImportConflicts: async () => ({ conflicts: [] }),
    createShipmentBatchTask: async () => ({ taskId: "import-1" }),
    createShipmentRefreshAllTask: async () => ({ taskId: "all-1" }),
    createShipmentBatchRefreshTask: async (ids, channel) => {
      calls.push({ batch: { ids, channel } });
      return { taskId: "selected-1" };
    },
    fetchShipmentBatchTask: async (id) => ({
      taskId: id,
      status: "RUNNING",
      mode: "REFRESH_SELECTED",
      items: []
    }),
    cancelShipmentBatchTask: async () => {},
    batchDeleteBusinessShipments: async () => {},
    batchUpdateBusinessShipmentFields: async () => ({ updated: 1 }),
    ...overrides
  };
  const formatters = {
    customerFilterOptionLabel: (c) => c.id,
    primaryBoundCustomerName: () => "",
    preferredTrackingReference: (r) => ({ type: "BOOKING", number: r.referenceNo }),
    formatDateTime: (v) => String(v)
  };
  const operations = scope.run(() =>
    useShipmentOperations({
      directory,
      context,
      services,
      formatters,
      navigation: { navigateTo: () => {} },
      feedback: {
        t: (key) => key,
        showSuccess: (key) => notices.push(key),
        showError: (error) => notices.push(error),
        showInfo: () => {},
        markApiErrorHandled: () => {}
      },
      adapters: {
        confirmEntry: async () => true,
        confirmDeletion: () => true,
        loadXlsxModule: async () => {
          throw Error("unexpected workbook");
        },
        waitForNextPaint: async () => {},
        runTablePageTransition: (fn) => fn()
      },
      batchOptions: {
        storage: () => ({ getItem: () => "", setItem: () => {}, removeItem: () => {} }),
        scheduler: {
          setTimeout: () => 1,
          clearTimeout: () => {},
          setInterval: () => 1,
          clearInterval: () => {}
        }
      }
    })
  );
  t.after(() => scope.stop());
  return {
    operations,
    directory,
    context,
    services,
    scope,
    canManage,
    user,
    notices,
    calls,
    formatters
  };
}
test("composed detail updates the shared list and customer collection", async (t) => {
  const h = harness(t),
    { list, detail } = h.operations;
  await list.loadAvailableShipments();
  h.context.selectedShipmentId.value = "A";
  h.context.subView.value = "detail";
  await flush();
  assert.equal(detail.selectedShipment.value.shipmentId, "A");
  detail.detailForm.note = "updated";
  await detail.saveShipmentDetail();
  assert.equal(list.availableShipments.value[0].note, "updated");
  assert.equal(h.directory.shipments.value[0].note, "updated");
});
test("composed manual creation uses the directory customer and list refresh", async (t) => {
  const h = harness(t),
    { entry } = h.operations;
  entry.openShipmentCreateDialog();
  entry.shipmentCreateForm.referenceNo = "COSU123456789";
  entry.shipmentCreateForm.latestEventName = "Gate in";
  await entry.createShipment();
  const write = h.calls.find((item) => item.created);
  assert.ok(write);
  assert.equal(write.created[1], "C");
  assert.ok(h.calls.includes("list"));
  assert.equal(entry.creatingShipment.value, false);
});
test("composed batch refresh captures list selection and selected channel", async (t) => {
  const h = harness(t),
    { list, batch } = h.operations;
  await list.loadAvailableShipments();
  list.handleShipmentSelectionChange(list.availableShipments.value);
  h.operations.shipmentTrackingChannel.value = "DIRECT";
  await batch.startRefreshSelectedShipments();
  assert.deepEqual(h.calls.find((item) => item.batch).batch, {
    ids: ["A", "B"],
    channel: "DIRECT"
  });
  assert.equal(batch.batchTrackRunning.value, true);
  assert.equal(list.selectedShipmentRows.value.length, 0);
});
test("read-only composed roles cannot start, restore or open manager batch operations", async (t) => {
  const h = harness(t);
  h.canManage.value = false;
  h.operations.batch.toggleBatchTrackPanel();
  await h.operations.batch.startRefreshAllShipments();
  await h.operations.batch.restoreBatchTrackTask();
  assert.equal(h.operations.batch.batchTrackDialogOpen.value, false);
  assert.equal(h.operations.batch.batchTrackRunning.value, false);
  assert.equal(h.calls.length, 0);
});
test("module pages project production refs, UI setters and actions without copying", async (t) => {
  const h = harness(t),
    view = ref("list"),
    isOverseaAgent = ref(false),
    selectedCustomerIds = ref([]);
  const pages = createShipmentModulePages({
    operations: h.operations,
    directory: h.directory,
    view,
    permissions: { isManager: h.canManage, isOverseaAgent },
    bindings: {
      selectedCustomerIds,
      batchBinding: ref(false),
      batchBindingProgress: ref({}),
      boundCustomersForSelectedShipment: ref([]),
      batchBindCustomers: async () => {},
      unbindCustomerFromShipment: async () => {}
    },
    ui: { tablePageTransitioning: ref(false) },
    actions: {},
    formatters: h.formatters
  });
  pages.list.state.shipmentCustomerFilter = "C";
  assert.equal(h.operations.list.shipmentCustomerFilter.value, "C");
  pages.detail.state.selectedCustomerIds = ["C"];
  assert.deepEqual(selectedCustomerIds.value, ["C"]);
  const table = { clearSelection: () => {} };
  pages.list.actions.setTableRef(table);
  assert.equal(h.operations.list.shipmentTableRef.value.clearSelection, table.clearSelection);
  const input = { tagName: "INPUT", value: "test" };
  pages.listDialogs.actions.setBatchFileInput(input);
  assert.equal(h.operations.batch.batchTrackFileInput.value.value, "test");
  pages.listDialogs.actions.setBatchFileInput({ tagName: "DIV", value: "not-an-input" });
  assert.equal(h.operations.batch.batchTrackFileInput.value, null);
  pages.listDialogs.actions.setBatchFileInput(input);
  assert.equal(
    pages.listDialogs.actions.saveBatchBusinessFields,
    h.operations.mutations.saveBatchBusinessFields
  );
  h.canManage.value = false;
  assert.equal(pages.detail.permissions.isManager, false);
  view.value = "detail";
  assert.equal(pages.view.value, "detail");
  await flush();
});
test("composed scope disposal cancels list refresh and ignores late completion", async (t) => {
  const pending = deferred();
  let signal;
  const h = harness(t, {
    requestTracking: (body, s) => {
      signal = s;
      return pending.promise;
    }
  });
  const updating = h.operations.mutations.updateShipmentTracking(row("A"));
  h.scope.stop();
  assert.equal(signal.aborted, true);
  pending.resolve({ response: { ok: true }, data: {} });
  await updating;
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.notices, []);
});
test("session key preserves preferences edits but remounts scopes on account or role changes", async (t) => {
  const user = ref({ id: "A", username: "alice", role: "BUSINESS", displayName: "Alice" }),
    instances = [],
    closed = [];
  const renderer = createRenderer({
    createElement: () => ({ children: [] }),
    createText: (text) => ({ text }),
    createComment: (text) => ({ text }),
    insert: (node, parent) => {
      node.parent = parent;
      parent.children.push(node);
    },
    remove: (node) => {
      if (node.parent) node.parent.children = node.parent.children.filter((n) => n !== node);
    },
    setText: () => {},
    setElementText: () => {},
    patchProp: () => {},
    parentNode: (node) => node.parent,
    nextSibling: () => null
  });
  const Child = {
    setup() {
      const id = instances.length;
      instances.push(id);
      onScopeDispose(() => closed.push(id));
      return () => h("scope");
    }
  };
  const key = computed(() => workspaceSessionKey(user.value));
  const app = renderer.createApp({ setup: () => () => h(Child, { key: key.value }) });
  app.mount({ children: [] });
  t.after(() => app.unmount());
  user.value = { ...user.value, displayName: "Renamed" };
  await nextTick();
  assert.equal(instances.length, 1);
  user.value = { ...user.value, id: "B", username: "bob" };
  await nextTick();
  assert.deepEqual(closed, [0]);
  assert.equal(instances.length, 2);
  user.value = { ...user.value, role: "OVERSEA_AGENT" };
  await nextTick();
  assert.deepEqual(closed, [0, 1]);
  assert.equal(instances.length, 3);
});
