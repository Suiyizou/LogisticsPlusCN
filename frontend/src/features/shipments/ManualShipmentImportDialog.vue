<script setup lang="ts">
import { ref } from "vue";
import type { ManualShipmentImportWorkflow } from "../../types/featureComponents";
import { useI18n } from "vue-i18n";
import { useShipmentEntryDialogFocus } from "./useShipmentEntryDialogFocus.js";
import { Close, Upload } from "@element-plus/icons-vue";

// The parent passes a reactive workflow that unwraps composable refs. The dialog
// edits only that controlled state; all validation and server writes stay there.
const props = defineProps<{ workflow: ManualShipmentImportWorkflow }>();
const { t } = useI18n();
const dialogElement = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const { onDialogKeydown: handleDialogKeydown } = useShipmentEntryDialogFocus({
  dialogElement,
  isOpen: () => props.workflow.shipmentExcelImportDialogOpen,
  isBusy: () => props.workflow.entryBusy || props.workflow.shipmentExcelImporting,
  close: () => props.workflow.closeShipmentExcelImport()
});
const onDialogKeydown = (event: KeyboardEvent) => handleDialogKeydown(event);

function fileSelectionBlocked() {
  return (
    props.workflow.entryBusy ||
    props.workflow.shipmentExcelImporting ||
    props.workflow.shipmentExcelImportParsing
  );
}

function chooseFile() {
  if (!fileSelectionBlocked()) fileInput.value?.click();
}

function activateDropzone() {
  if (!fileSelectionBlocked()) props.workflow.shipmentExcelImportDropzoneActive = true;
}

function onFileChange(event: Event) {
  if (fileSelectionBlocked()) return;
  // The workflow captures the File before resetting the input, allowing the
  // same workbook to be chosen again after a failed preview.
  return props.workflow.handleShipmentExcelImportWorkbook(event);
}

