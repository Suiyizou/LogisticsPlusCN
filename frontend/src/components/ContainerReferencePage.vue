<template>
  <section class="container-reference-page equipment-catalog">
    <WorkspacePageHeader
      :title="ui('container.referenceTitle')"
      :eyebrow="tr('Container Reference')"
      :description="wt('equipmentHint')"
      ><template #actions
        ><RouterLink to="/planner/config"
          ><el-button type="primary">{{ ui("container.backToConfig") }}</el-button></RouterLink
        ></template
      ></WorkspacePageHeader
    >
    <div class="equipment-filters" role="group" :aria-label="ui('container.referenceTitle')">
      <button
        v-for="filter in equipmentFilters"
        :key="filter.value"
        type="button"
        :aria-pressed="equipmentFilter === filter.value"
        :class="{ active: equipmentFilter === filter.value }"
        @click="equipmentFilter = filter.value"
      >
        {{ filter.label }}<span>{{ filter.count }}</span>
      </button>
    </div>

    <el-alert
      class="container-source-alert"
      :title="ui('container.sourceAlert')"
      type="info"
      show-icon
      :closable="false"
    />

    <div class="container-reference-grid">
      <article
        v-for="container in referenceRows"
        :key="container.id"
        class="container-reference-card"
        :class="container.visualKind || 'dry'"
      >
        <div class="container-model-stage">
          <div class="container-model" :class="container.visualKind || 'dry'">
            <span class="model-face front">{{ containerIcon(container.name) }}</span>
            <span class="model-face side"></span>
            <span class="model-face top"></span>
          </div>
        </div>
        <div class="container-reference-body">
          <div class="container-reference-head">
            <div>
              <el-tag :type="priorityTagType(container.usagePriority)" effect="light">
                {{ priorityText(container.usagePriority) }}
              </el-tag>
              <el-tag v-if="container.packingEligible === false" type="info" effect="plain">
                {{ ui("container.referenceOnly") }}
              </el-tag>
              <h3>{{ tr(container.name) }}</h3>
            </div>
            <el-tag v-if="container.ignoreHeightLimit" type="warning" effect="plain">
              {{
                ui("container.flatRackHeightLimitTag", {
                  value: formatNumber(container.heightLimitCm || container.heightCm)
                })
              }}
            </el-tag>
          </div>

          <dl class="container-reference-specs">
            <div>
              <dt>{{ ui("container.calcSize") }}</dt>
              <dd>{{ dimensionText(container) }}</dd>
            </div>
            <div>
              <dt>{{ ui("container.maxPayload") }}</dt>
              <dd>{{ payloadText(container) }}</dd>
            </div>
            <div class="container-reference-price">
              <dt>{{ ui("container.referencePrice") }}</dt>
              <dd>{{ priceText(container) }}</dd>
              <el-link
                v-if="container.referencePriceSourceUrl"
                class="container-reference-price-source"
                type="primary"
                :href="container.referencePriceSourceUrl"
                target="_blank"
                :underline="false"
              >
                {{ priceSourceText(container) }}
              </el-link>
              <small v-if="container.referencePriceBasis">{{
                sourceText(container.referencePriceBasis, "")
              }}</small>
            </div>
            <div>
              <dt>{{ ui("container.dimensionBasis") }}</dt>
              <dd>{{ sourceText(container.dimensionBasis, ui("container.manualDimensions")) }}</dd>
            </div>
          </dl>

          <p class="container-reference-note">
            {{ sourceText(container.dimensionNote, ui("container.customNote")) }}
          </p>
          <el-link
            v-if="container.dimensionSourceUrl"
            type="primary"
            :href="container.dimensionSourceUrl"
            target="_blank"
            :underline="false"
          >
            {{ tr(container.dimensionSource) }}
          </el-link>
          <span v-else class="container-reference-custom-source">{{
            sourceText(container.dimensionSource, ui("container.userDefinedDimensions"))
          }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import WorkspacePageHeader from "./workspace/WorkspacePageHeader.vue";
import { wt } from "./workspace/workspaceCopy";
import { currentLocale } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

const props = defineProps({
  containers: { type: Array, default: () => [] }
});

const allReferenceRows = computed(() =>
  (props.containers as any[]).map((container) => ({
    ...container,
    visualKind: container.visualKind || inferVisualKind(container),
    usagePriority: container.usagePriority || inferPriority(container)
  }))
);

const equipmentFilter = ref("all");
const referenceRows = computed(() =>
  allReferenceRows.value.filter(
    (row) =>
      equipmentFilter.value === "all" ||
      (equipmentFilter.value === "common"
        ? row.usagePriority === "common"
        : row.usagePriority !== "common")
  )
);
const equipmentFilters = computed(() => [
  { value: "all", label: wt("allEquipment"), count: allReferenceRows.value.length },
  {
    value: "common",
    label: wt("commonEquipment"),
    count: allReferenceRows.value.filter((row) => row.usagePriority === "common").length
  },
  {
    value: "special",
    label: wt("specialEquipment"),
    count: allReferenceRows.value.filter((row) => row.usagePriority !== "common").length
  }
]);

function inferVisualKind(container: any) {
  const text = `${container?.id || ""} ${container?.name || ""}`.toLowerCase();
  if (/tank|罐/.test(text)) return "tank";
  if (/garment|挂衣/.test(text)) return "garment";
  if (/ot|open.?top|开顶/.test(text)) return "open-top";
  if (/fr|flat|平板/.test(text)) return "flat-rack";
  if (/rf|reefer|冷藏/.test(text)) return "reefer";
  if (/hq|high|高/.test(text)) return "high-cube";
  return "dry";
}

function inferPriority(container: any) {
  const kind = inferVisualKind(container);
  if (kind === "dry" || kind === "high-cube") return "common";
  return "special";
}

function containerIcon(name: string) {
  if (name.includes("TANK") || name.includes("罐")) return "TK";
  if (name.includes("挂衣")) return "GOH";
  if (name.includes("OT") || name.includes("开顶")) return "OT";
  if (name.includes("FR") || name.includes("平板")) return "FR";
  if (name.includes("RF") || name.includes("冷藏")) return "RF";
  if (name.includes("45")) return "45";
  if (name.includes("40")) return "40";
  return "20";
}

function dimensionText(container: any) {
  const dimensions = [container.lengthCm, container.widthCm, container.heightCm].map((value) =>
    Number(value || 0)
  );
  if (dimensions.every((value) => !(value > 0))) return ui("container.dimensionsNotApplicable");
  return `${dimensions.map(formatNumber).join(" × ")} cm`;
}

function payloadText(container: any) {
  const value = Number(container?.payloadKg || 0);
  if (!value) return "-";
  return value >= 1000 ? `${formatNumber(value / 1000)} t` : `${formatNumber(value)} kg`;
}

function priceText(container: any) {
  const value = referencePriceValue(container);
  if (!value) return ui("container.priceMissing");
  return `${referenceCurrency(container)} ${formatMoney(value)}`;
}

function referencePriceValue(container: any) {
  const explicit = Number(container?.referencePrice ?? container?.price ?? container?.freightPrice);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return 0;
}

function referenceCurrency(container: any) {
  return String(container?.referenceCurrency || container?.currency || "USD").toUpperCase();
}

function priceSourceText(container: any) {
  return sourceText(container.referencePriceSource, ui("container.referencePriceSourceFallback"));
}

function formatNumber(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, "");
}

