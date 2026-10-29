import assert from "node:assert/strict";
import test from "node:test";
import { createRenderer, effectScope, ref, nextTick } from "vue";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parse } from "@vue/compiler-sfc";
import { createMemoryHistory, createRouter, useRouter } from "vue-router";
import { businessModules } from "../src/modules/registry.js";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { useBusinessNavigation } from "../src/features/navigation/useBusinessNavigation.js";
import { trackingWorkspaceLink } from "../src/features/navigation/trackingWorkspaceLink.js";

test("tracking query encodes booking data and the full resolved return route", () => {
  const target = trackingWorkspaceLink({
    returnTo: "/business/cargo/A%2FB?filter=active#files",
    shipment: { carrier: "COSCO", referenceType: "BILLOFLADING", referenceNo: "COSU123456789" }
  });
  const link = new URL(target, "http://localhost");
  assert.equal(link.pathname, "/workspace/tracking/query");
  assert.equal(link.searchParams.get("returnTo"), "/business/cargo/A%2FB?filter=active#files");
  assert.equal(link.searchParams.get("number"), "123456789");
  assert.equal(link.searchParams.get("type"), "BOOKING");
  assert.equal(link.pathname, "/workspace/tracking/query");
  assert.equal(link.hash, "");
});

test("missing supported tracking numbers open overview without fabricating a bill query", () => {
  const link = new URL(
    trackingWorkspaceLink({
      returnTo: "/customers/directory",
      shipment: {
        carrier: "UNKNOWN",
        referenceType: "BILLOFLADING",
        referenceNo: "unsupported-bill"
      }
    }),
    "http://localhost"
  );
  assert.equal(link.pathname, "/workspace/tracking/overview");
  assert.equal(link.hash, "");
  assert.equal(link.searchParams.has("number"), false);
  assert.equal(link.searchParams.has("carrier"), false);
  for (const returnTo of ["", "https://external.invalid/", "//external.invalid/"]) {
    assert.throws(() => trackingWorkspaceLink({ returnTo }), /local resolved path/);
  }
});

test("new carrier bill links retain their carrier and bill query identity", () => {
  const link = new URL(
    trackingWorkspaceLink({
      returnTo: "/customers/shipments",
      shipment: { carrier: "MSC", referenceType: "BILLOFLADING", referenceNo: "MEDU123456789" }
    }),
    "http://localhost"
  );
  assert.equal(link.pathname, "/workspace/tracking/query");
  assert.equal(link.hash, "");
  assert.equal(link.searchParams.get("carrier"), "MSC");
  assert.equal(link.searchParams.get("type"), "BILLOFLADING");
  assert.equal(link.searchParams.get("number"), "MEDU123456789");
});

test("tracking return route follows moved workspace and module mounts, not an old hardcoded root", async (context) => {
  const modules = structuredClone(businessModules);
  modules.find((m) => m.id === "shipments").mount = "cargo-center";
  const component = { render: () => null };
  const views = Object.fromEntries(
    [
      "planner",
      "operations",
      "workbenches",
      "admin",
      "business",
      "legacyBusiness",
      "customerWorkspace",
      "shipmentWorkspace",
      "agentDirectory",
      "handoverWorkspace",
      "businessOverview",
      ...businessModules.flatMap((module) => module.pages.map((page) => page.view)).filter(Boolean)
    ].map((key) => [key, component])
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, modules, { businessPath: "/business" })
  });
  // The old root remains an alias, but generated return links use the new canonical root.
  await router.push("/customers/cargo-center/A%2FB?tab=files#section");
  const scope = effectScope();
  context.after(() => scope.stop());
  const navigation = scope.run(() =>
    useBusinessNavigation({
      modules,
      role: ref("BUSINESS"),
      router,
      route: new Proxy({}, { get: (_, key) => router.currentRoute.value[key] }),
      menuItem: ref(""),
      subView: ref("list"),
      selectedShipmentId: ref(""),
      selectedCustomerId: ref(""),
      loadSection: () => {}
    })
  );
  assert.equal(navigation.trackingReturnTo(), "/business/cargo-center/A%2FB?tab=files#section");
  await router.push({ name: "business-customers-detail", params: { customerId: "customer-2" } });
  assert.equal(navigation.trackingReturnTo(), "/business/directory/customer-2");
  await router.push("/home");
  assert.equal(navigation.trackingReturnTo(), "");
  scope.stop();
  assert.equal(navigation.trackingReturnTo(), "");
});

