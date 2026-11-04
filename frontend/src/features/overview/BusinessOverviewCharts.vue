<template>
  <div class="business-chart-grid">
    <section class="business-chart-card business-chart-card--trend">
      <header>
        <div>
          <h2>{{ t("customers.overviewSevenDayTrend") }}</h2>
          <small>{{ t("customers.overviewTrendHint") }}</small>
        </div>
        <span class="business-chart-index" aria-hidden="true">01</span>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          v-if="trendHasData"
          ref="overviewTrendChartRef"
          class="business-echart commercial-reveal"
          role="img"
          :aria-label="t('customers.overviewSevenDayTrend')"
        ></div>
        <p v-else-if="!loading" class="business-chart-empty commercial-state">
          <span aria-hidden="true">—</span>
          {{ commercialText("overviewTrendEmpty") }}
        </p>
      </div>
    </section>
    <section class="business-chart-card">
      <header>
        <div>
          <h2>{{ t("customers.overviewTodayCompositionTitle") }}</h2>
          <small>{{ t("customers.overviewTodayCompositionHint") }}</small>
        </div>
        <span class="business-chart-index" aria-hidden="true">02</span>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          v-if="todayHasData"
          ref="overviewTodayChartRef"
          class="business-echart commercial-reveal"
          role="img"
          :aria-label="t('customers.overviewTodayCompositionTitle')"
        ></div>
        <p v-else-if="!loading" class="business-chart-empty commercial-state">
          <span aria-hidden="true">—</span>
          {{ commercialText("overviewTodayEmpty") }}
        </p>
      </div>
    </section>
    <section class="business-chart-card business-chart-card--resources">
      <header>
        <div>
          <h2>{{ t("customers.overviewResourceTitle") }}</h2>
          <small>{{ t("customers.overviewDataSource") }}</small>
        </div>
        <span class="business-chart-index" aria-hidden="true">03</span>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          v-if="resourcesHaveData"
          ref="overviewResourcesChartRef"
          class="business-echart commercial-reveal"
          role="img"
          :aria-label="t('customers.overviewResourceTitle')"
        ></div>
        <p v-else-if="!loading" class="business-chart-empty commercial-state">
          <span aria-hidden="true">—</span>
          {{ commercialText("overviewResourcesEmpty") }}
        </p>
      </div>
    </section>
    <section class="business-chart-card">
      <header>
        <div>
          <h2>{{ t("customers.overviewShipmentStatusTitle") }}</h2>
          <small>{{ t("customers.overviewShipmentStatusHint") }}</small>
        </div>
        <span class="business-chart-index" aria-hidden="true">04</span>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          v-if="statusHasData"
          ref="overviewStatusChartRef"
          class="business-echart commercial-reveal"
          role="img"
          :aria-label="t('customers.overviewShipmentStatusTitle')"
        ></div>
        <p v-else-if="!loading" class="business-chart-empty commercial-state">
          <span aria-hidden="true">—</span>
          {{ commercialText("overviewStatusEmpty") }}
        </p>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { commercialText } from "../../i18n/commercialWorkspaceMessages";
import { init, use } from "echarts/core";
import type { EChartsType } from "echarts/core";
import type { OverviewTrendDatum, OverviewChartDatum } from "../../types/featureComponents";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useReducedMotion } from "../../composables/useReducedMotion.js";
import { createChartGroup } from "./chartGroup.js";
import {
  overviewTrendOption,
  overviewDonutOption,
  overviewResourcesOption
} from "./overviewChartOptions.js";
use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
]);
const props = withDefaults(
  defineProps<{
    trend?: OverviewTrendDatum[];
    today?: OverviewChartDatum[];
    resources?: OverviewChartDatum[];
    status?: OverviewChartDatum[];
    loading?: boolean;
  }>(),
  { trend: () => [], today: () => [], resources: () => [], status: () => [], loading: false }
);
const { t, locale } = useI18n();
const reducedMotion = useReducedMotion();
const overviewTrendChartRef = ref<HTMLDivElement | null>(null);
const overviewTodayChartRef = ref<HTMLDivElement | null>(null);
const overviewResourcesChartRef = ref<HTMLDivElement | null>(null);
const overviewStatusChartRef = ref<HTMLDivElement | null>(null);
const trendHasData = computed(() => props.trend.some((day) => day.created > 0 || day.updated > 0));
const todayHasData = computed(() => props.today.some((item) => item.value > 0));
const resourcesHaveData = computed(() => props.resources.some((item) => item.value > 0));
const statusHasData = computed(() => props.status.some((item) => item.value > 0));
type ChartKey = "trend" | "today" | "status" | "resources";
type ChartOption =
  | ReturnType<typeof overviewTrendOption>
  | ReturnType<typeof overviewDonutOption>
  | ReturnType<typeof overviewResourcesOption>;
