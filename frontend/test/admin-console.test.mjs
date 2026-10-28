import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useAdminConsole } from "../src/features/admin/useAdminConsole.js";
import { useAdminAccounts } from "../src/features/admin/useAdminAccounts.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const admin = (id = 1, displayName = "Administrator") => ({
  id,
  username: "admin-" + id,
  displayName,
  role: "ADMIN"
});
const employee = (id = 2) => ({
  id,
  username: "employee-" + id,
  displayName: "Employee",
  role: "BUSINESS",
  status: "ACTIVE"
});
function harness(t, initialUser = admin()) {
  const user = ref(initialUser),
    hostBusy = ref(false),
    calls = [],
    events = [],
    tokens = [];
  const impl = {
    login: async () => ({ user: admin(), token: "test-token" }),
    fetchMe: async () => ({ ...user.value }),
    fetchOverview: async () => ({ totalUsers: 7 }),
    fetchMonitoring: async () => ({
      deviceLimit: 5,
      runtime: { totalRequests: 12, failedRequests: 0 }
    }),
    fetchAudit: async () => ({ items: [{ id: 0, action: "LOGIN_SUCCESS" }], total: 1 }),
    fetchEmployees: async () => ({ items: [employee()], total: 1 }),
    createEmployee: async () => employee(),
    updateEmployee: async (id) => employee(id),
    deleteEmployee: async () => {},
    resetEmployeePassword: async () => ({ temporaryPassword: "TempPassword123" }),
    refreshOther: () => []
  };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return impl[name](...args);
    };
  const scope = effectScope();
  const common = {
    currentUser: user,
    isHostBusy: () => hostBusy.value,
    t: (key) => key,
    translate: (text) => text,
    feedback: {
      clear: () => events.push(["clear"]),
      success: (text) => events.push(["success", text]),
      error: (text) => events.push(["error", text]),
      handled: (error) => events.push(["handled", error])
    }
  };
  const console = scope.run(() =>
    useAdminConsole({
      ...common,
      services: Object.fromEntries(
        ["login", "fetchMe", "fetchOverview", "fetchMonitoring", "fetchAudit"].map((name) => [
          name,
          invoke(name)
        ])
      ),
      commitLogin: (response) => tokens.push(response.token),
      clearSession: () => events.push(["clearSession"]),
      updateUser: (next) => {
        user.value = next;
      },
      loggedOut: () => events.push(["loggedOut"]),
      refreshOther: invoke("refreshOther"),
      copy: () => ({
        refreshed: "refreshed",
        partialFailure: "partial-failure",
        loginSuccess: "login-success",
        notAdmin: "admin-required"
      })
    })
  );
  const accounts = scope.run(() =>
    useAdminAccounts({
      ...common,
      isHostBusy: () => hostBusy.value || console.busy.value,
      services: Object.fromEntries(
        [
          "fetchEmployees",
          "createEmployee",
          "updateEmployee",
          "deleteEmployee",
          "resetEmployeePassword"
        ].map((name) => [name, invoke(name)])
      ),
      confirmDelete: async () => true,
      writeClipboard: async () => {},
      onUserUpdated: (next) => {
        user.value = next;
      }
    })
  );
  t.after(() => scope.stop());
  return { user, hostBusy, calls, events, tokens, impl, scope, console, accounts };
}

test("audit shrinking last page uses a zero-based corrective read and commits page with its rows", async (t) => {
  const h = harness(t),
    w = h.console,
    correction = deferred(),
    correctionStarted = deferred();
  w.apiAuditPage.value = 3;
  w.apiAuditRows.value = [{ id: "old" }];
  w.apiAuditTotal.value = 42;
  let count = 0;
  h.impl.fetchAudit = async (options) => {
    count++;
    if (count === 1) {
      assert.deepEqual(options, { page: 2, size: 20 });
      return { items: [], total: 21 };
    }
    assert.deepEqual(options, { page: 1, size: 20 });
    correctionStarted.resolve();
    return correction.promise;
  };
  const read = w.loadAudit();
  await correctionStarted.promise;
  assert.equal(w.apiAuditPage.value, 3);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "old" }]);
  assert.equal(w.apiAuditTotal.value, 42);
  correction.resolve({ items: [{ id: "last" }], total: 21 });
  assert.equal(await read, true);
  assert.equal(w.apiAuditPage.value, 2);
  assert.equal(w.apiAuditTotal.value, 21);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "last" }]);
  assert.equal(w.busy.value, false);
});

