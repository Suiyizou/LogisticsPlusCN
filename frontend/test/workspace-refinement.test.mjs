import { planSummaryStatus } from "../src/components/workspace/planSummaryStatus.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { baseParse } from "@vue/compiler-dom";
import { prepareDialogLeave } from "../src/components/workspace/dialogPresentation.js";
import { updateSchedulePreviewRegistration } from "../src/modules/update-schedule-preview/module.js";
import previewMessages from "../src/modules/update-schedule-preview/messages.js";
import { workspaceRefinementMessages } from "../src/i18n/workspaceRefinementMessages.js";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { canAccessRoute } from "../src/modules/registry.js";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const template = (path) => baseParse(parseSfc(source(path)).descriptor.template.content);
const cls = (node) =>
  node.props?.find((p) => p.type === 6 && p.name === "class")?.value?.content || "";
const directive = (node, name, arg) =>
  node.props?.find((p) => p.type === 7 && p.name === name && (!arg || p.arg?.content === arg))?.exp
    ?.content;
test("PDF reader labels resolve through the shared workspace namespace in both languages", () => {
  const reader = source("../src/components/pdf/PdfCanvasPreview.vue");
  const keys = [...reader.matchAll(/wt\(["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(keys.length >= 8);
  for (const locale of ["zh-CN", "en-US"]) {
    for (const key of keys)
      assert.ok(workspaceRefinementMessages[locale].workspaceV2[key], `${locale}: ${key}`);
  }
});
test("admin refresh feedback follows current busy state without legacy text restoration", () => {
  const ast = template("../src/features/admin/AdminConsoleShell.vue");
  const refresh = find(ast, (node) => directive(node, "on", "click") === "refresh");
  assert.equal(directive(refresh, "bind", "disabled"), "busy");
  assert.ok(refresh.props.some((prop) => prop.type === 6 && prop.name === "data-i18n-ignore"));
});
test("planner breadcrumb follows step changes without restoring the cached config label", () => {
  const ast = template("../src/App.vue");
  const crumb = find(
    ast,
    (node) =>
      node.tag === "el-breadcrumb-item" && directive(node, "if") === "activePage === 'planner'"
  );
  assert.ok(crumb.props.some((prop) => prop.type === 6 && prop.name === "data-i18n-ignore"));
});
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test("selected-shipment commands live only in the manager's contextual selection bar", () => {
  const ast = template("../src/modules/shipments/pages/ShipmentListPage.vue");
  const bulk = find(ast, (node) => cls(node).split(/\s+/).includes("shipment-bulk-bar"));
  const filters = find(ast, (node) => cls(node).split(/\s+/).includes("shipment-filter-bar"));
  assert.match(directive(bulk, "if"), /isManager.*selectedShipmentRows\.length/);
  for (const action of [
    "openBatchBusinessFieldsEditor",
    "batchDeleteSelectedShipments",
    "startRefreshSelectedShipments"
  ]) {
    assert.ok(
      find(bulk, (node) => directive(node, "on", "click") === action),
      action
    );
    assert.equal(
      find(filters, (node) => directive(node, "on", "click") === action),
      null,
      action
    );
  }
  const refreshAll = find(
    filters,
    (node) => directive(node, "on", "click") === "startRefreshAllShipments"
  );
  assert.equal(directive(refreshAll, "if"), "isManager");
});

test("an exiting dialog becomes inert and hidden to accessibility immediately", () => {
  const attributes = new Map();
  prepareDialogLeave({ setAttribute: (name, value) => attributes.set(name, value) });
  assert.equal(attributes.get("inert"), "");
  assert.equal(attributes.get("aria-hidden"), "true");
  const component = source("../src/components/workspace/WorkspaceDialogTransition.vue");
  assert.match(component, /@before-leave="prepareDialogLeave"/);
});

test("schedule preview uses the real module role policy and never connects a scheduler", () => {
  const module = updateSchedulePreviewRegistration.module;
  assert.equal(module.mount, "update-schedule");
  const views = Object.fromEntries(
    [
      "planner",
      "operations",
      "workbenches",
      "admin",
      "business",
      "legacyBusiness",
      module.pages[0].view
    ].map((key) => [key, () => {}])
  );
  const routes = createApplicationRoutes(views, [module]);
  const business = routes
    .find((record) => record.path === "/operations")
    .children.find((record) => record.path === "/customers");
  const preview = business.children.find((record) => record.name === module.pages[0].name);
  assert.ok(canAccessRoute(preview.meta, "ADMIN"));
  assert.ok(canAccessRoute(preview.meta, "BUSINESS"));
  assert.equal(canAccessRoute(preview.meta, "CUSTOMER"), false);
  const page = source("../src/modules/update-schedule-preview/pages/UpdateSchedulePreviewPage.vue");
  assert.doesNotMatch(page, /\bfetch\s*\(|axios|api\.request|setInterval|useModulePages/);
  assert.match(page, /<strong>—<\/strong>/);
  assert.match(previewMessages["zh-CN"].updateSchedulePreview.notice, /设计预览.*数据待接入/);
  assert.match(
    previewMessages["en-US"].updateSchedulePreview.noticeBody,
    /cannot create, change or run/
  );
});

test("customer row assignment remains inside the row-scoped slot and outside bulk commands", () => {
  const ast = template("../src/modules/customers/pages/CustomerDirectoryPage.vue");
  const selection = find(ast, (node) => cls(node).includes("customer-directory-selection"));
  assert.equal(
    find(selection, (node) => directive(node, "on", "click") === "openCustomerTransfer(row)"),
    null
  );
  const rowSlot = find(
    ast,
    (node) =>
      directive(node, "slot") === "{ row }" &&
      find(node, (child) => directive(child, "on", "click") === "openCustomerTransfer(row)")
  );
  assert.ok(rowSlot);
  const action = find(
    rowSlot,
    (node) => directive(node, "on", "click") === "openCustomerTransfer(row)"
  );
  assert.match(directive(action, "bind", "disabled"), /isTransferableCustomer\(row\)/);
});

test("result summary status follows actual candidates and has a distinct empty state", () => {
  const empty = { green: 0, yellow: 0, estimated: 0, red: 0, oversize: 0 };
  assert.deepEqual(planSummaryStatus(empty), { tone: "info", labelKey: "resultNone" });
  assert.deepEqual(planSummaryStatus({ ...empty, green: 5, red: 1 }), {
    tone: "success",
    labelKey: "resultQualified"
  });
  assert.deepEqual(planSummaryStatus({ ...empty, yellow: 1, oversize: 1 }), {
    tone: "warning",
    labelKey: "resultWarning"
  });
  assert.deepEqual(planSummaryStatus({ ...empty, estimated: 1 }), {
    tone: "warning",
    labelKey: "resultEstimated"
  });
  for (const field of ["red", "oversize"])
    assert.deepEqual(planSummaryStatus({ ...empty, [field]: 1 }), {
      tone: "danger",
      labelKey: "resultUnusable"
    });
  const ast = template("../src/App.vue");
  const tag = find(ast, (node) => directive(node, "bind", "type") === "resultSummary.statusTone");
  assert.ok(
    tag.props.some((prop) => prop.type === 6 && prop.name === "data-i18n-ignore"),
    "Vue-owned dynamic status must be excluded from legacy DOM text caching"
  );
  for (const name of ["planner-result-summary-band", "result-summary-grid"]) {
    const summary = find(ast, (node) => cls(node).split(/\s+/).includes(name));
    assert.ok(
      summary.props.some((prop) => prop.type === 6 && prop.name === "data-i18n-ignore"),
      "Calculated metrics must not be restored to cached initial zero/dash values"
    );
  }
});
