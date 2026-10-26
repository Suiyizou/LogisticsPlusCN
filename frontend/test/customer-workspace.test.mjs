import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import { useCustomerDirectory } from "../src/features/customers/useCustomerDirectory.js";
import { createI18n } from "vue-i18n";
import { messages } from "../src/i18n/messages.js";
import { useCustomerForms } from "../src/features/customers/useCustomerForms.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
}
const customer = (id, partyRole = "SHIPPER") => ({
  id,
  username: `user-${id}`,
  displayName: `Customer ${id}`,
  clientCode: `code-${id}`,
  partyRole,
  status: "ACTIVE",
  shipmentCount: 1
});
function harness(t) {
  const queues = Object.fromEntries(
    ["directory", "shipments", "links", "saveLinks", "create", "update", "delete", "password"].map(
      (key) => [key, []]
    )
  );
  const collect =
    (name) =>
    (...args) => {
      const pending = deferred();
      queues[name].push({ args: structuredClone(args), ...pending });
      return pending.promise;
    };
  const notices = [],
    passwords = [];
  let shipmentReloads = 0;
  let confirmed = true;
  const scope = effectScope();
  const canManage = ref(true);
  const dependencies = {
    canManage,
    clearMessage() {},
    showError: (error, key) => notices.push({ error, key }),
    showSuccess: (key, params) => notices.push({ key, params }),
    t: (key, params) => `${key}${params ? JSON.stringify(params) : ""}`
  };
  const directory = scope.run(() =>
    useCustomerDirectory({
      ...dependencies,
      fetchBusinessCustomers: collect("directory"),
      fetchBusinessCustomerShipments: collect("shipments"),
      fetchOverseaAgentLinkedCustomers: collect("links"),
      updateOverseaAgentLinkedCustomers: collect("saveLinks")
    })
  );
  directory.customers.value = [customer("A"), customer("B"), customer("O", "OVERSEA_AGENT")];
  const forms = scope.run(() =>
    useCustomerForms({
      ...dependencies,
      directory,
      createBusinessCustomer: collect("create"),
      updateBusinessCustomer: collect("update"),
      deleteBusinessCustomer: collect("delete"),
      resetBusinessCustomerPassword: collect("password"),
      loadAvailableShipments: async () => {
        shipmentReloads++;
      },
      openPasswordResetResult: (...args) => passwords.push(args),
      confirm: () => confirmed
    })
  );
  t.after(() => scope.stop());
  return {
    directory,
    forms,
    scope,
    canManage,
    queues,
    notices,
    passwords,
    shipmentReloads: () => shipmentReloads,
    decline: () => {
      confirmed = false;
    }
  };
}

test("directory search covers account, code and responsible operator and bounds pages", async (t) => {
  const { directory: d } = harness(t);
  d.customers.value = Array.from({ length: 25 }, (_, index) => ({
    ...customer(String(index)),
    responsibleAgentDisplayName: index === 4 ? "Operator Z" : ""
  }));
  d.customerPage.value = 3;
  assert.equal(d.paginatedCustomers.value.length, 5);
  assert.equal(d.customerRowIndex(0), 21);
  d.customerSearch.value = " OPERATOR z ";
  await flush();
  assert.equal(d.customerPage.value, 1);
  assert.equal(d.paginatedCustomers.value[0].id, "4");
  d.customerSearch.value = "CODE-18";
  await flush();
  assert.equal(d.filteredCustomers.value[0].id, "18");
  d.customerSearch.value = "missing";
  await flush();
  assert.deepEqual(d.paginatedCustomers.value, []);
  assert.equal(d.customerPage.value, 1);
});

test("switching customers clears old resources immediately and rejects both late responses", async (t) => {
  const { directory: d, queues: q, notices } = harness(t);
  const first = d.selectCustomer("O");
  q.shipments[0].resolve({ items: [{ shipmentId: "O-1" }] });
  q.links[0].resolve({ items: [{ id: "A" }] });
  await first;
  assert.equal(d.shipments.value[0].shipmentId, "O-1");
  const old = d.selectCustomer("O");
  const current = d.selectCustomer("B");
  assert.deepEqual(d.shipments.value, []);
  assert.deepEqual(d.linkedCustomerIds.value, []);
  assert.equal(d.loadingLinkedCustomers.value, false);
  q.shipments[1].resolve({ items: [{ shipmentId: "old-O" }] });
  q.links[1].reject(new Error("old link failure"));
  await old;
  assert.equal(d.loadingShipments.value, true);
  assert.equal(notices.length, 0);
  q.shipments[2].resolve({ items: [{ shipmentId: "B-1" }] });
  await current;
  assert.equal(d.shipments.value[0].shipmentId, "B-1");
});

