import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import {
  businessSections,
  readBusinessLocation,
  businessLocationQuery
} from "../src/features/navigation/businessNavigation.js";
import { generatedModuleRegistrations } from "../src/modules/generatedRegistrations.js";
import { useBusinessNavigation } from "../src/features/navigation/useBusinessNavigation.js";

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setImmediate(resolve));
}
async function harness(t, initial = "/customers", roleName = "BUSINESS", load) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ["/customers", "/workbenches", "/home"].map((path) => ({
      path,
      component: { render: () => null }
    }))
  });
  await router.push(initial);
  await router.isReady();
  const loads = [],
    errors = [];
  const scope = effectScope();
  const state = {
    role: ref(roleName),
    menuItem: ref(""),
    subView: ref("list"),
    selectedShipmentId: ref(""),
    selectedCustomerId: ref("")
  };
  const route = {
    get path() {
      return router.currentRoute.value.path;
    },
    get query() {
      return router.currentRoute.value.query;
    },
    get hash() {
      return router.currentRoute.value.hash;
    }
  };
  const nav = scope.run(() =>
    useBusinessNavigation({
      ...state,
      route,
      router,
      loadSection: load || ((section, customer) => loads.push([section, customer])),
      onLoadError: (error) => errors.push(error)
    })
  );
  nav.initialize();
  await flush();
  t.after(() => scope.stop());
  return { nav, state, loads, errors, scope, router, route };
}

test("menu visibility and valid sections share the same role policy", () => {
  const generatedIds = new Set(generatedModuleRegistrations.map(({ module }) => module.id));
  const builtinIds = (role) =>
    businessSections(role)
      .filter((item) => !generatedIds.has(item.id))
      .map((item) => item.id);
  assert.deepEqual(builtinIds("BUSINESS"), [
    "overview",
    "update-schedule-preview",
    "customers",
    "handover",
    "shipments",
    "agents"
  ]);
  assert.deepEqual(builtinIds("ADMIN"), [
    "overview",
    "update-schedule-preview",
    "customers",
    "handover",
    "shipments",
    "agents"
  ]);
  assert.deepEqual(builtinIds("OVERSEA_AGENT"), ["customers", "handover", "shipments"]);
  assert.equal(
    businessSections("OVERSEA_AGENT").find((item) => item.id === "handover").labelKey,
    "customers.businessTransfer"
  );
  for (const { module } of generatedModuleRegistrations) {
    for (const role of ["ADMIN", "BUSINESS", "OVERSEA_AGENT"]) {
      const expected =
        (module.surface || "business") === "business" &&
        module.enabled !== false &&
        module.navigation?.hidden !== true &&
        module.roles.includes(role);
      assert.equal(
        businessSections(role).some((item) => item.id === module.id),
        expected
      );
    }
  }
  assert.deepEqual(businessSections("CUSTOMER"), []);
  assert.equal(readBusinessLocation({ section: "agents" }, "OVERSEA_AGENT").section, "customers");
});

test("legacy shipment and customer links retain their meaning", () => {
  assert.equal(readBusinessLocation({ customer: "c-A" }, "BUSINESS").section, "customers");
  assert.deepEqual(
    readBusinessLocation({ section: "customers", shipment: "s-A", customer: "c-A" }, "BUSINESS"),
    { section: "shipments", view: "detail", shipmentId: "s-A", customerId: "c-A" }
  );
  assert.deepEqual(readBusinessLocation({ customer: "c-A" }, "OVERSEA_AGENT"), {
    section: "customers",
    view: "list",
    shipmentId: "",
    customerId: "c-A"
  });
  assert.equal(
    readBusinessLocation({ section: ["shipments", "agents"], shipment: ["s-A", "s-B"] }, "BUSINESS")
      .shipmentId,
    "s-A"
  );
});

test("generated links remove stale selections and preserve unrelated query options", () => {
  assert.deepEqual(
    businessLocationQuery(
      { section: "customers", customer: "c-A", view: "detail", language: "en" },
      { section: "shipments", shipmentId: "s-A", view: "detail" }
    ),
    { section: "shipments", shipment: "s-A", language: "en" }
  );
});

test("initial shipment URL opens detail and loads its section", async (t) => {
  const h = await harness(t, "/customers?shipment=s-A");
  assert.equal(h.state.menuItem.value, "shipments");
  assert.equal(h.state.selectedShipmentId.value, "s-A");
  assert.equal(h.state.subView.value, "detail");
  assert.deepEqual(h.loads, [["shipments", ""]]);
});

