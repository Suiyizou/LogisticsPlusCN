<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string; flush?: boolean }>(), {
  title: "",
  description: "",
  flush: false
});
</script>
<template>
  <section class="workspace-detail-section" :class="{ 'is-flush': flush }">
    <header v-if="title || $slots.title" class="workspace-detail-section__head">
      <div>
        <h2>
          <slot name="title">{{ title }}</slot>
        </h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="workspace-detail-section__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="workspace-detail-section__body"><slot /></div>
  </section>
</template>
<style scoped>
.workspace-detail-section {
  min-width: 0;
  margin-bottom: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  overflow: hidden;
}
.workspace-detail-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--color-border);
}
.workspace-detail-section__head h2 {
  margin: 0;
  color: var(--color-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}
.workspace-detail-section__head p {
  margin: 6px 0 0;
  max-width: 760px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}
.workspace-detail-section__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.workspace-detail-section__body {
  min-width: 0;
  padding: 24px;
}
.is-flush .workspace-detail-section__body {
  padding: 0;
}
@media (max-width: 600px) {
  .workspace-detail-section {
    margin-bottom: 18px;
  }
  .workspace-detail-section__head {
    padding: 18px;
    flex-wrap: wrap;
  }
  .workspace-detail-section__body {
    padding: 18px;
  }
}
</style>
