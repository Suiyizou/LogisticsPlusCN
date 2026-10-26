import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useAdminBusinessLists } from "../src/features/admin/useAdminBusinessLists.js";
import { createAdminBusinessCopy } from "../src/features/admin/adminBusinessCopy.js";
import {
  createAdminBusinessPresentation,
  normalizeAdminTicket
} from "../src/features/admin/adminBusinessPresentation.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const customer = (id = 0, agentUserId = 1) => ({
  customerId: id,
  customerDisplayName: "Customer " + id,
  agentUserId
});
function harness(t) {
  const user = ref({ id: 1, username: "admin", role: "ADMIN" });
  const hostBusy = ref(false),
    locale = ref("zh-CN"),
    calls = [],
    events = [];
  const impl = {
    fetchPlatformInfo: async () => ({ items: [customer()], total: 1, customerCount: 1 }),
    fetchCustomerHandovers: async () => ({
      items: [{ requestId: 0, status: "APPROVED" }],
      total: 1
    }),
    fetchAvailableBusinessShipments: async () => ({ items: [{ shipmentId: 0 }], total: 1 }),
    deletePlatformCustomer: async () => {},
    confirmDelete: async () => true,
    afterCustomerDeleted: async () => {}
  };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return impl[name](...args);
    };
  const copy = createAdminBusinessCopy({
    locale: () => locale.value,
    t: (key) => key,
    ui: (key) => key
  });
  const scope = effectScope();
  const workflow = scope.run(() =>
    useAdminBusinessLists({
      currentUser: user,
      isHostBusy: () => hostBusy.value,
      copy,
      t: (key) => key,
      translate: (text) => text,
      services: Object.fromEntries(
        [
          "fetchPlatformInfo",
          "fetchCustomerHandovers",
          "fetchAvailableBusinessShipments",
          "deletePlatformCustomer"
        ].map((name) => [name, invoke(name)])
      ),
      confirmDelete: invoke("confirmDelete"),
      afterCustomerDeleted: invoke("afterCustomerDeleted"),
      feedback: {
        clear: () => events.push(["clear"]),
        success: (text) => events.push(["success", text]),
        error: (text) => events.push(["error", text]),
        handled: (error) => events.push(["handled", error])
      }
    })
  );
  t.after(() => scope.stop());
  return { workflow, impl, user, hostBusy, calls, events, scope, copy, locale };
}

test("business list endpoints retain their distinct page bases and normalize shipment envelopes", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.impl.fetchAvailableBusinessShipments = async () => ({
    items: [
      { item: { shipment: { shipmentId: 0, carrier: "MSC" }, clientName: "Client" } },
      null,
      42
    ],
    total: 1
  });
  await Promise.all([w.loadPlatformPage(), w.loadCustomerHandoverPage(), w.loadAdminTicketPage()]);
  assert.deepEqual(
    h.calls.map((call) => [call[0], call[1]]),
    [
      ["fetchPlatformInfo", { page: 0, size: 20 }],
      ["fetchCustomerHandovers", { page: 0, size: 20, status: "" }],
      ["fetchAvailableBusinessShipments", { page: 1, pageSize: 20 }]
    ]
  );
  assert.deepEqual(w.adminTickets.value, [{ shipmentId: 0, carrier: "MSC", clientName: "Client" }]);
  assert.equal(w.customerHandoversLoaded.value, true);
  assert.equal(w.adminTicketsLoaded.value, true);
  assert.equal(w.busy.value, false);
});

for (const [method, service, rows, row] of [
  ["loadPlatformPage", "fetchPlatformInfo", "platformCustomers", customer(10)],
  ["loadCustomerHandoverPage", "fetchCustomerHandovers", "customerHandovers", { requestId: 10 }],
  ["loadAdminTicketPage", "fetchAvailableBusinessShipments", "adminTickets", { shipmentId: 10 }]
])
  test(`${method} ignores an older successful or failed read`, async (t) => {
    const h = harness(t),
      older = deferred(),
      newer = deferred();
    let count = 0;
    h.impl[service] = () => (++count === 1 ? older : newer).promise;
    const a = h.workflow[method](),
      b = h.workflow[method]();
    newer.resolve({ items: [row], total: 1 });
    assert.equal(await b, true);
    older.reject(new Error("stale read"));
    assert.equal(await a, false);
    assert.deepEqual(h.workflow[rows].value, [row]);
    assert.equal(h.workflow.busy.value, false);
    assert.equal(
      h.events.some((event) => event[0] === "error"),
      false
    );
  });

