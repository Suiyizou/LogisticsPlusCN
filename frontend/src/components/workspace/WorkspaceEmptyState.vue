<script setup lang="ts">
import { FolderOpened } from "@element-plus/icons-vue";
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: "",
  description: ""
});
</script>
<template>
  <div class="workspace-empty" role="status">
    <span aria-hidden="true"
      ><el-icon><FolderOpened /></el-icon></span
    ><strong
      ><slot>{{ title }}</slot></strong
    >
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.actions"><slot name="actions" /></div>
  </div>
</template>
<style scoped>
.workspace-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 180px;
  padding: 32px 20px;
  text-align: center;
  color: var(--color-muted);
}
.workspace-empty > span {
  width: 52px;
  height: 52px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-subtle);
  color: var(--color-primary);
  font-size: 24px;
}
.workspace-empty strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}
.workspace-empty p {
  max-width: 420px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}
.workspace-empty > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
</style>
