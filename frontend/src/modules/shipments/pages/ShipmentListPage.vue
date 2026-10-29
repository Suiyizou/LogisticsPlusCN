<template>
  <section class="shipment-list-page" data-module="shipments">
    <WorkspacePageHeader
      :title="isOverseaAgent ? t('customers.shipmentOverview') : t('customers.availableShipments')"
      :description="wt('shipmentWorkspaceHint')"
      ><template #actions
        ><div v-if="isManager" class="shipment-heading-actions">
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
        </div></template
      ></WorkspacePageHeader
    >
    <section class="shipment-command-surface">
      <div class="shipment-filter-bar" :class="{ 'has-customer-filter': isManager }">
        <label v-if="isManager" class="shipment-toolbar-control">
          <span>{{ t("customers.customerFilterLabel") }}</span>
          <el-select
            v-model="shipmentCustomerFilter"
            class="business-select shipment-customer-filter"
            popper-class="business-comp-select business-select-popper shipment-filter-popper"
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
            popper-class="business-comp-select business-select-popper shipment-filter-popper"
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
            popper-class="business-comp-select business-select-popper shipment-filter-popper"
            :disabled="batchTrackRunning || batchTrackChecking || refreshingShipment"
          >
            <el-option :label="t('customers.trackingChannelAuto')" value="AUTO" />
            <el-option :label="t('customers.trackingChannelProxy')" value="PROXY" />
          </el-select>
        </label>

        <div class="shipment-filter-actions">
          <el-button @click="loadAvailableShipments" :disabled="loadingAvailableShipments">
            <el-icon><Refresh /></el-icon>{{ t("customers.refresh") }}
          </el-button>
          <el-button
            v-if="isManager"
            type="primary"
            :disabled="
              batchTrackRunning || batchTrackChecking || batchTrackFileParsing || refreshingShipment
            "
            @click="startRefreshAllShipments"
          >
            <el-icon><Refresh /></el-icon>{{ t("customers.refreshAllActive") }}
          </el-button>
        </div>
      </div>
      <div
        v-if="shipmentCustomerFilter || shipmentBusinessFilter"
        class="shipment-filter-summary"
        aria-live="polite"
      >
        <el-button
          v-if="shipmentCustomerFilter || shipmentBusinessFilter"
          text
          @click="clearShipmentFilters"
          >{{ wt("clearFilters") }}</el-button
        >
      </div>
    </section>
    <Transition name="workspace-state"
      ><div v-if="isManager && selectedShipmentRows.length" class="shipment-bulk-bar">
        <strong class="shipment-selection-count" aria-live="polite">{{
          wt("selectedRows", { count: selectedShipmentRows.length })
        }}</strong>
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
        <el-button text class="shipment-selection-clear" @click="actions.clearShipmentSelection">{{
          bwt("clearSelection")
        }}</el-button>
      </div></Transition
    >
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
      <el-table-column v-if="isManager" type="selection" width="44" align="center" />
      <el-table-column type="expand" width="36">
        <template #default="{ row }">
          <dl class="shipment-row-details">
            <div>
              <dt>{{ t("customers.boundUsers") }}</dt>
              <dd>
                <div v-if="shipmentBoundUsers(row).length" class="shipment-bound-user-tags">
                  <el-tag
                    v-for="user in shipmentBoundUsers(row)"
                    :key="user.id || `${user.name}-${user.role}`"
                    size="small"
                    effect="plain"
                    >{{ boundUserLabel(user) }}</el-tag
                  >
                </div>
                <span v-else>—</span>
              </dd>
            </div>
            <div>
              <dt>{{ t("customers.remark") }}</dt>
              <dd>
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
              </dd>
            </div>
            <div>
              <dt>{{ t("customers.referenceType") }}</dt>
              <dd>{{ referenceTypeLabel(row.referenceType) }}</dd>
            </div>
          </dl>
        </template>
      </el-table-column>
      <el-table-column
        type="index"
        :index="shipmentRowIndex"
        :label="t('customers.index')"
        width="44"
        align="center"
        header-align="center"
      />
      <el-table-column :label="t('customers.referenceNo')" min-width="170">
        <template #default="{ row }">
          <div class="shipment-reference-cell">
            <b :title="row.referenceNo || row.shipmentId">{{
              row.referenceNo || row.shipmentId
            }}</b>
            <small class="shipment-reference-type">{{
              referenceTypeLabel(row.referenceType)
            }}</small>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('customers.carrier')"
        width="112"
        align="center"
        header-align="center"
      >
        <template #default="{ row }"
          ><CarrierBadge :carrier="row.carrier || ''" compact
        /></template>
      </el-table-column>
      <el-table-column :label="t('customers.clientNoName')" min-width="136" show-overflow-tooltip>
        <template #default="{ row }">{{ shipmentClientLabel(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('customers.shipmentStatus')" min-width="176">
        <template #default="{ row }">
          <div class="shipment-status-stack">
            <el-tooltip :content="row.trackingStatus || '—'" placement="top"
              ><span class="shipment-status-label" :title="row.trackingStatus || '—'"
                ><i class="shipment-status-dot"></i
                ><span>{{ row.trackingStatus || "—" }}</span></span
              ></el-tooltip
            >
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
      <el-table-column :label="t('customers.lastTrackedAt')" width="152">
        <template #default="{ row }"
          ><time
            v-if="row.lastTrackedAt"
            :datetime="row.lastTrackedAt"
            :title="`${formatDateTime(row.lastTrackedAt)} · ${row.lastTrackedAt}`"
            class="shipment-date-cell"
            >{{ compactShipmentDate(row.lastTrackedAt) }}</time
          ><span v-else>{{ t("customers.notTrackedYet") }}</span></template
        >
      </el-table-column>
      <el-table-column :label="t('customers.actions')" :width="isManager ? 140 : 76" fixed="right">
        <template #default="{ row }">
          <div class="table-action-buttons table-action-buttons--single-line">
            <el-button size="small" text @click.stop="trackShipmentInWorkspace(row)">{{
              t("customers.view")
            }}</el-button>
            <template v-if="isManager">
              <el-button size="small" type="primary" plain @click.stop="editShipment(row)">{{
                t("customers.edit")
              }}</el-button>
              <el-dropdown
                trigger="click"
                placement="bottom-end"
                popper-class="business-comp-select shipment-row-menu"
                @command="(command) => onRowCommand(command, row)"
              >
                <el-button size="small" text :aria-label="bwt('moreActions')" @click.stop>{{
                  bwt("more")
                }}</el-button>
                <template #dropdown
                  ><el-dropdown-menu>
                    <el-dropdown-item command="update" :disabled="refreshingShipment">{{
                      t("customers.update")
                    }}</el-dropdown-item>
                    <el-dropdown-item command="delete" class="shipment-row-menu-danger">{{
                      t("customers.delete")
                    }}</el-dropdown-item>
                  </el-dropdown-menu></template
                >
              </el-dropdown>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <footer class="shipment-list-footer">
      <span aria-live="polite">{{ wt("resultsCount", { count: shipmentTotal }) }}</span>
      <el-pagination
        v-if="shipmentTotal > 0"
        class="shipment-pagination unified-pagination"
        background
        layout="sizes, prev, pager, next, jumper"
        :current-page="shipmentPage"
        :page-size="shipmentPageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="shipmentTotal"
        @current-change="changeShipmentPage"
        @size-change="changeShipmentPageSize"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { toRefs } from "vue";
