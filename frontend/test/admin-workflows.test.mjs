import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import {
  useAdminAccounts,
  isStrongEmployeePassword
} from "../src/features/admin/useAdminAccounts.js";
import { useAdminLlmSettings } from "../src/features/admin/useAdminLlmSettings.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const admin = (id = 1) => ({
  id,
  username: "admin-" + id,
  role: "ADMIN",
  displayName: "Administrator"
});
const employee = (id = 2) => ({
  id,
  username: "user-" + id,
  displayName: "Employee",
  role: "BUSINESS",
  partyRole: "AGENT",
  status: "ACTIVE"
});
const settings = (model = "model-a") => ({
  enabled: true,
  baseUrl: "https://llm.example",
  model,
  apiKeyConfigured: true,
  apiKeyPreview: "***last"
});
function harness(t) {
  const user = ref(admin()),
    hostBusy = ref(false),
    events = [],
    calls = [];
  const defaults = {
    fetchEmployees: async () => ({ items: [employee()], total: 1 }),
    createEmployee: async () => employee(),
    updateEmployee: async (id, payload) => ({ ...employee(id), ...payload }),
    deleteEmployee: async () => {},
    resetEmployeePassword: async () => ({ temporaryPassword: "Temp1234!" }),
    fetchLlmSettings: async () => settings(),
    updateLlmSettings: async () => settings(),
    confirmDelete: async () => true,
    writeClipboard: async () => {}
  };
  const implementations = { ...defaults };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return implementations[name](...args);
    };
  const common = {
    currentUser: user,
    isHostBusy: () => hostBusy.value,
    t: (key) => key,
    translate: (text) => text,
    feedback: {
      clear: () => events.push(["clear"]),
      success: (text) => events.push(["success", text]),
      error: (text, options) => events.push(["error", text, options]),
      handled: (error) => events.push(["handled", error])
    }
  };
  const scope = effectScope();
  let llm;
  const account = scope.run(() =>
    useAdminAccounts({
      ...common,
      isHostBusy: () => hostBusy.value || Boolean(llm?.busy.value),
      services: Object.fromEntries(
        Object.keys(defaults)
          .filter((name) => name.includes("Employee"))
          .map((name) => [name, invoke(name)])
      ),
      confirmDelete: invoke("confirmDelete"),
      writeClipboard: invoke("writeClipboard"),
      onUserUpdated: (next) => {
        events.push(["user", next]);
        user.value = next;
      }
    })
  );
  llm = scope.run(() =>
    useAdminLlmSettings({
      ...common,
      isHostBusy: () => hostBusy.value || account.busy.value,
      services: {
        fetchLlmSettings: invoke("fetchLlmSettings"),
        updateLlmSettings: invoke("updateLlmSettings")
      }
    })
  );
  t.after(() => scope.stop());
  return {
    user,
    hostBusy,
    events,
    calls,
    implementations,
    scope,
    account,
    llm,
    called: (name) => calls.filter((call) => call[0] === name)
  };
}
function newForm(account) {
  assert.equal(account.openEmployeeDialog(), true);
  Object.assign(account.employeeForm, {
    username: "new",
    displayName: "New",
    password: "Strong123!",
    passwordConfirm: "Strong123!"
  });
}

