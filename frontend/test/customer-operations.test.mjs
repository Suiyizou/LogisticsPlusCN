import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import * as XLSX from "xlsx";
import { customerWorkflowMessages } from "../src/i18n/customerWorkflowMessages.js";
import { useCustomerBatchImport } from "../src/features/customers/useCustomerBatchImport.js";
import { useAgentManagement } from "../src/features/agents/useAgentManagement.js";
import { useCustomerHandover } from "../src/features/customers/useCustomerHandover.js";
import {
  parseAgentImportWorkbook,
  validateAgentImportRows
} from "../src/features/agents/agentImport.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
}
function spreadsheet(rows, name = "CUSTOMERS") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  return workbook;
}
function workbookFile(workbook, name = "data.xlsx") {
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return { name, size: data.byteLength, arrayBuffer: async () => data };
}
const customer = (id) => ({
  id,
  displayName: "Customer " + id,
  username: "user-" + id,
  partyRole: "SHIPPER",
  status: "ACTIVE"
});
const agent = (id) => ({
  id: String(id),
  username: "agent-" + id,
  displayName: "Agent " + id,
  status: "ACTIVE",
  current: false
});
const tr = (key, params) => key + (params ? JSON.stringify(params) : "");
function harness(t, locale = "en-US") {
  const queues = Object.fromEntries(
    [
      "batchCustomers",
      "createAgent",
      "batchAgents",
      "agents",
      "updateAgent",
      "password",
      "deleteAgent",
      "businessAgents",
      "requests",
      "handover",
      "transfer"
    ].map((key) => [key, []])
  );
  const api =
    (key) =>
    (...args) => {
      const pending = deferred();
      queues[key].push({ ...pending, args: structuredClone(args) });
      return pending.promise;
    };
  const notices = [],
    passwords = [],
    handled = [],
    reloads = [],
    downloads = [];
  const directory = {
    customers: ref([customer("A"), customer("B")]),
    selectedCustomerRows: ref([]),
    customerWriteBusy: ref(false),
    loadCustomers: async (...args) => {
      reloads.push(args);
    },
    removeCustomers: (ids) => {
      directory.customers.value = directory.customers.value.filter(
        (row) => !ids.includes(String(row.id))
      );
    },
    syncCustomerSelection: async (rows) => {
      directory.selectedCustomerRows.value = rows;
    }
  };
  let refresh = async (...args) => {
    reloads.push(args);
  };
  directory.loadCustomers = (...args) => refresh(...args);
  let xlsxLoader = async () => ({
    ...XLSX,
    writeFile: (book, name) => downloads.push({ book, name })
  });
  const scope = effectScope(),
    canManage = ref(true),
    isOverseaAgent = ref(false),
    canRequestBusinessHandover = ref(true);
  let confirmed = true,
    prompted = "Changed agent";
  const common = {
    directory,
    canManage,
    t: (key, params) =>
      customerWorkflowMessages[locale][key.replace(/^customers\./, "")] || tr(key, params),
    showSuccess: (key, params) => notices.push({ key, params }),
    showError: (error, key) => notices.push({ key, error })
  };
  const a = scope.run(() =>
    useAgentManagement({
      ...common,
      fetchCustomerTransferAgents: api("agents"),
      createOverseaAgentEmployee: api("createAgent"),
      batchCreateOverseaAgentEmployees: api("batchAgents"),
      updateOverseaAgent: api("updateAgent"),
      resetOverseaAgentPassword: api("password"),
      deleteOverseaAgent: api("deleteAgent"),
      loadXlsxModule: () => xlsxLoader(),
      markApiErrorHandled: (error) => handled.push(error),
      openPasswordResetResult: (...args) => passwords.push(args),
      confirm: () => confirmed,
      prompt: () => prompted
    })
  );
  const b = scope.run(() =>
    useCustomerBatchImport({
      ...common,
      batchCreateBusinessCustomers: api("batchCustomers"),
      loadXlsxModule: () => xlsxLoader()
    })
  );
  const h = scope.run(() =>
    useCustomerHandover({
      ...common,
      isOverseaAgent,
      canRequestBusinessHandover,
      agentManagement: a,
      fetchBusinessHandoverAgents: api("businessAgents"),
      fetchBusinessHandoverRequests: api("requests"),
      handoverBusinessCustomers: api("handover"),
      transferBusinessCustomers: api("transfer"),
      loadAvailableShipments: async () => {
        reloads.push(["shipments"]);
      }
    })
  );
  a.transferAgents.value = [agent(1), agent(2), { ...agent(3), status: "DISABLED" }];
  h.businessHandoverAgents.value = [
    agent(10),
    agent(11),
    { ...agent(12), current: true },
    { ...agent(13), status: "DISABLED" }
  ];
  t.after(() => scope.stop());
  return {
    a,
    b,
    h,
    d: directory,
    scope,
    queues,
    notices,
    passwords,
    handled,
    reloads,
    downloads,
    canManage,
    isOverseaAgent,
    canRequestBusinessHandover,
    setRefresh: (fn) => {
      refresh = fn;
    },
    setXlsx: (fn) => {
      xlsxLoader = fn;
    },
    decline: () => {
      confirmed = false;
    },
    prompt: (value) => {
      prompted = value;
    }
  };
}
function openQuick(b, value = "alice,ALICE01") {
  b.openBatchImport();
  b.quickImportText.value = value;
}
function openAgentBatch(a, count = 1) {
  a.openAgentBatchImport();
  a.agentBatchRows.value = validateAgentImportRows(
    Array.from({ length: count }, (_, i) => ({
      username: "agent" + i,
      displayName: "Agent " + i,
      password: "StrongPass2026"
    })),
    tr
  );
}
function openHandover(h, ids = ["A"]) {
  h.openBusinessHandover(agent(10));
  h.businessHandoverForm.customerIds = ids;
  h.businessHandoverForm.reason = "Change owner";
}

