import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useShipmentBatchTask } from "../src/features/shipments/useShipmentBatchTask.js";
import { useShipmentBatchTracking } from "../src/features/shipments/useShipmentBatchTracking.js";
import { prepareSheet } from "../src/services/shipmentBatchImport.js";
import {
  presentBatchTask,
  batchTrackElapsedText,
  batchDiagnosticText
} from "../src/features/shipments/batchTrackingPresentation.js";

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
}
function timers() {
  const timeouts = new Map(),
    intervals = new Map();
  let id = 0;
  return {
    timeouts,
    intervals,
    setTimeout(fn, delay) {
      const key = ++id;
      timeouts.set(key, { fn, delay });
      return key;
    },
    clearTimeout(key) {
      timeouts.delete(key);
    },
    setInterval(fn, delay) {
      const key = ++id;
      intervals.set(key, { fn, delay });
      return key;
    },
    clearInterval(key) {
      intervals.delete(key);
    },
    fire() {
      const [key, timer] = timeouts.entries().next().value || [];
      assert.ok(timer, "an observation timer should exist");
      timeouts.delete(key);
      timer.fn();
    }
  };
}
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}
function snapshot(id = "task-A", status = "RUNNING", extra = {}) {
  return { taskId: id, mode: "IMPORT", status, total: 2, processed: 0, items: [], ...extra };
}
function harness(t, options = {}) {
  const reads = [],
    cancellations = [],
    completed = [];
  const scheduler = timers();
  const storage = options.storage || memoryStorage();
  const scope = effectScope();
  const job = scope.run(() =>
    useShipmentBatchTask({
      owner: options.owner || "alice",
      scheduler,
      storage: () => storage,
      now: () => 100000,
      fetchTask(id) {
        const pending = deferred();
        reads.push({ id, ...pending });
        return pending.promise;
      },
      cancelTask(id) {
        const pending = deferred();
        cancellations.push({ id, ...pending });
        return pending.promise;
      },
      onTerminal: (data) => completed.push(data)
    })
  );
  t.after(() => scope.stop());
  return { job, scope, reads, cancellations, completed, scheduler, storage };
}

test("start is mutually exclusive with conflict inspection, refresh and task restoration", async (t) => {
  const h = harness(t),
    inspection = deferred();
  let created = 0;
  const pending = h.job.start({
    beforeCreate: () => inspection.promise,
    createTask: async () => {
      created++;
      return snapshot();
    }
  });
  assert.equal(h.job.starting.value, true);
  assert.equal(await h.job.start({ createTask: async () => snapshot("other") }), null);
  await h.job.restore();
  assert.equal(h.reads.length, 0);
  inspection.resolve(true);
  await pending;
  assert.equal(created, 1);
  assert.equal(h.job.running.value, true);
  assert.equal(h.storage.getItem("business-shipment-batch-task-id:alice"), "task-A");
  assert.equal(h.scheduler.timeouts.size, 1);
  assert.equal(h.scheduler.intervals.size, 1);
});

test("declining conflicts leaves no pending task or timer", async (t) => {
  const h = harness(t);
  await h.job.start({
    beforeCreate: async () => false,
    createTask: () => assert.fail("must not create"),
    initialTask: { status: "QUEUED" }
  });
  assert.equal(h.job.task.value, null);
  assert.equal(h.job.running.value, false);
  assert.equal(h.job.starting.value, false);
  assert.equal(h.scheduler.timeouts.size, 0);
});

test("leaving while checking conflicts never submits a server task", async (t) => {
  const h = harness(t),
    check = deferred();
  const pending = h.job.start({
    beforeCreate: () => check.promise,
    createTask: () => assert.fail("left before approval")
  });
  h.scope.stop();
  check.resolve(true);
  await pending;
  assert.equal(h.scheduler.timeouts.size, 0);
  assert.equal(h.storage.data.size, 0);
});