test("accounts publish only the latest list and protect page changes", async (t) => {
  const h = harness(t),
    first = deferred(),
    second = deferred();
  h.implementations.fetchEmployees = () => first.promise;
  const a = h.account.loadEmployeePage();
  h.account.employeePage.value = 2;
  h.implementations.fetchEmployees = () => second.promise;
  const b = h.account.loadEmployeePage();
  second.resolve({ items: [employee(3)], total: 21 });
  assert.equal(await b, true);
  first.resolve({ items: [employee(4)], total: 1 });
  assert.equal(await a, false);
  assert.equal(h.account.employees.value[0].id, 3);
  assert.equal(h.account.busy.value, false);
  const third = deferred();
  h.implementations.fetchEmployees = () => third.promise;
  const c = h.account.loadEmployeePage();
  h.account.employeePageSize.value = 50;
  third.resolve({ items: [], total: 0 });
  assert.equal(await c, false);
  assert.equal(h.account.employeeTotal.value, 21);
  const fourth = deferred();
  h.implementations.fetchEmployees = () => fourth.promise;
  const d = h.account.loadEmployeePage();
  h.account.employeePage.value = 3;
  fourth.reject(Error("obsolete-page"));
  assert.equal(await d, false);
});
test("switching away and back invalidates previous account responses", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.implementations.fetchEmployees = () => gate.promise;
  const task = h.account.loadEmployeePage();
  h.user.value = admin(9);
  h.user.value = admin();
  gate.resolve({ items: [employee()], total: 1 });
  assert.equal(await task, false);
  assert.deepEqual(h.account.employees.value, []);
  assert.equal(h.account.busy.value, false);
});
test("non-admin and disposed scopes cannot start account or settings work", async (t) => {
  const h = harness(t);
  h.user.value = { ...admin(), role: "BUSINESS" };
  assert.equal(h.account.openEmployeeDialog(), false);
  assert.equal(await h.account.loadEmployeePage(), false);
  assert.equal(await h.llm.loadLlmSettings(), false);
  h.user.value = admin();
  h.scope.stop();
  assert.equal(await h.llm.handleUpdateLlmSettings(), false);
  assert.equal(h.account.openEmployeeDialog(), false);
  assert.equal(h.calls.length, 0);
});
test("create snapshots fields, removes confirmation, prevents duplicate writes and pending dismissal", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.implementations.createEmployee = () => gate.promise;
  newForm(h.account);
  const saving = h.account.handleSaveEmployee();
  h.account.employeeForm.username = "other";
  h.account.employeeForm.password = "Changed123!";
  assert.equal(await h.account.handleSaveEmployee(), false);
  assert.equal(h.account.closeEmployeeDialog(), false);
  assert.equal(h.account.openEmployeeDialog(employee(8)), false);
  assert.deepEqual(h.called("createEmployee")[0][1], {
    username: "new",
    displayName: "New",
    role: "OVERSEA_AGENT",
    partyRole: "AGENT",
    status: "ACTIVE",
    password: "Strong123!"
  });
  gate.resolve(employee());
  assert.equal(await saving, true);
  assert.equal(h.account.employeeDialogOpen.value, false);
  assert.equal(h.account.employeeForm.password, "");
  assert.equal(h.called("createEmployee").length, 1);
});
test("password rules and confirmation reject malformed submissions before transport", async (t) => {
  const h = harness(t);
  newForm(h.account);
  for (const value of ["123456", "Admin@123456", "abcdefgh", "12345678", "Aa1", "a1".repeat(65)])
    assert.equal(isStrongEmployeePassword(value), false);
  h.account.employeeForm.password = "abcdefgh";
  assert.equal(await h.account.handleSaveEmployee(), false);
  h.account.employeeForm.password = "Strong123!";
  h.account.employeeForm.passwordConfirm = "different";
  assert.equal(await h.account.handleSaveEmployee(), false);
  assert.equal(h.called("createEmployee").length, 0);
});
test("save errors retain drafts; committed saves remain successful when refresh fails", async (t) => {
  const h = harness(t);
  newForm(h.account);
  h.implementations.createEmployee = async () => {
    throw Error("denied");
  };
  assert.equal(await h.account.handleSaveEmployee(), false);
  assert.equal(h.account.employeeForm.password, "Strong123!");
  h.implementations.createEmployee = async () => employee();
  h.implementations.fetchEmployees = async () => {
    throw Error("offline");
  };
  assert.equal(await h.account.handleSaveEmployee(), true);
  assert.equal(h.account.employeeForm.password, "");
  assert.ok(h.events.some((event) => event[1] === "adminWorkflow.savedRefreshFailed"));
  assert.equal(await h.account.handleSaveEmployee(), false);
  assert.equal(h.called("createEmployee").length, 2);
});
test("editing preserves username and omits a new password; self password writes are refused", async (t) => {
  const h = harness(t);
  h.account.openEmployeeDialog(employee());
  await h.account.handleSaveEmployee();
  const payload = h.called("updateEmployee")[0][2];
  assert.equal(payload.password, null);
  assert.equal("username" in payload, false);
  h.account.openEmployeeDialog({ ...admin("1"), status: "ACTIVE" });
  assert.equal(h.account.editingEmployeeIsSelf.value, true);
  h.account.employeeForm.password = "Strong123!";
  h.account.employeeForm.passwordConfirm = "Strong123!";
  assert.equal(await h.account.handleSaveEmployee(), false);
  assert.equal(h.called("updateEmployee").length, 1);
});
test("self display-name edits update host identity without invalidating the session", async (t) => {
  const h = harness(t);
  h.account.openEmployeeDialog({ ...admin(), status: "ACTIVE" });
  h.account.employeeForm.displayName = "Renamed";
  h.implementations.updateEmployee = async (id, payload) => ({ ...admin(id), ...payload });
  assert.equal(await h.account.handleSaveEmployee(), true);
  assert.equal(h.user.value.displayName, "Renamed");
  assert.equal(h.called("fetchEmployees").length, 1);
});
test("late account writes do not publish messages or credentials after identity changes", async (t) => {
  const h = harness(t),
    gate = deferred();
  newForm(h.account);
  h.implementations.createEmployee = () => gate.promise;
  const task = h.account.handleSaveEmployee();
  h.user.value = admin(9);
  gate.resolve(employee());
  assert.equal(await task, false);
  assert.equal(h.account.employeeForm.password, "");
  assert.equal(h.events.filter((event) => event[0] === "success").length, 0);
});
test("password reset targets are fixed and pending confirmation cannot be repeated or closed", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.implementations.resetEmployeePassword = () => gate.promise;
  assert.equal(h.account.openResetPasswordDialog(employee("1")), false);
  h.account.openResetPasswordDialog(employee());
  const task = h.account.confirmResetPassword();
  assert.equal(h.account.closeResetPasswordDialog(), false);
  assert.equal(await h.account.confirmResetPassword(), false);
  assert.equal(h.account.openResetPasswordDialog(employee(7)), false);
  gate.resolve({ temporaryPassword: "Secret123!" });
  assert.equal(await task, true);
  assert.deepEqual(h.called("resetEmployeePassword")[0], ["resetEmployeePassword", 2]);
  assert.equal(h.account.temporaryPasswordDialog.password, "Secret123!");
  h.account.closeTemporaryPasswordDialog();
  assert.equal(h.account.temporaryPasswordDialog.password, "");
});
test("reset response without a password reports failure in the confirmation dialog", async (t) => {
  const h = harness(t);
  h.implementations.resetEmployeePassword = async () => ({});
  h.account.openResetPasswordDialog(employee());
  assert.equal(await h.account.confirmResetPassword(), false);
  assert.equal(h.account.resetPasswordDialog.open, true);
  assert.equal(h.account.temporaryPasswordDialog.open, false);
  assert.equal(h.account.resetPasswordDialog.error, "admin.employee.temporaryPasswordMissing");
});
test("role loss and scope disposal wipe visible secrets and suppress late reset completion", async (t) => {
  const h = harness(t);
  h.account.openResetPasswordDialog(employee());
  await h.account.confirmResetPassword();
  h.user.value = { ...admin(), role: "BUSINESS" };
  assert.equal(h.account.temporaryPasswordDialog.password, "");
  h.user.value = admin();
  const gate = deferred();
  h.implementations.resetEmployeePassword = () => gate.promise;
  h.account.openResetPasswordDialog(employee());
  const task = h.account.confirmResetPassword();
  h.scope.stop();
  gate.resolve({ temporaryPassword: "Late123!" });
  assert.equal(await task, false);
  assert.equal(h.account.temporaryPasswordDialog.open, false);
});
test("late clipboard completion does not mark a subsequent password as copied", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.account.openResetPasswordDialog(employee());
  await h.account.confirmResetPassword();
  h.implementations.writeClipboard = () => gate.promise;
  const task = h.account.copyTemporaryPassword();
  assert.equal(await h.account.copyTemporaryPassword(), false);
  h.account.closeTemporaryPasswordDialog();
  h.account.openResetPasswordDialog(employee(3));
  await h.account.confirmResetPassword();
  gate.resolve();
  assert.equal(await task, false);
  assert.equal(h.account.temporaryPasswordDialog.copied, false);
});
test("clipboard failure leaves a manual-copy credential visible and reports the error", async (t) => {
  const h = harness(t);
  h.account.openResetPasswordDialog(employee());
  await h.account.confirmResetPassword();
  h.implementations.writeClipboard = async () => {
    throw Error("permission");
  };
  assert.equal(await h.account.copyTemporaryPassword(), false);
  assert.equal(h.account.temporaryPasswordDialog.open, true);
  assert.ok(h.events.some((event) => event[1] === "admin.employee.copyTemporaryPasswordFailed"));
});
test("row mutations reject self, host-busy and active editor; toggles snapshot the record", async (t) => {
  const h = harness(t);
  assert.equal(await h.account.toggleEmployee(employee("1")), false);
  assert.equal(await h.account.handleDeleteEmployee(employee("1")), false);
  h.hostBusy.value = true;
  assert.equal(await h.account.toggleEmployee(employee()), false);
  h.hostBusy.value = false;
  h.account.openEmployeeDialog();
  assert.equal(await h.account.toggleEmployee(employee()), false);
  h.account.closeEmployeeDialog();
  const gate = deferred(),
    row = employee();
  h.implementations.updateEmployee = () => gate.promise;
  const task = h.account.toggleEmployee(row);
  row.id = 9;
  row.status = "DISABLED";
  gate.resolve(employee());
  assert.equal(await task, true);
  assert.equal(h.called("updateEmployee")[0][1], 2);
  assert.equal(h.called("updateEmployee")[0][2].status, "DISABLED");
});
test("delete cancellation and identity changes during confirmation never send deletion", async (t) => {
  const h = harness(t);
  h.implementations.confirmDelete = async () => false;
  assert.equal(await h.account.handleDeleteEmployee(employee()), false);
  const gate = deferred();
  h.implementations.confirmDelete = () => gate.promise;
  const task = h.account.handleDeleteEmployee(employee());
  assert.equal(await h.account.handleDeleteEmployee(employee(3)), false);
  h.user.value = admin(8);
  gate.resolve(true);
  assert.equal(await task, false);
  assert.equal(h.called("deleteEmployee").length, 0);
});
test("deleting the last row returns to the preceding page with a fixed confirmed target", async (t) => {
  const h = harness(t),
    gate = deferred(),
    row = employee();
  h.account.employees.value = [row];
  h.account.employeePage.value = 2;
  h.implementations.confirmDelete = () => gate.promise;
  const task = h.account.handleDeleteEmployee(row);
  row.id = 6;
  gate.resolve(true);
  assert.equal(await task, true);
  assert.equal(h.called("deleteEmployee")[0][1], 2);
  assert.equal(h.called("fetchEmployees")[0][1].page, 0);
});
test("LLM refresh retains unsaved drafts and accepts only the latest masked response", async (t) => {
  const h = harness(t);
  await h.llm.loadLlmSettings();
  h.llm.llmForm.model = "draft";
  h.llm.llmForm.apiKey = "secret";
  await h.llm.loadLlmSettings();
  assert.equal(h.llm.llmForm.model, "draft");
  assert.equal(h.llm.llmForm.apiKey, "secret");
  const first = deferred(),
    second = deferred();
  h.implementations.fetchLlmSettings = () => first.promise;
  const a = h.llm.loadLlmSettings();
  h.implementations.fetchLlmSettings = () => second.promise;
  const b = h.llm.loadLlmSettings();
  second.resolve({ ...settings("new"), apiKey: "must-not-retain" });
  await b;
  first.resolve(settings("old"));
  assert.equal(await a, false);
  assert.equal(h.llm.llmSettings.value.model, "new");
  assert.equal("apiKey" in h.llm.llmSettings.value, false);
});
test("LLM edits during initial read are preserved", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.implementations.fetchLlmSettings = () => gate.promise;
  const task = h.llm.loadLlmSettings();
  h.llm.llmForm.baseUrl = "http://internal.example";
  gate.resolve(settings());
  await task;
  assert.equal(h.llm.llmForm.baseUrl, "http://internal.example");
});
test("LLM writes snapshot payload, omit an empty key, and reject conflicting key actions", async (t) => {
  const h = harness(t);
  await h.llm.loadLlmSettings();
  await h.llm.handleUpdateLlmSettings();
  assert.equal("apiKey" in h.called("updateLlmSettings")[0][1], false);
  h.llm.llmForm.apiKey = "replacement";
  h.llm.llmForm.clearApiKey = true;
  assert.equal(await h.llm.handleUpdateLlmSettings(), false);
  assert.equal(h.called("updateLlmSettings").length, 1);
  assert.ok(h.events.some((event) => event[1] === "adminWorkflow.llmKeyConflict"));
});
test("LLM save keeps newer edits while clearing only the submitted key", async (t) => {
  const h = harness(t),
    gate = deferred();
  await h.llm.loadLlmSettings();
  h.llm.llmForm.apiKey = "first-key";
  h.implementations.updateLlmSettings = () => gate.promise;
  const task = h.llm.handleUpdateLlmSettings();
  assert.equal(await h.llm.handleUpdateLlmSettings(), false);
  h.llm.llmForm.model = "new-draft";
  gate.resolve(settings());
  assert.equal(await task, true);
  assert.equal(h.llm.llmForm.model, "new-draft");
  assert.equal(h.llm.llmForm.apiKey, "");
  assert.equal(h.llm.dirty.value, true);
  const second = deferred();
  h.implementations.updateLlmSettings = () => second.promise;
  h.llm.llmForm.apiKey = "second-key";
  const saving = h.llm.handleUpdateLlmSettings();
  h.llm.llmForm.apiKey = "third-key";
  second.resolve(settings());
  await saving;
  assert.equal(h.llm.llmForm.apiKey, "third-key");
});
test("LLM failures retain retryable drafts; account changes wipe them and ignore late responses", async (t) => {
  const h = harness(t);
  h.llm.llmForm.apiKey = "key";
  h.implementations.updateLlmSettings = async () => {
    throw Error("denied");
  };
  assert.equal(await h.llm.handleUpdateLlmSettings(), false);
  assert.equal(h.llm.llmForm.apiKey, "key");
  const gate = deferred();
  h.implementations.updateLlmSettings = () => gate.promise;
  const task = h.llm.handleUpdateLlmSettings();
  h.user.value = admin(8);
  h.user.value = admin();
  gate.resolve(settings());
  assert.equal(await task, false);
  assert.equal(h.llm.llmForm.apiKey, "");
  assert.equal(h.llm.llmSettings.value, null);
  assert.equal(h.llm.busy.value, false);
});
test("late read errors after disposal stay silent; active read errors reach the host", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.implementations.fetchLlmSettings = () => gate.promise;
  const task = h.llm.loadLlmSettings();
  h.scope.stop();
  gate.reject(Error("offline"));
  assert.equal(await task, false);
  const other = harness(t);
  other.implementations.fetchEmployees = async () => {
    throw Error("offline");
  };
  await assert.rejects(other.account.loadEmployeePage(), /offline/);
  assert.equal(other.account.busy.value, false);
});