test("quick customer import validates duplicates and enforces the server's 500-row limit", (t) => {
  const { b, queues } = harness(t);
  openQuick(b, "Alice,ALICE01\nalice,OTHER01");
  assert.equal(b.canSubmitCustomerBatchImport.value, false);
  assert.equal(b.activeCustomerBatchPreview.value.invalid, 1);
  b.quickImportText.value = Array.from({ length: 501 }, (_, i) => "customer" + i).join("\n");
  assert.equal(b.activeCustomerBatchPreview.value.globalErrors[0].code, "TOO_MANY_ROWS");
  b.submitBatchImport();
  assert.equal(queues.batchCustomers.length, 0);
});

test("customer import captures payload and holds the shared lock through directory refresh", async (t) => {
  const { b, a, d, queues, setRefresh } = harness(t),
    refresh = deferred();
  setRefresh(() => refresh.promise);
  openQuick(b);
  const work = b.submitBatchImport();
  b.quickImportText.value = "changed,CHANGE01";
  b.selectCustomerBatchMode("excel");
  b.closeBatchImport();
  b.submitBatchImport();
  a.openAgentCreateDialog();
  assert.equal(queues.batchCustomers.length, 1);
  assert.equal(queues.batchCustomers[0].args[0].items[0].username, "alice");
  assert.equal(b.batchImportMode.value, "quick");
  assert.equal(a.agentCreateDialogOpen.value, false);
  queues.batchCustomers[0].resolve({
    items: [
      { username: "alice", password: "GeneratedPass", status: "CREATED" },
      { username: "bad", status: "FAILED" }
    ]
  });
  await flush();
  assert.deepEqual(b.batchCredentialSummary.value, { total: 2, created: 1, failed: 1 });
  assert.equal(d.customerWriteBusy.value, true);
  assert.equal(b.quickImportText.value, "");
  refresh.resolve();
  await work;
  assert.equal(d.customerWriteBusy.value, false);
  assert.equal(b.importingCustomers.value, false);
});

test("failed customer batch import retains editable input and can be explicitly retried", async (t) => {
  const { b, d, queues } = harness(t);
  openQuick(b);
  const failed = b.submitBatchImport();
  queues.batchCustomers[0].reject(new Error("import failed"));
  await failed;
  assert.equal(d.customerWriteBusy.value, false);
  assert.equal(b.batchImportDialogOpen.value, true);
  assert.equal(b.quickImportText.value, "alice,ALICE01");
  assert.equal(b.batchPreviewError.value, "import failed");
  const retry = b.submitBatchImport();
  queues.batchCustomers[1].resolve({ items: [] });
  await retry;
});

test("Excel customer import reads a real workbook and resets native input immediately", async (t) => {
  const { b } = harness(t);
  b.openBatchImport();
  b.selectCustomerBatchMode("excel");
  const target = {
    files: [
      workbookFile(
        spreadsheet([
          ["用户名", "客户代码"],
          ["excel-user", "EXCEL01"]
        ])
      )
    ],
    value: "data.xlsx"
  };
  await b.handleCustomerWorkbook({ target });
  assert.equal(target.value, "");
  assert.equal(b.activeCustomerBatchPreview.value.items[0].username, "excel-user");
  assert.equal(b.canSubmitCustomerBatchImport.value, true);
  await b.handleCustomerWorkbook({ target });
  assert.equal(b.activeCustomerBatchPreview.value.total, 1);
});

