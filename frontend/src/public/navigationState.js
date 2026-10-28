import { shallowRef } from "vue";

/** Keep public-page navigation feedback independent of the authenticated router. */
export function installPublicNavigationState(router) {
  const loading = shallowRef(false);
  const error = shallowRef(null);
  const failedPath = shallowRef(null);
  let pendingPath = null;
  let latestPath = null;

  function fail(reason, to) {
    // A superseded chunk request must not cover a newer navigation with an error.
    if (latestPath && to && latestPath !== to.fullPath) return;
    loading.value = false;
    error.value = reason;
    failedPath.value = to?.fullPath || router.currentRoute.value.fullPath;
    pendingPath = null;
  }

  router.beforeEach((to) => {
    latestPath = to.fullPath;
    pendingPath = to.fullPath;
    loading.value = true;
    error.value = null;
    failedPath.value = null;
  });
  router.afterEach((to) => {
    if (pendingPath !== to.fullPath) return;
    loading.value = false;
    pendingPath = null;
  });
  router.onError(fail);

  return {
    loading,
    error,
    failedPath,
    captureInitialFailure(reason, path) {
      // onError normally ran first. Keep its precise destination when available.
      if (!error.value) fail(reason, router.resolve(path));
    }
  };
}