test("business lists clear on account or role change and cannot accept old responses after return", async (t) => {
  const h = harness(t),
    late = deferred();
  h.impl.fetchPlatformInfo = () => late.promise;
  const pending = h.workflow.loadPlatformPage();
  h.user.value = { id: 2, username: "other", role: "ADMIN" };
  assert.equal(h.workflow.busy.value, false);
  h.user.value = { id: 1, username: "admin", role: "ADMIN" };
  late.resolve({ items: [customer(99)], total: 1 });
  assert.equal(await pending, false);
  assert.deepEqual(h.workflow.platformCustomers.value, []);
  h.user.value = { id: 1, username: "admin", role: "BUSINESS" };
  assert.equal(await h.workflow.loadAdminTicketPage(), false);
  assert.equal(h.calls.filter((call) => call[0] === "fetchAvailableBusinessShipments").length, 0);
});

test("handover status changes clear old rows, reset page, and lock page/filter writes until completion", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await w.loadCustomerHandoverPage();
  w.customerHandoverPage.value = 3;
  const wait = deferred();
  h.impl.fetchCustomerHandovers = () => wait.promise;
  const changing = w.changeCustomerHandoverStatus("REJECTED");
  assert.deepEqual(w.customerHandovers.value, []);
  assert.equal(w.customerHandoverPage.value, 1);
  assert.equal(w.customerHandoverStatus.value, "REJECTED");
  assert.equal(await w.changeCustomerHandoverStatus("PENDING"), false);
  assert.equal(await w.changeCustomerHandoverPage(2), false);
  assert.equal(await w.changeCustomerHandoverPageSize(50), false);
  wait.resolve({ items: [{ requestId: 9, status: "REJECTED" }], total: 1 });
  assert.equal(await changing, true);
  assert.equal(await w.changeCustomerHandoverStatus("invented"), false);
  assert.equal(h.calls.filter((call) => call[0] === "fetchCustomerHandovers").length, 2);
});

test("an emptied last page corrects once without overwriting a newer selection", async (t) => {
  const h = harness(t),
    w = h.workflow;
  w.platformPage.value = 3;
  const correction = deferred(),
    correctionStarted = deferred();
  let count = 0;
  h.impl.fetchPlatformInfo = async (args) => {
    count++;
    if (count === 1) return { items: [], total: 21 };
    if (count === 2) {
      assert.equal(args.page, 1);
      correctionStarted.resolve();
      return correction.promise;
    }
    return { items: [customer(1)], total: 40 };
  };
  const a = w.loadPlatformPage();
  await correctionStarted.promise;
  w.platformPage.value = 1;
  const b = w.loadPlatformPage();
  assert.equal(await b, true);
  correction.resolve({ items: [customer(21)], total: 21 });
  assert.equal(await a, false);
  assert.equal(w.platformPage.value, 1);
  assert.deepEqual(w.platformCustomers.value, [customer(1)]);
});

test("zero-ID customer deletion snapshots its target and rejects duplicate confirmation", async (t) => {
  const h = harness(t),
    w = h.workflow,
    confirmation = deferred(),
    row = customer(0);
  await w.loadPlatformPage();
  h.impl.confirmDelete = () => confirmation.promise;
  const a = w.handleDeletePlatformCustomer(row);
  row.customerId = 42;
  assert.equal(await w.handleDeletePlatformCustomer(row), false);
  confirmation.resolve(true);
  assert.equal(await a, true);
  assert.equal(h.calls.find((call) => call[0] === "deletePlatformCustomer")[1], 0);
  assert.equal(Object.isFrozen(h.calls.find((call) => call[0] === "confirmDelete")[1]), true);
  assert.equal(w.busy.value, false);
});

