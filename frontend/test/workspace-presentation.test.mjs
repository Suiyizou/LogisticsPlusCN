import assert from "node:assert/strict";
import test from "node:test";
import { computed, ref } from "vue";
import { createWorkspacePresentation } from "../src/features/presentation/createWorkspacePresentation.js";

function harness() {
  const locale = ref("zh-CN");
  const customers = ref([
    { id: 7, displayName: "Customer A", username: "user-a", partyRole: "SHIPPER" }
  ]);
  const assignableCustomers = ref([{ id: "7", displayName: "Customer A", clientCode: "C07" }]);
  const shipmentCustomerMap = ref({ S1: [7] });
  const boundCustomerIds = ref([7]);
  const presentation = createWorkspacePresentation({
    t: (key, parameters) => `${locale.value}:${key}${parameters ? `:${parameters.count}` : ""}`,
    getLocale: () => locale.value,
    readDirectory: () => ({
      customers: customers.value,
      assignableCustomers: assignableCustomers.value,
      shipmentCustomerMap: shipmentCustomerMap.value
    }),
    getBoundCustomerIds: () => boundCustomerIds.value
  });
  return {
    presentation,
    locale,
    customers,
    assignableCustomers,
    shipmentCustomerMap,
    boundCustomerIds
  };
}

test("presentation construction does not read late workflow ports or translate labels", () => {
  let ready = false;
  const presentation = createWorkspacePresentation({
    t: () => {
      assert.equal(ready, true);
      return "missing";
    },
    getLocale: () => {
      assert.equal(ready, true);
      return "en-US";
    },
    readDirectory: () => {
      assert.equal(ready, true);
      return { customers: [], assignableCustomers: [] };
    },
    getBoundCustomerIds: () => {
      assert.equal(ready, true);
      return [];
    }
  });
  ready = true;
  assert.equal(presentation.getCustomerName("not-loaded"), "not-loaded");
  assert.equal(presentation.isCustomerBoundToSelectedShipment("not-loaded"), false);
  assert.equal(presentation.partyRoleLabel(""), "missing");
});

test("display ports consistently return text for numeric IDs and malformed dates", () => {
  const { presentation } = harness();
  assert.equal(presentation.getCustomerName(99), "99");
  assert.equal(presentation.getCustomerUsername(99), "99");
  assert.equal(presentation.customerFilterOptionLabel({ id: 99 }), "99");
  assert.equal(presentation.formatDateTime(new Date(Number.NaN)), "Invalid Date");
  assert.equal(presentation.formatDateTime("not-a-date"), "not-a-date");
  const users = presentation.shipmentBoundUsers({ boundUsers: [{ id: 99 }] });
  assert.equal(users[0].name, "99");
  assert.equal(typeof presentation.boundUserLabel(users[0]), "string");
});

test("cached Vue consumers follow replaced customer and assignable directory refs", () => {
  const { presentation, customers, assignableCustomers } = harness();
  const display = computed(() => [
    presentation.getCustomerName("7"),
    presentation.getCustomerUsername(7),
    presentation.selectedCustomerOptionLabel(7)
  ]);
  assert.deepEqual(display.value, ["Customer A", "user-a", "Customer A · C07"]);
  customers.value = [{ id: "7", displayName: "Renamed", username: "user-b" }];
  assignableCustomers.value = [{ id: 7, displayName: "Renamed", clientCode: "C99" }];
  assert.deepEqual(display.value, ["Renamed", "user-b", "Renamed · C99"]);
  customers.value = [];
  assignableCustomers.value = [];
  assert.deepEqual(display.value, ["7", "7", ""]);
});

test("relationship and selected shipment changes update existing presentation consumers", () => {
  const { presentation, customers, shipmentCustomerMap, boundCustomerIds } = harness();
  const selection = computed(() => presentation.isCustomerBoundToSelectedShipment("7"));
  const primary = computed(() => presentation.primaryBoundCustomerName({ shipmentId: "S1" }));
  const users = computed(() => presentation.shipmentBoundUsers({ shipmentId: "S1" }));
  assert.equal(selection.value, true);
  assert.equal(primary.value, "Customer A");
  customers.value = [{ id: 8, displayName: "Customer B", partyRole: "CONSIGNEE" }];
  shipmentCustomerMap.value = { S1: [8] };
  boundCustomerIds.value = [8];
  assert.equal(selection.value, false);
  assert.equal(primary.value, "Customer B");
  assert.deepEqual(
    users.value.map((user) => [user.id, user.role]),
    [[8, "CONSIGNEE"]]
  );
  shipmentCustomerMap.value = {};
  assert.equal(primary.value, "");
  assert.deepEqual(users.value, []);
});

