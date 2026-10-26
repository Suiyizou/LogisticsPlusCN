<template>
  <select
    v-if="field.type === 'boolean' && !field.required"
    :value="booleanValue"
    :disabled="disabled"
    @change="changeNullableBoolean"
  >
    <option value="">—</option>
    <option value="true">{{ trueLabel }}</option>
    <option value="false">{{ falseLabel }}</option>
  </select>
  <input
    v-else-if="field.type === 'boolean'"
    type="checkbox"
    :checked="modelValue === true"
    :disabled="disabled"
    @change="changeBoolean"
  />
  <input
    v-else-if="field.type === 'integer'"
    type="number"
    step="1"
    min="-2147483648"
    max="2147483647"
    :value="numericValue"
    :required="field.required"
    :disabled="disabled"
    @input="changeNumber"
  />
  <textarea
    v-else-if="field.type === 'text'"
    :value="textValue"
    :maxlength="field.maxLength"
    :required="field.required"
    :disabled="disabled"
    rows="4"
    @input="changeText"
  />
  <input
    v-else
    type="text"
    :value="textValue"
    :maxlength="field.maxLength"
    :required="field.required"
    :disabled="disabled"
    @input="changeText"
  />
</template>
<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(
  defineProps<{
    modelValue: string | number | boolean | null | undefined;
    field: { type: string; required: boolean; maxLength?: number };
    disabled?: boolean;
    trueLabel?: string;
    falseLabel?: string;
  }>(),
  { trueLabel: "✓", falseLabel: "✕" }
);
const emit = defineEmits<{ "update:modelValue": [value: string | number | boolean | null] }>();
const booleanValue = computed(() =>
  props.modelValue === true ? "true" : props.modelValue === false ? "false" : ""
);
const textValue = computed(() => (typeof props.modelValue === "string" ? props.modelValue : ""));
const numericValue = computed(() => (typeof props.modelValue === "number" ? props.modelValue : ""));
function changeText(event: Event) {
  if (props.disabled) return;
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
function changeNumber(event: Event) {
  if (props.disabled) return;
  const value = (event.target as HTMLInputElement).value;
  emit("update:modelValue", value === "" ? null : Number(value));
}
function changeBoolean(event: Event) {
  if (props.disabled) return;
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}
function changeNullableBoolean(event: Event) {
  if (props.disabled) return;
  const value = (event.target as HTMLSelectElement).value;
  if (value === "" || value === "true" || value === "false")
    emit("update:modelValue", value === "" ? null : value === "true");
}
</script>
<style scoped>
input:not([type="checkbox"]),
select,
textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #ccd9e4;
  border-radius: 6px;
  padding: 10px 12px;
  font: inherit;
  color: inherit;
  background: var(--surface-card, #fff);
}
input:focus,
select:focus,
textarea:focus {
  outline: 2px solid #62a6be;
  outline-offset: 1px;
}
input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: #147d91;
}
textarea {
  resize: vertical;
}
</style>