test("cancelled or revoked customer deletion does not call the destructive API", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.impl.confirmDelete = async () => false;
  assert.equal(await w.handleDeletePlatformCustomer(customer()), false);
  const confirmation = deferred();
  h.impl.confirmDelete = () => confirmation.promise;
  const a = w.handleDeletePlatformCustomer(customer());
  h.user.value = { id: 2, username: "other", role: "ADMIN" };
  confirmation.resolve(true);
  assert.equal(await a, false);
  assert.equal(
    h.calls.some((call) => call[0] === "deletePlatformCustomer"),
    false
  );
  assert.equal(w.busy.value, false);
});

test("committed customer deletion clears all relationship rows and reports refresh failure separately", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.impl.fetchPlatformInfo = async () => ({
    items: [customer(0, 1), customer(0, 2), customer(5)],
    total: 3,
    customerCount: 2
  });
  await w.loadPlatformPage();
  h.impl.fetchPlatformInfo = async () => {
    throw new Error("refresh unavailable");
  };
  h.impl.afterCustomerDeleted = async () => {
    throw new Error("audit unavailable");
  };
  assert.equal(await w.handleDeletePlatformCustomer(customer(0)), true);
  assert.deepEqual(w.platformCustomers.value, [customer(5)]);
  assert.equal(w.platformTotal.value, 1);
  assert.equal(w.platformInfo.value.customerCount, 1);
  assert.equal(h.calls.filter((call) => call[0] === "deletePlatformCustomer").length, 1);
  assert.deepEqual(
    h.events.filter((event) => event[0] === "error"),
    [["error", "adminWorkflow.savedRefreshFailed"]]
  );
  assert.equal(w.busy.value, false);
});

test("customer deletion from the last page refreshes its preceding page and guards follow-up side effects", async (t) => {
  const h = harness(t),
    w = h.workflow;
  w.platformPage.value = 2;
  h.impl.fetchPlatformInfo = async () => ({ items: [customer(0)], total: 21, customerCount: 21 });
  await w.loadPlatformPage();
  h.impl.fetchPlatformInfo = async (options) => {
    assert.equal(options.page, 0);
    return { items: [customer(1)], total: 20 };
  };
  let active;
  h.impl.afterCustomerDeleted = async (isCurrent) => {
    active = isCurrent;
    assert.equal(isCurrent(), true);
  };
  assert.equal(await w.handleDeletePlatformCustomer(customer()), true);
  assert.equal(w.platformPage.value, 1);
  h.user.value = { id: 2, username: "other", role: "ADMIN" };
  assert.equal(active(), false);
});

test("invalid pagination, duplicate events and cross-workflow busy state do not dispatch reads", async (t) => {
  const h = harness(t),
    w = h.workflow;
  assert.equal(await w.changePlatformPage(0), false);
  assert.equal(await w.changePlatformPage(1), false);
  assert.equal(await w.changeAdminTicketPageSize(101), false);
  assert.equal(await w.changeCustomerHandoverPage(Number.NaN), false);
  h.hostBusy.value = true;
  assert.equal(await w.changePlatformPage(2), false);
  assert.equal(await w.refreshAdminTicketPage(), false);
  assert.equal(await w.handleDeletePlatformCustomer(customer()), false);
  assert.equal(h.calls.length, 0);
});

test("active read failures remain retryable while disposed responses stay silent", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.impl.fetchAvailableBusinessShipments = async () => {
    throw new Error("read failure");
  };
  assert.equal(await w.refreshAdminTicketPage(), false);
  assert.equal(w.adminTicketsLoaded.value, false);
  assert.equal(w.busy.value, false);
  assert.deepEqual(
    h.events.filter((event) => event[0] === "error"),
    [["error", "read failure"]]
  );
  const late = deferred();
  h.impl.fetchAvailableBusinessShipments = () => late.promise;
  const a = w.loadAdminTicketPage();
  h.scope.stop();
  late.reject(new Error("late error"));
  assert.equal(await a, false);
  assert.equal(h.events.filter((event) => event[0] === "error").length, 1);
});

