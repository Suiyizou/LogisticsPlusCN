import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  trackingResponseMessage,
  trackingDiagnosticCode,
  trackingDiagnosticMessage,
  isPublicTrackingRouteUnavailable
} from "../public/tracking-response.mjs";
import { createStaticRouter } from "../lib/static-routes.mjs";

const t = (key) => key;
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const response = (status, header = "") => ({
  status,
  statusText: "",
  headers: { get: () => header }
});

test("response messages retain Spring precedence and legacy fallbacks without serializing metadata", () => {
  const payload = Object.freeze({
    message: "  Spring failure  ",
    error: { message: "Legacy failure" },
    details: { token: "secret-token" },
    stack: "private stack"
  });
  assert.equal(trackingResponseMessage(payload, response(500)), "Spring failure");
  assert.equal(
    trackingResponseMessage(
      { message: " ", error: { message: "  Legacy failure  " } },
      response(400)
    ),
    "Legacy failure"
  );
  assert.equal(
    trackingResponseMessage({ error: "  Old adapter error  " }, response(404)),
    "Old adapter error"
  );
  assert.equal(
    trackingResponseMessage(
      { message: { token: "secret" }, error: { stack: "private" } },
      { status: 502, statusText: "Bad Gateway" }
    ),
    "502 Bad Gateway"
  );
  assert.equal(trackingResponseMessage(null, null), "Request failed");
});

test("unprivileged diagnostics never read upstream technical fields and deny truthy permission strings", () => {
  const payload = new Proxy(
    {},
    {
      get: () => {
        throw Error("Technical fields must not be accessed");
      }
    }
  );
  for (const canViewDiagnostics of [false, undefined, "true", 1])
    assert.equal(
      trackingDiagnosticMessage(payload, null, { t, canViewDiagnostics }),
      "error.customerFriendly"
    );
});

test("diagnostic classification accepts explicit current and legacy codes before HTTP mappings", () => {
  assert.equal(
    trackingDiagnosticCode({ code: " upstream_empty " }, response(500)),
    "UPSTREAM_EMPTY"
  );
  assert.equal(
    trackingDiagnosticCode({ errorCode: "INVALID_REFERENCE" }, response(429)),
    "INVALID_REFERENCE"
  );
  assert.equal(
    trackingDiagnosticCode({ error: { code: "RATE_LIMITED" } }, response(400)),
    "RATE_LIMITED"
  );
  for (const [status, expected] of [
    [429, "RATE_LIMITED"],
    [403, "RATE_LIMITED"],
    [400, "INVALID_REFERENCE"],
    [502, "ADAPTER_FAILURE"],
    [404, "UPSTREAM_EMPTY"]
  ])
    assert.equal(trackingDiagnosticCode({ code: "UNKNOWN" }, response(status)), expected);
});

test("staff diagnostics preserve actionable reasons but redact credentials embedded in technical text", () => {
  const payload = Object.freeze({
    code: "ADAPTER_FAILURE",
    message:
      'Carrier timeout at https://proxy-user:proxy-secret@proxy.example/track?access_token=token-secret; Authorization: Bearer bearer-secret, password="password-secret", api_key=api-secret',
    details: { cookie: "cookie-secret" },
    stack: "private-stack"
  });
  const diagnostic = trackingDiagnosticMessage(payload, response(503), {
    t,
    canViewDiagnostics: true
  });
  assert.match(diagnostic, /^diagnostic.ADAPTER_FAILURE: Carrier timeout/);
  assert.ok(diagnostic.includes("proxy.example/track"));
  for (const secret of [
    "proxy-user",
    "proxy-secret",
    "token-secret",
    "bearer-secret",
    "password-secret",
    "api-secret",
    "cookie-secret",
    "private-stack"
  ])
    assert.equal(diagnostic.includes(secret), false, `diagnostic disclosed ${secret}`);
  assert.equal(
    trackingResponseMessage(payload, response(503)),
    payload.message,
    "raw message parsing remains available to compatibility logic without mutation"
  );
});

test("diagnostics use the caller's current translation and app wrapper rechecks current role", () => {
  let language = "zh";
  const translate = (key) => `${language}:${key}`;
  const presentation = { t: translate, canViewDiagnostics: true };
  assert.equal(
    trackingDiagnosticMessage({ message: "Invalid booking" }, response(400), presentation),
    "zh:diagnostic.INVALID_REFERENCE: Invalid booking"
  );
  language = "en";
  assert.equal(
    trackingDiagnosticMessage({ message: "Invalid booking" }, response(400), presentation),
    "en:diagnostic.INVALID_REFERENCE: Invalid booking"
  );
  let session = { kind: "INTERNAL", user: { role: "BUSINESS" } };
  const start = appSource.indexOf("function trackingDiagnosticMessage(payload, response)");
  const end = appSource.indexOf("function customerFacingTrackingError()", start);
  const permissionStart = appSource.indexOf("function canManageFileVisibility(");
  const permissionEnd = appSource.indexOf("function normalizeAssignableCustomer(", permissionStart);
  assert.ok(start >= 0 && end > start && permissionStart >= 0 && permissionEnd > permissionStart);
  const context = vm.createContext({
    presentTrackingDiagnostic: trackingDiagnosticMessage,
    t: translate,
    readFileSession: () => session
  });
  vm.runInContext(
    appSource.slice(permissionStart, permissionEnd) + appSource.slice(start, end),
    context
  );
  assert.match(
    context.trackingDiagnosticMessage({ message: "Technical reason" }, response(500)),
    /Technical reason/
  );
  for (session of [
    { kind: "CUSTOMER" },
    { kind: "INTERNAL", user: { role: "OVERSEA_AGENT" } },
    { kind: "ANONYMOUS" }
  ])
    assert.equal(
      context.trackingDiagnosticMessage({ message: "Secret technical reason" }, response(500)),
      "en:error.customerFriendly"
    );
});

