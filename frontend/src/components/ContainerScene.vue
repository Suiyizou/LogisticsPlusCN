<template>
  <section
    ref="shellRef"
    data-i18n-ignore
    class="packing-visual-shell"
    :class="{ fullscreen: isFullscreen }"
  >
    <div class="packing-visual-layout" :class="{ 'analysis-open': analysisOpen }">
      <div class="packing-main-stage">
        <el-card class="packing-visual-toolbar" shadow="never">
          <div class="toolbar-left">
            <el-button :icon="Refresh" @click="setView('iso')">{{ tr("视角复位") }}</el-button>
            <el-segmented v-model="viewMode" :options="viewModeOptions" size="default" />
            <el-button-group>
              <el-button
                :type="activeView === 'front' ? 'primary' : 'default'"
                @click="setView('front')"
                >{{ t("sceneOptions.viewFront") }}</el-button
              >
              <el-button
                :type="activeView === 'side' ? 'primary' : 'default'"
                @click="setView('side')"
                >{{ t("sceneOptions.viewSide") }}</el-button
              >
              <el-button
                :type="activeView === 'top' ? 'primary' : 'default'"
                @click="setView('top')"
                >{{ t("sceneOptions.viewTop") }}</el-button
              >
              <el-button
                :type="activeView === 'iso' ? 'primary' : 'default'"
                @click="setView('iso')"
                >{{ t("sceneOptions.viewIso") }}</el-button
              >
            </el-button-group>
          </div>
          <div class="toolbar-right">
            <el-button
              :icon="DataAnalysis"
              :type="analysisOpen ? 'primary' : 'default'"
              :aria-expanded="analysisOpen"
              @click="analysisOpen = !analysisOpen"
              >{{ wt("analysisPanel") }}</el-button
            >
            <el-switch
              v-model="sliceEnabled"
              :active-text="wt('sliceLabel')"
              :aria-label="wt('sliceLabel')"
            />
            <el-popover
              placement="bottom-end"
              trigger="click"
              width="360"
              popper-class="visual-options-popper"
            >
              <template #reference>
                <el-button :icon="Setting">{{ tr("显示选项") }}</el-button>
              </template>
              <div class="visual-option-grid">
                <el-checkbox v-model="showLabels">{{ tr("货号标签") }}</el-checkbox>
                <el-checkbox v-model="remainingModel">{{ tr("剩余空间") }}</el-checkbox>
                <el-checkbox v-model="showRemainingLabels" :disabled="!remainingModel">{{
                  t("sceneOptions.remainingBlockLabels")
                }}</el-checkbox>
                <el-checkbox v-model="massModel">{{ tr("重心偏载") }}</el-checkbox>
                <el-checkbox v-model="showGrid">{{ tr("底部网格") }}</el-checkbox>
                <el-checkbox v-model="showShell">{{ tr("箱体外壳") }}</el-checkbox>
                <el-checkbox v-model="showCenter">{{ tr("几何中心") }}</el-checkbox>
                <el-checkbox v-model="translucentCargo">{{ tr("半透明货物") }}</el-checkbox>
                <el-checkbox v-model="showHeatmap">{{ tr("重量热力") }}</el-checkbox>
                <el-checkbox v-model="showClearanceEnvelope">{{
                  t("sceneOptions.clearanceEnvelope")
                }}</el-checkbox>
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
                <div v-if="remainingModel" class="remaining-option-note">
                  <strong>{{ t("sceneOptions.remainingDisplayTitle") }}</strong>
                  <span>{{ t("sceneOptions.remainingDisplayHint") }}</span>
                </div>
              </div>
            </el-popover>
            <el-button :icon="isFullscreen ? Aim : FullScreen" @click="toggleFullscreen">
              {{ isFullscreen ? tr("退出全屏") : tr("全屏") }}
            </el-button>
          </div> </el-card
        ><Transition name="workspace-state"
          ><el-card v-if="sliceEnabled" class="slice-control-card" shadow="never">
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
          </el-card></Transition
        >
        <div
          class="packing-canvas-panel"
          @pointermove="handlePointerMove"
          @pointerleave="handlePointerLeave"
        >
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
          <div
            v-if="tooltip.visible"
            class="scene-tooltip visual-tooltip"
            :class="{ 'remaining-space-tooltip': tooltip.item.kind === 'remaining-space' }"
            :style="tooltipStyle"
          >
            <template v-if="tooltip.item.kind === 'remaining-space'">
              <div class="tooltip-title-row">
                <strong
                  >{{ tooltip.item.label }} · {{ t("sceneOptions.remainingBlockName") }}</strong
                >
                <el-tag size="small" type="primary" effect="light">{{
                  t("sceneOptions.geometricClearance")
                }}</el-tag>
              </div>
              <span class="tooltip-primary-metric">{{ formatVolume(tooltip.item.volumeM3) }}</span>
              <span
                >{{ t("sceneOptions.blockDimensions") }}
                {{ formatDimension(tooltip.item.lengthCm) }} ×
                {{ formatDimension(tooltip.item.widthCm) }} ×
                {{ formatDimension(tooltip.item.heightCm) }} cm</span
              >
              <span>{{
                t("sceneOptions.blockCoordinateRanges", {
                  x1: formatDimension(tooltip.item.xCm),
                  x2: formatDimension(
                    tooltip.item.x2Cm ?? tooltip.item.xCm + tooltip.item.lengthCm
                  ),
                  y1: formatDimension(tooltip.item.yCm),
                  y2: formatDimension(tooltip.item.y2Cm ?? tooltip.item.yCm + tooltip.item.widthCm),
                  z1: formatDimension(tooltip.item.zCm),
                  z2: formatDimension(tooltip.item.z2Cm ?? tooltip.item.zCm + tooltip.item.heightCm)
                })
              }}</span>
              <span>{{
                t("sceneOptions.blockFreeShare", {
                  value: formatPercent(tooltip.item.percentOfFree)
                })
              }}</span>
            </template>
            <template v-else>
              <strong>#{{ tooltip.item.displayNo }} {{ tooltip.item.name }}</strong>
              <span
                >{{ t("sceneOptions.physicalOuterSize") }}
                {{ formatDimension(tooltip.item.physicalLengthCm) }} ×
                {{ formatDimension(tooltip.item.physicalWidthCm) }} ×
                {{ formatDimension(tooltip.item.physicalHeightCm) }} cm</span
              >
              <span v-if="tooltip.item.hasClearance"
                >{{ t("sceneOptions.reservedEnvelopeSize") }}
                {{ formatDimension(tooltip.item.lengthCm) }} ×
                {{ formatDimension(tooltip.item.widthCm) }} ×
                {{ formatDimension(tooltip.item.heightCm) }} cm</span
              >
              <span v-if="tooltip.item.horizontalGapCm > 0">{{
                t("sceneOptions.horizontalGapDetail", {
                  gap: formatDimension(tooltip.item.horizontalGapCm),
                  side: formatDimension(tooltip.item.clearancePerSideCm)
                })
              }}</span>
              <span
                >{{ wt("quantity") }} {{ tooltip.item.quantity }} {{ wt("pieces") }} ·
                {{ wt("weight") }} {{ formatWeight(tooltip.item.weightKg) }}</span
              >
              <span class="tooltip-constraint-tags">
                <el-tag
                  size="small"
                  :type="tooltip.item.nonStack ? 'warning' : 'success'"
                  effect="light"
                >
                  {{
                    t(
                      tooltip.item.nonStack
                        ? "sceneOptions.nonStackable"
                        : "sceneOptions.loadBearing"
                    )
                  }}
                </el-tag>
                <el-tag v-if="tooltip.item.keepUpright" size="small" type="primary" effect="plain">
                  {{ t("sceneOptions.keepUpright") }}
                </el-tag>
              </span>
              <span>{{
                tr(
                  tooltip.item.orientationLabel ||
                    tooltip.item.bottomFaceDetail ||
                    wt("algorithmCoordinates")
                )
              }}</span>
              <span
                >{{ t("sceneOptions.physicalCoordinates") }} X{{
                  formatDimension(tooltip.item.physicalXCm)
                }}
                / Y{{ formatDimension(tooltip.item.physicalYCm) }} / Z{{
                  formatDimension(tooltip.item.physicalZCm)
                }}
                cm</span
              >
              <span v-if="tooltip.item.hasClearance"
                >{{ t("sceneOptions.reservedCoordinates") }} X{{
                  formatDimension(tooltip.item.xCm)
                }}
                / Y{{ formatDimension(tooltip.item.yCm) }} / Z{{
                  formatDimension(tooltip.item.zCm)
                }}
                cm</span
              >
            </template>
          </div>
        </div>
        <slot name="box-switch"></slot
        ><el-card class="packing-bottom-actions" shadow="never">
          <div>
            <el-tag :type="balanceState.tagType" effect="light">{{
              tr(balanceState.label)
            }}</el-tag>
            <span>{{ tr("左键旋转 · 右键平移 · 滚轮缩放") }}</span>
          </div>
          <div class="bottom-button-group">
            <el-button
              :icon="Picture"
              :disabled="exportDisabled"
              :loading="exporting"
              @click="$emit('export-image')"
              >{{ wt("exportImage") }}</el-button
            >
            <el-button
              :icon="Document"
              :disabled="exportDisabled"
              :loading="exporting"
              @click="$emit('export-pdf')"
              >{{ wt("exportPlanPdf") }}</el-button
            >
            <el-button
              :icon="DataAnalysis"
              :disabled="exportDisabled"
              :loading="exporting"
              @click="$emit('export-remaining-pdf')"
              >{{ t("sceneOptions.exportRemainingReport") }}</el-button
            >
            <el-button
              type="primary"
              :icon="Download"
              :disabled="zipDisabled"
              :loading="exporting"
              @click="$emit('export-zip')"
              >{{ tr(exportZipLabel) }}</el-button
            >
            <el-button :icon="Printer" @click="$emit('print')">{{ tr("打印") }}</el-button>
          </div>
        </el-card>
      </div>
      <aside v-show="analysisOpen" class="packing-info-panel">
        <el-card class="info-panel-card legend-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>{{ tr("货物图例") }}</strong>
              <el-button v-if="hiddenSkuKeys.size" link type="primary" @click="showAllSku">{{
                wt("showAll")
              }}</el-button>
            </div>
          </template>
          <el-scrollbar class="legend-scrollbar" max-height="220">
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
                <small
                  >{{ item.quantity }} {{ wt("pieces") }} · {{ formatWeight(item.weightKg) }}</small
                >
                <span class="legend-constraint-tags">
                  <el-tag
                    class="legend-constraint-tag"
                    size="small"
                    :type="item.nonStack ? 'warning' : 'success'"
                    effect="light"
                  >
                    {{
                      t(item.nonStack ? "sceneOptions.nonStackable" : "sceneOptions.loadBearing")
                    }}
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
          </el-scrollbar> </el-card
        ><el-card class="info-panel-card scene-balance-card" shadow="never"
          ><template #header>
            <div class="info-card-head">
              <strong>{{ tr("偏载重心") }}</strong>
              <el-tag :type="balanceState.tagType" effect="light">{{
                tr(balanceState.label)
              }}</el-tag>
            </div>
          </template>
          <div class="balance-overview-layout">
            <svg
              class="center-offset-map"
              viewBox="0 0 180 150"
              role="img"
              :aria-label="wt('balanceDiagram')"
            >
              <path d="M22 75h136M90 12v126" stroke="var(--color-border-strong)" />
              <path
                d="M45 35h90v80H45z"
                fill="none"
                stroke="var(--color-border)"
                stroke-dasharray="3 4"
              />
              <circle cx="90" cy="75" r="3" fill="var(--color-muted)" />
              <circle
                :cx="
                  90 +
                  Math.max(
                    -62,
                    Math.min(
                      62,
                      Number(
                        balanceState.offset.longitudinalPercent ?? balanceState.offset.xPercent ?? 0
                      ) * 2
                    )
                  )
                "
                :cy="
                  75 -
                  Math.max(
                    -56,
                    Math.min(
                      56,
                      Number(
                        balanceState.offset.lateralPercent ?? balanceState.offset.yPercent ?? 0
                      ) * 2
                    )
                  )
                "
                r="5"
                fill="var(--color-accent)"
              />
              <text x="144" y="91">X</text>
              <text x="97" y="22">Y</text>
              <text x="10" y="91">−</text>
              <text x="94" y="142">−</text>
            </svg>
            <div class="balance-metric-list">
              <span>{{ tr("重心坐标") }}</span>
              <b
                >X {{ balanceState.center.xCm.toFixed(1) }} / Y
                {{ balanceState.center.yCm.toFixed(1) }} / Z
                {{ balanceState.center.zCm.toFixed(1) }} cm</b
              >
              <span>{{ tr("横向偏移 Y") }}</span>
              <b
                >{{ formatSigned(balanceState.offset.lateralCm ?? balanceState.offset.yCm) }} cm /
                {{
                  formatSigned(balanceState.offset.lateralPercent ?? balanceState.offset.yPercent)
                }}%</b
              >
              <span>{{ tr("纵向偏移 X") }}</span>
              <b
                >{{ formatSigned(balanceState.offset.longitudinalCm ?? balanceState.offset.xCm) }}
                cm /
                {{
                  formatSigned(
                    balanceState.offset.longitudinalPercent ?? balanceState.offset.xPercent
                  )
                }}%</b
              >
              <span>{{ tr("重心高度") }}</span>
              <b>{{ balanceState.center.zCm.toFixed(1) }} cm</b>
            </div>
          </div>
          <details class="balance-more">
            <summary>{{ wt("balanceDetails") }}</summary>
            <p>{{ tr(balanceState.description) }}</p>
            <div class="balance-zone-bars" v-if="balanceState.valid">
              <div>
                <span>{{ tr("前 / 后") }}</span>
                <el-progress :percentage="frontPercent" :stroke-width="10" :show-text="false" />
                <small
                  >{{ wt("front") }} {{ frontPercent.toFixed(1) }}% · {{ wt("rear") }}
                  {{ rearPercent.toFixed(1) }}%</small
                >
              </div>
              <div>
                <span>{{ tr("左 / 右") }}</span>
                <el-progress :percentage="leftPercent" :stroke-width="10" :show-text="false" />
                <small
                  >{{ wt("left") }} {{ leftPercent.toFixed(1) }}% · {{ wt("right") }}
                  {{ rightPercent.toFixed(1) }}%</small
                >
              </div>
            </div>
          </details></el-card
        >
        <details class="scene-more">
          <summary>{{ wt("sceneMore") }}</summary>
          <el-card
            v-if="remainingModel && remainingAnalysis?.conservationOk"
            class="info-panel-card remaining-analysis-card"
            shadow="never"
          >
            <template #header>
              <div class="info-card-head">
                <strong>{{ t("sceneOptions.remainingAnalysisTitle") }}</strong>
                <el-tag type="primary" effect="light">
                  {{
                    t("sceneOptions.remainingBlockCount", {
                      count: remainingAnalysis.fragmentCount
                    })
                  }}
                </el-tag>
              </div>
            </template>
            <div class="remaining-summary-grid">
              <div>
                <span>{{ t("sceneOptions.geometricClearanceVolume") }}</span>
                <b>{{ formatVolume(remainingAnalysis.usableFreeVolumeM3) }}</b>
              </div>
              <div>
                <span>{{ t("sceneOptions.remainingRatio") }}</span>
                <b>{{ formatPercent(remainingAnalysis.freeRatio * 100) }}%</b>
              </div>
              <div>
                <span>{{ t("sceneOptions.largestBlock") }}</span>
                <b>{{ formatVolume(remainingTopBlocks[0]?.volumeM3 || 0) }}</b>
              </div>
              <div>
                <span>{{ t("sceneOptions.envelopeAllowance") }}</span>
                <b>{{ formatVolume(remainingAnalysis.reservedEnvelopeVolumeM3) }}</b>
              </div>
            </div>
            <div
              class="remaining-view-shortcuts"
              role="group"
              :aria-label="t('sceneOptions.remainingViewShortcuts')"
            >
              <span>{{ t("sceneOptions.remainingViewShortcuts") }}</span>
              <div class="remaining-view-button-grid">
                <el-button
                  size="small"
                  :type="activeView === 'iso' ? 'primary' : 'default'"
                  @click="setView('iso')"
                  >{{ t("sceneOptions.viewIso") }}</el-button
                >
                <el-button
                  size="small"
                  :type="activeView === 'top' ? 'primary' : 'default'"
                  @click="setView('top')"
                  >{{ t("sceneOptions.viewTop") }}</el-button
                >
                <el-button
                  size="small"
                  :type="activeView === 'front' ? 'primary' : 'default'"
                  @click="setView('front')"
                  >{{ t("sceneOptions.viewFront") }}</el-button
                >
                <el-button
                  size="small"
                  :type="activeView === 'side' ? 'primary' : 'default'"
                  @click="setView('side')"
                  >{{ t("sceneOptions.viewSide") }}</el-button
                >
              </div>
            </div>
            <div class="remaining-block-list" :aria-label="t('sceneOptions.majorRemainingBlocks')">
              <div v-for="block in remainingTopBlocks" :key="block.id" class="remaining-block-row">
                <i :style="{ backgroundColor: block.color }"></i>
                <span>
                  <strong>{{ block.label }}</strong>
                  <small
                    >{{ formatDimension(block.lengthCm) }} × {{ formatDimension(block.widthCm) }} ×
                    {{ formatDimension(block.heightCm) }} cm</small
                  >
                </span>
                <b>{{ formatVolume(block.volumeM3) }}</b>
              </div>
            </div>
            <p class="remaining-analysis-note">
              {{ t("sceneOptions.remainingAnalysisNote") }}
            </p> </el-card
          ><el-card class="info-panel-card" shadow="never">
            <template #header>
              <div class="info-card-head">
                <strong>{{ tr(sceneData.container?.name || "未选择箱型") }}</strong>
                <div class="scene-plan-tags">
                  <el-tag v-if="planBoxCount" size="small" effect="plain">
                    {{
                      t("metrics.boxProgress", { current: currentBoxNumber, total: planBoxCount })
                    }}
                  </el-tag>
                  <el-tag
                    v-if="planAverageFillPercent > 0"
                    size="small"
                    type="primary"
                    effect="light"
                  >
                    {{
                      t("metrics.planAverageUtilization", {
                        value: planAverageFillPercent.toFixed(1)
                      })
                    }}
                  </el-tag>
                  <el-tag size="small" effect="plain">{{
                    viewMode === "3d" ? wt("view3d") : wt("view2d")
                  }}</el-tag>
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
                <small v-if="sceneData.stats.lengthUtilizationPercent">{{
                  t("metrics.lengthPercent", {
                    value: sceneData.stats.lengthUtilizationPercent.toFixed(1)
                  })
                }}</small>
              </div>
              <div>
                <span>{{ t("metrics.currentBoxWeight") }}</span>
                <b>{{ formatWeight(sceneData.stats.totalWeightKg) }}</b>
              </div>
            </div>
            <p v-if="planBoxCount > 1" class="current-box-plan-hint">
              {{
                t("metrics.currentBoxPlanHint", {
                  current: currentBoxNumber,
                  total: planBoxCount,
                  value: planAverageFillPercent.toFixed(1)
                })
              }}
            </p>
            <p v-if="nonStackFallbackVisible" class="nonstack-fallback-hint">
              {{ t("metrics.nonStackFallbackHint") }}
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
        </details>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { wt } from "./workspace/workspaceCopy";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  Aim,
  DataAnalysis,
  Document,
  Download,
  FullScreen,
  Picture,
  Printer,
  Refresh,
  Setting
} from "@element-plus/icons-vue";
import {
  buildPackingSceneData,
  formatDimension,
  formatSigned,
  formatWeight
} from "../visualization/packingSceneData";
import { resolveBalanceState } from "../visualization/packingSceneBalance";
import { PackingSceneRenderer } from "../visualization/packingSceneRenderer";
import type {
  SceneHoverItem,
  SceneRemainingBlock,
  SceneViewMode,
  SceneViewPreset,
  SliceAxis
} from "../visualization/packingSceneTypes";
import { analyzeRemainingSpace } from "../utils/remainingSpace";
import { currentLocale, t } from "../i18n";
import { readScenePreferences, saveScenePreferences } from "./workspace/plannerPreferences";
import { translateLegacyText } from "../i18n/legacyText";
import SystemWaitOverlay from "./SystemWaitOverlay.vue";