test("newest directory response wins, while unknown preferred IDs never select an unrelated customer", async (t) => {
  const { directory: d, queues: q } = harness(t);
  const old = d.loadCustomers("", { selectFirst: false });
  const current = d.loadCustomers("missing");
  q.directory[1].resolve({ items: [customer("B")] });
  assert.equal(await current, true);
  q.directory[0].resolve({ items: [customer("A")] });
  assert.equal(await old, false);
  assert.equal(d.customers.value[0].id, "B");
  assert.equal(d.selectedCustomerId.value, "");
  assert.equal(q.shipments.length, 0);
});

test("directory navigation guard prevents late selection and handles current load failures", async (t) => {
  const { directory: d, queues: q, notices } = harness(t);
  let valid = true;
  const old = d.loadCustomers("A", { isCurrent: () => valid });
  valid = false;
  q.directory[0].resolve({ items: [customer("Z")] });
  await old;
  assert.equal(d.customers.value[0].id, "A");
  assert.equal(d.loadingCustomers.value, false);
  const failed = d.loadCustomers();
  q.directory[1].reject(new Error("offline"));
  await failed;
  assert.equal(notices[0].key, "customers.loadFailed");
  assert.equal(d.customersLoaded.value, false);
});

test("directory refresh returns incomplete when selected customer ticket refresh fails", async (t) => {
  const { directory: d, queues: q, notices } = harness(t);
  d.selectedCustomerId.value = "A";
  const refresh = d.loadCustomers("", { selectFirst: false });
  q.directory[0].resolve({ items: [customer("A")] });
  await flush();
  q.shipments[0].reject(Error("ticket read failed"));
  assert.equal(await refresh, false);
  assert.equal(d.selectedCustomerId.value, "A");
  assert.equal(notices.at(-1).key, "customers.loadShipmentsFailed");
  const retry = d.selectCustomer("A");
  q.shipments[1].resolve({ items: [{ shipmentId: "S1" }] });
  assert.equal(await retry, true);
});

test("unmount ignores directory, shipment and linked-customer responses without follow-up requests", async (t) => {
  const { directory: d, scope, queues: q, notices } = harness(t);
  const loaded = d.loadCustomers("A");
  const selected = d.selectCustomer("O");
  scope.stop();
  q.directory[0].resolve({ items: [customer("Z")] });
  q.shipments[0].resolve({ items: [{ shipmentId: "late" }] });
  q.links[0].reject(new Error("late"));
  await Promise.all([loaded, selected]);
  assert.equal(d.customers.value[0].id, "A");
  assert.deepEqual(d.shipments.value, []);
  assert.equal(notices.length, 0);
  await d.selectCustomer("B");
  assert.equal(q.shipments.length, 1);
});

test("linked-customer saves capture the selected IDs, remain mutually exclusive and cannot update another customer", async (t) => {
  const { directory: d, queues: q, notices } = harness(t);
  d.selectedCustomerId.value = "O";
  d.linkedCustomerIds.value = ["A"];
  const save = d.saveLinkedCustomers();
  d.linkedCustomerIds.value = ["B"];
  await d.saveLinkedCustomers();
  assert.deepEqual(q.saveLinks[0].args, ["O", ["A"]]);
  assert.equal(q.saveLinks.length, 1);
  d.selectedCustomerId.value = "B";
  q.saveLinks[0].resolve({ items: [{ id: "A" }] });
  await save;
  assert.deepEqual(d.linkedCustomerIds.value, []);
  assert.equal(d.savingLinkedCustomers.value, false);
  assert.equal(notices.length, 0);
});

test("role changes clear the agent link state and pending link reads cannot restore it", async (t) => {
  const { directory: d, queues: q } = harness(t);
  d.selectedCustomerId.value = "O";
  const read = d.loadLinkedCustomers("O");
  d.replaceCustomer({ id: "O", partyRole: "SHIPPER" });
  q.links[0].resolve({ items: [{ id: "A" }] });
  await read;
  assert.deepEqual(d.linkedCustomerIds.value, []);
  assert.equal(d.loadingLinkedCustomers.value, false);
});

