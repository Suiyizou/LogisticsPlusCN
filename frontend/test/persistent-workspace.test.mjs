import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parse, compileScript } from "@vue/compiler-sfc";
import * as vue from "vue";
import * as vr from "vue-router";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { businessModules } from "../src/modules/registry.js";
import {
  createTrackingParentBridge,
  TRACKING_BRIDGE
} from "../src/components/workspace/trackingBridge.js";
import { createTrackingWorkspaceBridge } from "../../tracking-service/public/workspace-bridge.mjs";

function hostWindow() {
  const listeners = new Map();
  return {
    location: { origin: "https://example.test", search: "?embed=1" },
    addEventListener: (k, fn) => {
      if (!listeners.has(k)) listeners.set(k, new Set());
      listeners.get(k).add(fn);
    },
    removeEventListener: (k, fn) => listeners.get(k)?.delete(fn),
    dispatch: (event) => {
      for (const fn of listeners.get("message") || []) fn(event);
    },
    listeners
  };
}
const locale = vue.ref("zh-CN");
const translation = { currentLocale: locale, t: (key) => key };
const stub = {
  render() {
    return vue.h("span");
  }
};
function sfc(file, dependencies, window) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  const compiled = compileScript(descriptor, { id: file, inlineTemplate: true }).content;
  const code = ts.transpileModule(compiled, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    window,
    Event,
    URL,
    console,
    require: (id) => {
      if (id === "vue") return vue;
      if (id === "vue-router") return vr;
      if (!(id in dependencies)) throw Error(`Unknown import ${id}`);
      return dependencies[id]?.default
        ? { __esModule: true, ...dependencies[id] }
        : dependencies[id];
    }
  });
  return exports.default;
}
function renderer() {
  function node(type, text = "") {
    return vue.markRaw({
      type,
      text,
      children: [],
      props: {},
      style: { display: "" },
      parent: null,
      contentWindow: {
        messages: [],
        postMessage(data, origin) {
          this.messages.push({ data, origin });
        }
      },
      setAttribute(k, v) {
        this.props[k] = v;
      },
      removeAttribute(k) {
        delete this.props[k];
      }
    });
  }
  const runtime = vue.createRenderer({
    createElement: (type) => node(type),
    createText: (text) => node("#text", text),
    createComment: (text) => node("#comment", text),
    setText: (el, text) => {
      el.text = text;
    },
    setElementText: (el, text) => {
      el.text = text;
      el.children = [];
    },
    patchProp: (el, key, old, value) => {
      el.props[key] = value;
    },
    insert: (el, parent, anchor) => {
      if (el.parent) {
        const i = el.parent.children.indexOf(el);
        if (i >= 0) el.parent.children.splice(i, 1);
      }
      el.parent = parent;
      const i = parent.children.indexOf(anchor);
      if (i >= 0) parent.children.splice(i, 0, el);
      else parent.children.push(el);
    },
    remove: (el) => {
      const i = el.parent?.children.indexOf(el);
      if (i >= 0) el.parent.children.splice(i, 1);
      el.parent = null;
    },
    parentNode: (el) => el.parent,
    nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1],
    querySelector: () => null,
    setScopeId: () => {},
    insertStaticContent: () => {
      throw Error("Unexpected static HTML");
    }
  });
  return { ...runtime, node };
}
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const item of root.children) {
    const match = find(item, predicate);
    if (match) return match;
  }
  return null;
}
async function settle() {
  for (let i = 0; i < 4; i++) {
    await vue.nextTick();
    await new Promise(setImmediate);
  }
}