const props = defineProps({
  container: { type: Object, default: null },
  placements: { type: Array, default: () => [] },
  evaluation: { type: Object, default: null },
  selectedBox: { type: Object, default: null },
  balanceValidation: { type: Object, default: null },
  showRemaining: { type: Boolean, default: false },
  showMassBalance: { type: Boolean, default: false },
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
  "export-remaining-pdf",
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
const savedScenePreferences = readScenePreferences();
const analysisOpen = ref(savedScenePreferences.analysisOpen);
const showLabels = ref(savedScenePreferences.showLabels);
const showAxes = ref(savedScenePreferences.showAxes);
const showGrid = ref(savedScenePreferences.showGrid);
const showCenter = ref(savedScenePreferences.showCenter);
const showShell = ref(savedScenePreferences.showShell);
const showClearanceEnvelope = ref(savedScenePreferences.showClearanceEnvelope);
const showRemainingLabels = ref(savedScenePreferences.showRemainingLabels);
const translucentCargo = ref(savedScenePreferences.translucentCargo);
const showHeatmap = ref(savedScenePreferences.showHeatmap);
const axisScalePreset = ref<"small" | "normal" | "large">("normal");
const hiddenSkuKeys = ref<Set<string>>(new Set());
const isFullscreen = ref(false);
const internalRendering = ref(false);
const tooltip = reactive<{ visible: boolean; x: number; y: number; item: SceneHoverItem }>({
  visible: false,
  x: 0,
  y: 0,
  item: {} as SceneHoverItem
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
const remainingBlockColors = [
  "#0284c7",
  "#0f9f93",
  "#7c3aed",
  "#d97706",
  "#4f46e5",
  "#0891b2",
  "#65a30d",
  "#ea580c",
  "#9333ea",
  "#475569"
];

function tr(value: unknown) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

const sceneData = computed(() =>
  buildPackingSceneData({
    container: props.container as any,
    placements: props.placements as any[],
    evaluation: props.evaluation
  })
);
const remainingAnalysis = computed<any | null>(() => {
  if (!props.container || !(props.placements as any[]).length) return null;
  try {
    return analyzeRemainingSpace(props.container, props.placements as any[], {
      maxDisplayBlocks: 10,
      strict: false
    });
  } catch (error) {
    console.warn("Remaining-space visualization was skipped.", error);
    return null;
  }
});
const sceneRemainingBlocks = computed<SceneRemainingBlock[]>(() =>
  (remainingAnalysis.value?.blocks || []).slice(0, 80).map((block: any, index: number) => ({
    ...block,
    kind: "remaining-space" as const,
    id: block.id || `R${index + 1}`,
    label: `R${index + 1}`,
    displayNo: `R${index + 1}`,
    name: t("sceneOptions.remainingBlockName"),
    color: remainingBlockColors[index % remainingBlockColors.length]
  }))
);
const remainingTopBlocks = computed(() => sceneRemainingBlocks.value.slice(0, 6));
const planBoxCount = computed(() =>
  Math.max(
    Number(props.evaluation?.boxes || 0),
    Array.isArray(props.evaluation?.packedBoxes) ? props.evaluation.packedBoxes.length : 0
  )
);
const currentBoxNumber = computed(() => Math.max(1, Number(props.selectedBox?.index || 1)));
const planAverageFillPercent = computed(() => {
  const candidates = [
    props.evaluation?.recommendation?.averageFillPercent,
    props.evaluation?.averageFillPercent,
    props.evaluation?.firstBoxFillPercent
  ];
  const value = candidates
    .map(Number)
    .find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return value ?? 0;
});
const currentBoxUtilizationLabel = computed(() =>
  sceneData.value.stats.utilizationLabel === "metrics.deckUtilization"
    ? "metrics.currentBoxDeckUtilization"
    : "metrics.currentBoxSpaceUtilization"
);
const nonStackFallbackVisible = computed(
  () =>
    Number(props.selectedBox?.strategySummary?.nonStackFallbackRequired || 0) > 0 &&
    (props.placements as any[]).some((placement) => Boolean(placement?.nonStack))
);
const balanceState = computed(() =>
  resolveBalanceState({
    container: props.container as any,
    placements: props.placements as any[],
    validation: props.balanceValidation || props.selectedBox?.balanceValidation
  })
);
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
  showRemainingLabels: showRemainingLabels.value,
  remainingBlocks: sceneRemainingBlocks.value,
  showMassBalance: props.showMassBalance,
  sliceAxis: sliceEnabled.value ? sliceAxis.value : "none",
  slicePercent: slicePercent.value,
  hiddenSkuKeys: hiddenSkuKeys.value,
  viewMode: viewMode.value,
  locale: currentLocale.value
}));
const visualBusy = computed(() => props.busy || props.waitingForResult || internalRendering.value);
const emptyStateVisible = computed(
  () => !visualBusy.value && (!props.container || !props.placements.length || props.errorMessage)
);
const emptyStateText = computed(() =>
  tr(props.errorMessage || (!props.container ? wt("selectEquipmentToPreview") : wt("emptyHold")))
);
const visualBusyText = computed(() =>
  props.waitingForResult
    ? "\u6b63\u5728\u7b49\u5f85\u88c5\u7bb1\u7ed3\u679c\uff0c\u968f\u540e\u751f\u6210 3D \u88c5\u7bb1\u89c6\u56fe..."
    : props.busy
      ? "\u6b63\u5728\u5207\u6362\u5f53\u524d\u8d27\u8231..."
      : "\u6b63\u5728\u751f\u6210 3D \u88c5\u7bb1\u89c6\u56fe..."
);
const exportDisabled = computed(
  () => props.exporting || !props.canExport || !props.placements.length
);
const zipDisabled = computed(() => props.exporting || !props.canExportZip);
const frontPercent = computed(() => Number(balanceState.value.loads.frontPercent || 0));
const rearPercent = computed(() => Number(balanceState.value.loads.rearPercent || 0));
const leftPercent = computed(() => Number(balanceState.value.loads.leftPercent || 0));
const rightPercent = computed(() => Number(balanceState.value.loads.rightPercent || 0));
const sliceLabel = computed(() => {
  const container: any = sceneData.value.container;
  if (!container) return `${slicePercent.value}%`;
  if (sliceAxis.value === "z")
    return `${wt("height")} ${Math.round((container.heightCm * slicePercent.value) / 100)} cm`;
  if (sliceAxis.value === "x")
    return `${wt("longitudinal")} ${Math.round((container.lengthCm * slicePercent.value) / 100)} cm`;
  return `${wt("lateral")} ${Math.round((container.widthCm * slicePercent.value) / 100)} cm`;
});
const tooltipStyle = computed(() => {
  const hostWidth = canvasHost.value?.clientWidth || 0;
  const hostHeight = canvasHost.value?.clientHeight || 0;
  const tooltipWidth = Math.min(360, Math.max(260, hostWidth - 24));
  const tooltipHeight = tooltip.item?.kind === "remaining-space" ? 178 : 238;
  const maxLeft = Math.max(12, hostWidth - tooltipWidth - 12);
  const maxTop = Math.max(12, hostHeight - tooltipHeight - 12);
  return {
    left: `${Math.max(12, Math.min(tooltip.x, maxLeft))}px`,
    top: `${Math.max(12, Math.min(tooltip.y, maxTop))}px`,
    width: `${tooltipWidth}px`
  };
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
watch(
  [
    showLabels,
    showAxes,
    showGrid,
    showCenter,
    showShell,
    showClearanceEnvelope,
    showRemainingLabels,
    translucentCargo,
    showHeatmap,
    analysisOpen,
    () => props.showRemaining,
    () => props.showMassBalance
  ],
  () => {
    saveScenePreferences({
      showLabels: showLabels.value,
      showAxes: showAxes.value,
      showGrid: showGrid.value,
      showCenter: showCenter.value,
      showShell: showShell.value,
      showClearanceEnvelope: showClearanceEnvelope.value,
      showRemainingLabels: showRemainingLabels.value,
      translucentCargo: translucentCargo.value,
      showHeatmap: showHeatmap.value,
      showRemaining: props.showRemaining,
      showMassBalance: props.showMassBalance,
      analysisOpen: analysisOpen.value
    });
  }
);
watch(viewMode, (mode) => {
  if (mode === "2d") setView(activeView.value === "iso" ? "top" : activeView.value);
  else setView("iso");
});
watch(
  () => sceneData.value.legend.map((item) => item.key).join("|"),
  () => {
    const allowed = new Set(sceneData.value.legend.map((item) => item.key));
    hiddenSkuKeys.value = new Set([...hiddenSkuKeys.value].filter((key) => allowed.has(key)));
  }
);

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

function formatVolume(value: unknown) {
  const amount = Number(value || 0);
  const digits = Math.abs(amount) < 0.01 ? 3 : 2;
  return `${amount.toFixed(digits).replace(/\.?0+$/, "")} m³`;
}

function formatPercent(value: unknown) {
  const amount = Number(value || 0);
  return amount.toFixed(Math.abs(amount) < 10 ? 2 : 1).replace(/\.?0+$/, "");
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

<style scoped>
.packing-visual-shell {
  gap: 18px;
}
.packing-visual-toolbar {
  border-radius: var(--radius-card);
}
.toolbar-left,
.toolbar-right {
  gap: 10px;
  flex-wrap: wrap;
}
.packing-canvas-panel {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  min-height: 420px;
}
.packing-info-panel {
  gap: 18px;
}
.info-panel-card {
  border-radius: var(--radius-card);
}
.info-card-head strong {
  font-size: 16px;
  font-weight: 600;
}
.info-panel-card :deep(.el-card__header) {
  padding: 18px;
}
.info-panel-card :deep(.el-card__body) {
  padding: 18px;
}
.remaining-summary-grid span,
.balance-metric-list span {
  font-size: 12px;
}
.remaining-summary-grid b {
  font-weight: 500;
}
.scene-tooltip {
  max-width: min(380px, calc(100vw - 40px));
  border-radius: var(--radius-control);
  font-size: 13px;
  line-height: 1.65;
}
.packing-bottom-actions {
  border-radius: var(--radius-card);
}
.slice-control-card {
  border-radius: var(--radius-card);
}
:global(.visual-options-popper) {
  max-width: calc(100vw - 32px);
  border-radius: var(--radius-dialog);
  box-shadow: var(--shadow-overlay);
  font-size: 14px;
}
@media (max-width: 760px) {
  .packing-canvas-panel {
    min-height: 320px;
  }
  .packing-scene-canvas {
    min-height: 320px;
  }
  .toolbar-left,
  .toolbar-right {
    width: 100%;
    justify-content: flex-start;
  }
  .toolbar-left > .el-button-group {
    display: flex;
    flex-wrap: wrap;
  }
  .slice-control-row {
    flex-wrap: wrap;
  }
  .slice-control-row > .el-slider {
    flex-basis: 100%;
  }
  .packing-info-panel {
    grid-template-columns: 1fr;
  }
  .bottom-button-group {
    flex-wrap: wrap;
  }
  .bottom-button-group .el-button {
    flex: 1 1 auto;
    margin: 0;
  }
}
</style>

<style scoped>
.packing-visual-shell {
  display: block;
}
.packing-visual-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  align-items: start;
}
.packing-visual-layout.analysis-open {
  grid-template-columns: minmax(0, 72fr) minmax(250px, 28fr);
}
.packing-main-stage {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  background: var(--color-surface);
}
.packing-main-stage > .el-card {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.packing-visual-toolbar :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  padding: 6px 10px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.packing-visual-toolbar :deep(.el-button) {
  height: 30px;
  min-height: 30px;
  padding: 6px 9px;
  font-size: 12px;
}
.packing-visual-toolbar :deep(.el-segmented) {
  min-height: 30px;
  font-size: 12px;
}
.packing-visual-toolbar :deep(.el-switch__label) {
  font-size: 12px;
}
.packing-canvas-panel {
  height: 370px;
  min-height: 370px;
  border: 0;
  border-radius: 0;
  background: var(--color-surface);
}
.packing-scene-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.packing-info-panel {
  display: grid;
  gap: 10px;
  max-height: 464px;
  padding: 0;
  overflow-y: auto;
  grid-template-columns: 1fr;
}
.info-panel-card :deep(.el-card__header) {
  padding: 12px 14px;
  border-bottom: 0;
}
.info-panel-card :deep(.el-card__body) {
  padding: 0 14px 12px;
}
.info-card-head strong {
  font-size: 16px;
}
.legend-scrollbar {
  max-height: 145px;
}
.legend-row {
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 9px;
  padding: 7px 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
}
.legend-row > b,
.legend-row b {
  font-size: 12px;
  font-weight: 500;
}
.legend-row small,
.legend-row em {
  font-size: 12px;
}
.legend-constraint-tags {
  display: none;
}
.legend-row > i {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}
.balance-overview-layout {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.center-offset-map {
  width: 110px;
  height: 150px;
}
.center-offset-map text {
  font-family: var(--font-ui);
  font-size: 12px;
  fill: var(--color-muted);
}
.balance-metric-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
  font-size: 12px;
}
.balance-metric-list b {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}
.balance-metric-list span {
  font-size: 12px;
  color: var(--color-muted);
}
.balance-more {
  font-size: 12px;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
}
.balance-more > summary,
.scene-more > summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--color-secondary);
}
.balance-more > p {
  font-size: 12px;
  line-height: 1.6;
}
.balance-zone-bars {
  gap: 8px;
  margin-top: 10px;
}
.scene-more {
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
.scene-more[open] > summary {
  margin-bottom: 12px;
}
.scene-balance-card {
  position: static;
  min-width: 0;
}
.scene-more > .el-card {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.scene-more .stats-grid {
  font-size: 12px;
}
.packing-bottom-actions :deep(.el-card__body) {
  padding: 8px 10px;
  min-height: 48px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
}
.packing-bottom-actions :deep(.el-card__body) > div:first-child {
  display: none;
}
.bottom-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.bottom-button-group .el-button {
  min-height: 30px;
  height: 30px;
  font-size: 12px;
  margin: 0;
  padding: 6px 9px;
}
.packing-main-stage :deep(.box-switch) {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
  margin: 0;
}
.slice-control-card :deep(.el-card__body) {
  padding: 8px 12px;
}
.fullscreen .packing-visual-layout {
  height: 100%;
}
.fullscreen .packing-info-panel {
  max-height: 100%;
}
.fullscreen .packing-main-stage {
  display: flex;
  flex-direction: column;
}
.fullscreen .packing-canvas-panel {
  flex: 1;
  height: auto;
  min-height: 400px;
}
@media (min-width: 1500px) {
  .packing-info-panel {
    max-height: 504px;
  }
  .packing-canvas-panel {
    height: 410px;
    min-height: 410px;
  }
}
@media (max-width: 1100px) {
  .packing-visual-layout.analysis-open {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
  .packing-visual-toolbar :deep(.el-card__body) {
    flex-wrap: wrap;
  }
  .packing-canvas-panel {
    height: 370px;
    min-height: 370px;
  }
  .balance-overview-layout {
    grid-template-columns: 94px minmax(0, 1fr);
  }
  .center-offset-map {
    width: 94px;
  }
}
@media (max-width: 850px) {
  .packing-visual-layout,
  .packing-visual-layout.analysis-open {
    grid-template-columns: minmax(0, 1fr);
  }
  .packing-info-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 420px;
  }
  .scene-more {
    grid-column: 1/-1;
  }
  .packing-canvas-panel {
    height: 350px;
    min-height: 350px;
  }
}
@media (max-width: 600px) {
  .packing-info-panel {
    grid-template-columns: 1fr;
  }
  .packing-visual-toolbar :deep(.el-button) {
    min-height: 36px;
    height: 36px;
  }
  .toolbar-left,
  .toolbar-right {
    width: 100%;
    gap: 6px;
  }
  .packing-canvas-panel {
    height: 320px;
    min-height: 320px;
  }
  .bottom-button-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .bottom-button-group .el-button {
    width: 100%;
    min-height: 36px;
    white-space: normal;
  }
  .balance-overview-layout {
    grid-template-columns: 130px minmax(0, 1fr);
  }
  .center-offset-map {
    width: 130px;
  }
  .scene-more {
    grid-column: auto;
  }
}
</style>
