import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRenderer, h, effectScope, ref, computed, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { useBusinessCommands } from "../src/modules/businessCommands.js";
import { useMediaQuery } from "../src/composables/useMediaQuery.js";
import {
  provideBusinessCommands,
  useBusinessCommandContext
} from "../src/modules/businessCommandContext.js";
import { provideModulePages, useModulePages } from "../src/modules/moduleContext.js";
import { useCustomerShipmentAccess } from "../src/modules/customers/index.js";
import { useShipmentCustomerBindings } from "../src/modules/shipments/index.js";
import { useCustomerSummary } from "../src/modules/examples/customer-summary/useCustomerSummary.js";
import { customerSummaryExample } from "../src/modules/examples/customer-summary/module.js";
import { businessModules, modulesForRole } from "../src/modules/registry.js";
import { createApplicationRoutes } from "../src/modules/routes.js";
import {
  readBusinessRoute,
  businessRouteTarget
} from "../src/features/navigation/businessNavigation.js";

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
function scoped(t, create) {
  const scope = effectScope();
  const value = scope.run(create);
  t.after(() => scope.stop());
  return { scope, value };
}

test("responsive query follows viewport changes and ignores queued callbacks after disposal", (t) => {
  let callback, removed;
  const target = {
    matchMedia: (expression) => {
      assert.equal(expression, "(max-width: 680px)");
      return {
        matches: false,
        addEventListener: (name, fn) => {
          assert.equal(name, "change");
          callback = fn;
        },
        removeEventListener: (name, fn) => {
          removed = fn;
        }
      };
    }
  };
  const { scope, value } = scoped(t, () => useMediaQuery("(max-width: 680px)", target));
  assert.equal(value.value, false);
  callback({ matches: true });
  assert.equal(value.value, true);
  scope.stop();
  assert.equal(removed, callback);
  callback({ matches: false });
  assert.equal(value.value, true);
});

test("responsive query can initialize in a non-browser renderer without IO", (t) => {
  const { value } = scoped(t, () => useMediaQuery("(max-width: 680px)", {}));
  assert.equal(value.value, false);
});
function access(t) {
  const calls = [],
    notices = [],
    queues = [];
  const directory = {
    selectedCustomerId: ref("A"),
    shipments: ref([
      { shipmentId: "S1", publicationStatus: "DRAFT" },
      { shipmentId: "S2", publicationStatus: "DRAFT" }
    ])
  };
  directory.selectedCustomer = computed(() => ({
    id: directory.selectedCustomerId.value,
    partyRole: "SHIPPER"
  }));
  const canManage = ref(true),
    availableShipments = ref([{ shipmentId: "S3" }, { shipmentId: "S4", boundRoles: ["SHIPPER"] }]);
  const api =
    (name) =>
    (...args) => {
      const job = deferred();
      calls.push({ name, args });
      queues.push(job);
      return job.promise;
    };
  const refreshes = [];
  const commands = {
    refreshShipmentRelations: async () => {
      refreshes.push(directory.selectedCustomerId.value);
      return true;
    }
  };
  const { scope, value } = scoped(t, () =>
    useCustomerShipmentAccess({
      directory,
      canManage,
      availableShipments,
      services: {
        bind: api("bind"),
        batchBind: api("batch"),
        unbind: api("unbind"),
        publish: api("publish")
      },
      commands,
      clearMessage: () => {},
      showSuccess: (...args) => notices.push(args),
      showError: (...args) => notices.push(args),
      t: (key) => key,
      confirm: () => true
    })
  );
  return {
    scope,
    value,
    directory,
    canManage,
    availableShipments,
    calls,
    notices,
    queues,
    refreshes
  };
}

function shipmentBindings(t) {
  const selectedShipmentId = ref("S1"),
    shipmentCustomerMap = ref({ S1: ["A"], S2: ["C"] }),
    canManage = ref(true);
  const calls = [],
    queues = [],
    notices = [],
    refreshes = [];
  const api =
    (name) =>
    (...args) => {
      const job = deferred();
      calls.push({ name, args });
      queues.push(job);
      return job.promise;
    };
  const { scope, value } = scoped(t, () =>
    useShipmentCustomerBindings({
      selectedShipmentId,
      shipmentCustomerMap,
      canManage,
      services: { bind: api("bind"), unbind: api("unbind") },
      commands: {
        refreshShipmentRelations: async () => {
          refreshes.push(selectedShipmentId.value);
          return true;
        }
      },
      t: (key, params) => (params ? `${key}:${params.success}/${params.total}` : key),
      showSuccess: (...args) => notices.push({ kind: "success", args }),
      showError: (...args) => notices.push({ kind: "error", args }),
      confirm: () => true
    })
  );
  return {
    scope,
    value,
    selectedShipmentId,
    shipmentCustomerMap,
    canManage,
    calls,
    queues,
    notices,
    refreshes
  };
}

