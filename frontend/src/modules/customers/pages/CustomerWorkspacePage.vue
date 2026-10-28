<template>
  <div class="workspace-view module-workspace" data-module="customers">
    <transition name="module-view" mode="out-in">
      <CustomerDirectoryPage v-if="view === 'list'" key="list" />
      <CustomerDetailPage v-else key="detail" />
    </transition>
  </div>
</template>
<script setup lang="ts">
import { useModulePages } from "../../moduleContext.js";
import CustomerDirectoryPage from "./CustomerDirectoryPage.vue";
import CustomerDetailPage from "./CustomerDetailPage.vue";
const { view } = useModulePages("customers");
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

<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>
