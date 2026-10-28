<script setup lang="ts">
withDefaults(
  defineProps<{ tone?: "neutral" | "success" | "warning" | "danger"; label?: string }>(),
  { tone: "neutral", label: "" }
);
</script>
<template>
  <span class="workspace-status" :class="`is-${tone}`"
    ><i aria-hidden="true"></i><slot>{{ label }}</slot></span
  >
</template>
<style scoped>
.workspace-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-subtle);
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}
.workspace-status i {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.is-success {
  color: var(--color-success);
  background: var(--color-success-soft);
}
.is-warning {
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.is-danger {
  color: var(--color-destructive);
  background: var(--color-destructive-soft);
}
</style>