test("composed account and settings workflows exclude concurrent mutations", async (t) => {
  const h = harness(t),
    accountGate = deferred();
  newForm(h.account);
  h.implementations.createEmployee = () => accountGate.promise;
  const create = h.account.handleSaveEmployee();
  assert.equal(await h.llm.handleUpdateLlmSettings(), false);
  accountGate.resolve(employee());
  assert.equal(await create, true);
  const settingsGate = deferred();
  h.implementations.updateLlmSettings = () => settingsGate.promise;
  const save = h.llm.handleUpdateLlmSettings();
  assert.equal(h.account.openEmployeeDialog(), false);
  assert.equal(await h.account.toggleEmployee(employee()), false);
  settingsGate.resolve(settings());
  assert.equal(await save, true);
});

test("refresh cannot overwrite a settings write that is still pending", async (t) => {
  const h = harness(t),
    gate = deferred();
  h.implementations.updateLlmSettings = () => gate.promise;
  const save = h.llm.handleUpdateLlmSettings();
  assert.equal(await h.llm.loadLlmSettings(), false);
  assert.equal(h.called("fetchLlmSettings").length, 0);
  gate.resolve(settings("saved"));
  assert.equal(await save, true);
  assert.equal(h.llm.llmSettings.value.model, "saved");
});

