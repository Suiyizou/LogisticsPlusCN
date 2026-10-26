import assert from "node:assert/strict";
import test from "node:test";
import { nextTick, ref, toRaw } from "vue";
import {
  createCustomerModulePages,
  useCustomerShipmentAccess
} from "../src/modules/customers/index.js";
import { createAgentModulePages } from "../src/modules/agents/index.js";
import { createHandoverModulePages } from "../src/modules/handover/index.js";
import { customer, deferred, harness } from "./customer-workspace.fixture.mjs";

function pages(context, overrides = {}) {
  const h = harness(context, overrides),
    calls = [],
    available = ref([]);
  const bindings = h.scope.run(() =>
    useCustomerShipmentAccess({
      directory: h.workspace.directory,
      availableShipments: available,
      canManage: h.canManage,
      services: { bind: async (...args) => calls.push(args) },
      commands: {
        refreshShipmentRelations: async () => {
          h.refreshed.push(true);
        }
      },
      clearMessage: () => {},
      showSuccess: () => {},
      showError: (error) => {
        throw error;
      },
      t: (key) => key
    })
  );
  const ui = { tablePageTransitioning: ref(false) },
    view = ref("list");
  const customerPorts = {
    operations: h,
    bindings,
    view,
    permissions: { isManager: h.canManage },
    ui,
    shipmentOperations: {
      entry: { entryBusy: ref(false), openShipmentCreateDialog: () => {} },
      list: {
        loadingAvailableShipments: ref(false),
        shipmentPage: ref(1),
        shipmentPageSize: ref(20),
        shipmentTotal: ref(0),
        changeShipmentPage: () => {},
        loadAvailableShipments: () => {}
      }
    },
    actions: {
      selectCustomerFromList: (id) => h.workspace.directory.selectCustomer(id),
      navigateTo: () => {},
      openShipmentDetail: () => {},
      openShipmentSupplement: () => {}
    },
    formatters: {}
  };
  const customers = createCustomerModulePages(customerPorts);
  const agents = createAgentModulePages({ operations: h, formatters: {}, ui });
  const handover = createHandoverModulePages({ operations: h, formatters: {}, permissions: h });
  return { ...h, customers, agents, handover, customerPorts, available, bindings, calls, ui, view };
}

test("customer page filters, selection, view and table handles use the live directory", async (context) => {
  const h = pages(context),
    directory = h.workspace.directory;
  await directory.loadCustomers("A", { selectFirst: true });
  h.customers.directory.state.customerSearch = "no match";
  assert.equal(directory.filteredCustomers.value.length, 0);
  directory.customerSearch.value = "Customer A";
  assert.equal(h.customers.directory.state.paginatedCustomers[0].id, "A");
  h.customers.directory.actions.handleCustomerSelectionChange([customer]);
  assert.deepEqual(
    directory.selectedCustomerRows.value.map((c) => c.id),
    ["A"]
  );
  const table = { clearSelection() {} };
  h.customers.directory.actions.setTableRef(table);
  assert.equal(toRaw(directory.customerTableRef.value), table);
  h.view.value = "detail";
  h.ui.tablePageTransitioning.value = true;
  assert.equal(h.customers.view.value, "detail");
  assert.equal(h.customers.directory.state.tablePageTransitioning, true);
  assert.equal(h.customers.detail.state.selectedCustomer.id, "A");
});

test("customer page submission blocks agent and handover pages until the shared write finishes", async (context) => {
  const pending = deferred(),
    h = pages(context, { createBusinessCustomer: () => pending.promise });
  h.customers.directory.actions.openCreateCustomer();
  Object.assign(h.customers.formDialog.state.createForm, {
    displayName: "New",
    username: "new-user",
    password: "TestPass123",
    userCode: "NEW123",
    partyRole: "SHIPPER"
  });
  const submitting = h.customers.formDialog.actions.submitCustomerForm();
  assert.equal(h.customers.formDialog.state.creating, true);
  assert.equal(h.agents.page.state.agentWriteBusy, true);
  assert.equal(h.handover.page.state.handoverWriteBusy, true);
  h.customers.formDialog.actions.closeCreateDialog();
  h.agents.page.actions.openAgentCreateDialog();
  await h.customers.directory.actions.openCustomerTransfer(customer);
  assert.equal(h.customers.formDialog.state.createDialogOpen, true);
  assert.equal(h.agents.createDialog.state.agentCreateDialogOpen, false);
  assert.equal(h.handover.transferDialog.state.transferDialogOpen, false);
  pending.resolve({ customer: { ...customer, id: "new" } });
  await submitting;
  assert.equal(h.handover.page.state.handoverWriteBusy, false);
  h.agents.page.actions.openAgentCreateDialog();
  assert.equal(h.agents.createDialog.state.agentCreateDialogOpen, true);
});

test("agent page creation reloads the same receiver directory used by customer transfer", async (context) => {
  let created = false,
    payload;
  const h = pages(context, {
    createOverseaAgentEmployee: async (body) => {
      payload = body;
      created = true;
      return { id: 41 };
    },
    fetchCustomerTransferAgents: async () => ({
      items: created ? [{ id: 41, status: "ACTIVE", displayName: "Receiver" }] : []
    })
  });
  h.agents.page.actions.openAgentCreateDialog();
  Object.assign(h.agents.createDialog.state.agentCreateForm, {
    displayName: "Receiver",
    username: "receiver",
    password: "TestPass123"
  });
  await h.agents.createDialog.actions.submitAgentCreate();
  assert.equal(payload.username, "receiver");
  assert.equal(h.agents.page.state.transferAgents[0].id, 41);
  assert.equal(h.handover.transferDialog.state.activeTransferAgents[0].id, 41);
  assert.equal(h.agents.createDialog.state.agentCreateDialogOpen, false);
});

