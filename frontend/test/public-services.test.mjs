import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createMemoryHistory, createRouter } from "vue-router";
import { publicServices, serviceGroups, serviceEntry } from "../src/public/serviceCatalog.js";
import { isPublicPath, createPublicServiceRoutes } from "../src/public/routes.js";
import { configuredPlatformModules } from "../src/modules/configuredRegistry.js";
import { platformModuleCatalog, canAccessRoute } from "../src/modules/registry.js";
import { createApplicationRoutes } from "../src/modules/routes.js";
import { getPublicCopy } from "../src/i18n/publicSiteMessages.js";

const views = Object.fromEntries(
  [
    "planner",
    "operations",
    "workbenches",
    "admin",
    "business",
    "legacyBusiness",
    "customer",
    ...Object.keys(platformModuleCatalog.views)
  ].map((key) => [key, {}])
);
const router = createRouter({
  history: createMemoryHistory(),
  routes: createApplicationRoutes(views, configuredPlatformModules)
});

test("public path classification never captures protected workspaces or legacy admin", () => {
  for (const path of ["/", "/services", "/services/", "/services/transport", "/services/missing"])
    assert.equal(isPublicPath(path), true, path);
  for (const path of [
    "/admin",
    "/customers",
    "/customer-workspace",
    "/planner",
    "/tracking/",
    "/services-other",
    "//services"
  ])
    assert.equal(isPublicPath(path), false, path);
});

test("every catalog service has a distinct resolvable public detail and bilingual content", () => {
  assert.equal(new Set(publicServices.map((service) => service.id)).size, publicServices.length);
  const detail = createPublicServiceRoutes().find(
    (route) => route.name === "public-service-detail"
  );
  assert.equal(detail.path, "/services/:slug");
  for (const locale of ["zh-CN", "en-US"]) {
    const content = getPublicCopy(locale).services;
    assert.deepEqual(
      Object.keys(content).sort(),
      publicServices.map((service) => service.id).sort()
    );
    for (const service of publicServices) {
      const page = router.resolve(service.detailPath);
      assert.equal(page.name, "public-service-detail");
      assert.equal(page.params.slug, service.id);
      assert.equal(content[service.id].features.length, 3);
      assert.equal(content[service.id].steps.length, 3);
      assert.notEqual(content[service.id].intro, content[service.id].summary);
    }
  }
});

test("mega groups reference each available service exactly once", () => {
  const grouped = serviceGroups.flatMap((group) => group.services);
  assert.deepEqual(grouped.slice().sort(), publicServices.map((service) => service.id).sort());
  assert.equal(new Set(grouped).size, grouped.length);
});

test("editorial capability tables have complete bilingual content for every registered service", () => {
  for (const locale of ["zh-CN", "en-US"]) {
    const copy = getPublicCopy(locale);
    assert.equal(copy.editorial.planningFeatures.length, 4);
    for (const feature of copy.editorial.planningFeatures) assert.ok(feature.title && feature.body);
    for (const service of publicServices.filter((item) => item.id !== "planning")) {
      const bodies = copy.editorial.capabilityBodies[service.id];
      assert.equal(
        bodies.length,
        copy.services[service.id].features.length,
        locale + " / " + service.id
      );
      assert.ok(bodies.every((body) => typeof body === "string" && body.trim().length > 0));
    }
  }
});

test("registered service entry paths and access follow the actual assembled application routes", () => {
  for (const service of publicServices.filter(
    (item) => item.moduleId && item.access !== "context"
  )) {
    const module = configuredPlatformModules.find((item) => item.id === service.moduleId);
    assert.deepEqual(service.roles, module.roles);
    const destination = router.resolve(service.entry);
    assert.ok(destination.name, "Entry must resolve to a named business page: " + service.id);
    for (const role of ["ADMIN", "BUSINESS", "OVERSEA_AGENT", "CUSTOMER", "EMPLOYEE"]) {
      const result = serviceEntry(service, role);
      assert.equal(result.allowed, canAccessRoute(destination, role), service.id + " / " + role);
      if (!result.allowed) assert.notEqual(result.href, service.entry);
    }
  }
});

test("anonymous protected service links retain their destination for the existing login gate", () => {
  for (const service of publicServices.filter((item) =>
    ["authenticated", "registered"].includes(item.access)
  )) {
    const result = serviceEntry(service, undefined);
    assert.equal(result.href, service.entry);
    assert.equal(result.allowed, true);
  }
  assert.equal(
    serviceEntry(
      publicServices.find((item) => item.id === "planning"),
      "CUSTOMER"
    ).allowed,
    false
  );
});

test("tracking and file entries preserve configured query parameters and select the tracking view", () => {
  for (const id of ["transport", "files"]) {
    const service = publicServices.find((item) => item.id === id);
    assert.equal(
      serviceEntry(service, undefined, "/tracking/?embed=1#overview").href,
      "/tracking/?embed=1#tracking"
    );
  }
});

test("external booking entry contains no current-session data and explicitly opens separately", () => {
  const result = serviceEntry(
    publicServices.find((item) => item.id === "booking"),
    "ADMIN"
  );
  assert.deepEqual(result, {
    href: "http://booking.dreweslogistics.com/login",
    allowed: true,
    external: true
  });
  const target = new URL(result.href);
  assert.equal(target.search, "");
  assert.equal(target.username, "");
  assert.equal(target.password, "");
  assert.equal(target.hash, "");
});

test("self-hosted font CSS retains local WOFF2 files, Unicode ranges and OFL notices", () => {
  const root = new URL("../public/fonts/", import.meta.url);
  const css = readFileSync(new URL("brand-fonts.css", root), "utf8");
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/["']/g, ""));
  assert.ok(urls.length > 90);
  assert.doesNotMatch(css, /https?:\/\//);
  assert.match(css, /unicode-range:/);
  assert.match(css, /font-display: swap/);
  for (const path of urls) {
    assert.match(path, /^\.\//);
    assert.equal(readFileSync(new URL(path, root)).subarray(0, 4).toString(), "wOF2");
  }
  for (const name of ["inter", "noto-sans-sc"])
    assert.match(readFileSync(new URL(name + "-OFL.txt", root), "utf8"), /SIL OPEN FONT LICENSE/i);
});
