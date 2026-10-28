<template>
  <section class="shipment-list-page" data-module="shipments">
    <header class="shipment-page-heading">
      <div>
        <span class="business-overview-kicker">{{ t("customers.trackingWorkspace") }}</span>
        <h2>
          {{ isOverseaAgent ? t("customers.shipmentOverview") : t("customers.availableShipments") }}
        </h2>
        <p>{{ t("customers.availableShipmentsHint") }}</p>
      </div>
      <div v-if="isManager" class="shipment-heading-actions">
        <el-button
          type="primary"
          class="batch-track-primary-action"
          :disabled="
            savingShipment || loadingShipmentDetail || refreshingShipment || deletingShipment
          "
          @click="toggleBatchTrackPanel"
        >
          <el-icon><Operation /></el-icon>{{ batchTrackToolbarLabel }}
        </el-button>
        <el-button plain v-if="isManager" :disabled="entryBusy" @click="openShipmentCreateDialog">
          <el-icon><Plus /></el-icon>{{ t("customers.createShipment") }}
        </el-button>
        <el-button plain :disabled="entryBusy" @click="openShipmentExcelImport">
          <el-icon><Upload /></el-icon>{{ t("customers.shipmentExcelImport") }}
        </el-button>
      </div>
    </header>
    <section class="shipment-command-surface">
      <div class="shipment-filter-bar">
        <label v-if="isManager" class="shipment-toolbar-control">
          <span>{{ t("customers.customerFilterLabel") }}</span>
          <el-select
            v-model="shipmentCustomerFilter"
            class="business-select shipment-customer-filter"
            popper-class="business-select-popper shipment-filter-popper"
            :placeholder="t('customers.filterByCustomer')"
            clearable
            filterable
          >
            <el-option
              v-for="customer in shipmentFilterCustomers"
              :key="customer.id"
              :label="`${customerFilterOptionLabel(customer)} (${customer.shipmentCount})`"
              :value="customer.id"
            />
          </el-select>
        </label>
        <label class="shipment-toolbar-control">
          <span>{{ t("customers.businessFilterLabel") }}</span>
          <el-select
            v-model="shipmentBusinessFilter"
            class="business-select shipment-business-filter"
            popper-class="business-select-popper shipment-filter-popper"
          >
            <el-option value="" :label="t('customers.businessFilterAll')" />
            <el-option value="COMPLETED" :label="t('customers.businessCompleted')" />
            <el-option value="UPDATE_FAILED" :label="t('customers.businessUpdateFailed')" />
            <el-option value="MANUAL_REQUIRED" :label="t('customers.manualEntryRequired')" />
            <el-option value="TODAY_UPDATED" :label="t('customers.todayUpdatedBusiness')" />
            <el-option value="TODAY_PENDING" :label="t('customers.todayPendingUpdate')" />
          </el-select>
        </label>
        <label class="shipment-toolbar-control">
          <span>{{ t("customers.trackingChannel") }}</span>
          <el-select
            v-model="shipmentTrackingChannel"
            class="business-select shipment-channel-select"
            popper-class="business-select-popper shipment-filter-popper"
            :disabled="batchTrackRunning || batchTrackChecking || refreshingShipment"
          >
            <el-option :label="t('customers.trackingChannelAuto')" value="AUTO" />
            <el-option :label="t('customers.trackingChannelProxy')" value="PROXY" />
          </el-select>
        </label>
        <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
          <el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}
        </el-button>
      </div>
      <div v-if="isManager" class="shipment-bulk-bar">
        <el-button
          :disabled="!selectedShipmentRows.length || batchSavingBusinessFields"
          @click="openBatchBusinessFieldsEditor"
          >{{
            t("customers.batchEditBusinessFields", {
              count: selectedShipmentRows.length
            })
          }}</el-button
        >
        <el-button
          class="shipment-bulk-danger"
          :disabled="!selectedShipmentRows.length || batchDeletingShipments"
          @click="batchDeleteSelectedShipments"
          >{{
            t("customers.batchDeleteSelected", {
              count: selectedShipmentRows.length
            })
          }}</el-button
        >
        <el-button
          :disabled="
            !selectedShipmentRows.length ||
            batchTrackRunning ||
            batchTrackChecking ||
            batchTrackFileParsing ||
            refreshingShipment ||
            batchDeletingShipments
          "
          @click="startRefreshSelectedShipments"
          ><el-icon><Refresh /></el-icon
          >{{
            t("customers.batchRefreshSelected", {
              count: selectedShipmentRows.length
            })
          }}</el-button
        >
        <el-button
          type="primary"
          :disabled="
            batchTrackRunning || batchTrackChecking || batchTrackFileParsing || refreshingShipment
          "
          @click="startRefreshAllShipments"
        >
          <el-icon><Refresh /></el-icon>{{ t("customers.refreshAllActive") }}
        </el-button>
      </div>
    </section>
    <el-table
      :ref="actions.setTableRef"
      :data="displayedAvailableShipments"
      row-key="shipmentId"
      stripe
      v-loading="loadingAvailableShipments"
      style="width: 100%"
      class="shipment-list-table"
      :class="{ 'is-page-switching': tablePageTransitioning }"
      @selection-change="handleShipmentSelectionChange"
    >
      <el-table-column v-if="isManager" type="selection" width="48" align="center" />
      <el-table-column
        type="index"
        :index="shipmentRowIndex"
        :label="t('customers.index')"
        width="70"
        align="center"
        header-align="center"
      />
      <el-table-column :label="t('customers.referenceNo')" min-width="172">
        <template #default="{ row }">
          <div class="shipment-reference-cell">
            <b>{{ row.referenceNo || row.shipmentId }}</b>
            <small class="shipment-reference-type">{{
              referenceTypeLabel(row.referenceType)
            }}</small>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('customers.carrier')"
        width="98"
        align="center"
        header-align="center"
      >
        <template #default="{ row }">{{ row.carrier || "—" }}</template>
      </el-table-column>
      <el-table-column :label="t('customers.clientNoName')" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ shipmentClientLabel(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('customers.boundUsers')" min-width="260">
        <template #default="{ row }">
          <div v-if="shipmentBoundUsers(row).length" class="shipment-bound-user-tags">
            <el-tag
              v-for="user in shipmentBoundUsers(row).slice(0, 1)"
              :key="user.id || `${user.name}-${user.role}`"
              size="small"
              effect="plain"
              >{{ boundUserLabel(user) }}</el-tag
            >
            <el-tooltip
              v-if="shipmentBoundUsers(row).length > 1"
              :content="shipmentBoundUsers(row).map(boundUserLabel).join(', ')"
              placement="top"
            >
              <el-tag size="small" type="info" effect="plain"
                >+{{ shipmentBoundUsers(row).length - 1 }}</el-tag
              >
            </el-tooltip>
          </div>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('customers.shipmentStatus')" min-width="205">
        <template #default="{ row }">
          <div class="shipment-status-stack">
            <span><i class="shipment-status-dot"></i>{{ row.trackingStatus || "—" }}</span>
            <el-tooltip
              v-if="hasRefreshIssue(row)"
              :content="refreshOutcomeTooltip(row)"
              placement="top"
            >
              <el-tag size="small" type="danger" effect="plain">
                {{
                  row.lastRefreshResult === "FAILED"
                    ? t("customers.refreshFailedMark")
                    : t("customers.refreshPartialMark")
                }}
              </el-tag>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('customers.remark')" width="200">
        <template #default="{ row }">
          <div class="shipment-remark-cell">
            <div class="shipment-today-tags">
              <el-tag
                class="shipment-today-tag"
                :type="shipmentBusinessStateTagType(row)"
                effect="plain"
              >
                {{ shipmentBusinessStateLabel(row) }}
              </el-tag>
              <el-tag
                v-if="isCreatedToday(row)"
                class="shipment-today-tag is-created"
                type="danger"
                effect="plain"
              >
                {{ t("customers.todayNewBusiness") }}
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('customers.lastTrackedAt')" width="164">
        <template #default="{ row }">{{
          row.lastTrackedAt ? formatDateTime(row.lastTrackedAt) : t("customers.notTrackedYet")
        }}</template>
      </el-table-column>
      <el-table-column :label="t('customers.actions')" :width="isManager ? 234 : 94" fixed="right">
        <template #default="{ row }">
          <div class="table-action-buttons table-action-buttons--single-line">
            <el-button size="small" text @click.stop="trackShipmentInWorkspace(row)">{{
              t("customers.view")
            }}</el-button>
            <template v-if="isManager">
              <el-button size="small" type="primary" plain @click.stop="editShipment(row)">{{
                t("customers.edit")
              }}</el-button>
              <el-button
                size="small"
                plain
                :disabled="refreshingShipment"
                @click.stop="updateShipmentTracking(row)"
                >{{ t("customers.update") }}</el-button
              >
              <el-button size="small" type="danger" text @click.stop="deleteShipmentRow(row)">{{
                t("customers.delete")
              }}</el-button>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="shipmentTotal > 0"
      class="shipment-pagination unified-pagination"
      background
      layout="total, sizes, prev, pager, next, jumper"
      :current-page="shipmentPage"
      :page-size="shipmentPageSize"
      :page-sizes="[10, 20, 50, 100]"
      :total="shipmentTotal"
      @current-change="changeShipmentPage"
      @size-change="changeShipmentPageSize"
    />
  </section>
