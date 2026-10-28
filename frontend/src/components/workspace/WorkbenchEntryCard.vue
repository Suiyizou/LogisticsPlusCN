<script setup lang="ts">
import { RouterLink } from "vue-router";
import WorkbenchIllustration from "./WorkbenchIllustration.vue";
withDefaults(
  defineProps<{
    index: string;
    kind: "planner" | "tracking" | "customers" | "booking";
    title: string;
    eyebrow: string;
    description: string;
    features: string[];
    action: string;
    to?: string;
    href?: string;
    newTab?: boolean;
  }>(),
  { to: "", href: "", newTab: false }
);
</script>
<template>
  <component
    :is="href ? 'a' : RouterLink"
    class="workbench-entry-card"
    :to="href ? undefined : to"
    :href="href || undefined"
    :target="newTab ? '_blank' : undefined"
    :rel="newTab ? 'noopener noreferrer' : undefined"
  >
    <div class="workbench-entry-card__copy">
      <header>
        <span class="workbench-entry-card__number">{{ index }}</span>
        <div>
          <p>{{ eyebrow }}</p>
          <h3>{{ title }}</h3>
        </div>
      </header>
      <p class="workbench-entry-card__description">{{ description }}</p>
      <div class="workbench-entry-card__features">
        <span v-for="feature in features" :key="feature">{{ feature }}</span>
      </div>
      <span class="workbench-entry-card__action"
        >{{ action
        }}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg
      ></span>
    </div>
    <WorkbenchIllustration class="workbench-entry-card__art" :kind="kind" />
  </component>
</template>
<style scoped>
.workbench-entry-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 60%) minmax(0, 40%);
  min-height: 228px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 16px;
  color: var(--color-foreground);
  background: var(--color-surface);
  text-decoration: none;
  overflow: hidden;
  transition:
    border-color var(--motion-fast),
    box-shadow var(--motion-normal),
    transform var(--motion-normal);
}
.workbench-entry-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
}
.workbench-entry-card:focus-visible {
  outline: 3px solid var(--color-ring);
  outline-offset: 3px;
}
.workbench-entry-card__copy {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
header {
  display: flex;
  gap: 22px;
  align-items: flex-start;
}
.workbench-entry-card__number {
  color: var(--color-accent);
  font-size: 28px;
  line-height: 1.2;
  font-weight: 600;
}
header p {
  margin: 0 0 5px;
  font-size: 12px;
  letter-spacing: 0.09em;
  color: var(--color-muted);
}
h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  font-weight: 600;
}
.workbench-entry-card__description {
  font-size: 14px;
  line-height: 1.65;
  margin: 10px 0;
  max-width: 310px;
}
.workbench-entry-card__features {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}
.workbench-entry-card__features span {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-subtle);
  color: var(--color-secondary);
  white-space: nowrap;
}
.workbench-entry-card__action {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  min-width: 166px;
  padding: 0 16px;
  background: var(--color-accent);
  border-radius: var(--radius-control);
  color: white;
  font-size: 14px;
  margin-top: auto;
  transition: background var(--motion-fast);
}
.workbench-entry-card:hover .workbench-entry-card__action {
  background: var(--color-accent-hover);
}
.workbench-entry-card__action svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
}
.workbench-entry-card__art {
  align-self: center;
  width: calc(100% + 30px);
  height: 190px;
  margin-left: -4px;
}
@media (max-width: 1100px) {
  .workbench-entry-card {
    padding: 16px;
    grid-template-columns: minmax(0, 64%) 36%;
  }
  header {
    gap: 12px;
  }
  h3 {
    font-size: 20px;
  }
  .workbench-entry-card__art {
    height: 170px;
  }
  .workbench-entry-card__features span {
    padding: 4px 7px;
  }
}
@media (max-width: 680px) {
  .workbench-entry-card {
    min-height: 230px;
  }
  .workbench-entry-card__description {
    font-size: 13px;
  }
  .workbench-entry-card__features {
    gap: 4px;
  }
  .workbench-entry-card__art {
    opacity: 0.65;
  }
  .workbench-entry-card__action {
    min-width: 150px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .workbench-entry-card {
    transition: opacity 80ms;
  }
  .workbench-entry-card:hover {
    transform: none;
  }
}
</style>