test("business presentation preserves zero IDs and rejects invalid dates before invoking the formatter", (t) => {
  const h = harness(t),
    dates = [],
    p = createAdminBusinessPresentation({
      copy: h.copy,
      formatDate: (value) => {
        dates.push(value);
        return "formatted";
      }
    });
  assert.equal(p.platformRowKey(customer(0, 0)), "0:0");
  assert.equal(p.handoverUserHandle({ requestId: 0, sourceBusinessUserId: 0 }, "source"), "0");
  assert.equal(p.handoverCustomerNames({ requestId: 0, customers: [{ id: 0 }] }), "0");
  assert.equal(p.date("not-a-date"), "-");
  assert.equal(p.date(null), "-");
  assert.deepEqual(dates, []);
  assert.equal(p.date("2026-10-12T12:00:00Z"), "formatted");
  assert.equal(p.handoverStatusClass("unexpected"), "unknown");
});

test("business presentation uses actual reviewer, ownership fallbacks and current locale", (t) => {
  const h = harness(t),
    p = createAdminBusinessPresentation({ copy: h.copy, formatDate: (value) => value });
  assert.equal(
    p.handoverReviewer({
      requestId: 1,
      requestedBy: { displayName: "Requester" },
      reviewedBy: { displayName: "Reviewer" }
    }),
    "Reviewer"
  );
  assert.equal(
    p.ownerLabel({
      participants: [
        { accountRole: "CUSTOMER", displayName: "Customer" },
        { bindingRole: "RESPONSIBLE", displayName: "Owner" }
      ]
    }),
    "Owner"
  );
  assert.equal(p.clientLabel({ clientCode: "ABC", clientName: "Abc" }), "ABC");
  assert.equal(
    p.boundUsersLabel({ boundUsers: [{ username: "one" }, { username: "two" }] }),
    "one、two"
  );
  assert.equal(p.referenceType("BILL_OF_LADING"), "提单号");
  h.locale.value = "en-US";
  assert.equal(p.referenceType("BILL_OF_LADING"), "Bill of lading");
  assert.equal(
    p.boundUsersLabel({ boundUsers: [{ username: "one" }, { username: "two" }] }),
    "one, two"
  );
  assert.equal(
    p.handoverReviewer({
      requestId: 1,
      status: "APPROVED",
      requestedBy: { displayName: "Requester" }
    }),
    "Completed directly by business operator"
  );
  assert.equal(p.handoverReviewer({ requestId: 1, status: "PENDING" }), "No completion record");
  assert.equal(p.handoverReviewer({ requestId: 1, status: "REJECTED" }), "Reviewer not recorded");
});

test("shipment normalization never mutates the source envelope", () => {
  const source = {
    item: { shipment: { shipmentId: 0, clientName: "Old" }, clientName: "Override" }
  };
  assert.deepEqual(normalizeAdminTicket(source), { shipmentId: 0, clientName: "Override" });
  assert.equal(source.item.shipment.clientName, "Old");
  assert.equal(normalizeAdminTicket(null), null);
  assert.equal(normalizeAdminTicket([]), null);
});

test("ticket pagination uses the backend-clamped response page and size without a redundant reread", async (t) => {
  const h = harness(t),
    w = h.workflow;
  w.adminTicketPage.value = 999;
  w.adminTicketPageSize.value = 2;
  h.impl.fetchAvailableBusinessShipments = async () => ({
    items: [{ shipmentId: "last" }],
    total: 11,
    page: 3,
    pageSize: 5
  });
  assert.equal(await w.loadAdminTicketPage(), true);
  assert.equal(w.adminTicketPage.value, 3);
  assert.equal(w.adminTicketPageSize.value, 5);
  assert.deepEqual(w.adminTickets.value, [{ shipmentId: "last" }]);
  assert.equal(h.calls.filter((call) => call[0] === "fetchAvailableBusinessShipments").length, 1);
  assert.equal(await w.changeAdminTicketPageSize(2), false);
});
