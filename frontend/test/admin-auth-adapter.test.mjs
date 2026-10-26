import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};
globalThis.document = { cookie: "" };
const events = [];
globalThis.window = { dispatchEvent: (event) => events.push(event.type), setTimeout, clearTimeout };
const sessionUrl = new URL("../src/services/authSession.js", import.meta.url).href;
const session = await import(sessionUrl);
const clientSource = readFileSync(
  new URL("../src/services/apiClient.js", import.meta.url),
  "utf8"
).replace('"./authSession"', JSON.stringify(sessionUrl));
const clientUrl = "data:text/javascript;base64," + Buffer.from(clientSource).toString("base64");
const client = await import(clientUrl);
const serviceSource = readFileSync(new URL("../src/services/adminApi.js", import.meta.url), "utf8")
  .replace('"./apiClient"', JSON.stringify(clientUrl))
  .replace('"./authSession"', JSON.stringify(sessionUrl))
  .replace("import.meta.env.VITE_API_BASE_URL", '""');
const api = await import(
  "data:text/javascript;base64," + Buffer.from(serviceSource).toString("base64")
);
function deferred() {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
}
function reply(status = 200, data = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function save(token) {
  session.saveSession({ token, user: { id: 1, username: "admin", role: "ADMIN" } });
}
for (const status of [200, 401])
  test(`old logout ${status} sends captured token and cannot clear a later session`, async () => {
    storage.clear();
    events.length = 0;
    save("old-token");
    const pending = deferred();
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return pending.promise;
    };
    const result = api.logoutAdmin();
    assert.equal(captured.options.headers["X-Auth-Token"], "old-token");
    assert.equal(captured.url, "/api/auth/logout");
    session.clearSession();
    save("new-token");
    pending.resolve(reply(status, { message: "revoked old session" }));
    if (status === 401) {
      await assert.rejects(result, (error) => {
        client.markApiErrorHandled(error);
        return error.status === 401;
      });
    } else await result;
    assert.equal(session.storedToken(), "new-token");
    assert.equal(events.includes("auth-expired"), false);
  });
test("failed logout clears its own remaining token while reporting server failure", async () => {
  storage.clear();
  save("old-token");
  globalThis.fetch = async () => reply(503, { message: "offline" });
  try {
    await api.logoutAdmin();
    assert.fail("must reject");
  } catch (error) {
    client.markApiErrorHandled(error);
    assert.equal(error.message, "offline");
  }
  assert.equal(session.storedToken(), "");
});
test("normal API unauthorized response still invalidates its active session", async () => {
  storage.clear();
  events.length = 0;
  save("current-token");
  globalThis.fetch = async () => reply(401, { message: "expired" });
  await assert.rejects(api.fetchAdminMe());
  assert.equal(session.storedToken(), "");
  assert.ok(events.includes("auth-expired"));
});

for (const transport of ["json", "download"])
  for (const status of [200, 401])
    test(`late ${transport} ${status} cannot cross into a new employee session`, async () => {
      storage.clear();
      events.length = 0;
      save("old-token");
      const pending = deferred();
      let sentToken;
      globalThis.fetch = async (_url, options) => {
        sentToken = options.headers["X-Auth-Token"];
        return pending.promise;
      };
      const request =
        transport === "json"
          ? client.requestJson("/business/customers")
          : client.fetchWithApiFallback("/admin/files/download");
      save("new-token");
      pending.resolve(reply(status, { message: "old response", items: [{ id: 1 }] }));
      await assert.rejects(request, { name: "AbortError" });
      assert.equal(sentToken, "old-token");
      assert.equal(session.storedToken(), "new-token");
      assert.deepEqual(events, []);
    });

for (const transport of ["json", "download"])
  test(`${transport} rejects a body that finishes after employee identity changes`, async () => {
    storage.clear();
    events.length = 0;
    save("old-token");
    const reading = deferred();
    const body = deferred();
    const response = reply();
    const method = transport === "json" ? "text" : "blob";
    response[method] = () => {
      reading.resolve();
      return body.promise;
    };
    globalThis.fetch = async () => response;
    const request =
      transport === "json"
        ? client.requestJson("/business/customers")
        : client.fetchWithApiFallback("/admin/files/download").then((result) => result.blob());
    await reading.promise;
    save("new-token");
    body.resolve(transport === "json" ? '{"items":[{"id":1}]}' : new Blob(["old account"]));
    await assert.rejects(request, { name: "AbortError" });
    assert.equal(session.storedToken(), "new-token");
    assert.deepEqual(events, []);
  });

test("a cloned download also retains its employee identity", async () => {
  storage.clear();
  save("old-token");
  globalThis.fetch = async () => reply();
  const response = await client.fetchWithApiFallback("/admin/files/download");
  const clone = response.clone();
  save("new-token");
  await assert.rejects(clone.blob(), { name: "AbortError" });
});

test("a download unauthorized response still invalidates its own active session", async () => {
  storage.clear();
  events.length = 0;
  save("current-token");
  globalThis.fetch = async () => reply(401, { message: "expired" });
  await assert.rejects(client.fetchWithApiFallback("/admin/files/download"), { status: 401 });
  assert.equal(session.storedToken(), "");
  assert.deepEqual(events, ["auth-expired"]);
});

test("identity binding preserves multipart upload headers and body", async () => {
  storage.clear();
  save("current-token");
  const body = new FormData();
  body.append("file", new Blob(["contents"]), "upload.txt");
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = options;
    return reply();
  };
  await client.requestJson("/workspace-files", { method: "POST", headers: {}, body });
  assert.equal(captured.headers["X-Auth-Token"], "current-token");
  assert.equal(captured.headers["Content-Type"], undefined);
  assert.equal(captured.body, body);
});
test("administrator pure login leaves persistence to current workflow and default API remains compatible", async () => {
  storage.clear();
  globalThis.fetch = async () =>
    reply(200, { token: "login-token", user: { id: 1, username: "admin", role: "ADMIN" } });
  await api.loginAdmin("admin", "password", { persist: false });
  assert.equal(session.storedToken(), "");
  await api.loginAdmin("admin", "password");
  assert.equal(session.storedToken(), "login-token");
});
