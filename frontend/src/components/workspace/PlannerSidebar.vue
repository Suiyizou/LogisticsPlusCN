<template>
  <aside class="app-sidebar" data-i18n-ignore>
    <BrandLockup class="planner-sidebar-brand" href="/workbenches" compact inverse />
    <el-button class="sidebar-toggle" :icon="collapsed ? Expand : Fold" @click="emit('toggle')">
      <span>{{ t(collapsed ? "maritime.expand" : "maritime.collapse") }}</span>
    </el-button>

    <div :id="navigationId" class="planner-sidebar-navigation">
      <div class="side-user-card">
        <span>{{ t("workspaceV2.currentWorkspace") }}</span>
        <strong>{{ displayName }}</strong>
        <small>{{
          t("maritime.planningInventory", { cargos: cargoCount, containers: containerCount })
        }}</small>
      </div>

      <WorkspaceNavigation
        :role="role"
        :active-index="activeIndex"
        :disable-results="!cargoCount"
        :compact="!isMobile && collapsed"
        intercept-navigation
        @navigate="selectPage"
      />
    </div>
  </aside>
</template>
<script setup lang="ts">
import WorkspaceNavigation from "./WorkspaceNavigation.vue";
import BrandLockup from "../brand/BrandLockup.vue";
import { Expand, Fold } from "@element-plus/icons-vue";
import { onMounted, onUnmounted, ref, useId } from "vue";
import { t } from "../../i18n";
defineProps<{
  role?: string;
  collapsed: boolean;
  displayName: string;
  cargoCount: number;
  containerCount: number;
  activeIndex: string;
}>();
const emit = defineEmits<{ toggle: []; select: [index: string] }>();
const navigationId = useId();
const mobileQuery = typeof window === "undefined" ? null : window.matchMedia("(max-width: 760px)");
const isMobile = ref(mobileQuery?.matches || false);
function updateViewport(event: MediaQueryListEvent) {
  isMobile.value = event.matches;
}
function selectPage(index: string) {
  emit("select", index);
}
onMounted(() => mobileQuery?.addEventListener("change", updateViewport));
onUnmounted(() => mobileQuery?.removeEventListener("change", updateViewport));
</script>

<style scoped>
.planner-sidebar-navigation {
  display: contents;
}
@media (max-width: 850px) {
  .app-sidebar .sidebar-toggle {
    display: none;
  }
  .planner-sidebar-navigation {
    display: block;
  }
}
</style>
