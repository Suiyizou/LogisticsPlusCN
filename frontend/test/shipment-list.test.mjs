import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import { useShipmentList } from "../src/features/shipments/useShipmentList.js";
import {
  normalizeBusinessShipment,
  deduplicateBusinessShipments
} from "../src/features/shipments/shipmentModel.js";
import { boundedPage, pageSlice } from "../src/features/tables/pagination.js";
import { useTablePageTransition } from "../src/features/tables/useTablePageTransition.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
}
function harness(t) {
  const scope = effectScope();
  const requests = [],
    errors = [];
  const customers = ref([
    { id: "A", displayName: "Zebra", shipmentCount: 2 },
    { id: "B", displayName: "Alpha", shipmentCount: 1 },
    { id: "C", displayName: "Empty", shipmentCount: 0 }
  ]);
  const customersLoaded = ref(true);
  const list = scope.run(() =>
    useShipmentList({
      customers,
      customersLoaded,
      customerFilterOptionLabel: (item) => item.displayName,
      fetchAvailableBusinessShipments: (query) => {
        const pending = deferred();
        requests.push({ query, ...pending });
        return pending.promise;
      },
      normalizeBusinessShipment,
      showError: (...args) => errors.push(args)
    })
  );
  t.after(() => scope.stop());
  return { list, scope, requests, errors, customers, customersLoaded };
}
const page = (items, overrides = {}) => ({
  items,
  total: items.length,
  refreshIssueTotal: 0,
  ...overrides
});

test("ticket query shape and snapshot normalization remain compatible", async (t) => {
  const { list: l, requests: r } = harness(t);
  const loaded = l.loadAvailableShipments();
  assert.deepEqual(r[0].query, {
    page: 1,
    pageSize: 20,
    customerId: "",
    businessFilter: "",
    refreshIssuesOnly: false
  });
  r[0].resolve(
    page(
      [
        {
          shipment: { shipmentId: "s1", note: "keep" },
          snapshotJson: JSON.stringify({
            summary: { origin: { name: "Ningbo" } },
            references: { business: { clientPoNumber: "PO-01" } }
          })
        }
      ],
      { total: 35, refreshIssueTotal: 4 }
    )
  );
  assert.equal(await loaded, true);
  assert.equal(l.availableShipments.value[0].portOfLoading, "Ningbo");
  assert.equal(l.availableShipments.value[0].clientPoNumber, "PO-01");
  assert.equal(l.shipmentTotal.value, 35);
  assert.equal(l.refreshIssueCount.value, 4);
  assert.equal(l.shipmentsLoaded.value, true);
});

test("out-of-order pages cannot overwrite current rows, totals or loading state", async (t) => {
  const { list: l, requests: r } = harness(t);
  l.changeShipmentPage(2);
  l.changeShipmentPage(3);
  r[0].resolve(page([{ shipmentId: "old" }], { page: 2, total: 99 }));
  await flush();
  assert.equal(l.loadingAvailableShipments.value, true);
  assert.deepEqual(l.availableShipments.value, []);
  r[1].resolve(page([{ shipmentId: "current" }], { page: 3, total: 60 }));
  await flush();
  assert.equal(l.shipmentPage.value, 3);
  assert.equal(l.availableShipments.value[0].shipmentId, "current");
  assert.equal(l.shipmentTotal.value, 60);
  assert.equal(l.loadingAvailableShipments.value, false);
  assert.equal(l.shipmentRowIndex(2), 43);
});

test("changing filters resets page and selection and never accepts the previous query's failure", async (t) => {
  const { list: l, requests: r, errors } = harness(t);
  l.availableShipments.value = [{ shipmentId: "s1" }];
  l.handleShipmentSelectionChange(l.availableShipments.value);
  l.shipmentPage.value = 4;
  const old = l.loadAvailableShipments();
  l.shipmentCustomerFilter.value = "A";
  l.shipmentBusinessFilter.value = "UPDATE_FAILED";
  l.refreshIssuesOnly.value = true;
  await flush();
  assert.equal(r.length, 2);
  assert.deepEqual(r[1].query, {
    page: 1,
    pageSize: 20,
    customerId: "A",
    businessFilter: "UPDATE_FAILED",
    refreshIssuesOnly: true
  });
  assert.equal(l.shipmentPage.value, 1);
  assert.deepEqual(l.selectedShipmentRows.value, []);
  r[0].reject(new Error("obsolete"));
  await old;
  assert.equal(errors.length, 0);
  assert.equal(l.loadingAvailableShipments.value, true);
  r[1].resolve(page([]));
  await flush();
  assert.equal(l.loadingAvailableShipments.value, false);
});

test("current errors preserve the visible page, release loading and allow retry", async (t) => {
  const { list: l, requests: r, errors } = harness(t);
  l.availableShipments.value = [{ shipmentId: "kept" }];
  const old = l.loadAvailableShipments();
  r[0].reject(new Error("offline"));
  assert.equal(await old, false);
  assert.equal(l.availableShipments.value[0].shipmentId, "kept");
  assert.equal(l.loadingAvailableShipments.value, false);
  assert.equal(errors[0][1], "customers.loadAvailableShipmentsFailed");
  const retry = l.loadAvailableShipments();
  r[1].resolve(page([{ shipmentId: "fresh" }]));
  await retry;
  assert.equal(l.availableShipments.value[0].shipmentId, "fresh");
});