test("audit corrective read from a departed account cannot overwrite a new account", async (t) => {
  const h = harness(t),
    w = h.console,
    correction = deferred(),
    started = deferred();
  w.apiAuditPage.value = 3;
  let count = 0;
  h.impl.fetchAudit = async () => {
    count++;
    if (count === 1) return { items: [], total: 21 };
    if (count === 2) {
      started.resolve();
      return correction.promise;
    }
    return { items: [{ id: "new-account" }], total: 1 };
  };
  const stale = w.loadAudit();
  await started.promise;
  h.user.value = admin(2);
  assert.equal(w.apiAuditPage.value, 1);
  assert.deepEqual(w.apiAuditRows.value, []);
  assert.equal(await w.loadAudit(), true);
  correction.resolve({ items: [{ id: "departed-account" }], total: 21 });
  assert.equal(await stale, false);
  assert.equal(w.apiAuditPage.value, 1);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "new-account" }]);
  assert.equal(w.busy.value, false);
});

test("partial dashboard refresh retains successful resources and releases busy state for retry", async (t) => {
  const h = harness(t),
    w = h.console;
  w.apiAuditRows.value = [{ id: "previous" }];
  h.impl.fetchAudit = async () => {
    throw new Error("audit unavailable");
  };
  assert.equal(await w.refreshDashboard(true, false), false);
  assert.deepEqual(w.systemOverview.value, { totalUsers: 7 });
  assert.equal(w.monitoring.value.runtime.totalRequests, 12);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "previous" }]);
  assert.deepEqual(
    h.events.filter((event) => event[0] === "error"),
    [["error", "partial-failure"]]
  );
  assert.equal(
    h.events.some((event) => event[0] === "success"),
    false
  );
  assert.equal(w.busy.value, false);
  h.impl.fetchAudit = async () => ({ items: [{ id: "retried" }], total: 1 });
  assert.equal(await w.refreshDashboard(true, false), true);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "retried" }]);
  assert.equal(h.events.at(-1)[1], "refreshed");
  assert.equal(w.busy.value, false);
});

test("other workflow refresh failures preserve dashboard successes and remain retryable", async (t) => {
  const h = harness(t),
    w = h.console;
  h.impl.refreshOther = () => [
    Promise.reject(new Error("customer read failed")),
    Promise.resolve("other-success")
  ];
  assert.equal(await w.refreshDashboard(false, false), false);
  assert.equal(w.systemOverview.value.totalUsers, 7);
  assert.equal(w.apiAuditRows.value[0].id, 0);
  assert.equal(w.busy.value, false);
  h.impl.refreshOther = () => [];
  assert.equal(await w.refreshDashboard(false, false), true);
});

test("audit pagination rejects duplicate/busy events, removes old rows and leaves failed selection retryable", async (t) => {
  const h = harness(t),
    w = h.console,
    read = deferred();
  await w.loadAudit();
  h.impl.fetchAudit = () => read.promise;
  const changing = w.changeAuditPage(2);
  assert.equal(w.apiAuditPage.value, 2);
  assert.deepEqual(w.apiAuditRows.value, []);
  assert.equal(w.busy.value, true);
  assert.equal(await w.changeAuditPage(2), false);
  assert.equal(await w.changeAuditPage(3), false);
  assert.equal(await w.refreshAudit(), false);
  assert.equal(h.calls.filter((call) => call[0] === "fetchAudit").length, 2);
  read.reject(new Error("page failed"));
  assert.equal(await changing, false);
  assert.equal(w.apiAuditPage.value, 2);
  assert.deepEqual(w.apiAuditRows.value, []);
  assert.equal(w.busy.value, false);
  h.impl.fetchAudit = async (options) => {
    assert.equal(options.page, 1);
    return { items: [{ id: "page-two" }], total: 21 };
  };
  assert.equal(await w.refreshAudit(), true);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "page-two" }]);
});

test("late login response cannot commit a token after scope disposal", async (t) => {
  const h = harness(t, null),
    login = deferred();
  h.impl.login = () => login.promise;
  h.console.loginForm.password = "private-draft";
  const pending = h.console.handleLogin();
  assert.equal(h.console.busy.value, true);
  h.scope.stop();
  assert.equal(h.console.loginForm.password, "");
  login.resolve({ user: admin(), token: "late-token" });
  assert.equal(await pending, false);
  assert.deepEqual(h.tokens, []);
  assert.equal(h.user.value, null);
  assert.equal(
    h.events.some((event) => event[0] === "success"),
    false
  );
  assert.equal(h.console.busy.value, false);
});

test("late login from a previous identity epoch cannot commit a token even after returning to logged-out state", async (t) => {
  const h = harness(t, null),
    login = deferred();
  h.impl.login = () => login.promise;
  const pending = h.console.handleLogin();
  h.user.value = admin(2);
  h.user.value = null;
  login.resolve({ user: admin(1), token: "old-epoch-token" });
  assert.equal(await pending, false);
  assert.deepEqual(h.tokens, []);
  assert.equal(h.console.busy.value, false);
  assert.equal(h.user.value, null);
});

