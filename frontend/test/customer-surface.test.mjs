import assert from "node:assert/strict";
import test from "node:test";
import { effectScope } from "vue";
import { createCustomerApi } from "../src/modules/customer-space/customerApi.js";
import { useCustomerSurface } from "../src/modules/customer-space/useCustomerSurface.js";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function fixture(t, overrides = {}) {
  let token = "customer-token",
    saved = { customer: { id: "customer-1", username: "client", displayName: "Client" } },
    saves = 0;
  const session = {
    readToken: () => token,
    read: () => saved,
    expired: () => false,
    clear: () => {
      token = "";
      saved = null;
    },
    save: (response) => {
      token = response.token;
      saved = response;
      saves++;
    },
    ...overrides.session
  };
  const requests = [];
  const api = {
    request: async (...args) => {
      requests.push(args);
      return { items: [] };
    },
    login: async () => ({
      token: "new-customer-token",
      customer: { id: "customer-2", username: "second" }
    }),
    ...overrides.api
  };
  const scope = effectScope(),
    runtime = scope.run(() => useCustomerSurface({ session, api }));
  t.after(() => scope.stop());
  return { session, runtime, requests, scope, saves: () => saves };
}
test("customer transport sends only customer credentials and cannot request internal routes", async () => {
  const calls = [];
  let token = "customer-only",
    employeeToken = "employee-secret";
  const api = createCustomerApi({
    readToken: () => token,
    clearSession: () => {
      token = "";
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ items: [] }) };
    }
  });
  await api.request("/customer/shipments?page=1");
  assert.deepEqual(calls[0].options.headers, {
    "Content-Type": "application/json",
    "X-Customer-Token": "customer-only"
  });
  assert.equal(JSON.stringify(calls).includes(employeeToken), false);
  for (const path of [
    "/admin/users",
    "/business/shipments",
    "/customer/../admin/users",
    "/customer/%2e%2e/admin/users",
    "/customer/\\admin"
  ])
    await assert.rejects(api.request(path), /outside its scope/);
  assert.equal(calls.length, 1);
  await api.login({ username: "client", password: "pw", customerCode: "code" });
  assert.equal(Object.hasOwn(calls[1].options.headers, "X-Customer-Token"), false);
});
test("expired customer responses cannot revoke a newer customer session", async () => {
  let token = "old",
    cleared = 0;
  const pending = deferred();
  const api = createCustomerApi({
    readToken: () => token,
    clearSession: () => {
      cleared++;
      token = "";
    },
    fetchImpl: () => pending.promise
  });
  const request = api.request("/customer/shipments");
  token = "new";
  pending.resolve({ ok: false, status: 401, json: async () => ({ message: "expired" }) });
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(token, "new");
  assert.equal(cleared, 0);
});
test("customer identity becomes available only after an actual protected API probe", async (t) => {
  const pending = deferred();
  const h = fixture(t, { api: { request: () => pending.promise } });
  const restoring = h.runtime.restore();
  assert.equal(h.runtime.user.value, null);
  pending.resolve({ items: [] });
  assert.equal(await restoring, true);
  assert.equal(h.runtime.user.value.role, "CUSTOMER");
  assert.equal(h.runtime.checked.value, true);
});
test("expired cache never grants customer access or calls protected API", async (t) => {
  const h = fixture(t, { session: { expired: () => true } });
  assert.equal(await h.runtime.restore(), false);
  assert.equal(h.requests.length, 0);
  assert.equal(h.runtime.user.value, null);
  assert.equal(h.runtime.checked.value, true);
});
test("logout and scope disposal invalidate pending restore/login without restoring storage", async (t) => {
  const restore = deferred();
  const h = fixture(t, {
    api: {
      request: (path) => (path === "/customer/logout" ? Promise.resolve({}) : restore.promise)
    }
  });
  const pending = h.runtime.restore();
  await h.runtime.logout();
  restore.resolve({});
  assert.equal(await pending, false);
  assert.equal(h.runtime.user.value, null);
  const login = deferred();
  const other = fixture(t, { api: { login: () => login.promise } });
  const signingIn = other.runtime.login({});
  other.scope.stop();
  login.resolve({ token: "late", customer: { id: "late", username: "late" } });
  assert.equal(await signingIn, false);
  assert.equal(other.saves(), 0);
  assert.equal(other.requests.length, 0);
  assert.equal(other.runtime.user.value, null);
});
test("customer 401 immediately revokes the mounted workspace and clears private identity", async (t) => {
  const h = fixture(t);
  await h.runtime.restore();
  assert.ok(h.runtime.user.value);
  h.runtime.expire();
  assert.equal(h.runtime.user.value, null);
  assert.match(h.runtime.error.value, /过期/);
});

test("a successful old-identity customer response is discarded before exposing its body", async () => {
  let token = "old";
  const pending = deferred();
  const api = createCustomerApi({
    readToken: () => token,
    clearSession: () => {},
    fetchImpl: () => pending.promise
  });
  const request = api.request("/customer/shipments");
  token = "new";
  let parsed = false;
  pending.resolve({
    ok: true,
    status: 200,
    json: async () => {
      parsed = true;
      return { private: "old customer" };
    }
  });
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(parsed, false);
});

for (const ok of [true, false])
  test(`identity switch during body decoding discards ${ok ? "success" : "error"} without clearing new login`, async () => {
    let token = "old",
      cleared = 0;
    const body = deferred();
    const api = createCustomerApi({
      readToken: () => token,
      clearSession: () => {
        cleared++;
      },
      fetchImpl: async () => ({ ok, status: ok ? 200 : 401, json: () => body.promise })
    });
    const pending = api.request("/customer/shipments");
    await Promise.resolve();
    token = "new";
    body.resolve({ items: [{ shipmentId: "old-company" }] });
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(cleared, 0);
    assert.equal(token, "new");
  });
