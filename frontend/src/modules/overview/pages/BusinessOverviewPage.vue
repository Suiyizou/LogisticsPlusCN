<template>
  <transition name="overview-fade" appear @after-enter="resizeCharts"
    ><div data-i18n-ignore>
      <div data-module="overview" class="workspace-view">
        <div class="list-page list-page-full business-overview" v-loading="loading">
          <div class="list-page-header business-overview-header">
            <div>
              <span class="business-overview-kicker">{{ t("customers.overviewKicker") }}</span>
              <h2>{{ t("customers.overview") }}</h2>
              <p>{{ t("customers.overviewHint") }}</p>
            </div>
            <el-button :loading="loading" @click="reload">
              <el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}
            </el-button>
          </div>
          <div class="business-kpi-grid">
            <article
              v-for="metric in kpis"
              :key="metric.key"
              class="business-kpi-card"
              :class="`is-${metric.tone}`"
            >
              <div class="business-kpi-card__top">
                <span class="business-kpi-card__icon" aria-hidden="true">
                  <el-icon><component :is="metric.icon" /></el-icon>
                </span>
                <span>{{ metric.label }}</span>
              </div>
              <div class="business-kpi-card__value">
                <b>{{ metric.value }}</b>
                <small>{{ metric.hint }}</small>
              </div>
            </article>
          </div>
          <BusinessOverviewCharts
            ref="overviewChartsRef"
            :trend="model.trend"
            :today="model.today"
            :resources="model.resources"
            :status="model.status"
            :loading="loading"
          />
          <p v-if="error" class="business-overview-warning" role="status">
            {{ error }}
            <span v-if="usingCache">{{ t("customers.overviewCachedFallback") }}</span>
          </p>
        </div>
      </div>
    </div></transition
  >
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  Refresh,
  CirclePlusFilled,
  RefreshRight,
  FolderOpened,
  ChatDotRound,
  UserFilled
} from "@element-plus/icons-vue";
import BusinessOverviewCharts from "../../../features/overview/BusinessOverviewCharts.vue";
import { useModulePages } from "../../moduleContext.js";
import { useWorkspaceContext } from "../../workspaceContext.js";
import { fetchBusinessDashboardTodayStats } from "../../../services/businessCustomerApi";
import { useOverviewMetrics } from "../useOverviewMetrics.js";
const { t, locale } = useI18n();
const session = useWorkspaceContext();
const port = useModulePages("overview");
const { model, loading, error, reload, usingCache } = useOverviewMetrics({
  fetchStats: fetchBusinessDashboardTodayStats,
  readFallback: port.readFallback,
  currentUser: () => session.user.value,
  t,
  locale
});
const icons = { CirclePlusFilled, RefreshRight, FolderOpened, ChatDotRound, UserFilled };
const kpis = computed(() =>
  model.value.kpis.map((item) => ({
    ...item,
    icon: icons[item.icon as keyof typeof icons]
  }))
);
const overviewChartsRef = ref<InstanceType<typeof BusinessOverviewCharts> | null>(null);
const resizeCharts = () => overviewChartsRef.value?.resize();
onMounted(() => {
  void reload();
});
</script>
<style scoped>
.list-page {
  max-width: none;
  width: 100%;
}
.list-page-full {
  max-width: none;
  width: 100%;
  padding: 20px 22px 22px;
  box-sizing: border-box;
}
.list-page-full :deep(.el-table) {
  width: 100% !important;
}
.list-page-full :deep(.el-table__body-wrapper),
.list-page-full :deep(.el-table__header-wrapper) {
  width: 100%;
}
.workspace-view {
  width: 100%;
  min-width: 0;
}
.workspace-view {
  padding-inline: 2px;
}
.list-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.list-page-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-primary);
  letter-spacing: -0.02em;
}
.list-page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 100%;
  min-width: 0;
}
.business-overview {
  display: grid;
  gap: 18px;
}
.business-overview-header {
  margin-bottom: 0;
  padding: 4px 0 2px;
}
.business-overview-header p {
  margin: 6px 0 0;
  color: #71869a;
  font-size: 12px;
}
.business-overview-kicker {
  display: block;
  margin-bottom: 5px;
  color: #3982be;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.business-kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.business-kpi-card {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 132px;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface-subtle);
  box-shadow: none;
  align-content: space-between;
  overflow: hidden;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
  animation: business-kpi-in 400ms ease both;
}
.business-kpi-card:nth-child(2) {
  animation-delay: 45ms;
}
.business-kpi-card:nth-child(3) {
  animation-delay: 90ms;
}
.business-kpi-card:nth-child(4) {
  animation-delay: 135ms;
}
.business-kpi-card:nth-child(5) {
  animation-delay: 180ms;
}
.business-kpi-card:hover {
  box-shadow: none;
  transform: translateY(-2px);
}
.business-kpi-card::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: #3a83c1;
  content: "";
}
.business-kpi-card__top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.business-kpi-card__top > span:last-child {
  overflow: hidden;
  color: #536f88;
  font-size: 11px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.business-kpi-card__icon {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 4px;
  color: #347fc0;
  background: #eaf4fc;
  place-items: center;
  font-size: 17px;
  box-shadow: none;
}
.business-kpi-card__value {
  display: grid;
  min-width: 0;
  gap: 7px;
}
.business-kpi-card__value > b {
  color: #193750;
  font-size: clamp(26px, 2.2vw, 36px);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.business-kpi-card__value > small {
  overflow: hidden;
  color: #8a9daf;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.business-kpi-card.is-amber::before {
  background: #e4a83d;
}
.business-kpi-card.is-green::before {
  background: #3dad80;
}
.business-kpi-card.is-purple::before {
  background: var(--color-primary);
}
.business-kpi-card.is-cyan::before {
  background: #35a8bd;
}
.business-kpi-card.is-amber .business-kpi-card__icon {
  color: #c9871b;
  background: #fff5df;
}
.business-kpi-card.is-green .business-kpi-card__icon {
  color: #278a67;
  background: #e8f8f1;
}
.business-kpi-card.is-purple .business-kpi-card__icon {
  color: #6b5cc3;
  background: #f0edff;
}
.business-kpi-card.is-cyan .business-kpi-card__icon {
  color: #238ca0;
  background: #e7f7fa;
}
.business-overview-warning {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #f0dfb7;
  border-radius: 4px;
  color: #916d28;
  background: #fff8e7;
  font-size: 10px;
  line-height: 1.5;
}
@keyframes business-kpi-in {
  from {
    opacity: 0;
    transform: translateY(9px);
  }
}
@media (max-width: 900px) {
  .business-kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .workspace-view {
    padding-inline: 0;
  }
  .business-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .business-kpi-card {
    animation: none !important;
  }
  .business-kpi-card:hover {
    transform: none;
  }
}
.overview-fade-enter-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.overview-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .overview-fade-enter-active {
    transition: none;
  }
  .business-kpi-card {
    animation: none;
    transition: none;
  }
}

.business-kpi-grid {
  gap: 0;
  border: 1px solid var(--color-border);
  background: #fff;
}
.business-kpi-card {
  min-height: 132px;
  padding: 20px;
  border: 0;
  border-right: 1px solid var(--color-border);
  border-radius: 0;
  background: white;
  animation: none;
}
.business-kpi-card:last-child {
  border-right: 0;
}
.business-kpi-card::before {
  display: none;
}
.business-kpi-card:hover {
  transform: none;
}
.business-kpi-card__icon,
.business-kpi-card.is-amber .business-kpi-card__icon,
.business-kpi-card.is-green .business-kpi-card__icon,
.business-kpi-card.is-purple .business-kpi-card__icon,
.business-kpi-card.is-cyan .business-kpi-card__icon {
  width: 26px;
  height: 26px;
  flex-basis: 26px;
  border-radius: 0;
  color: var(--color-primary);
  background: var(--color-surface-subtle);
  font-size: 14px;
}
.business-kpi-card__top > span:last-child {
  color: var(--color-muted);
  font-weight: 500;
}
.business-kpi-card__value > b {
  color: var(--color-primary);
  font-weight: 500;
}
.business-overview-kicker {
  color: var(--color-muted);
  font-weight: 500;
}
@media (max-width: 900px) {
  .business-kpi-card {
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
