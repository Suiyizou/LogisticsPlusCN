<template>
  <Transition name="workspace-state"
    ><section
      v-if="review.visible"
      class="packing-reconciliation"
      aria-live="polite"
      data-i18n-ignore
    >
      <header>
        <h3>{{ ui("excel.packingCheckTitle") }}</h3>
        <span>{{ ui("excel.packingCheckBasis") }}</span>
      </header>
      <div class="packing-check-metrics">
        <div v-for="metric in metrics" :key="metric.field">
          <span>{{ ui(metric.label) }}</span>
          <strong
            >{{ display(metric.actual) }} <small>{{ metric.unit }}</small></strong
          >
          <small v-if="metric.expected != null">{{
            ui("excel.sourceTotal", { value: display(metric.expected) })
          }}</small>
        </div>
      </div>
      <p v-if="review.declaredVolumeM3 != null" class="packing-source-volume">
        {{ ui("excel.declaredVolume", { value: display(review.declaredVolumeM3) }) }}
      </p>
      <div v-if="review.blockingIssues.length" class="packing-check-blocked" role="alert">
        <strong>{{ ui("excel.packingCheckBlocked") }}</strong>
        <ul>
          <li v-for="(issue, index) in review.blockingIssues" :key="index">
            {{ issueText(issue) }}
          </li>
        </ul>
      </div>
      <div v-if="review.requiresVolumeConfirmation" class="packing-volume-review">
        <p>{{ sourceWarnings ? sourceCopy.sourceReview : ui("excel.volumeDifferenceReview") }}</p>
        <ul v-if="sourceWarnings">
          <li v-for="(issue, index) in review.warnings" :key="index">{{ issueText(issue) }}</li>
        </ul>
        <label
          ><input
            type="checkbox"
            :checked="volumeConfirmed"
            @change="$emit('update:volumeConfirmed', $event.target.checked)"
          />{{
            sourceWarnings ? sourceCopy.sourceConfirm : ui("excel.confirmVolumeDifference")
          }}</label
        >
      </div>
      <p
        v-if="!review.blockingIssues.length && !review.requiresVolumeConfirmation"
        class="packing-check-matched"
      >
        {{
          ui(
            review.actual.innerQuantity == null
              ? "excel.packingCheckMatchedWithoutContents"
              : "excel.packingCheckMatched"
          )
        }}
      </p>
    </section></Transition
  >
</template>

