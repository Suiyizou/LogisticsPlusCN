<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import { computed } from "vue";
import type { AdminLlmWorkflow, AdminWorkflowPorts } from "../../types/adminWorkflows";
import { createAdminLlmPresentation } from "./adminLlmPresentation.js";
const props = defineProps<{
  workflow: AdminLlmWorkflow;
  busy: boolean;
  t: AdminWorkflowPorts["t"];
}>();
const { llmForm, llmSettings, dirty, handleUpdateLlmSettings } = props.workflow;
const locked = computed(() => props.busy || props.workflow.busy.value);
const presentation = createAdminLlmPresentation({ t: (key, params) => props.t(key, params) });
</script>
<template>
  <article class="admin-panel admin-llm-panel">
    <WorkspacePageHeader compact class="admin-panel-head"
      ><template #title>{{ t("adminWorkflow.llmHeading") }}</template
      ><template #eyebrow>LLM Settings</template
      ><template #actions
        ><span
          class="admin-health-pill"
          :class="{ warn: !llmSettings?.enabled || !llmSettings?.apiKeyConfigured }"
          >{{ presentation.status(llmSettings) }}</span
        ></template
      ></WorkspacePageHeader
    >
    <form
      class="admin-form-grid llm-settings-form"
      :aria-busy="locked"
      @submit.prevent="handleUpdateLlmSettings"
    >
      <p class="llm-draft-state" role="status">
        {{ t(dirty ? "adminWorkflow.llmUnsaved" : "adminWorkflow.llmDraftHint") }}
      </p>
      <label class="admin-toggle-row"
        ><span>{{ t("adminWorkflow.llmEnableLabel") }}</span
        ><input v-model="llmForm.enabled" type="checkbox" :disabled="locked"
      /></label>
      <label
        ><span>Base URL</span
        ><input
          v-model.trim="llmForm.baseUrl"
          name="llm-base-url"
          placeholder="https://api.deepseek.com"
          :disabled="locked"
      /></label>
      <label
        ><span>{{ t("adminWorkflow.llmModelLabel") }}</span
        ><input
          v-model.trim="llmForm.model"
          name="llm-model"
          placeholder="deepseek-v4-flash"
          :disabled="locked"
      /></label>
      <label
        ><span>API Key</span
        ><input
          v-model.trim="llmForm.apiKey"
          name="llm-api-key"
          autocomplete="off"
          type="password"
          :placeholder="t('adminWorkflow.llmKeyPlaceholder')"
          :disabled="locked"
      /></label>
      <label class="admin-toggle-row"
        ><span>{{ t("adminWorkflow.llmClearLabel") }}</span
        ><input v-model="llmForm.clearApiKey" type="checkbox" :disabled="locked"
      /></label>
      <p class="llm-key-hint">{{ t("adminWorkflow.llmKeyChangeHint") }}</p>
      <div class="llm-saved-settings">
        <h3>{{ t("adminWorkflow.llmSavedHeading") }}</h3>
        <div class="admin-setting-list llm-current-settings">
          <span
            ><b>{{ t("adminWorkflow.llmProviderLabel") }}</b
            >{{ llmSettings?.provider || "OpenAI-compatible HTTP" }}</span
          >
          <span
            ><b>{{ t("adminWorkflow.llmCurrentModelLabel") }}</b
            >{{ llmSettings?.model || "-" }}</span
          >
          <span
            ><b>{{ t("adminWorkflow.llmKeyStatus") }}</b
            >{{ presentation.keyStatus(llmSettings) }}</span
          >
          <span
            ><b>{{ t("adminWorkflow.llmFallbackLabel") }}</b
            >{{ t("adminWorkflow.llmFallbackHint") }}</span
          >
        </div>
      </div>
      <div class="admin-form-actions">
        <button class="primary" type="submit" :disabled="locked">
          {{ t("adminWorkflow.llmSaveLabel") }}
        </button>
      </div>
    </form>
  </article>
</template>
<style scoped src="./adminSettingsStyles.css"></style>