test("replacing a customer workbook ignores an older success and keeps newer loading state", async (t) => {
  const { b } = harness(t),
    first = deferred(),
    second = deferred();
  b.openBatchImport();
  b.selectCustomerBatchMode("excel");
  const original = workbookFile(spreadsheet([["用户名"], ["old-user"]])),
    next = workbookFile(spreadsheet([["用户名"], ["new-user"]]));
  const one = b.handleCustomerWorkbook({
    target: { files: [{ ...original, arrayBuffer: () => first.promise }] }
  });
  await flush();
  const two = b.handleCustomerWorkbook({
    target: { files: [{ ...next, arrayBuffer: () => second.promise }] }
  });
  await flush();
  assert.equal(b.canSubmitCustomerBatchImport.value, false);
  first.resolve(await original.arrayBuffer());
  await one;
  assert.equal(b.customerFileParsing.value, true);
  assert.equal(b.customerBatchPreview.value.total, 0);
  second.resolve(await next.arrayBuffer());
  await two;
  assert.equal(b.customerBatchPreview.value.items[0].username, "new-user");
});

test("closing or changing customer import mode invalidates pending file parsing", async (t) => {
  const { b, setXlsx } = harness(t),
    loader = deferred();
  setXlsx(() => loader.promise);
  b.openBatchImport();
  b.selectCustomerBatchMode("excel");
  const work = b.handleCustomerWorkbook({
    target: { files: [workbookFile(spreadsheet([["用户名"], ["late-user"]]))] }
  });
  await flush();
  b.selectCustomerBatchMode("quick");
  b.closeBatchImport();
  loader.resolve(XLSX);
  await work;
  assert.equal(b.customerBatchPreview.value.total, 0);
  assert.equal(b.batchFileName.value, "");
  assert.equal(b.customerFileParsing.value, false);
});

test("customer file checks reject unsupported or oversized files before loading XLSX", async (t) => {
  const { b, setXlsx } = harness(t);
  let loads = 0;
  setXlsx(async () => {
    loads++;
    return XLSX;
  });
  b.openBatchImport();
  b.selectCustomerBatchMode("excel");
  await b.handleBatchDrop({ dataTransfer: { files: [{ name: "file.exe", size: 1 }] } });
  await b.handleBatchDrop({
    dataTransfer: { files: [{ name: "large.xlsx", size: 11 * 1024 * 1024 }] }
  });
  assert.equal(loads, 0);
  assert.equal(b.customerFileParsing.value, false);
  assert.ok(b.batchPreviewError.value);
});

test("disposed customer import cannot expose credentials or start a background directory refresh", async (t) => {
  const { b, d, scope, queues, reloads } = harness(t);
  openQuick(b);
  const work = b.submitBatchImport();
  scope.stop();
  queues.batchCustomers[0].resolve({ items: [{ password: "secret", status: "CREATED" }] });
  await work;
  assert.deepEqual(b.batchCredentialRows.value, []);
  assert.equal(b.quickImportText.value, "");
  assert.equal(reloads.length, 0);
  assert.equal(d.customerWriteBusy.value, false);
});

test("credential export captures fields, status and localized failure reasons in a real workbook", async (t) => {
  const { b, downloads } = harness(t);
  b.batchCredentialRows.value = [
    {
      rowNumber: 1,
      username: "alice",
      customerCode: "CODE001",
      password: "Secret001",
      status: "CREATED"
    },
    {
      rowNumber: 2,
      username: "bob",
      status: "FAILED",
      message: "username or client code already exists"
    }
  ];
  await b.downloadCredentialWorkbook();
  const rows = XLSX.utils.sheet_to_json(downloads[0].book.Sheets["Customer credentials"]);
  assert.equal(rows[0]["customers.initialPassword"], "Secret001");
  assert.equal(rows[1]["customers.failureReason"], "customers.customerImportDuplicateServer");
  const result = b.batchCredentialRows.value[0];
  b.closeBatchCredentials();
  assert.equal(result.password, "");
  assert.deepEqual(b.batchCredentialRows.value, []);
});

test("closing credential results cancels a delayed export and wipes passwords", async (t) => {
  const { b, setXlsx, downloads } = harness(t),
    loader = deferred();
  setXlsx(() => loader.promise);
  b.batchCredentialRows.value = [{ username: "alice", password: "Secret001", status: "CREATED" }];
  const work = b.downloadCredentialWorkbook();
  await flush();
  b.closeBatchCredentials();
  loader.resolve(XLSX);
  await work;
  assert.equal(downloads.length, 0);
  assert.equal(b.exportingCredentials.value, false);
});

