import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useAdminConsole } from "../src/features/admin/useAdminConsole.js";
import { useAdminBusinessLists } from "../src/features/admin/useAdminBusinessLists.js";
import { createAdminBusinessCopy } from "../src/features/admin/adminBusinessCopy.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(t, signedIn = true) {
  const user = ref(signedIn ? { id: 0, username: "admin", role: "ADMIN" } : null);
  const scope = effectScope(),
    events = [],
    calls = [];
  let token = "",
    console,
    business;
  const impl = {
    login: async () => ({ token: "new-token", user: { id: 0, username: "admin", role: "ADMIN" } }),
    fetchMe: async () => user.value,
    fetchOverview: async () => ({ totalUsers: 17 }),
    fetchMonitoring: async () => ({ runtime: { totalRequests: 0 } }),
    fetchAudit: async () => ({ items: [{ id: 0, userId: 0 }], total: 1 }),
    fetchPlatformInfo: async () => ({ items: [{ customerId: 0, agentUserId: 0 }], total: 1 }),
    fetchCustomerHandovers: async () => ({ items: [], total: 0 }),
    fetchAvailableBusinessShipments: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    deletePlatformCustomer: async () => {},
    confirmDelete: async () => true
  };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return impl[name](...args);
    };
  const feedback = {
    clear: () => events.push(["clear"]),
    error: (text) => events.push(["error", text]),
    success: (text) => events.push(["success", text]),
    handled: (error) => events.push(["handled", error])
  };
  const common = { currentUser: user, feedback, t: (key) => key, translate: (text) => text };
  business = scope.run(() =>
    useAdminBusinessLists({
      ...common,
      isHostBusy: () => Boolean(console?.busy.value),
      services: Object.fromEntries(
        [
          "fetchPlatformInfo",
          "fetchCustomerHandovers",
          "fetchAvailableBusinessShipments",
          "deletePlatformCustomer"
        ].map((name) => [name, invoke(name)])
      ),
      confirmDelete: invoke("confirmDelete"),
      afterCustomerDeleted: async (isCurrent) => {
        if (isCurrent()) await Promise.all([console.loadOverview(), console.loadAudit()]);
      },
      copy: createAdminBusinessCopy({ locale: () => "en-US", t: common.t, ui: common.t })
    })
  );
  console = scope.run(() =>
    useAdminConsole({
      ...common,
      isHostBusy: () => business.busy.value,
      services: Object.fromEntries(
        ["login", "fetchMe", "fetchOverview", "fetchMonitoring", "fetchAudit"].map((name) => [
          name,
          invoke(name)
        ])
      ),
      commitLogin: (response) => {
        token = response.token;
        events.push(["commit", response.token]);
      },
      clearSession: () => {
        token = "";
        events.push(["clearSession"]);
      },
      updateUser: (next) => {
        user.value = next;
      },
      loggedOut: () => events.push(["logout"]),
      refreshOther: () => [
        business.loadPlatformPage(),
        business.loadCustomerHandoverPage(),
        business.loadAdminTicketPage()
      ],
      copy: () => ({
        refreshed: "refreshed",
        partialFailure: "partial",
        loginSuccess: "signed in",
        notAdmin: "denied"
      })
    })
  );
  t.after(() => scope.stop());
  return { user, scope, console, business, impl, calls, events, token: () => token };
}

test("independent acceptance: administrator initialization starts all owned reads together and old scope never publishes", async (t) => {
  const h = fixture(t),
    waits = {};
  for (const name of [
    "fetchOverview",
    "fetchMonitoring",
    "fetchAudit",
    "fetchPlatformInfo",
    "fetchCustomerHandovers",
    "fetchAvailableBusinessShipments"
  ]) {
    waits[name] = deferred();
    h.impl[name] = () => waits[name].promise;
  }
  const refreshing = h.console.refreshDashboard(false, false);
  assert.equal(h.calls.length, 6);
  assert.equal(h.console.busy.value, true);
  assert.equal(h.business.busy.value, true);
  assert.equal(await h.business.handleDeletePlatformCustomer({ customerId: 0 }), false);
  h.user.value = { id: 1, username: "other", role: "ADMIN" };
  h.user.value = { id: 0, username: "admin", role: "ADMIN" };
  for (const wait of Object.values(waits))
    wait.resolve({
      items: [{ id: 99, customerId: 99, requestId: 99, shipmentId: 99 }],
      total: 1,
      totalUsers: 99
    });
  assert.equal(await refreshing, false);
  assert.equal(h.console.systemOverview.value, null);
  assert.deepEqual(h.console.apiAuditRows.value, []);
  assert.deepEqual(h.business.platformCustomers.value, []);
  assert.deepEqual(h.business.adminTickets.value, []);
  assert.equal(h.console.busy.value, false);
  assert.equal(h.business.busy.value, false);
  assert.equal(
    h.events.some((event) => event[0] === "success" || event[0] === "error"),
    false
  );
});

