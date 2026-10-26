import assert from "node:assert/strict";
import test from "node:test";
import { createApp, effectScope, ref, readonly, isReadonly, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createApplicationRoutes } from "../src/modules/routes.js";
import {
  businessModules,
  validateModules,
  modulesForRole,
  moduleDestination,
  canAccessRoute,
  operationsHome,
  postLoginDestination
} from "../src/modules/registry.js";
import { useBusinessNavigation } from "../src/features/navigation/useBusinessNavigation.js";
import { workspaceContextKey, useWorkspaceContext } from "../src/modules/workspaceContext.js";

const page = { render: () => null };
const views = Object.fromEntries(
  [
    "planner",
    "operations",
    "workbenches",
    "admin",
    "business",
    "shipmentWorkspace",
    "customerWorkspace",
    "agentDirectory",
    "handoverWorkspace",
    "businessOverview",
    ...businessModules.flatMap((module) => module.pages.map((page) => page.view)).filter(Boolean),
    "legacyBusiness"
  ].map((name) => [name, { name, render: () => null }])
);
const clone = () => structuredClone(businessModules);
const routerFor = (modules = businessModules) =>
  createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, modules)
  });
async function settle() {
  for (let count = 0; count < 5; count++) {
    await new Promise((resolve) => setImmediate(resolve));
    await nextTick();
  }
}
async function workspace(t, initial, role = "BUSINESS") {
  const router = routerFor();
  await router.push(initial);
  const state = {
    role: ref(role),
    menuItem: ref(""),
    subView: ref("list"),
    selectedShipmentId: ref(""),
    selectedCustomerId: ref("")
  };
  const route = new Proxy({}, { get: (_, key) => router.currentRoute.value[key] });
  const scope = effectScope(),
    loads = [];
  const navigation = scope.run(() =>
    useBusinessNavigation({
      ...state,
      route,
      router,
      loadSection: (section, id, context) => loads.push({ section, id, context })
    })
  );
  navigation.initialize();
  await settle();
  t.after(() => scope.stop());
  return { router, state, route, navigation, loads, scope };
}

test("moving a module changes placement without changing its identity, permissions or links", () => {
  const modules = clone();
  modules.find((module) => module.id === "shipments").mount = "cargo-center";
  const router = routerFor(modules);
  const link = moduleDestination(
    { section: "shipments", shipmentId: "S/123", view: "detail" },
    modules
  );
  const resolved = router.resolve(link);
  assert.equal(resolved.path, "/customers/cargo-center/S%2F123");
  assert.equal(resolved.meta.moduleId, "shipments");
  assert.equal(canAccessRoute(resolved.meta, "CUSTOMER"), false);
  assert.equal(canAccessRoute(resolved.meta, "OVERSEA_AGENT"), true);
  assert.equal(
    modulesForRole("BUSINESS", modules).find((item) => item.id === "shipments").routeName,
    "business-shipments"
  );
});

test("disabled modules leave neither menu entries nor page routes", () => {
  const modules = clone();
  modules.find((module) => module.id === "agents").enabled = false;
  assert.equal(
    modulesForRole("ADMIN", modules).some((item) => item.id === "agents"),
    false
  );
  assert.equal(routerFor(modules).hasRoute("business-agents"), false);
  assert.equal(moduleDestination({ section: "agents" }, modules), null);
});

test("moving the workspace keeps old URLs as aliases and registered links follow the new root", async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, businessModules, { businessPath: "/business" })
  });
  assert.equal(router.resolve({ name: "business-shipments" }).path, "/business/shipments");
  assert.equal(router.resolve("/customers/shipments/A").name, "business-shipments-detail");
  await router.push("/customers?shipment=A");
  assert.equal(router.currentRoute.value.meta.workspace, "business");
  assert.throws(
    () => createApplicationRoutes(views, businessModules, { businessPath: "/admin" }),
    /workspace path/
  );
});

test("a new independent module registers its own page without extending the legacy template", () => {
  const modules = clone();
  modules.push({
    id: "documents",
    mount: "documents",
    labelKey: "documents.title",
    icon: "Document",
    roles: ["BUSINESS"],
    pages: [{ name: "business-documents", path: "", view: "documents" }]
  });
  const documentPage = { name: "DocumentsPage", render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes({ ...views, documents: documentPage }, modules)
  });
  assert.equal(
    modulesForRole("BUSINESS", modules).find((module) => module.id === "documents").routeName,
    "business-documents"
  );
  assert.equal(
    router.resolve({ name: "business-documents" }).matched.at(-1).components.default,
    documentPage
  );
  assert.equal(
    modulesForRole("OVERSEA_AGENT", modules).some((item) => item.id === "documents"),
    false
  );
});