</template>

<script setup lang="ts">
import { toRefs } from "vue";
import { Operation, Plus, Upload, Refresh } from "@element-plus/icons-vue";

// The host supplies one controlled workflow. This page owns no API calls or duplicate state.
const props = defineProps({
  workspace: { type: Object, required: true },
  t: { type: Function, required: true }
});
const { isManager, isOverseaAgent } = toRefs(props.workspace.permissions);
const {
  savingShipment,
  loadingShipmentDetail,
  refreshingShipment,
  deletingShipment,
  batchTrackToolbarLabel,
  shipmentCustomerFilter,
  shipmentFilterCustomers,
  shipmentBusinessFilter,
  shipmentTrackingChannel,
  batchTrackRunning,
  batchTrackChecking,
  loadingAvailableShipments,
  selectedShipmentRows,
  batchSavingBusinessFields,
  batchDeletingShipments,
  batchTrackFileParsing,
  displayedAvailableShipments,
  tablePageTransitioning,
  shipmentTotal,
  shipmentPage,
  shipmentPageSize,
  entryBusy
} = toRefs(props.workspace.state);
const actions = props.workspace.actions;
const {
  toggleBatchTrackPanel,
  openShipmentCreateDialog,
  openShipmentExcelImport,
  loadAvailableShipments,
  openBatchBusinessFieldsEditor,
  batchDeleteSelectedShipments,
  startRefreshSelectedShipments,
  startRefreshAllShipments,
  handleShipmentSelectionChange,
  trackShipmentInWorkspace,
  editShipment,
  updateShipmentTracking,
  deleteShipmentRow,
  changeShipmentPage,
  changeShipmentPageSize
} = actions;
const {
  customerFilterOptionLabel,
  shipmentRowIndex,
  referenceTypeLabel,
  shipmentClientLabel,
  shipmentBoundUsers,
  boundUserLabel,
  hasRefreshIssue,
  refreshOutcomeTooltip,
  shipmentBusinessStateTagType,
  shipmentBusinessStateLabel,
  isCreatedToday,
  formatDateTime
} = props.workspace.formatters;
</script>

