import assert from "node:assert/strict";
import test from "node:test";
import { adminNavigation, adminRouteTitle } from "../src/features/admin/adminNavigation.js";
import {
  adminConsoleCopy,
  createAdminConsoleCopy
} from "../src/features/admin/adminConsoleCopy.js";

test("all ten admin browser titles use the same translated page title as the visible shell", () => {
  for (const locale of ["zh-CN", "en-US"])
    for (const page of adminNavigation(locale).pages) {
      const key = `admin.${page.key}`;
      assert.equal(adminRouteTitle(key, locale), page.title);
      assert.notEqual(adminRouteTitle(key, locale), key);
    }
  assert.equal(adminRouteTitle("extension.custom", "en-US"), "");
  assert.equal(adminRouteTitle("admin.overview", "zh-CN"), "企业系统总览");
});

test("console shell and login copy follows current language for presentation and asynchronous feedback", () => {
  let locale = "zh-CN";
  const copy = createAdminConsoleCopy(() => locale);
  assert.equal(copy().username, "账号");
  assert.equal(copy().loginPoints.length, 3);
  assert.equal(copy().roleLabels.ADMIN, "管理员");
  assert.match(copy().notAdmin, /管理员/);
  locale = "en-US";
  assert.equal(copy().username, "Account");
  assert.equal(copy().roleLabels.ADMIN, "Administrator");
  assert.equal(copy().loginPoints[0], "Employee accounts");
  assert.equal(copy().refreshed, "Admin data refreshed");
  assert.match(copy().partialFailure, /could not be refreshed/);
  assert.match(copy().accessDeniedLabel, /Administrator/);
  assert.match(copy().loginSuccess, /signed in/);
  const navigation = adminNavigation(locale);
  assert.equal(navigation.pages.length, 10);
  assert.equal(navigation.groups.length, 4);
  for (const item of [...navigation.pages, ...navigation.groups]) {
    assert.doesNotMatch(item.label, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(item.description, /[\u4e00-\u9fff]/);
  }
  for (const page of navigation.pages) {
    assert.ok(navigation.groups.some((group) => group.key === page.group));
    assert.doesNotMatch(page.title + page.subtitle, /[\u4e00-\u9fff]/);
  }
});
test("unsupported console locale uses complete default copy rather than undefined labels", () => {
  const copy = adminConsoleCopy("de-DE");
  assert.equal(copy.loginHeading, "企业后台管理系统");
  assert.deepEqual(adminNavigation("de-DE"), adminNavigation("zh-CN"));
  for (const key of [
    "switchWorkbench",
    "loginDescription",
    "loginTitle",
    "loginEntry",
    "username",
    "password",
    "loggingIn",
    "login",
    "adminTitle",
    "currentAdmin",
    "refreshing",
    "refresh",
    "logout",
    "navigationLabel",
    "refreshed",
    "partialFailure",
    "loginSuccess",
    "notAdmin",
    "accessDeniedLabel",
    "accessDeniedDescription"
  ]) {
    assert.equal(typeof copy[key], "string");
    assert.ok(copy[key].length > 0);
  }
  assert.deepEqual(Object.keys(copy.roleLabels), [
    "ADMIN",
    "BUSINESS",
    "OVERSEA_AGENT",
    "CUSTOMER"
  ]);
});