test("shipment binding snapshots and deduplicates customers, blocking overlapping mutations", async (t) => {
  const h = shipmentBindings(t);
  h.value.selectedCustomerIds.value = ["B", "B", "D"];
  const result = h.value.batchBindCustomers();
  h.value.selectedCustomerIds.value = ["E"];
  assert.equal(await h.value.unbindCustomerFromShipment("A"), false);
  h.queues[0].resolve();
  await flush();
  assert.deepEqual(
    h.calls.map((call) => call.args),
    [
      ["B", { shipmentId: "S1" }],
      ["D", { shipmentId: "S1" }]
    ]
  );
  h.queues[1].resolve();
  assert.equal(await result, true);
  assert.deepEqual(h.shipmentCustomerMap.value.S1, ["A", "B", "D"]);
  assert.deepEqual(h.refreshes, ["S1"]);
  assert.equal(h.value.batchBinding.value, false);
});

test("shipment batch stops at selection changes and never updates the new ticket", async (t) => {
  const h = shipmentBindings(t);
  h.value.selectedCustomerIds.value = ["B", "D"];
  const result = h.value.batchBindCustomers();
  h.selectedShipmentId.value = "S2";
  h.queues[0].resolve();
  assert.equal(await result, false);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.shipmentCustomerMap.value, { S1: ["A"], S2: ["C"] });
  assert.deepEqual(h.refreshes, []);
  assert.deepEqual(h.notices, []);
});

test("shipment batch keeps failed customers selected for retry and reports partial success as an error", async (t) => {
  const h = shipmentBindings(t);
  h.value.selectedCustomerIds.value = ["B", "D"];
  const result = h.value.batchBindCustomers();
  h.queues[0].reject(Error("denied"));
  await flush();
  h.queues[1].resolve();
  assert.equal(await result, false);
  assert.deepEqual(h.value.selectedCustomerIds.value, ["B"]);
  assert.deepEqual(h.shipmentCustomerMap.value.S1, ["A", "D"]);
  assert.equal(h.notices[0].kind, "error");
  assert.match(h.notices[0].args[0].message, /1\/2/);
  const retry = h.value.batchBindCustomers();
  h.queues[2].resolve();
  assert.equal(await retry, true);
  assert.deepEqual(h.value.selectedCustomerIds.value, []);
});

test("returning to the original shipment does not revive an outdated unbind response", async (t) => {
  const h = shipmentBindings(t),
    result = h.value.unbindCustomerFromShipment("A");
  h.selectedShipmentId.value = "S2";
  h.selectedShipmentId.value = "S1";
  h.queues[0].resolve();
  assert.equal(await result, false);
  assert.deepEqual(h.calls[0].args, ["A", "S1"]);
  assert.deepEqual(h.value.boundCustomersForSelectedShipment.value, ["A"]);
  assert.deepEqual(h.notices, []);
});

test("shipment binding rejects new writes and late state updates after role loss or disposal", async (t) => {
  const h = shipmentBindings(t);
  h.value.selectedCustomerIds.value = ["B"];
  const result = h.value.batchBindCustomers();
  h.canManage.value = false;
  h.queues[0].resolve();
  assert.equal(await result, false);
  assert.equal(await h.value.unbindCustomerFromShipment("A"), false);
  assert.deepEqual(h.shipmentCustomerMap.value.S1, ["A"]);
  h.canManage.value = true;
  const unbind = h.value.unbindCustomerFromShipment("A");
  h.scope.stop();
  h.queues[1].resolve();
  assert.equal(await unbind, false);
  assert.deepEqual(h.refreshes, []);
});

