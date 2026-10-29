import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { nextOptionIndex, typeaheadIndex } from "../public/tracking-presentation.mjs";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const presentation = await readFile(
  new URL("../public/tracking-presentation.mjs", import.meta.url),
  "utf8"
);

test("combobox navigation wraps a nonempty list and safely handles an empty list", () => {
  assert.equal(nextOptionIndex(2, 1, 3), 0);
  assert.equal(nextOptionIndex(0, -1, 3), 2);
  assert.equal(nextOptionIndex(0, 1, 0), -1);
});

test("combobox typeahead handles case, normalized text, repeated prefixes and absent matches", () => {
  const options = [{ label: "COSCO SHIPPING" }, { label: "CMA CGM" }, { label: "ＭＳＣ" }];
  assert.equal(typeaheadIndex(options, "c", 0), 1);
  assert.equal(typeaheadIndex(options, "cosco"), 0);
  assert.equal(typeaheadIndex(options, "msc"), 2);
  assert.equal(typeaheadIndex(options, "unknown"), -1);
  assert.equal(typeaheadIndex([], "c"), -1);
});

async function runDelete({
  accepted = true,
  canDelete = true,
  switchSession = false,
  switchShipment = false
} = {}) {
  let currentSession = { token: "session-a" };
  let requests = 0;
  let confirmations = 0;
  let renders = 0;
  const context = vm.createContext({
    fileSessionFingerprint: (session) => session.token,
    readFileSession: () => currentSession,
    relatedFilesShipmentId: "shipment-a",
    confirmTrackingAction: async () => {
      confirmations += 1;
      if (switchSession) currentSession = { token: "session-b" };
      if (switchShipment) context.relatedFilesShipmentId = "shipment-b";
      return accepted;
    },
    t: (key) => key,
    synchronizeRelatedFilesSession() {},
    relatedFilesSessionFingerprint: "session-a",
    shipmentFilePath: () => "/not-requested-in-test",
    requestRelatedFilesApi: async () => {
      requests += 1;
    },
    isCurrentRelatedFilesSession: (fingerprint) => fingerprint === currentSession.token,
    relatedFilesItems: [{ id: "file-a" }],
    setRelatedFilesUploadMessage() {},
    renderRelatedFilesDrawer: () => {
      renders += 1;
    }
  });
  const start = app.indexOf("async function deleteRelatedFile(file) {");
  const end = app.indexOf("function normalizeCountryCode", start);
  vm.runInContext(app.slice(start, end), context);
  const deleted = await context.deleteRelatedFile({
    id: "file-a",
    canDelete,
    originalFileName: "Invoice.pdf"
  });
  return { deleted, requests, confirmations, renders, files: context.relatedFilesItems.length };
}

test("canceling file deletion performs no request or local metadata mutation", async () => {
  assert.deepEqual(await runDelete({ accepted: false }), {
    deleted: false,
    requests: 0,
    confirmations: 1,
    renders: 0,
    files: 1
  });
});

test("file deletion still requires its existing permission before opening a confirmation", async () => {
  assert.deepEqual(await runDelete({ canDelete: false }), {
    deleted: false,
    requests: 0,
    confirmations: 0,
    renders: 0,
    files: 1
  });
});

test("confirming deletion preserves request ordering and removes only the returned file", async () => {
  assert.deepEqual(await runDelete(), {
    deleted: true,
    requests: 1,
    confirmations: 1,
    renders: 1,
    files: 0
  });
});

test("an asynchronous confirmation cannot delete against a changed session or shipment", async () => {
  for (const scenario of [{ switchSession: true }, { switchShipment: true }]) {
    const result = await runDelete(scenario);
    assert.equal(result.deleted, false);
    assert.equal(result.requests, 0);
    assert.equal(result.files, 1);
  }
});