import CarrierBadge from "../../../components/brand/CarrierBadge.vue";
import { compactShipmentDate } from "../../../features/shipments/compactShipmentPresentation.js";
import WorkspacePageHeader from "../../../components/workspace/WorkspacePageHeader.vue";
import { wt } from "../../../components/workspace/workspaceCopy";
import { bwt } from "../../shared/businessWorkspaceCopy";
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
function onRowCommand(command: unknown, row: unknown) {
  if (!isManager.value) return;
  if (command === "update" && !refreshingShipment.value) updateShipmentTracking(row);
  if (command === "delete") deleteShipmentRow(row);
}
function clearShipmentFilters() {
  shipmentCustomerFilter.value = "";
  shipmentBusinessFilter.value = "";
}
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
  font-weight: 600;
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
  border-radius: var(--radius-control);
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
  font-weight: 600;
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
  font-weight: 600;
}
.shipment-toolbar-control :deep(.el-select__wrapper) {
  min-height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-control);
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
  font-size: 12px;
  font-weight: 600;
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
  border-radius: var(--radius-control);
  font-size: 12px;
  font-weight: 600;
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
  font-size: 12px;
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
  border-radius: var(--radius-control);
  background: #fff;
  box-shadow: 0 0 0 1px var(--color-border-strong) inset;
}
.shipment-pagination :deep(.el-pagination__sizes .el-select__selected-item) {
  color: #28445e;
  font-size: 13px;
  font-weight: 600;
}
.shipment-pagination :deep(.btn-prev),
.shipment-pagination :deep(.btn-next),
.shipment-pagination :deep(.el-pager li) {
  min-width: 32px;
  height: 32px;
  border-radius: var(--radius-control) !important;
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

.shipment-command-surface {
  padding: 20px;
  border-radius: var(--radius-card);
}
.shipment-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}
.shipment-toolbar-control {
  flex: 1 1 180px;
  max-width: 300px;
  font-weight: 500;
}
.shipment-toolbar-control > span {
  font-size: 13px;
}
.shipment-toolbar-control :deep(.el-select) {
  width: 100%;
}
.shipment-toolbar-control :deep(.el-select__wrapper) {
  min-height: 44px;
  border-radius: var(--radius-control);
  font-weight: 400;
}
.shipment-filter-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding-top: 16px;
  color: var(--color-muted);
  font-size: 13px;
}
.shipment-filter-summary strong {
  color: var(--color-primary);
  font-weight: 500;
}
.shipment-bulk-bar {
  padding: 16px 0 0;
  margin-top: 16px;
  border-top: 1px solid var(--color-border);
}
.shipment-list-table {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.shipment-list-table :deep(.el-table__cell) {
  height: 52px;
  font-size: 14px;
}
.shipment-list-table :deep(.el-table__header .cell) {
  font-size: 13px;
  font-weight: 500;
}
.shipment-reference-cell b {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.shipment-reference-cell small {
  font-size: 12px;
}
@media (max-width: 600px) {
  .shipment-command-surface {
    padding: 16px;
  }
  .shipment-toolbar-control {
    flex-basis: 100%;
    max-width: none;
  }
  .shipment-heading-actions {
    flex-wrap: wrap;
    width: 100%;
  }
  .shipment-heading-actions .el-button {
    flex: 1 1 auto;
  }
  .shipment-bulk-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}
.shipment-filter-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 1fr)) auto;
  gap: 20px;
  align-items: end;
}
.shipment-filter-bar.has-customer-filter {
  grid-template-columns: repeat(3, minmax(150px, 1fr)) auto;
}
.shipment-filter-bar .shipment-toolbar-control {
  max-width: none;
  width: 100%;
}
.shipment-filter-bar .shipment-toolbar-control > .business-select {
  width: 100%;
}
.shipment-filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 0;
}
.shipment-filter-actions .el-button {
  margin: 0;
  white-space: nowrap;
}
.shipment-bulk-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.shipment-bulk-bar .el-button {
  margin: 0;
}
@media (max-width: 1100px) {
  .shipment-filter-bar,
  .shipment-filter-bar.has-customer-filter {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .shipment-filter-actions {
    grid-column: 1/-1;
    justify-content: flex-end;
  }
}
@media (max-width: 600px) {
  .shipment-filter-bar,
  .shipment-filter-bar.has-customer-filter {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .shipment-filter-actions {
    justify-content: flex-start;
  }
}
</style>

<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>

<style scoped src="../../../features/shipments/shipmentListComposition.css"></style>
