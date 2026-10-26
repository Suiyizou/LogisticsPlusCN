import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryHistory, createRouter } from "vue-router";
import {
  createBusinessModuleCatalog,
  composeApplicationViews
} from "../src/modules/moduleCatalog.js";
import {
  businessModuleCatalog,
  businessModules,
  modulesForRole,
  moduleDestination,
  canAccessRoute
} from "../src/modules/registry.js";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { generatedModuleRegistrations } from "../src/modules/generatedRegistrations.js";
import { applicationViews } from "../src/modules/views.js";

function registration(
  id = "documents",
  loader = async () => ({ default: { render: () => null } })
) {
  return {
    module: {
      id,
      mount: id,
      labelKey: `${id}.title`,
      roles: ["ADMIN", "BUSINESS"],
      pages: [
        { name: `business-${id}`, path: "", view: id },
        { name: `business-${id}-detail`, path: ":customerId", selection: "customerId", view: id }
      ]
    },
    views: { [id]: loader }
  };
}
const hostViews = Object.fromEntries(
  ["planner", "operations", "workbenches", "admin", "business", "legacyBusiness"].map((name) => [
    name,
    async () => ({ default: { name, render: () => null } })
  ])
);

test("one module registration supplies menus, routes and a genuinely lazy page", async () => {
  let calls = 0;
  const page = { name: "DocumentsPage", render: () => null };
  const catalog = createBusinessModuleCatalog([
    registration("documents", async () => {
      calls++;
      return { default: page };
    })
  ]);
  const views = composeApplicationViews(hostViews, catalog.views);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, catalog.modules)
  });
  assert.equal(calls, 0);
  assert.equal(modulesForRole("BUSINESS", catalog.modules)[0].routeName, "business-documents");
  assert.deepEqual(modulesForRole("CUSTOMER", catalog.modules), []);
  await router.push({ name: "business-documents-detail", params: { customerId: "C/123" } });
  assert.equal(calls, 1);
  assert.equal(router.currentRoute.value.matched.at(-1).components.default, page);
  assert.equal(canAccessRoute(router.currentRoute.value, "BUSINESS"), true);
  assert.equal(canAccessRoute(router.currentRoute.value, "CUSTOMER"), false);
});

test("module relocation and root relocation retain stable links and legacy root aliases", () => {
  const source = registration("customers");
  source.module.mount = "client-center";
  const catalog = createBusinessModuleCatalog([source]);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(
      composeApplicationViews(hostViews, catalog.views),
      catalog.modules,
      { businessPath: "/business" }
    )
  });
  const link = moduleDestination(
    { section: "customers", view: "detail", customerId: "C/123" },
    catalog.modules
  );
  assert.equal(router.resolve(link).path, "/business/client-center/C%2F123");
  assert.equal(
    router.resolve("/customers/client-center/C%2F123").name,
    "business-customers-detail"
  );
});

test("disabled modules keep valid loaders but have no menu, route or destination", () => {
  const source = registration();
  source.module.enabled = false;
  const catalog = createBusinessModuleCatalog([source]);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(
      composeApplicationViews(hostViews, catalog.views),
      catalog.modules
    )
  });
  assert.deepEqual(modulesForRole("ADMIN", catalog.modules), []);
  assert.equal(router.hasRoute("business-documents"), false);
  assert.equal(moduleDestination({ section: "documents" }, catalog.modules), null);
  assert.equal(catalog.views.documents, source.views.documents);
});

test("metadata snapshots remain cloneable and isolate source roles and pages", () => {
  const source = registration();
  const catalog = createBusinessModuleCatalog([source]);
  const snapshot = structuredClone(catalog.modules);
  source.module.roles.push("CUSTOMER");
  source.module.pages[0].path = "changed";
  source.views.documents = async () => ({ default: {} });
  assert.deepEqual(catalog.modules, snapshot);
  assert.notEqual(catalog.views.documents, source.views.documents);
  assert.equal(modulesForRole("CUSTOMER", catalog.modules).length, 0);
});

test("production catalog supplies every built-in view without importing a page", () => {
  assert.equal(businessModuleCatalog.modules, businessModules);
  assert.equal(
    businessModules.length,
    6 +
      generatedModuleRegistrations.filter(
        ({ module }) => (module.surface || "business") === "business"
      ).length
  );
  for (const module of businessModules)
    for (const page of module.pages) {
      assert.equal(typeof businessModuleCatalog.views[page.view], "function");
      assert.equal(applicationViews[page.view], businessModuleCatalog.views[page.view]);
    }
  assert.equal(
    businessModules.find((module) => module.id === "customer-summary-example").enabled,
    false
  );
});