test("login rejects an empty administrator ID but accepts zero without losing its session", async (t) => {
  const h = harness(t, null),
    w = h.console;
  h.impl.login = async () => ({ user: admin(""), token: "invalid" });
  assert.equal(await w.handleLogin(), false);
  assert.deepEqual(h.tokens, []);
  assert.equal(h.user.value, null);
  h.impl.login = async () => ({ user: admin(0), token: "zero-token" });
  assert.equal(await w.handleLogin(), true);
  assert.deepEqual(h.tokens, ["zero-token"]);
  assert.equal(h.user.value.id, 0);
  assert.equal(w.systemOverview.value.totalUsers, 7);
  assert.equal(w.busy.value, false);
});

test("empty current user ID is unauthorized while zero can read administrator resources", async (t) => {
  const h = harness(t, admin(""));
  assert.equal(await h.console.loadOverview(), false);
  assert.equal(await h.accounts.changeEmployeePage(2), false);
  assert.equal(h.calls.length, 0);
  h.user.value = admin(0);
  assert.equal(await h.console.loadOverview(), true);
  assert.equal(h.console.systemOverview.value.totalUsers, 7);
});

test("administrator display name changes do not cancel in-flight reads or profile refresh", async (t) => {
  const h = harness(t),
    read = deferred();
  h.impl.fetchOverview = () => read.promise;
  const pending = h.console.loadOverview();
  h.user.value = admin(1, "Updated name");
  read.resolve({ totalUsers: 9 });
  assert.equal(await pending, true);
  assert.equal(h.console.systemOverview.value.totalUsers, 9);
  h.impl.fetchOverview = async () => ({ totalUsers: 10 });
  h.impl.fetchMe = async () => admin(1, "Server name");
  assert.equal(await h.console.refreshDashboard(false, true), true);
  assert.equal(h.user.value.displayName, "Server name");
  assert.equal(h.console.systemOverview.value.totalUsers, 10);
});

test("employee page workflow enforces production locks, clears old rows and retries the selected failed page", async (t) => {
  const h = harness(t),
    w = h.accounts,
    read = deferred();
  await w.loadEmployeePage();
  h.impl.fetchEmployees = () => read.promise;
  const changing = w.changeEmployeePage(2);
  assert.equal(w.employeePage.value, 2);
  assert.deepEqual(w.employees.value, []);
  assert.equal(w.busy.value, true);
  assert.equal(await w.changeEmployeePage(3), false);
  read.reject(new Error("employees unavailable"));
  assert.equal(await changing, false);
  assert.equal(w.employeePage.value, 2);
  assert.deepEqual(w.employees.value, []);
  assert.equal(w.busy.value, false);
  h.impl.fetchEmployees = async (options) => {
    assert.equal(options.page, 1);
    return { items: [employee(22)], total: 21 };
  };
  assert.equal(await w.loadEmployeePage(), true);
  assert.equal(w.employees.value[0].id, 22);
  const consoleRead = deferred();
  h.impl.fetchOverview = () => consoleRead.promise;
  const pendingConsole = h.console.loadOverview();
  assert.equal(await w.changeEmployeePage(3), false);
  consoleRead.resolve({ totalUsers: 7 });
  await pendingConsole;
  h.user.value = { ...admin(1), role: "CUSTOMER" };
  assert.equal(await w.changeEmployeePage(2), false);
  assert.deepEqual(w.employees.value, []);
});

test("employee page reads ignore old-account responses and preserve selection after successful display-name update", async (t) => {
  const h = harness(t),
    w = h.accounts,
    old = deferred();
  h.impl.fetchEmployees = () => old.promise;
  const changing = w.changeEmployeePage(2);
  h.user.value = admin(2);
  old.resolve({ items: [employee(99)], total: 21 });
  assert.equal(await changing, false);
  assert.equal(w.employeePage.value, 1);
  assert.deepEqual(w.employees.value, []);
  assert.equal(w.busy.value, false);
  const latest = deferred();
  h.impl.fetchEmployees = () => latest.promise;
  const next = w.changeEmployeePage(2);
  h.user.value = admin(2, "Renamed");
  latest.resolve({ items: [employee(22)], total: 21 });
  assert.equal(await next, true);
  assert.equal(w.employeePage.value, 2);
  assert.equal(w.employees.value[0].id, 22);
});

