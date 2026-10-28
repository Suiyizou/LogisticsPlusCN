import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
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
  assert.equal(link.pathname, "/tracking/");
  assert.equal(link.searchParams.get("returnTo"), "/business/cargo/A%2FB?filter=active#files");
  assert.equal(link.searchParams.get("number"), "123456789");
  assert.equal(link.searchParams.get("type"), "BOOKING");
  assert.equal(link.hash, "#tracking");
});

test("missing supported tracking numbers open overview without fabricating a bill query", () => {
  const link = new URL(
    trackingWorkspaceLink({
      returnTo: "/customers/directory",
      shipment: { carrier: "UNKNOWN", referenceType: "BILLOFLADING", referenceNo: "unsupported-bill" }
    }),
    "http://localhost"
  );
  assert.equal(link.hash, "#overview");
  assert.equal(link.searchParams.has("number"), false);
  assert.equal(link.searchParams.has("carrier"), false);
  for (const returnTo of ["", "https://external.invalid/", "//external.invalid/"]) {
    assert.throws(() => trackingWorkspaceLink({ returnTo }), /local resolved path/);
  }
});

test("new carrier bill links retain their carrier and bill query identity", () => {
  const link = new URL(trackingWorkspaceLink({
    returnTo: "/customers/shipments",
    shipment: { carrier: "MSC", referenceType: "BILLOFLADING", referenceNo: "MEDU123456789" }
  }), "http://localhost");
  assert.equal(link.hash, "#tracking");
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