test("tracking return immediately disappears after the role loses business workspace access", async (context) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/business/shipments/:shipmentId",
        name: "business-shipments-detail",
        component: { render: () => null },
        meta: { workspace: "business", section: "shipments" }
      }
    ]
  });
  await router.push("/business/shipments/S1");
  const role = ref("BUSINESS");
  const scope = effectScope();
  context.after(() => scope.stop());
  const navigation = scope.run(() =>
    useBusinessNavigation({
      role,
      router,
      route: new Proxy({}, { get: (_, key) => router.currentRoute.value[key] }),
      menuItem: ref(""),
      subView: ref("list"),
      selectedShipmentId: ref(""),
      selectedCustomerId: ref(""),
      loadSection: () => {}
    })
  );
  assert.equal(navigation.trackingReturnTo(), "/business/shipments/S1");
  role.value = "CUSTOMER";
  assert.equal(navigation.trackingReturnTo(), "");
  role.value = "";
  assert.equal(navigation.trackingReturnTo(), "");
  role.value = "OVERSEA_AGENT";
  assert.equal(navigation.trackingReturnTo(), "/business/shipments/S1");
  scope.stop();
  assert.equal(navigation.trackingReturnTo(), "");
});

test("tracking return guard rejects browser-normalized external backslash and control paths", () => {
  for (const returnTo of [
    "/\\external.invalid/",
    "/\t/external.invalid/",
    "/\n/external.invalid/",
    "/\r/external.invalid/"
  ]) {
    assert.equal(new URL(returnTo, "https://workspace.invalid").hostname, "external.invalid");
    assert.throws(() => trackingWorkspaceLink({ returnTo }), /local resolved path/);
  }
});

test("encoded route parameters and query characters retain local return navigation", () => {
  const returnTo = "/business/cargo/A%2FB?name=customer%20name&note=%5C%0A#files";
  const link = new URL(trackingWorkspaceLink({ returnTo }), "https://workspace.invalid");
  assert.equal(link.searchParams.get("returnTo"), returnTo);
  assert.equal(new URL(link.searchParams.get("returnTo"), link).hostname, "workspace.invalid");
});

test("the actual business tracking handler uses its injected router and retains the shipment return context", async (t) => {
  const source = readFileSync(
    new URL("../src/components/BusinessCustomerPage.vue", import.meta.url),
    "utf8"
  );
  const script = parse(source).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(
    "BusinessCustomerPage.js",
    script,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS
  );
  const binding = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(ast) === "router"
      )
  );
  const handler = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "openTrackingWorkspace"
  );
  assert.ok(binding, "the business host must bind the same router that the action uses");
  assert.ok(handler);
  const page = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/customers/shipments/:id", component: page },
      { path: "/workspace/tracking/query", component: page }
    ]
  });
  await router.push("/customers/shipments/S123?filter=active#files");
  const returnTo = router.currentRoute.value.fullPath;
  const context = vm.createContext({
    useRouter,
    trackingWorkspaceLink,
    businessNavigation: {
      trackingReturnTo: () =>
        router.currentRoute.value.path.startsWith("/customers/")
          ? router.currentRoute.value.fullPath
          : ""
    }
  });
  vm.runInContext(
    `globalThis.setupHandler = () => { ${binding.getText(ast)} ${handler.getText(ast)}; return openTrackingWorkspace; };`,
    context
  );
  const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null
  });
  let openTracking;
  const app = renderer.createApp({
    setup() {
      openTracking = context.setupHandler();
      return () => null;
    }
  });
  app.use(router);
  app.mount({});
  t.after(() => app.unmount());
  openTracking({ carrier: "MSC", referenceType: "BILLOFLADING", referenceNo: "MEDU123456789" });
  for (let i = 0; i < 4; i++) {
    await nextTick();
    await new Promise(setImmediate);
  }
  assert.equal(router.currentRoute.value.path, "/workspace/tracking/query");
  assert.deepEqual(router.currentRoute.value.query, {
    returnTo,
    carrier: "MSC",
    type: "BILLOFLADING",
    number: "MEDU123456789"
  });
  const trackingRoute = router.currentRoute.value.fullPath;
  openTracking();
  await nextTick();
  assert.equal(
    router.currentRoute.value.fullPath,
    trackingRoute,
    "an action without an active business return context cannot navigate"
  );
});