test("a child module cannot broaden the parent workspace's access policy", () => {
  const modules = clone();
  modules[0].roles.push("CUSTOMER");
  const route = routerFor(modules).resolve("/customers/overview");
  assert.equal(canAccessRoute(route, "CUSTOMER"), false);
  assert.equal(canAccessRoute(route, "BUSINESS"), true);
});

test("agent and handover modules use their own pages and retain role boundaries after relocation", () => {
  const modules = clone();
  modules.find((module) => module.id === "agents").mount = "partner-management";
  modules.find((module) => module.id === "handover").mount = "customer-ownership";
  const router = routerFor(modules);
  const agents = router.resolve({ name: "business-agents" });
  const handover = router.resolve({ name: "business-handover" });
  assert.equal(agents.path, "/customers/partner-management");
  assert.equal(agents.matched.at(-1).components.default, views.agentDirectory);
  assert.equal(handover.path, "/customers/customer-ownership");
  assert.equal(handover.matched.at(-1).components.default, views.handoverWorkspace);
  assert.equal(canAccessRoute(agents, "OVERSEA_AGENT"), false);
  assert.equal(canAccessRoute(handover, "OVERSEA_AGENT"), true);
  assert.equal(canAccessRoute(handover, "CUSTOMER"), false);
});

test("overview owns a real page and stable route while moving workspace and module mounts", () => {
  const modules = clone();
  modules.find((module) => module.id === "overview").mount = "business-insights";
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, modules, { businessPath: "/business" })
  });
  const route = router.resolve({ name: "business-overview" });
  assert.equal(route.path, "/business/business-insights");
  assert.equal(route.matched.at(-1).components.default, views.businessOverview);
  assert.equal(canAccessRoute(route, "ADMIN"), true);
  assert.equal(canAccessRoute(route, "OVERSEA_AGENT"), false);
  assert.equal(
    router.resolve("/customers/business-insights").matched.at(-1).name,
    "business-overview"
  );
});

test("invalid registry contracts fail at composition instead of silently overriding routes", () => {
  const duplicateId = clone();
  duplicateId.push(duplicateId[0]);
  assert.throws(() => validateModules(duplicateId), /module ID/);
  const duplicateName = clone();
  duplicateName[1].pages[0].name = duplicateName[0].pages[0].name;
  assert.throws(() => validateModules(duplicateName), /route name/);
  const duplicatePath = clone();
  duplicatePath[1].mount = duplicatePath[0].mount;
  assert.throws(() => validateModules(duplicatePath), /duplicate module path/);
  const noEntry = clone();
  noEntry[0].pages[0].path = "nested";
  assert.throws(() => validateModules(noEntry), /entry page/);
  const noRoles = clone();
  noRoles[0].roles = [];
  assert.throws(() => validateModules(noRoles), /Incomplete/);
  const badMount = clone();
  badMount[0].mount = "../other";
  assert.throws(() => validateModules(badMount), /mount/);
  const badSelection = clone();
  badSelection[1].pages[1].path = ":wrongId";
  assert.throws(() => validateModules(badSelection), /selection parameter/);
  assert.throws(
    () => createApplicationRoutes({ ...views, shipmentWorkspace: undefined }),
    /module view/
  );
  assert.throws(
    () => createApplicationRoutes({ ...views, operations: undefined }),
    /application view/
  );
});

test("actual matched components retain one auth shell and one business workspace", () => {
  const router = routerFor();
  const list = router.resolve({ name: "business-shipments" });
  const detail = router.resolve({ name: "business-shipments-detail", params: { shipmentId: "A" } });
  assert.equal(list.matched[0].components.default, views.operations);
  assert.equal(list.matched[1].components.default, views.business);
  assert.equal(list.matched[2].components.default, views.shipmentWorkspace);
  assert.equal(list.matched[0], detail.matched[0]);
  assert.equal(list.matched[1], detail.matched[1]);
  assert.equal(router.resolve("/home").matched[0].components.default, views.planner);
});

test("role policy applies to nested routes, and empty roles are never public access", () => {
  const router = routerFor();
  assert.equal(canAccessRoute(router.resolve("/admin").meta, "BUSINESS"), false);
  assert.equal(canAccessRoute(router.resolve("/customers/agents").meta, "OVERSEA_AGENT"), false);
  assert.equal(
    canAccessRoute(router.resolve("/customers/shipments/A").meta, "OVERSEA_AGENT"),
    true
  );
  assert.equal(canAccessRoute(router.resolve("/customers/directory").meta, "CUSTOMER"), false);
  assert.equal(canAccessRoute({}, ""), false);
  assert.equal(canAccessRoute({ roles: [] }, "ADMIN"), false);
  assert.equal(operationsHome("OVERSEA_AGENT"), "/customers");
  assert.equal(operationsHome("BUSINESS"), "/workbenches");
});