test("customer import and agent mutations reject read-only roles and an existing shared write", async (t) => {
  const { b, a, d, canManage, queues } = harness(t);
  canManage.value = false;
  openQuick(b);
  a.openAgentCreateDialog();
  await a.toggleAgentStatus(agent(1));
  assert.equal(b.batchImportDialogOpen.value, false);
  assert.equal(a.agentCreateDialogOpen.value, false);
  assert.equal(queues.updateAgent.length, 0);
  canManage.value = true;
  d.customerWriteBusy.value = true;
  openQuick(b);
  a.openAgentBatchImport();
  assert.equal(b.batchImportDialogOpen.value, false);
  assert.equal(a.agentBatchDialogOpen.value, false);
});

test("agent import validates Unicode accounts, duplicate casing, password and display-name rules", () => {
  const rows = validateAgentImportRows(
    [
      { username: "海外代理", displayName: "海外代理", password: "Agent1234" },
      { username: "agent", displayName: "Valid", password: "Agent1234" },
      { username: "AGENT", displayName: "x", password: "12345678" }
    ],
    tr
  );
  assert.equal(rows[0].status, "READY");
  assert.equal(rows[2].status, "INVALID");
  assert.equal(rows[2].errors.length, 3);
});

test("agent workbook parser recognizes aliases and preserves source row numbers", () => {
  const book = spreadsheet(
    [
      ["instructions"],
      ["Username*", "Display Name*", "Initial Password*"],
      ["agent-a", "Agent A", "Strong1234"]
    ],
    "OVERSEA AGENTS"
  );
  const rows = parseAgentImportWorkbook(book, XLSX, tr);
  assert.equal(rows[0].rowNumber, 3);
  assert.equal(rows[0].username, "agent-a");
  assert.equal(rows[0].status, "READY");
});

test("agent workbook parser rejects wrong headers, empty data and more than 200 accounts", () => {
  assert.throws(
    () => parseAgentImportWorkbook(spreadsheet([["wrong"]]), XLSX, tr),
    /HeaderMissing/
  );
  assert.throws(
    () =>
      parseAgentImportWorkbook(spreadsheet([["Username", "Display Name", "Password"]]), XLSX, tr),
    /NoRows/
  );
  const rows = [
    ["Username", "Display Name", "Password"],
    ...Array.from({ length: 201 }, (_, i) => ["agent" + i, "Agent " + i, "Strong1234"])
  ];
  assert.throws(() => parseAgentImportWorkbook(spreadsheet(rows), XLSX, tr), /TooManyRows/);
});

test("agent directory accepts only its latest response and bounds pagination", async (t) => {
  const { a, queues } = harness(t);
  const first = a.loadTransferAgents(),
    latest = a.loadTransferAgents();
  queues.agents[1].resolve({ items: Array.from({ length: 12 }, (_, i) => agent(i)) });
  await latest;
  a.changeAgentPage(2);
  assert.equal(a.agentRowIndex(0), 11);
  assert.equal(a.paginatedTransferAgents.value.length, 2);
  queues.agents[0].resolve({ items: [agent(99)] });
  await first;
  assert.equal(a.transferAgents.value.length, 12);
  const shrink = a.loadTransferAgents();
  queues.agents[2].resolve({ items: [agent(1)] });
  await shrink;
  await flush();
  assert.equal(a.agentPage.value, 1);
  assert.equal(a.activeAgentCount.value, 1);
});

test("a stale agent-directory failure does not hide the current request or report an error", async (t) => {
  const { a, queues, notices } = harness(t);
  const first = a.loadTransferAgents(),
    next = a.loadTransferAgents();
  queues.agents[0].reject(new Error("old failure"));
  await first;
  assert.equal(a.loadingTransferAgents.value, true);
  assert.equal(notices.length, 0);
  queues.agents[1].resolve({ items: [agent(2)] });
  await next;
});

