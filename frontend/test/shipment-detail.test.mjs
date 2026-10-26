import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import { useShipmentDetail } from "../src/features/shipments/useShipmentDetail.js";

// Test the same composable used by the page, with real Vue watchers and controlled I/O.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function shipment(id) {
  return {
    shipmentId: id,
    carrier: "COSCO",
    referenceType: "BOOKING",
    referenceNo: `${id}-booking`,
    note: `${id}-note`,
    vesselVoyage: `${id}-vessel`,
    trackingStatus: `${id}-status`
  };
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function harness(t) {
  const reads = [];
  const saves = [];
  const manualSaves = [];
  const invalidations = [];
  const refreshes = [];
  const deletions = [];
  const notices = [];
  const collect = (queue) => (id, body) => {
    const pending = deferred();
    queue.push({ id, body: structuredClone(body), ...pending });
    return pending.promise;
  };
  const context = {
    canManage: ref(true),
    nextTick,
    selectedShipmentId: ref("A"),
    menuItem: ref("shipments"),
    subView: ref("detail"),
    availableShipments: ref([shipment("A"), shipment("B"), shipment("C")]),
    shipments: ref([]),
    selectedCustomer: ref(null),
    selectedCustomerId: ref(""),
    shipmentTrackingChannel: ref("DEFAULT"),
    window: {
      prompt: () => "Bad snapshot",
      confirm: () => true
    },
    fetchBusinessShipmentSnapshot: collect(reads),
    updateBusinessShipment: collect(saves),
    updateBusinessShipmentManualSnapshot: collect(manualSaves),
    invalidateBusinessShipmentSnapshot: collect(invalidations),
    requestTracking: (body, signal) => {
      const pending = deferred();
      refreshes.push({ body, signal, ...pending });
      return pending.promise.then(async (response) => ({
        response,
        data: await response.json().catch(() => ({}))
      }));
    },
    preferredTrackingReference: (item) => ({ type: item.referenceType, number: item.referenceNo }),
    primaryBoundCustomerName: () => "",
    normalizeBusinessShipment: (item) => item,
    replaceShipmentInLocalCollections: (item) => {
      context.availableShipments.value = context.availableShipments.value.map((current) =>
        current.shipmentId === item.shipmentId ? item : current
      );
    },
    loadAvailableShipments: async () => {},
    selectCustomer: async () => {},
    deleteBusinessShipment: collect(deletions),
    navigateTo: (menu) => {
      context.menuItem.value = menu;
      context.subView.value = "list";
    },
    t: (key) => key,
    showSuccess: (key) => notices.push({ type: "success", key }),
    showError: (error, key) => notices.push({ type: "error", error, key }),
    showInfo: (key) => notices.push({ type: "info", key })
  };
  const scope = effectScope();
  const feature = scope.run(() =>
    useShipmentDetail({
      ...context,
      tick: () => context.nextTick(),
      promptInvalidation: (...args) => context.window.prompt(...args),
      confirmDeletion: (...args) => context.window.confirm(...args)
    })
  );
  Object.assign(context, feature, { form: feature.detailForm });
  t.after(() => scope.stop());
  const select = async (id) => {
    context.selectedShipmentId.value = id;
    await nextTick();
  };
  const ready = async () => {
    reads[0].resolve(shipment("A"));
    await flush();
  };
  return {
    context,
    reads,
    saves,
    manualSaves,
    invalidations,
    refreshes,
    deletions,
    notices,
    select,
    ready,
    unmount: () => {
      scope.stop();
    }
  };
}

test("read-only operations users cannot call detail write APIs", async (t) => {
  const h = harness(t);
  await h.ready();
  h.context.canManage.value = false;
  await h.context.saveManualSnapshot();
  await h.context.saveShipmentDetail();
  await h.context.invalidateSnapshot();
  await h.context.removeShipment();
  assert.equal(
    h.saves.length + h.manualSaves.length + h.invalidations.length + h.deletions.length,
    0
  );
  assert.equal(h.context.selectedShipment.value.shipmentId, "A");
});

test("late A detail response cannot overwrite B or clear B's loading state", async (t) => {
  const h = harness(t);
  await h.select("B");
  h.reads[0].resolve({ ...shipment("A"), vesselVoyage: "late-A" });
  await flush();
  assert.equal(h.context.loadingShipmentDetail.value, true);
  assert.equal(h.context.form.vesselVoyage, "B-vessel");
  h.reads[1].resolve({ ...shipment("B"), vesselVoyage: "fresh-B" });
  await flush();
  assert.equal(h.context.detailShipmentSnapshot.value.shipmentId, "B");
  assert.equal(h.context.form.vesselVoyage, "fresh-B");
  assert.equal(h.context.loadingShipmentDetail.value, false);
});

