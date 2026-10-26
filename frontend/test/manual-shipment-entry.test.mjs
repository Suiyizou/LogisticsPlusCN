import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref, nextTick } from "vue";
import * as XLSX from "xlsx";
import { useManualShipmentEntry } from "../src/features/shipments/useManualShipmentEntry.js";
import {
  buildManualShipmentPayload,
  shipmentImportIdentity
} from "../src/features/shipments/manualShipmentEntryModel.js";
import { buildManualShipmentImportTemplate } from "../src/services/manualShipmentExcelImport.js";

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
function file(name = "tickets.xlsx") {
  const data = XLSX.write(buildManualShipmentImportTemplate(XLSX), {
    type: "array",
    bookType: "xlsx"
  });
  return { name, size: data.byteLength, arrayBuffer: async () => data };
}
function harness(t) {
  const calls = { conflicts: [], writes: [], confirms: [] };
  const queued =
    (key) =>
    (...args) => {
      const pending = deferred();
      calls[key].push({ ...pending, args: structuredClone(args) });
      return pending.promise;
    };
  const notices = [],
    downloads = [],
    handled = [];
  const canManage = ref(true),
    ownerIdentity = ref("business-a:BUSINESS"),
    sharedBusy = ref(false);
  const customers = ref([{ id: "A" }, { id: "B" }]);
  const scope = effectScope();
  const reload = { count: 0, implementation: async () => true };
  const loader = {
    implementation: async () => ({
      ...XLSX,
      writeFile: (workbook, name) => downloads.push({ workbook, name })
    })
  };
  const workflow = scope.run(() =>
    useManualShipmentEntry({
      canManage,
      ownerIdentity,
      entryWriteBusy: sharedBusy,
      selectedCustomerId: ref("A"),
      assignableCustomers: customers,
      shipmentPage: ref(3),
      loadAvailableShipments: () => {
        reload.count++;
        return reload.implementation();
      },
      createBusinessShipment: queued("writes"),
      inspectBusinessShipmentImportConflicts: queued("conflicts"),
      confirm: queued("confirms"),
      loadXlsxModule: () => loader.implementation(),
      t: (key, args) => key + (args ? JSON.stringify(args) : ""),
      showSuccess: (...args) => notices.push({ kind: "success", args }),
      showError: (...args) => notices.push({ kind: "error", args }),
      markApiErrorHandled: (error) => handled.push(error)
    })
  );
  t.after(() => scope.stop());
  return {
    workflow,
    scope,
    calls,
    notices,
    downloads,
    handled,
    canManage,
    ownerIdentity,
    sharedBusy,
    customers,
    loader,
    reload
  };
}
async function ready(h, count = 1) {
  h.workflow.openShipmentExcelImport();
  await h.workflow.parseShipmentExcelImportFile(file());
  const item = h.workflow.shipmentExcelImportPreview.value.items[0];
  assert.ok(item);
  const items = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(JSON.parse(JSON.stringify(item))),
    importKey: "key-" + index,
    referenceNo: "123456" + index,
    payload: { ...JSON.parse(JSON.stringify(item.payload)), referenceNo: "123456" + index }
  }));
  h.workflow.shipmentExcelImportPreview.value = {
    ...h.workflow.shipmentExcelImportPreview.value,
    items,
    total: count,
    valid: count
  };
  return items;
}
function openManual(h) {
  h.workflow.openShipmentCreateDialog();
  h.workflow.shipmentCreateForm.referenceNo = "COSU123456789";
  h.workflow.shipmentCreateForm.latestEventName = "Gate in";
}

