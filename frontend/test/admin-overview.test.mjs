import assert from "node:assert/strict";
import test from "node:test";
import { adminOverviewCopy } from "../src/features/admin/adminOverviewCopy.js";
import {
  canChangeAdminAuditPage,
  adminCount,
  adminMetric,
  adminRecordId,
  adminTargetId,
  formatAdminAuditDate,
  formatAdminOverviewDate,
  createAdminOverviewPresentation
} from "../src/features/admin/adminOverviewPresentation.js";
import { adminOverviewChartOptions } from "../src/features/admin/adminOverviewChartOptions.js";

test("overview distinguishes known zero counters from missing counters and rejects invalid values", () => {
  assert.equal(adminMetric(0), "0");
  for (const value of [undefined, null, NaN, Infinity, -1]) assert.equal(adminMetric(value), "-");
  for (const value of [undefined, NaN, Infinity, -1, "4"]) assert.equal(adminCount(value), 0);
  assert.equal(adminCount(14), 14);
});
test("audit keeps zero identifiers and safely formats unavailable timestamps", () => {
  assert.equal(adminRecordId(0), "0");
  assert.equal(adminTargetId(0), "#0");
  assert.equal(adminTargetId("B-1"), "#B-1");
  for (const value of [undefined, null, ""]) assert.equal(adminRecordId(value), "-");
  for (const value of [undefined, null, "bad date"])
    assert.equal(formatAdminAuditDate(value, "zh-CN"), "-");
  assert.notEqual(formatAdminAuditDate("2026-10-12T10:20:00Z", "en-US"), "-");
});
test("activity dates validate the calendar and do not invent a date for bad input", () => {
  assert.equal(formatAdminOverviewDate("2024-02-29"), "02/29");
  for (const value of ["2025-02-29", "2026-04-31", "2026-13-10", "2026-10", "bad", null])
    assert.equal(formatAdminOverviewDate(value), "-");
});
test("audit labels react to locale changes without recreating the presentation and keep unknown categories", () => {
  let locale = "zh-CN";
  const p = createAdminOverviewPresentation(() => locale);
  assert.equal(p.action("CREATE_USER"), "新增用户");
  assert.equal(p.category("BUSINESS"), "业务操作");
  assert.equal(p.target("USER"), "用户账号");
  locale = "en-US";
  assert.equal(p.action("CREATE_USER"), "Create user");
  assert.equal(p.category("MANAGEMENT"), "Management");
  assert.equal(p.category("UNKNOWN"), "UNKNOWN");
  assert.equal(p.category(null), "-");
  assert.equal(p.action("FUTURE_ACTION"), "future action");
  assert.equal(p.target("FUTURE_TARGET"), "FUTURE_TARGET");
  assert.equal(adminOverviewCopy("unknown").active, "正常");
});
test("admin charts preserve separate activity axes, ordering, unknown account states and immutable inputs", () => {
  const data = {
    activityTrend: [{ date: "2026-10-12", businessActions: 120, managementActions: 2 }],
    userComposition: [{ code: "BUSINESS", value: 2 }],
    accountStatus: [{ code: "PENDING", value: 1 }],
    operationTypes: [
      { code: "CREATE_USER", value: 3 },
      { code: "KICK_DEVICE", value: 1 }
    ]
  };
  const original = structuredClone(data);
  const options = adminOverviewChartOptions(data, "en-US", true);
  assert.deepEqual(options.activity.xAxis.data, ["10/12"]);
  assert.deepEqual(
    options.activity.series.map((item) => [item.yAxisIndex, item.data]),
    [
      [0, [120]],
      [1, [2]]
    ]
  );
  assert.equal(options.activity.yAxis[0].name, "Business actions");
  assert.equal(options.activity.yAxis[1].name, "Management actions");
  assert.deepEqual(options.operations.xAxis.data, ["Sign out device", "Create user"]);
  assert.deepEqual(options.operations.series[0].data, [1, 3]);
  assert.equal(options.users.series[0].data[0].name, "Business");
  assert.equal(options.status.series[0].data[0].name, "PENDING");
  assert.deepEqual(data, original);
  for (const option of Object.values(options)) {
    assert.equal(option.animation, false);
    assert.equal(option.animationDuration, 0);
    assert.equal(option.tooltip.renderMode, "richText");
  }
});
test("empty and invalid chart collections clear previous data without a fake nonzero slice", () => {
  const options = adminOverviewChartOptions(
    { activityTrend: {}, userComposition: null, accountStatus: {}, operationTypes: null },
    "zh-CN"
  );
  assert.deepEqual(options.activity.series[0].data, []);
  assert.deepEqual(options.users.series[0].data, []);
  assert.equal(options.users.graphic[0].style.text, "暂无数据");
  assert.equal(options.status.series[0].label.show, false);
  assert.deepEqual(options.operations.xAxis.data, ["暂无管理操作"]);
  assert.deepEqual(options.operations.series[0].data, [0]);
});

test("audit paging blocks pending, duplicate and out-of-range navigation", () => {
  const state = { busy: false, page: 1, total: 21, pageSize: 20 };
  assert.equal(canChangeAdminAuditPage(state, 2), true);
  for (const page of [1, 0, -1, 3, 1.5, Infinity])
    assert.equal(canChangeAdminAuditPage(state, page), false);
  assert.equal(canChangeAdminAuditPage({ ...state, busy: true }, 2), false);
  assert.equal(canChangeAdminAuditPage({ ...state, pageSize: 0 }, 2), false);
  assert.equal(canChangeAdminAuditPage({ ...state, total: NaN }, 2), false);
  assert.equal(canChangeAdminAuditPage({ ...state, total: 0 }, 2), false);
});
