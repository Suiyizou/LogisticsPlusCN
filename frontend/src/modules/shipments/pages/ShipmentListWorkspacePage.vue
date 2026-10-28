<template>
  <section class="module-page" data-module="shipments">
    <div class="list-page list-page-full shipment-workspace">
      <div class="shipment-workspace-main">
        <ShipmentListPage :workspace="pages.list" :t="t" />
        <el-dialog
          :model-value="batchBusinessFieldsDialogOpen"
          @update:model-value="
            (value) => {
              if (!value) closeBatchBusinessFieldsEditor();
            }
          "
          :before-close="
            (done) => {
              if (closeBatchBusinessFieldsEditor()) done();
            }
          "
          :close-on-click-modal="!batchSavingBusinessFields"
          :close-on-press-escape="!batchSavingBusinessFields"
          :show-close="!batchSavingBusinessFields"
          :title="t('customers.batchEditBusinessFieldsTitle')"
          width="min(1080px, 94vw)"
          append-to-body
          class="batch-business-fields-dialog workspace-el-dialog business-comp-dialog"
        >
          <p class="batch-business-fields-hint">
            {{ t("customers.batchEditBusinessFieldsHint") }}
          </p>
          <div class="batch-business-fields-grid batch-business-fields-grid--head">
            <span>{{ t("customers.referenceNo") }}</span>
            <span>{{ t("customers.jobNumber") }}</span>
            <span>{{ t("customers.clientPoNumber") }}</span>
            <span>{{ t("customers.clientNoName") }}</span>
          </div>
          <div class="batch-business-fields-rows">
            <div
              v-for="row in batchBusinessFieldRows"
              :key="row.shipmentId"
              class="batch-business-fields-grid"
            >
              <span class="batch-business-reference"
                ><b>{{ row.referenceNo }}</b
                ><small>{{ row.carrier }}</small></span
              >
              <label class="batch-business-field">
                <span>{{ t("customers.jobNumber") }}</span>
                <el-input
                  v-model="row.forwarderJobNumber"
                  :disabled="batchSavingBusinessFields"
                  :aria-label="t('customers.jobNumber')"
                  clearable
                />
              </label>
              <label class="batch-business-field">
                <span>{{ t("customers.clientPoNumber") }}</span>
                <el-input
                  v-model="row.clientPoNumber"
                  :disabled="batchSavingBusinessFields"
                  :aria-label="t('customers.clientPoNumber')"
                  clearable
                />
              </label>
              <label class="batch-business-field">
                <span>{{ t("customers.clientNoName") }}</span>
                <el-input
                  v-model="row.clientNameCode"
                  :disabled="batchSavingBusinessFields"
                  :aria-label="t('customers.clientNoName')"
                  clearable
                />
              </label>
            </div>
          </div>
          <template #footer>
            <el-button
              @click="closeBatchBusinessFieldsEditor"
              :disabled="batchSavingBusinessFields"
              >{{ t("customers.cancel") }}</el-button
            >
            <el-button
              type="primary"
              @click="saveBatchBusinessFields"
              :loading="batchSavingBusinessFields"
            >
              {{ t("customers.saveBatchBusinessFields") }}
            </el-button>
          </template>
        </el-dialog>
      </div>
      <el-dialog
        v-model="batchTrackDialogOpen"
        :title="batchTrackDialogTitle"
        width="min(1280px, 96vw)"
        append-to-body
        :destroy-on-close="false"
        class="batch-track-task-dialog workspace-el-dialog business-comp-dialog"
      >
        <div class="batch-track-task-dialog-body">
          <div class="batch-track-panel">
            <div v-show="!batchTrackRunning" class="batch-track-form">
              <div class="assignment-customer-row">
                <label>
                  <span
                    >{{ t("customers.selectCustomerFirst") }} <i class="required-star">*</i></span
                  >
                  <el-select
                    popper-class="business-comp-select business-select-popper workspace-select-popper"
                    v-model="batchTrackCustomerId"
                    :disabled="batchTrackChecking"
                    filterable
                    class="business-select"
                  >
                    <el-option
                      v-for="customer in assignableCustomers"
                      :key="customer.id"
                      :value="customer.id"
                      :label="customerFilterOptionLabel(customer)"
                    />
                    <template #label="{ value }">
                      <span class="business-select-value">{{
                        selectedCustomerOptionLabel(value)
                      }}</span>
                    </template>
                  </el-select>
                </label>
                <label>
                  <span>{{ t("customers.carrier") }} <i class="required-star">*</i></span>
                  <el-select
                    v-model="batchTrackCarrier"
                    :disabled="batchTrackChecking"
                    class="business-select"
                    popper-class="business-comp-select business-select-popper"
                  >
                    <el-option
                      v-for="carrier in TRACKING_CARRIERS"
                      :key="carrier.code"
                      :value="carrier.code"
                      :label="carrier.name"
                    />
                  </el-select>
                </label>
                <label>
                  <span>{{ t("customers.referenceType") }}</span>
                  <el-select
                    popper-class="business-comp-select business-select-popper workspace-select-popper"
                    v-model="batchTrackReferenceType"
                    :disabled="batchTrackChecking"
                    class="business-select"
                  >
                    <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                    <el-option
                      v-if="supportsShipmentReference(batchTrackCarrier, 'BILLOFLADING')"
                      value="BILLOFLADING"
                      :label="t('customers.referenceBill')"
                    />
                  </el-select>
                </label>
                <el-checkbox
                  :model-value="batchTrackPublishToCustomer"
                  :disabled="batchTrackChecking"
                  @update:model-value="batchTrackPublishToCustomer = $event === true"
                  >{{ t("customers.publishAfterCreate") }}</el-checkbox
                >
              </div>
              <div
                role="button"
                tabindex="0"
                @keydown.enter.prevent="batchTrackFileInput?.click()"
                @keydown.space.prevent="batchTrackFileInput?.click()"
                v-loading="batchTrackFileParsing"
                :element-loading-text="t('app.loadingPage')"
                class="customer-excel-dropzone batch-track-dropzone"
                :class="{
                  'has-file': batchTrackFileName,
                  'is-dragover': batchTrackDropzoneActive
                }"
                @dragover.prevent="batchTrackDropzoneActive = true"
                @dragleave.prevent="batchTrackDropzoneActive = false"
                @drop.prevent="handleBatchTrackDrop"
                @click="batchTrackFileInput?.click()"
              >
                <input
                  :ref="actions.setBatchFileInput"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  @change="handleBatchTrackWorkbook"
                  style="display: none"
                />
                <b>{{ batchTrackFileName || t("customers.chooseTrackExcel") }}</b>
                <small>{{
                  batchTrackFileName
                    ? t("customers.trackRowsReady", {
                        count: batchTrackNumbers.length
                      })
                    : t("customers.trackExcelColumnsHint")
                }}</small>
                <small class="batch-track-excel-rule">{{ t("customers.trackExcelRule") }}</small>
                <button
                  v-if="batchTrackFileName"
                  type="button"
                  class="secondary"
                  @click.stop="clearBatchTrackFile"
                >
                  {{ t("customers.clearFile") }}
                </button>
                <button v-else type="button" @click.stop="batchTrackFileInput?.click()">
                  {{ t("customers.chooseFile") }}
                </button>
              </div>
              <section v-if="batchTrackSelectedSheet" class="batch-track-preview">
                <div class="batch-track-preview-controls">
                  <label>
                    <span>{{ t("customers.trackSheet") }}</span>
                    <el-select
                      v-model="batchTrackSelectedSheetName"
                      class="business-select"
                      popper-class="business-comp-select business-select-popper"
                    >
                      <el-option
                        v-for="sheet in batchTrackSheets"
                        :key="sheet.name"
                        :value="sheet.name"
                        :label="sheet.name"
                      />
                    </el-select>
                  </label>
                  <label>
                    <span>{{ t("customers.trackColumn") }}</span>
                    <el-select
                      v-model="batchTrackSelectedColumnIndex"
                      class="business-select"
                      popper-class="business-comp-select business-select-popper"
                    >
                      <el-option
                        v-for="column in batchTrackSelectedSheet.columns"
                        :key="column.index"
                        :value="column.index"
                        :label="`${column.label} (${column.nonEmptyCount})`"
                      />
                    </el-select>
                  </label>
                </div>
                <p class="batch-track-preview-note">
                  {{
                    t("customers.trackColumnDecision", {
                      trackable: batchTrackTrackableCount,
                      manual: batchTrackManualCount
                    })
                  }}
                </p>
                <div class="batch-track-preview-table-wrap">
                  <el-table
                    :data="batchTrackPreviewRows"
                    border
                    size="small"
                    class="standard-information-table batch-track-preview-table"
                  >
                    <el-table-column
                      v-for="column in batchTrackSelectedSheet.columns"
                      :key="column.index"
                      min-width="150"
                      :label="column.label"
                      :class-name="column.index === batchTrackSelectedColumnIndex ? 'selected' : ''"
                      :label-class-name="
                        column.index === batchTrackSelectedColumnIndex ? 'selected' : ''
                      "
                    >
                      <template #default="{ row }">{{ row[column.index] || "—" }}</template>
                    </el-table-column>
                  </el-table>
                </div>
              </section>
            </div>

            <div v-if="batchTrackRunning || batchTrackResults.length" class="batch-track-results">
              <div class="batch-track-progress">
                <div class="batch-track-progress-summary">
                  <span>{{ t("customers.batchTrackProgress", batchTrackProgress) }}</span>
                  <el-tag
                    v-if="batchTrackProgress.startedAt"
                    size="small"
                    effect="plain"
                    type="info"
                    class="batch-track-timer"
                  >
                    {{
                      t("customers.taskElapsed", {
                        time: batchTrackElapsedText(batchTrackProgress)
                      })
                    }}
                  </el-tag>
                </div>
                <el-progress
                  :percentage="
                    batchTrackProgress.total
                      ? Math.round((batchTrackProgress.done / batchTrackProgress.total) * 100)
                      : 0
                  "
                  :stroke-width="6"
                />
              </div>
              <el-alert
                v-if="batchTrackProgress.stopReason === 'CIRCUIT_BREAKER'"
                type="error"
                show-icon
                :closable="false"
                :title="
                  t('customers.batchTrackCircuitOpened', {
                    count: batchTrackProgress.circuitFailureCount,
                    code: batchTrackProgress.circuitErrorCode,
                    remaining: batchTrackProgress.pending
                  })
                "
              />
              <el-alert
                v-else-if="batchTrackProgress.status === 'PAUSED'"
                type="warning"
                :closable="false"
                :title="t('customers.batchTrackPaused')"
              />
              <el-alert
                v-else-if="batchTrackProgress.nextAttemptAt"
                type="warning"
                :closable="false"
                :title="
                  t('customers.batchTrackRetryWait', {
                    time: formatDateTime(batchTrackProgress.nextAttemptAt)
                  })
                "
              />
              <div v-if="batchTrackResults.length" class="batch-track-result-list">
                <div class="batch-track-result-list-head">
                  <span>{{
                    batchTrackProblemsOnly
                      ? t("customers.batchTrackProblemTasks", {
                          count: batchTrackProblemResults.length
                        })
                      : t("customers.batchTrackAllTasks", {
                          count: batchTrackResults.length
                        })
                  }}</span>
                  <el-button
                    v-if="batchTrackProblemResults.length"
                    text
                    size="small"
                    type="danger"
                    @click="batchTrackProblemsOnly = !batchTrackProblemsOnly"
                    >{{
                      batchTrackProblemsOnly
                        ? t("customers.showAllTasks")
                        : t("customers.showProblemTasks")
                    }}</el-button
                  >
                </div>
                <div
                  v-for="r in visibleBatchTrackResults"
                  :key="`${r.number}-${r.index}`"
                  class="batch-track-result-row"
                  :class="r.status"
                >
                  <span class="batch-track-result-meta">
                    <span class="batch-track-result-index">{{ r.index }}</span>
                    <b>{{ r.number }}</b>
                    <el-tag v-if="r.carrier" size="small" effect="plain" type="info">{{
                      r.carrier
                    }}</el-tag>
                    <el-tag v-if="r.errorCode" size="small" effect="plain" type="danger">{{
                      r.errorCode
                    }}</el-tag>
                    <el-tag
                      v-if="!r.manualOnly"
                      size="small"
                      effect="light"
                      :type="batchStageTagType(batchMainStageStatus(r))"
                    >
                      {{ t("customers.mainQueryStage") }} ·
                      {{ batchStageStatusLabel(batchMainStageStatus(r)) }}
                    </el-tag>
                    <el-tag v-if="r.attempts" size="small" effect="plain">{{
                      t("customers.mainAttempts", { count: r.attempts })
                    }}</el-tag>
                    <el-tag v-if="r.proxyAttempts" size="small" effect="plain" type="warning">{{
                      t("customers.proxyAttempts", { count: r.proxyAttempts })
                    }}</el-tag>
                    <el-tag
                      v-if="r.mainSource"
                      size="small"
                      effect="plain"
                      :type="r.mainCacheStale ? 'danger' : 'info'"
                    >
                      {{ t("customers.dataSource") }}: {{ r.mainSource }}
                    </el-tag>
                    <el-tag v-if="r.mainChannel" size="small" effect="plain" type="info">
                      {{ t("customers.queryChannelUsed") }}: {{ r.mainChannel }}
                    </el-tag>
                    <el-tag v-if="r.proxyNode" size="small" effect="plain" type="warning">
                      {{ t("customers.proxyNodeUsed") }}: {{ r.proxyNode }}
                    </el-tag>
                    <el-tag
                      v-if="r.startedAt"
                      size="small"
                      effect="plain"
                      type="info"
                      class="batch-track-timer"
                    >
                      {{
                        t("customers.itemElapsed", {
                          time: batchTrackElapsedText(r)
                        })
                      }}
                    </el-tag>
                  </span>
                  <small>{{ r.message }}</small>
                  <small v-if="r.mainFetchedAt" class="batch-track-snapshot-time">
                    {{ t("customers.snapshotFetchedAt") }}:
                    {{ formatDateTime(r.mainFetchedAt) }}
                  </small>
                  <small v-if="r.supplementalRetryPending" class="batch-track-retry-note">
                    {{ t("customers.supplementalRetryScheduled") }}
                  </small>
                  <details
                    v-if="batchDiagnosticText(r)"
                    class="batch-track-error-details"
                    :open="['failed', 'partial'].includes(r.status)"
                  >
                    <summary>{{ t("customers.fullErrorDetails") }}</summary>
                    <pre>{{ batchDiagnosticText(r) }}</pre>
                  </details>
                  <div v-if="r.subtasks.length" class="batch-track-subtask-list">
                    <span
                      v-for="subtask in r.subtasks"
                      :key="`${r.index}-${subtask.type}`"
                      class="batch-track-subtask"
                      :class="String(subtask.status || 'PENDING').toLowerCase()"
                    >
                      <i aria-hidden="true"></i>
                      <b
                        >{{ t("customers.childQueryStage") }} ·
                        {{ batchSubtaskLabel(subtask.type) }}</b
                      >
                      <em>{{ batchStageStatusLabel(subtask.status) }}</em>
                      <small v-if="subtask.proxyNode"
                        >{{ t("customers.proxyNodeUsed") }}: {{ subtask.proxyNode }}</small
                      >
                      <small v-if="subtask.error">{{ subtask.error }}</small>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p class="batch-track-close-hint">
              {{ t("customers.batchTrackCloseHint") }}
            </p>
            <div class="batch-track-actions">
              <button
                class="customer-access-primary"
                type="button"
                :disabled="
                  batchTrackRunning ||
                  batchTrackChecking ||
                  batchTrackFileParsing ||
                  !batchTrackCustomerId ||
                  !batchTrackSelectedSheet ||
                  !batchTrackNumbers.length
                "
                @click="startBatchTrack"
              >
                {{
                  batchTrackRunning
                    ? t("customers.batchTrackRunning")
                    : batchTrackChecking
                      ? t("customers.batchTrackChecking")
                      : t("customers.batchTrackStart")
                }}
              </button>
              <el-button native-type="button" @click="batchTrackDialogOpen = false">
                {{ t("customers.close") }}
              </el-button>
              <el-button
                v-if="batchTrackRunning"
                type="danger"
                :disabled="batchTrackCancelRequested || batchTrackProgress.status === 'STOPPING'"
                @click="cancelBatchTrack"
              >
                {{ t("customers.batchTrackStop") }}
              </el-button>
            </div>
          </div>
        </div>
      </el-dialog>
    </div>
  </section>
