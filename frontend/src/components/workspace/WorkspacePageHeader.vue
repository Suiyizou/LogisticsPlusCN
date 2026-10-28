<script setup lang="ts">
withDefaults(
  defineProps<{ title?: string; eyebrow?: string; description?: string; compact?: boolean }>(),
  { title: "", eyebrow: "", description: "", compact: false }
);
</script>
<template>
  <Transition name="workspace-heading" appear>
    <header class="workspace-page-header" :class="{ 'is-compact': compact }">
      <div class="workspace-page-header__copy">
        <p v-if="eyebrow || $slots.eyebrow" class="workspace-page-header__eyebrow">
          <slot name="eyebrow">{{ eyebrow }}</slot>
        </p>
        <component :is="compact ? 'h2' : 'h1'" class="workspace-page-header__title"
          ><slot name="title">{{ title }}</slot></component
        >
        <div v-if="description || $slots.description" class="workspace-page-header__description">
          <slot name="description">{{ description }}</slot>
        </div>
        <div v-if="$slots.meta" class="workspace-page-header__meta"><slot name="meta" /></div>
      </div>
      <div v-if="$slots.actions" class="workspace-page-header__actions">
        <slot name="actions" />
      </div>
    </header>
  </Transition>
</template>
<style scoped>
.workspace-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.workspace-page-header__copy {
  min-width: 0;
}
.workspace-page-header__eyebrow {
  margin: 0 0 8px;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 500;
  letter-spacing: 0.06em;
}
.workspace-page-header__title {
  margin: 0;
  color: var(--color-primary);
  font-size: var(--text-page-title);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.workspace-page-header__description {
  max-width: 760px;
  margin: 10px 0 0;
  color: var(--color-muted);
  font-size: 14px;
  line-height: 1.7;
}
.workspace-page-header__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.workspace-page-header__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.workspace-page-header__actions :deep(.el-button) {
  margin: 0;
}
.is-compact .workspace-page-header__title {
  font-size: 20px;
}
.is-compact {
  align-items: center;
  margin-bottom: 18px;
}
.is-compact .workspace-page-header__eyebrow {
  margin-bottom: 4px;
}
@media (max-width: 900px) {
  .workspace-page-header {
    flex-wrap: wrap;
    gap: 18px;
  }
  .workspace-page-header__actions {
    justify-content: flex-start;
  }
}
@media (max-width: 600px) {
  .workspace-page-header {
    margin-bottom: 20px;
  }
  .workspace-page-header__actions {
    width: 100%;
  }
  .workspace-page-header__description {
    font-size: 13px;
  }
}
.workspace-heading-enter-active {
  transition:
    opacity var(--motion-normal) ease,
    transform var(--motion-normal) ease;
}
.workspace-heading-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .workspace-heading-enter-active {
    transition: opacity 80ms linear;
  }
  .workspace-heading-enter-from {
    transform: none;
  }
}
</style>
