<template>
  <section ref="shellRef" class="packing-visual-shell" :class="{ fullscreen: isFullscreen }">
    <el-card class="packing-visual-toolbar" shadow="never">
      <div class="toolbar-left">
        <el-button :icon="Refresh" @click="setView('iso')">{{ tr("视角复位") }}</el-button>
        <el-segmented v-model="viewMode" :options="viewModeOptions" size="default" />
        <el-button-group>
          <el-button :type="activeView === 'front' ? 'primary' : 'default'" @click="setView('front')">{{ tr("正视") }}</el-button>
          <el-button :type="activeView === 'side' ? 'primary' : 'default'" @click="setView('side')">{{ tr("侧视") }}</el-button>
          <el-button :type="activeView === 'top' ? 'primary' : 'default'" @click="setView('top')">{{ tr("俯视") }}</el-button>
          <el-button :type="activeView === 'iso' ? 'primary' : 'default'" @click="setView('iso')">{{ tr("轴测") }}</el-button>
        </el-button-group>
      </div>
      <div class="toolbar-right">
        <el-switch v-model="sliceEnabled" :active-text="tr('剖切')" :inactive-text="tr('剖切')" />
        <el-popover placement="bottom-end" trigger="click" width="360" popper-class="visual-options-popper">
          <template #reference>
            <el-button :icon="Setting">{{ tr("显示选项") }}</el-button>
          </template>
          <div class="visual-option-grid">
            <el-checkbox v-model="showLabels">{{ tr("货号标签") }}</el-checkbox>
            <el-checkbox v-model="remainingModel">{{ tr("剩余空间") }}</el-checkbox>
            <el-checkbox v-model="massModel">{{ tr("重心偏载") }}</el-checkbox>
            <el-checkbox v-model="showGrid">{{ tr("底部网格") }}</el-checkbox>
            <el-checkbox v-model="showShell">{{ tr("箱体外壳") }}</el-checkbox>
            <el-checkbox v-model="showCenter">{{ tr("几何中心") }}</el-checkbox>
            <el-checkbox v-model="translucentCargo">{{ tr("半透明货物") }}</el-checkbox>
            <el-checkbox v-model="showHeatmap">{{ tr("重量热力") }}</el-checkbox>
            <el-checkbox v-model="showClearanceEnvelope">{{ t("sceneOptions.clearanceEnvelope") }}</el-checkbox>
            <el-checkbox v-model="showAxes">{{ t("sceneOptions.showAxes") }}</el-checkbox>
            <div class="visual-option-control">
              <span>{{ t("sceneOptions.axisScale") }}</span>
              <el-segmented
                v-model="axisScalePreset"
                :options="axisScaleOptions"
                size="small"
                :disabled="!showAxes"
              />
            </div>
          </div>
        </el-popover>
        <el-button :icon="isFullscreen ? Aim : FullScreen" @click="toggleFullscreen">
          {{ isFullscreen ? tr("退出全屏") : tr("全屏") }}
        </el-button>
      </div>
    </el-card>

    <el-card v-if="sliceEnabled" class="slice-control-card" shadow="never">
      <div class="slice-control-row">
        <span>{{ tr("剖切方向") }}</span>
        <el-radio-group v-model="sliceAxis" size="small">
          <el-radio-button value="z">{{ tr("Z 高度") }}</el-radio-button>
          <el-radio-button value="x">{{ tr("X 前后") }}</el-radio-button>
          <el-radio-button value="y">{{ tr("Y 左右") }}</el-radio-button>
        </el-radio-group>
        <el-slider v-model="slicePercent" :min="0" :max="100" :step="1" />
        <el-tag effect="plain">{{ sliceLabel }}</el-tag>
      </div>
    </el-card>

    <div class="packing-visual-layout">
      <div class="packing-canvas-panel" @pointermove="handlePointerMove" @pointerleave="handlePointerLeave">
        <div ref="canvasHost" class="packing-scene-canvas"></div>
        <SystemWaitOverlay
          v-if="visualBusy"
          :visible="true"
          :message="tr(visualBusyText)"
          contained
        />
        <div v-else-if="emptyStateVisible" class="visual-empty-state">
          <el-empty :description="emptyStateText" />
        </div>
        <div v-if="tooltip.visible" class="scene-tooltip visual-tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
          <strong>#{{ tooltip.item.displayNo }} {{ tooltip.item.name }}</strong>
          <span>{{ t("sceneOptions.physicalOuterSize") }} {{ formatDimension(tooltip.item.physicalLengthCm) }} × {{ formatDimension(tooltip.item.physicalWidthCm) }} × {{ formatDimension(tooltip.item.physicalHeightCm) }} cm</span>
          <span v-if="tooltip.item.hasClearance">{{ t("sceneOptions.reservedEnvelopeSize") }} {{ formatDimension(tooltip.item.lengthCm) }} × {{ formatDimension(tooltip.item.widthCm) }} × {{ formatDimension(tooltip.item.heightCm) }} cm</span>
          <span v-if="tooltip.item.horizontalGapCm > 0">{{ t("sceneOptions.horizontalGapDetail", { gap: formatDimension(tooltip.item.horizontalGapCm), side: formatDimension(tooltip.item.clearancePerSideCm) }) }}</span>
          <span>{{ tr("数量") }} {{ tooltip.item.quantity }} {{ tr("件") }} · {{ tr("重量") }} {{ formatWeight(tooltip.item.weightKg) }}</span>
          <span class="tooltip-constraint-tags">
            <el-tag
              size="small"
              :type="tooltip.item.nonStack ? 'warning' : 'success'"
              effect="light"
            >
              {{ t(tooltip.item.nonStack ? "sceneOptions.nonStackable" : "sceneOptions.loadBearing") }}
            </el-tag>
            <el-tag v-if="tooltip.item.keepUpright" size="small" type="primary" effect="plain">
              {{ t("sceneOptions.keepUpright") }}
            </el-tag>
          </span>
          <span>{{ tr(tooltip.item.orientationLabel || tooltip.item.bottomFaceDetail || "按算法输出坐标摆放") }}</span>
          <span>{{ t("sceneOptions.physicalCoordinates") }} X{{ formatDimension(tooltip.item.physicalXCm) }} / Y{{ formatDimension(tooltip.item.physicalYCm) }} / Z{{ formatDimension(tooltip.item.physicalZCm) }} cm</span>
          <span v-if="tooltip.item.hasClearance">{{ t("sceneOptions.reservedCoordinates") }} X{{ formatDimension(tooltip.item.xCm) }} / Y{{ formatDimension(tooltip.item.yCm) }} / Z{{ formatDimension(tooltip.item.zCm) }} cm</span>
        </div>
      </div>

      <aside class="packing-info-panel">
        <el-card class="info-panel-card legend-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>{{ tr("货物图例") }}</strong>
              <el-button v-if="hiddenSkuKeys.size" link type="primary" @click="showAllSku">{{ tr("全部显示") }}</el-button>
            </div>
          </template>
          <el-scrollbar max-height="300">
            <button
              v-for="item in sceneData.legend"
              :key="item.key"
              class="legend-row"
              :class="{ muted: hiddenSkuKeys.has(item.key) }"
              type="button"
              @click="toggleSku(item.key)"
            >
              <i :style="{ background: item.color }"></i>
              <span>
                <b>{{ item.label }}</b>
                <small>{{ item.quantity }} {{ tr("件") }} · {{ formatWeight(item.weightKg) }}</small>
                <span class="legend-constraint-tags">
                  <el-tag
                    class="legend-constraint-tag"
                    size="small"
                    :type="item.nonStack ? 'warning' : 'success'"
                    effect="light"
                  >
                    {{ t(item.nonStack ? "sceneOptions.nonStackable" : "sceneOptions.loadBearing") }}
                  </el-tag>
                  <el-tag
                    v-if="item.keepUpright"
                    class="legend-constraint-tag"
                    size="small"
                    type="primary"
                    effect="plain"
                  >
                    {{ t("sceneOptions.keepUpright") }}
                  </el-tag>
                </span>
              </span>
              <em>{{ hiddenSkuKeys.has(item.key) ? tr("隐藏") : tr("显示") }}</em>
            </button>
          </el-scrollbar>
        </el-card>

        <el-card class="info-panel-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>{{ tr("偏载重心") }}</strong>
              <el-tag :type="balanceState.tagType" effect="light">{{ tr(balanceState.label) }}</el-tag>
            </div>
          </template>
          <div class="balance-summary">
            <p>{{ tr(balanceState.description) }}</p>
            <div class="balance-metric-list">
              <span>{{ tr("重心坐标") }}</span>
              <b>X {{ balanceState.center.xCm.toFixed(1) }} / Y {{ balanceState.center.yCm.toFixed(1) }} / Z {{ balanceState.center.zCm.toFixed(1) }} cm</b>
              <span>{{ tr("横向偏移 Y") }}</span>
              <b>{{ formatSigned(balanceState.offset.lateralCm ?? balanceState.offset.yCm) }} cm / {{ formatSigned(balanceState.offset.lateralPercent ?? balanceState.offset.yPercent) }}%</b>
              <span>{{ tr("纵向偏移 X") }}</span>
              <b>{{ formatSigned(balanceState.offset.longitudinalCm ?? balanceState.offset.xCm) }} cm / {{ formatSigned(balanceState.offset.longitudinalPercent ?? balanceState.offset.xPercent) }}%</b>
              <span>{{ tr("重心高度") }}</span>
              <b>{{ balanceState.center.zCm.toFixed(1) }} cm</b>
            </div>
          </div>
          <div class="balance-zone-bars" v-if="balanceState.valid">
            <div>
              <span>{{ tr("前 / 后") }}</span>
              <el-progress :percentage="frontPercent" :stroke-width="10" :show-text="false" />
              <small>{{ tr("前") }} {{ frontPercent.toFixed(1) }}% · {{ tr("后") }} {{ rearPercent.toFixed(1) }}%</small>
            </div>
            <div>
              <span>{{ tr("左 / 右") }}</span>
              <el-progress :percentage="leftPercent" :stroke-width="10" :show-text="false" />
              <small>{{ tr("左") }} {{ leftPercent.toFixed(1) }}% · {{ tr("右") }} {{ rightPercent.toFixed(1) }}%</small>
            </div>
          </div>
        </el-card>

        <el-card class="info-panel-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>{{ tr(sceneData.container?.name || "未选择箱型") }}</strong>
              <div class="scene-plan-tags">
                <el-tag v-if="planBoxCount" size="small" effect="plain">
                  {{ t("metrics.boxProgress", { current: currentBoxNumber, total: planBoxCount }) }}
                </el-tag>
                <el-tag v-if="planAverageFillPercent > 0" size="small" type="primary" effect="light">
                  {{ t("metrics.planAverageUtilization", { value: planAverageFillPercent.toFixed(1) }) }}
                </el-tag>
                <el-tag size="small" effect="plain">{{ viewMode === "3d" ? tr("3D装箱") : tr("2D视角") }}</el-tag>
              </div>
            </div>
          </template>
          <div class="stats-grid compact">
            <div>
              <span>{{ t("metrics.currentBoxPieces") }}</span>
              <b>{{ sceneData.stats.totalPieces }}</b>
            </div>
            <div>
              <span>{{ t("metrics.currentBoxVolume") }}</span>
              <b>{{ sceneData.stats.totalVolumeM3.toFixed(2) }} m³</b>
            </div>
            <div>
              <span>{{ t(currentBoxUtilizationLabel) }}</span>
              <b>{{ sceneData.stats.utilizationPercent.toFixed(1) }}%</b>
              <small v-if="sceneData.stats.lengthUtilizationPercent">{{ t("metrics.lengthPercent", { value: sceneData.stats.lengthUtilizationPercent.toFixed(1) }) }}</small>
            </div>
            <div>
              <span>{{ t("metrics.currentBoxWeight") }}</span>
              <b>{{ formatWeight(sceneData.stats.totalWeightKg) }}</b>
            </div>
          </div>
          <p v-if="planBoxCount > 1" class="current-box-plan-hint">
            {{ t("metrics.currentBoxPlanHint", {
              current: currentBoxNumber,
              total: planBoxCount,
              value: planAverageFillPercent.toFixed(1)
            }) }}
          </p>
          <el-alert
            v-if="sceneData.stats.performanceMode"
            class="visual-performance-alert"
            type="warning"
            :title="tr('已启用流畅模式')"
            :description="tr('货物超过100件，系统自动关闭标签与热力特效。')"
            show-icon
            :closable="false"
          />
        </el-card>
      </aside>
    </div>

    <slot name="box-switch"></slot>

    <el-card class="packing-bottom-actions" shadow="never">
      <div>
        <el-tag :type="balanceState.tagType" effect="light">{{ tr(balanceState.label) }}</el-tag>
        <span>{{ tr("左键旋转 · 右键平移 · 滚轮缩放") }}</span>
      </div>
      <div class="bottom-button-group">
        <el-button :icon="Picture" :disabled="exportDisabled" :loading="exporting" @click="$emit('export-image')">{{ tr("导出可视化截图") }}</el-button>
        <el-button :icon="Document" :disabled="exportDisabled" :loading="exporting" @click="$emit('export-pdf')">{{ tr("导出装箱方案 PDF") }}</el-button>
        <el-button type="primary" :icon="Download" :disabled="zipDisabled" :loading="exporting" @click="$emit('export-zip')">{{ tr(exportZipLabel) }}</el-button>
        <el-button :icon="Printer" @click="$emit('print')">{{ tr("打印") }}</el-button>
      </div>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  Aim,
  Document,
  Download,
  FullScreen,
  Picture,
  Printer,
  Refresh,
  Setting
} from "@element-plus/icons-vue";
import { buildPackingSceneData, formatDimension, formatSigned, formatWeight } from "../visualization/packingSceneData";
import { resolveBalanceState } from "../visualization/packingSceneBalance";
import { PackingSceneRenderer } from "../visualization/packingSceneRenderer";
import type { SceneCargo, SceneViewMode, SceneViewPreset, SliceAxis } from "../visualization/packingSceneTypes";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import SystemWaitOverlay from "./SystemWaitOverlay.vue";