test("manual model preserves required route nodes, derives loading ports and strips UI state", (t) => {
  const h = harness(t),
    w = h.workflow;
  w.shipmentCreateForm.routeNodes[1].city = "Shanghai";
  w.shipmentCreateForm.routeNodes[1].countryCode = " cn ";
  w.shipmentCreateForm.routeNodes[2].city = "Rotterdam";
  w.shipmentCreateForm.containerTypes[0].type = "40hq";
  w.shipmentCreateForm.containerTypes[0].quantity = 2;
  w.addManualTransshipment();
  assert.equal(w.shipmentCreateForm.routeNodes[2].locationType, "TSP");
  w.removeManualRouteNode(0);
  assert.equal(w.shipmentCreateForm.routeNodes.length, 5);
  w.removeManualRouteNode(2);
  w.addManualRoutingLeg();
  w.addManualContainer();
  const payload = buildManualShipmentPayload(w.shipmentCreateForm);
  assert.equal(payload.portOfLoading, "Shanghai");
  assert.equal(payload.portOfDischarge, "Rotterdam");
  assert.equal(payload.routeNodes[1].countryCode, "CN");
  assert.equal(payload.volume, "40HQ × 2");
  assert.equal(payload.routeNodes[0].key, undefined);
  assert.equal(payload.routeNodes[0].required, undefined);
  assert.equal(payload.routingLegs[0].loadPort, "Shanghai");
  w.resetShipmentCreateForm();
  assert.equal(w.shipmentCreateForm.routeNodes[1].city, "");
});
test("booking identities normalize COSCO prefix, whitespace and case", () => {
  assert.equal(
    shipmentImportIdentity({ carrier: "cosco", referenceNo: " COSU 123456789 " }),
    "COSCO|BOOKING|123456789"
  );
  assert.equal(
    shipmentImportIdentity({ carrier: "cma", bookingNumber: "ABC 123" }),
    "CMA|BOOKING|ABC123"
  );
});
test("actual XLSX template parses complete multi-sheet ticket and same-file input is reset", async (t) => {
  const h = harness(t),
    w = h.workflow;
  w.openShipmentExcelImport();
  const input = { files: [file()], value: "tickets.xlsx" };
  await w.onShipmentExcelImportFileChange({ target: input });
  assert.equal(input.value, "");
  assert.equal(w.shipmentExcelImportPreview.value.valid, 1);
  assert.equal(w.shipmentExcelImportPreview.value.items[0].payload.routeNodes.length, 5);
  assert.equal(w.shipmentExcelImportPreview.value.items[0].payload.containers.length, 1);
  assert.equal(w.canStartShipmentExcelImport.value, true);
});
test("invalid extension and oversized workbook clear stale preview without loading XLSX", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await ready(h);
  h.loader.implementation = () => {
    throw new Error("must not load");
  };
  await w.parseShipmentExcelImportFile({ name: "a.pdf" });
  assert.deepEqual(w.shipmentExcelImportPreview.value.globalErrors, [
    "customers.shipmentExcelUnsupportedFile"
  ]);
  await w.parseShipmentExcelImportFile({ name: "large.xlsx", size: 10 * 1024 * 1024 + 1 });
  assert.deepEqual(w.shipmentExcelImportPreview.value.globalErrors, [
    "customers.shipmentExcelFileTooLarge"
  ]);
  assert.equal(w.canStartShipmentExcelImport.value, false);
});
test("latest workbook wins when prior arrayBuffer resolves last", async (t) => {
  const h = harness(t),
    w = h.workflow,
    old = deferred();
  w.openShipmentExcelImport();
  const first = w.parseShipmentExcelImportFile({
    ...file("old.xlsx"),
    arrayBuffer: () => old.promise
  });
  await flush();
  await w.parseShipmentExcelImportFile(file("new.xlsx"));
  old.resolve(new Uint8Array([1, 2, 3]).buffer);
  await first;
  assert.equal(w.shipmentExcelImportFileName.value, "new.xlsx");
  assert.equal(w.shipmentExcelImportPreview.value.valid, 1);
  assert.equal(w.shipmentExcelImportParsing.value, false);
});
test("closing a parsing session stops late results and reopening starts clean", async (t) => {
  const h = harness(t),
    w = h.workflow,
    pending = deferred();
  h.loader.implementation = () => pending.promise;
  w.openShipmentExcelImport();
  const parsing = w.parseShipmentExcelImportFile(file());
  await flush();
  assert.equal(w.shipmentExcelImportParsing.value, true);
  w.closeShipmentExcelImport();
  w.openShipmentExcelImport();
  pending.resolve(XLSX);
  await parsing;
  assert.equal(w.shipmentExcelImportPreview.value.total, 0);
  assert.equal(w.shipmentExcelImportParsing.value, false);
});
test("parsing errors are visible and a replacement workbook can recover", async (t) => {
  const h = harness(t),
    w = h.workflow;
  w.openShipmentExcelImport();
  await w.parseShipmentExcelImportFile({
    ...file(),
    arrayBuffer: async () => {
      throw new Error("read denied");
    }
  });
  assert.deepEqual(w.shipmentExcelImportPreview.value.globalErrors, ["read denied"]);
  await w.parseShipmentExcelImportFile(file());
  assert.equal(w.canStartShipmentExcelImport.value, true);
});
test("read-only account cannot open, parse, submit or export tickets", async (t) => {
  const h = harness(t),
    w = h.workflow;
  h.canManage.value = false;
  w.openShipmentCreateDialog();
  w.openShipmentExcelImport();
  await w.parseShipmentExcelImportFile(file());
  await w.downloadShipmentExcelTemplate();
  await w.createShipment();
  await w.startShipmentExcelImport();
  assert.equal(w.shipmentCreateDialogOpen.value, false);
  assert.equal(w.shipmentExcelImportDialogOpen.value, false);
  assert.equal(h.calls.conflicts.length, 0);
  assert.equal(h.downloads.length, 0);
});
test("manual submission fixes payload, customer and publication across conflict inspection", async (t) => {
  const h = harness(t),
    w = h.workflow;
  openManual(h);
  const saving = w.createShipment();
  w.shipmentCreateCustomerId.value = "B";
  w.shipmentCreatePublishToCustomer.value = false;
  w.shipmentCreateForm.referenceNo = "999999";
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  assert.equal(h.calls.writes[0].args[0].referenceNo, "COSU123456789");
  assert.deepEqual(h.calls.writes[0].args.slice(1), ["A", true, false]);
  h.calls.writes[0].resolve({});
  assert.equal(await saving, true);
  assert.equal(w.shipmentCreateForm.referenceNo, "999999");
  assert.equal(w.shipmentCreateDialogOpen.value, true);
});
test("manual and Excel writes share one gate and hold it through refresh", async (t) => {
  const h = harness(t),
    w = h.workflow,
    reload = deferred();
  await ready(h);
  openManual(h);
  h.reload.implementation = () => reload.promise;
  const saving = w.createShipment();
  await w.createShipment();
  await w.startShipmentExcelImport();
  assert.equal(h.calls.conflicts.length, 1);
  w.closeShipmentCreateDialog();
  assert.equal(w.shipmentCreateDialogOpen.value, true);
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.calls.writes[0].resolve({});
  await flush();
  assert.equal(h.sharedBusy.value, true);
  assert.equal(w.canStartShipmentExcelImport.value, false);
  reload.resolve(true);
  await saving;
  assert.equal(h.sharedBusy.value, false);
});
test("single ticket snapshot overwrite requires approval and normalization matches existing reference", async (t) => {
  const h = harness(t);
  openManual(h);
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({
    conflicts: [{ carrier: "COSCO", referenceNo: "123456789", hasCurrentSnapshot: true }]
  });
  await flush();
  assert.equal(h.calls.confirms.length, 1);
  assert.equal(h.calls.writes.length, 0);
  h.calls.confirms[0].resolve();
  await flush();
  assert.equal(h.calls.writes[0].args[3], true);
  h.calls.writes[0].resolve({ overwritten: true });
  await saving;
});
test("manual overwrite cancellation keeps draft and sends no write", async (t) => {
  const h = harness(t);
  openManual(h);
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({
    conflicts: [{ referenceNo: "123456789", hasCurrentSnapshot: true }]
  });
  await flush();
  h.calls.confirms[0].reject("cancel");
  assert.equal(await saving, false);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.workflow.shipmentCreateForm.referenceNo, "COSU123456789");
  assert.equal(h.sharedBusy.value, false);
});
test("lost customer access during inspection stops submission", async (t) => {
  const h = harness(t);
  openManual(h);
  const saving = h.workflow.createShipment();
  h.customers.value = [{ id: "B" }];
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await saving;
  assert.equal(h.calls.writes.length, 0);
});
test("owner change during confirmation invalidates previous account ticket", async (t) => {
  const h = harness(t);
  openManual(h);
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({
    conflicts: [{ referenceNo: "123456789", hasCurrentSnapshot: true }]
  });
  await flush();
  h.ownerIdentity.value = "business-b:BUSINESS";
  h.calls.confirms[0].resolve();
  await saving;
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.workflow.shipmentCreateCustomerId.value, "");
});
test("successful manual write remains successful when refresh throws", async (t) => {
  const h = harness(t);
  openManual(h);
  h.reload.implementation = async () => {
    throw new Error("refresh offline");
  };
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.calls.writes[0].resolve({});
  assert.equal(await saving, true);
  assert.equal(h.workflow.shipmentCreateDialogOpen.value, false);
  assert.equal(h.notices.at(-1).args[1], "customers.loadAvailableShipmentsFailed");
});
test("failed manual write keeps form for correction and releases gate", async (t) => {
  const h = harness(t);
  openManual(h);
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.calls.writes[0].reject(new Error("validation"));
  assert.equal(await saving, false);
  assert.equal(h.workflow.shipmentCreateDialogOpen.value, true);
  assert.equal(h.notices.at(-1).args[1], "customers.shipmentCreateFailed");
  assert.equal(h.sharedBusy.value, false);
});
test("Excel imports fix all items/customer/publication and preserve mixed per-row outcomes", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await ready(h, 5);
  const importing = w.startShipmentExcelImport();
  w.shipmentExcelCustomerId.value = "B";
  w.shipmentExcelPublishToCustomer.value = false;
  w.shipmentExcelImportPreview.value.items[0].payload.referenceNo = "MUTATED";
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  assert.equal(h.calls.writes.length, 4);
  assert.equal(h.calls.writes[0].args[0].referenceNo, "1234560");
  assert.deepEqual(h.calls.writes[0].args.slice(1), ["A", true, false]);
  h.calls.writes[0].resolve({});
  h.calls.writes[1].reject(new Error("row failed"));
  h.calls.writes[2].resolve({ overwritten: true });
  h.calls.writes[3].resolve({});
  await flush();
  assert.equal(h.calls.writes.length, 5);
  h.calls.writes[4].resolve({});
  const result = await importing;
  assert.equal(result.succeeded, 4);
  assert.equal(result.failed, 1);
  assert.deepEqual(
    w.shipmentExcelImportResults.value.map((row) => row.status),
    ["CREATED", "FAILED", "UPDATED", "CREATED", "CREATED"]
  );
  assert.equal(h.handled.length, 1);
  assert.equal(h.reload.count, 1);
  assert.equal(w.canStartShipmentExcelImport.value, false);
});
test("Excel keep existing skips conflicts while importing new tickets", async (t) => {
  const h = harness(t),
    w = h.workflow;
  const items = await ready(h, 2);
  const importing = w.startShipmentExcelImport();
  h.calls.conflicts[0].resolve({
    checked: 2,
    conflicts: [{ ...items[0].payload, hasCurrentSnapshot: true }]
  });
  await flush();
  assert.equal(h.calls.confirms[0].args[2].distinguishCancelAndClose, true);
  h.calls.confirms[0].resolve();
  await flush();
  assert.equal(h.calls.writes.length, 1);
  assert.equal(h.calls.writes[0].args[0].referenceNo, "1234561");
  h.calls.writes[0].resolve({});
  await importing;
  assert.deepEqual(
    w.shipmentExcelImportResults.value.map((row) => row.status),
    ["SKIPPED", "CREATED"]
  );
  assert.equal(w.shipmentExcelImportProgress.value.skipped, 1);
});
test("Excel explicit update action overwrites conflicts; closing confirmation aborts", async (t) => {
  const h = harness(t);
  const items = await ready(h);
  let importing = h.workflow.startShipmentExcelImport();
  h.calls.conflicts[0].resolve({ checked: 1, conflicts: [items[0].payload] });
  await flush();
  h.calls.confirms[0].reject("close");
  await importing;
  assert.equal(h.calls.writes.length, 0);
  importing = h.workflow.startShipmentExcelImport();
  h.calls.conflicts[1].resolve({ checked: 1, conflicts: [items[0].payload] });
  await flush();
  h.calls.confirms[1].reject("cancel");
  await flush();
  assert.equal(h.calls.writes[0].args[3], true);
  h.calls.writes[0].resolve({ overwritten: true });
  await importing;
  assert.equal(h.workflow.shipmentExcelImportResults.value[0].status, "UPDATED");
});
test("inspection failure preserves Excel preview for retry", async (t) => {
  const h = harness(t);
  await ready(h);
  const importing = h.workflow.startShipmentExcelImport();
  h.calls.conflicts[0].reject(new Error("offline"));
  await importing;
  assert.equal(h.workflow.shipmentExcelImportPreview.value.valid, 1);
  assert.equal(h.workflow.canStartShipmentExcelImport.value, true);
  assert.equal(h.notices.at(-1).args[1], "customers.shipmentExcelImportConflictCheckFailed");
});
test("scope disposal stops queued Excel requests without cancelling in-flight writes", async (t) => {
  const h = harness(t);
  await ready(h, 8);
  const importing = h.workflow.startShipmentExcelImport();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  assert.equal(h.calls.writes.length, 4);
  h.scope.stop();
  assert.equal(h.sharedBusy.value, true);
  h.calls.writes.forEach((call) => call.resolve({}));
  await importing;
  assert.equal(h.calls.writes.length, 4);
  assert.equal(h.sharedBusy.value, false);
  assert.equal(h.reload.count, 0);
  assert.equal(h.notices.length, 0);
});
test("ownership change invalidates pending workbook parse", async (t) => {
  const h = harness(t),
    pending = deferred();
  h.loader.implementation = () => pending.promise;
  h.workflow.openShipmentExcelImport();
  const parsing = h.workflow.parseShipmentExcelImportFile(file());
  await flush();
  h.ownerIdentity.value = "business-b:BUSINESS";
  pending.resolve(XLSX);
  await parsing;
  assert.equal(h.workflow.shipmentExcelImportPreview.value.total, 0);
  assert.equal(h.workflow.shipmentExcelImportParsing.value, false);
});
test("loss of assigned customer stops queued import and preserves finished rows", async (t) => {
  const h = harness(t);
  await ready(h, 6);
  const importing = h.workflow.startShipmentExcelImport();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.customers.value = [{ id: "B" }];
  h.calls.writes.forEach((call) => call.resolve({}));
  const outcome = await importing;
  assert.equal(h.calls.writes.length, 4);
  assert.equal(h.workflow.shipmentExcelImportProgress.value.done, 4);
  assert.equal(
    h.workflow.shipmentExcelImportResults.value.filter((row) => row.status === "CREATED").length,
    4
  );
  assert.equal(outcome.stopped, true);
  assert.equal(outcome.notSubmitted, 2);
  assert.equal(outcome.failed, 0);
  assert.equal(
    h.workflow.shipmentExcelImportResults.value.filter((row) => row.status === "NOT_SUBMITTED")
      .length,
    2
  );
  assert.equal(
    h.workflow.shipmentExcelImportResults.value.some((row) => row.status === "PENDING"),
    false
  );
  assert.equal(h.notices[0].args[1], "customers.manualImportStopped");
});
test("result export snapshots rows, guards duplicate downloads and builds actual XLSX workbook", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await ready(h);
  w.shipmentExcelImportResults.value = [
    {
      importKey: "a",
      carrier: "COSCO",
      referenceType: "BOOKING",
      referenceNo: "123",
      status: "CREATED",
      message: "ok"
    }
  ];
  const pending = deferred();
  h.loader.implementation = () => pending.promise;
  const exporting = w.downloadShipmentExcelImportResults();
  await w.downloadShipmentExcelImportResults();
  w.shipmentExcelImportResults.value[0].message = "changed";
  pending.resolve({ ...XLSX, writeFile: (workbook) => h.downloads.push({ workbook }) });
  await exporting;
  assert.equal(h.downloads.length, 1);
  const values = XLSX.utils.sheet_to_json(
    h.downloads[0].workbook.Sheets[h.downloads[0].workbook.SheetNames[0]],
    { header: 1 }
  );
  assert.ok(values.flat().includes("ok"));
  assert.ok(!values.flat().includes("changed"));
});
test("failed result export preserves rows for explicit retry", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await ready(h);
  w.shipmentExcelImportResults.value = [{ importKey: "a", status: "CREATED" }];
  h.loader.implementation = async () => {
    throw new Error("download blocked");
  };
  await w.downloadShipmentExcelImportResults();
  assert.equal(w.shipmentExcelImportResults.value.length, 1);
  assert.equal(w.shipmentExcelExporting.value, false);
  assert.equal(h.notices.at(-1).args[1], "customers.shipmentExcelResultsFailed");
  h.loader.implementation = async () => ({ ...XLSX, writeFile: () => h.downloads.push({}) });
  await w.downloadShipmentExcelImportResults();
  assert.equal(h.downloads.length, 1);
});
test("closing results invalidates deferred export", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await ready(h);
  w.shipmentExcelImportResults.value = [{ importKey: "a", status: "CREATED" }];
  const pending = deferred();
  h.loader.implementation = () => pending.promise;
  const exporting = w.downloadShipmentExcelImportResults();
  w.closeShipmentExcelImport();
  pending.resolve({ ...XLSX, writeFile: () => h.downloads.push({}) });
  await exporting;
  assert.equal(h.downloads.length, 0);
});