test("actual workspace SFC preserves sidebar and iframe while its accordion follows module switches", async (t) => {
  const win = hostWindow();
  const icons = Object.fromEntries(
    ["Box", "Location", "Briefcase", "Setting", "Grid", "ArrowRight"].map((name) => [name, stub])
  );
  const navigation = sfc(
    "../src/components/workspace/WorkspaceNavigation.vue",
    {
      "@element-plus/icons-vue": icons,
      "../../i18n": translation,
      "../../i18n/workspaceNavigationMessages.js":
        await import("../src/i18n/workspaceNavigationMessages.js"),
      "../../modules/configuredRegistry.js": { configuredPlatformModules: businessModules },
      "../../modules/registry.js": await import("../src/modules/registry.js"),
      "../../modules/moduleCatalog.js": await import("../src/modules/moduleCatalog.js"),
      "../../features/admin/adminNavigation.js": {
        adminNavigation: () => ({
          pages: [{ key: "overview", label: "Overview", moduleId: "admin-overview" }]
        })
      }
    },
    win
  );
  const frame = sfc(
    "../src/components/workspace/TrackingWorkspaceFrame.vue",
    {
      "../../i18n": translation,
      "../../services/authSession.js": { storedToken: () => "session-a" },
      "./trackingBridge.js": await import("../src/components/workspace/trackingBridge.js")
    },
    win
  );
  const shell = sfc(
    "../src/components/workspace/WorkspaceShell.vue",
    {
      "./WorkspaceAccountDialogs.vue": { default: stub },
      "./workspaceCopy": { wt: (key) => key },
      "./WorkspaceNavigation.vue": { default: navigation },
      "./TrackingWorkspaceFrame.vue": { default: frame },
      "../brand/BrandLockup.vue": { default: stub },
      "../LanguageSwitcher.vue": { default: stub },
      "../../i18n": translation,
      "../../features/admin/adminNavigation.js": { adminRouteTitle: () => "" }
    },
    win
  );
  const user = vue.ref({ id: 1, username: "operator", role: "ADMIN" });
  const page = { render: () => vue.h("article", "Page") };
  const operations = {
    setup: () => () => vue.h(shell, { key: user.value.id, currentUser: user.value })
  };
  const views = Object.fromEntries(
    [
      "planner",
      "workbenches",
      "admin",
      "business",
      "legacyBusiness",
      ...businessModules.flatMap((m) => m.pages.map((p) => p.view)).filter(Boolean)
    ].map((name) => [name, page])
  );
  views.operations = operations;
  const router = vr.createRouter({
    history: vr.createMemoryHistory(),
    routes: createApplicationRoutes(views)
  });
  router.addRoute("admin", { path: "overview", name: "test-admin-overview", component: page });
  await router.push("/workbenches");
  const runtime = renderer(),
    root = runtime.node("root");
  const app = runtime.createApp({ render: () => vue.h(vr.RouterView) });
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(root);
  t.after(() => app.unmount());
  await settle();
  const sidebar = find(root, (n) => n.type === "aside");
  assert.ok(sidebar);
  const accountButton = find(root, (n) => n.props.class === "persistent-workspace__account");
  assert.equal(
    accountButton.props["aria-label"],
    "operator · portal.personalInfo",
    "the mobile avatar-only account trigger retains the full account name for assistive technology"
  );
  assert.equal(
    find(root, (n) => n.type === "iframe"),
    null,
    "frame mounts only on first visit"
  );
  const businessTrigger = find(sidebar, (n) => n.props["aria-controls"]?.endsWith("-business"));

  businessTrigger.props.onClick();
  await settle();
  assert.equal(businessTrigger.props["aria-expanded"], true);
  const trackingTrigger = find(sidebar, (n) => n.props["aria-controls"]?.endsWith("-tracking"));
  const planningTrigger = find(sidebar, (n) => n.props["aria-controls"]?.endsWith("-planning"));
  const importTrigger = find(sidebar, (n) => n.props["aria-controls"]?.endsWith("-smart-import"));
  trackingTrigger.props.onClick();
  await settle();
  assert.equal(businessTrigger.props["aria-expanded"], false);
  planningTrigger.props.onClick();
  await settle();
  assert.equal(trackingTrigger.props["aria-expanded"], false);
  importTrigger.props.onClick();
  await settle();
  assert.equal(planningTrigger.props["aria-expanded"], true);
  assert.equal(importTrigger.props["aria-expanded"], true);
  await router.push("/workspace/tracking/query?carrier=COSCO&type=BOOKING&number=REF123");
  await settle();
  const iframe = find(root, (n) => n.type === "iframe");
  assert.equal(iframe.props.src, "/tracking/?embed=1");
  win.dispatch({
    origin: win.location.origin,
    source: iframe.contentWindow,
    data: { channel: TRACKING_BRIDGE, type: "ready" }
  });
  assert.ok(
    iframe.contentWindow.messages.some(
      (m) =>
        m.data.type === "set-route" &&
        m.data.view === "tracking" &&
        m.data.query.number === "REF123"
    )
  );
  for (const path of [
    "/planner/cargos",
    "/smart-import/excel",
    "/smart-import/image",
    "/smart-import/text",
    "/customers/shipments",
    "/admin/overview",
    "/workspace/tracking/overview"
  ]) {
    await router.push(path);
    await settle();
    assert.equal(
      find(root, (n) => n.type === "aside"),
      sidebar,
      path
    );
    assert.equal(
      find(root, (n) => n.type === "iframe"),
      iframe,
      path
    );
    assert.equal(iframe.props.src, "/tracking/?embed=1", path);
    assert.equal(businessTrigger.props["aria-expanded"], path.startsWith("/customers"), path);
    assert.equal(
      trackingTrigger.props["aria-expanded"],
      path.startsWith("/workspace/tracking"),
      path
    );
    assert.equal(
      planningTrigger.props["aria-expanded"],
      path.startsWith("/planner") || path.startsWith("/smart-import"),
      path
    );
    assert.equal(importTrigger.props["aria-expanded"], path.startsWith("/smart-import"), path);
  }
  user.value = { id: 2, username: "another", role: "BUSINESS" };
  await settle();
  assert.notEqual(
    find(root, (n) => n.type === "iframe"),
    iframe,
    "changing identity destroys prior frame state"
  );
});

