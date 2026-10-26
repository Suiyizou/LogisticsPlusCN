import assert from "node:assert/strict";
import test from "node:test";
import { createRouter, createMemoryHistory } from "vue-router";
import {
  createModuleCatalog,
  modulesForSurface,
  composeApplicationViews
} from "../src/modules/moduleCatalog.js";
import { canAccessRoute, platformModuleCatalog, businessModules } from "../src/modules/registry.js";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { adminNavigation } from "../src/features/admin/adminNavigation.js";
const hostViews = Object.fromEntries(
  ["planner", "operations", "workbenches", "admin", "business", "legacyBusiness", "customer"].map(
    (name) => [name, async () => ({ default: { name, render: () => null } })]
  )
);
const registration = (surface, id = `${surface}-new`, order = 0) => ({
  module: {
    id,
    surface,
    mount: "new-module",
    labelKey: `${id}.title`,
    roles: [surface === "customer" ? "CUSTOMER" : surface === "admin" ? "ADMIN" : "BUSINESS"],
    navigation: { group: "extensions", order },
    pages: [
      { name: `${id}-list`, path: "", view: id },
      { name: `${id}-detail`, path: ":recordId", view: id, selection: "recordId" }
    ]
  },
  views: { [id]: async () => ({ default: { name: id, render: () => null } }) }
});
const routerFor = (catalog) =>
  createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(
      composeApplicationViews(hostViews, catalog.views),
      catalog.modules
    )
  });
test("one catalog adds independent business/admin/customer pages without widening either authentication boundary", async () => {
  const catalog = createModuleCatalog([
    registration("business"),
    registration("admin"),
    registration("customer")
  ]);
  const router = routerFor(catalog);
  for (const [surface, path, role] of [
    ["business", "/customers/new-module", "BUSINESS"],
    ["admin", "/admin/new-module", "ADMIN"],
    ["customer", "/customer-workspace/new-module", "CUSTOMER"]
  ]) {
    await router.push(path + "/R%2F1");
    assert.equal(router.currentRoute.value.name, `${surface}-new-detail`);
    assert.equal(router.currentRoute.value.params.recordId, "R/1");
    assert.equal(canAccessRoute(router.currentRoute.value, role), true);
    assert.equal(
      canAccessRoute(router.currentRoute.value, surface === "customer" ? "ADMIN" : "CUSTOMER"),
      false
    );
    assert.equal(
      router.currentRoute.value.matched[0].components.default.name,
      surface === "customer" ? "customer" : "operations"
    );
  }
});
test("navigation placement changes order/group without changing module identity, URL or permission", () => {
  const first = registration("admin", "admin-first", 2),
    second = registration("admin", "admin-second", 1);
  second.module.mount = "other";
  const catalog = createModuleCatalog([first, second]);
  const before = routerFor(catalog).resolve({ name: "admin-first-list" }).path;
  first.module.navigation = { group: "moved", order: -1 };
  const moved = createModuleCatalog([first, second]);
  assert.deepEqual(
    modulesForSurface(moved.modules, "admin", "ADMIN").map((m) => m.id),
    ["admin-first", "admin-second"]
  );
  assert.equal(routerFor(moved).resolve({ name: "admin-first-list" }).path, before);
  assert.equal(modulesForSurface(catalog.modules, "admin", "ADMIN")[0].id, "admin-second");
  const navigation = adminNavigation("en-US", () => "Extension", moved.modules);
  assert.equal(navigation.pages[0].key, "admin-first");
  assert.equal(navigation.pages[0].routeName, "admin-first-list");
  assert.ok(navigation.groups.some((group) => group.key === "moved"));
});
test("disabled routes, hidden navigation and invalid surfaces retain separate meanings", () => {
  const hidden = registration("customer");
  hidden.module.navigation.hidden = true;
  const catalog = createModuleCatalog([hidden]);
  assert.equal(modulesForSurface(catalog.modules, "customer", "CUSTOMER").length, 0);
  assert.equal(routerFor(catalog).hasRoute("customer-new-list"), true);
  hidden.module.enabled = false;
  assert.equal(routerFor(createModuleCatalog([hidden])).hasRoute("customer-new-list"), false);
  for (const navigation of [
    null,
    [],
    "bad",
    { group: "../admin" },
    { order: Infinity },
    { hidden: "yes" }
  ]) {
    const invalid = registration("business");
    invalid.module.navigation = navigation;
    assert.throws(() => createModuleCatalog([invalid]), /Invalid module navigation/);
  }
  const invalid = registration("root");
  assert.throws(() => createModuleCatalog([invalid]), /Invalid module surface/);
});
test("real administrator and customer registrations share catalog but preserve existing business routes", () => {
  assert.equal(
    platformModuleCatalog.modules.filter((module) => module.surface === "admin").length,
    10
  );
  assert.ok(platformModuleCatalog.modules.some((module) => module.surface === "customer"));
  assert.ok(businessModules.every((module) => !module.surface || module.surface === "business"));
  const catalog = platformModuleCatalog;
  const router = routerFor(catalog);
  assert.equal(router.resolve("/customers/shipments/S1").name, "business-shipments-detail");
  assert.equal(router.resolve("/admin/files").name, "admin-files");
  assert.equal(router.resolve("/customer-workspace/shipments").name, "customer-assigned-shipments");
});

test("existing administrator modules can move navigation groups without changing host code or stable routes", () => {
  const modules = structuredClone(platformModuleCatalog.modules);
  modules.find((module) => module.id === "admin-files").navigation.group = "tracking";
  const navigation = adminNavigation("en-US", (key) => key, modules);
  assert.equal(navigation.pages.find((page) => page.key === "files").group, "tracking");
  assert.equal(navigation.pages.find((page) => page.key === "files").routeName, "admin-files");
  assert.equal(
    platformModuleCatalog.modules.find((module) => module.id === "admin-files").navigation.group,
    "security"
  );
});