const props = defineProps({
  container: { type: Object, default: null },
  placements: { type: Array, default: () => [] },
  evaluation: { type: Object, default: null },
  selectedBox: { type: Object, default: null },
  balanceValidation: { type: Object, default: null },
  showRemaining: { type: Boolean, default: true },
  showMassBalance: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  waitingForResult: { type: Boolean, default: false },
  exporting: { type: Boolean, default: false },
  exportZipLabel: { type: String, default: "导出整套 ZIP" },
  canExport: { type: Boolean, default: true },
  canExportZip: { type: Boolean, default: true },
  errorMessage: { type: String, default: "" }
});

const emit = defineEmits([
  "update:showRemaining",
  "update:showMassBalance",
  "render-state",
  "export-image",
  "export-pdf",
  "export-zip",
  "print"
]);

const shellRef = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const controller = ref<PackingSceneRenderer | null>(null);
const activeView = ref<SceneViewPreset>("iso");
const viewMode = ref<SceneViewMode>("3d");
const sliceEnabled = ref(false);
const sliceAxis = ref<SliceAxis>("z");
const slicePercent = ref(100);
const showLabels = ref(false);
const showAxes = ref(true);
const showGrid = ref(true);
const showCenter = ref(true);
const showShell = ref(true);
const showClearanceEnvelope = ref(true);
const translucentCargo = ref(false);
const showHeatmap = ref(false);
const axisScalePreset = ref<"small" | "normal" | "large">("normal");
const hiddenSkuKeys = ref<Set<string>>(new Set());
const isFullscreen = ref(false);
const internalRendering = ref(false);
const tooltip = reactive<{ visible: boolean; x: number; y: number; item: SceneCargo }>({
  visible: false,
  x: 0,
  y: 0,
  item: {} as SceneCargo
});
let renderFrame = 0;
let renderDoneFrame = 0;