test("credential results and permission loss propagate across independently assembled pages", async (context) => {
  let submittedPassword;
  const h = pages(context, {
    resetBusinessCustomerPassword: async (_id, password) => {
      submittedPassword = password;
      return {};
    }
  });
  await h.workspace.directory.loadCustomers("A", { selectFirst: true });
  await nextTick();
  h.customers.directory.actions.openResetPassword(customer);
  await h.customers.passwordDialog.actions.resetPassword();
  const other = createCustomerModulePages(h.customerPorts);
  assert.ok(submittedPassword);
  assert.equal(other.passwordResultDialog.state.passwordResetResult.password, submittedPassword);
  assert.equal(
    other.passwordResultDialog.state.passwordResetResult,
    h.customers.passwordResultDialog.state.passwordResetResult
  );
  h.canManage.value = false;
  h.canRequestBusinessHandover.value = false;
  await nextTick();
  assert.equal(other.passwordResultDialog.state.passwordResetResult.password, "");
  assert.equal(h.customers.directory.permissions.isManager, false);
  assert.equal(h.handover.page.permissions.canRequestBusinessHandover, false);
});

test("import page handles target workflow inputs and recreating projections preserves drafts", (context) => {
  const h = pages(context);
  h.customers.directory.actions.openBatchImport();
  h.customers.importDialog.state.quickImportText = "customer-import,ABC123";
  assert.equal(h.importing.quickImportText.value, "customer-import,ABC123");
  assert.equal(h.customers.importDialog.state.canSubmitCustomerBatchImport, true);
  const input = { tagName: "INPUT", value: "fixture" },
    agentInput = { tagName: "INPUT", value: "agent" };
  h.customers.importDialog.actions.setFileInput(input);
  h.agents.importDialog.actions.setFileInput(agentInput);
  assert.equal(toRaw(h.importing.batchFileInput.value), input);
  assert.equal(toRaw(h.agents.importDialog.state.agentBatchFileInput), agentInput);
  h.customers.importDialog.actions.setFileInput({ tagName: "DIV", value: "not-an-input" });
  h.agents.importDialog.actions.setFileInput({ tagName: "DIV", value: "not-an-input" });
  assert.equal(h.importing.batchFileInput.value, null);
  assert.equal(h.agents.importDialog.state.agentBatchFileInput, null);
  h.customers.importDialog.actions.setFileInput(input);
  h.agents.importDialog.actions.setFileInput(agentInput);
  const other = createCustomerModulePages(h.customerPorts);
  assert.equal(other.importDialog.state.quickImportText, "customer-import,ABC123");
  other.importDialog.actions.closeBatchImport();
  assert.equal(h.customers.importDialog.state.batchImportDialogOpen, false);
});

test("customer detail binding fixes the customer target and refreshes shared relations", async (context) => {
  const h = pages(context);
  await h.workspace.directory.loadCustomers("A", { selectFirst: true });
  h.available.value = [{ shipmentId: "S", boundRoles: [] }];
  assert.equal(h.customers.detail.state.unboundAvailableShipments[0].shipmentId, "S");
  assert.equal(await h.customers.detail.actions.quickBindShipment({ shipmentId: "S" }), true);
  assert.deepEqual(h.calls, [["A", { shipmentId: "S" }]]);
  assert.equal(h.refreshed.length, 1);
  h.customers.detail.actions.toggleCandidateShipment("S", true);
  assert.deepEqual(h.bindings.selectedCandidateShipmentIds.value, ["S"]);
  h.workspace.directory.selectedCustomerId.value = "other";
  assert.deepEqual(h.customers.detail.state.selectedCandidateShipmentIds, []);
});

test("handover page executes against the shared customer directory and releases page locks", async (context) => {
  let payload;
  const h = pages(context, {
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
  await h.customerPorts.operations.handover.loadBusinessHandoverAgents();
  h.handover.page.actions.openBusinessHandover({ id: 51 });
  Object.assign(h.handover.businessDialog.state.businessHandoverForm, {
    customerIds: ["A"],
    reason: "Transfer fixture"
  });
  await h.handover.businessDialog.actions.submitBusinessHandover();
  assert.deepEqual(payload, {
    customerIds: ["A"],
    targetBusinessUserId: 51,
    reason: "Transfer fixture"
  });
  assert.equal(h.customers.directory.state.filteredCustomers.length, 0);
  assert.equal(h.refreshed.length, 1);
  assert.equal(h.agents.page.state.agentWriteBusy, false);
});

test("unmounted composed workspace ignores late page submissions and clears credentials", async (context) => {
  const pending = deferred(),
    h = pages(context, { createOverseaAgentEmployee: () => pending.promise });
  h.credentials.openPasswordResetResult("fixture", "TestPass123");
  h.agents.page.actions.openAgentCreateDialog();
  Object.assign(h.agents.createDialog.state.agentCreateForm, {
    displayName: "Receiver",
    username: "receiver",
    password: "TestPass123"
  });
  const submitting = h.agents.createDialog.actions.submitAgentCreate();
  h.scope.stop();
  pending.resolve({ id: 41 });
  await submitting;
  assert.equal(h.customers.passwordResultDialog.state.passwordResetResult.password, "");
  assert.equal(h.agents.createDialog.state.agentCreateForm.password, "");
  assert.equal(h.notices.length, 0);
});