test("parent bridge rejects wrong origin, wrong source, unsafe targets and stale-session expiry", () => {
  const win = hostWindow(),
    frame = { contentWindow: { postMessage() {} } },
    navigations = [],
    expiries = [];
  let token = "session-a";
  const bridge = createTrackingParentBridge({
    hostWindow: win,
    getFrame: () => frame,
    getRoute: () => ({ meta: {}, query: {} }),
    getLocale: () => "zh-CN",
    navigate: (path) => navigations.push(path),
    authExpired: () => expiries.push(true),
    isVisible: () => true,
    getSessionToken: () => "session-a",
    getCurrentSessionToken: () => token
  });
  const send = (data, origin = win.location.origin, source = frame.contentWindow) =>
    win.dispatch({ origin, source, data: { channel: TRACKING_BRIDGE, ...data } });
  send({ type: "navigate", path: "/planner/cargos" }, "https://evil.test");
  send({ type: "navigate", path: "/planner/cargos" }, win.location.origin, {});
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/tracking/",
    "/api/auth/logout",
    "/admin/../../api/logout",
    "/customers/abc%2F..%2Fapi"
  ])
    send({ type: "navigate", path });
  assert.equal(navigations.length, 0);
  send({ type: "navigate", path: "/customers/shipments?shipment=ABC" });
  assert.equal(navigations.length, 1);
  send({ type: "auth-expired", sessionToken: "old-session" });
  token = "session-b";
  send({ type: "auth-expired", sessionToken: "session-a" });
  assert.equal(expiries.length, 0);
  token = "";
  send({ type: "auth-expired", sessionToken: "session-a" });
  assert.equal(expiries.length, 1);
  bridge.dispose();
  assert.equal(win.listeners.get("message").size, 0);
});

test("child bridge authenticates parent messages, validates views/locales and keeps standalone navigation", async () => {
  const win = hostWindow(),
    sent = [],
    routes = [],
    languages = [],
    visibility = [];
  win.parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const child = createTrackingWorkspaceBridge({
    hostWindow: win,
    applyRoute: (view, query) => routes.push({ view, query }),
    applyLocale: (locale) => languages.push(locale),
    applyVisibility: (visible) => visibility.push(visible)
  });
  const send = (data, origin = win.location.origin, source = win.parent) =>
    win.dispatch({ origin, source, data: { channel: TRACKING_BRIDGE, ...data } });
  send({ type: "set-route", view: "tracking", query: { number: "ABC" } }, "https://evil.test");
  send({ type: "set-route", view: "tracking" }, win.location.origin, {});
  send({ type: "set-route", view: "admin" });
  send({ type: "set-locale", locale: "invalid" });
  assert.deepEqual(routes, []);
  assert.deepEqual(languages, []);
  send({ type: "set-route", view: "tracking", query: { carrier: "COSCO", number: "ABC" } });
  await settle();
  send({ type: "set-locale", locale: "zh-CN" });
  send({ type: "visibility", visible: false });
  assert.equal(routes[0].query.number, "ABC");
  assert.deepEqual(languages, ["zh-CN"]);
  assert.deepEqual(visibility, [false]);
  assert.equal(child.navigate("/tracking/"), false);
  assert.equal(child.navigate("/planner/cargos"), true);
  child.ready();
  assert.equal(sent.at(-1).data.type, "ready");
  assert.equal(sent.at(-1).origin, win.location.origin);
  child.dispose();
  win.parent = win;
  const standalone = createTrackingWorkspaceBridge({ hostWindow: win });
  assert.equal(standalone.navigate("/planner/cargos"), false);
});