const viewModeOptions = [
  { label: "3D", value: "3d" },
  { label: "2D", value: "2d" }
];
const axisScaleOptions = computed(() => [
  { label: t("sceneOptions.axisSmall"), value: "small" },
  { label: t("sceneOptions.axisNormal"), value: "normal" },
  { label: t("sceneOptions.axisLarge"), value: "large" }
]);

function tr(value: unknown) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

const sceneData = computed(() => buildPackingSceneData({
  container: props.container as any,
  placements: props.placements as any[],
  evaluation: props.evaluation
}));
const planBoxCount = computed(() => Math.max(
  Number(props.evaluation?.boxes || 0),
  Array.isArray(props.evaluation?.packedBoxes) ? props.evaluation.packedBoxes.length : 0
));
const currentBoxNumber = computed(() => Math.max(1, Number(props.selectedBox?.index || 1)));
const planAverageFillPercent = computed(() => {
  const candidates = [
    props.evaluation?.recommendation?.averageFillPercent,
    props.evaluation?.averageFillPercent,
    props.evaluation?.firstBoxFillPercent
  ];
  const value = candidates.map(Number).find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return value ?? 0;
});
const currentBoxUtilizationLabel = computed(() => sceneData.value.stats.utilizationLabel === "metrics.deckUtilization"
  ? "metrics.currentBoxDeckUtilization"
  : "metrics.currentBoxSpaceUtilization");