test("pending cancellation is sent when a refresh creation returns its ID", async (t) => {
  const h = harness(t),
    creation = deferred();
  const pending = h.job.start({ createTask: () => creation.promise });
  await h.job.cancel();
  assert.equal(h.cancellations.length, 0);
  creation.resolve(snapshot());
  await flush();
  assert.equal(h.cancellations[0].id, "task-A");
  h.cancellations[0].resolve(snapshot("task-A", "STOPPED"));
  await pending;
  assert.equal(h.job.running.value, false);
  assert.equal(h.job.cancelRequested.value, false);
  assert.equal(h.completed.length, 1);
  assert.equal(h.storage.data.size, 0);
  assert.equal(h.scheduler.timeouts.size, 0);
});

test("an old poll cannot overwrite STOPPING or restart a completed task", async (t) => {
  const h = harness(t);
  await h.job.start({ createTask: async () => snapshot() });
  h.scheduler.fire();
  const stopping = h.job.cancel();
  h.cancellations[0].resolve(snapshot("task-A", "STOPPING"));
  await stopping;
  h.reads[0].resolve(snapshot("task-A", "RUNNING", { processed: 1 }));
  await flush();
  assert.equal(h.job.task.value.status, "STOPPING");
  h.scheduler.fire();
  h.reads[1].resolve(snapshot("task-A", "STOPPED"));
  await flush();
  assert.equal(h.completed.length, 1);
  assert.equal(h.scheduler.timeouts.size, 0);
  assert.equal(h.scheduler.intervals.size, 0);
});

test("a late failed poll after stop does not discard task recovery", async (t) => {
  const h = harness(t);
  await h.job.start({ createTask: async () => snapshot() });
  h.scheduler.fire();
  const stopping = h.job.cancel();
  h.cancellations[0].resolve(snapshot("task-A", "STOPPING"));
  await stopping;
  h.reads[0].reject({ status: 404 });
  await flush();
  assert.equal(h.job.taskId.value, "task-A");
  assert.equal(h.job.running.value, true);
  assert.equal(h.storage.data.size, 1);
});

test("unmount stops timers and late observation without cancelling backend work", async (t) => {
  const h = harness(t);
  await h.job.start({ createTask: async () => snapshot() });
  h.scheduler.fire();
  const before = h.job.task.value;
  h.scope.stop();
  h.reads[0].resolve(snapshot("task-A", "COMPLETED"));
  await flush();
  assert.equal(h.job.task.value, before);
  assert.equal(h.scheduler.timeouts.size, 0);
  assert.equal(h.scheduler.intervals.size, 0);
  assert.equal(h.cancellations.length, 0);
  assert.equal(h.completed.length, 0);
  assert.equal(h.storage.data.size, 1);
});

test("unmount during creation preserves the returned ID for another visit", async (t) => {
  const h = harness(t),
    creation = deferred();
  const pending = h.job.start({ createTask: () => creation.promise });
  h.scope.stop();
  creation.resolve(snapshot());
  await pending;
  assert.equal(h.storage.getItem("business-shipment-batch-task-id:alice"), "task-A");
  assert.equal(h.job.taskId.value, "");
  assert.equal(h.scheduler.timeouts.size, 0);
});

test("a late create cannot overwrite a newer page's remembered task", async (t) => {
  const h = harness(t),
    creation = deferred();
  const pending = h.job.start({ createTask: () => creation.promise });
  h.scope.stop();
  h.storage.setItem("business-shipment-batch-task-id:alice", "newer");
  creation.resolve(snapshot());
  await pending;
  assert.equal(h.storage.getItem("business-shipment-batch-task-id:alice"), "newer");
});

test("a stop requested during creation is honored even after leaving", async (t) => {
  const h = harness(t),
    creation = deferred();
  const pending = h.job.start({ createTask: () => creation.promise });
  await h.job.cancel();
  h.scope.stop();
  creation.resolve(snapshot());
  await flush();
  h.cancellations[0].resolve(snapshot("task-A", "STOPPED"));
  await pending;
  assert.equal(h.storage.data.size, 0);
  assert.equal(h.scheduler.timeouts.size, 0);
});