test("carrier session maintenance is shown only for CMA and an existing maintenance permission", () => {
  const start = app.indexOf("function renderCmaSessionPanel() {");
  const end = app.indexOf("async function refreshCmaSessionStatus", start);
  for (const [carrier, canManage, hidden] of [
    ["CMA", false, true],
    ["CMA", true, false],
    ["COSCO", true, true]
  ]) {
    const context = vm.createContext({
      carrierSelect: { value: carrier },
      readFileSession: () => ({}),
      canManageFileVisibility: () => canManage,
      cmaSessionPanel: {},
      cmaSessionPermission: {},
      cmaSessionForm: {},
      cmaSessionStatusElement: { dataset: {} },
      cmaSessionUserAgent: { value: "test-agent" },
      cmaSessionStatus: { configured: false },
      cmaSessionLoading: false,
      cmaSessionStatusLoaded: true,
      cmaSessionSave: {},
      cmaSessionClear: {},
      t: (key) => key
    });
    vm.runInContext(`${app.slice(start, end)}\nrenderCmaSessionPanel();`, context);
    assert.equal(context.cmaSessionPanel.hidden, hidden);
    if (carrier === "CMA") assert.equal(context.cmaSessionForm.hidden, !canManage);
  }
});

test("the first keyboard menu opening removes inert before moving focus", () => {
  const handlers = {};
  let expanded = "false";
  let hidden = "true";
  const doc = {
    activeElement: null,
    defaultView: {
      MutationObserver: class {
        observe() {}
      }
    }
  };
  const menu = {
    id: "file-category",
    ownerDocument: doc,
    inert: false,
    getAttribute: () => hidden,
    addEventListener() {},
    querySelectorAll: () => [option]
  };
  const option = {
    disabled: false,
    hidden: false,
    closest: () => null,
    getAttribute: () => "true",
    focus() {
      if (!menu.inert) doc.activeElement = option;
    }
  };
  const trigger = {
    setAttribute() {},
    getAttribute: () => expanded,
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    click() {
      expanded = "true";
      hidden = "false";
    },
    focus() {
      doc.activeElement = trigger;
    }
  };
  const start = presentation.indexOf("function installExistingMenu(");
  const end = presentation.indexOf("function installDrawerFocus(", start);
  const context = vm.createContext({ nextOptionIndex, typeaheadIndex });
  vm.runInContext(presentation.slice(start, end), context);
  context.installExistingMenu(trigger, menu);
  assert.equal(menu.inert, true);
  handlers.keydown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(menu.inert, false);
  assert.equal(doc.activeElement, option, "no MutationObserver delivery is needed for focus");
});

test("a CSS-hidden first menu retries focus in a frame without stealing later focus", () => {
  for (const outcome of ["visible", "focus-away", "closed"]) {
    const frames = [];
    let visible = false;
    let expanded = "false";
    let ariaHidden = "true";
    let keydown;
    const doc = {
      activeElement: null,
      defaultView: {
        MutationObserver: class {
          observe() {}
        },
        requestAnimationFrame: (callback) => frames.push(callback)
      }
    };
    const menu = {
      id: "account-menu",
      ownerDocument: doc,
      inert: true,
      getAttribute: () => ariaHidden,
      addEventListener() {},
      getBoundingClientRect: () => ({}),
      querySelectorAll: () => [option]
    };
    const option = {
      disabled: false,
      hidden: false,
      closest: () => null,
      getAttribute: () => "false",
      focus() {
        if (visible && !menu.inert) doc.activeElement = option;
      }
    };
    const trigger = {
      setAttribute() {},
      getAttribute: () => expanded,
      addEventListener: (name, callback) => {
        if (name === "keydown") keydown = callback;
      },
      click() {
        expanded = "true";
        ariaHidden = "false";
      },
      focus() {
        doc.activeElement = trigger;
      }
    };
    doc.activeElement = trigger;
    const start = presentation.indexOf("function installExistingMenu(");
    const end = presentation.indexOf("function installDrawerFocus(", start);
    const context = vm.createContext({ nextOptionIndex, typeaheadIndex });
    vm.runInContext(presentation.slice(start, end), context);
    context.installExistingMenu(trigger, menu);
    keydown({ key: "ArrowDown", preventDefault() {} });
    assert.equal(doc.activeElement, trigger, "fixture preserves CSS visibility until a frame");
    if (outcome === "focus-away") doc.activeElement = { id: "outside-control" };
    if (outcome === "closed") expanded = "false";
    const previous = doc.activeElement;
    visible = true;
    frames.shift()();
    assert.equal(doc.activeElement, outcome === "visible" ? option : previous);
  }
});