test("creating an agent trims the submitted identity, refreshes the list and prevents repeated submission", async (t) => {
  const { a, d, queues } = harness(t);
  a.openAgentCreateDialog();
  Object.assign(a.agentCreateForm, {
    username: " new-agent ",
    displayName: " New Agent ",
    password: "Strong1234"
  });
  const work = a.submitAgentCreate();
  a.submitAgentCreate();
  a.closeAgentCreateDialog();
  assert.equal(queues.createAgent.length, 1);
  assert.equal(queues.createAgent[0].args[0].username, "new-agent");
  assert.equal(a.agentCreateDialogOpen.value, true);
  queues.createAgent[0].resolve({ id: "4" });
  await flush();
  assert.equal(d.customerWriteBusy.value, true);
  assert.equal(a.agentCreateForm.password, "");
  queues.agents[0].resolve({ items: [agent(4)] });
  await work;
  assert.equal(d.customerWriteBusy.value, false);
  assert.equal(a.transferAgents.value[0].id, "4");
});

test("agent validation and declined confirmations do not call mutation APIs", async (t) => {
  const { a, queues, prompt, decline } = harness(t);
  a.openAgentCreateDialog();
  Object.assign(a.agentCreateForm, {
    username: "invalid!",
    displayName: "Valid",
    password: "Strong1234"
  });
  await a.submitAgentCreate();
  assert.ok(a.agentCreateError.value);
  assert.equal(queues.createAgent.length, 0);
  prompt("x");
  await a.editAgentDisplayName(agent(1));
  assert.equal(queues.updateAgent.length, 0);
  decline();
  await a.deleteAgent(agent(1));
  await a.resetAgentPassword(agent(1));
  await a.toggleAgentStatus(agent(1));
  assert.equal(queues.deleteAgent.length, 0);
  assert.equal(queues.password.length, 0);
  assert.equal(queues.updateAgent.length, 0);
});

test("agent writes are serialized with customer assignment and invalidate old list reads", async (t) => {
  const { a, d, queues, h } = harness(t),
    stale = a.loadTransferAgents();
  const change = a.toggleAgentStatus(agent(1));
  a.deleteAgent(agent(2));
  openHandover(h);
  h.submitBusinessHandover();
  assert.equal(d.customerWriteBusy.value, true);
  assert.equal(queues.deleteAgent.length, 0);
  assert.equal(queues.handover.length, 0);
  queues.updateAgent[0].resolve({});
  await flush();
  queues.agents[1].resolve({ items: [{ ...agent(1), status: "DISABLED" }] });
  await change;
  queues.agents[0].resolve({ items: [agent(1)] });
  await stale;
  assert.equal(a.transferAgents.value[0].status, "DISABLED");
  assert.equal(d.customerWriteBusy.value, false);
});

test("password reset captures its agent and suppresses credentials after scope disposal", async (t) => {
  const { a, scope, queues, passwords, d } = harness(t);
  const target = agent(1),
    work = a.resetAgentPassword(target);
  target.username = "changed";
  scope.stop();
  queues.password[0].resolve({ temporaryPassword: "Secret1234" });
  await work;
  assert.equal(queues.password[0].args[0], "1");
  assert.equal(passwords.length, 0);
  assert.equal(d.customerWriteBusy.value, false);
});

test("successful agent batch creation uses one immutable payload and clears stored passwords", async (t) => {
  const { a, queues, d } = harness(t);
  openAgentBatch(a, 2);
  const work = a.submitAgentBatchImport();
  a.submitAgentBatchImport();
  a.closeAgentBatchImport();
  a.handleAgentBatchDrop({ dataTransfer: { files: [{ name: "another.xlsx" }] } });
  assert.equal(queues.batchAgents.length, 1);
  assert.equal(a.agentBatchDialogOpen.value, true);
  queues.batchAgents[0].resolve({ items: [] });
  await flush();
  queues.agents[0].resolve({ items: [] });
  await work;
  assert.equal(a.agentBatchCreatedCount.value, 2);
  assert.ok(a.agentBatchRows.value.every((row) => row.password === ""));
  assert.equal(d.customerWriteBusy.value, false);
});

test("missing batch endpoint falls back to at most three workers and preserves per-row failures", async (t) => {
  const { a, queues, handled, notices } = harness(t);
  openAgentBatch(a, 5);
  const work = a.submitAgentBatchImport();
  queues.batchAgents[0].reject(Object.assign(new Error("legacy"), { status: 404 }));
  await flush();
  assert.equal(queues.createAgent.length, 3);
  queues.createAgent[0].resolve({});
  queues.createAgent[1].reject(new Error("duplicate"));
  await flush();
  assert.equal(queues.createAgent.length, 5);
  queues.createAgent[2].resolve({});
  queues.createAgent[3].resolve({});
  queues.createAgent[4].resolve({});
  await flush();
  queues.agents[0].resolve({ items: [] });
  await work;
  assert.equal(a.agentBatchCreatedCount.value, 4);
  assert.equal(a.agentBatchRows.value[1].status, "FAILED");
  assert.equal(a.agentBatchRows.value[1].resultMessage, "duplicate");
  assert.equal(handled.length, 2);
  assert.deepEqual(notices.at(-1).params, { created: 4, failed: 1 });
});