interface ChartGroup {
  mount: (elements: Record<ChartKey, HTMLDivElement | null>) => void;
  render: (key: ChartKey, option: ChartOption | null) => void;
  resize: () => void;
  dispose: () => void;
}
const group: ChartGroup = createChartGroup({
  initChart: (element: HTMLDivElement): EChartsType => init(element, null, { renderer: "canvas" })
});
function render() {
  group.render(
    "trend",
    trendHasData.value ? overviewTrendOption(props.trend, t, reducedMotion.value) : null
  );
  const donuts: ["today" | "status", OverviewChartDatum[], string][] = [
    ["today", props.today, "customers.overviewTodayCompositionTitle"],
    ["status", props.status, "customers.overviewShipmentStatusTitle"]
  ];
  for (const [key, data, title] of donuts) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    group.render(
      key,
      total > 0 ? overviewDonutOption(data, total, t(title), t, reducedMotion.value) : null
    );
  }
  group.render(
    "resources",
    resourcesHaveData.value
      ? overviewResourcesOption(props.resources, t, reducedMotion.value)
      : null
  );
}
watch(
  [overviewTrendChartRef, overviewTodayChartRef, overviewResourcesChartRef, overviewStatusChartRef],
  ([trend, today, resources, status]) => {
    group.mount({ trend, today, resources, status });
    render();
  },
  { flush: "post" }
);
watch(
  [
    () => props.trend,
    () => props.today,
    () => props.resources,
    () => props.status,
    reducedMotion,
    locale
  ],
  render,
  { deep: true, flush: "post" }
);
onScopeDispose(group.dispose);
defineExpose({ resize: group.resize });
</script>
<style scoped>
.business-chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.9fr);
  gap: 14px;
  align-items: start;
}
.business-chart-card {
  min-width: 0;
  padding: 17px 18px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: none;
  overflow: hidden;
}
.business-chart-card > header {
  min-height: 42px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.business-chart-card > header > div {
  display: grid;
  gap: 3px;
}
.business-chart-card h2 {
  margin: 0;
  color: var(--color-foreground);
  font-family: var(--font-display, var(--font-ui));
  font-size: 19px;
  font-weight: 600;
  line-height: 1.2;
}
.business-chart-index {
  padding-inline-start: 10px;
  border-inline-start: 1px solid var(--color-border);
  color: var(--color-muted);
  font: 600 12px/1.5 var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
}
.business-chart-card header small {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
}
.business-chart-body {
  position: relative;
  min-height: 56px;
}
.business-echart {
  width: 100%;
  height: 280px;
}
.business-chart-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  margin: 0;
  padding: 9px 12px;
  border-inline-start: 2px solid var(--color-border-strong);
  background: var(--color-surface-subtle);
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.5;
}
.business-chart-empty > span {
  flex: none;
  color: var(--color-primary);
}
.business-chart-body :deep(.el-loading-mask) {
  background: rgba(255, 255, 255, 0.82);
}
@media (max-width: 900px) {
  .business-chart-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .business-chart-card {
    padding-inline: 14px;
  }
}
@media (max-width: 680px) {
  .business-echart {
    height: 252px;
  }
}
</style>
<style scoped src="../../modules/shared/commercialWorkspaceMotion.css"></style>
