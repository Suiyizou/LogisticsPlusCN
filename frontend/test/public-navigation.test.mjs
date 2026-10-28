import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryHistory, createRouter, isNavigationFailure } from "vue-router";
import { installPublicNavigationState } from "../src/public/navigationState.js";
import { retryFailedPage } from "../src/public/retryNavigation.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function setup(loader) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: {} },
      { path: "/services", component: {} },
      { path: "/services/:slug", component: loader }
    ]
  });
  return { router, state: installPublicNavigationState(router) };
}

async function untilStarted(loaded) {
  await loaded.promise;
}

test("initial public detail chunk failure exposes an error and preserves the complete retry URL", async () => {
  const chunk = deferred();
  const started = deferred();
  const { router, state } = setup(() => {
    started.resolve();
    return chunk.promise;
  });
  const ready = router.isReady();
  const target = "/services/planning?source=mega#workflow";
  const navigation = router.push(target);
  await untilStarted(started);
  assert.equal(state.loading.value, true);
  assert.equal(state.error.value, null);
  const failure = new Error("Failed to fetch dynamically imported module");
  chunk.reject(failure);
  await assert.rejects(navigation, failure);
  await assert.rejects(ready, failure);
  state.captureInitialFailure(failure, target);
  assert.equal(state.loading.value, false);
  assert.equal(state.error.value, failure);
  assert.equal(state.failedPath.value, target);
});

test("runtime lazy failure leaves a visible error rather than silently remaining on the previous page", async () => {
  const failure = new Error("Loading CSS chunk failed");
  const { router, state } = setup(() => Promise.reject(failure));
  await router.push("/");
  await assert.rejects(router.push("/services/transport"), failure);
  assert.equal(router.currentRoute.value.fullPath, "/");
  assert.equal(state.error.value, failure);
  assert.equal(state.failedPath.value, "/services/transport");
  assert.equal(state.loading.value, false);
  await router.push("/services");
  assert.equal(state.error.value, null);
  assert.equal(state.failedPath.value, null);
});

test("retrying the failed destination clears the error while waiting and completes normally", async () => {
  const retry = deferred();
  const retryStarted = deferred();
  let attempts = 0;
  const { router, state } = setup(() => {
    if (++attempts === 1) return Promise.reject(new Error("offline"));
    retryStarted.resolve();
    return retry.promise;
  });
  await router.push("/");
  await assert.rejects(router.push("/services/files?source=home#documents"));
  const navigation = router.push(state.failedPath.value);
  await untilStarted(retryStarted);
  assert.equal(state.error.value, null);
  assert.equal(state.loading.value, true);
  retry.resolve({});
  await navigation;
  assert.equal(router.currentRoute.value.fullPath, "/services/files?source=home#documents");
  assert.equal(state.loading.value, false);
  assert.equal(state.failedPath.value, null);
});

test("a superseded failing chunk cannot replace a newer successful page with an error", async () => {
  const oldChunk = deferred();
  const started = deferred();
  const { router, state } = setup(() => {
    started.resolve();
    return oldChunk.promise;
  });
  await router.push("/");
  const oldNavigation = router.push("/services/planning");
  await untilStarted(started);
  await router.push("/services");
  oldChunk.reject(new Error("stale chunk"));
  await assert.rejects(oldNavigation);
  assert.equal(router.currentRoute.value.fullPath, "/services");
  assert.equal(state.error.value, null);
  assert.equal(state.loading.value, false);
});

test("aborted and duplicate navigations end loading without displaying a chunk error", async () => {
  const { router, state } = setup(() => Promise.resolve({}));
  await router.push("/");
  router.beforeEach((to) => (to.path === "/services" ? false : undefined));
  assert.equal(isNavigationFailure(await router.push("/services")), true);
  assert.equal(isNavigationFailure(await router.push("/")), true);
  assert.equal(state.loading.value, false);
  assert.equal(state.error.value, null);
});

test("an initial isReady rejection is captured even when no navigation error hook was raised", () => {
  const { state } = setup(() => Promise.resolve({}));
  const failure = new Error("initial readiness failed");
  state.captureInitialFailure(failure, "/services/customers?from=link#steps");
  assert.equal(state.error.value, failure);
  assert.equal(state.failedPath.value, "/services/customers?from=link#steps");
  assert.equal(state.loading.value, false);
});

function retryBrowser(href) {
  const calls = [];
  const browser = {
    location: {
      href,
      origin: new URL(href).origin,
      reload: () => calls.push(["reload"])
    },
    history: {
      state: { position: 1 },
      replaceState: (state, _title, path) => calls.push(["replace", state, path])
    }
  };
  return { browser, calls };
}

for (const [description, current, target] of [
  [
    "same URL including fragment",
    "/services/planning?source=mega#workflow",
    "/services/planning?source=mega#workflow"
  ],
  [
    "a changed fragment",
    "/services/planning?source=mega#old",
    "/services/planning?source=mega#workflow"
  ],
  ["a different failed page", "/services", "/services/files?source=mega#documents"]
]) {
  test("retry really reloads the failed document for " + description, () => {
    const { browser, calls } = retryBrowser("https://logistics.example" + current);
    retryFailedPage(target, browser);
    assert.deepEqual(calls, [["replace", browser.history.state, target], ["reload"]]);
  });
}

test("the existing default retry reloads without changing browser history", () => {
  const { browser, calls } = retryBrowser("https://logistics.example/services");
  retryFailedPage(null, browser);
  assert.deepEqual(calls, [["reload"]]);
});

test("retry never replaces the current route with an external destination", () => {
  const { browser, calls } = retryBrowser("https://logistics.example/services");
  retryFailedPage("https://external.example/services/planning#workflow", browser);
  assert.deepEqual(calls, [["reload"]]);
});