<script setup>
import { computed } from "vue";
import { currentLocale } from "../i18n";
import { translateUiText } from "../i18n/uiText";
import { screenshotImportMessages } from "../i18n/screenshotImportMessages.js";
const props = defineProps({ review: { type: Object, required: true }, volumeConfirmed: Boolean });
defineEmits(["update:volumeConfirmed"]);
const ui = (key, params) => translateUiText(key, currentLocale.value, params);
const sourceCopy = computed(
  () => screenshotImportMessages[currentLocale.value] || screenshotImportMessages["zh-CN"]
);
const sourceWarnings = computed(() =>
  props.review.warnings.some((issue) =>
    [
      "PACKAGE_UNIT_UNPROVEN",
      "PACKAGE_CONTROL_ROW_EXCLUDED",
      "IMAGE_SOURCE_TOTALS_UNKNOWN",
      "IMAGE_SOURCE_CONFIRMATION_REQUIRED"
    ].includes(issue.code)
  )
);
const metrics = computed(() =>
  [
    { field: "packageCount", label: "excel.packageCount", unit: ui("excel.packagesUnit") },
    { field: "innerQuantity", label: "excel.innerGoodsCount", unit: ui("excel.goodsPiecesUnit") },
    { field: "grossWeightKg", label: "excel.totalGrossWeight", unit: "kg" },
    { field: "calculatedVolumeM3", label: "excel.dimensionVolume", unit: "m³" }
  ].map((metric) => ({
    ...metric,
    actual: props.review.actual[metric.field],
    expected: props.review.expected[metric.field]
  }))
);
function display(value) {
  return value == null || !Number.isFinite(Number(value))
    ? "—"
    : new Intl.NumberFormat(currentLocale.value, { maximumFractionDigits: 8 }).format(
        Number(value)
      );
}
function issueText(issue) {
  const code = String(issue?.code || "");
  const sourceMessage = {
    PACKAGE_UNIT_UNPROVEN: "unitUnproven",
    PACKAGE_UNIT_CONFLICT: "unitConflict",
    PACKAGE_CONTROL_ROW_EXCLUDED: "controlExcluded",
    IMAGE_SOURCE_TOTALS_UNKNOWN: "totalsUnknown",
    IMAGE_SOURCE_CONFIRMATION_REQUIRED: "caution"
  }[code];
  if (sourceMessage)
    return `${sourceCopy.value[sourceMessage]} (${[issue?.sourceSheet, issue?.sourceRowNumber].filter(Boolean).join(" · ")})`;
  const key = code.startsWith("PACKAGE_EDIT_")
    ? "excel.sourceTotalsChanged"
    : /IDENTITY/.test(code)
      ? "excel.packageIdentityUnclear"
      : /CONTENT/.test(code)
        ? "excel.packageContentsUnclear"
        : /MISSING|PARTIAL/.test(code)
          ? "excel.packageResultIncomplete"
          : "excel.packageSourceNeedsReview";
  const location = [
    issue?.sourceSheet,
    issue?.sourceRowNumber ? ui("excel.sourceRowAt", { row: issue.sourceRowNumber }) : ""
  ]
    .filter(Boolean)
    .join(" · ");
  return `${ui(key)}${location ? ` (${location})` : ""}`;
}
</script>

<style scoped>
.packing-reconciliation {
  padding: 20px;
  margin: 16px 0;
  border: 1px solid #bfd5df;
  border-radius: 12px;
  background: #f7fbfc;
  color: #23424f;
}
.packing-reconciliation header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.packing-reconciliation h3,
.packing-reconciliation p {
  margin: 0;
}
.packing-reconciliation header span,
.packing-check-metrics span,
.packing-check-metrics small,
.packing-source-volume {
  font-size: 13px;
  color: #617987;
}
.packing-check-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.packing-check-metrics div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.packing-check-metrics strong {
  font-size: 23px;
  overflow-wrap: anywhere;
}
.packing-check-metrics strong small {
  font-weight: 400;
}
.packing-source-volume {
  margin-top: 14px !important;
}
.packing-check-blocked,
.packing-volume-review {
  padding: 12px;
  margin-top: 14px;
  border-radius: 8px;
  background: #fff3ef;
  color: #963f29;
}
.packing-check-blocked ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
.packing-volume-review {
  background: #fff8e8;
  color: #7b5b16;
}
.packing-volume-review label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  cursor: pointer;
}
.packing-volume-review input {
  margin-top: 4px;
}
.packing-check-matched {
  margin-top: 14px !important;
  color: #18755e;
}
@media (max-width: 700px) {
  .packing-check-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.packing-reconciliation {
  padding: 24px;
  border-color: var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-subtle);
}
.packing-reconciliation h3 {
  font-size: 18px;
  font-weight: 600;
}
.packing-check-metrics {
  gap: 20px;
  padding: 18px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
.packing-check-metrics strong {
  font-size: 26px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.packing-check-blocked,
.packing-volume-review {
  padding: 16px;
  border-radius: var(--radius-control);
  font-size: 14px;
  line-height: 1.8;
}
.packing-check-blocked {
  border-left: 3px solid var(--color-destructive);
}
.packing-volume-review {
  border-left: 3px solid var(--color-warning);
}
.packing-volume-review label {
  gap: 12px;
}
.packing-volume-review input {
  flex: none;
  width: 18px;
  height: 18px;
}
@media (max-width: 600px) {
  .packing-reconciliation {
    padding: 18px;
  }
  .packing-check-metrics {
    gap: 18px;
  }
}
</style>
