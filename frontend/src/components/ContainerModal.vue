<template>
  <el-dialog
    :model-value="true"
    class="planner-dialog"
    width="520px"
    align-center
    destroy-on-close
    @close="$emit('close')"
  >
    <template #header>
      <div class="dialog-title">
        <p>箱型管理</p>
        <h2>{{ isEdit ? "编辑箱型尺寸" : "添加自定义箱型" }}</h2>
      </div>
    </template>
    <el-form :model="model" label-position="top" class="element-form-grid">
      <el-form-item class="span-2" label="箱型名称" required>
        <el-input v-model.trim="model.name" placeholder="例如：客户定制柜" clearable />
      </el-form-item>
      <el-form-item label="长 cm" required>
        <el-input-number v-model="model.lengthCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="宽 cm" required>
        <el-input-number v-model="model.widthCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item :label="usesLoadHeightLimit ? ui('container.heightLimitCm') : ui('container.heightCm')" required>
        <el-input-number v-model="model.heightCm" :min="1" :step="usesLoadHeightLimit ? 1 : 0.1" :precision="usesLoadHeightLimit ? 0 : 1" controls-position="right" />
      </el-form-item>
      <el-form-item label="载重 kg" required>
        <el-input-number v-model="model.payloadKg" :min="1" :step="1" :precision="0" controls-position="right" />
      </el-form-item>
      <el-form-item class="span-2 container-price-editor" :label="`${ui('container.referencePrice')} USD`">
        <div class="container-price-edit-row">
          <el-input-number v-model="model.referencePrice" :min="0" :step="100" :precision="0" controls-position="right" />
          <el-button v-if="defaultContainer" :disabled="priceIsDefault" @click="restoreDefaultPrice">
            {{ ui('container.restoreDefaultPrice') }}
          </el-button>
        </div>
        <small v-if="defaultContainer">{{ ui('container.defaultPriceHint', { value: defaultPriceText }) }}</small>
        <small>{{ ui('container.priceOptionalHint') }}</small>
      </el-form-item>
      <el-form-item label="使用属性">
        <el-select v-model="model.usagePriority" placeholder="选择使用属性">
          <el-option label="常用箱型" value="common" />
          <el-option label="少量使用" value="limited" />
          <el-option label="特殊设备" value="special" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="!flatRackModel" class="span-2">
        <el-checkbox v-model="model.ignoreHeightLimit">{{ ui('container.useCustomHeightLimit') }}</el-checkbox>
        <small class="form-help">{{ ui('container.heightLimitHelp') }}</small>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="submit">{{ isEdit ? "保存尺寸" : "加入对比" }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive } from "vue";
import { currentLocale } from "../i18n";
import { translateUiText } from "../i18n/uiText";
import { defaultContainerForId, effectiveContainerHeight, isFlatRackContainer } from "../services/localData";
import { uid } from "../utils/format";

const emit = defineEmits(["close", "save"]);
const props = defineProps({
  container: { type: Object, default: null }
});
const isEdit = computed(() => Boolean(props.container?.id));
const defaultContainer = computed(() => defaultContainerForId(model.id));
const flatRackModel = computed(() => isFlatRackContainer({ ...model, ignoreHeightLimit: false }));
const usesLoadHeightLimit = computed(() => flatRackModel.value || model.ignoreHeightLimit);
const priceIsDefault = computed(() => {
  const current = Number(model.referencePrice || 0);
  const fallback = Number(defaultContainer.value?.referencePrice || 0);
  return fallback > 0 && Math.abs(current - fallback) < 0.01;
});
const defaultPriceText = computed(() => {
  const value = Number(defaultContainer.value?.referencePrice || 0);
  if (!(value > 0)) return "-";
  return new Intl.NumberFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    maximumFractionDigits: 0
  }).format(value);
});
const model = reactive({
  id: props.container?.id || "",
  name: props.container?.name || "",
  lengthCm: Number(props.container?.lengthCm || 590),
  widthCm: Number(props.container?.widthCm || 235),
  heightCm: Number(effectiveContainerHeight(props.container || {}) || 239),
  heightLimitCm: Number(effectiveContainerHeight(props.container || {}) || 239),
  payloadKg: Number(props.container?.payloadKg || 28000),
  usagePriority: props.container?.usagePriority || "common",
  visualKind: props.container?.visualKind || "",
  ignoreHeightLimit: Boolean(props.container?.ignoreHeightLimit) || isFlatRackContainer(props.container || {}),
  costFactor: props.container?.costFactor,
  referencePrice: props.container?.referencePrice ?? null,
  referenceCurrency: props.container?.referenceCurrency || "USD",
  referencePriceSource: props.container?.referencePriceSource || "",
  referencePriceSourceUrl: props.container?.referencePriceSourceUrl || "",
  referencePriceBasis: props.container?.referencePriceBasis || "",
  priceEdited: Boolean(props.container?.priceEdited),
  priceTier: props.container?.priceTier,
  equipmentClass: props.container?.equipmentClass,
  dimensionSource: props.container?.dimensionSource || "用户自定义",
  dimensionSourceUrl: props.container?.dimensionSourceUrl || "",
  dimensionBasis: props.container?.dimensionBasis || "手动录入尺寸",
  dimensionNote: props.container?.dimensionNote || "用户自定义箱型，请按实际设备复核。"
});

function restoreDefaultPrice() {
  if (!defaultContainer.value) return;
  model.referencePrice = defaultContainer.value.referencePrice;
  model.referenceCurrency = defaultContainer.value.referenceCurrency || "USD";
  model.referencePriceSource = defaultContainer.value.referencePriceSource;
  model.referencePriceSourceUrl = defaultContainer.value.referencePriceSourceUrl;
  model.referencePriceBasis = defaultContainer.value.referencePriceBasis;
  model.priceTier = defaultContainer.value.priceTier;
  model.costFactor = defaultContainer.value.costFactor;
  model.equipmentClass = defaultContainer.value.equipmentClass;
  model.priceEdited = false;
}

function submit() {
  if (!String(model.name || "").trim()) return;
  const referencePrice = Number(model.referencePrice || 0);
  const defaultPrice = Number(defaultContainer.value?.referencePrice || 0);
  const priceEdited = Boolean(defaultContainer.value)
    && (!(referencePrice > 0) || Math.abs(referencePrice - defaultPrice) >= 0.01);
  const heightCm = Math.max(1, Number(model.heightCm || 1));
  const ignoreHeightLimit = flatRackModel.value || Boolean(model.ignoreHeightLimit);
  emit("save", {
    ...model,
    id: model.id || uid("container"),
    heightCm,
    heightLimitCm: heightCm,
    ignoreHeightLimit,
    referencePrice: Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : 0,
    referenceCurrency: "USD",
    priceEdited
  });
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}
</script>
