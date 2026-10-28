<template>
  <div data-i18n-ignore data-module="agents">
    <div class="workspace-view">
      <div class="list-page list-page-full">
        <div class="list-page-header">
          <div>
            <h2>{{ t("customers.overseaAgentManagement") }}</h2>
            <p>{{ t("customers.overseaAgentManagementHint") }}</p>
          </div>
          <div class="list-page-actions">
            <el-button @click="loadTransferAgents"
              ><el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}</el-button
            >
            <el-button type="primary" plain :disabled="agentWriteBusy" @click="openAgentBatchImport"
              ><el-icon><Upload /></el-icon>{{ t("customers.batchCreateAgents") }}</el-button
            >
            <el-button type="primary" :disabled="agentWriteBusy" @click="openAgentCreateDialog"
              ><el-icon><Plus /></el-icon>{{ t("customers.createOverseaAgent") }}</el-button
            >
          </div>
        </div>
        <el-table
          :data="paginatedTransferAgents"
          border
          stripe
          v-loading="loadingTransferAgents"
          class="standard-information-table"
          :class="{ 'is-page-switching': tablePageTransitioning }"
        >
          <el-table-column
            type="index"
            :index="agentRowIndex"
            :label="t('customers.index')"
            width="70"
          />
          <el-table-column prop="username" :label="t('customers.username')" min-width="160" />
          <el-table-column prop="displayName" :label="t('customers.displayName')" min-width="180" />
          <el-table-column
            prop="linkedCustomerCount"
            :label="t('customers.linkedCustomerCount')"
            width="130"
            align="center"
          />
          <el-table-column :label="t('customers.status')" width="120">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{
                statusLabel(row.status)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('customers.actions')"
            width="400"
            :fixed="compact ? undefined : 'right'"
          >
            <template #default="{ row }">
              <div class="table-action-buttons table-action-buttons--single-line">
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="agentWriteBusy"
                  @click="editAgentDisplayName(row)"
                  >{{ t("customers.edit") }}</el-button
                >
                <el-button
                  size="small"
                  type="warning"
                  plain
                  :disabled="agentWriteBusy"
                  @click="resetAgentPassword(row)"
                  >{{ t("customers.resetPassword") }}</el-button
                >
                <el-button
                  size="small"
                  plain
                  :disabled="agentWriteBusy"
                  @click="toggleAgentStatus(row)"
                >
                  {{ row.status === "ACTIVE" ? t("customers.disable") : t("customers.enable") }}
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :disabled="agentWriteBusy"
                  @click="deleteAgent(row)"
                  >{{ t("customers.delete") }}</el-button
                >
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="transferAgents.length"
          class="shipment-pagination unified-pagination"
          background
          layout="prev, pager, next, total"
          :current-page="agentPage"
          :page-size="agentPageSize"
          :total="transferAgents.length"
          @current-change="changeAgentPage"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { Refresh, Upload, Plus } from "@element-plus/icons-vue";
import { useMediaQuery } from "../../../composables/useMediaQuery.js";
const { t } = useI18n();
const workspace = useModulePages("agents").page;
const {
  agentPage,
  agentPageSize,
  agentWriteBusy,
  loadingTransferAgents,
  paginatedTransferAgents,
  tablePageTransitioning,
  transferAgents
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  changeAgentPage,
  deleteAgent,
  editAgentDisplayName,
  loadTransferAgents,
  openAgentBatchImport,
  openAgentCreateDialog,
  resetAgentPassword,
  toggleAgentStatus
} = actions;
const { agentRowIndex, statusLabel } = workspace.formatters;
const compact = useMediaQuery("(max-width: 680px)");
</script>
<style scoped>
.is-page-switching :deep(.el-table__body-wrapper) {
  opacity: 0.52;
  transform: translateY(3px);
}
@keyframes shipment-updating-spin {
  to {
    transform: rotate(360deg);
  }
}
.list-page {
  max-width: none;
  width: 100%;
}
.list-page-full {
  max-width: none;
  width: 100%;
  padding: 20px 22px 22px;
  box-sizing: border-box;
}
.list-page-full :deep(.el-table) {
  width: 100% !important;
}
.list-page-full :deep(.el-table__body-wrapper),
.list-page-full :deep(.el-table__header-wrapper) {
  width: 100%;
}
.workspace-view {
  width: 100%;
  min-width: 0;
}
.workspace-view {
  padding-inline: 2px;
}
.list-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.list-page-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-primary);
  letter-spacing: -0.02em;
}
.list-page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 100%;
  min-width: 0;
}
.standard-information-table :deep(.el-table__body-wrapper) {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
@keyframes business-kpi-in {
  from {
    opacity: 0;
    transform: translateY(9px);
  }
}
.table-action-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.table-action-buttons--single-line {
  flex-wrap: nowrap;
  gap: 6px;
}
.table-action-buttons--single-line .el-button {
  min-width: 0;
  margin: 0;
  padding-inline: 11px;
}
.shipment-pagination {
  display: flex;
  width: 100%;
  max-width: 100%;
  justify-content: flex-end;
  padding: 18px 2px 4px;
  overflow: hidden;
  flex-wrap: wrap;
  row-gap: 8px;
}
.shipment-pagination :deep(.el-pagination__sizes),
.shipment-pagination :deep(.el-select) {
  width: 96px;
  max-width: 96px;
}
.shipment-pagination :deep(.el-pagination__sizes) {
  margin: 0 6px 0 8px;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__wrapper) {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 0 0 1px var(--color-border-strong) inset;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__selected-item) {
  color: #28445e;
  font-size: 13px;
  font-weight: 700;
}
.shipment-pagination :deep(.btn-prev),
.shipment-pagination :deep(.btn-next),
.shipment-pagination :deep(.el-pager li) {
  min-width: 32px;
  height: 32px;
  border-radius: 8px !important;
  font-size: 13px;
}
.shipment-pagination :deep(.el-pager li.is-active) {
  background: var(--color-primary);
  box-shadow: none;

  color: var(--color-on-primary);
}
.shipment-pagination :deep(.el-pagination__total) {
  margin-right: 8px;
  color: #60758a;
  font-size: 13px;
}
@keyframes operations-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes operations-dialog-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes customer-batch-shimmer {
  to {
    background-position: -200% 0;
  }
}
@keyframes customer-rule-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 900px) {
  .shipment-pagination :deep(.el-pagination__total) {
    display: none;
  }
}
@media (max-width: 680px) {
  .workspace-view {
    padding-inline: 0;
  }
}
@keyframes batch-subtask-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
.workspace-view {
  min-width: 0;
  width: 100%;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--color-ring) inset;
}
</style>
