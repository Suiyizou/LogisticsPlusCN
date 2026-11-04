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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 19px 20px;
  color: var(--color-foreground);
  background: linear-gradient(120deg, var(--color-surface), var(--color-surface-subtle));
  text-decoration: none;
  overflow: hidden;
  transition:
    border-color var(--motion-fast),
    background-color var(--motion-normal);
}
.workbench-entry-card:hover {
  border-color: #bfd5f5;
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
  gap: 16px;
  align-items: flex-start;
}
.workbench-entry-card__number {
  color: var(--color-primary);
  font-family: var(--font-display, var(--font-ui));
  font-size: 25px;
  line-height: 1.2;
  font-weight: 600;
}
header p {
  margin: 0 0 5px;
  font-family: var(--font-display, var(--font-ui));
  font-size: 11px;
  letter-spacing: 0.09em;
  color: var(--color-muted);
}
h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  font-family: var(--font-display, var(--font-ui));
  font-weight: 700;
}
.workbench-entry-card__description {
  font-size: 14px;
  line-height: 1.65;
  margin: 10px 0;
  max-width: 310px;
  color: var(--color-muted);
}
.workbench-entry-card__features {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}
.workbench-entry-card__features span {
  font-size: 12px;
  padding: 0 8px 0 0;
  color: var(--color-secondary);
  white-space: nowrap;
}
.workbench-entry-card__action {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  margin-top: auto;
}
.workbench-entry-card:hover .workbench-entry-card__action svg {
  transform: translateX(4px);
}
.workbench-entry-card__action svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  transition: transform var(--motion-fast) var(--motion-ease);
}
.workbench-entry-card__art {
  align-self: center;
  width: calc(100% + 30px);
  height: 144px;
  margin-left: -4px;
}
@media (max-width: 1100px) {
  .workbench-entry-card {
    padding: 17px;
    grid-template-columns: minmax(0, 64%) 36%;
  }
  header {
    gap: 12px;
  }
  h3 {
    font-size: 20px;
  }
  .workbench-entry-card__art {
    height: 130px;
  }
  .workbench-entry-card__features span {
    padding-right: 6px;
  }
}
@media (max-width: 680px) {
  .workbench-entry-card__description {
    font-size: 13px;
  }
  .workbench-entry-card__features {
    gap: 4px;
  }
  .workbench-entry-card__art {
    opacity: 0.65;
  }
}
@media (prefers-reduced-motion: reduce) {
  .workbench-entry-card,
  .workbench-entry-card__action svg {
    transition: none;
  }
  .workbench-entry-card:hover .workbench-entry-card__action svg {
    transform: none;
  }
}
</style>
