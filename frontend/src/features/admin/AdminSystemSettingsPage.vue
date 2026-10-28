<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import type {
  AdminLlmWorkflow,
  AdminSystemMonitoring,
  AdminWorkflowPorts
} from "../../types/adminWorkflows";
import AdminLlmSettingsPanel from "./AdminLlmSettingsPanel.vue";
const props = defineProps<{
  workflow: AdminLlmWorkflow;
  monitoring: AdminSystemMonitoring | null;
  busy: boolean;
  t: AdminWorkflowPorts["t"];
  formatDate: (value: string) => string;
}>();
function formatSafeDate(value: string | null | undefined) {
  return value && Number.isFinite(new Date(value).getTime()) ? props.formatDate(value) : "-";
}
</script>
<template>
  <section class="admin-page-pane admin-system-page">
    <div class="admin-dashboard-grid">
      <article class="admin-panel">
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ t("adminWorkflow.systemSecurityHeading") }}</template
          ><template #eyebrow>Security Policy</template></WorkspacePageHeader
        >
        <div class="admin-setting-list">
          <span
            ><b>{{ t("adminWorkflow.systemDeviceLimit") }}</b
            >{{
              t("adminWorkflow.systemDeviceCount", { count: monitoring?.deviceLimit ?? 5 })
            }}</span
          >
          <span
            ><b>{{ t("adminWorkflow.systemCredential") }}</b
            >{{ t("adminWorkflow.systemCredentialHint") }}</span
          >
          <span><b>MAC</b>{{ t("adminWorkflow.systemMacHint") }}</span>
          <span
            ><b>{{ t("adminWorkflow.systemLimitAction") }}</b
            >{{ t("adminWorkflow.systemLimitHint") }}</span
          >
        </div>
      </article>
      <article class="admin-panel">
        <WorkspacePageHeader compact class="admin-panel-head"
          ><template #title>{{ t("adminWorkflow.systemServiceHeading") }}</template
          ><template #eyebrow>Service Status</template></WorkspacePageHeader
        >
        <div class="admin-setting-list">
          <span
            ><b>{{ t("adminWorkflow.systemBackend") }}</b
            >/api/auth · /api/admin</span
          >
          <span
            ><b>{{ t("adminWorkflow.systemTime") }}</b
            >{{ formatSafeDate(monitoring?.serverTime) }}</span
          >
          <span
            ><b>{{ t("adminWorkflow.systemRequests") }}</b
            >{{ monitoring?.runtime?.totalRequests ?? "-" }}</span
          >
          <span
            ><b>{{ t("adminWorkflow.systemFailures") }}</b
            >{{ monitoring?.runtime?.failedRequests ?? "-" }}</span
          >
        </div>
      </article>
    </div>
    <AdminLlmSettingsPanel :workflow="workflow" :busy="busy" :t="t" />
    <article class="admin-panel">
      <WorkspacePageHeader compact class="admin-panel-head"
        ><template #title>{{ t("adminWorkflow.systemReservedHeading") }}</template
        ><template #eyebrow>Operations</template></WorkspacePageHeader
      >
      <div class="admin-operation-grid">
        <button type="button" disabled>{{ t("adminWorkflow.systemChangeLimit") }}</button>
        <button type="button" disabled>{{ t("adminWorkflow.systemBackup") }}</button>
        <button type="button" disabled>{{ t("adminWorkflow.systemClearSessions") }}</button>
        <button type="button" disabled>{{ t("adminWorkflow.systemAnnouncement") }}</button>
      </div>
      <p class="admin-hint">{{ t("adminWorkflow.reservedSettingsHint") }}</p>
    </article>
  </section>
</template>
<style scoped src="./adminSettingsStyles.css"></style>

<style scoped src="../../components/workspace/workspacePageStyles.css"></style>