test("overview recent audit always reads page zero without disturbing audit page three", async (t) => {
  const h = harness(t),
    w = h.console;
  h.impl.fetchAudit = async ({ size }) => ({
    items: [{ id: size === 5 ? "newest" : "page-three" }],
    total: 70
  });
  w.apiAuditPage.value = 3;
  assert.equal(await w.loadAudit(), true);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "page-three" }]);
  assert.equal(await w.loadRecentAudit(), true);
  assert.deepEqual(w.recentAuditRows.value, [{ id: "newest" }]);
  assert.equal(w.recentAuditLoaded.value, true);
  assert.equal(w.apiAuditPage.value, 3);
  assert.equal(w.apiAuditPageSize.value, 20);
  assert.equal(w.apiAuditTotal.value, 70);
  assert.deepEqual(w.apiAuditRows.value, [{ id: "page-three" }]);
  assert.deepEqual(
    h.calls.filter((call) => call[0] === "fetchAudit").map((call) => call[1]),
    [
      { page: 2, size: 20 },
      { page: 0, size: 5 }
    ]
  );
  assert.equal(await w.refreshDashboard(false, false), true);
  assert.deepEqual(
    h.calls
      .filter((call) => call[0] === "fetchAudit")
      .slice(-2)
      .map((call) => call[1]),
    [
      { page: 2, size: 20 },
      { page: 0, size: 5 }
    ]
  );
  assert.equal(w.apiAuditPage.value, 3);
  assert.deepEqual(w.recentAuditRows.value, [{ id: "newest" }]);
});

test("recent-audit failure is distinct from loaded empty data and can be retried", async (t) => {
  const h = harness(t),
    w = h.console,
    request = deferred();
  w.apiAuditPage.value = 2;
  h.impl.fetchAudit = () => request.promise;
  const pending = w.loadRecentAudit();
  assert.equal(w.recentAuditLoading.value, true);
  assert.equal(w.recentAuditLoaded.value, false);
  assert.equal(w.recentAuditError.value, "");
  request.reject(Error("recent audit unavailable"));
  await assert.rejects(pending, /recent audit unavailable/);
  assert.equal(w.recentAuditLoading.value, false);
  assert.equal(w.recentAuditLoaded.value, false);
  assert.equal(w.recentAuditError.value, "recent audit unavailable");
  assert.deepEqual(w.recentAuditRows.value, []);
  assert.equal(w.apiAuditPage.value, 2);
  h.impl.fetchAudit = async () => ({ items: [], total: 0 });
  assert.equal(await w.loadRecentAudit(), true);
  assert.equal(w.recentAuditLoaded.value, true);
  assert.equal(w.recentAuditError.value, "");
  assert.deepEqual(w.recentAuditRows.value, []);
});

test("recent-audit replies cannot publish after an identity change or replace its new cache", async (t) => {
  const h = harness(t),
    w = h.console,
    request = deferred();
  h.impl.fetchAudit = () => request.promise;
  const stale = w.loadRecentAudit();
  h.user.value = admin(2);
  assert.equal(w.recentAuditLoading.value, false);
  assert.equal(w.recentAuditLoaded.value, false);
  assert.equal(w.recentAuditError.value, "");
  h.impl.fetchAudit = async () => ({ items: [{ id: "new-admin" }], total: 1 });
  await w.loadRecentAudit();
  request.resolve({ items: [{ id: "departed-admin" }], total: 1 });
  assert.equal(await stale, false);
  assert.deepEqual(w.recentAuditRows.value, [{ id: "new-admin" }]);
  assert.equal(w.recentAuditLoaded.value, true);
  assert.equal(w.recentAuditLoading.value, false);
});

test("logout clears recent audit and a late failure cannot restore an error or old records", async (t) => {
  const h = harness(t),
    w = h.console,
    request = deferred();
  h.impl.fetchAudit = () => request.promise;
  const pending = w.loadRecentAudit();
  w.handleLogout();
  request.reject(Error("old request failed"));
  assert.equal(await pending, false);
  assert.deepEqual(w.recentAuditRows.value, []);
  assert.equal(w.recentAuditLoading.value, false);
  assert.equal(w.recentAuditLoaded.value, false);
  assert.equal(w.recentAuditError.value, "");
  assert.equal(await w.loadRecentAudit(), false);
});

test("a superseded recent-audit read does not clear the latest loading or result state", async (t) => {
  const h = harness(t),
    w = h.console,
    older = deferred(),
    newer = deferred();
  let count = 0;
  h.impl.fetchAudit = () => (++count === 1 ? older.promise : newer.promise);
  const first = w.loadRecentAudit(),
    second = w.loadRecentAudit();
  older.resolve({ items: [{ id: "old" }], total: 1 });
  assert.equal(await first, false);
  assert.equal(w.recentAuditLoading.value, true);
  assert.equal(w.recentAuditLoaded.value, false);
  newer.resolve({ items: [{ id: "current" }], total: 1 });
  assert.equal(await second, true);
  assert.deepEqual(w.recentAuditRows.value, [{ id: "current" }]);
  assert.equal(w.recentAuditLoading.value, false);
});