test("independent acceptance: one failed dashboard dependency retains every successful resource and releases write lock", async (t) => {
  const h = fixture(t);
  h.impl.fetchCustomerHandovers = async () => {
    throw Error("handover unavailable");
  };
  assert.equal(await h.console.refreshDashboard(true, false), false);
  assert.equal(h.console.systemOverview.value.totalUsers, 17);
  assert.equal(h.console.monitoring.value.runtime.totalRequests, 0);
  assert.equal(h.console.apiAuditRows.value[0].id, 0);
  assert.equal(h.business.platformCustomers.value[0].customerId, 0);
  assert.equal(h.business.adminTicketsLoaded.value, true);
  assert.deepEqual(
    h.events.filter((event) => event[0] === "error"),
    [["error", "partial"]]
  );
  assert.equal(h.console.busy.value, false);
  assert.equal(h.business.busy.value, false);
});

test("independent acceptance: old login completion cannot restore or erase a newer authenticated session", async (t) => {
  const h = fixture(t, false),
    older = deferred(),
    newer = deferred();
  let serial = 0;
  h.impl.login = () => (++serial === 1 ? older : newer).promise;
  h.console.loginForm.password = "OldPassword!";
  const first = h.console.handleLogin();
  h.console.handleLogout();
  assert.equal(h.console.loginForm.password, "");
  h.console.loginForm.password = "NewPassword!";
  const second = h.console.handleLogin();
  newer.resolve({ token: "new-token", user: { id: 0, username: "admin", role: "ADMIN" } });
  assert.equal(await second, true);
  older.resolve({ token: "old-token", user: { id: 7, username: "old-admin", role: "ADMIN" } });
  assert.equal(await first, false);
  assert.equal(h.token(), "new-token");
  assert.equal(h.user.value.id, 0);
  assert.deepEqual(
    h.events.filter((event) => event[0] === "commit"),
    [["commit", "new-token"]]
  );
});

test("independent acceptance: revoked customer deletion confirmation cannot call delete or dashboard hooks", async (t) => {
  const h = fixture(t),
    confirm = deferred();
  h.impl.confirmDelete = (target) => {
    assert.equal(target.customerId, 0);
    assert.equal(Object.isFrozen(target), true);
    return confirm.promise;
  };
  const deleting = h.business.handleDeletePlatformCustomer({ customerId: 0 });
  assert.equal(h.business.busy.value, true);
  assert.equal(await h.console.refreshDashboard(), false);
  h.user.value = { id: 0, username: "admin", role: "BUSINESS" };
  confirm.resolve(true);
  assert.equal(await deleting, false);
  assert.deepEqual(
    h.calls.map((call) => call[0]),
    ["confirmDelete"]
  );
  assert.equal(h.business.busy.value, false);
});

test("independent acceptance: disposed pending administrator login does not persist credentials or report to a dead host", async (t) => {
  const h = fixture(t, false),
    login = deferred();
  h.impl.login = () => login.promise;
  h.console.loginForm.password = "PrivatePassword!";
  const pending = h.console.handleLogin();
  h.scope.stop();
  assert.equal(h.console.loginForm.password, "");
  login.reject(Error("late login failure"));
  assert.equal(await pending, false);
  assert.equal(h.token(), "");
  assert.equal(
    h.events.some((event) => event[0] === "error" || event[0] === "commit"),
    false
  );
});

test("independent acceptance: audit page shrink corrects exactly once and keeps selected page matched to its rows", async (t) => {
  const h = fixture(t);
  h.console.apiAuditPage.value = 3;
  h.impl.fetchAudit = async ({ page }) =>
    page === 2 ? { items: [], total: 1 } : { items: [{ id: 0 }], total: 1 };
  assert.equal(await h.console.loadAudit(), true);
  assert.equal(h.console.apiAuditPage.value, 1);
  assert.deepEqual(h.console.apiAuditRows.value, [{ id: 0 }]);
  assert.deepEqual(
    h.calls.filter((call) => call[0] === "fetchAudit").map((call) => call[1]),
    [
      { page: 2, size: 20 },
      { page: 0, size: 20 }
    ]
  );
});

test("independent acceptance: a superseded same-page audit read cannot launch a corrective request", async (t) => {
  const h = fixture(t),
    older = deferred(),
    newer = deferred();
  h.console.apiAuditPage.value = 3;
  let serial = 0;
  h.impl.fetchAudit = () => {
    serial++;
    return serial === 1
      ? older.promise
      : serial === 2
        ? newer.promise
        : Promise.reject(Error("obsolete correction"));
  };
  const first = h.console.loadAudit(),
    second = h.console.loadAudit();
  newer.resolve({ items: [{ id: 61 }], total: 60 });
  assert.equal(await second, true);
  older.resolve({ items: [], total: 0 });
  assert.equal(await first, false);
  assert.deepEqual(h.console.apiAuditRows.value, [{ id: 61 }]);
  assert.equal(h.console.apiAuditPage.value, 3);
  assert.equal(h.calls.filter((call) => call[0] === "fetchAudit").length, 2);
});