const balanceState = computed(() => resolveBalanceState({
  container: props.container as any,
  placements: props.placements as any[],
  validation: props.balanceValidation || props.selectedBox?.balanceValidation
}));
const remainingModel = computed({
  get: () => props.showRemaining,
  set: (value: boolean) => emit("update:showRemaining", value)
});
const massModel = computed({
  get: () => props.showMassBalance,
  set: (value: boolean) => emit("update:showMassBalance", value)
});
const renderOptions = computed(() => ({
  showLabels: showLabels.value && !sceneData.value.stats.performanceMode,
  showAxes: showAxes.value,
  axisScale: axisScaleValue(axisScalePreset.value),
  showGrid: showGrid.value,
  showCenter: showCenter.value,
  showShell: showShell.value,
  showClearanceEnvelope: showClearanceEnvelope.value,
  translucentCargo: translucentCargo.value,
  showHeatmap: showHeatmap.value && !sceneData.value.stats.performanceMode,
  showRemaining: props.showRemaining,
  showMassBalance: props.showMassBalance,
  sliceAxis: sliceEnabled.value ? sliceAxis.value : "none",
  slicePercent: slicePercent.value,
  hiddenSkuKeys: hiddenSkuKeys.value,
  viewMode: viewMode.value,
  locale: currentLocale.value
}));
const visualBusy = computed(() => props.busy || props.waitingForResult || internalRendering.value);
const emptyStateVisible = computed(() => !visualBusy.value && (!props.container || !props.placements.length || props.errorMessage));
const emptyStateText = computed(() => tr(props.errorMessage || (!props.container ? "请选择箱型后查看3D装箱视图" : "当前货舱暂无可渲染货物")));
const visualBusyText = computed(() => props.waitingForResult
  ? "\u6b63\u5728\u7b49\u5f85\u88c5\u7bb1\u7ed3\u679c\uff0c\u968f\u540e\u751f\u6210 3D \u88c5\u7bb1\u89c6\u56fe..."
  : props.busy
  ? "\u6b63\u5728\u5207\u6362\u5f53\u524d\u8d27\u8231..."
  : "\u6b63\u5728\u751f\u6210 3D \u88c5\u7bb1\u89c6\u56fe..."
);
const exportDisabled = computed(() => props.exporting || !props.canExport || !props.placements.length);
const zipDisabled = computed(() => props.exporting || !props.canExportZip);
const frontPercent = computed(() => Number(balanceState.value.loads.frontPercent || 0));
const rearPercent = computed(() => Number(balanceState.value.loads.rearPercent || 0));
const leftPercent = computed(() => Number(balanceState.value.loads.leftPercent || 0));
const rightPercent = computed(() => Number(balanceState.value.loads.rightPercent || 0));
const sliceLabel = computed(() => {
  const container: any = sceneData.value.container;
  if (!container) return `${slicePercent.value}%`;
  if (sliceAxis.value === "z") return `${tr("高度")} ${Math.round(container.heightCm * slicePercent.value / 100)} cm`;
  if (sliceAxis.value === "x") return `${tr("前后")} ${Math.round(container.lengthCm * slicePercent.value / 100)} cm`;
  return `${tr("左右")} ${Math.round(container.widthCm * slicePercent.value / 100)} cm`;
});

