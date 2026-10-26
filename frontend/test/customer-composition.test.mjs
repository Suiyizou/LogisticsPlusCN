import assert from "node:assert/strict";
import test from "node:test";
import { nextTick } from "vue";
import { customer, deferred, harness } from "./customer-workspace.fixture.mjs";

test("composed customer create shares the directory lock with agents, import and handover", async (context) => {
  const pending = deferred(),
    h = harness(context, { createBusinessCustomer: () => pending.promise }),
    forms = h.workspace.forms;
  forms.openCreateCustomer();
  Object.assign(forms.createForm, {
    displayName: "New Customer",
    username: "new-customer",
    password: "TestPass123",
    userCode: "NEW123",
    partyRole: "SHIPPER"
  });
  const submitting = forms.submitCustomerForm();
  assert.equal(h.workspace.directory.customerWriteBusy.value, true);
  h.agents.openAgentCreateDialog();
  h.importing.openBatchImport();
  await h.handover.openCustomerTransfer(customer);
  assert.equal(h.agents.agentCreateDialogOpen.value, false);
  assert.equal(h.importing.batchImportDialogOpen.value, false);
  assert.equal(h.handover.transferDialogOpen.value, false);
  pending.resolve({ customer: { ...customer, id: "new" } });
  await submitting;
  assert.equal(h.workspace.directory.customerWriteBusy.value, false);
  assert.equal(h.refreshed.length, 0);
  h.agents.openAgentCreateDialog();
  assert.equal(h.agents.agentCreateDialogOpen.value, true);
});
test("agent creation in composed scope blocks customer writes and releases the same lock after refresh", async (context) => {
  const pending = deferred(),
    h = harness(context, { createOverseaAgentEmployee: () => pending.promise });
  h.agents.openAgentCreateDialog();
  Object.assign(h.agents.agentCreateForm, {
    displayName: "Agent",
    username: "agent-a",
    password: "TestPass123"
  });
  const submitting = h.agents.submitAgentCreate();
  assert.equal(h.workspace.directory.customerWriteBusy.value, true);
  h.workspace.forms.openCreateCustomer();
  assert.equal(h.workspace.forms.createDialogOpen.value, false);
  pending.resolve({ id: 41 });
  await submitting;
  assert.equal(h.workspace.directory.customerWriteBusy.value, false);
  h.workspace.forms.openCreateCustomer();
  assert.equal(h.workspace.forms.createDialogOpen.value, true);
});
test("customer reset feeds the shared credential session and permission loss clears it", async (context) => {
  const h = harness(context, {
    resetBusinessCustomerPassword: async () => ({ password: "TestPass123" })
  });
  await h.workspace.directory.loadCustomers("A", { selectFirst: true });
  await nextTick();
  h.workspace.forms.openResetPassword(customer);
  await h.workspace.forms.resetPassword();
  assert.equal(h.credentials.passwordResetResult.open, true);
  assert.equal(h.credentials.passwordResetResult.username, customer.username);
  h.canManage.value = false;
  await nextTick();
  assert.equal(h.credentials.passwordResetResult.password, "");
  assert.equal(h.credentials.passwordResetResult.open, false);
});
test("composition scope disposal invalidates pending agent creation and wipes credentials", async (context) => {
  const pending = deferred(),
    h = harness(context, { createOverseaAgentEmployee: () => pending.promise });
  h.credentials.openPasswordResetResult("fixture", "TestPass123");
  h.agents.openAgentCreateDialog();
  Object.assign(h.agents.agentCreateForm, {
    displayName: "Agent",
    username: "agent-a",
    password: "TestPass123"
  });
  const submitting = h.agents.submitAgentCreate();
  h.scope.stop();
  pending.resolve({ id: 41 });
  await submitting;
  assert.equal(h.credentials.passwordResetResult.password, "");
  assert.equal(h.agents.agentCreateForm.password, "");
  assert.equal(h.notices.length, 0);
});
test("handover composes the same directory, receivers and shipment refresh command", async (context) => {
  let payload;
  const h = harness(context, {
    fetchBusinessHandoverAgents: async () => ({
      items: [{ id: 51, status: "ACTIVE", displayName: "Receiver" }]
    }),
    handoverBusinessCustomers: async (body) => {
      payload = body;
      return { requestId: 1 };
    },
    fetchBusinessCustomers: async () => ({ items: [] })
  });
  h.workspace.directory.customers.value = [{ ...customer }];
  await h.handover.loadBusinessHandoverAgents();
  h.handover.openBusinessHandover({ id: 51 });
  Object.assign(h.handover.businessHandoverForm, {
    customerIds: ["A"],
    reason: "Transfer fixture"
  });
  await h.handover.submitBusinessHandover();
  assert.deepEqual(payload, {
    customerIds: ["A"],
    targetBusinessUserId: 51,
    reason: "Transfer fixture"
  });
  assert.equal(h.workspace.directory.customers.value.length, 0);
  assert.equal(h.refreshed.length, 1);
  assert.equal(h.workspace.directory.customerWriteBusy.value, false);
});