test("zero account ids remain edits, preserve usernames and retain self protection", async (t) => {
  const h = harness(t);
  assert.equal(h.account.openEmployeeDialog(employee(0)), true);
  assert.equal(h.account.editingEmployeeId.value, 0);
  assert.equal(await h.account.handleSaveEmployee(), true);
  assert.equal(h.called("createEmployee").length, 0);
  assert.equal(h.called("updateEmployee")[0][1], 0);
  assert.equal("username" in h.called("updateEmployee")[0][2], false);
  h.user.value = admin(0);
  h.account.openEmployeeDialog(employee("0"));
  assert.equal(h.account.editingEmployeeIsSelf.value, true);
  assert.equal(h.account.openResetPasswordDialog(employee(0)), false);
  h.account.closeEmployeeDialog();
  assert.equal(await h.account.toggleEmployee(employee(0)), false);
  assert.equal(await h.account.handleDeleteEmployee(employee(0)), false);
});

test("LLM key replacement and removal clear submitted credentials and retain only masked responses", async (t) => {
  const h = harness(t);
  await h.llm.loadLlmSettings();
  h.llm.llmForm.apiKey = "Replacement123!";
  h.implementations.updateLlmSettings = async () => ({
    ...settings(),
    apiKey: "RAW-SERVER-KEY",
    apiKeyPreview: undefined
  });
  assert.equal(await h.llm.handleUpdateLlmSettings(), true);
  assert.equal(h.calls.at(-1)[1].apiKey, "Replacement123!");
  assert.equal(h.llm.llmForm.apiKey, "");
  assert.equal(h.llm.dirty.value, false);
  assert.equal("apiKey" in h.llm.llmSettings.value, false);
  assert.equal(h.llm.llmSettings.value.apiKeyConfigured, true);
  h.llm.llmForm.clearApiKey = true;
  h.implementations.updateLlmSettings = async () => ({
    ...settings(),
    apiKeyConfigured: false,
    apiKeyPreview: undefined,
    apiKey: ""
  });
  assert.equal(await h.llm.handleUpdateLlmSettings(), true);
  assert.equal(h.calls.at(-1)[1].clearApiKey, true);
  assert.equal("apiKey" in h.calls.at(-1)[1], false);
  assert.equal(h.llm.llmForm.clearApiKey, false);
  assert.equal(h.llm.dirty.value, false);
  assert.equal(h.llm.llmSettings.value.apiKeyConfigured, false);
  assert.equal("apiKey" in h.llm.llmSettings.value, false);
});

test("LLM dirty state recomputes after saving an already-rendered non-secret draft", async (t) => {
  const h = harness(t);
  assert.equal(h.llm.dirty.value, false);
  await h.llm.loadLlmSettings();
  assert.equal(h.llm.dirty.value, false);
  h.llm.llmForm.model = "saved-model";
  assert.equal(h.llm.dirty.value, true);
  h.implementations.updateLlmSettings = async (payload) => ({
    ...settings(payload.model),
    enabled: payload.enabled
  });
  assert.equal(await h.llm.handleUpdateLlmSettings(), true);
  assert.equal(h.llm.dirty.value, false);
  h.llm.llmForm.enabled = false;
  assert.equal(h.llm.dirty.value, true);
  assert.equal(await h.llm.handleUpdateLlmSettings(), true);
  assert.equal(h.llm.dirty.value, false);
});