</template>
<script setup lang="ts">
import {
  TRACKING_CARRIERS,
  supportsShipmentReference
} from "../../../services/trackingCarriers.js";
import { toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import ShipmentListPage from "./ShipmentListPage.vue";
const { t } = useI18n();
const pages = useModulePages("shipments");
const workspace = pages.listDialogs;
const {
  assignableCustomers,
  batchBusinessFieldRows,
  batchBusinessFieldsDialogOpen,
  batchSavingBusinessFields,
  batchTrackCancelRequested,
  batchTrackCarrier,
  batchTrackReferenceType,
  batchTrackChecking,
  batchTrackCustomerId,
  batchTrackDialogOpen,
  batchTrackDialogTitle,
  batchTrackDropzoneActive,
  batchTrackFileInput,
  batchTrackFileName,
  batchTrackFileParsing,
  batchTrackManualCount,
  batchTrackNumbers,
  batchTrackPreviewRows,
  batchTrackProblemResults,
  batchTrackProblemsOnly,
  batchTrackProgress,
  batchTrackPublishToCustomer,
  batchTrackResults,
  batchTrackRunning,
  batchTrackSelectedColumnIndex,
  batchTrackSelectedSheet,
  batchTrackSelectedSheetName,
  batchTrackSheets,
  batchTrackTrackableCount,
  visibleBatchTrackResults
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  cancelBatchTrack,
  clearBatchTrackFile,
  handleBatchTrackDrop,
  handleBatchTrackWorkbook,
  saveBatchBusinessFields,
  closeBatchBusinessFieldsEditor,
  startBatchTrack
} = actions;
const {
  batchDiagnosticText,
  batchMainStageStatus,
  batchStageStatusLabel,
  batchStageTagType,
  batchSubtaskLabel,
  batchTrackElapsedText,
  customerFilterOptionLabel,
  formatDateTime,
  selectedCustomerOptionLabel
} = workspace.formatters;
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
.shipment-workspace {
  display: flex;
  gap: 20px;
  min-height: 0;
}
.shipment-workspace-main {
  flex: 1;
  min-width: 0;
}
.batch-track-panel {
  background: #fff;
  border-radius: var(--radius-card);
  border: 1px solid #e2e8f0;
  padding: 20px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: visible;
}
.batch-track-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.batch-track-dropzone {
  padding: 20px 12px;
}
.batch-track-results {
  flex: 1;
  min-height: 180px;
  max-height: none;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-control);
  padding: 12px;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
}
.batch-track-results:empty {
  display: none;
}
.batch-track-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  position: sticky;
  bottom: 0;
  z-index: 3;
  background: #fff;
}
.batch-track-close-hint {
  margin: 12px 0 0;
  color: var(--color-muted);
  font-size: 12px;
  text-align: right;
}
.batch-track-task-dialog-body {
  width: 100%;
  max-width: none;
  min-height: 0;
  position: static;
  top: auto;
  overflow: visible;
}
:deep(.batch-track-task-dialog .el-dialog__body) {
  max-height: calc(100vh - 150px);
  padding: 12px 24px 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
:deep(.batch-track-task-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 24px 14px;
  border-bottom: 1px solid #e2e8f0;
}
.batch-track-excel-rule {
  color: #6a8096;
  font-size: 12px;
  line-height: 1.5;
  max-width: 100%;
  text-align: center;
}
.batch-track-preview {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #d7e3f2;
  border-radius: var(--radius-control);
  background: var(--color-surface-subtle);
}
.batch-track-preview-controls {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 10px;
}
.batch-track-preview-controls label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #40566f;
  font-size: 12px;
}
.batch-track-preview-note {
  margin: 0;
  color: #526d89;
  font-size: 12px;
}
.batch-track-preview-table-wrap {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid #dce6f1;
  border-radius: 0;
  background: #fff;
}
.batch-track-preview-table {
  min-width: 920px;
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.batch-track-preview-table th,
.batch-track-preview-table td {
  max-width: 180px;
  padding: 7px 8px;
  border-bottom: 1px solid #edf2f7;
  color: #43566b;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-track-preview-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #eef4fb;
  color: #263b53;
}
.batch-track-preview-table .selected {
  background: #e5f1ff;
  color: #0b63ce;
}
.batch-track-result-row.succeeded,
.batch-track-result-row.manual {
  border-left: 3px solid #22c55e;
  background: #f1fbf6;
}
.batch-track-result-row.partial,
.batch-track-result-row.failed {
  border-left: 3px solid #ef4444;
  background: #fff3f5;
}
.batch-track-result-row.stopped {
  border-left: 3px solid #94a3b8;
  background: var(--color-background);
  color: var(--color-muted);
}
.batch-track-result-row.retry_wait {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
}
@media (max-width: 900px) {
  .batch-track-preview-controls {
    grid-template-columns: 1fr;
  }
}
.assignment-customer-row {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto;
  align-items: end;
  gap: 20px;
  padding: 14px 16px;
  border: 1px solid #d9e2ef;
  border-radius: 0;
  background: var(--color-background);
}
.assignment-customer-row > label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.assignment-customer-row .business-select {
  width: 100%;
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
.business-select-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #18324b;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.required-star {
  color: #f56c6c;
  font-style: normal;
  margin-left: 2px;
}
.customer-access-primary {
  min-height: 40px;
  border: 1px solid #1a4f80;
  border-radius: var(--radius-control);
  color: #fff;
  background: var(--color-primary);
  box-shadow: none;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
.customer-access-primary:hover {
  box-shadow: none;
}
.batch-business-fields-hint {
  margin: -4px 0 12px;
  color: #667b91;
  font-size: 12px;
  line-height: 1.6;
}
.batch-business-fields-rows {
  max-height: 58vh;
  overflow: auto;
}
.batch-business-fields-grid {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) repeat(3, minmax(180px, 1fr));
  gap: 8px;
  align-items: center;
  padding: 8px 6px;
  border-bottom: 1px solid #edf1f6;
}
.batch-business-fields-grid--head {
  position: sticky;
  top: 0;
  z-index: 2;
  color: #526b83;
  background: #f4f7fb;
  border: 1px solid #dfe7f0;
  border-radius: 8px 8px 0 0;
  font-size: 12px;
  font-weight: 600;
}
.batch-business-field {
  min-width: 0;
}
.batch-business-field > span {
  display: none;
}
.batch-business-reference {
  display: grid;
  gap: 3px;
  min-width: 0;
  color: #183b5a;
}
.batch-business-reference b,
.batch-business-reference small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-business-reference small {
  color: #7a8da0;
  font-size: 12px;
}
.customer-excel-dropzone {
  display: grid;
  gap: 6px;
  place-items: center;
  padding: 28px 16px;
  border: 2px dashed #c8d6e2;
  border-radius: var(--radius-card);
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}
.customer-excel-dropzone:hover {
  border-color: #5b8def;
  background: #f5f9ff;
}
.customer-excel-dropzone.has-file {
  border-color: #56b88d;
  background: #f6fdf9;
}
.customer-excel-dropzone.is-dragover {
  border-color: #5b8def;
  background: var(--color-surface-subtle);
  transform: scale(1.02);
}
.customer-excel-dropzone input {
  display: none;
}
.customer-excel-dropzone b {
  color: var(--color-foreground);
  font-size: 13px;
}
.customer-excel-dropzone small {
  color: #889aaf;
  font-size: 12px;
}
.customer-excel-dropzone button {
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid #cfdeec;
  border-radius: var(--radius-card);
  color: #3a5572;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
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
:deep(.business-select) {
  width: 100%;
}
.batch-track-form {
  display: grid;
  gap: 14px;
  margin: 16px 0 18px;
}
.batch-track-results {
  margin: 16px 0;
  padding: 12px 14px;
  background: #f5f8fb;
  border: 1px solid #dfe7f0;
  border-radius: var(--radius-control);
}
.batch-track-progress {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-control);
  background: #fff;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  color: #3b5170;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
.batch-track-progress-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.batch-track-result-list {
  max-height: none;
  overflow-y: visible;
  display: grid;
  gap: 6px;
}
.batch-track-result-list-head {
  position: sticky;
  top: 72px;
  z-index: 1;
  padding: 7px 10px;
  border-radius: var(--radius-control);
  color: #334155;
  background: #e8eef6;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.batch-track-result-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  font-size: 12px;
  background: #fff;
}
.batch-track-result-row.success b {
  font-family: var(--font-ui);
  color: #1a3a5c;
}
.batch-track-result-row.success {
  border-left: 3px solid #22c55e;
}
.batch-track-result-row.failed {
  border-left: 3px solid #ef4444;
  background: #fff3f5;
}
.batch-track-result-row.empty {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
}
.batch-track-result-row.cancelled {
  border-left: 3px solid #94a3b8;
  background: var(--color-background);
}
.batch-track-result-row.pending {
  border-left: 3px solid #94a3b8;
  opacity: 0.8;
}
.batch-track-result-row.running {
  border-left: 3px solid #3b82f6;
  background: #eff6ff;
}
.batch-track-result-row small {
  color: #6b7e96;
  text-align: left;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.batch-track-snapshot-time,
.batch-track-retry-note {
  color: #475569 !important;
  font-variant-numeric: tabular-nums;
}
.batch-track-retry-note {
  color: #9a5b00 !important;
  font-weight: 600;
}
.batch-track-error-details {
  margin-top: 3px;
  border: 1px solid #fecdd3;
  border-radius: var(--radius-control);
  background: #fff8f9;
}
.batch-track-error-details summary {
  padding: 6px 8px;
  cursor: pointer;
  color: #9f1239;
  font-size: 12px;
  font-weight: 600;
}
.batch-track-error-details pre {
  max-height: 180px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-top: 1px solid #fecdd3;
  color: #7f1d1d;
  font:
    11px/1.55 "SFMono-Regular",
    "Menlo",
    "Consolas",
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.batch-track-subtask-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding-left: 32px;
}
.batch-track-subtask {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #d9e2ec;
  border-radius: var(--radius-control);
  color: #5f7187;
  background: var(--color-background);
}
.batch-track-subtask i {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-control);
  background: #94a3b8;
}
.batch-track-subtask b {
  overflow: hidden;
  color: #40566f;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-track-subtask em {
  color: inherit;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
}
.batch-track-subtask small {
  grid-column: 2 / -1;
  color: #9f3340 !important;
}
.batch-track-subtask.running {
  border-color: #bfdbfe;
  color: var(--color-primary);
  background: #eff6ff;
}
.batch-track-subtask.running i {
  background: #3b82f6;
  animation: batch-subtask-pulse 1s ease-in-out infinite;
}
.batch-track-subtask.succeeded {
  border-color: #bbf7d0;
  color: #15803d;
  background: #f0fdf4;
}
.batch-track-subtask.succeeded i {
  background: #22c55e;
}
.batch-track-subtask.failed {
  border-color: #fecdd3;
  color: #be123c;
  background: #fff1f2;
}
.batch-track-subtask.failed i {
  background: #ef4444;
}
@keyframes batch-subtask-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
.batch-track-timer {
  font-variant-numeric: tabular-nums;
}
.batch-track-result-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.batch-track-result-index {
  display: inline-grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  color: #475569;
  background: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
}
.batch-track-result-meta b {
  font-family: var(--font-ui);
  color: #1a3a5c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-track-task-dialog-body .batch-track-panel {
  height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
}
.batch-track-task-dialog-body .assignment-customer-row {
  grid-template-columns: minmax(320px, 1.4fr) minmax(220px, 0.7fr) minmax(190px, auto);
}
.batch-track-task-dialog-body .batch-track-form {
  margin-top: 0;
}
.batch-track-task-dialog-body .batch-track-results {
  flex: none;
  min-height: 0;
  overflow: visible;
}
.batch-track-task-dialog-body .batch-track-actions {
  margin: 0;
  padding: 14px 0 0;
  box-shadow: none;
}
@media (max-width: 900px) {
  .batch-business-fields-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
  }
  .batch-business-fields-grid--head {
    display: none;
  }
  .batch-business-field > span {
    display: block;
    margin-bottom: 5px;
    color: #526b83;
    font-size: 12px;
    font-weight: 600;
  }
  .assignment-customer-row,
  .batch-track-task-dialog-body .assignment-customer-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
@media (max-width: 760px) {
  .batch-track-subtask-list {
    grid-template-columns: 1fr;
  }
  .batch-track-progress-summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

<style scoped src="../../../components/workspace/workspacePageStyles.css"></style>

<style scoped src="../../../components/workspace/workspaceElementDialog.css"></style>