function formatMoney(value: number) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return new Intl.NumberFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    maximumFractionDigits: numeric >= 100 ? 0 : 2
  }).format(numeric);
}

function priorityText(value: string) {
  return (
    {
      common: ui("container.priority.common"),
      limited: ui("container.priority.limited"),
      special: ui("container.priority.special")
    }[value] || ui("container.priority.custom")
  );
}

function sourceText(value: unknown, fallback: string) {
  return tr(value || fallback);
}

function tr(value: unknown) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

function priorityTagType(value: string) {
  return (
    {
      common: "success",
      limited: "warning",
      special: "info"
    }[value] || "primary"
  );
}
</script>

<style scoped>
.equipment-catalog {
  gap: 20px;
}
.equipment-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.equipment-filters button {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 14px;
}
.equipment-filters button.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.equipment-filters span {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.equipment-catalog .container-reference-card {
  border-radius: var(--radius-card);
  transition: border-color 180ms ease;
}
.equipment-catalog .container-reference-card:hover {
  border-color: var(--color-border-strong);
}
.equipment-catalog .container-reference-head h3 {
  font-size: 20px;
}
.equipment-catalog .container-reference-specs dt {
  font-size: 12px;
}
.equipment-catalog .container-reference-specs dd {
  font-size: 14px;
}
.equipment-catalog .container-reference-note {
  font-size: 13px;
}
.equipment-catalog .container-reference-price small,
.equipment-catalog .container-reference-price .el-link {
  font-size: 12px;
}
@media (max-width: 1100px) {
  .equipment-catalog .container-reference-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .equipment-catalog .container-reference-grid {
    grid-template-columns: 1fr;
  }
  .equipment-filters {
    gap: 8px;
  }
  .equipment-filters button {
    padding-inline: 12px;
  }
}
</style>
