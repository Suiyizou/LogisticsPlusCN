<template>
  <section class="module-page" data-module="customers">
    <div class="list-page list-page-full">
      <div class="list-page-header">
        <h2>{{ t("customers.directoryTitle") }}</h2>
        <div v-if="isManager" class="list-page-actions">
          <el-input
            v-model="customerSearch"
            :placeholder="t('customers.searchCustomerPlaceholder')"
            prefix-icon="Search"
            clearable
            style="width: 240px"
          />
          <el-button type="primary" @click="openCreateCustomer"
            ><el-icon><Plus /></el-icon>{{ t("customers.openCreate") }}</el-button
          >
          <el-button @click="openBatchImport"
            ><el-icon><Upload /></el-icon>{{ t("customers.batchImport") }}</el-button
          >
          <el-button
            type="success"
            plain
            :disabled="!selectedCustomerRows.length"
            @click="openCustomerTransfer(selectedCustomerRows[0], true)"
            >{{
              t("customers.transferSelected", {
                count: selectedCustomerRows.length
              })
            }}</el-button
          >
          <el-button
            type="danger"
            plain
            :disabled="!selectedCustomerRows.length || mutatingCustomer"
            @click="deleteSelectedCustomers"
            >{{
              t("customers.deleteSelectedCustomers", {
                count: selectedCustomerRows.length
              })
            }}</el-button
          >
        </div>
      </div>
      <el-table
        :ref="actions.setTableRef"
        :data="paginatedCustomers"
        stripe
        v-loading="loadingCustomers"
        style="width: 100%"
        class="customer-directory-table"
        :class="{ 'is-page-switching': tablePageTransitioning }"
        @selection-change="handleCustomerSelectionChange"
      >
        <el-table-column v-if="isManager" type="selection" width="44" />
        <el-table-column
          type="index"
          :index="customerRowIndex"
          :label="t('customers.index')"
          width="76"
          align="center"
          header-align="center"
        />
        <el-table-column :label="t('customers.displayName')" min-width="168">
          <template #default="{ row }">
            <div class="customer-name-cell">
              <span class="customer-table-avatar">{{ customerRowInitial(row) }}</span>
              <div>
                <b>{{ row.displayName || row.username }}</b>
                <small>@{{ row.username }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="clientCode"
          :label="t('customers.clientCode')"
          width="138"
          class-name="customer-code-column"
        />
        <el-table-column
          prop="overseaAgentDisplayName"
          :label="t('customers.targetAgent')"
          min-width="142"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{
            row.overseaAgentDisplayName || t("customers.unassigned")
          }}</template>
        </el-table-column>
        <el-table-column :label="t('customers.partyRole')" width="156">
          <template #default="{ row }">{{ partyRoleLabel(row.partyRole) }}</template>
        </el-table-column>
        <el-table-column :label="t('customers.shipmentCount')" width="100" align="center">
          <template #default="{ row }">{{ row.shipmentCount || 0 }}</template>
        </el-table-column>
        <el-table-column :label="t('customers.remark')" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || "—" }}</template>
        </el-table-column>
        <el-table-column :label="t('customers.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'danger'" size="small">{{
              statusLabel(row.status)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('customers.createdAt')" width="152">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('customers.actions')"
          :width="isManager ? 318 : 110"
          :fixed="compactLayout ? false : 'right'"
        >
          <template #default="{ row }">
            <div class="table-action-buttons table-action-buttons--single-line">
              <el-button size="small" type="primary" plain @click.stop="selectCustomerRow(row)">{{
                t("customers.detail")
              }}</el-button>
              <template v-if="isManager">
                <el-button size="small" type="primary" plain @click.stop="openEditCustomer(row)">{{
                  t("customers.edit")
                }}</el-button>
                <el-button
                  size="small"
                  type="success"
                  plain
                  :disabled="!isTransferableCustomer(row)"
                  @click.stop="openCustomerTransfer(row)"
                  >{{ t("customers.assignAgentShort") }}</el-button
                >
                <el-button size="small" type="warning" plain @click.stop="openResetPassword(row)">{{
                  t("customers.resetPassword")
                }}</el-button>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="filteredCustomers.length"
        class="shipment-pagination unified-pagination"
        background
        layout="prev, pager, next, total"
        :current-page="customerPage"
        :page-size="customerPageSize"
        :total="filteredCustomers.length"
        @current-change="changeCustomerPage"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import { toRefs } from "vue";
import type { CustomerRecord } from "../../../types/businessRecords";
import { useMediaQuery } from "../../../composables/useMediaQuery.js";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { Plus, Upload } from "@element-plus/icons-vue";
const { t } = useI18n();
const compactLayout = useMediaQuery("(max-width: 680px)");
const pages = useModulePages("customers");
const workspace = pages.directory;
const { isManager } = toRefs(workspace.permissions);
const {
  customerPage,
  customerPageSize,
  customerSearch,
  filteredCustomers,
  loadingCustomers,
  mutatingCustomer,
  paginatedCustomers,
  selectedCustomerRows,
  tablePageTransitioning
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  changeCustomerPage,
  deleteSelectedCustomers,
  handleCustomerSelectionChange,
  openBatchImport,
  openCreateCustomer,
  openCustomerTransfer,
  openEditCustomer,
  openResetPassword,
  selectCustomerFromList
} = actions;
const {
  customerInitial,
  customerRowIndex,
  formatDateTime,
  isTransferableCustomer,
  partyRoleLabel,
  statusLabel
} = workspace.formatters;

// Resolve the UI library's broad slot payload to the workflow-owned typed row.
function directoryCustomer(row: unknown): CustomerRecord | undefined {
  if (!row || typeof row !== "object" || !("id" in row)) return undefined;
  const id = row.id;
  if (typeof id !== "string" && typeof id !== "number") return undefined;
  return paginatedCustomers.value.find((customer) => String(customer.id) === String(id));
}

function customerRowInitial(row: unknown) {
  const customer = directoryCustomer(row);
  return customer ? customerInitial(customer) : "C";
}

function selectCustomerRow(row: unknown) {
  const customer = directoryCustomer(row);
  if (customer) selectCustomerFromList(customer);
}
</script>
<style scoped>
.module-page {
  min-width: 0;
  width: 100%;
}
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
.customer-directory-table :deep(.el-table__body-wrapper) {
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
.customer-table-avatar {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: var(--color-primary);
  background: #bfdbfe;
  font-weight: 800;
  font-size: 11px;
}
.customer-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.customer-name-cell > div {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}
.customer-name-cell small {
  color: #6b7e96;
  font-size: 11px;
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
.customer-directory-table :deep(.customer-code-column .cell) {
  color: #1d5f91;
  font:
    700 12px/1.4 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
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
.business-handover-page .list-page-header p {
  margin: 6px 0 0;
  color: #71869a;
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
@keyframes batch-subtask-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
.customer-directory-table :deep(th.el-table__cell .cell),
.customer-directory-table :deep(td.el-table__cell .cell) {
  white-space: nowrap;
  word-break: keep-all;
}
</style>