test("a previously closed files drawer is synchronously focusable when reopened", () => {
  let focusCount = 0;
  const classes = { add() {}, remove() {} };
  const drawer = {
    hidden: true,
    inert: true,
    classList: classes,
    focus() {
      if (!this.inert) focusCount += 1;
    }
  };
  const context = vm.createContext({
    readFileSession: () => ({ kind: "CUSTOMER", token: "test-session" }),
    synchronizeRelatedFilesSession() {},
    relatedFilesShipmentId: "shipment-a",
    relatedFilesCloseTimer: null,
    relatedFilesBackdrop: { hidden: true, classList: classes },
    relatedFilesDrawer: drawer,
    relatedFilesButton: { setAttribute() {} },
    setRelatedFileCommentMessage() {},
    setRelatedFilesCategoryOpen() {},
    document: { body: { classList: classes } },
    requestAnimationFrame: (callback) => callback(),
    relatedFilesCustomerAccess: false,
    t: (key) => key,
    renderRelatedFilesDrawer() {},
    window: { clearTimeout() {}, setTimeout() {} }
  });
  const start = app.indexOf("function openRelatedFilesDrawer() {");
  const end = app.indexOf("async function loadRelatedFiles()", start);
  vm.runInContext(app.slice(start, end), context);
  context.openRelatedFilesDrawer();
  context.closeRelatedFilesDrawer({ immediate: true });
  drawer.inert = true; // State retained by the closed-drawer observer.
  context.openRelatedFilesDrawer();
  assert.equal(focusCount, 2);
  assert.equal(drawer.inert, false);
});

async function runAgentRefreshScenario({ cancel = false, switchAt = "" } = {}) {
  let current = { kind: "CUSTOMER", role: "OVERSEA_AGENT", token: "agent-a", id: 1 };
  const requests = [];
  let confirmations = 0;
  let reloads = 0;
  const switchIdentity = () => {
    current = { ...current, token: "agent-b", id: 2 };
  };
  const context = vm.createContext({
    URLSearchParams,
    readFileSession: () => current,
    isOverseaAgentSession: (session = current) => session.role === "OVERSEA_AGENT",
    fileSessionFingerprint: (session) => `${session.token}:${session.id}`,
    historyCustomerFilter: "",
    isRefreshableOverseaAgentShipment: () => true,
    agentBulkUpdating: false,
    agentBulkUpdateMode: "",
    agentBulkUpdateResult: null,
    agentBulkUpdateProgress: {},
    agentUpdateTask: null,
    agentManagementSelectedKeys: new Set(),
    clearError() {},
    renderHistory() {},
    renderAgentUpdateTaskDialog() {},
    createAgentUpdateTask: (entries, mode) => {
      context.agentUpdateTask = {
        mode,
        status: "RUNNING",
        total: entries.length,
        items: entries.map(() => ({ status: "PENDING" }))
      };
    },
    loadCustomerAssignedHistory: async () => {
      reloads += 1;
    },
    confirmTrackingAction: async () => {
      confirmations += 1;
      if (switchAt === "confirmation") switchIdentity();
      return !cancel;
    },
    fetch: async (url, options) => {
      const refresh = url.includes("/refresh");
      requests.push({ refresh, token: options.headers["X-Customer-Token"], url });
      return {
        ok: true,
        status: 200,
        json: async () => {
          if ((!refresh && switchAt === "loading") || (refresh && switchAt === "first-refresh"))
            switchIdentity();
          return refresh
            ? { snapshot: { fetchedAt: "2026-10-28T12:00:00Z" } }
            : {
                totalPages: 1,
                items: [1, 2].map((id) => ({
                  shipmentId: id,
                  referenceNo: `REF${id}`,
                  carrier: "COSCO",
                  referenceType: "BOOKING"
                }))
              };
        }
      };
    },
    t: (key) => key,
    showError: (message) => {
      throw new Error(message);
    },
    trackingResponseMessage: () => "Unexpected request error",
    clearFileSession() {}
  });
  const single = app.slice(
    app.indexOf("function isCurrentOverseaAgentSession("),
    app.indexOf("function agentShipmentCustomers(")
  );
  const load = app.slice(
    app.indexOf("async function loadAllRefreshableOverseaAgentShipments("),
    app.indexOf("function agentUpdateTaskShipmentNumber(")
  );
  const batch = app.slice(
    app.indexOf("async function performOverseaAgentShipmentRefresh("),
    app.indexOf("function renderHistory() {")
  );
  vm.runInContext(`${single}\n${load}\n${batch}`, context);
  await context.refreshAllOverseaAgentShipments();
  return {
    requests,
    confirmations,
    reloads,
    busy: context.agentBulkUpdating,
    mode: context.agentBulkUpdateMode,
    task: context.agentUpdateTask
  };
}

