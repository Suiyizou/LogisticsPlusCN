<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { currentLocale } from "../../i18n";
import WorkspaceIcon from "./WorkspaceIcon.vue";
import { workbenchJourneyMessages } from "../../i18n/workbenchJourneyMessages.js";

const props = defineProps({ role: String });
const copy = computed(
  () => workbenchJourneyMessages[currentLocale.value] || workbenchJourneyMessages["en-US"]
);
const workflows = computed(() => [
  { ...copy.value.planning, icon: "box", to: "/smart-import/excel" },
  {
    ...copy.value.tracking,
    icon: "tracking",
    to: "/workspace/tracking/query"
  },
  ...(["ADMIN", "BUSINESS", "OVERSEA_AGENT"].includes(props.role)
    ? [{ ...copy.value.customers, icon: "business", to: "/customers/shipments" }]
    : [])
]);
</script>

<template>
  <section class="journeys" aria-labelledby="workspace-journey-title" data-i18n-ignore>
    <header class="journeys__header">
      <p>DAILY OPERATIONS</p>
      <h2 id="workspace-journey-title">{{ copy.title }}</h2>
      <p>{{ copy.description }}</p>
    </header>
    <div class="journeys__grid">
      <RouterLink v-for="flow in workflows" :key="flow.icon" :to="flow.to" class="journey">
        <span class="journey__icon"><WorkspaceIcon :name="flow.icon" /></span>
        <div class="journey__copy">
          <h3>{{ flow.title }}</h3>
          <p>{{ flow.steps }}</p>
          <span>{{ flow.action }}</span>
        </div>
        <WorkspaceIcon class="journey__arrow" name="arrow" />
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.journeys {
  margin: 24px 0 30px;
  padding-block-start: 18px;
  border-top: 1px solid var(--color-border-strong);
}
.journeys__header > p:first-child {
  margin: 0 0 5px;
  color: var(--color-primary);
  font-size: 11px;
  font-family: var(--font-display, var(--font-ui));
  font-weight: 750;
  letter-spacing: 0.12em;
}
.journeys__header h2 {
  margin: 0;
  font-size: 23px;
  font-family: var(--font-display, var(--font-ui));
  line-height: 1.35;
}
.journeys__header > p:last-child {
  margin: 5px 0 17px;
  color: var(--color-secondary);
  font-size: 14px;
}
.journeys__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  column-gap: 22px;
  border-block: 1px solid var(--color-border-strong);
}
.journey {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  min-width: 0;
  padding: 14px 8px;
  color: var(--color-foreground);
  border-block-end: 2px solid transparent;
  text-decoration: none;
  transition:
    border-color var(--motion-fast),
    background-color var(--motion-fast);
}
.journey:hover {
  border-block-end-color: var(--color-primary);
  background-color: var(--color-accent-soft);
}
.journey:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 3px;
}
.journey__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--color-primary);
  background: var(--color-accent-soft);
  border-radius: var(--radius-control);
}
.journey__copy h3 {
  margin: 0;
  font-size: 15px;
}
.journey__copy p {
  margin: 4px 0 8px;
  color: var(--color-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.journey__copy span,
.journey__arrow {
  color: var(--color-primary);
}
.journey__copy span {
  font-size: 12px;
  font-weight: 650;
}
.journey__arrow {
  width: 16px;
  align-self: center;
  transition: transform var(--motion-fast) var(--motion-ease);
}
.journey:hover .journey__arrow {
  transform: translateX(4px);
}
@media (prefers-reduced-motion: reduce) {
  .journey,
  .journey__arrow {
    transition: none;
  }
  .journey:hover .journey__arrow {
    transform: none;
  }
}
</style>