test("server or network batch failure never falls back to creating agents a second time", async (t) => {
  const { a, queues } = harness(t);
  openAgentBatch(a, 2);
  const work = a.submitAgentBatchImport();
  queues.batchAgents[0].reject(Object.assign(new Error("unknown server outcome"), { status: 500 }));
  await work;
  assert.equal(queues.createAgent.length, 0);
  assert.equal(a.agentBatchReadyCount.value, 2);
  assert.equal(a.agentBatchError.value, "unknown server outcome");
});

test("disposing fallback import stops queued creations without pretending to cancel server writes", async (t) => {
  const { a, queues, scope, reloads, d } = harness(t);
  openAgentBatch(a, 6);
  const work = a.submitAgentBatchImport();
  queues.batchAgents[0].reject(Object.assign(new Error("legacy"), { status: 405 }));
  await flush();
  assert.equal(queues.createAgent.length, 3);
  const row = a.agentBatchRows.value[0];
  scope.stop();
  queues.createAgent.forEach((item) => item.resolve({}));
  await work;
  assert.equal(queues.createAgent.length, 3);
  assert.equal(queues.agents.length, 0);
  assert.equal(row.password, "");
  assert.equal(a.agentBatchRows.value.length, 0);
  assert.equal(reloads.length, 0);
  assert.equal(d.customerWriteBusy.value, false);
});

test("agent workbook replacement and closing cannot publish old parse results", async (t) => {
  const { a } = harness(t),
    first = deferred();
  a.openAgentBatchImport();
  const oldFile = workbookFile(
    spreadsheet([
      ["Username", "Display Name", "Password"],
      ["old-agent", "Old Agent", "Strong1234"]
    ])
  );
  const one = a.handleAgentWorkbook({
    target: { files: [{ ...oldFile, arrayBuffer: () => first.promise }], value: "data.xlsx" }
  });
  await flush();
  const nextFile = workbookFile(
    spreadsheet([
      ["Username", "Display Name", "Password"],
      ["new-agent", "New Agent", "Strong1234"]
    ])
  );
  await a.handleAgentWorkbook({ target: { files: [nextFile] } });
  first.resolve(await oldFile.arrayBuffer());
  await one;
  assert.equal(a.agentBatchRows.value[0].username, "new-agent");
  a.closeAgentBatchImport();
  assert.equal(a.agentBatchRows.value.length, 0);
});

test("handover requests keep zero-based API paging and only accept the latest filter", async (t) => {
  const { h, queues, notices } = harness(t),
    old = h.changeBusinessHandoverRequestPage(3);
  assert.equal(queues.requests[0].args[0].page, 2);
  h.businessHandoverRequestStatus.value = "APPROVED";
  const next = h.changeBusinessHandoverRequestStatus();
  queues.requests[0].reject(new Error("old filter"));
  await old;
  assert.equal(h.loadingBusinessHandoverRequests.value, true);
  assert.equal(notices.length, 0);
  queues.requests[1].resolve({ items: [{ id: "latest" }], total: 1, page: 0, size: 10 });
  await next;
  assert.equal(h.businessHandoverRequests.value[0].id, "latest");
  assert.equal(h.businessHandoverRequestPage.value, 0);
});

test("handover requests accept canonical server page and size without dropping rows", async (t) => {
  const { h, queues } = harness(t),
    work = h.changeBusinessHandoverRequestPageSize(20);
  assert.deepEqual(queues.requests[0].args[0], { status: "", page: 0, size: 20 });
  queues.requests[0].resolve({ items: [{ id: "canonical" }], total: 1, page: 9, size: 10 });
  await work;
  assert.equal(h.businessHandoverRequestPageSize.value, 10);
  assert.equal(h.businessHandoverRequestPage.value, 0);
  assert.equal(h.businessHandoverRequests.value.length, 1);
  assert.equal(h.loadingBusinessHandoverRequests.value, false);
});

test("business receiver refresh rejects a late response", async (t) => {
  const { h, queues } = harness(t),
    old = h.loadBusinessHandoverAgents(),
    next = h.loadBusinessHandoverAgents();
  queues.businessAgents[1].resolve({ items: [agent(20)] });
  await next;
  queues.businessAgents[0].resolve({ items: [agent(30)] });
  await old;
  assert.equal(h.businessHandoverAgents.value[0].id, "20");
});