test("menu and ticket links follow browser back and forward without losing context", async (t) => {
  const h = await harness(t, "/customers?section=customers&language=en#table");
  h.nav.openShipment("s-A");
  await flush();
  assert.equal(h.route.query.shipment, "s-A");
  assert.equal(h.route.query.language, "en");
  assert.equal(h.route.hash, "#table");
  h.nav.navigate("handover");
  await flush();
  assert.equal(h.state.menuItem.value, "handover");
  assert.equal(h.state.subView.value, "list");
  assert.equal(h.state.selectedShipmentId.value, "");
  h.router.back();
  await flush();
  assert.equal(h.state.menuItem.value, "shipments");
  assert.equal(h.state.selectedShipmentId.value, "s-A");
  h.router.back();
  await flush();
  assert.equal(h.state.menuItem.value, "customers");
  h.router.forward();
  await flush();
  assert.equal(h.state.selectedShipmentId.value, "s-A");
});

test("customer details and return-to-list links survive reload", async (t) => {
  const h = await harness(t, "/customers?section=customers");
  h.nav.openCustomer("c-A");
  await flush();
  assert.equal(h.state.subView.value, "detail");
  assert.equal(h.state.selectedCustomerId.value, "c-A");
  const reloaded = await harness(t, h.router.currentRoute.value.fullPath);
  assert.equal(reloaded.state.subView.value, "detail");
  assert.equal(reloaded.state.selectedCustomerId.value, "c-A");
  h.nav.navigate("customers");
  await flush();
  assert.equal(h.state.subView.value, "list");
  assert.equal(h.state.selectedCustomerId.value, "");
  assert.equal(h.route.query.customer, undefined);
  assert.equal(h.route.query.view, undefined);
});

test("overseas agents cannot navigate to manager sections through a URL or action", async (t) => {
  const h = await harness(t, "/customers?section=agents", "OVERSEA_AGENT");
  assert.deepEqual(h.loads, [["customers", ""]]);
  assert.equal(h.nav.navigate("overview"), false);
  assert.equal(h.nav.navigate("agents"), false);
  assert.equal(h.nav.navigate("invalid"), false);
  await flush();
  assert.equal(h.loads.length, 1);
});

test("deleted ticket selection clears detail URL without adding a history entry", async (t) => {
  const h = await harness(t, "/customers?section=customers");
  h.nav.openShipment("s-A");
  await flush();
  h.state.selectedShipmentId.value = "";
  await flush();
  assert.equal(h.route.query.shipment, undefined);
  assert.equal(h.state.subView.value, "list");
  h.router.back();
  await flush();
  assert.equal(h.state.menuItem.value, "customers");
});

test("scope disposal and leaving the business workspace stop navigation loads", async (t) => {
  const h = await harness(t);
  await h.router.push("/home");
  await flush();
  assert.equal(h.loads.length, 1);
  assert.equal(h.nav.navigate("shipments"), false);
  h.scope.stop();
  await h.router.push("/customers?section=shipments");
  await flush();
  assert.equal(h.loads.length, 1);
});

test("section load errors are handled, including synchronous failures", async (t) => {
  const h = await harness(t, "/customers", "BUSINESS", () => {
    throw Error("section unavailable");
  });
  assert.equal(h.errors[0].message, "section unavailable");
});

test("a previous location's asynchronous load cannot re-select an old customer", async (t) => {
  const operations = [];
  const h = await harness(
    t,
    "/customers?section=customers&customer=c-A&view=detail",
    "BUSINESS",
    (section, customer, context) => {
      operations.push({ customer, isCurrent: context.isCurrent });
    }
  );
  h.nav.openCustomer("c-B");
  await flush();
  assert.equal(operations[0].isCurrent(), false);
  assert.equal(operations[1].isCurrent(), true);
  h.scope.stop();
  assert.equal(operations[1].isCurrent(), false);
});

test("unavailable customer detail removes its stale URL", async (t) => {
  const h = await harness(t, "/customers?section=customers&customer=missing&view=detail");
  h.state.selectedCustomerId.value = "";
  await flush();
  assert.equal(h.state.subView.value, "list");
  assert.equal(h.route.query.customer, undefined);
});