test("task restoration is scoped by authenticated owner and cleans terminal IDs", async (t) => {
  const storage = memoryStorage();
  storage.setItem("business-shipment-batch-task-id:alice", "alice-task");
  storage.setItem("business-shipment-batch-task-id:bob", "bob-task");
  const h = harness(t, { storage, owner: "alice" });
  const restoring = h.job.restore();
  assert.equal(h.reads[0].id, "alice-task");
  h.reads[0].resolve(snapshot("alice-task", "PAUSED", { stopReason: "CIRCUIT_BREAKER" }));
  await restoring;
  assert.equal(h.job.running.value, false);
  assert.equal(storage.getItem("business-shipment-batch-task-id:alice"), null);
  assert.equal(storage.getItem("business-shipment-batch-task-id:bob"), "bob-task");
  assert.equal(h.completed.length, 1);
});

test("temporary poll failure retries; forbidden or deleted tasks stop recovery", async (t) => {
  for (const status of [403, 404]) {
    const h = harness(t);
    await h.job.start({ createTask: async () => snapshot() });
    h.scheduler.fire();
    h.reads[0].reject(new Error("temporary network failure"));
    await flush();
    assert.equal([...h.scheduler.timeouts.values()][0].delay, 3000);
    h.scheduler.fire();
    h.reads[1].reject({ status });
    await flush();
    assert.equal(h.job.running.value, false);
    assert.equal(h.storage.data.size, 0);
    assert.equal(h.scheduler.timeouts.size, 0);
    assert.equal(h.job.error.value.action, "poll");
  }
});

test("failed cancellation resumes observation and allows another attempt", async (t) => {
  const h = harness(t);
  await h.job.start({ createTask: async () => snapshot() });
  const stopping = h.job.cancel();
  h.cancellations[0].reject(new Error("cancel request lost"));
  await stopping;
  assert.equal(h.job.running.value, true);
  assert.equal(h.job.cancelRequested.value, false);
  assert.equal(h.job.error.value.action, "cancel");
  assert.equal(h.scheduler.timeouts.size, 1);
  const retry = h.job.cancel();
  h.cancellations[1].resolve(snapshot("task-A", "STOPPED"));
  await retry;
  assert.equal(h.job.running.value, false);
  assert.equal(h.job.error.value, null);
});

test("blocked browser storage does not prevent starting or stopping", async (t) => {
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    }
  };
  const h = harness(t, { storage: blocked });
  await h.job.restore();
  await h.job.start({ createTask: async () => snapshot("task-A", "COMPLETED") });
  assert.equal(h.job.starting.value, false);
  assert.equal(h.completed.length, 1);
});

const translate = (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key);
function uiHarness(t, overrides = {}) {
  const scheduler = timers(),
    scope = effectScope(),
    created = [],
    refreshed = [];
  const context = {
    owner: "alice",
    scheduler,
    storage: () => memoryStorage(),
    now: () => 100000,
    selectedCustomerId: ref("customer-A"),
    assignableCustomers: ref([{ id: "customer-A" }]),
    shipmentTrackingChannel: ref("AUTO"),
    refreshingShipment: ref(false),
    selectedShipmentRows: ref([
      { shipmentId: "s-A" },
      { shipmentId: "s-A" },
      { shipmentId: "s-B" }
    ]),
    shipmentTableRef: ref({ clearSelection() {} }),
    createShipmentBatchTask: async (payload) => {
      created.push(payload);
      return snapshot();
    },
    createShipmentRefreshAllTask: async () =>
      snapshot("task-A", "RUNNING", { mode: "REFRESH_ALL" }),
    createShipmentBatchRefreshTask: async (ids, channel) => {
      refreshed.push({ ids, channel });
      return snapshot("task-A", "RUNNING", { mode: "REFRESH_SELECTED" });
    },
    fetchShipmentBatchTask: async () => snapshot(),
    cancelShipmentBatchTask: async () => snapshot("task-A", "STOPPED"),
    inspectBusinessShipmentImportConflicts: async () => ({ conflicts: [] }),
    loadAvailableShipments() {},
    loadXlsxModule: async () => ({
      read: (bytes) => bytes,
      utils: { sheet_to_json: (rows) => rows }
    }),
    waitForNextPaint: async () => {},
    confirm: () => true,
    t: translate,
    formatDateTime: (text) => text,
    showSuccess() {},
    ...overrides
  };
  const ui = scope.run(() => useShipmentBatchTracking(context));
  t.after(() => scope.stop());
  const sheet = prepareSheet("Bookings", [
    ["Booking", "Carrier"],
    ["COSU1234567890", "COSCO"]
  ]);
  ui.batchTrackSheets.value = [sheet];
  ui.batchTrackSelectedSheetName.value = sheet.name;
  ui.batchTrackCustomerId.value = "customer-A";
  ui.batchTrackFileName.value = "A.xlsx";
  return { ui, scope, context, scheduler, created, refreshed };
}
function fileEvent(name, bytes) {
  return {
    target: {
      files: [
        { name, arrayBuffer: () => (bytes instanceof Promise ? bytes : Promise.resolve(bytes)) }
      ],
      value: name
    }
  };
}
function workbook(number) {
  return { SheetNames: ["Bookings"], Sheets: { Bookings: [["Booking"], [number]] } };
}

