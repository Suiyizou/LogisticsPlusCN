<template>
  <section class="algorithm-page">
    <div class="page-title">
      <p>{{ ui('algorithm.eyebrow') }}</p>
      <h2>{{ ui('algorithm.title') }}</h2>
    </div>

    <div class="algorithm-note trace-card">
      <strong>{{ ui('algorithm.whereRuns') }}</strong>
      <p>{{ ui('algorithm.whereRunsText') }}</p>
    </div>

    <div class="algorithm-visual-guide">
      <div class="algorithm-visual-head">
        <p>{{ t("algorithmGuide.eyebrow") }}</p>
        <h3>{{ t("algorithmGuide.title") }}</h3>
      </div>
      <div class="algorithm-guide-lanes">
        <div v-for="lane in guideLanes" :key="lane.step" class="algorithm-guide-lane">
          <span>{{ lane.step }}</span>
          <strong>{{ lane.title }}</strong>
          <p>{{ lane.text }}</p>
        </div>
      </div>
      <div class="algorithm-guide-strategies">
        <article v-for="strategy in guideStrategies" :key="strategy.id">
          <span>{{ strategy.id }}</span>
          <strong>{{ strategy.title }}</strong>
          <p>{{ strategy.text }}</p>
        </article>
      </div>
    </div>

    <div class="algorithm-grid">
      <article>
        <strong>{{ ui('algorithm.step.expand') }}</strong>
        <p>{{ ui('algorithm.step.expandText') }}</p>
      </article>
      <article>
        <strong>{{ ui('algorithm.step.sort') }}</strong>
        <p>{{ ui('algorithm.step.sortText') }}</p>
      </article>
      <article>
        <strong>{{ ui('algorithm.step.rotation') }}</strong>
        <p>{{ ui('algorithm.step.rotationText') }}</p>
      </article>
      <article>
        <strong>{{ ui('algorithm.step.points') }}</strong>
        <p>{{ ui('algorithm.step.pointsText') }}</p>
      </article>
      <article>
        <strong>{{ ui('algorithm.step.support') }}</strong>
        <p>{{ t("planner.supportConstraintNote") }}</p>
      </article>
      <article>
        <strong>{{ ui('algorithm.step.recommend') }}</strong>
        <p>{{ ui('algorithm.step.recommendText') }}</p>
      </article>
    </div>

    <div class="trace-grid">
      <article class="algorithm-note">
        <strong>{{ ui('algorithm.coreFormulas') }}</strong>
        <ul class="formula-list">
          <li v-for="formula in formulas" :key="formula">{{ tr(formula) }}</li>
        </ul>
      </article>

      <article class="algorithm-note">
        <strong>{{ ui('algorithm.currentTrace') }}</strong>
        <div v-if="trace" class="trace-metrics">
          <div><span>{{ ui('algorithm.selectedContainer') }}</span><b>{{ tr(trace.current.containerName) }}</b></div>
          <div><span>{{ ui('algorithm.calculationMode') }}</span><b>{{ tr(trace.mode) }}</b></div>
          <div><span>{{ ui('algorithm.cargoExpansion') }}</span><b>{{ traceUnitCount }} {{ ui('unit.piece') }}</b></div>
          <div><span>{{ ui('algorithm.plannedUtilization') }}</span><b>{{ trace.parameters.utilizationPercent }}%</b></div>
          <div><span>{{ ui('algorithm.horizontalGap') }}</span><b>{{ trace.parameters.globalGapCm }} cm</b></div>
          <div><span>{{ t("planner.supportRatioTrace") }}</span><b>{{ trace.supportRatioPercent }}% / {{ trace.nonStackSupportRatioPercent || 98.5 }}%</b></div>
          <div><span>{{ ui('algorithm.firstBoxStrategy') }}</span><b>{{ tr(trace.selectedStrategy || "-") }}</b></div>
          <div><span>{{ ui('algorithm.firstBoxLoaded') }}</span><b>{{ trace.firstBox.placedCount }} / {{ traceUnitCount }} {{ ui('unit.piece') }}</b></div>
          <div><span>{{ ui('algorithm.containerVolume') }}</span><b>{{ fmt(trace.current.containerVolumeM3) }} m³</b></div>
          <div><span>{{ ui('algorithm.usableVolume') }}</span><b>{{ fmt(trace.current.usableVolumeM3) }} m³</b></div>
          <div><span>{{ ui('algorithm.firstBoxOccupiedVolume') }}</span><b>{{ fmt(trace.current.firstBoxOccupiedVolumeM3) }} m³</b></div>
          <div><span>{{ ui('algorithm.firstBoxSpaceUsed') }}</span><b>{{ fmt(trace.current.firstBoxFillPercent, 1) }}%</b></div>
          <div><span>{{ ui('algorithm.geometryBoxes') }}</span><b>{{ trace.current.geometryBoxes }}</b></div>
          <div><span>{{ ui('algorithm.weightBoxes') }}</span><b>{{ trace.current.weightBoxes }}</b></div>
          <div><span>{{ ui('algorithm.finalBoxes') }}</span><b>{{ trace.current.finalBoxes }}</b></div>
        </div>
        <p v-else>{{ ui('algorithm.noTrace') }}</p>
      </article>
    </div>

    <div v-if="trace" class="algorithm-note">
      <strong>{{ ui('algorithm.workerFlow') }}</strong>
      <ol class="trace-list">
        <li v-for="step in trace.pipeline" :key="step">{{ tr(step) }}</li>
      </ol>
      <div class="strategy-list">
        <span v-for="strategy in trace.strategies" :key="strategy">{{ tr(strategy) }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

const props = defineProps({
  evaluation: { type: Object, default: null }
});

const fallbackFormulas = [
  "单件原始体积(m³) = 长 × 宽 × 高 ÷ 1,000,000",
  "\u5360\u4f4d\u957f/\u5bbd(cm) = \u65cb\u8f6c\u540e\u7684\u5b9e\u9645 X/Y + \u5168\u5c40\u8d27\u7269\u95f4\u9699",
  "\u5360\u4f4d\u9ad8\u5ea6(cm) = \u65cb\u8f6c\u540e\u7684\u5b9e\u9645 Z\uff1b\u6c34\u5e73\u95f4\u9699\u4e0d\u8ba1\u5165\u9ad8\u5ea6",
  "单件占用体积(m³) = 计入长 × 计入宽 × 计入高 ÷ 1,000,000",
  "箱体体积(m³) = 箱长 × 箱宽 × 箱高 ÷ 1,000,000",
  "计划可用体积(m³) = 箱体体积 × 计划可用率",
  "首箱空间占用率 = 首箱已摆放占用体积 ÷ 计划可用体积 × 100%",
  "重量箱数 = ceil(总重量 ÷ 箱型载重)",
  "当前方案箱数不得低于 max(几何装箱箱数, 重量箱数下界)",
  t("planner.supportFormula"),
  "单箱坐标复用 = 已验证摆放的 x/y/z + 尺寸全部落入新箱体边界，且总重量不超过新箱型载重"
];

const trace = computed(() => props.evaluation?.trace || null);
const formulas = computed(() => trace.value?.formulas?.length ? trace.value.formulas : fallbackFormulas);
const traceUnitCount = computed(() =>
  trace.value?.parameters?.unitCount
  ?? trace.value?.parameters?.physicalUnitCount
  ?? trace.value?.parameters?.solverUnitCount
  ?? 0
);
const guideLanes = computed(() => {
  currentLocale.value;
  return [
    {
      step: "01",
      title: t("algorithmGuide.lanes.prepare.title"),
      text: t("algorithmGuide.lanes.prepare.text")
    },
    {
      step: "02",
      title: t("algorithmGuide.lanes.base.title"),
      text: t("algorithmGuide.lanes.base.text")
    },
    {
      step: "03",
      title: t("algorithmGuide.lanes.refine.title"),
      text: t("algorithmGuide.lanes.refine.text")
    },
    {
      step: "04",
      title: t("algorithmGuide.lanes.stage.title"),
      text: t("algorithmGuide.lanes.stage.text")
    }
  ];
});
const guideStrategies = computed(() => {
  currentLocale.value;
  return [
    {
      id: "S1",
      title: t("algorithmGuide.strategies.footprint.title"),
      text: t("algorithmGuide.strategies.footprint.text")
    },
    {
      id: "S2",
      title: t("algorithmGuide.strategies.height.title"),
      text: t("algorithmGuide.strategies.height.text")
    },
    {
      id: "S3",
      title: t("algorithmGuide.strategies.support.title"),
      text: t("algorithmGuide.strategies.support.text")
    },
    {
      id: "S4",
      title: t("algorithmGuide.strategies.nonstack.title"),
      text: t("algorithmGuide.strategies.nonstack.text")
    },
    {
      id: "S5",
      title: t("algorithmGuide.strategies.vertical.title"),
      text: t("algorithmGuide.strategies.vertical.text")
    }
  ];
});

function fmt(value, digits = 2) {
  return Number(value || 0).toLocaleString(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function tr(value) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}
</script>
