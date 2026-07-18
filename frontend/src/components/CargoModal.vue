<template>
  <el-dialog
    :model-value="true"
    class="planner-dialog"
    width="640px"
    align-center
    destroy-on-close
    @close="$emit('close')"
  >
    <template #header>
      <div class="dialog-title">
        <p>货物录入</p>
        <h2>{{ model.id ? "编辑货物" : "新增货物" }}</h2>
      </div>
    </template>
    <el-form :model="model" label-position="top" class="element-form-grid">
      <el-form-item class="span-2" label="名称" required>
        <el-input v-model.trim="model.name" placeholder="例如：纸箱 A" clearable />
      </el-form-item>
      <el-form-item class="span-2" label="型号/规格">
        <el-input v-model.trim="model.model" placeholder="可选，例如：100 / 200 / A款" clearable />
      </el-form-item>
      <el-form-item label="长 cm" required>
        <el-input-number v-model="model.lengthCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="宽 cm" required>
        <el-input-number v-model="model.widthCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="高 cm" required>
        <el-input-number v-model="model.heightCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="数量" required>
        <el-input-number v-model="model.quantity" :min="1" :step="1" :precision="0" controls-position="right" />
      </el-form-item>
      <el-form-item label="单重 kg" required>
        <el-input-number v-model="model.weightKg" :min="0" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item :label="ui('cargo.packageType')">
        <el-select v-model="packageType">
          <el-option :label="ui('cargo.normal')" value="normal" />
          <el-option :label="ui('cargo.pallet')" value="pallet" />
        </el-select>
      </el-form-item>
      <el-form-item class="span-2" :label="ui('cargo.constraints')">
        <el-checkbox-group v-model="handlingConstraints" class="cargo-constraint-options">
          <el-checkbox value="nonStack">{{ ui('cargo.nonstack') }}</el-checkbox>
          <el-checkbox value="keepUpright">{{ ui('cargo.upright') }}</el-checkbox>
        </el-checkbox-group>
        <small class="cargo-constraint-help">{{ ui('cargo.constraintsHelp') }}</small>
      </el-form-item>
      <el-form-item class="span-2" label="颜色设置">
        <div class="element-color-row">
          <el-color-picker v-model="colorValue" />
          <el-tag effect="plain">{{ model.color ? "已自定义颜色" : "系统自动推荐颜色" }}</el-tag>
          <el-button :icon="RefreshLeft" @click="useAutoColor">使用系统推荐色</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="submit">{{ model.id ? "保存修改" : "添加货物" }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, watch } from "vue";
import { RefreshLeft } from "@element-plus/icons-vue";
import { uid } from "../utils/format";
import { cargoConstraintFlags, cargoHandlingUnitType } from "../utils/cargoConstraints";
import { currentLocale } from "../i18n";
import { translateUiText } from "../i18n/uiText";

const props = defineProps({ cargo: { type: Object, default: null } });
const emit = defineEmits(["close", "save"]);

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

const model = reactive(defaultCargo());
const colorValue = computed({
  get: () => model.color || "#4e8fd0",
  set: (value) => {
    model.color = value;
  }
});
const packageType = computed({
  get: () => cargoHandlingUnitType(model),
  set: (value) => {
    const nextType = value === "pallet" ? "pallet" : "normal";
    const previousType = cargoHandlingUnitType(model);
    model.type = nextType;
    if (nextType === "pallet") model.packageInfo = palletPackageInfo(model.packageInfo);
    else if (previousType === "pallet") model.packageInfo = null;
  }
});
const handlingConstraints = computed({
  get: () => [
    model.nonStack ? "nonStack" : "",
    model.keepUpright ? "keepUpright" : ""
  ].filter(Boolean),
  set: (values) => {
    model.nonStack = values.includes("nonStack");
    model.keepUpright = values.includes("keepUpright");
  }
});

watch(
  () => props.cargo,
  (cargo) => {
    const next = cargo ? { ...cargo } : defaultCargo();
    const flags = cargoConstraintFlags(next);
    Object.assign(model, defaultCargo(), next, {
      type: cargoHandlingUnitType(next),
      nonStack: flags.nonStack,
      keepUpright: flags.keepUpright
    });
  },
  { immediate: true }
);

function defaultCargo() {
  return {
    id: "",
    name: "",
    model: "",
    lengthCm: 60,
    widthCm: 40,
    heightCm: 35,
    quantity: 10,
    weightKg: 12,
    type: "normal",
    nonStack: false,
    keepUpright: false,
    packageInfo: null,
    color: ""
  };
}

function palletPackageInfo(packageInfo) {
  return {
    ...(packageInfo && typeof packageInfo === "object" ? packageInfo : {}),
    handlingUnitType: "pallet",
    packageUnit: "pallet"
  };
}

function useAutoColor() {
  model.color = "";
}

function submit() {
  if (!String(model.name || "").trim()) return;
  const type = packageType.value;
  emit("save", {
    ...model,
    type,
    nonStack: Boolean(model.nonStack),
    keepUpright: Boolean(model.keepUpright),
    packageInfo: type === "pallet" ? palletPackageInfo(model.packageInfo) : (model.packageInfo || null),
    id: model.id || uid("cargo")
  });
}
</script>

<style scoped>
.cargo-constraint-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
}

.cargo-constraint-help {
  display: block;
  width: 100%;
  margin-top: 6px;
  color: #64748b;
  line-height: 1.5;
}
</style>
