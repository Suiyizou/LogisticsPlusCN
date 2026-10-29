<template>
  <aside class="app-sidebar" data-i18n-ignore>
    <BrandLockup class="planner-sidebar-brand" href="/workbenches" compact inverse />
    <button
      class="sidebar-mobile-toggle"
      type="button"
      :aria-expanded="mobileOpen"
      :aria-controls="navigationId"
      @click="mobileOpen = !mobileOpen"
    >
      <el-icon><component :is="mobileOpen ? Fold : Expand" /></el-icon>
      <strong>{{ t("maritime.planning") }}</strong>
      <span>{{ t(mobileOpen ? "maritime.collapse" : "maritime.expand") }}</span>
    </button>
    <el-button class="sidebar-toggle" :icon="collapsed ? Expand : Fold" @click="emit('toggle')">
      <span>{{ t(collapsed ? "maritime.expand" : "maritime.collapse") }}</span>
    </el-button>

    <div :id="navigationId" v-show="!isMobile || mobileOpen" class="planner-sidebar-navigation">
      <div class="side-user-card">
        <span>{{ t("workspaceV2.currentWorkspace") }}</span>
        <strong>{{ displayName }}</strong>
        <small>{{
          t("maritime.planningInventory", { cargos: cargoCount, containers: containerCount })
        }}</small>
      </div>

      <el-menu
        class="side-menu"
        :collapse="!isMobile && collapsed"
        :default-active="activeIndex"
        background-color="transparent"
        text-color="#c8d7df"
        active-text-color="#ffffff"
        :collapse-transition="false"
        @select="selectPage"
      >
        <el-menu-item index="/workbenches">
          <el-icon><Grid /></el-icon>
          <span>{{ t("portal.switchWorkbench") }}</span>
        </el-menu-item>
        <el-menu-item index="/home">
          <el-icon><House /></el-icon>
          <span>{{ t("workspaceV2.plannerHome") }}</span>
        </el-menu-item>
        <el-sub-menu index="/planner">
          <template #title>
            <el-icon><Box /></el-icon>
            <span>{{ t("workspaceV2.plannerNavigation") }}</span>
          </template>
          <el-menu-item index="/planner/cargos">
            <el-icon><Box /></el-icon>
            <span>{{ t("workspaceV2.cargoOverviewTitle") }}</span>
          </el-menu-item>
          <el-menu-item index="/planner/results" :disabled="!cargoCount">
            <el-icon><DataAnalysis /></el-icon>
            <span>{{ t("workspaceV2.reviewExport") }}</span>
          </el-menu-item>
          <el-menu-item index="/planner/config">
            <el-icon><Setting /></el-icon>
            <span>{{ t("workspaceV2.configTitle") }}</span>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/algorithm">
          <el-icon><Document /></el-icon>
          <span>{{ t("workspaceV2.algorithmNavigation") }}</span>
        </el-menu-item>
        <el-menu-item index="/containers">
          <el-icon><DataAnalysis /></el-icon>
          <span>{{ t("workspaceV2.equipmentQuick") }}</span>
        </el-menu-item>
      </el-menu>
    </div>
  </aside>
</template>
<script setup lang="ts">
import BrandLockup from "../brand/BrandLockup.vue";
import {
  Box,
  DataAnalysis,
  Document,
  Expand,
  Fold,
  Grid,
  House,
  Setting
} from "@element-plus/icons-vue";
import { onMounted, onUnmounted, ref, useId } from "vue";
import { t } from "../../i18n";
defineProps<{
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
const mobileOpen = ref(false);
function updateViewport(event: MediaQueryListEvent) {
  isMobile.value = event.matches;
  mobileOpen.value = false;
}
function selectPage(index: string) {
  if (isMobile.value) mobileOpen.value = false;
  emit("select", index);
}
onMounted(() => mobileQuery?.addEventListener("change", updateViewport));
onUnmounted(() => mobileQuery?.removeEventListener("change", updateViewport));
</script>

<style scoped>
.planner-sidebar-navigation {
  display: contents;
}
.sidebar-mobile-toggle {
  display: none;
}
@media (max-width: 760px) {
  .app-sidebar .sidebar-toggle {
    display: none;
  }
  .planner-sidebar-navigation {
    display: block;
  }
  .app-sidebar .sidebar-mobile-toggle {
    display: flex;
    justify-content: flex-start;
    gap: 12px;
    min-height: 42px;
    margin: 0;
    padding: 8px 12px;
    border: 1px solid #ffffff30;
    border-radius: var(--radius-control);
    color: white;
    background: transparent;
  }
  .sidebar-mobile-toggle strong {
    font-size: 12px;
    font-weight: 500;
  }
  .sidebar-mobile-toggle span {
    margin-left: auto;
    font-size: 12px;
    color: #c0d3de;
  }
}
</style>
