import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { useAdminDevices } from "../src/features/admin/useAdminDevices.js";
const admin = (id = 1) => ({ id, username: "admin-" + id, role: "ADMIN" });
const device = (id = 1, online = true) => ({
  id,
  username: "user-" + id,
  deviceName: "Browser " + id,
  online
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(t) {
  const user = ref(admin()),
    hostBusy = ref(false),
    calls = [],
    events = [];
  const implementations = {
    fetchDevices: async () => ({ items: [device()], total: 1 }),
    kickDevice: async () => {},
    deleteDevice: async () => {},
    confirmDelete: async () => true
  };
  const invoke =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return implementations[name](...args);
    };
  const scope = effectScope();
  const workflow = scope.run(() =>
    useAdminDevices({
      currentUser: user,
      isHostBusy: () => hostBusy.value,
      services: {
        fetchDevices: invoke("fetchDevices"),
        kickDevice: invoke("kickDevice"),
        deleteDevice: invoke("deleteDevice")
      },
      confirmDelete: invoke("confirmDelete"),
      t: (key) => key,
      translate: (text) => text,
      feedback: {
        clear: () => events.push(["clear"]),
        handled: (error) => events.push(["handled", error]),
        success: (text) => events.push(["success", text]),
        error: (text) => events.push(["error", text])
      }
    })
  );
  t.after(() => scope.stop());
  return {
    workflow,
    user,
    hostBusy,
    scope,
    implementations,
    calls,
    events,
    called: (name) => calls.filter((call) => call[0] === name)
  };
}
test("devices use server pagination and accept only the newest response", async (t) => {
  const h = harness(t),
    a = deferred(),
    b = deferred();
  h.implementations.fetchDevices = () => a.promise;
  const first = h.workflow.loadDevicePage();
  h.implementations.fetchDevices = () => b.promise;
  const second = h.workflow.changeDevicePage(2);
  b.resolve({ items: [device(21)], total: 21 });
  assert.equal(await second, true);
  a.resolve({ items: [device()], total: 1 });
  assert.equal(await first, false);
  assert.equal(h.workflow.devices.value[0].id, 21);
  assert.equal(h.workflow.devicePage.value, 2);
  assert.equal(h.workflow.busy.value, false);
  assert.deepEqual(
    h.called("fetchDevices").map((c) => c[1]),
    [
      { page: 0, size: 20 },
      { page: 1, size: 20 }
    ]
  );
});
test("a stale read error cannot replace current list feedback", async (t) => {
  const h = harness(t),
    old = deferred();
  h.implementations.fetchDevices = () => old.promise;
  const reading = h.workflow.loadDevicePage();
  h.implementations.fetchDevices = async () => ({ items: [device(2)], total: 1 });
  await h.workflow.loadDevicePage();
  old.reject(Error("old"));
  assert.equal(await reading, false);
  assert.equal(h.events.filter((e) => e[0] === "error").length, 0);
  assert.equal(h.workflow.devices.value[0].id, 2);
});
test("directly edited pagination invalidates an in-flight list", async (t) => {
  const h = harness(t),
    response = deferred();
  h.implementations.fetchDevices = () => response.promise;
  const reading = h.workflow.loadDevicePage();
  h.workflow.devicePageSize.value = 10;
  response.resolve({ items: [device()], total: 1 });
  assert.equal(await reading, false);
  assert.deepEqual(h.workflow.devices.value, []);
});
for (const reason of ["switch-back", "role", "dispose"])
  test("devices clear old scope on " + reason, async (t) => {
    const h = harness(t);
    await h.workflow.loadDevicePage();
    const response = deferred();
    h.implementations.fetchDevices = () => response.promise;
    const reading = h.workflow.loadDevicePage();
    if (reason === "switch-back") {
      h.user.value = admin(2);
      h.user.value = admin();
    }
    if (reason === "role") h.user.value = { ...admin(), role: "BUSINESS" };
    if (reason === "dispose") h.scope.stop();
    response.resolve({ items: [device(2)], total: 10 });
    assert.equal(await reading, false);
    assert.deepEqual(h.workflow.devices.value, []);
    assert.equal(h.workflow.deviceTotal.value, 0);
    assert.equal(h.workflow.busy.value, false);
  });
test("changing only the administrator display name preserves the active device request", async (t) => {
  const h = harness(t),
    response = deferred();
  h.implementations.fetchDevices = () => response.promise;
  const reading = h.workflow.loadDevicePage();
  h.user.value = { ...h.user.value, displayName: "New name" };
  response.resolve({ items: [device()], total: 1 });
  assert.equal(await reading, true);
});
test("invalid pages and unauthorized or busy actions never call the service", async (t) => {
  const h = harness(t);
  for (const value of [0, -1, 1.5, NaN, Infinity])
    assert.equal(await h.workflow.changeDevicePage(value), false);
  h.hostBusy.value = true;
  assert.equal(await h.workflow.handleKickDevice(device()), false);
  assert.equal(await h.workflow.handleDeleteDevice(device()), false);
  assert.equal(await h.workflow.changeDevicePage(2), false);
  h.hostBusy.value = false;
  h.user.value = null;
  assert.equal(await h.workflow.loadDevicePage(), false);
  assert.equal(await h.workflow.handleDeleteDevice(device()), false);
  assert.equal(h.calls.length, 0);
});
test("offline devices cannot be kicked again", async (t) => {
  const h = harness(t);
  assert.equal(await h.workflow.handleKickDevice(device(1, false)), false);
  assert.equal(h.calls.length, 0);
});
test("kick commits once and does not refresh unrelated dashboard resources", async (t) => {
  const h = harness(t);
  await h.workflow.loadDevicePage();
  const write = deferred();
  h.implementations.kickDevice = () => write.promise;
  h.implementations.fetchDevices = async () => ({ items: [device(1, false)], total: 1 });
  const action = h.workflow.handleKickDevice(device());
  assert.equal(h.workflow.busy.value, true);
  assert.equal(await h.workflow.handleKickDevice(device()), false);
  assert.equal(await h.workflow.handleDeleteDevice(device()), false);
  assert.equal(await h.workflow.changeDevicePage(2), false);
  assert.equal(await h.workflow.loadDevicePage(), false);
  write.resolve({});
  assert.equal(await action, true);
  assert.equal(h.called("kickDevice").length, 1);
  assert.equal(h.workflow.devices.value[0].online, false);
  assert.equal(h.workflow.busy.value, false);
  assert.deepEqual(h.events.at(-1), ["success", "adminWorkflow.deviceKicked"]);
});
test("delete confirmation owns an immutable target and locks duplicate actions", async (t) => {
  const h = harness(t),
    confirmation = deferred();
  h.implementations.confirmDelete = (target) => {
    assert.equal(Object.isFrozen(target), true);
    return confirmation.promise;
  };
  const target = device(7),
    action = h.workflow.handleDeleteDevice(target);
  target.id = 99;
  assert.equal(await h.workflow.handleDeleteDevice(device(8)), false);
  confirmation.resolve(true);
  assert.equal(await action, true);
  assert.equal(h.called("deleteDevice")[0][1], 7);
});
test("canceling a delete retains list and releases pending state", async (t) => {
  const h = harness(t);
  await h.workflow.loadDevicePage();
  h.implementations.confirmDelete = async () => false;
  assert.equal(await h.workflow.handleDeleteDevice(device()), false);
  assert.equal(h.called("deleteDevice").length, 0);
  assert.equal(h.workflow.devices.value.length, 1);
  assert.equal(h.workflow.busy.value, false);
});
test("switching accounts during confirmation cancels the old write", async (t) => {
  const h = harness(t),
    confirmation = deferred();
  h.implementations.confirmDelete = () => confirmation.promise;
  const action = h.workflow.handleDeleteDevice(device());
  h.user.value = admin(2);
  confirmation.resolve(true);
  assert.equal(await action, false);
  assert.equal(h.called("deleteDevice").length, 0);
  assert.deepEqual(h.events, []);
});
test("a host operation beginning during confirmation prevents the write", async (t) => {
  const h = harness(t),
    confirmation = deferred();
  h.implementations.confirmDelete = () => confirmation.promise;
  const action = h.workflow.handleDeleteDevice(device());
  h.hostBusy.value = true;
  confirmation.resolve(true);
  assert.equal(await action, false);
  assert.equal(h.called("deleteDevice").length, 0);
  assert.equal(h.workflow.busy.value, false);
});
for (const action of ["kick", "delete"])
  test(action + " success survives refresh failure without suggesting another write", async (t) => {
    const h = harness(t);
    await h.workflow.loadDevicePage();
    h.implementations.fetchDevices = async () => {
      throw Error("refresh failed");
    };
    const result = await (action === "kick"
      ? h.workflow.handleKickDevice(device())
      : h.workflow.handleDeleteDevice(device()));
    assert.equal(result, true);
    assert.deepEqual(h.events.at(-1), ["error", "adminWorkflow.savedRefreshFailed"]);
    assert.equal(h.called(action === "kick" ? "kickDevice" : "deleteDevice").length, 1);
    if (action === "kick") assert.equal(h.workflow.devices.value[0].online, false);
    else {
      assert.deepEqual(h.workflow.devices.value, []);
      assert.equal(h.workflow.deviceTotal.value, 0);
    }
    assert.equal(h.workflow.busy.value, false);
  });
test("a failed write leaves the original device and allows retry", async (t) => {
  const h = harness(t);
  await h.workflow.loadDevicePage();
  h.implementations.kickDevice = async () => {
    throw Error("permission denied");
  };
  assert.equal(await h.workflow.handleKickDevice(device()), false);
  assert.equal(h.workflow.devices.value[0].online, true);
  assert.equal(h.called("fetchDevices").length, 1);
  assert.deepEqual(h.events.at(-1), ["error", "permission denied"]);
  assert.equal(h.workflow.busy.value, false);
});
test("confirmation exceptions report once without executing delete", async (t) => {
  const h = harness(t);
  h.implementations.confirmDelete = async () => {
    throw Error("confirm failed");
  };
  assert.equal(await h.workflow.handleDeleteDevice(device()), false);
  assert.equal(h.called("deleteDevice").length, 0);
  assert.deepEqual(h.events.at(-1), ["error", "confirm failed"]);
});
test("deleting the last row of a page loads the preceding valid page", async (t) => {
  const h = harness(t);
  h.workflow.devicePage.value = 2;
  h.workflow.devices.value = [device(21)];
  h.workflow.deviceTotal.value = 21;
  h.implementations.fetchDevices = async (options) => ({
    items: options.page === 1 ? [] : [device(20)],
    total: 20
  });
  assert.equal(await h.workflow.handleDeleteDevice(device(21)), true);
  assert.equal(h.workflow.devicePage.value, 1);
  assert.equal(h.workflow.devices.value[0].id, 20);
  assert.equal(h.workflow.deviceTotal.value, 20);
  assert.deepEqual(
    h.called("fetchDevices").map((c) => c[1].page),
    [1, 0]
  );
});
test("page correction cannot overwrite a newer administrator page request", async (t) => {
  const h = harness(t),
    correction = deferred();
  h.workflow.devicePage.value = 3;
  h.implementations.fetchDevices = (options) =>
    options.page === 2 ? Promise.resolve({ items: [], total: 21 }) : correction.promise;
  const read = h.workflow.loadDevicePage();
  await Promise.resolve();
  h.implementations.fetchDevices = async () => ({ items: [device()], total: 21 });
  assert.equal(await h.workflow.changeDevicePage(1), true);
  correction.resolve({ items: [device(21)], total: 21 });
  assert.equal(await read, false);
  assert.equal(h.workflow.devicePage.value, 1);
  assert.equal(h.workflow.devices.value[0].id, 1);
});
test("late completed writes cannot repopulate a different account's device list", async (t) => {
  const h = harness(t),
    write = deferred();
  await h.workflow.loadDevicePage();
  h.implementations.kickDevice = () => write.promise;
  const action = h.workflow.handleKickDevice(device());
  h.user.value = admin(2);
  write.resolve({});
  assert.equal(await action, false);
  assert.deepEqual(h.workflow.devices.value, []);
  assert.equal(h.events.filter((e) => e[0] === "success").length, 0);
  assert.equal(h.called("fetchDevices").length, 1);
});
test("current-page read failure reaches the list caller and releases loading", async (t) => {
  const h = harness(t);
  h.implementations.fetchDevices = async () => {
    throw Error("read failed");
  };
  await assert.rejects(h.workflow.loadDevicePage(), /read failed/);
  assert.equal(h.workflow.busy.value, false);
  assert.equal(await h.workflow.changeDevicePage(2), false);
  assert.deepEqual(h.events.at(-1), ["error", "read failed"]);
});

test("switching scopes during a committed write's refresh suppresses old completion", async (t) => {
  const h = harness(t);
  await h.workflow.loadDevicePage();
  const refresh = deferred();
  h.implementations.fetchDevices = () => refresh.promise;
  const action = h.workflow.handleKickDevice(device());
  await Promise.resolve();
  h.user.value = admin(2);
  refresh.resolve({ items: [device(1, false)], total: 1 });
  assert.equal(await action, false);
  assert.deepEqual(h.workflow.devices.value, []);
  assert.equal(h.workflow.busy.value, false);
  assert.equal(h.events.filter((event) => event[0] === "success").length, 0);
});