test("only explicit missing public endpoints permit fallback; business and successful responses stay authoritative", () => {
  for (const result of [
    { response: response(404, "TRUE") },
    { response: response(404), payload: { routeNotFound: true } },
    { response: response(404), payload: { error: { code: "no_handler" } } },
    {
      response: response(404),
      payload: { path: "/api/public/shipments/track/?lang=en", error: "Not Found" }
    },
    {
      response: response(404),
      payload: { message: "No static resource /api/public/shipments/track." }
    },
    { response: response(405) }
  ])
    assert.equal(isPublicTrackingRouteUnavailable(result), true);
  for (const result of [
    { response: response(200), payload: { code: "ROUTE_NOT_FOUND", snapshot: {} } },
    { response: response(403), payload: { endpointNotFound: true } },
    {
      response: response(404),
      payload: { message: "Shipment not found", path: "/api/public/shipments/track" }
    },
    { response: response(404), payload: { message: "No handler for /another/endpoint" } },
    { response: response(404), payload: { error: "Not Found" } }
  ])
    assert.equal(isPublicTrackingRouteUnavailable(result), false);
});

test("production request routing retains customer restrictions and legacy COSCO compatibility paths", async () => {
  const start = appSource.indexOf("async function requestTracking(query, options = {})");
  const end = appSource.indexOf("checkChannelsButton?.addEventListener", start);
  assert.ok(start >= 0 && end > start);
  for (const scenario of [
    { kind: "CUSTOMER", publicStatus: 405, primaryStatus: 404, paths: [] },
    { kind: "INTERNAL", publicStatus: 200, primaryStatus: 404, paths: [] },
    {
      kind: "INTERNAL",
      publicStatus: 404,
      publicMessage: "Shipment not found",
      primaryStatus: 404,
      paths: []
    },
    { kind: "INTERNAL", publicStatus: 405, primaryStatus: 200, paths: ["/api/track"] },
    {
      kind: "INTERNAL",
      publicStatus: 405,
      primaryStatus: 404,
      paths: ["/api/track", "/api/track/cosco/playwright"]
    },
    {
      kind: "INTERNAL",
      publicStatus: 405,
      primaryStatus: 405,
      channel: "NETWORK",
      paths: ["/api/track", "/api/track/cosco"]
    },
    {
      kind: "INTERNAL",
      publicStatus: 405,
      primaryStatus: 404,
      carrier: "CMA",
      paths: ["/api/track"]
    }
  ]) {
    const paths = [];
    const context = vm.createContext({
      readFileSession: () => ({ kind: scenario.kind }),
      isPublicTrackingRouteUnavailable,
      postPublicShipmentTrackingRequest: async () => ({
        response: response(scenario.publicStatus),
        payload: { message: scenario.publicMessage }
      }),
      postTrackingRequest: async (path) => {
        paths.push(path);
        return { response: response(scenario.primaryStatus), payload: {} };
      }
    });
    vm.runInContext(appSource.slice(start, end), context);
    await context.requestTracking({
      carrier: scenario.carrier || "COSCO",
      channel: scenario.channel || "PLAYWRIGHT"
    });
    assert.deepEqual(paths, scenario.paths);
  }
});

test("actual static module entry imports a served executable response module", async (context) => {
  const staticRouter = createStaticRouter({
    publicDir: fileURLToPath(new URL("../public/", import.meta.url))
  });
  const server = createServer((request, response) => {
    void staticRouter.serveStatic(request, response).catch((error) => {
      response.writeHead(error.status || 500);
      response.end(String(error.message));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${origin}/`);
  const entry = (await page.text()).match(/<script src="([^"]+)" type="module"><\/script>/)?.[1];
  assert.ok(entry);
  const app = await fetch(new URL(entry, `${origin}/`));
  const source = await app.text();
  const dependency = source.match(/from "(\.\/tracking-response\.mjs)";/)?.[1];
  assert.ok(dependency);
  const asset = await fetch(new URL(dependency, app.url));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /^text\/javascript/);
  const served = await import(
    `data:text/javascript;base64,${Buffer.from(await asset.text()).toString("base64")}`
  );
  assert.equal(
    served.trackingDiagnosticMessage({ message: "Secret" }, response(500), { t }),
    "error.customerFriendly"
  );
  assert.equal(served.isPublicTrackingRouteUnavailable({ response: response(200) }), false);
});