test("parsing session cannot start an import or stale replacement while entry gate is held", async (t) => {
  const h = harness(t),
    w = h.workflow;
  await ready(h);
  const pending = deferred();
  h.loader.implementation = () => pending.promise;
  const parsing = w.parseShipmentExcelImportFile(file("waiting.xlsx"));
  await flush();
  assert.equal(w.canStartShipmentExcelImport.value, false);
  await w.startShipmentExcelImport();
  assert.equal(h.calls.conflicts.length, 0);
  pending.resolve(XLSX);
  await parsing;
  const importing = w.startShipmentExcelImport();
  await w.parseShipmentExcelImportFile(file("replacement.xlsx"));
  assert.equal(w.shipmentExcelImportFileName.value, "waiting.xlsx");
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.calls.writes[0].resolve({});
  await importing;
});

test("permission revocation stops queued imports and clears previous account UI", async (t) => {
  const h = harness(t);
  await ready(h, 7);
  const importing = h.workflow.startShipmentExcelImport();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.canManage.value = false;
  h.calls.writes.forEach((call) => call.resolve({}));
  await importing;
  assert.equal(h.calls.writes.length, 4);
  assert.equal(h.workflow.shipmentExcelImportDialogOpen.value, false);
  assert.equal(h.workflow.shipmentExcelImportPreview.value.total, 0);
  assert.equal(h.reload.count, 0);
  assert.equal(h.sharedBusy.value, false);
});

test("scope disposal after manual request submission waits for write but suppresses stale UI", async (t) => {
  const h = harness(t);
  openManual(h);
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.scope.stop();
  assert.equal(h.sharedBusy.value, true);
  h.calls.writes[0].resolve({});
  assert.equal(await saving, true);
  assert.equal(h.reload.count, 0);
  assert.equal(h.notices.length, 0);
  assert.equal(h.sharedBusy.value, false);
});

test("false list refresh does not turn successful manual creation into failed creation", async (t) => {
  const h = harness(t);
  openManual(h);
  h.reload.implementation = async () => false;
  const saving = h.workflow.createShipment();
  h.calls.conflicts[0].resolve({ conflicts: [] });
  await flush();
  h.calls.writes[0].resolve({});
  assert.equal(await saving, true);
  assert.equal(h.notices.filter((notice) => notice.kind === "error").length, 0);
  assert.equal(h.workflow.shipmentCreateDialogOpen.value, false);
});