test("profile refresh retains unsaved fields but switching customers initializes a clean form", async (t) => {
  const { directory: d, forms: f } = harness(t);
  d.selectedCustomerId.value = "A";
  f.editForm.displayName = "Unsaved name";
  d.replaceCustomer({ id: "A", displayName: "Server name", clientCode: "new-code" });
  assert.equal(f.editForm.displayName, "Unsaved name");
  assert.equal(f.editForm.clientCode, "code-A");
  d.selectedCustomerId.value = "B";
  assert.equal(f.editForm.displayName, "Customer B");
  assert.equal(f.editForm.clientCode, "code-B");
});

test("customer editing sends the established payload without the create-only password", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  f.openEditCustomer(d.customers.value[0]);
  f.createForm.displayName = "Edited";
  f.createForm.password = "MustNotSend";
  f.createForm.remark = "note";
  const saving = f.submitCustomerForm();
  f.closeCreateDialog();
  f.openEditCustomer(d.customers.value[1]);
  await f.submitCustomerForm();
  assert.equal(f.createDialogOpen.value, true);
  assert.equal(q.update.length, 1);
  assert.deepEqual(q.update[0].args, [
    "A",
    {
      username: "user-A",
      displayName: "Edited",
      partyRole: "SHIPPER",
      clientCode: "code-A",
      contactEmail: "",
      remark: "note"
    }
  ]);
  q.update[0].resolve({ customer: { ...customer("A"), displayName: "Edited" } });
  await saving;
  assert.equal(f.createDialogOpen.value, false);
  assert.equal(f.createForm.password, "");
  assert.equal(f.isEditMode.value, false);
});

test("create stays locked through directory refresh and links the returned customer ID", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  f.openCreateCustomer();
  Object.assign(f.createForm, {
    username: "new-user",
    displayName: "New",
    password: "Strong123",
    userCode: "new-01"
  });
  const saving = f.submitCustomerForm();
  assert.equal(q.create[0].args[0].password, "Strong123");
  q.create[0].resolve({ customer: customer("N") });
  await flush();
  f.openCreateCustomer();
  await f.submitCustomerForm();
  assert.equal(f.createDialogOpen.value, false);
  assert.equal(f.creating.value, true);
  assert.equal(q.create.length, 1);
  q.directory[0].resolve({ items: [customer("N")] });
  await flush();
  q.shipments[0].resolve({ items: [] });
  await saving;
  assert.equal(d.selectedCustomerId.value, "N");
  assert.equal(f.creating.value, false);
});

test("failed customer form submission retains fields and can be retried", async (t) => {
  const { forms: f, queues: q, notices } = harness(t);
  f.openCreateCustomer();
  f.createForm.displayName = "Keep me";
  const failed = f.submitCustomerForm();
  q.create[0].reject(new Error("duplicate"));
  await failed;
  assert.equal(f.createDialogOpen.value, true);
  assert.equal(f.createForm.displayName, "Keep me");
  assert.equal(f.creating.value, false);
  assert.equal(notices[0].key, "customers.createFailed");
});

test("selected profile save captures customer A and never overwrites or notifies customer B", async (t) => {
  const { directory: d, forms: f, queues: q, notices } = harness(t);
  d.selectedCustomerId.value = "A";
  f.editForm.displayName = "A update";
  const saving = f.saveCustomer();
  d.selectedCustomerId.value = "B";
  q.update[0].resolve({ customer: { ...customer("A"), displayName: "A update" } });
  await saving;
  assert.equal(q.update[0].args[0], "A");
  assert.equal(f.editForm.displayName, "Customer B");
  assert.equal(d.customers.value[0].displayName, "A update");
  assert.equal(notices.length, 0);
  assert.equal(f.mutatingCustomer.value, false);
});

test("all customer writes share a gate and confirmation refusal sends no request", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  d.selectedCustomerId.value = "A";
  const saving = f.saveCustomer();
  await f.deactivateCustomer();
  await f.deleteCustomerRow(d.selectedCustomer.value);
  await f.toggleCustomerStatus(d.selectedCustomer.value);
  f.openCreateCustomer();
  assert.equal(q.update.length, 1);
  assert.equal(q.delete.length, 0);
  assert.equal(f.createDialogOpen.value, false);
  q.update[0].resolve(customer("A"));
  await saving;
  const other = harness(t);
  other.decline();
  await other.forms.deleteCustomerRow(other.directory.customers.value[0]);
  assert.equal(other.queues.delete.length, 0);
});