test("direct business handover captures its target and removes transferred ownership before refresh", async (t) => {
  const { h, d, queues, notices } = harness(t);
  openHandover(h, ["A", "A"]);
  const work = h.submitBusinessHandover();
  h.businessHandoverForm.customerIds = ["B"];
  h.businessHandoverTarget.value = agent(11);
  h.businessHandoverForm.reason = "changed";
  h.openBusinessHandover(agent(11));
  h.closeBusinessHandover();
  h.submitBusinessHandover();
  assert.equal(queues.handover.length, 1);
  assert.deepEqual(queues.handover[0].args[0], {
    customerIds: ["A"],
    targetBusinessUserId: 10,
    reason: "Change owner"
  });
  queues.handover[0].resolve({ requestId: "REQ1", customerCount: 1 });
  await flush();
  assert.deepEqual(
    d.customers.value.map((row) => row.id),
    ["B"]
  );
  assert.equal(d.customerWriteBusy.value, true);
  queues.businessAgents[0].resolve({ items: [agent(10)] });
  queues.requests[0].resolve({ items: [], total: 0 });
  await work;
  assert.equal(notices.at(-1).params.agent, "Agent 10");
  assert.equal(d.customerWriteBusy.value, false);
  assert.equal(h.businessHandoverTarget.value, null);
});

test("business handover rejects role violations, inactive/self receivers and missing customers", async (t) => {
  const { h, canRequestBusinessHandover, queues } = harness(t);
  canRequestBusinessHandover.value = false;
  openHandover(h);
  assert.equal(h.businessHandoverDialogOpen.value, false);
  canRequestBusinessHandover.value = true;
  h.openBusinessHandover(agent(12));
  h.openBusinessHandover(agent(13));
  assert.equal(h.businessHandoverDialogOpen.value, false);
  openHandover(h, ["missing"]);
  await h.submitBusinessHandover();
  assert.equal(queues.handover.length, 0);
  h.businessHandoverForm.customerIds = ["A"];
  h.businessHandoverForm.reason = "x".repeat(501);
  await h.submitBusinessHandover();
  assert.equal(queues.handover.length, 0);
});

test("failed direct handover retains the form and ownership for manual retry", async (t) => {
  const { h, d, queues, notices } = harness(t);
  openHandover(h);
  const work = h.submitBusinessHandover();
  queues.handover[0].reject(new Error("ownership changed"));
  await work;
  assert.equal(h.businessHandoverDialogOpen.value, true);
  assert.equal(d.customers.value.length, 2);
  assert.equal(d.customerWriteBusy.value, false);
  assert.equal(notices[0].key, "customers.businessHandoverFailed");
});

test("manager transfer uses captured customers and preserves a newer list selection", async (t) => {
  const { h, a, d, queues } = harness(t);
  const open = h.openCustomerTransfer(d.customers.value[0]);
  queues.agents[0].resolve({ items: [agent(1)] });
  await open;
  h.transferForm.targetAgentId = "1";
  const work = h.submitCustomerTransfer();
  d.selectedCustomerRows.value = [d.customers.value[1]];
  h.transferForm.targetAgentId = "2";
  h.submitCustomerTransfer();
  assert.equal(queues.transfer.length, 1);
  assert.deepEqual(queues.transfer[0].args[0], { customerIds: ["A"], targetAgentId: "1" });
  queues.transfer[0].resolve({ transferred: 1 });
  await flush();
  queues.agents[1].resolve({ items: [agent(1)] });
  await work;
  assert.deepEqual(
    d.selectedCustomerRows.value.map((row) => row.id),
    ["B"]
  );
  assert.equal(d.customers.value.length, 2);
  assert.equal(a.loadingTransferAgents.value, false);
});

test("old transfer-dialog failure cannot close a newer dialog", async (t) => {
  const { h, d, queues } = harness(t),
    first = h.openCustomerTransfer(d.customers.value[0]);
  h.closeCustomerTransfer();
  const next = h.openCustomerTransfer(d.customers.value[1]);
  queues.agents[0].reject(new Error("old dialog"));
  await first;
  assert.equal(h.transferDialogOpen.value, true);
  queues.agents[1].resolve({ items: [agent(2)] });
  await next;
  assert.deepEqual(h.transferCustomerIds.value, ["B"]);
});