<style scoped>
.shipment-list-page {
  min-width: 0;
  width: 100%;
}
.shipment-page-heading {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 0 0 18px;
}
.shipment-page-heading > div:first-child {
  min-width: 0;
}
.shipment-page-heading h2 {
  margin: 0;
  color: #10263a;
  font-size: 24px;
  letter-spacing: -0.025em;
}
.shipment-page-heading p {
  max-width: 760px;
  margin: 7px 0 0;
  color: #687d91;
  font-size: 13px;
  line-height: 1.55;
}
.shipment-heading-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}
.shipment-heading-actions .el-button {
  margin: 0;
}
.batch-track-primary-action {
  min-height: 44px;
  padding-inline: 20px;
  font-weight: 750;
  box-shadow: none;
}
.batch-track-primary-action:hover,
.batch-track-primary-action:focus-visible {
  box-shadow: none;
}
.shipment-command-surface {
  display: grid;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #dbe4ed;
  border-radius: 4px;
  background: #fff;
  box-shadow: none;
  gap: 12px;
}
.shipment-filter-bar,
.shipment-bulk-bar {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.shipment-bulk-bar {
  padding-top: 12px;
  border-top: 1px solid #e6edf3;
}
.shipment-bulk-danger:not(:disabled) {
  border-color: #e6b8b4;
  color: #a92d25;
}
.shipment-bulk-danger:not(:disabled):hover,
.shipment-bulk-danger:not(:disabled):focus-visible {
  border-color: #c9463b;
  color: #8f211a;
  background: #fff7f6;
}
.shipment-filter-bar > .el-button,
.shipment-bulk-bar > .el-button {
  min-height: 40px;
  margin: 0;
}
.shipment-toolbar-control > .shipment-customer-filter.el-select {
  width: 238px;
}
.shipment-toolbar-control {
  display: grid;
  flex: 0 0 auto;
  min-width: 0;
  align-items: end;
  gap: 6px;
  color: #526b82;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.shipment-toolbar-control > span {
  line-height: 1.2;
}
.shipment-toolbar-control > .shipment-channel-select.el-select {
  width: 220px;
}
.shipment-toolbar-control > .shipment-business-filter.el-select {
  width: 184px;
}
.shipment-toolbar-control :deep(.el-select__selected-item),
.shipment-toolbar-control :deep(.el-select__placeholder) {
  font-size: 14px;
  font-weight: 700;
}
.shipment-toolbar-control :deep(.el-select__wrapper) {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 0 0 1px var(--color-border-strong) inset;
}
.shipment-toolbar-control :deep(.el-select__input) {
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none;
}
.shipment-toolbar-control :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--color-primary) inset;
}
.shipment-bound-user-tags {
  display: flex;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
}
.shipment-bound-user-tags :deep(.el-tag) {
  min-width: 0;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shipment-list-table :deep(th.el-table__cell .cell) {
  white-space: nowrap;
  word-break: keep-all;
}
.shipment-list-table :deep(td.el-table__cell .cell) {
  padding-inline: 12px;
}
.shipment-status-stack {
  display: grid;
  justify-items: start;
  gap: 5px;
}
.shipment-reference-cell {
  display: inline-flex;
  max-width: 100%;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}
.assignment-customer-row .business-select {
  width: 100%;
}
.business-overview-kicker {
  display: block;
  margin-bottom: 5px;
  color: #3982be;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.shipment-remark-cell {
  display: flex;
  align-items: center;
  min-width: 0;
}
.shipment-today-tags {
  display: flex;
  min-height: 27px;
  align-items: center;
  flex-wrap: nowrap;
  gap: 7px;
}
.shipment-list-table .shipment-today-tags {
  flex-wrap: nowrap;
}
.shipment-list-table .table-action-buttons--single-line .el-button {
  padding-inline: 8px;
}
.shipment-today-tags :deep(.el-tag) {
  height: 25px;
  padding-inline: 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: none;
}
.shipment-today-tags :deep(.shipment-today-tag.is-created) {
  border-color: #fecdd3;
  color: #be123c;
  background: #fff1f2;
}
.shipment-today-tags :deep(.shipment-today-tag.is-updated) {
  background: #16b86a;
  box-shadow: none;
}
.shipment-today-tags :deep(.shipment-today-tag.is-pending) {
  color: #9a5a05;
  border: 1px solid #efc46c;
  background: #fff8e8;
  box-shadow: none;
}
.shipment-today-tags :deep(.shipment-today-tag.is-failed) {
  color: #b43d3d;
  border: 1px solid #efb0b0;
  background: #fff2f2;
  box-shadow: none;
}
.shipment-list-table :deep(.el-table__body-wrapper) {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.is-page-switching :deep(.el-table__body-wrapper) {
  opacity: 0.52;
  transform: translateY(3px);
}
.shipment-list-table :deep(.el-table__cell:first-child .cell) {
  white-space: nowrap;
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
.shipment-reference-type {
  flex: 0 0 auto;
  color: #74879b;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
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
.shipment-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
  background: #56b88d;
  flex-shrink: 0;
}
.agent-batch-summary .is-created {
  border-color: #bed9ee;
  background: #f1f8fe;
}
.agent-batch-preview :deep(.is-created td) {
  background: #f4fbf7 !important;
}
.customer-credential-row i.is-created {
  color: #197454;
  background: #e9f8f1;
}
:deep(.business-select) {
  width: 100%;
}
@media (max-width: 900px) {
  .shipment-page-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .shipment-heading-actions {
    width: 100%;
    flex-wrap: wrap;
  }
  .shipment-pagination :deep(.el-pagination__total) {
    display: none;
  }
}
@media (max-width: 680px) {
  .shipment-page-heading {
    padding: 2px 4px 14px;
  }
  .shipment-page-heading h2 {
    font-size: 21px;
  }
  .shipment-heading-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .shipment-heading-actions .el-button {
    width: 100%;
  }
  .shipment-command-surface {
    padding: 12px;
  }
  .shipment-filter-bar,
  .shipment-bulk-bar {
    display: grid;
    grid-template-columns: 1fr;
  }
  .shipment-filter-bar > .el-button,
  .shipment-bulk-bar > .el-button {
    width: 100%;
  }
  .shipment-customer-filter {
    width: 100%;
  }
  .shipment-toolbar-control {
    width: 100%;
  }
  .shipment-toolbar-control :deep(.el-select) {
    width: 100%;
  }
  .shipment-toolbar-control > .shipment-customer-filter.el-select,
  .shipment-toolbar-control > .shipment-business-filter.el-select,
  .shipment-toolbar-control > .shipment-channel-select.el-select {
    width: 100%;
  }
}
.shipment-toolbar-control :deep(.el-select__wrapper.is-focused),
.shipment-pagination :deep(.el-pagination__sizes .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--color-ring) inset;
}
</style>
