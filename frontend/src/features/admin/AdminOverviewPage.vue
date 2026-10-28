<template>
  <section :aria-busy="busy" class="admin-page-pane">
    <div class="admin-metrics">
      <div>
        <span>{{ overviewCopy.totalUsers }}</span>
        <strong>{{ metric(overview?.totalUsers) }}</strong>
        <small>{{
          overviewCopy.totalUsersHint
            .replace("{internal}", metric(overview?.internalUserCount))
            .replace("{customers}", metric(overview?.customerCount))
        }}</small>
      </div>
      <div>
        <span>{{ overviewCopy.activeUsers }}</span>
        <strong>{{ metric(overview?.activeUsers) }}</strong>
        <small>{{ overviewCopy.activeUsersHint }}</small>
      </div>
      <div>
        <span>{{ overviewCopy.onlineDevices }}</span>
        <strong>{{ metric(overview?.onlineDeviceCount) }}</strong>
        <small>{{ overviewCopy.onlineDevicesHint }}</small>
      </div>
      <div>
        <span>{{ overviewCopy.management30d }}</span>
        <strong>{{ metric(overview?.managementActions30d) }}</strong>
        <small>{{ overviewCopy.management30dHint }}</small>
      </div>
      <div>
        <span>{{ overviewCopy.todayActivity }}</span>
        <strong>{{ metric(overview?.operationsToday) }}</strong>
        <small>{{ overviewCopy.todayActivityHint }}</small>
      </div>
    </div>

    <div class="admin-overview-chart-grid">
      <article class="admin-panel admin-overview-chart-card admin-overview-chart-card--wide">
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ overviewCopy.activityTrend }}</template
          ><template #eyebrow>Activity Trend</template
          ><template #actions
            ><span>{{ overviewCopy.activityTrendHint }}</span></template
          ></WorkspacePageHeader
        >
        <div
          ref="activityRef"
          class="admin-overview-echart"
          role="img"
          :aria-label="overviewCopy.activityTrend"
        ></div>
      </article>

      <article class="admin-panel admin-overview-chart-card">
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ overviewCopy.userComposition }}</template
          ><template #eyebrow>User Composition</template></WorkspacePageHeader
        >
        <div
          ref="usersRef"
          class="admin-overview-echart"
          role="img"
          :aria-label="overviewCopy.userComposition"
        ></div>
      </article>

      <article class="admin-panel admin-overview-chart-card">
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ overviewCopy.accountStatus }}</template
          ><template #eyebrow>Account Status</template></WorkspacePageHeader
        >
        <div
          ref="statusRef"
          class="admin-overview-echart"
          role="img"
          :aria-label="overviewCopy.accountStatus"
        ></div>
      </article>

      <article class="admin-panel admin-overview-chart-card admin-overview-chart-card--wide">
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ overviewCopy.operationTypes }}</template
          ><template #eyebrow>Management Actions</template
          ><template #actions
            ><span>{{ overviewCopy.operationTypesHint }}</span></template
          ></WorkspacePageHeader
        >
        <div
          ref="operationsRef"
          class="admin-overview-echart admin-overview-echart--bar"
          role="img"
          :aria-label="overviewCopy.operationTypes"
        ></div>
      </article>
    </div>
  </section>
</template>
<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { init, use } from "echarts/core";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { AdminOverviewData } from "../../types/adminOverviewTypes";
import { useReducedMotion } from "../../composables/useReducedMotion.js";
import { createChartGroup } from "../overview/chartGroup.js";
import { adminOverviewCopy } from "./adminOverviewCopy.js";
import { adminMetric as metric } from "./adminOverviewPresentation.js";
import { adminOverviewChartOptions } from "./adminOverviewChartOptions.js";
use([
  BarChart,
  LineChart,
  PieChart,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);
const props = withDefaults(
  defineProps<{ overview: AdminOverviewData | null; locale: string; busy?: boolean }>(),
  { busy: false }
);
const overviewCopy = computed(() => adminOverviewCopy(props.locale));
const reducedMotion = useReducedMotion();
const activityRef = ref<HTMLDivElement | null>(null);
const usersRef = ref<HTMLDivElement | null>(null);
const statusRef = ref<HTMLDivElement | null>(null);
const operationsRef = ref<HTMLDivElement | null>(null);
type ChartKey = "activity" | "users" | "status" | "operations";
interface AdminChartGroup {
  mount: (elements: Record<ChartKey, HTMLDivElement | null>) => void;
  render: (key: ChartKey, option: EChartsCoreOption | null) => void;
  resize: () => void;
  dispose: () => void;
}
const charts: AdminChartGroup = createChartGroup({
  initChart: (element: HTMLDivElement): EChartsType => init(element, null, { renderer: "canvas" })
});
function render() {
  const options = adminOverviewChartOptions(props.overview, props.locale, reducedMotion.value);
  for (const key of ["activity", "users", "status", "operations"] as const)
    charts.render(key, props.overview ? options[key] : null);
}
onMounted(() => {
  charts.mount({
    activity: activityRef.value,
    users: usersRef.value,
    status: statusRef.value,
    operations: operationsRef.value
  });
  render();
});
watch([() => props.overview, () => props.locale, reducedMotion], render, {
  deep: true,
  flush: "post"
});
onScopeDispose(charts.dispose);
defineExpose({ resize: charts.resize });
</script>
<style scoped src="./adminTableStyles.css"></style>
<style scoped src="./adminOverviewStyles.css"></style>

<style scoped src="../../components/workspace/workspacePageStyles.css"></style>
