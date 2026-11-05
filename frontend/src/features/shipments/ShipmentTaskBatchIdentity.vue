<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Document } from "@element-plus/icons-vue";
import { formatShipmentTaskTime, shipmentTaskName, shortShipmentTaskId } from "./shipmentTaskBatch.js";
import { taskStateColors, taskStatusTone } from "./shipmentTaskNetworkModel.js";
import "./shipmentTaskBatch.css";

const props = defineProps({
  task: { type: Object, required: true },
  compact: Boolean
});
const { t, te, locale } = useI18n();
const copy = (key, params = {}) => t(`shipmentTask.${key}`, params);
const time = (value) => formatShipmentTaskTime(value, locale.value);
const name = computed(() => shipmentTaskName(props.task));
const publication = computed(() => props.task.publishedAt
  ? copy("batchPublishedAt", { time: time(props.task.publishedAt) })
  : copy(props.task.status === "DRAFT" ? "batchUnpublished" : "batchUnknownPublication"));
const status = computed(() => te(`shipmentTask.status.${props.task.status}`)
  ? copy(`status.${props.task.status}`)
  : props.task.status);
</script>

<template>
  <div class="task-batch-identity" :class="{ 'is-compact': compact }">
    <span v-if="!compact" class="task-batch-icon" aria-hidden="true"><el-icon><Document /></el-icon></span>
    <div class="task-batch-content">
      <div class="task-batch-name-line">
        <component :is="compact ? 'span' : 'h2'" class="task-batch-name" :title="name">
          {{ name }}
        </component>
        <span v-if="status" class="task-batch-status" :style="{ '--task-batch-tone': taskStateColors[taskStatusTone(task)] }">
          {{ status }}
        </span>
      </div>
      <div class="task-batch-meta">
        <span v-if="!compact && task.sourceFileName" :title="task.sourceFileName" class="task-batch-file">{{ task.sourceFileName }}</span>
        <span>{{ publication }}</span>
        <span v-if="task.createdAt && (!compact || !task.publishedAt)">{{ copy("batchCreatedAt", { time: time(task.createdAt) }) }}</span>
        <span v-if="task.total != null">{{ copy("batchTotal", { count: task.total }) }}</span>
        <code :title="task.taskId">#{{ shortShipmentTaskId(task.taskId) }}</code>
      </div>
      <div v-if="!compact && task.publishedAt" class="task-batch-counts">
        <span>{{ copy("batchProgress", { count: task.processed ?? 0, total: task.total ?? 0 }) }}</span>
        <span>{{ copy("batchSuccess", { count: task.succeeded ?? 0 }) }}</span>
        <span>{{ copy("batchFailed", { count: task.failed ?? 0 }) }}</span>
      </div>
    </div>
  </div>
</template>
