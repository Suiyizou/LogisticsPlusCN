<template>
  <label class="packing-goal-select" data-i18n-ignore>
    <span>{{ wt("packingGoal") }}</span>
    <select v-model="goal">
      <option value="overall">{{ wt("goalOverall") }}</option>
      <option value="peak">{{ wt("goalPeak") }}</option>
    </select>
  </label>
</template>

<script setup lang="ts">
import { wt } from "./workspaceCopy";
const goal = defineModel<"overall" | "peak">({ required: true });
</script>

<style scoped>
.packing-goal-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--planner-muted);
  font-size: 13px;
}
.packing-goal-select select {
  max-width: 100%;
  padding: 8px;
  border: 1px solid var(--planner-line);
  border-radius: 5px;
  background: white;
  color: var(--planner-ink);
  font: inherit;
}
</style>