test("cross-module navigation accepts IDs only and stops after scope disposal", (t) => {
  const calls = [];
  const { scope, value } = scoped(t, () =>
    useBusinessCommands({
      navigation: {
        openCustomer: (id) => {
          calls.push(id);
          return true;
        },
        openShipment: (id) => {
          calls.push(id);
          return true;
        }
      },
      refreshCustomers: () => {},
      refreshShipments: () => {}
    })
  );
  assert.equal(value.openCustomer({ id: "A" }), false);
  assert.equal(value.openShipment(" "), false);
  assert.equal(value.openCustomer(" A "), true);
  assert.deepEqual(calls, ["A"]);
  scope.stop();
  assert.equal(value.openShipment("S"), false);
});
test("association refresh attempts both ports and propagates failure instead of claiming success", async (t) => {
  const calls = [];
  const { value } = scoped(t, () =>
    useBusinessCommands({
      navigation: {},
      refreshCustomers: () => {
        calls.push("customers");
        throw Error("read failed");
      },
      refreshShipments: () => calls.push("shipments")
    })
  );
  await assert.rejects(value.refreshShipmentRelations(), /read failed/);
  assert.deepEqual(calls, ["customers", "shipments"]);
});
test("queued cross-module refresh does not start IO after workspace disposal", async (t) => {
  const calls = [];
  const { scope, value } = scoped(t, () =>
    useBusinessCommands({
      navigation: {},
      refreshCustomers: () => calls.push(1),
      refreshShipments: () => calls.push(2)
    })
  );
  const result = value.refreshShipmentRelations();
  scope.stop();
  assert.equal(await result, false);
  assert.deepEqual(calls, []);
});
test("a port declining refresh is returned as incomplete", async (t) => {
  const { value } = scoped(t, () =>
    useBusinessCommands({
      navigation: {},
      refreshCustomers: () => false,
      refreshShipments: () => true
    })
  );
  assert.equal(await value.refreshShipmentRelations(), false);
});
test("page and command contexts are scoped to an app, with missing composition failing explicitly", () => {
  const renderer = createRenderer({
    createElement: () => ({ children: [] }),
    createText: (text) => ({ text }),
    createComment: (text) => ({ text }),
    insert: (node, parent) => {
      node.parent = parent;
      parent.children.push(node);
    },
    remove: () => {},
    setText: () => {},
    setElementText: () => {},
    patchProp: () => {},
    parentNode: (node) => node.parent,
    nextSibling: () => null
  });
  const pages = { directory: { id: "customer-only" } },
    commands = Object.freeze({ openCustomer: () => true });
  let received;
  const child = {
    setup() {
      received = { pages: useModulePages("customers"), commands: useBusinessCommandContext() };
      return () => null;
    }
  };
  const app = renderer.createApp({
    setup() {
      provideModulePages({ customers: pages });
      provideBusinessCommands(commands);
      return () => h(child);
    }
  });
  app.mount({ children: [] });
  assert.equal(received.pages, pages);
  assert.equal(received.commands, commands);
  const other = createApp({});
  assert.throws(() => other.runWithContext(() => useModulePages("customers")), /Missing business/);
  assert.throws(() => other.runWithContext(() => useBusinessCommandContext()), /must be supplied/);
  app.unmount();
});
test("bind fixes its customer and payload; a second submit cannot overlap it", async (t) => {
  const h = access(t);
  h.value.bindForm.referenceNo = "123";
  const result = h.value.bindShipment();
  h.value.bindForm.referenceNo = "changed";
  assert.equal(await h.value.quickBindShipment({ shipmentId: "S3" }), false);
  assert.deepEqual(h.calls, [
    {
      name: "bind",
      args: ["A", { carrier: "COSCO", referenceType: "BOOKING", referenceNo: "123" }]
    }
  ]);
  h.queues[0].resolve({});
  assert.equal(await result, true);
  assert.deepEqual(h.refreshes, ["A"]);
  assert.equal(h.value.bindForm.referenceNo, "");
});
test("binding A cannot select, clear or update B when the response arrives late", async (t) => {
  const h = access(t),
    result = h.value.quickBindShipment({ shipmentId: "S3" });
  h.directory.selectedCustomerId.value = "B";
  h.value.bindForm.referenceNo = "B input";
  h.queues[0].resolve({});
  assert.equal(await result, false);
  assert.equal(h.value.bindForm.referenceNo, "B input");
  assert.deepEqual(h.refreshes, []);
  assert.deepEqual(h.notices, []);
});
test("returning to the same customer does not revive an obsolete publication response", async (t) => {
  const h = access(t),
    result = h.value.togglePublication({ shipmentId: "S1", publicationStatus: "DRAFT" });
  h.directory.selectedCustomerId.value = "B";
  h.directory.selectedCustomerId.value = "A";
  h.queues[0].resolve({ shipmentId: "S1", publicationStatus: "PUBLISHED" });
  assert.equal(await result, false);
  assert.equal(h.directory.shipments.value[0].publicationStatus, "DRAFT");
  assert.deepEqual(h.notices, []);
});
test("bulk publication stops further writes when the selected customer changes", async (t) => {
  const h = access(t),
    result = h.value.publishAllDraftShipments();
  h.directory.selectedCustomerId.value = "B";
  h.queues[0].resolve({ shipmentId: "S1" });
  assert.equal(await result, false);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.notices, []);
});
test("bulk publication continues after one failure and reports partial results", async (t) => {
  const h = access(t),
    result = h.value.publishAllDraftShipments();
  h.queues[0].reject(Error("denied"));
  await flush();
  assert.deepEqual(
    h.calls.map((call) => call.args),
    [
      ["A", "S1", true],
      ["A", "S2", true]
    ]
  );
  h.queues[1].resolve({ shipmentId: "S2", publicationStatus: "PUBLISHED" });
  assert.equal(await result, false);
  assert.equal(h.directory.shipments.value[0].publicationStatus, "DRAFT");
  assert.equal(h.directory.shipments.value[1].publicationStatus, "PUBLISHED");
  assert.equal(h.notices[0][1], "customers.publishFailed");
});
test("role loss and disposal prevent late association writes into visible state", async (t) => {
  const h = access(t),
    result = h.value.unbindShipment({ shipmentId: "S1" });
  h.canManage.value = false;
  h.queues[0].resolve();
  assert.equal(await result, false);
  assert.equal(h.directory.shipments.value.length, 2);
  assert.deepEqual(h.refreshes, []);
  assert.equal(await h.value.bindShipment(), false);
  assert.equal(h.calls.length, 1);
  h.scope.stop();
  assert.equal(await h.value.togglePublication({ shipmentId: "S2" }), false);
});
test("candidate selection excludes shipments already assigned to the same party role", async (t) => {
  const h = access(t);
  h.value.toggleCandidateShipment("S3", true);
  h.value.toggleCandidateShipment("S4", true);
  assert.deepEqual(h.value.selectedCandidateShipmentIds.value, ["S3"]);
  h.availableShipments.value = [];
  await flush();
  assert.deepEqual(h.value.selectedCandidateShipmentIds.value, []);
});
test("publication and unbinding use the original target, while post-disposal responses are ignored", async (t) => {
  const h = access(t),
    result = h.value.unbindShipment({ shipmentId: "S1" });
  h.scope.stop();
  h.queues[0].resolve();
  assert.equal(await result, false);
  assert.deepEqual(h.calls[0].args, ["A", "S1"]);
  assert.equal(h.directory.shipments.value.length, 2);
});
test("the module example is absent by default and can be relocated without editing a parent template", () => {
  assert.equal(
    modulesForRole("BUSINESS").some((item) => item.id === customerSummaryExample.id),
    false
  );
  const modules = businessModules.map((module) =>
    module.id === customerSummaryExample.id
      ? { ...module, enabled: true, mount: "qa-example" }
      : module
  );
  const views = Object.fromEntries(
    [
      "planner",
      "operations",
      "workbenches",
      "admin",
      "business",
      "legacyBusiness",
      "shipmentWorkspace",
      "customerWorkspace",
      "agentDirectory",
      "handoverWorkspace",
      "businessOverview",
      "customerSummaryExample",
      ...businessModules.flatMap((module) => module.pages.map((page) => page.view)).filter(Boolean)
    ].map((name) => [name, { name, render: () => null }])
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, modules)
  });
  const destination = businessRouteTarget(
    router,
    { query: {}, hash: "" },
    { section: customerSummaryExample.id },
    modules
  );
  const resolved = router.resolve(destination);
  assert.equal(resolved.path, "/customers/qa-example");
  assert.equal(readBusinessRoute(resolved, "BUSINESS", modules).section, customerSummaryExample.id);
  assert.equal(
    modulesForRole("OVERSEA_AGENT", modules).some((item) => item.id === customerSummaryExample.id),
    false
  );
});
test("example refresh discards out-of-order results and supports failure retry and search", async (t) => {
  const jobs = [],
    user = ref({ id: "staff", role: "BUSINESS" });
  const { value } = scoped(t, () =>
    useCustomerSummary({
      user,
      read: () => {
        const job = deferred();
        jobs.push(job);
        return job.promise;
      }
    })
  );
  const first = value.refresh(),
    second = value.refresh();
  jobs[1].resolve([{ id: "A", displayName: "Alpha" }]);
  await second;
  jobs[0].resolve([{ id: "B", displayName: "Beta" }]);
  await first;
  assert.equal(value.rows.value[0].id, "A");
  value.query.value = "none";
  assert.equal(value.rows.value.length, 0);
  value.query.value = "alp";
  assert.equal(value.rows.value.length, 1);
  const failure = value.refresh();
  jobs[2].reject(Error("offline"));
  await failure;
  assert.equal(value.error.value, "offline");
  const retry = value.refresh();
  jobs[3].resolve([]);
  await retry;
  assert.equal(value.error.value, "");
  assert.equal(value.loading.value, false);
});
test("example user changes clear data and reject old results; forbidden roles issue no read", async (t) => {
  const job = deferred(),
    user = ref({ id: "staff", role: "BUSINESS" });
  let calls = 0;
  const { scope, value } = scoped(t, () =>
    useCustomerSummary({
      user,
      read: () => {
        calls++;
        return job.promise;
      }
    })
  );
  const pending = value.refresh();
  user.value = { id: "customer", role: "CUSTOMER" };
  job.resolve([{ id: "A" }]);
  await pending;
  assert.equal(value.rows.value.length, 0);
  assert.equal(value.loading.value, false);
  assert.equal(await value.refresh(), false);
  assert.equal(calls, 1);
  scope.stop();
  assert.equal(await value.refresh(), false);
});