onMounted(async () => {
  await nextTick();
  if (!canvasHost.value) return;
  controller.value = new PackingSceneRenderer(canvasHost.value, {
    onHover: (payload) => {
      if (!payload) {
        tooltip.visible = false;
        return;
      }
      tooltip.visible = true;
      tooltip.x = payload.clientX + 14;
      tooltip.y = payload.clientY + 14;
      tooltip.item = payload.item;
    }
  });
  scheduleSceneUpdate();
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  cancelScheduledSceneUpdate();
  setInternalRendering(false);
  controller.value?.dispose();
});

watch([sceneData, balanceState, renderOptions], scheduleSceneUpdate, { deep: true });
watch(viewMode, (mode) => {
  if (mode === "2d") setView(activeView.value === "iso" ? "top" : activeView.value);
  else setView("iso");
});
watch(() => sceneData.value.legend.map((item) => item.key).join("|"), () => {
  const allowed = new Set(sceneData.value.legend.map((item) => item.key));
  hiddenSkuKeys.value = new Set([...hiddenSkuKeys.value].filter((key) => allowed.has(key)));
});

function scheduleSceneUpdate() {
  if (!controller.value) return;
  cancelScheduledSceneUpdate();
  setInternalRendering(true);
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0;
    updateScene();
    renderDoneFrame = window.requestAnimationFrame(() => {
      renderDoneFrame = 0;
      setInternalRendering(false);
    });
  });
}

