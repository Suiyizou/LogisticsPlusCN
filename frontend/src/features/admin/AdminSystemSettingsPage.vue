<script setup lang="ts">
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
        <div class="admin-panel-head">
          <div>
            <p>Security Policy</p>
            <h2>{{ t("adminWorkflow.systemSecurityHeading") }}</h2>
          </div>
        </div>
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
        <div class="admin-panel-head">
          <div>
            <p>Service Status</p>
            <h2>{{ t("adminWorkflow.systemServiceHeading") }}</h2>
          </div>
        </div>
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
      <div class="admin-panel-head">
        <div>
          <p>Operations</p>
          <h2>{{ t("adminWorkflow.systemReservedHeading") }}</h2>
        </div>
      </div>
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
