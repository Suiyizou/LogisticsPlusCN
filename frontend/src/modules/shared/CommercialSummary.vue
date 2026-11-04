<script setup lang="ts">
defineProps<{
  metrics: Array<{ label: string; value: string | number; hint?: string }>;
}>();
</script>

<template>
  <dl class="commercial-summary commercial-reveal">
    <div v-for="metric in metrics" :key="metric.label" class="commercial-summary__item">
      <dt>{{ metric.label }}</dt>
      <dd>
        {{ metric.value }}<small v-if="metric.hint">{{ metric.hint }}</small>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.commercial-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(172px, 100%), 1fr));
  gap: 10px;
  margin: 0 0 20px;
}
.commercial-summary__item {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 9px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-top: 2px solid var(--color-primary);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
.commercial-summary dt,
.commercial-summary small {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.45;
}
.commercial-summary dd {
  margin: 0;
  color: var(--color-foreground);
  font-size: 26px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  line-height: 1.12;
}
.commercial-summary small {
  display: block;
  margin-top: 6px;
  font-weight: 400;
}
@media (max-width: 560px) {
  .commercial-summary {
    grid-template-columns: repeat(auto-fit, minmax(min(125px, 100%), 1fr));
  }
}
</style>
<style scoped src="./commercialWorkspaceMotion.css"></style>
