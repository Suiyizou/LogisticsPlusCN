<template>
  <div class="workspace-view module-workspace" data-module="shipments">
    <transition name="module-view" mode="out-in">
      <ShipmentListWorkspacePage v-if="view === 'list'" key="list" />
      <ShipmentDetailPage v-else key="detail" />
    </transition>
  </div>
</template>
<script setup lang="ts">
import { useModulePages } from "../../moduleContext.js";
import ShipmentListWorkspacePage from "./ShipmentListWorkspacePage.vue";
import ShipmentDetailPage from "./ShipmentDetailPage.vue";
const { view } = useModulePages("shipments");
defineOptions({ inheritAttrs: false });
</script>
<style scoped>
.module-workspace {
  min-width: 0;
  width: 100%;
}
.module-view-enter-active,
.module-view-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.module-view-enter-from,
.module-view-leave-to {
  opacity: 0;
  transform: translateY(5px);
}
@media (prefers-reduced-motion: reduce) {
  .module-view-enter-active,
  .module-view-leave-active {
    transition: none;
  }
}
</style>
