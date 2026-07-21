<template>
  <component :is="activeSurface" />
</template>

<script setup>
import { computed, defineAsyncComponent, h } from "vue";
import { useRoute } from "vue-router";
import AsyncPageError from "./components/AsyncPageError.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import { t } from "./i18n";

const route = useRoute();
const operationsRoutes = new Set(["workbenches", "customers", "admin"]);
const loadingSurface = {
  name: "LoadingApplicationSurface",
  inheritAttrs: false,
  setup() {
    return () => h(SystemWaitOverlay, {
      visible: true,
      message: t("app.loadingPage")
    });
  }
};
const lazySurface = (loader) => defineAsyncComponent({
  loader,
  delay: 80,
  timeout: 30000,
  loadingComponent: loadingSurface,
  errorComponent: AsyncPageError
});
const PlannerSurface = lazySurface(() => import("./App.vue"));
const OperationsSurface = lazySurface(() => import("./OperationsEntry.vue"));
const isOperationsPath = () => ["/workbenches", "/customers", "/admin"].includes(window.location.pathname);
const activeSurface = computed(() => (operationsRoutes.has(String(route.name || "")) || isOperationsPath())
  ? OperationsSurface
  : PlannerSurface);
</script>