test("locale replacement updates role, status, reference and date consumers without reconstruction", () => {
  const { presentation, locale } = harness();
  const date = new Date(2026, 9, 11, 13, 5);
  const labels = computed(() => [
    presentation.partyRoleLabel("SHIPPER"),
    presentation.statusLabel("ACTIVE"),
    presentation.referenceTypeLabel("BOOKING"),
    presentation.formatDate(date)
  ]);
  const chinese = labels.value;
  locale.value = "en-US";
  const english = labels.value;
  assert.ok(chinese.slice(0, 3).every((label) => label.startsWith("zh-CN:")));
  assert.ok(english.slice(0, 3).every((label) => label.startsWith("en-US:")));
  assert.equal(
    english[3],
    new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date)
  );
  assert.notEqual(chinese[3], english[3]);
});

test("unknown and missing party roles never impersonate a shipper", () => {
  const { presentation } = harness();
  assert.equal(presentation.partyRoleLabel(" customs_broker "), "CUSTOMS BROKER");
  assert.equal(presentation.partyRoleLabel(""), "zh-CN:customers.missingValue");
  assert.equal(presentation.partyRoleLabel("shipper"), "zh-CN:customers.roleShipper");
  assert.equal(
    presentation.boundRoleSummary({ boundRoles: ["CONSIGNEE", "CUSTOMS_BROKER"] }),
    "zh-CN:customers.roleConsignee / CUSTOMS BROKER"
  );
  assert.equal(
    presentation.boundUserLabel({ name: "Partner", role: "CUSTOMS_BROKER" }),
    "Partner (CUSTOMS BROKER)"
  );
  assert.equal(
    presentation.boundUserLabel({ name: "Partner", role: "OVERSEA_AGENT" }),
    "Partner (zh-CN:portal.roleOverseaAgent)"
  );
});

test("refresh outcomes keep server business-state priority and translated attempt evidence", () => {
  const { presentation, locale } = harness();
  const shipment = Object.freeze({
    businessState: "COMPLETED",
    lastRefreshResult: "FAILED",
    lastRefreshErrorCode: "E_TIMEOUT",
    lastRefreshError: "Carrier timed out",
    lastRefreshAttempts: 2,
    lastRefreshProxyAttempts: 1,
    lastRefreshAt: new Date(2026, 9, 11, 13, 5)
  });
  assert.equal(presentation.shipmentBusinessStateTagType(shipment), "success");
  assert.equal(
    presentation.shipmentBusinessStateLabel(shipment),
    "zh-CN:customers.businessCompleted"
  );
  const tooltip = computed(() => presentation.refreshOutcomeTooltip(shipment));
  assert.equal(
    tooltip.value,
    "E_TIMEOUT · Carrier timed out · zh-CN:customers.mainAttempts:2 · zh-CN:customers.proxyAttempts:1 · 2026-10-11 13:05"
  );
  locale.value = "en-US";
  assert.ok(tooltip.value.includes("en-US:customers.mainAttempts:2"));
  assert.equal(presentation.refreshOutcomeTooltip({ lastRefreshAttempts: 0 }), "");
});

test("sparse records and invalid dates retain safe display fallbacks", () => {
  const { presentation } = harness();
  assert.equal(presentation.customerInitial(null), "C");
  assert.equal(presentation.customerInitial({ username: "alex" }), "A");
  assert.equal(
    presentation.customerFilterOptionLabel({ displayName: "C07", clientCode: "C07" }),
    "C07"
  );
  assert.equal(presentation.customerFilterOptionLabel(null), "zh-CN:customers.missingValue");
  assert.equal(presentation.boundUserLabel(null), "zh-CN:customers.missingValue");
  assert.equal(presentation.formatDateTime(null), "—");
  assert.equal(presentation.formatDate(null), "—");
  assert.equal(presentation.formatDateTime("not-a-date"), "not-a-date");
  assert.equal(presentation.formatDate("not-a-date"), "not-a-date");
  assert.equal(presentation.formatDateTime(new Date(2026, 0, 2, 3, 4)), "2026-01-02 03:04");
  assert.equal(presentation.boundRoleSummary({}), "zh-CN:customers.noPartiesBound");
  assert.equal(presentation.referenceTypeLabel("UNKNOWN_TYPE"), "zh-CN:customers.referenceUnknown");
});
