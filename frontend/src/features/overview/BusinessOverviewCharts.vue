<template>
  <div class="business-chart-grid">
    <section class="business-chart-card business-chart-card--trend">
      <header>
        <div>
          <b>{{ t("customers.overviewSevenDayTrend") }}</b>
          <small>{{ t("customers.overviewTrendHint") }}</small>
        </div>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          ref="overviewTrendChartRef"
          class="business-echart"
          role="img"
          :aria-label="t('customers.overviewSevenDayTrend')"
        ></div>
        <div v-if="!loading && !trendHasData" class="business-chart-empty">
          <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
        </div>
      </div>
    </section>
    <section class="business-chart-card">
      <header>
        <div>
          <b>{{ t("customers.overviewTodayCompositionTitle") }}</b>
          <small>{{ t("customers.overviewTodayCompositionHint") }}</small>
        </div>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          ref="overviewTodayChartRef"
          class="business-echart"
          role="img"
          :aria-label="t('customers.overviewTodayCompositionTitle')"
        ></div>
        <div v-if="!loading && !todayHasData" class="business-chart-empty">
          <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
        </div>
      </div>
    </section>
    <section class="business-chart-card business-chart-card--resources">
      <header>
        <div>
          <b>{{ t("customers.overviewResourceTitle") }}</b>
          <small>{{ t("customers.overviewDataSource") }}</small>
        </div>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          ref="overviewResourcesChartRef"
          class="business-echart"
          role="img"
          :aria-label="t('customers.overviewResourceTitle')"
        ></div>
        <div v-if="!loading && !resourcesHaveData" class="business-chart-empty">
          <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
        </div>
      </div>
    </section>
    <section class="business-chart-card">
      <header>
        <div>
          <b>{{ t("customers.overviewShipmentStatusTitle") }}</b>
          <small>{{ t("customers.overviewShipmentStatusHint") }}</small>
        </div>
      </header>
      <div class="business-chart-body" v-loading="loading">
        <div
          ref="overviewStatusChartRef"
          class="business-echart"
          role="img"
          :aria-label="t('customers.overviewShipmentStatusTitle')"
        ></div>
        <div v-if="!loading && !statusHasData" class="business-chart-empty">
          <el-empty :image-size="68" :description="t('customers.overviewNoData')" />
        </div>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
onMounted(() => {
  group.mount({
    trend: overviewTrendChartRef.value,
    today: overviewTodayChartRef.value,
    resources: overviewResourcesChartRef.value,
    status: overviewStatusChartRef.value
  });
  render();
});
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
}
.business-chart-card {
  min-width: 0;
  padding: 17px 18px 14px;
  border: 1px solid #dbe6ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(33, 64, 92, 0.065);
  overflow: hidden;
}
.business-chart-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.business-chart-card > header > div {
  display: grid;
  gap: 3px;
}
.business-chart-card header b {
  color: #203d57;
  font-size: 13px;
}
.business-chart-card header small {
  color: #8a9daf;
  font-size: 9px;
  line-height: 1.5;
}
.business-chart-body {
  position: relative;
  min-height: 280px;
  margin-top: 6px;
}
.business-echart {
  width: 100%;
  height: 280px;
}
.business-chart-empty {
  position: absolute;
  z-index: 2;
  display: grid;
  inset: 0;
  background: rgba(255, 255, 255, 0.94);
  place-items: center;
}
.business-chart-empty :deep(.el-empty) {
  padding: 16px 0;
}
.business-chart-empty :deep(.el-empty__description) {
  margin-top: 4px;
}
.business-chart-empty :deep(.el-empty__description p) {
  color: #91a3b3;
  font-size: 10px;
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
  .business-chart-body,
  .business-echart {
    height: 252px;
    min-height: 252px;
  }
}
</style>