test("import captures the same customer, items and channel inspected before submission", async (t) => {
  const inspection = deferred();
  const h = uiHarness(t, { inspectBusinessShipmentImportConflicts: () => inspection.promise });
  const pending = h.ui.startBatchTrack();
  h.ui.batchTrackCustomerId.value = "customer-B";
  h.ui.batchTrackCarrier.value = "CMA";
  h.context.shipmentTrackingChannel.value = "PROXY";
  h.ui.batchTrackPublishToCustomer.value = false;
  await h.ui.startRefreshAllShipments();
  inspection.resolve({ conflicts: [] });
  await pending;
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].customerId, "customer-A");
  assert.equal(h.created[0].channel, "AUTO");
  assert.equal(h.created[0].items[0].carrier, "COSCO");
  assert.equal(h.created[0].publishToCustomer, true);
});

test("refresh selected deduplicates shipment IDs and clears selection only after submission", async (t) => {
  let cleared = 0;
  const creation = deferred();
  const h = uiHarness(t, {
    createShipmentBatchRefreshTask: (ids, channel) => {
      assert.deepEqual(ids, ["s-A", "s-B"]);
      assert.equal(channel, "AUTO");
      return creation.promise;
    },
    shipmentTableRef: ref({ clearSelection: () => cleared++ })
  });
  const pending = h.ui.startRefreshSelectedShipments();
  assert.equal(cleared, 0);
  h.context.shipmentTrackingChannel.value = "PROXY";
  creation.resolve(snapshot("task-A", "RUNNING", { mode: "REFRESH_SELECTED" }));
  await pending;
  assert.equal(cleared, 1);
  assert.equal(h.context.selectedShipmentRows.value.length, 0);
});

test("closing the panel keeps observation running; reopening retains progress", async (t) => {
  const h = uiHarness(t);
  await h.ui.startRefreshAllShipments();
  assert.equal(h.ui.batchTrackDialogOpen.value, true);
  h.ui.toggleBatchTrackPanel();
  assert.equal(h.ui.batchTrackDialogOpen.value, false);
  assert.equal(h.ui.batchTrackRunning.value, true);
  assert.equal(h.scheduler.timeouts.size, 1);
  h.ui.toggleBatchTrackPanel();
  assert.equal(h.ui.batchTrackMode.value, "REFRESH_ALL");
});

test("a second workbook wins when the first finishes late", async (t) => {
  const h = uiHarness(t),
    older = deferred();
  const first = h.ui.handleBatchTrackWorkbook(fileEvent("old.xlsx", older.promise));
  await flush();
  await h.ui.handleBatchTrackWorkbook(fileEvent("new.xlsx", workbook("COSU2222222222")));
  older.resolve(workbook("COSU1111111111"));
  await first;
  assert.equal(h.ui.batchTrackFileName.value, "new.xlsx");
  assert.deepEqual(h.ui.batchTrackNumbers.value, ["2222222222"]);
  assert.equal(h.ui.batchTrackFileParsing.value, false);
});