function onFileDrop(event: DragEvent) {
  props.workflow.shipmentExcelImportDropzoneActive = false;
  if (!fileSelectionBlocked()) return props.workflow.handleShipmentExcelImportDrop(event);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="workflow.shipmentExcelImportDialogOpen"
      class="customer-code-overlay"
      role="presentation"
      @click.self="workflow.closeShipmentExcelImport"
      @keydown="onDialogKeydown"
    >
      <section
        class="customer-code-dialog shipment-excel-import-dialog"
        ref="dialogElement"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-busy="
          workflow.entryBusy ||
          workflow.shipmentExcelImporting ||
          workflow.shipmentExcelImportParsing
        "
        :aria-label="t('customers.shipmentExcelImport')"
      >
        <div class="shipment-excel-import-heading">
          <div>
            <span class="customer-code-kicker">{{
              t("customers.dialogKickerShipmentExcelImport")
            }}</span>
            <h2>{{ t("customers.shipmentExcelImport") }}</h2>
            <p>{{ t("customers.shipmentExcelImportDescription") }}</p>
          </div>
          <div class="shipment-excel-import-heading-actions">
            <button
              type="button"
              class="manual-add-button"
              :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
              @click="workflow.downloadShipmentExcelTemplate"
            >
              {{ t("customers.downloadShipmentExcelTemplate") }}
            </button>
            <button
              type="button"
              class="shipment-excel-close-button"
              :aria-label="t('customers.close')"
              :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
              @click="workflow.closeShipmentExcelImport"
            >
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>

        <div class="shipment-excel-import-body">
          <fieldset
            class="shipment-dialog-fields"
            :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
          >
            <div class="assignment-customer-row shipment-excel-customer-row">
              <label>
                <span>{{ t("customers.selectCustomerFirst") }} <i class="required-star">*</i></span>
                <el-select
                  v-model="workflow.shipmentExcelCustomerId"
                  filterable
                  :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
                  class="business-select"
                >
                  <el-option
                    v-for="customer in workflow.assignableCustomers"
                    :key="customer.id"
                    :value="customer.id"
                    :label="workflow.customerFilterOptionLabel(customer)"
                  />
                  <template #label="{ value }">
                    <span class="business-select-value">{{
                      workflow.selectedCustomerOptionLabel(value)
                    }}</span>
                  </template>
                </el-select>
              </label>
              <el-checkbox
                :model-value="workflow.shipmentExcelPublishToCustomer"
                @update:model-value="workflow.shipmentExcelPublishToCustomer = $event === true"
                :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
                >{{ t("customers.publishAfterCreate") }}</el-checkbox
              >
            </div>
            <div
              v-loading="workflow.shipmentExcelImportParsing"
              :element-loading-text="t('app.loadingPage')"
              class="customer-excel-dropzone shipment-excel-import-dropzone"
              :class="{
                'has-file': workflow.shipmentExcelImportFileName,
                'is-dragover': workflow.shipmentExcelImportDropzoneActive
              }"
              @dragover.prevent="activateDropzone"
              @dragleave.prevent="workflow.shipmentExcelImportDropzoneActive = false"
              @drop.prevent="onFileDrop"
              :aria-disabled="
                workflow.entryBusy ||
                workflow.shipmentExcelImporting ||
                workflow.shipmentExcelImportParsing
              "
              @click="chooseFile"
            >
              <input
                ref="fileInput"
                :disabled="
                  workflow.entryBusy ||
                  workflow.shipmentExcelImporting ||
                  workflow.shipmentExcelImportParsing
                "
                type="file"
                accept=".xlsx,.xls"
                style="display: none"
                @change="onFileChange"
              />
              <el-icon class="shipment-excel-upload-icon"><Upload /></el-icon>
              <b>{{
                workflow.shipmentExcelImportFileName || t("customers.chooseShipmentExcel")
              }}</b>
              <small>{{
                workflow.shipmentExcelImportFileName
                  ? t("customers.shipmentExcelRowsReady", {
                      count: workflow.shipmentExcelImportPreview.total
                    })
                  : t("customers.shipmentExcelSheetsHint")
              }}</small>
              <button
                type="button"
                :disabled="
                  workflow.entryBusy ||
                  workflow.shipmentExcelImporting ||
                  workflow.shipmentExcelImportParsing
                "
                @click.stop="chooseFile"
              >
                {{
                  workflow.shipmentExcelImportFileName
                    ? t("customers.replaceFile")
                    : t("customers.chooseFile")
                }}
              </button>
            </div>
          </fieldset>
          <div v-if="workflow.shipmentExcelImportFileName" class="shipment-excel-import-summary">
            <span
              ><b>{{ workflow.shipmentExcelImportPreview.total }}</b
              ><small>{{ t("customers.shipmentExcelTotal") }}</small></span
            >
            <span class="is-valid"
              ><b>{{ workflow.shipmentExcelImportPreview.valid }}</b
              ><small>{{ t("customers.shipmentExcelValid") }}</small></span
            >
            <span :class="{ 'is-invalid': workflow.shipmentExcelImportPreview.invalid }"
              ><b>{{ workflow.shipmentExcelImportPreview.invalid }}</b
              ><small>{{ t("customers.shipmentExcelInvalid") }}</small></span
            >
            <span :class="{ 'has-warning': workflow.shipmentExcelImportPreview.warningCount }"
              ><b>{{ workflow.shipmentExcelImportPreview.warningCount }}</b
              ><small>{{ t("customers.shipmentExcelWarnings") }}</small></span
            >
          </div>

          <div
            v-if="workflow.shipmentExcelImportPreview.globalErrors.length"
            class="shipment-excel-import-errors"
          >
            <b>{{ t("customers.shipmentExcelWorkbookErrors") }}</b>
            <ul>
              <li v-for="error in workflow.shipmentExcelImportPreview.globalErrors" :key="error">
                {{ error }}
              </li>
            </ul>
          </div>

          <div
            v-if="workflow.shipmentExcelImportPreview.rows.length"
            class="shipment-excel-import-table-wrap"
          >
            <el-table
              :data="workflow.shipmentExcelImportPreview.rows"
              max-height="440"
              class="standard-information-table shipment-excel-import-table"
              :row-class-name="workflow.shipmentExcelRowClassName"
            >
              <el-table-column prop="rowNumber" :label="t('customers.excelRow')" width="82" />
              <el-table-column :label="t('customers.importKey')" min-width="150">
                <template #default="{ row }"
                  ><b>{{ row.importKey || "—" }}</b></template
                >
              </el-table-column>
              <el-table-column prop="carrier" :label="t('customers.carrier')" width="110" />
              <el-table-column
                prop="referenceType"
                :label="t('customers.referenceType')"
                min-width="135"
              />
              <el-table-column
                prop="referenceNo"
                :label="t('customers.referenceNo')"
                min-width="155"
              />
              <el-table-column :label="t('customers.importStatus')" width="120">
                <template #default="{ row }">
                  <span :class="row.errors.length ? 'import-state-error' : 'import-state-ready'">
                    {{
                      row.errors.length ? t("customers.importNeedsFix") : t("customers.importReady")
                    }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('customers.validationMessage')" min-width="300">
                <template #default="{ row }">
                  <div v-if="row.errors.length" class="shipment-excel-validation-list is-error">
                    <span
                      v-for="(message, index) in row.errors"
                      :key="`${row.rowNumber}-error-${index}`"
                      >{{ message }}</span
                    >
                  </div>
                  <div
                    v-else-if="row.warnings.length"
                    class="shipment-excel-validation-list is-warning"
                  >
                    <span
                      v-for="(message, index) in row.warnings"
                      :key="`${row.rowNumber}-warning-${index}`"
                      >{{ message }}</span
                    >
                  </div>
                  <span v-else class="shipment-excel-validation-empty">—</span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <section
            v-if="workflow.shipmentExcelImporting || workflow.shipmentExcelImportResults.length"
            class="shipment-excel-import-progress"
          >
            <div>
              <b>{{
                t("customers.shipmentExcelImportProgress", {
                  ...workflow.shipmentExcelImportProgress
                })
              }}</b>
              <el-progress
                :percentage="
                  workflow.shipmentExcelImportProgress.total
                    ? Math.round(
                        (workflow.shipmentExcelImportProgress.done /
                          workflow.shipmentExcelImportProgress.total) *
                          100
                      )
                    : 0
                "
                :stroke-width="7"
              />
            </div>
            <div
              v-if="workflow.shipmentExcelImportResults.length"
              class="shipment-excel-import-result-list"
            >
              <span
                v-for="result in workflow.shipmentExcelImportResults"
                :key="result.importKey"
                :class="
                  result.status === 'CREATED'
                    ? 'is-created'
                    : result.status === 'UPDATED'
                      ? 'is-updated'
                      : result.status === 'SKIPPED'
                        ? 'is-skipped'
                        : result.status === 'FAILED'
                          ? 'is-failed'
                          : result.status === 'NOT_SUBMITTED'
                            ? 'is-not-submitted'
                            : 'is-pending'
                "
              >
                <b>{{ result.referenceNo || result.importKey }}</b>
                <small>{{ result.message }}</small>
              </span>
            </div>
          </section>
        </div>

        <div class="customer-dialog-actions shipment-excel-import-actions">
          <button
            v-if="workflow.shipmentExcelImportResults.length"
            type="button"
            :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
            @click="workflow.downloadShipmentExcelImportResults"
          >
            {{ t("customers.downloadImportResults") }}
          </button>
          <button
            type="button"
            :disabled="workflow.entryBusy || workflow.shipmentExcelImporting"
            @click="workflow.closeShipmentExcelImport"
          >
            {{ t("customers.cancel") }}
          </button>
          <button
            class="customer-access-primary"
            type="button"
            :disabled="!workflow.canStartShipmentExcelImport"
            @click="workflow.startShipmentExcelImport"
          >
            {{
              workflow.shipmentExcelImporting
                ? t("customers.importing")
                : t("customers.importValidShipments", {
                    count: workflow.shipmentExcelImportPreview.valid
                  })
            }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./shipmentEntryDialogs.css"></style>