test("detail can load a ticket outside the current list page", async (t) => {
  const h = harness(t);
  h.context.availableShipments.value = [shipment("B")];
  await flush();
  assert.equal(h.context.selectedShipmentId.value, "A");
  h.reads[0].resolve(shipment("A"));
  await flush();
  assert.equal(h.context.selectedShipment.value.shipmentId, "A");
  h.context.availableShipments.value = [shipment("C")];
  await flush();
  assert.equal(h.context.selectedShipment.value.shipmentId, "A");
});

test("authoritative forbidden or missing detail clears the selection; network errors retain it", async (t) => {
  for (const status of [403, 404, 503]) {
    const h = harness(t);
    h.reads[0].reject(Object.assign(new Error("detail unavailable"), { status }));
    await flush();
    assert.equal(h.context.selectedShipmentId.value, status === 503 ? "A" : "");
    assert.equal(h.context.loadingShipmentDetail.value, false);
    assert.equal(h.notices.length, 1);
  }
});

test("newest request wins even when two reads target the same ticket", async (t) => {
  const h = harness(t);
  const newer = h.context.loadShipmentDetailSnapshot();
  h.reads[1].resolve({ ...shipment("A"), note: "latest note" });
  await newer;
  h.reads[0].resolve({ ...shipment("A"), note: "older note" });
  await flush();
  assert.equal(h.context.form.note, "latest note");
});

test("an old read failure cannot clear a newer ticket or show an irrelevant error", async (t) => {
  const h = harness(t);
  await h.select("B");
  h.reads[1].resolve(shipment("B"));
  await flush();
  h.reads[0].reject(new Error("A request failed"));
  await flush();
  assert.equal(h.context.detailShipmentSnapshot.value.shipmentId, "B");
  assert.deepEqual(h.notices, []);
});

for (const [functionName, queueName, changedField] of [
  ["saveShipmentDetail", "saves", "vesselVoyage"],
  ["saveManualSnapshot", "manualSaves", "note"]
]) {
  test(`${functionName}: completing A while viewing B does not restore A's fields`, async (t) => {
    const h = harness(t);
    await h.ready();
    h.context.form[changedField] = "A unsaved value";
    const pending = h.context[functionName]();
    const request = h[queueName][0];
    assert.equal(request.id, "A");
    await h.select("B");
    h.reads[1].resolve(shipment("B"));
    await flush();
    request.resolve(shipment("A"));
    await pending;
    await flush();
    assert.equal(h.context.form[changedField], shipment("B")[changedField]);
    assert.equal(h.context.detailShipmentSnapshot.value.shipmentId, "B");
    assert.equal(h.context.savingShipment.value, false);
    assert.deepEqual(h.notices, []);
  });

  test(`${functionName}: current-ticket save preserves the other section's unsaved fields`, async (t) => {
    const h = harness(t);
    await h.ready();
    h.context.form[changedField] = "keep unsaved edit";
    const pending = h.context[functionName]();
    h[queueName][0].resolve({ ...shipment("A"), [changedField]: "server value" });
    await pending;
    await flush();
    assert.equal(h.context.form[changedField], "keep unsaved edit");
    assert.equal(h.notices[0]?.type, "success");
  });
}

test("returning to A creates a new context, so an old A save cannot overwrite new edits", async (t) => {
  const h = harness(t);
  await h.ready();
  h.context.form.vesselVoyage = "old unsaved A";
  const pending = h.context.saveShipmentDetail();
  await h.select("B");
  await h.select("A");
  h.reads[2].resolve({ ...shipment("A"), vesselVoyage: "new A context" });
  await flush();
  h.saves[0].resolve(shipment("A"));
  await pending;
  await flush();
  assert.equal(h.context.form.vesselVoyage, "new A context");
});

test("switching during nextTick also prevents restoring saved-ticket fields", async (t) => {
  const h = harness(t);
  await h.ready();
  h.context.form.vesselVoyage = "A manual edit";
  h.context.nextTick = async () => h.select("B");
  const pending = h.context.saveShipmentDetail();
  h.saves[0].resolve(shipment("A"));
  await pending;
  await flush();
  assert.equal(h.context.form.vesselVoyage, "B-vessel");
  assert.deepEqual(h.notices, []);
});

test("duplicate submissions are blocked and an old save failure does not affect B's pending read", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.saveShipmentDetail();
  await h.context.saveShipmentDetail();
  assert.equal(h.saves.length, 1);
  await h.select("B");
  h.saves[0].reject(new Error("A save failed"));
  await pending;
  assert.equal(h.context.loadingShipmentDetail.value, true);
  assert.equal(h.context.form.note, "B-note");
  assert.deepEqual(h.notices, []);
});