test("a module cannot silently replace an application auth or layout loader", () => {
  for (const key of Object.keys(hostViews)) {
    const source = registration(key);
    source.module.mount = "test-module";
    const catalog = createBusinessModuleCatalog([source]);
    assert.throws(
      () => composeApplicationViews(hostViews, catalog.views),
      /conflicts with application view/
    );
    assert.equal(typeof hostViews[key], "function");
  }
});

test("module-local ownership rejects using another module's loader", () => {
  const source = registration("invoices");
  source.module.pages[0].view = "documents";
  assert.throws(() => createBusinessModuleCatalog([registration(), source]), /Missing module view/);
});

test("module route names cannot replace host pages or parent layouts", () => {
  for (const name of [
    "landing",
    "home",
    "planner-config",
    "planner-cargos",
    "planner-results",
    "containers",
    "algorithm",
    "admin",
    "workbenches",
    "customers"
  ]) {
    const source = registration();
    source.module.pages[0].name = name;
    const catalog = createBusinessModuleCatalog([source]);
    assert.throws(
      () =>
        createApplicationRoutes(composeApplicationViews(hostViews, catalog.views), catalog.modules),
      /Duplicate application route name/
    );
  }
});

test("all loader keys are checked even when they are not currently a route", () => {
  const source = registration();
  source.views.futurePage = {};
  assert.throws(() => createBusinessModuleCatalog([source]), /Invalid module loader/);
  assert.throws(() => composeApplicationViews({ operations: {} }, {}), /Invalid application view/);
});

test("duplicate loader keys are rejected rather than silently overwritten", () => {
  const first = registration();
  const second = registration("invoices");
  second.views.documents = first.views.documents;
  assert.throws(() => createBusinessModuleCatalog([first, second]), /Duplicate module view/);
});

test("loader presence requires an own key, not an inherited property", () => {
  const source = registration();
  source.views = Object.create(source.views);
  assert.throws(() => createBusinessModuleCatalog([source]), /Missing module view/);
  source.views = {};
  Object.defineProperty(source.views, "documents", { value: registration().views.documents });
  assert.throws(() => createBusinessModuleCatalog([source]), /Missing module view/);
});

test("missing view, missing loaders and non-function loaders fail during composition", () => {
  const source = registration();
  delete source.module.pages[0].view;
  assert.throws(() => createBusinessModuleCatalog([source]), /Missing module view/);
  assert.throws(
    () => createBusinessModuleCatalog([{ ...registration(), views: null }]),
    /Missing module loaders/
  );
  assert.throws(
    () => createBusinessModuleCatalog([{ ...registration(), views: [] }]),
    /Missing module loaders/
  );
  assert.throws(
    () => createBusinessModuleCatalog([{ ...registration(), views: { documents: null } }]),
    /Invalid module loader/
  );
});

test("disabled registrations reserve names and loaders before future activation", () => {
  const second = registration("invoices");
  second.module.enabled = false;
  second.module.pages[0].name = "business-documents";
  assert.throws(() => createBusinessModuleCatalog([registration(), second]), /route name/);
  second.module.pages[0].name = "business-invoices";
  second.views.documents = registration().views.documents;
  assert.throws(
    () => createBusinessModuleCatalog([registration(), second]),
    /Duplicate module view/
  );
});

test("invalid metadata is rejected before snapshot creation", () => {
  for (const roles of [null, [], [false], [""]]) {
    const source = registration();
    source.module.roles = roles;
    assert.throws(() => createBusinessModuleCatalog([source]), /Incomplete module contract/);
  }
  const source = registration();
  source.module.pages[1].path = null;
  assert.throws(() => createBusinessModuleCatalog([source]), /Invalid or duplicate module path/);
});

test("selection must match a full route parameter rather than a prefix", () => {
  const source = registration();
  source.module.pages[1].path = ":customerIdSuffix";
  assert.throws(() => createBusinessModuleCatalog([source]), /Missing selection parameter/);
});

test("special object property keys do not alter the loader map prototype", () => {
  const source = registration();
  source.module.pages.forEach((page) => {
    page.view = "__proto__";
  });
  source.views = Object.fromEntries([["__proto__", async () => ({ default: {} })]]);
  const catalog = createBusinessModuleCatalog([source]);
  const composed = composeApplicationViews(hostViews, catalog.views);
  assert.equal(Object.getPrototypeOf(catalog.views), Object.prototype);
  assert.equal(Object.getPrototypeOf(composed), Object.prototype);
  assert.equal(Object.hasOwn(composed, "__proto__"), true);
});
