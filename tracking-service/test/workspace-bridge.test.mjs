import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createStaticRouter } from "../lib/static-routes.mjs";
import { setCommonHeaders } from "../lib/http-utils.mjs";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}\n", start) + 3;
  return source.slice(start, end);
}

test("embedded sessions select the employee identity when both customer and employee tokens exist", () => {
  const context = vm.createContext({
    workspaceBridge: { embedded: true },
    readCustomerSession: () => ({ token: "customer-token", customer: { id: "customer" } }),
    readPlatformSession: () => ({ token: "employee-token", user: { id: "employee" } })
  });
  vm.runInContext(
    extractFunction("readFileSession") + "\nglobalThis.read = readFileSession;",
    context
  );
  assert.equal(context.read().kind, "INTERNAL");
  assert.equal(context.read().token, "employee-token");
  context.workspaceBridge.embedded = false;
  assert.equal(context.read().kind, "CUSTOMER");
  assert.equal(context.read().token, "customer-token");
  context.workspaceBridge.embedded = true;
  context.readPlatformSession = () => ({ token: "", user: null });
  assert.equal(context.read().kind, "ANONYMOUS");
});

test("a late 401 from the previous token cannot clear or notify the parent about the new employee session", () => {
  let current = { kind: "INTERNAL", token: "new-token" },
    clears = 0;
  const notifications = [];
  const context = vm.createContext({
    readFileSession: () => current,
    fileSessionFingerprint: (session) => session.token,
    clearCustomerSession: () => false,
    clearPlatformSession: (token) => {
      if (token !== current.token) return false;
      clears++;
      current = { kind: "ANONYMOUS", token: "" };
      return true;
    },
    workspaceBridge: { authExpired: (token) => notifications.push(token) },
    synchronizeRelatedFilesSession() {},
    renderRelatedFilesDrawer() {}
  });
  vm.runInContext(
    extractFunction("clearFileSession") + "\nglobalThis.clear = clearFileSession;",
    context
  );
  assert.equal(context.clear({ kind: "INTERNAL", token: "old-token" }, { expired: true }), false);
  assert.equal(clears, 0);
  assert.deepEqual(notifications, []);
  assert.equal(context.clear({ kind: "INTERNAL", token: "new-token" }, { expired: true }), true);
  assert.equal(clears, 1);
  assert.deepEqual(notifications, ["new-token"]);
});

test("opening a stored shipment URL reports the query view even while overview is the outgoing view", () => {
  const updates = [];
  const location = { href: "https://example.test/tracking/?embed=1#overview", search: "?embed=1" };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    activeView: "overview",
    normalizeQuery: (q) => q,
    window: {
      location,
      history: {
        pushState: (_, __, url) => {
          location.href = String(url);
          location.search = url.search;
        },
        replaceState: (_, __, url) => {
          location.href = String(url);
          location.search = url.search;
        }
      }
    },
    workspaceBridge: { routeChanged: (view, query) => updates.push({ view, query }) }
  });
  vm.runInContext(
    extractFunction("notifyWorkspaceRoute") +
      "\n" +
      extractFunction("updateUrl") +
      "\nglobalThis.update = updateUrl;",
    context
  );
  context.update(
    { carrier: "COSCO", channel: "AUTO", type: "BOOKING", number: "ABC123" },
    { push: true }
  );
  assert.equal(updates[0].view, "tracking");
  assert.equal(updates[0].query.number, "ABC123");
});

test("only tracking HTML permits same-origin frames while API and scripts keep DENY and security headers", async (t) => {
  const staticRouter = createStaticRouter({
    publicDir: fileURLToPath(new URL("../public/", import.meta.url))
  });
  const server = createServer((req, res) => {
    if (req.url === "/api/probe") {
      setCommonHeaders(res);
      res.end("{}");
      return;
    }
    void staticRouter.serveStatic(req, res).catch((error) => {
      res.writeHead(500);
      res.end(error.message);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/?embed=1", "/index.html?embed=1", "/workspace-bridge.mjs", "/api/probe"]) {
    const response = await fetch(origin + path);
    const document = path.startsWith("/?") || path.startsWith("/index.html");
    assert.equal(response.headers.get("x-frame-options"), document ? "SAMEORIGIN" : "DENY", path);
    assert.ok(
      response.headers
        .get("content-security-policy")
        .includes(`frame-ancestors '${document ? "self" : "none"}'`),
      path
    );
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    await response.arrayBuffer();
  }
});

test("restoring cached shipment B invalidates an in-flight A request before its late response can render", async () => {
  let resolveRequest, submit;
  const pending = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const rendered = [],
    loads = [],
    cleared = [];
  const context = vm.createContext({
    form: {
      addEventListener: (_, callback) => {
        submit = callback;
      }
    },
    trackingRequestSequence: 0,
    currentPayload: null,
    queryChannel: "AUTO",
    carrierSelect: { value: "COSCO" },
    trackingType: { value: "BOOKING" },
    trackingNumber: { value: "A" },
    normalizeQuery: (query) => ({ ...query, channel: "AUTO" }),
    CARRIERS: { COSCO: { enabled: true } },
    batchItemForQuery: () => null,
    canManageFileVisibility: () => false,
    readFileSession: () => ({ kind: "ANONYMOUS" }),
    clearError() {},
    setLoading: (value) => loads.push(value),
    beginSystemWait: () => "wait-a",
    endSystemWait() {},
    clearSystemWaitType: (type) => cleared.push(type),
    updateUrl() {},
    requestTracking: () => pending,
    mergeImportedDetailsIntoPayload: (payload) => payload,
    markBatchItemResult() {},
    renderHistory() {},
    historyEntryForQuery: (query) =>
      query.number === "B" ? { snapshot: { tracking: { number: "B" } } } : null,
    updateCarrierUI() {},
    renderResult: (payload) => rendered.push(payload.snapshot.tracking.number),
    setRelatedFilesContext() {},
    results: {},
    emptyState: {},
    t: (key) => key,
    showError: (message) => {
      throw Error(message);
    },
    customerFacingTrackingError: () => "error"
  });
  const start = source.indexOf('form.addEventListener("submit", async (event) => {');
  const end = source.indexOf('\ncarrierSelect.addEventListener("change"', start);
  vm.runInContext(
    extractFunction("invalidateTrackingRequest") +
      "\n" +
      extractFunction("showStoredTrackingQuery") +
      "\n" +
      source.slice(start, end) +
      "\nglobalThis.restore = showStoredTrackingQuery;",
    context
  );
  const requestA = submit({ preventDefault() {} });
  assert.equal(loads.at(-1), true);
  assert.equal(context.restore({ carrier: "COSCO", type: "BOOKING", number: "B" }), true);
  assert.equal(loads.at(-1), false);
  assert.deepEqual(cleared, ["tracking"]);
  resolveRequest({ response: { ok: true }, payload: { snapshot: { tracking: { number: "A" } } } });
  await requestA;
  assert.deepEqual(rendered, ["B"]);
  assert.equal(context.trackingNumber.value, "B");
});