function cancelScheduledSceneUpdate() {
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }
  if (renderDoneFrame) {
    window.cancelAnimationFrame(renderDoneFrame);
    renderDoneFrame = 0;
  }
}

function setInternalRendering(value: boolean) {
  if (internalRendering.value === value) return;
  internalRendering.value = value;
  emit("render-state", value);
}

function updateScene() {
  controller.value?.update(sceneData.value, balanceState.value, renderOptions.value);
}

function setView(view: SceneViewPreset) {
  activeView.value = view;
  controller.value?.setView(view);
}

function toggleSku(key: string) {
  const next = new Set(hiddenSkuKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hiddenSkuKeys.value = next;
  tooltip.visible = false;
}

function showAllSku() {
  hiddenSkuKeys.value = new Set();
}

function axisScaleValue(preset: "small" | "normal" | "large") {
  if (preset === "small") return 0.85;
  if (preset === "large") return 1.55;
  return 1.25;
}

function handlePointerMove(event: PointerEvent) {
  controller.value?.handlePointerMove(event);
}

function handlePointerLeave() {
  controller.value?.handlePointerLeave();
}

async function toggleFullscreen() {
  if (!shellRef.value) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await shellRef.value.requestFullscreen();
  }
  window.setTimeout(() => controller.value?.resize(), 80);
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement === shellRef.value);
  window.setTimeout(() => controller.value?.resize(), 80);
}
</script>