test("partial bulk deletion waits for every result, reconciles success and retains failed row selection", async (t) => {
  const h = harness(t),
    { directory: d, forms: f, queues: q, notices } = h;
  d.selectedCustomerId.value = "A";
  d.selectedCustomerRows.value = d.customers.value.slice(0, 2);
  const removing = f.deleteSelectedCustomers();
  q.delete[1].reject(new Error("denied B"));
  await flush();
  assert.equal(f.mutatingCustomer.value, true);
  assert.equal(q.directory.length, 0);
  q.delete[0].resolve({});
  await flush();
  assert.equal(d.selectedCustomerId.value, "");
  assert.equal(
    d.customers.value.some((item) => item.id === "A"),
    false
  );
  q.directory[0].resolve({ items: [customer("B"), customer("O", "OVERSEA_AGENT")] });
  await removing;
  assert.deepEqual(
    d.selectedCustomerRows.value.map((item) => item.id),
    ["B"]
  );
  assert.equal(h.shipmentReloads(), 1);
  assert.match(notices.at(-1).error.message, /customerDeletePartial.*"succeeded":1.*"failed":1/);
  assert.equal(f.mutatingCustomer.value, false);
});

test("complete deletion failure keeps customers and avoids unnecessary directory reload", async (t) => {
  const { directory: d, forms: f, queues: q, notices } = harness(t);
  const removing = f.deleteCustomerRow(d.customers.value[0]);
  q.delete[0].reject(new Error("denied"));
  await removing;
  assert.equal(d.customers.value.length, 3);
  assert.equal(q.directory.length, 0);
  assert.equal(notices[0].key, "customers.deleteCustomerFailed");
});

test("switching customer closes sensitive dialogs and ignores a late password reset result", async (t) => {
  const { directory: d, forms: f, queues: q, passwords } = harness(t);
  f.openResetPassword(d.customers.value[0]);
  const saving = f.resetPassword();
  assert.deepEqual(q.password[0].args, ["A", "user-A!@#2026"]);
  d.selectedCustomerId.value = "B";
  assert.equal(f.resetPasswordDialogOpen.value, false);
  q.password[0].resolve({});
  await saving;
  assert.equal(passwords.length, 0);
});

test("client-code supplementation captures the target and cannot close a new customer's dialog", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  d.selectedCustomerId.value = "A";
  f.openClientCodeSupplement();
  f.clientCodeSupplement.value = "updated-code";
  const saving = f.saveClientCodeSupplement();
  d.selectedCustomerId.value = "B";
  assert.equal(f.clientCodeDialogOpen.value, false);
  q.update[0].resolve({ id: "A", clientCode: "updated-code" });
  await saving;
  assert.equal(d.selectedCustomer.value.clientCode, "code-B");
});

test("manager-only forms and linked writes reject direct invocation by an overseas agent", async (t) => {
  const { directory: d, forms: f, canManage, queues: q } = harness(t);
  canManage.value = false;
  d.selectedCustomerId.value = "O";
  f.openCreateCustomer();
  f.openEditCustomer(d.customers.value[0]);
  f.openResetPassword(d.customers.value[0]);
  await f.saveCustomer();
  await f.submitCustomerForm();
  await f.deleteCustomerRow(d.customers.value[0]);
  await d.saveLinkedCustomers();
  assert.equal(f.createDialogOpen.value, false);
  assert.equal(
    q.create.length + q.update.length + q.delete.length + q.password.length + q.saveLinks.length,
    0
  );
});

test("disposing forms clears create passwords and ignores successful late writes", async (t) => {
  const { directory: d, forms: f, scope, queues: q, notices } = harness(t);
  f.openEditCustomer(d.customers.value[0]);
  f.createForm.password = "sensitive";
  const saving = f.submitCustomerForm();
  scope.stop();
  assert.equal(f.createForm.password, "");
  q.update[0].resolve({ id: "A", displayName: "late" });
  await saving;
  assert.equal(d.customers.value[0].displayName, "Customer A");
  assert.equal(notices.length, 0);
});