test("page-size change clears table selection and accepts the server's corrected last page", async (t) => {
  const { list: l, requests: r } = harness(t);
  let cleared = 0;
  l.shipmentTableRef.value = {
    clearSelection: () => {
      cleared++;
    }
  };
  l.changeShipmentPageSize(50);
  assert.equal(r[0].query.pageSize, 50);
  assert.equal(r[0].query.page, 1);
  assert.equal(cleared, 1);
  r[0].resolve(page([], { page: 1, pageSize: 50 }));
  await flush();
  l.changeShipmentPage(8);
  r[1].resolve(page([{ shipmentId: "last" }], { total: 12, page: 1, pageSize: 50 }));
  await flush();
  assert.equal(l.shipmentPage.value, 1);
  assert.equal(l.shipmentRowIndex(0), 1);
});

test("selection is limited to visible unique tickets and refreshed rows replace stale selected objects", async (t) => {
  const { list: l, requests: r } = harness(t);
  l.availableShipments.value = [{ shipmentId: "s1", note: "old" }, { shipmentId: "s2" }];
  l.handleShipmentSelectionChange([
    { shipmentId: "s1" },
    { shipmentId: "s1" },
    { shipmentId: "hidden" }
  ]);
  assert.equal(l.selectedShipmentRows.value.length, 1);
  const load = l.loadAvailableShipments();
  r[0].resolve(page([{ shipmentId: "s1", note: "new" }]));
  await load;
  await flush();
  assert.equal(l.selectedShipmentRows.value[0].note, "new");
  l.availableShipments.value = [];
  await flush();
  assert.deepEqual(l.selectedShipmentRows.value, []);
});

test("customer filter options are sorted without mutating the directory and clear only after directory load", async (t) => {
  const { list: l, customers, customersLoaded, requests: r } = harness(t);
  assert.deepEqual(
    l.shipmentFilterCustomers.value.map((item) => item.id),
    ["B", "A"]
  );
  assert.deepEqual(
    customers.value.map((item) => item.id),
    ["A", "B", "C"]
  );
  customersLoaded.value = false;
  l.shipmentCustomerFilter.value = "A";
  customers.value = [];
  await flush();
  assert.equal(l.shipmentCustomerFilter.value, "A");
  customersLoaded.value = true;
  await flush();
  assert.equal(l.shipmentCustomerFilter.value, "");
  r.forEach((request) => request.resolve(page([])));
  await flush();
});

test("bound-customer index accepts old string IDs and current objects, deduplicating both", async (t) => {
  const { list: l, requests: r } = harness(t);
  const load = l.loadAvailableShipments();
  r[0].resolve(
    page([
      { shipmentId: "s1", boundCustomers: ["A", { id: "B" }, { id: "A" }, null] },
      { shipmentId: "s2", boundCustomers: [] }
    ])
  );
  await load;
  assert.deepEqual(l.shipmentCustomerMap.value, { s1: ["A", "B"] });
});

test("unmount prevents late list writes and subsequent requests", async (t) => {
  const { list: l, scope, requests: r, errors } = harness(t);
  const read = l.loadAvailableShipments();
  scope.stop();
  r[0].resolve(page([{ shipmentId: "late" }]));
  await read;
  assert.deepEqual(l.availableShipments.value, []);
  l.changeShipmentPage(2);
  await l.loadAvailableShipments();
  assert.equal(r.length, 1);
  assert.equal(errors.length, 0);
});

test("shipment normalization preserves explicit fields and tolerates malformed snapshots", () => {
  const input = {
    shipmentId: "s1",
    portOfLoading: "Manual origin",
    dataAvailable: false,
    snapshot: { summary: { origin: { name: "API origin" } } }
  };
  const normalized = normalizeBusinessShipment(input);
  assert.equal(normalized.portOfLoading, "Manual origin");
  assert.equal(normalized.dataAvailable, false);
  assert.notEqual(normalized, input);
  assert.equal(normalizeBusinessShipment({ snapshotJson: "{bad json" }).snapshot, null);
  assert.equal(normalizeBusinessShipment(null), null);
  assert.equal(normalizeBusinessShipment({ snapshot: [] }).snapshot, null);
});

test("overview deduplication keeps first ticket per ID and case-insensitive fallback reference", () => {
  const first = { shipmentId: "s1", note: "first" };
  const reference = { carrier: "COSCO", referenceType: "BOOKING", referenceNo: "ABC" };
  assert.deepEqual(
    deduplicateBusinessShipments([
      first,
      { shipmentId: "s1", note: "duplicate" },
      null,
      reference,
      { carrier: "cosco ", referenceType: "booking", referenceNo: "abc" },
      { shipmentId: "s2" }
    ]),
    [first, reference, { shipmentId: "s2" }]
  );
});

test("pagination handles empty lists, invalid inputs and shrinking totals", () => {
  assert.equal(boundedPage(8, 11, 10), 2);
  assert.equal(boundedPage(8, 0, 10), 1);
  assert.equal(boundedPage(NaN, 20, 10), 1);
  assert.deepEqual(pageSlice([1, 2, 3], 2, 2), [3]);
  assert.deepEqual(pageSlice([1, 2, 3], -2, 0), [1]);
});

test("page transition restarts the timer and releases it when the scope ends", () => {
  const timers = new Map();
  let nextId = 1;
  const scheduler = {
    setTimeout: (callback, delay) => {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id)
  };
  const scope = effectScope();
  const reducedMotion = ref(false);
  const transition = scope.run(() => useTablePageTransition({ reducedMotion, scheduler }));
  let calls = 0;
  transition.runTablePageTransition(() => calls++);
  const first = [...timers.values()][0];
  transition.runTablePageTransition(() => calls++);
  assert.equal(calls, 2);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 160);
  reducedMotion.value = true;
  transition.runTablePageTransition(() => {});
  assert.equal([...timers.values()][0].delay, 0);
  scope.stop();
  assert.equal(timers.size, 0);
  first.callback();
  assert.equal(transition.tablePageTransitioning.value, true);
  transition.runTablePageTransition(() => calls++);
  assert.equal(calls, 2);
});
