import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createRouter,
  createMemoryHistory
} from "../../frontend/node_modules/vue-router/dist/vue-router.mjs";
import { configuredPlatformModules } from "../../frontend/src/modules/configuredRegistry.js";
import { platformModuleCatalog } from "../../frontend/src/modules/registry.js";
import { createApplicationRoutes } from "../../frontend/src/modules/routes.js";
import { createCatalog, scanModalSources, root } from "./catalog.mjs";

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
const catalog = await createCatalog();
const mainRows = catalog.matrix.rows.filter((row) =>
  /^(?:P\d\d|W\d\d|L\d\d|B\d\d|C\d\d|A\d\d|T0[1-4])$/.test(row.id)
);
assert.equal(mainRows.length, 45, "45 main-view conditions mapped separately from entry count");
assert.equal(
  catalog.matrix.rows.filter((row) => /^D\d\d$/.test(row.id)).length,
  35,
  "All 35 modal/subview condition groups"
);
for (const row of catalog.matrix.rows) {
  assert.ok(row.itemIds.length, "Matrix condition mapped: " + row.id);
  for (const id of row.itemIds)
    assert.ok(
      catalog.items.some((item) => item.id === id),
      "Matrix binding exists: " + row.id + "/" + id
    );
}
for (const id of ["tracking-batch", "tracking-document-drawer", "tracking-document-editor"])
  assert.equal(
    catalog.items.find((item) => item.id === id).availability,
    "dormant",
    "No active link for dormant UI"
  );
for (const id of ["tracking-shipments", "tracking-agent-update"])
  assert.deepEqual(
    catalog.items.find((item) => item.id === id).roles,
    ["CUSTOMER_AGENT"],
    "Compatible customer agent is distinct from internal employee"
  );
assert.equal(
  catalog.items.find((item) => item.id === "business-update-schedule-preview").availability,
  "preview"
);
assert.equal(
  catalog.items.find((item) => item.id === "tracking-workbench-batch-link").path,
  "/customers/shipments"
);
assert.deepEqual(catalog.items.find((item) => item.id === "tracking-workbench-batch-link").roles, [
  "ADMIN",
  "BUSINESS"
]);
assert.equal(
  new Set(catalog.items.map((item) => item.id)).size,
  catalog.items.length,
  "Unique review IDs"
);
for (const item of catalog.items) {
  assert.ok(
    item.name && item.path && item.steps && item.roles.length,
    "Complete entry: " + item.id
  );
  assert.ok(catalog.groups[item.group], "Known group: " + item.id);
  assert.ok((await stat(resolve(root, item.source))).isFile(), "Real source: " + item.id);
  if (item.path.startsWith("/tracking/")) {
    assert.ok(
      ["overview", "tracking", "shipments", "profile"].includes(
        new URL(item.path, "http://localhost").hash.slice(1)
      ),
      "Real tracking hash"
    );
  } else {
    const path = item.path
      .replace(":customerId", "record-for-route-resolution")
      .replace(":shipmentId", "record-for-route-resolution");
    assert.ok(
      router.resolve(path).name ||
        router.resolve(path).redirectedFrom ||
        router.resolve(path).matched.some((match) => match.redirect),
      "Registered page or redirect: " + item.id
    );
    assert.notEqual(
      router.resolve(path).matched.at(-1)?.path,
      "/:pathMatch(.*)*",
      "No invented catch-all entry: " + item.id
    );
  }
  if (item.path.includes(":customerId")) assert.equal(item.record, "customer");
  if (item.path.includes(":shipmentId")) assert.equal(item.record, "shipment");
}
for (const module of configuredPlatformModules.filter((entry) => entry.enabled !== false)) {
  for (const entry of module.pages) {
    const review = catalog.items.find((item) => item.routeName === entry.name);
    assert.ok(review, "Every enabled module route listed: " + entry.name);
    assert.deepEqual(review.roles, module.roles, "Role policy from registry: " + entry.name);
  }
}
const sources = await scanModalSources();
for (const source of sources) {
  const coverage = catalog.items.filter(
    (item) => item.source === source.source && item.kind === "modal"
  );
  assert.ok(
    coverage.length >= source.count,
    `All declared dialogs listed: ${source.source} (${coverage.length}/${source.count})`
  );
}
const tracking = await readFile(resolve(root, "tracking-service/public/index.html"), "utf8");
for (const id of [
  "batch-workspace-dialog",
  "related-files-drawer",
  "system-announcement-dialog",
  "agent-update-task-dialog",
  "document-drawer",
  "business-reference-dialog",
  "document-editor-dialog",
  "file-preview-dialog"
])
  assert.ok(tracking.includes('id="' + id + '"'), "Tracking dialog source still exists: " + id);
process.stdout.write(
  `Review inventory verified: ${catalog.items.length} checklist records; 45 main views + 35 modal-condition groups mapped; all enabled routes and ${sources.reduce((sum, source) => sum + source.count, 0)} Vue dialog declarations indexed (not a reachability/visual pass).\n`
);