test("canceling refresh-all clears busy without issuing any shipment refresh", async () => {
  const result = await runAgentRefreshScenario({ cancel: true });
  assert.equal(result.confirmations, 1);
  assert.equal(result.requests.filter((request) => request.refresh).length, 0);
  assert.equal(result.busy, false);
  assert.equal(result.mode, "");
});

test("normal refresh-all keeps the initiating identity for loading and every refresh", async () => {
  const result = await runAgentRefreshScenario();
  assert.equal(result.requests.filter((request) => request.refresh).length, 2);
  assert.ok(result.requests.every((request) => request.token === "agent-a"));
  assert.equal(result.task.status, "COMPLETED");
  assert.equal(result.busy, false);
  assert.equal(result.reloads, 1);
});

test("identity changes during loading or confirmation cannot execute old entries with a new token", async () => {
  for (const switchAt of ["loading", "confirmation"]) {
    const result = await runAgentRefreshScenario({ switchAt });
    assert.equal(result.requests.filter((request) => request.refresh).length, 0);
    assert.equal(result.busy, false);
    assert.equal(result.mode, "");
    assert.equal(result.confirmations, switchAt === "loading" ? 0 : 1);
  }
});

test("an identity change during a refresh interrupts the queue before the next item", async () => {
  const result = await runAgentRefreshScenario({ switchAt: "first-refresh" });
  const refreshes = result.requests.filter((request) => request.refresh);
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].token, "agent-a");
  assert.equal(result.task.status, "INTERRUPTED");
  assert.equal(result.busy, false);
  assert.equal(result.reloads, 0);
});

test("the batch workbench entry is visible only for signed-in business managers", () => {
  for (const [kind, role, token, allowed] of [
    ["ANONYMOUS", "", "", false],
    ["CUSTOMER", "OVERSEA_AGENT", "customer", false],
    ["INTERNAL", "USER", "employee", false],
    ["INTERNAL", "ADMIN", "", false],
    ["INTERNAL", "ADMIN", "admin", true],
    ["INTERNAL", "BUSINESS", "business", true]
  ]) {
    let opened = 0;
    let focused = 0;
    let fileChoosers = 0;
    const session = { kind, token, user: { role } };
    const trigger = { hidden: true, setAttribute() {} };
    const dialog = {
      open: false,
      showModal() {
        this.open = true;
        opened += 1;
      },
      close() {
        this.open = false;
      }
    };
    const context = vm.createContext({
      readFileSession: () => session,
      batchWorkspaceTrigger: trigger,
      batchLegacyNotice: { hidden: true },
      batchWorkspaceDialog: dialog,
      batchState: null,
      renderBatchState() {},
      requestAnimationFrame: (callback) => callback(),
      batchSelectButton: {
        focus() {
          focused += 1;
        }
      },
      batchFileInput: {
        click() {
          fileChoosers += 1;
        }
      }
    });
    const permissionStart = app.indexOf("function canManageFileVisibility(");
    const permissionEnd = app.indexOf("function normalizeAssignableCustomer(", permissionStart);
    const start = app.indexOf("function canOpenBatchWorkspace(");
    const end = app.indexOf("function showBatchColumnPreview(", start);
    vm.runInContext(
      `${app.slice(permissionStart, permissionEnd)}\n${app.slice(start, end)}`,
      context
    );
    context.renderBatchWorkspaceAccess();
    assert.equal(trigger.hidden, !allowed, `${kind}/${role}`);
    assert.equal(opened, 0);
    assert.equal(focused, 0);
    assert.equal(fileChoosers, 0, "rendering the workbench entry must not launch the old chooser");
    context.closeBatchWorkspace();
    assert.equal(dialog.open, false);
    session.token = "";
    context.renderBatchWorkspaceAccess();
    assert.equal(dialog.open, false, "session loss closes the restricted workspace");
    assert.equal(trigger.hidden, true);
  }
});

