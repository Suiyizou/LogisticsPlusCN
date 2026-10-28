<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { workspaceFeedbackKey } from "./workspaceFeedback";
const feedback = inject(workspaceFeedbackKey, null);
const changedSinceOpen = ref(false);
watch(
  () => feedback?.message.value,
  () => {
    changedSinceOpen.value = true;
  }
);
const message = computed(() =>
  changedSinceOpen.value && feedback?.isError.value ? feedback.message.value : ""
);
</script>
<template>
  <Transition name="workspace-state"
    ><div v-if="message" class="workspace-dialog-feedback" role="alert">
      <el-alert :title="message" type="error" :closable="false" show-icon /></div
  ></Transition>
</template>
<style scoped>
.workspace-dialog-feedback {
  grid-column: 1/-1;
  width: 100%;
  min-width: 0;
  margin: 0;
}
</style>
