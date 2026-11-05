<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import ShipmentTaskBatchIdentity from "./ShipmentTaskBatchIdentity.vue";
import { matchesShipmentTask, shipmentTaskName, shortShipmentTaskId } from "./shipmentTaskBatch.js";

const props = defineProps({
  tasks: { type: Array, required: true },
  current: { type: Object, default: null },
  modelValue: { type: String, default: "" },
  history: Boolean,
  disabled: Boolean,
  loading: Boolean
});
const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();
const query = ref("");
const available = computed(() => {
  const tasks = props.tasks;
  if (!props.modelValue || tasks.some(({ taskId }) => taskId === props.modelValue)) return tasks;
  return [props.current || { taskId: props.modelValue }, ...tasks];
});
const caption = computed(() =>
  t(props.history ? "shipmentTask.history" : "shipmentTaskManagement.chooseBatch")
);
const placeholder = computed(() => {
  if (props.history) return t(available.value.length ? "shipmentTask.chooseHistory" : "shipmentTask.emptyHistory");
  return t(available.value.length ? "shipmentTask.batchSearch" : "shipmentTaskManagement.noBatches");
});
const matches = computed(() => available.value.filter((task) => matchesShipmentTask(task, query.value)));
const label = (task) => `${shipmentTaskName(task)} · #${shortShipmentTaskId(task.taskId)}`;
</script>

<template>
  <div class="task-batch-picker">
    <span class="task-batch-picker-caption">{{ caption }}</span>
    <el-select
      :model-value="modelValue"
      :aria-label="caption"
      :placeholder="placeholder"
      :no-match-text="t('shipmentTask.batchNoMatches')"
      :filter-method="(value) => { query = value; }"
      :loading="loading"
      :disabled="disabled || !available.length"
      popper-class="task-batch-picker-options"
      filterable
      @visible-change="(visible) => { if (!visible) query = ''; }"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-option v-for="task in matches" :key="task.taskId" :value="task.taskId" :label="label(task)">
        <ShipmentTaskBatchIdentity :task="task" compact />
      </el-option>
    </el-select>
  </div>
</template>