test("canceling the batch file chooser does not parse, start or close the workspace", async () => {
  let onChange;
  const selectButton = { disabled: false };
  const context = vm.createContext({
    batchFileInput: {
      files: [],
      addEventListener: (_, callback) => {
        onChange = callback;
      }
    },
    batchRunning: false,
    batchSelectButton: selectButton,
    parseBatchFile() {
      throw new Error("chooser cancellation must not parse");
    },
    startImportedBatch() {
      throw new Error("chooser cancellation must not submit");
    },
    closeBatchWorkspace() {
      throw new Error("chooser cancellation must not close");
    }
  });
  const start = app.indexOf('batchFileInput?.addEventListener("change"');
  const end = app.indexOf("batchPreviewSheet?.addEventListener", start);
  vm.runInContext(app.slice(start, end), context);
  await onChange();
  assert.equal(selectButton.disabled, false);
});

test("legacy document metadata drawer/editor remain dormant instead of counted as visible pages", () => {
  assert.doesNotMatch(
    app,
    /documentDrawerLayer\.hidden = false|documentDrawerLayer\.classList\.add\("is-open"/
  );
  assert.match(
    app,
    /querySelector\("#open-document-drawer"\)\?\.addEventListener\("click", openRelatedFilesDrawer\)/
  );
  assert.match(
    app,
    /editButton\.addEventListener\("click", \(\) => openDocumentEditor\(definition\.code\)\)/
  );
});

test("the batch entry uses the existing platform navigation without opening or submitting legacy work", () => {
  for (const allowed of [true, false]) {
    let onClick;
    const scheduled = [];
    const destinations = [];
    const waits = [];
    const link = {
      href: "/customers/shipments",
      hasAttribute: () => true,
      addEventListener: (_, handler) => {
        onClick = handler;
      }
    };
    const context = vm.createContext({
      document: { querySelectorAll: () => [link], body: { classList: { contains: () => false } } },
      workspaceBridge: { embedded: false },
      batchWorkspaceTrigger: link,
      canOpenBatchWorkspace: () => allowed,
      showPlatformRouteWait: (key) => waits.push(key),
      hidePlatformRouteWait() {},
      window: {
        matchMedia: () => ({ matches: false }),
        setTimeout: (callback, delay) => scheduled.push({ callback, delay }),
        location: { assign: (url) => destinations.push(url) }
      },
      openBatchWorkspace() {
        throw new Error("the dormant dialog must not open");
      },
      runBatchQueue() {
        throw new Error("navigation must not submit a queue");
      }
    });
    const start = app.indexOf(
      'document.querySelectorAll("[data-home-link], [data-platform-link]")'
    );
    const end = app.indexOf('document.querySelector("#portal-return-link")', start);
    vm.runInContext(app.slice(start, end), context);
    onClick({ button: 0, preventDefault() {} });
    for (const entry of scheduled.filter((entry) => entry.delay === 180)) entry.callback();
    assert.deepEqual(destinations, allowed ? ["/customers/shipments"] : []);
    assert.deepEqual(waits, allowed ? ["batch.workspaceOpening"] : []);
  }
});

test("loading a legacy local queue preserves records without automatically resuming a task", () => {
  const legacy = { taskId: "old-task", status: "paused", items: [{ number: "OLD123" }] };
  const context = vm.createContext({
    clearLegacyBrowserSnapshots() {},
    restoreBatchState: () => legacy,
    batchState: null,
    persistBatchState() {},
    historyLoadingState: false,
    readFileSession: () => ({ kind: "INTERNAL" }),
    currentLanguage: "en",
    applyLanguage() {},
    window: {
      setTimeout() {
        throw new Error("initialization must not schedule legacy batch work");
      }
    },
    runBatchQueue() {
      throw new Error("initialization must not resume a legacy task");
    }
  });
  const start = app.indexOf("clearLegacyBrowserSnapshots();");
  const end = app.indexOf("async function initializeTrackingPage()", start);
  vm.runInContext(app.slice(start, end), context);
  assert.equal(context.batchState, legacy);
});
