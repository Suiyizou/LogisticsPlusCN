import { ref } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createApplicationRoutes } from "./modules/routes.js";
import { applicationViews } from "./modules/views.js";
import { configuredPlatformModules } from "./modules/configuredRegistry.js";

if (window.location.hash?.startsWith("#/")) {
  window.history.replaceState(null, "", window.location.hash.slice(1));
} else if (window.location.hash === "#admin") {
  window.history.replaceState(null, "", "/admin");
}

export const routeLoading = ref(false);
export const routeLoadError = ref(null);
export const router = createRouter({
  history: createWebHistory("/"),
  routes: createApplicationRoutes(applicationViews, configuredPlatformModules)
});
router.beforeEach(() => {
  routeLoading.value = true;
  routeLoadError.value = null;
});
router.afterEach(() => {
  routeLoading.value = false;
});
router.onError((error) => {
  routeLoading.value = false;
  routeLoadError.value = error;
});