test("profile and linked-customer writes share a mutual exclusion gate in both directions", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  d.selectedCustomerId.value = "O";
  const links = d.saveLinkedCustomers();
  await f.saveCustomer();
  assert.equal(q.update.length, 0);
  q.saveLinks[0].resolve({ items: [] });
  await links;
  const profile = f.saveCustomer();
  await d.saveLinkedCustomers();
  assert.equal(q.saveLinks.length, 1);
  q.update[0].resolve({ id: "O", partyRole: "SHIPPER" });
  await profile;
  assert.equal(d.customerWriteBusy.value, false);
});

test("a profile write invalidates older directory reads before they can restore obsolete data", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  d.selectedCustomerId.value = "A";
  const read = d.loadCustomers("A");
  f.editForm.displayName = "Saved name";
  const save = f.saveCustomer();
  q.update[0].resolve({ id: "A", displayName: "Saved name" });
  await save;
  q.directory[0].resolve({ items: [customer("A")] });
  assert.equal(await read, false);
  assert.equal(d.selectedCustomer.value.displayName, "Saved name");
  assert.equal(d.loadingCustomers.value, false);
  assert.equal(q.shipments.length, 0);
});

test("current password reset failures retain the dialog and a successful retry shows the captured credentials", async (t) => {
  const { directory: d, forms: f, queues: q, passwords, notices } = harness(t);
  f.openResetPassword(d.customers.value[0]);
  const first = f.resetPassword();
  q.password[0].reject(new Error("denied"));
  await first;
  assert.equal(f.resetPasswordDialogOpen.value, true);
  assert.equal(f.mutatingCustomer.value, false);
  assert.equal(d.customerWriteBusy.value, false);
  assert.equal(notices[0].key, "customers.passwordResetFailed");
  const retry = f.resetPassword();
  q.password[1].resolve({});
  await retry;
  assert.equal(f.resetPasswordDialogOpen.value, false);
  assert.deepEqual(passwords, [["user-A", "user-A!@#2026"]]);
});

test("preferred customer reload cannot reselect A after the user has moved to B", async (t) => {
  const { directory: d, queues: q } = harness(t);
  d.selectedCustomerId.value = "A";
  const reload = d.loadCustomers("A");
  d.selectedCustomerId.value = "B";
  q.directory[0].resolve({ items: [customer("A"), customer("B")] });
  await flush();
  assert.equal(d.selectedCustomerId.value, "B");
  assert.equal(q.shipments[0].args[0], "B");
  q.shipments[0].resolve({ items: [{ shipmentId: "B-1" }] });
  await reload;
  assert.equal(d.shipments.value[0].shipmentId, "B-1");
});

test("client code modal cannot close during its write and clears its draft on a later dismissal", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  d.selectedCustomerId.value = "A";
  f.openClientCodeSupplement();
  f.clientCodeSupplement.value = "CUSTOM-A";
  const pending = f.saveClientCodeSupplement();
  f.closeClientCodeSupplement();
  assert.equal(f.clientCodeDialogOpen.value, true);
  assert.equal(f.clientCodeSupplement.value, "CUSTOM-A");
  assert.deepEqual(q.update[0].args, ["A", { clientCode: "CUSTOM-A" }]);
  q.update[0].reject(new Error("retry later"));
  await pending;
  assert.equal(f.clientCodeDialogOpen.value, true);
  f.closeClientCodeSupplement();
  assert.equal(f.clientCodeDialogOpen.value, false);
  assert.equal(f.clientCodeSupplement.value, "");
});

test("email follows the selected customer and explicit clearing remains in the write payload", async (t) => {
  const { directory: d, forms: f, queues: q } = harness(t);
  d.customers.value[0].contactEmail = "client@example.com";
  f.openEditCustomer(d.customers.value[0]);
  assert.equal(f.createForm.contactEmail, "client@example.com");
  f.createForm.contactEmail = "";
  f.createForm.remark = "";
  const saving = f.submitCustomerForm();
  assert.equal(q.update[0].args[1].contactEmail, "");
  assert.equal(q.update[0].args[1].remark, "");
  q.update[0].resolve({ ...customer("A"), contactEmail: null, remark: null });
  await saving;
  assert.equal(d.customers.value[0].contactEmail, null);
});

test("real bilingual email copy compiles and displays literal at signs", () => {
  for (const locale of ["zh-CN", "en-US"]) {
    const i18n = createI18n({ legacy: false, locale, messages });
    assert.ok(i18n.global.t("customers.contactEmailPlaceholder").includes("logistics@example.com"));
  }
});