test("overseas transfer only accepts active recipients and removes handed-off customers", async (t) => {
  const { h, d, isOverseaAgent, canManage, canRequestBusinessHandover, queues } = harness(t);
  isOverseaAgent.value = true;
  canManage.value = false;
  canRequestBusinessHandover.value = false;
  h.overseaTransferCustomerIds.value = ["A"];
  await h.submitOverseaAgentTransfer(agent(3));
  assert.equal(queues.transfer.length, 0);
  const work = h.submitOverseaAgentTransfer(agent(2));
  h.overseaTransferCustomerIds.value = ["B"];
  queues.transfer[0].resolve({ transferred: 1 });
  await flush();
  queues.agents[0].resolve({ items: [agent(2)] });
  await work;
  assert.deepEqual(
    d.customers.value.map((row) => row.id),
    ["B"]
  );
  assert.deepEqual(h.overseaTransferCustomerIds.value, ["B"]);
});

test("handover and transfer cannot continue changing UI after scope disposal", async (t) => {
  const { h, queues, d, scope, reloads, notices } = harness(t);
  openHandover(h);
  const work = h.submitBusinessHandover();
  scope.stop();
  queues.handover[0].resolve({ customerCount: 1 });
  await work;
  assert.equal(d.customers.value.length, 2);
  assert.equal(reloads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(d.customerWriteBusy.value, false);
});

test("handover eligibility excludes disabled customers and trims obsolete selections", async (t) => {
  const { h, d } = harness(t);
  h.overseaTransferCustomerIds.value = ["A", "B"];
  openHandover(h, ["A", "B"]);
  d.customers.value = [{ ...customer("A"), status: "DISABLED" }, customer("B")];
  await flush();
  assert.deepEqual(
    h.handoverEligibleCustomers.value.map((row) => row.id),
    ["B"]
  );
  assert.deepEqual(h.overseaTransferCustomerIds.value, ["B"]);
  assert.deepEqual(h.businessHandoverForm.customerIds, ["B"]);
});

test("a shared operation lock prevents transfers while customer batch import is running", async (t) => {
  const { b, h, queues } = harness(t);
  openQuick(b);
  const importWork = b.submitBatchImport();
  h.overseaTransferCustomerIds.value = ["A"];
  openHandover(h);
  await h.submitOverseaAgentTransfer(agent(2));
  await h.submitBusinessHandover();
  assert.equal(queues.handover.length, 0);
  assert.equal(queues.transfer.length, 0);
  queues.batchCustomers[0].resolve({ items: [] });
  await importWork;
});

for (const locale of ["zh-CN", "en-US"]) {
  test(`generated agent template can be parsed back in ${locale}`, async (t) => {
    const { a, downloads } = harness(t, locale);
    await a.downloadAgentImportTemplate();
    const rows = parseAgentImportWorkbook(downloads[0].book, XLSX, tr);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, "oversea-agent-01");
    assert.equal(rows[0].status, "READY");
  });
}

test("a late dialog-close callback cannot clear a reopened handover form", (t) => {
  const { h } = harness(t);
  openHandover(h);
  h.closeBusinessHandover();
  h.openBusinessHandover(agent(11));
  h.businessHandoverForm.customerIds = ["B"];
  h.businessHandoverForm.reason = "New handover";
  h.resetBusinessHandoverForm();
  assert.equal(h.businessHandoverTarget.value.id, "11");
  assert.deepEqual(h.businessHandoverForm.customerIds, ["B"]);
});

test("a disposed agent workbook parse cannot surface an error or repopulate account passwords", async (t) => {
  const { a, setXlsx, scope } = harness(t),
    loader = deferred();
  setXlsx(() => loader.promise);
  a.openAgentBatchImport();
  const work = a.handleAgentWorkbook({ target: { files: [{ name: "pending.xlsx", size: 1 }] } });
  scope.stop();
  loader.reject(new Error("late load failure"));
  await work;
  assert.equal(a.agentBatchError.value, "");
  assert.equal(a.agentBatchRows.value.length, 0);
});

test("failed credential export reports a visible error and allows an explicit retry without losing results", async (t) => {
  const { b, setXlsx, downloads } = harness(t);
  b.batchCredentialRows.value = [{ username: "alice", password: "Secret1234", status: "CREATED" }];
  setXlsx(async () => {
    throw new Error("export runtime unavailable");
  });
  await b.downloadCredentialWorkbook();
  assert.equal(b.credentialExportError.value, "export runtime unavailable");
  assert.equal(b.exportingCredentials.value, false);
  assert.equal(b.batchCredentialRows.value[0].password, "Secret1234");
  setXlsx(async () => ({ ...XLSX, writeFile: (book) => downloads.push(book) }));
  await b.downloadCredentialWorkbook();
  assert.equal(b.credentialExportError.value, "");
  assert.equal(downloads.length, 1);
});
