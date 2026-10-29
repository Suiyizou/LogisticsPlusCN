import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createMemoryHistory, createRouter } from "vue-router";
import { canonicalSmartImportLocation, createApplicationRoutes } from "../src/modules/routes.js";

const preferencesSource = readFileSync(
  new URL("../src/components/workspace/plannerPreferences.ts", import.meta.url),
  "utf8"
);
const code = ts.transpileModule(preferencesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const preferences = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  return values;
}

test("planner entry opens cargo list and preserves direct settings/result URLs", async () => {
  const views = Object.fromEntries(
    ["planner", "operations", "workbenches", "admin", "business", "legacyBusiness"].map((key) => [
      key,
      { render: () => null }
    ])
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, [])
  });
  await router.push("/planner");
  assert.equal(router.currentRoute.value.path, "/planner/cargos");
  await router.push("/planner/config");
  assert.equal(router.currentRoute.value.name, "planner-config");
  await router.push("/planner/results");
  assert.equal(router.currentRoute.value.name, "planner-results");
});

test("old workspace data cannot re-enable overlays in the new view and remains intact", () => {
  const workspace = JSON.stringify({
    cargos: [{ id: "kept", quantity: 50 }],
    showMassBalance: true,
    showRemaining: true
  });
  const values = storage({ "cargo-planner-vue-state": workspace });
  const scene = preferences.readScenePreferences();
  assert.equal(scene.showShell, true);
  assert.equal(scene.showMassBalance, false);
  assert.equal(scene.showRemaining, false);
  assert.equal(scene.showGrid, false);
  assert.equal(scene.showAxes, false);
  assert.equal(scene.showClearanceEnvelope, false);
  assert.equal(scene.analysisOpen, false);
  preferences.saveScenePreferences({ ...scene, showMassBalance: true, analysisOpen: true });
  assert.equal(preferences.readScenePreferences().showMassBalance, true);
  assert.equal(preferences.readScenePreferences().analysisOpen, true);
  assert.equal(values.get("cargo-planner-vue-state"), workspace);
});

test("cargo view and scene preference keys are independent and reject malformed values", () => {
  const values = storage();
  assert.equal(preferences.readCargoView(), "list");
  preferences.saveCargoView("overview");
  preferences.saveScenePreferences({ ...preferences.defaultScenePreferences, showAxes: true });
  assert.equal(preferences.readCargoView(), "overview");
  assert.equal(preferences.readScenePreferences().showAxes, true);
  const sceneKey = [...values.keys()].find((key) => key.includes("scene-view"));
  values.set(sceneKey, JSON.stringify({ showAxes: "true", showShell: false, showGrid: 1 }));
  assert.equal(preferences.readScenePreferences().showAxes, false);
  assert.equal(preferences.readScenePreferences().showShell, false);
  assert.equal(preferences.readScenePreferences().showGrid, false);
  values.set(sceneKey, "invalid JSON");
  assert.deepEqual(preferences.readScenePreferences(), preferences.defaultScenePreferences);
});

test("storage read/write failures leave the workspace usable", () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error("Storage blocked");
    },
    setItem() {
      throw new Error("Quota exceeded");
    }
  };
  assert.equal(preferences.readCargoView(), "list");
  assert.deepEqual(preferences.readScenePreferences(), preferences.defaultScenePreferences);
  assert.doesNotThrow(() => preferences.saveCargoView("overview"));
  assert.doesNotThrow(() => preferences.saveScenePreferences(preferences.defaultScenePreferences));
  delete globalThis.localStorage;
});

test("legacy inline smart-import URLs replace the cargo route while retaining query and hash", async () => {
  const views = Object.fromEntries(
    ["planner", "operations", "workbenches", "admin", "business", "legacyBusiness"].map((name) => [
      name,
      { render: () => null }
    ])
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, [])
  });
  router.beforeEach(canonicalSmartImportLocation);
  await router.push("/workbenches");
  await router.push("/planner/cargos");
  await router.push("/planner/cargos?import=smart&carrier=MSC&note=keep%20me#review");
  assert.equal(router.currentRoute.value.path, "/smart-import/excel");
  assert.deepEqual(router.currentRoute.value.query, { carrier: "MSC", note: "keep me" });
  assert.equal(router.currentRoute.value.hash, "#review");
  assert.equal(router.currentRoute.value.name, "planner-import-excel");
  router.back();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    router.currentRoute.value.path,
    "/workbenches",
    "canonicalizing replaces the old cargo entry instead of adding it to history"
  );
  const freshRouter = createRouter({
    history: createMemoryHistory(),
    routes: createApplicationRoutes(views, [])
  });
  await freshRouter.push("/planner/cargos?import=smart&source=reload#sheet");
  assert.equal(
    freshRouter.currentRoute.value.fullPath,
    "/smart-import/excel?source=reload#sheet",
    "the route factory also canonicalizes a direct legacy reload"
  );
});
