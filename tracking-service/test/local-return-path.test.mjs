import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { localReturnPath } from "../public/local-return-path.mjs";
import { createStaticRouter } from "../lib/static-routes.mjs";

test("decoded local return routes retain encoded identifiers, query values and hash", () => {
  for (const value of [
    "/",
    "/business/cargo/A%2FB?name=Customer%20A&note=%5C%0A#files",
    "/customers?customer=C07"
  ])
    assert.equal(localReturnPath(value), value);
});

test("external and browser-normalized authority paths never become tracking return routes", () => {
  for (const value of [
    null,
    undefined,
    {},
    "",
    "https://external.invalid/",
    "//external.invalid/",
    "/\\external.invalid/",
    "/\t/external.invalid/",
    "/\n/external.invalid/",
    "/\r/external.invalid/",
    "/business/\u0000detail",
    "/business/\u007fdetail"
  ])
    assert.equal(localReturnPath(value), "");
});

test("workspace home follows the rendered role destination and ignores returnTo and history", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf(
    'document.querySelector("#portal-return-link")?.addEventListener("click", (event) => {'
  );
  const end = source.indexOf('document.querySelector("#start-tracking-button")', start);
  assert.ok(start >= 0 && end > start);
  let handler;
  const assigned = [];
  let back = 0;
  const window = {
    location: { search: "", assign: (url) => assigned.push(url) },
    history: {
      length: 2,
      back: () => {
        back++;
      }
    }
  };
  vm.runInNewContext(source.slice(start, end), {
    document: {
      querySelector: () => ({
        addEventListener: (_type, callback) => {
          handler = callback;
        }
      })
    },
    window,
    URLSearchParams,
    localReturnPath,
    showPlatformRouteWait: () => {}
  });
  const click = (href = "http://localhost/workbenches", modifiers = {}) =>
    handler({
      button: 0,
      currentTarget: { href },
      preventDefault() {},
      ...modifiers
    });
  const returnTo = "/business/cargo/A%2FB?filter=active#files";
  window.location.search = `?${new URLSearchParams({ returnTo })}`;
  click();
  assert.deepEqual(assigned, ["http://localhost/workbenches"]);
  window.location.search = `?${new URLSearchParams({ returnTo: "/\\external.invalid/" })}`;
  click();
  assert.equal(back, 0);
  assert.deepEqual(assigned, ["http://localhost/workbenches", "http://localhost/workbenches"]);
  window.history.length = 1;
  click("http://localhost/");
  assert.equal(assigned.at(-1), "http://localhost/");
  assert.equal(back, 0);
  click("http://localhost/workbenches", { ctrlKey: true });
  click("http://localhost/workbenches", { button: 1 });
  assert.equal(assigned.length, 3, "modified clicks retain normal browser behavior");
});

test("actual static router serves the navigation module imported by the module-script entry", async (context) => {
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
  assert.equal(page.status, 200);
  const html = await page.text();
  const entry = html.match(/<script src="([^"]+)" type="module"><\/script>/)?.[1];
  assert.ok(entry, "tracking entry is an ES module script");
  const appResponse = await fetch(new URL(entry, `${origin}/`));
  assert.equal(appResponse.status, 200);
  const app = await appResponse.text();
  const dependency = app.match(
    /import \{ renderTrackingWorkspaceNavigation \} from "([^"]+)";/
  )?.[1];
  assert.ok(dependency, "tracking entry imports its executable navigation module");
  const response = await fetch(new URL(dependency, appResponse.url));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/javascript/);
  const served = await import(
    `data:text/javascript;base64,${Buffer.from(await response.text()).toString("base64")}`
  );
  assert.equal(typeof served.renderTrackingWorkspaceNavigation, "function");
});
