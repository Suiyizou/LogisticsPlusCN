import assert from "node:assert/strict";
import test from "node:test";
import { effectScope, nextTick, ref } from "vue";
import { buildOverviewModel } from "../src/modules/overview/overviewModel.js";
import { localDateKey, isToday, isCreatedToday } from "../src/features/shared/businessDates.js";
import { useOverviewMetrics } from "../src/modules/overview/useOverviewMetrics.js";

const t = (key) => key;
const now = () => new Date(2026, 9, 11, 12);
const snapshot = {
  customers: [{ status: "ACTIVE", lastLoginAt: "2026-10-11T09:00:00" }, { status: "DISABLED" }],
  agents: [{ status: "ACTIVE" }, { status: "DISABLED" }],
  shipmentTotal: 12,
  shipments: [
    {
      trackingStatus: "IN_TRANSIT",
      createdAt: "2026-10-11T08:00:00",
      updatedAt: "2026-10-11T08:00:00",
      files: [{ uploadedAt: "2026-10-11T09:00:00" }],
      comments: [{ createdAt: "2026-10-11T10:00:00" }]
    },
    { createdAt: "2026-10-10T09:00:00", updatedAt: "2026-10-11T10:00:00" }
  ]
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(context) {
  const user = ref({ id: "one", role: "BUSINESS" }),
    locale = ref("en-US"),
    calls = [],
    scope = effectScope();
  const workflow = scope.run(() =>
    useOverviewMetrics({
      fetchStats: () => {
        const job = deferred();
        calls.push(job);
        return job.promise;
      },
      readFallback: () => structuredClone(snapshot),
      currentUser: () => user.value,
      t,
      locale,
      now
    })
  );
  context.after(() => scope.stop());
  return { ...workflow, user, locale, calls, scope };
}
test("shared business dates keep shipment list and overview on the same local-day boundary", () => {
  assert.equal(isToday("2026-10-11T00:01:00", now()), true);
  assert.equal(isToday("2026-10-10T23:59:59", now()), false);
  assert.equal(isToday("invalid", now()), false);
  assert.equal(isCreatedToday({ createdAt: "2026-10-11T09:00:00" }, now()), true);
  assert.equal(isCreatedToday(null, now()), false);
});

test("cached fallback uses meaningful updates, related timestamps and total separately from visible rows", () => {
  const model = buildOverviewModel({ snapshot, t, now: now() });
  assert.deepEqual(
    model.kpis.map((item) => item.value),
    [1, 1, 1, 1, 1]
  );
  assert.deepEqual(
    model.resources.map((item) => item.value),
    [2, 12, 1, 1]
  );
  assert.equal(model.trend.length, 7);
  assert.equal(model.trend.at(-1).key, "2026-10-11");
  assert.equal(model.trend.at(-1).updated, 1);
  assert.equal(
    model.status.reduce((sum, item) => sum + item.value, 0),
    2
  );
});
test("server zeroes and empty series remain authoritative instead of inventing fallback activity", () => {
  const model = buildOverviewModel({
    stats: {
      newShipments: 0,
      updatedShipments: "0",
      followUpFiles: 0,
      messages: 0,
      customerLogins: 0,
      customerTotal: 0,
      shipmentTotal: 0,
      activeAgentCount: 0,
      activeCustomerCount: 0,
      dailyTrend: [],
      shipmentStatusDistribution: []
    },
    snapshot,
    t,
    now: now()
  });
  assert.deepEqual(
    model.kpis.map((item) => item.value),
    [0, 0, 0, 0, 0]
  );
  assert.deepEqual(
    model.resources.map((item) => item.value),
    [0, 0, 0, 0]
  );
  assert.deepEqual(model.trend, []);
  assert.deepEqual(model.status, []);
});
test("invalid dates, negative/nonfinite counts and malformed series never reach chart rendering", () => {
  const model = buildOverviewModel({
    stats: {
      newShipments: null,
      updatedShipments: -5,
      messages: "NaN",
      dailyTrend: [
        null,
        { date: "not-a-date" },
        { date: "2026-02-30" },
        { date: "2026-10-11", created: "3", updated: Infinity }
      ],
      shipmentStatusDistribution: [
        null,
        { status: "UNKNOWN", count: 2 },
        { name: "", count: 1 },
        { name: "IN_TRANSIT", count: -4 }
      ]
    },
    snapshot,
    t,
    now: now(),
    locale: "invalid_locale"
  });
  assert.deepEqual(
    model.kpis.map((item) => item.value),
    [1, 1, 1, 1, 1]
  );
  assert.deepEqual(
    model.trend.map((item) => [item.key, item.created, item.updated]),
    [["2026-10-11", 3, 0]]
  );
  assert.equal(
    model.status.find((item) => item.name === t("customers.overviewUnknownStatus")).value,
    3
  );
  assert.equal(localDateKey("invalid"), "");
  assert.equal(localDateKey(null), "");
});
test("newer refresh owns data and loading state when responses finish out of order", async (context) => {
  const h = harness(context),
    older = h.reload(),
    latest = h.reload();
  h.calls[1].resolve({ newShipments: 9 });
  assert.equal(await latest, true);
  h.calls[0].resolve({ newShipments: 2 });
  assert.equal(await older, false);
  assert.equal(h.model.value.kpis[0].value, 9);
  assert.equal(h.loading.value, false);
  assert.equal(h.error.value, "");
});
test("stale failure cannot replace newer statistics or error state", async (context) => {
  const h = harness(context),
    older = h.reload(),
    latest = h.reload();
  h.calls[1].resolve({ newShipments: 5 });
  await latest;
  h.calls[0].reject(Error("old failure"));
  await older;
  assert.equal(h.model.value.kpis[0].value, 5);
  assert.equal(h.error.value, "");
});
test("failure exposes cached scope with warning and retry returns to server statistics", async (context) => {
  const h = harness(context),
    failed = h.reload();
  h.calls[0].reject(Error("fixture failure"));
  assert.equal(await failed, false);
  assert.equal(h.error.value, "fixture failure");
  assert.equal(h.model.value.resources[1].value, 12);
  const retry = h.reload();
  h.calls[1].resolve({ shipmentTotal: 30, newShipments: 7 });
  assert.equal(await retry, true);
  assert.equal(h.error.value, "");
  assert.equal(h.model.value.resources[1].value, 30);
});
test("malformed successful payload is treated as failed read with cached fallback", async (context) => {
  const h = harness(context),
    pending = h.reload();
  h.calls[0].resolve([]);
  assert.equal(await pending, false);
  assert.equal(h.error.value, t("customers.overviewLoadFailed"));
  assert.equal(h.model.value.kpis[0].value, 1);
});

test("authorization refusal clears prior statistics without revealing cached scope", async (context) => {
  const h = harness(context),
    first = h.reload();
  h.calls[0].resolve({ newShipments: 12 });
  await first;
  const denied = h.reload();
  h.calls[1].reject(Object.assign(Error("denied"), { status: 403 }));
  await denied;
  assert.equal(h.model.value.kpis[0].value, 0);
  assert.equal(h.model.value.resources[0].value, 0);
  assert.equal(h.usingCache.value, false);
  assert.equal(h.error.value, "denied");
});
test("changing account clears old data and starts a new scoped request", async (context) => {
  const h = harness(context),
    older = h.reload();
  h.user.value = { id: "two", role: "ADMIN" };
  await nextTick();
  assert.equal(h.calls.length, 2);
  assert.equal(h.model.value.resources[0].value, 0);
  h.calls[0].resolve({ newShipments: 90 });
  await older;
  assert.equal(h.model.value.kpis[0].value, 0);
  h.calls[1].resolve({ newShipments: 4 });
  await nextTick();
  assert.equal(h.model.value.kpis[0].value, 4);
});
test("role loss clears statistics and blocks both late response and new reads", async (context) => {
  const h = harness(context),
    pending = h.reload();
  h.user.value = { id: "one", role: "OVERSEA_AGENT" };
  h.calls[0].resolve({ newShipments: 90 });
  await pending;
  assert.equal(h.model.value.kpis[0].value, 0);
  assert.equal(h.loading.value, false);
  assert.equal(await h.reload(), false);
  assert.equal(h.calls.length, 1);
});
test("leaving the page invalidates unfinished request without claiming service cancellation", async (context) => {
  const h = harness(context),
    pending = h.reload();
  h.scope.stop();
  h.calls[0].resolve({ newShipments: 90 });
  assert.equal(await pending, false);
  assert.equal(h.model.value.kpis[0].value, 0);
  assert.equal(await h.reload(), false);
});
test("locale changes retranslate existing model without refetching server data", async (context) => {
  const h = harness(context),
    pending = h.reload();
  h.calls[0].resolve({ newShipments: 3, dailyTrend: [{ date: "2026-10-11", created: 3 }] });
  await pending;
  h.locale.value = "zh-CN";
  await nextTick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.model.value.trend[0].created, 3);
});
