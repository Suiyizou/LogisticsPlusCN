import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryHistory, createRouter } from "vue-router";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { platformModules, modulesForRole, canAccessRoute } from "../src/modules/registry.js";
import { adminNavigation } from "../src/features/admin/adminNavigation.js";
import { consolidateCustomerNavigation } from "../src/modules/customerManagementNavigation.js";

const cloneModules = () => structuredClone(platformModules);
const views = Object.fromEntries([
  "planner", "operations", "workbenches", "admin", "business", "legacyBusiness", "customer",
  ...platformModules.flatMap((module) => module.pages.map((page) => page.view))
].filter(Boolean).map((name) => [name, { name, render: () => null }]));
const routerFor = (modules = platformModules, options) => createRouter({
  history: createMemoryHistory(),
  routes: createApplicationRoutes(views, modules, options)
});

function menu(role, modules = platformModules, legacy = false) {
  const groups = [{
    key: "business",
    items: modulesForRole(role, modules).map((module) => ({
      key: module.id, to: `/customers/${module.mount}`
    }))
  }];
  if (role === "ADMIN") groups.push({
    key: "admin",
    items: adminNavigation("zh-CN", (key) => key, modules).pages.map((page) => ({
      key: page.key,
      ...(legacy ? { adminKey: page.key } : {}),
      to: `/admin/${modules.find((module) => module.id === page.moduleId).mount}`
    }))
  });
  return groups;
}

test("the old administrator customer URL opens the actual CRUD workspace and preserves its query and hash", async () => {
  const router = routerFor();
  await router.push("/admin/platform?customer=C-42&language=en&tag=one&tag=two#contacts");
  const route = router.currentRoute.value;
  assert.equal(route.name, "business-customers");
  assert.equal(route.path, "/customers/directory");
  assert.deepEqual(route.query, { customer: "C-42", language: "en", tag: ["one", "two"] });
  assert.equal(route.hash, "#contacts");
  assert.equal(route.meta.workspace, "business");
  assert.equal(route.meta.section, "customers");
  assert.deepEqual(route.matched.map((record) => record.components.default.name), [
    "operations", "business", "customerWorkspace"
  ]);
  assert.equal(canAccessRoute(route, "ADMIN"), true);
  assert.equal(canAccessRoute(route, "CUSTOMER"), false);
  assert.equal(canAccessRoute(router.resolve("/admin/employees"), "BUSINESS"), false);
});

test("the administrator entry follows registered customer mounts and workspace roots", async () => {
  const modules = cloneModules();
  modules.find((module) => module.id === "customers").mount = "client-directory";
  const router = routerFor(modules, { businessPath: "/business" });
  await router.push("/admin/platform?language=en#clients");
  assert.equal(router.currentRoute.value.fullPath, "/business/client-directory?language=en#clients");
});

test("an absent, disabled or administrator-inaccessible customer module retains the old admin page", async () => {
  for (const configuration of ["absent", "disabled", "without-admin"]) {
    let modules = cloneModules();
    const customer = modules.find((module) => module.id === "customers");
    if (configuration === "absent") modules = modules.filter((module) => module !== customer);
    else if (configuration === "disabled") customer.enabled = false;
    else customer.roles = ["BUSINESS"];
    const router = routerFor(modules);
    await router.push("/admin/platform?language=en#clients");
    const route = router.currentRoute.value;
    assert.equal(route.fullPath, "/admin/platform?language=en#clients", configuration);
    assert.equal(route.name, "admin-platform", configuration);
    assert.equal(route.matched.at(-1).components.default, views["admin-platform"], configuration);
    assert.equal(canAccessRoute(route, "ADMIN"), true);
    assert.equal(canAccessRoute(route, "BUSINESS"), false);
  }
});

test("administrators get one customer link in system management, including the legacy admin menu", () => {
  for (const legacy of [false, true]) {
    const original = menu("ADMIN", platformModules, legacy);
    const before = structuredClone(original);
    const groups = consolidateCustomerNavigation(original, "ADMIN", platformModules);
    const customerLinks = groups.flatMap((group) => group.items.filter(
      (item) => item.to === "/customers/directory"
    ).map((item) => ({ group: group.key, item })));
    assert.equal(customerLinks.length, 1);
    assert.equal(customerLinks[0].group, "admin");
    assert.equal(customerLinks[0].item.key, "platform");
    assert.equal(customerLinks[0].item.routeName, "business-customers");
    assert.equal(customerLinks[0].item.adminKey, undefined);
    assert.equal(groups.find((group) => group.key === "business").items.some(
      (item) => item.key === "customers"
    ), false);
    assert.deepEqual(original, before, "navigation inputs are not mutated");
  }
});

test("business users and overseas agents keep their existing customer navigation and permissions", () => {
  const router = routerFor();
  for (const role of ["BUSINESS", "OVERSEA_AGENT"]) {
    const original = menu(role);
    const groups = consolidateCustomerNavigation(original, role, platformModules);
    assert.equal(groups, original);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, "business");
    assert.equal(groups[0].items.find((item) => item.key === "customers").to, "/customers/directory");
    assert.equal(canAccessRoute(router.resolve("/customers/directory"), role), true);
    assert.equal(canAccessRoute(router.resolve("/admin/employees"), role), false);
  }
});

test("disabled or hidden admin customer entries do not remove the business customer link", () => {
  for (const configuration of ["disabled", "hidden", "absent"]) {
    let modules = cloneModules();
    const platform = modules.find((module) => module.id === "admin-platform");
    if (configuration === "disabled") platform.enabled = false;
    else if (configuration === "hidden") platform.navigation.hidden = true;
    else modules = modules.filter((module) => module !== platform);
    const groups = consolidateCustomerNavigation(menu("ADMIN", modules), "ADMIN", modules);
    assert.equal(groups.find((group) => group.key === "business").items.find(
      (item) => item.key === "customers"
    ).to, "/customers/directory", configuration);
  }
});

test("menu consolidation respects customer configuration and preserves unrelated admin actions", () => {
  const modules = cloneModules();
  modules.find((module) => module.id === "customers").mount = "clients";
  const original = menu("ADMIN", modules, true);
  const groups = consolidateCustomerNavigation(original, "ADMIN", modules);
  const admin = groups.find((group) => group.key === "admin");
  assert.equal(admin.items.find((item) => item.key === "platform").to, "/customers/clients");
  assert.deepEqual(admin.items.find((item) => item.key === "employees"),
    original.find((group) => group.key === "admin").items.find((item) => item.key === "employees"));
  modules.find((module) => module.id === "customers").enabled = false;
  const fallback = menu("ADMIN", modules, true);
  assert.equal(consolidateCustomerNavigation(fallback, "ADMIN", modules), fallback);
  assert.equal(fallback.find((group) => group.key === "admin").items.find(
    (item) => item.key === "platform"
  ).to, "/admin/platform");
});