test("clearing or leaving invalidates unfinished workbook parsing", async (t) => {
  for (const leave of [false, true]) {
    const h = uiHarness(t),
      read = deferred();
    const pending = h.ui.handleBatchTrackWorkbook(fileEvent("pending.xlsx", read.promise));
    await flush();
    if (leave) h.scope.stop();
    else h.ui.clearBatchTrackFile();
    read.reject(Error("late parsing failure"));
    await pending;
    assert.equal(h.ui.batchTrackFileName.value, "");
    assert.equal(h.ui.batchTrackResults.value.length, 0);
  }
});

test("native input FileList is read before resetting its value", async (t) => {
  const h = uiHarness(t),
    event = fileEvent("native.xlsx", workbook("COSU3333333333"));
  const file = event.target.files[0];
  Object.defineProperty(event.target, "value", {
    set() {
      event.target.files = [];
    }
  });
  h.ui.batchTrackFileInput.value = event.target;
  await h.ui.handleBatchTrackWorkbook(event);
  assert.equal(h.ui.batchTrackFileName.value, file.name);
});

test("terminal partial results default to problems and reload shipments once", async (t) => {
  let reloads = 0;
  const h = uiHarness(t, {
    createShipmentBatchTask: async () =>
      snapshot("task-A", "COMPLETED", {
        processed: 2,
        partial: 1,
        items: [
          { number: "A", status: "SUCCEEDED" },
          {
            number: "B",
            status: "PARTIAL",
            subtasks: [
              { status: "FAILED", error: "same" },
              { status: "FAILED", error: "same" }
            ]
          }
        ]
      }),
    loadAvailableShipments: () => reloads++
  });
  await h.ui.startBatchTrack();
  assert.equal(reloads, 1);
  assert.equal(h.ui.batchTrackProblemsOnly.value, true);
  assert.equal(h.ui.visibleBatchTrackResults.value.length, 1);
  assert.equal(h.ui.visibleBatchTrackResults.value[0].message, "same");
  assert.equal(h.scheduler.timeouts.size, 0);
});

test("presentation preserves child failure diagnostics and authoritative elapsed time", () => {
  const task = snapshot("task-A", "PAUSED", {
    stopReason: "CIRCUIT_BREAKER",
    elapsedMs: 20000,
    items: [
      { number: "A", status: "RUNNING" },
      {
        number: "B",
        status: "PARTIAL",
        mainStatus: "SUCCEEDED",
        subtasks: [
          {
            type: "BOOKING_REFERENCE",
            status: "FAILED",
            errorCode: "TIMEOUT",
            error: "Timed out",
            proxyNode: "node-1"
          }
        ]
      }
    ]
  });
  const view = presentBatchTask(task, 100000, translate, (text) => text);
  assert.equal(view.results[0].status, "stopped");
  assert.equal(view.results[1].mainStatus, "SUCCEEDED");
  assert.equal(view.results[1].errorCode, "TIMEOUT");
  assert.match(batchDiagnosticText(view.results[1]), /\[BOOKING_REFERENCE\] proxyNode: node-1/);
  assert.equal(batchTrackElapsedText(view.progress, 105000, translate), "00:25");
  assert.equal(
    batchTrackElapsedText(
      { elapsedMs: 20000, finishedAt: "2026-10-10T01:00:00Z" },
      900000,
      translate
    ),
    "00:20"
  );
});

test("stopped and circuit-paused retries do not report that retrying is still active", () => {
  for (const status of ["STOPPED", "PAUSED"]) {
    const { results } = presentBatchTask(
      snapshot("task-A", status, {
        stopReason: "CIRCUIT_BREAKER",
        items: [{ status: "RETRY_WAIT", error: "temporary upstream failure" }]
      }),
      100000,
      translate,
      (text) => text
    );
    assert.equal(results[0].status, "stopped");
    assert.equal(
      results[0].message,
      status === "STOPPED" ? "customers.trackStopped" : "customers.batchTrackCircuitSkipped"
    );
  }
});