test("legacy ticket links canonicalize with replace, preserving language and hash", async (t) => {
  const h = await workspace(t, "/customers?shipment=S-A&language=en#table");
  assert.equal(h.route.path, "/customers/shipments/S-A");
  assert.deepEqual(h.route.query, { language: "en" });
  assert.equal(h.route.hash, "#table");
  assert.equal(h.state.selectedShipmentId.value, "S-A");
  assert.equal(h.state.subView.value, "detail");
  assert.equal(h.loads.length, 1);
});

test("canonical URL overrides conflicting legacy selections and refresh restores its detail", async (t) => {
  const h = await workspace(t, "/customers/shipments/S-A?section=agents&shipment=S-B&customer=C-B");
  assert.equal(h.state.menuItem.value, "shipments");
  assert.equal(h.state.selectedShipmentId.value, "S-A");
  assert.equal(h.state.selectedCustomerId.value, "");
  const reload = await workspace(t, h.route.fullPath);
  assert.equal(reload.state.selectedShipmentId.value, "S-A");
});

test("menu, details, browser history and deletion use stable registered destinations", async (t) => {
  const h = await workspace(t, "/customers?section=customers&language=en");
  h.navigation.openCustomer("C-A");
  await settle();
  assert.equal(h.route.path, "/customers/directory/C-A");
  h.navigation.openShipment("S-A");
  await settle();
  assert.equal(h.route.path, "/customers/shipments/S-A");
  assert.equal(h.loads.at(-2).context.isCurrent(), false);
  h.router.back();
  await settle();
  assert.equal(h.state.selectedCustomerId.value, "C-A");
  h.router.forward();
  await settle();
  h.state.selectedShipmentId.value = "";
  await settle();
  assert.equal(h.route.path, "/customers/shipments");
  assert.equal(h.route.query.language, "en");
  h.router.back();
  await settle();
  assert.equal(h.route.path, "/customers/directory/C-A");
});

test("overseas legacy manager links fall back to the permitted directory and block actions", async (t) => {
  const h = await workspace(t, "/customers?section=agents", "OVERSEA_AGENT");
  assert.equal(h.route.path, "/customers/directory");
  assert.equal(h.navigation.navigate("agents"), false);
  assert.equal(h.navigation.navigate("overview"), false);
  assert.deepEqual(
    h.loads.map((item) => item.section),
    ["customers"]
  );
});

test("leaving the registered workspace invalidates pending load contexts", async (t) => {
  const h = await workspace(t, "/customers/shipments");
  const before = h.loads.at(-1).context;
  await h.router.push("/home");
  await settle();
  assert.equal(before.isCurrent(), false);
  assert.equal(h.navigation.navigate("shipments"), false);
  h.scope.stop();
  await h.router.push("/customers/directory");
  await settle();
  assert.equal(h.loads.length, 1);
});

test("module context shares reactive session state and actions without a second store", () => {
  const user = ref({ id: "A", role: "BUSINESS" });
  let calls = 0;
  const context = {
    user: readonly(user),
    logout: () => {
      calls++;
    }
  };
  const app = createApp(page);
  app.provide(workspaceContextKey, context);
  const module = app.runWithContext(() => useWorkspaceContext());
  assert.equal(module, context);
  assert.equal(isReadonly(module.user), true);
  user.value = { id: "B", role: "OVERSEA_AGENT" };
  assert.equal(module.user.value.id, "B");
  module.logout();
  assert.equal(calls, 1);
  assert.throws(
    () => createApp(page).runWithContext(() => useWorkspaceContext()),
    /OperationsEntry/
  );
});

test("post login keeps an authorized deep link including selection and query", async () => {
  const router = routerFor();
  await router.push("/customers/directory/customer-one?tab=profile");
  assert.equal(
    postLoginDestination(router.currentRoute.value, "BUSINESS"),
    "/customers/directory/customer-one?tab=profile"
  );
  assert.equal(
    postLoginDestination(
      { name: "restricted", fullPath: "/admin", matched: [{ meta: { roles: ["ADMIN"] } }] },
      "BUSINESS"
    ),
    "/workbenches"
  );
  assert.equal(
    postLoginDestination(
      { name: "workbenches", fullPath: "/workbenches", matched: [] },
      "OVERSEA_AGENT"
    ),
    "/customers"
  );
  assert.equal(
    postLoginDestination(
      { name: "foreign", fullPath: "//outside.example", matched: [{ meta: {} }] },
      "BUSINESS"
    ),
    "/workbenches"
  );
});