test("invalidation finishing after a ticket switch does not reload or notify the new detail", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.invalidateSnapshot();
  await h.select("B");
  h.invalidations[0].resolve({ invalidated: true });
  await pending;
  assert.equal(h.reads.length, 2);
  assert.equal(h.context.loadingShipmentDetail.value, true);
  assert.deepEqual(h.notices, []);
});

test("carrier response for A is not shown or applied after switching to B", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.refreshShipmentFromCarrier();
  assert.equal(h.refreshes[0].body.number, "A-booking");
  await h.select("B");
  h.refreshes[0].resolve({ ok: true, status: 200, json: async () => ({ snapshot: {} }) });
  await pending;
  assert.equal(h.context.refreshTrackingResponse.value, null);
  assert.equal(h.context.refreshTrackingStatus.value, "");
  assert.equal(h.context.form.vesselVoyage, "B-vessel");
  assert.equal(h.context.refreshingShipment.value, false);
  assert.deepEqual(h.notices, []);
});

test("leaving the detail view invalidates a pending save even when the ticket ID stays the same", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.saveShipmentDetail();
  h.context.subView.value = "list";
  h.saves[0].resolve(shipment("A"));
  await pending;
  assert.equal(h.context.detailShipmentSnapshot.value, null);
  assert.deepEqual(h.notices, []);
});

test("the current read's failure is reported and releases its loading state", async (t) => {
  const h = harness(t);
  h.reads[0].reject(new Error("Current read failed"));
  await flush();
  assert.equal(h.context.loadingShipmentDetail.value, false);
  assert.equal(h.notices[0]?.type, "error");
});

test("component unmount prevents pending save and read responses from mutating its state", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.saveShipmentDetail();
  const read = h.context.loadShipmentDetailSnapshot();
  h.unmount();
  h.saves[0].resolve({ ...shipment("A"), vesselVoyage: "late save" });
  h.reads[1].resolve({ ...shipment("A"), vesselVoyage: "late read" });
  await Promise.all([pending, read]);
  assert.equal(h.context.detailShipmentSnapshot.value, null);
  assert.deepEqual(h.notices, []);
});

test("deleting A does not navigate away from B after a selection change", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.removeShipment();
  await h.select("B");
  h.deletions[0].resolve({ deleted: true });
  await pending;
  assert.equal(h.context.subView.value, "detail");
  assert.equal(h.context.selectedShipmentId.value, "B");
  assert.deepEqual(h.notices, []);
});

const detailMutations = [
  ["saveShipmentDetail", "saves"],
  ["saveManualSnapshot", "manualSaves"],
  ["invalidateSnapshot", "invalidations"],
  ["refreshShipmentFromCarrier", "refreshes"],
  ["removeShipment", "deletions"]
];

for (const [activeMutation, activeQueue] of detailMutations) {
  test(`${activeMutation}: competing mutations cannot start while this operation is pending`, async (t) => {
    const h = harness(t);
    await h.ready();
    const pending = h.context[activeMutation]();
    for (const [otherMutation] of detailMutations) await h.context[otherMutation]();
    for (const [, queue] of detailMutations)
      assert.equal(h[queue].length, queue === activeQueue ? 1 : 0);

    await h.select("B");
    const result =
      activeQueue === "refreshes"
        ? { ok: true, status: 200, json: async () => ({ snapshot: {} }) }
        : shipment("A");
    h[activeQueue][0].resolve(result);
    await pending;
    assert.equal(h.context.form.note, "B-note");
    assert.deepEqual(h.notices, []);
  });
}

test("detail mutations wait for the selected ticket's initial read", async (t) => {
  const h = harness(t);
  for (const [mutation, queue] of detailMutations) {
    await h.context[mutation]();
    assert.equal(h[queue].length, 0);
  }
  assert.equal(h.context.loadingShipmentDetail.value, true);
});

test("scope disposal aborts an active carrier query and ignores its late response", async (t) => {
  const h = harness(t);
  await h.ready();
  const pending = h.context.refreshShipmentFromCarrier();
  await flush();
  assert.equal(h.refreshes.length, 1);
  assert.equal(h.refreshes[0].signal.aborted, false);
  h.unmount();
  assert.equal(h.refreshes[0].signal.aborted, true);
  h.refreshes[0].resolve(
    new Response(JSON.stringify({ snapshot: { trackingStatus: "late" } }), { status: 200 })
  );
  await pending;
  assert.equal(h.saves.length, 0);
  assert.equal(h.notices.length, 0);
});
