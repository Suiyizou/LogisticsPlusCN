<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><WorkspaceDialogTransition
        ><div
          v-if="batchImportDialogOpen"
          class="customer-code-overlay"
          role="presentation"
          @keydown="onDialogKeydown"
        >
          <section
            class="customer-code-dialog customer-batch-dialog workspace-modal--wide"
            ref="dialogElement"
            tabindex="-1"
            role="dialog"
            :aria-busy="importingCustomers"
            aria-modal="true"
            :aria-label="t('customers.batchImport')"
          >
            <header class="customer-batch-heading">
              <div>
                <span class="customer-code-kicker">{{
                  t("customers.dialogKickerProvisioning")
                }}</span>
                <h2>{{ t("customers.batchImport") }}</h2>
                <p>{{ t("customers.batchImportDescription") }}</p>
              </div>
              <button
                class="customer-template-button"
                type="button"
                @click="downloadCustomerImportTemplate"
              >
                {{ t("customers.downloadCustomerTemplate") }}
              </button>
            </header>

            <div class="customer-batch-body">
              <section class="customer-import-rules" :aria-label="t('customers.importRulesTitle')">
                <header>
                  <b>{{ t("customers.importRulesTitle") }}</b>
                  <small>{{ t("customers.importRulesHint") }}</small>
                </header>
                <div>
                  <article>
                    <strong>01</strong
                    ><span
                      ><b>{{ t("customers.usernameRuleTitle") }}</b
                      ><small>{{ t("customers.usernameRule") }}</small></span
                    >
                  </article>
                  <article>
                    <strong>02</strong
                    ><span
                      ><b>{{ t("customers.passwordRuleTitle") }}</b
                      ><small>{{ t("customers.passwordRule") }}</small></span
                    >
                  </article>
                  <article>
                    <strong>03</strong
                    ><span
                      ><b>{{ t("customers.clientCodeRuleTitle") }}</b
                      ><small>{{ t("customers.clientCodeRule") }}</small></span
                    >
                  </article>
                  <article>
                    <strong>04</strong
                    ><span
                      ><b>{{ t("customers.displayNameRuleTitle") }}</b
                      ><small>{{ t("customers.displayNameRule") }}</small></span
                    >
                  </article>
                  <article>
                    <strong>05</strong
                    ><span
                      ><b>{{ t("customers.roleRuleTitle") }}</b
                      ><small>{{ t("customers.roleRule") }}</small></span
                    >
                  </article>
                </div>
              </section>

              <div class="customer-batch-tabs">
                <button
                  type="button"
                  :class="{ 'is-active': batchImportMode === 'quick' }"
                  :disabled="importingCustomers"
                  @click="selectCustomerBatchMode('quick')"
                >
                  {{ t("customers.quickImport") }}
                </button>
                <button
                  type="button"
                  :class="{ 'is-active': batchImportMode === 'excel' }"
                  :disabled="importingCustomers"
                  @click="selectCustomerBatchMode('excel')"
                >
                  {{ t("customers.excelImport") }}
                </button>
              </div>

              <label v-if="batchImportMode === 'quick'" class="customer-batch-textarea">
                <span>{{ t("customers.quickImportNames") }}</span>
                <textarea
                  v-model="quickImportText"
                  :disabled="importingCustomers"
                  :placeholder="t('customers.quickImportPlaceholder')"
                ></textarea>
                <small>{{ t("customers.quickImportHint") }}</small>
              </label>
              <div
                role="button"
                tabindex="0"
                @keydown.enter.prevent="batchFileInput?.click()"
                @keydown.space.prevent="batchFileInput?.click()"
                v-else
                v-loading="customerFileParsing"
                :element-loading-text="t('app.loadingPage')"
                class="customer-excel-dropzone customer-import-dropzone"
                :class="{ 'has-file': batchFileName, 'is-dragover': batchDropzoneActive }"
                @dragover.prevent="batchDropzoneActive = true"
                @dragleave.prevent="batchDropzoneActive = false"
                @drop.prevent="handleBatchDrop"
                @click="batchFileInput?.click()"
              >
                <input
                  :ref="actions.setFileInput"
                  :disabled="importingCustomers"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  @change="handleCustomerWorkbook"
                  style="display: none"
                />
                <b>{{ batchFileName || t("customers.chooseExcel") }}</b>
                <small>{{
                  batchFileName
                    ? t("customers.rowsReady", { count: activeCustomerBatchPreview.total })
                    : t("customers.excelColumnsHint")
                }}</small>
                <button type="button" @click.stop="batchFileInput?.click()">
                  {{ batchFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}
                </button>
              </div>

              <div v-if="batchPreviewError" class="customer-import-file-error" role="alert">
                <b>{{ t("customers.fileLevelError") }}</b>
                <span>{{ batchPreviewError }}</span>
              </div>
              <div
                v-for="problem in activeCustomerBatchPreview.globalErrors"
                :key="`${problem.code}-${problem.value || ''}`"
                class="customer-import-file-error"
                role="alert"
              >
                <b>{{ t("customers.fileLevelError") }}</b>
                <span>{{ customerImportIssueText(problem) }}</span>
              </div>

              <template v-if="activeCustomerBatchPreview.total">
                <div class="customer-import-summary">
                  <span
                    ><b>{{ activeCustomerBatchPreview.total }}</b
                    ><small>{{ t("customers.importTotalRows") }}</small></span
                  >
                  <span class="is-valid"
                    ><b>{{ activeCustomerBatchPreview.valid }}</b
                    ><small>{{ t("customers.importValidRows") }}</small></span
                  >
                  <span class="is-invalid"
                    ><b>{{ activeCustomerBatchPreview.invalid }}</b
                    ><small>{{ t("customers.importInvalidRows") }}</small></span
                  >
                  <span class="is-warning"
                    ><b>{{ activeCustomerBatchPreview.warningCount }}</b
                    ><small>{{ t("customers.importWarningRows") }}</small></span
                  >
                </div>

                <div class="customer-import-preview">
                  <el-table
                    :data="activeCustomerBatchPreview.rows"
                    border
                    max-height="440"
                    class="standard-information-table customer-import-preview-table"
                  >
                    <el-table-column :label="t('customers.excelRow')" width="82">
                      <template #default="{ row }"
                        ><b>#{{ row.rowNumber }}</b></template
                      >
                    </el-table-column>
                    <el-table-column :label="t('customers.createAccount')" min-width="145">
                      <template #default="{ row }"
                        ><b>{{ row.username || "—" }}</b></template
                      >
                    </el-table-column>
                    <el-table-column
                      prop="displayName"
                      :label="t('customers.createDisplayName')"
                      min-width="150"
                    />
                    <el-table-column :label="t('customers.initialPassword')" min-width="160">
                      <template #default="{ row }">
                        <span
                          class="customer-import-value-pill"
                          :class="{ 'is-generated': !row.passwordProvided }"
                        >
                          {{
                            row.passwordProvided
                              ? t("customers.passwordProvided", { count: row.password.length })
                              : t("customers.systemGenerated")
                          }}
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('customers.clientCode')" min-width="135">
                      <template #default="{ row }">{{
                        row.clientCode || t("customers.systemGenerated")
                      }}</template>
                    </el-table-column>
                    <el-table-column :label="t('customers.createPartyRole')" min-width="140">
                      <template #default="{ row }">{{
                        customerPartyRoleLabel(row.partyRole)
                      }}</template>
                    </el-table-column>
                    <el-table-column :label="t('customers.validationMessage')" min-width="300">
                      <template #default="{ row }">
                        <span
                          v-if="row.errors.length"
                          class="customer-import-validation-pill is-error"
                        >
                          {{ t("customers.validationErrorCount", { count: row.errors.length }) }}
                        </span>
                        <span
                          v-else-if="row.warnings.length"
                          class="customer-import-validation-pill is-warning"
                        >
                          {{
                            t("customers.validationWarningCount", { count: row.warnings.length })
                          }}
                        </span>
                        <span v-else class="customer-import-ready">{{
                          t("customers.importReady")
                        }}</span>
                        <div
                          v-if="row.errors.length || row.warnings.length"
                          class="customer-import-issues"
                        >
                          <span
                            v-for="problem in row.errors"
                            :key="`error-${problem.field}-${problem.code}`"
                            class="is-error"
                          >
                            <b>{{ customerImportFieldLabel(problem.field) }}</b
                            >{{ customerImportIssueText(problem) }}
                          </span>
                          <span
                            v-for="problem in row.warnings"
                            :key="`warning-${problem.field}-${problem.code}`"
                            class="is-warning"
                          >
                            <b>{{ customerImportFieldLabel(problem.field) }}</b
                            >{{ customerImportIssueText(problem) }}
                          </span>
                        </div>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
            </div>

            <footer class="customer-dialog-actions customer-batch-actions">
              <small v-if="activeCustomerBatchPreview.invalid">{{
                t("customers.fixInvalidRowsBeforeImport")
              }}</small>
              <button type="button" @click="closeBatchImport">{{ t("customers.cancel") }}</button>
              <button
                class="customer-access-primary"
                type="button"
                :disabled="!canSubmitCustomerBatchImport"
                @click="submitBatchImport"
              >
                {{
                  importingCustomers
                    ? t("customers.importing")
                    : t("customers.confirmImportCount", { count: activeCustomerBatchPreview.valid })
                }}
              </button>
            </footer>
          </section>
        </div></WorkspaceDialogTransition
      ></Teleport
    >
  </div>
</template>
<script setup lang="ts">
import WorkspaceDialogTransition from "../../../components/workspace/WorkspaceDialogTransition.vue";
import { toRefs, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { useDialogFocus } from "../../../composables/useDialogFocus.js";
const { t } = useI18n();
const workspace = useModulePages("customers").importDialog;
const {
  activeCustomerBatchPreview,
  batchDropzoneActive,
  batchFileInput,
  batchFileName,
  batchImportDialogOpen,
  batchImportMode,
  batchPreviewError,
  canSubmitCustomerBatchImport,
  customerFileParsing,
  importingCustomers,
  quickImportText
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  closeBatchImport,
  downloadCustomerImportTemplate,
  handleBatchDrop,
  handleCustomerWorkbook,
  selectCustomerBatchMode,
  submitBatchImport
} = actions;
const { customerImportFieldLabel, customerImportIssueText, customerPartyRoleLabel } =
  workspace.formatters;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(batchImportDialogOpen.value),
  isBusy: () => Boolean(importingCustomers.value),
  close: closeBatchImport
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.customer-batch-dialog {
  position: relative;
  width: min(1180px, calc(100vw - 48px));
  max-height: min(92vh, 980px);
  padding: 26px 28px 0;
  overflow: hidden;
  background: var(--color-surface-subtle);
}
.customer-batch-dialog::before {
  position: absolute;
  top: 0;
  left: 28px;
  right: 28px;
  height: 3px;
  border-radius: var(--radius-dialog);
  background: var(--color-surface-subtle);
  background-size: 200% 100%;
  content: "";
  animation: customer-batch-shimmer 3.5s linear infinite;
}
.customer-import-rules {
  display: grid;
  padding: 14px;
  border: 1px solid #dbe6f0;
  border-radius: var(--radius-control);
  background: #f8fbfe;
  gap: 12px;
}
.customer-import-rules > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.customer-import-rules > header b {
  color: #1c3d5a;
  font-size: 13px;
}
.customer-import-rules > header small {
  color: #73899e;
  font-size: 12px;
}
.customer-import-rules > div {
  display: grid;
  margin: 0;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.customer-import-rules article {
  display: flex;
  min-width: 0;
  padding: 10px;
  border: 1px solid #e2eaf2;
  border-radius: var(--radius-control);
  background: #fff;
  gap: 9px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
  animation: customer-rule-in 360ms ease both;
}
.customer-import-rules article:nth-child(2) {
  animation-delay: 45ms;
}
.customer-import-rules article:nth-child(3) {
  animation-delay: 90ms;
}
.customer-import-rules article:nth-child(4) {
  animation-delay: 135ms;
}
.customer-import-rules article:nth-child(5) {
  animation-delay: 180ms;
}
.customer-import-rules article:hover {
  border-color: #9bc5e8;
  box-shadow: none;
  transform: translateY(-2px);
}
.customer-import-rules article > strong {
  display: inline-grid;
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-control);
  color: #3479ba;
  background: #eaf4ff;
  place-items: center;
  font-size: 12px;
}
.customer-import-rules article > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.customer-import-rules article b {
  color: #294b68;
  font-size: 12px;
}
.customer-import-rules article small {
  color: #72879b;
  font-size: 12px;
  line-height: 1.55;
}
.customer-batch-tabs {
  display: flex;
  margin: 0 !important;
  gap: 4px;
}
.customer-batch-tabs button {
  flex: 1;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #d4e0ed;
  border-radius: var(--radius-control);
  color: #6c8196;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}
.customer-batch-tabs button:hover {
  border-color: #8dbbe3;
  transform: translateY(-1px);
}
.customer-batch-tabs button.is-active {
  color: #1a4f80;
  border-color: #4086d2;
  background: #eaf3fc;
}
.customer-batch-textarea {
  display: grid;
  gap: 6px;
}
.customer-batch-textarea textarea {
  min-height: 120px;
  padding: 10px;
  border: 1px solid #cfdeec;
  border-radius: var(--radius-control);
  resize: vertical;
  font: inherit;
  font-size: 12px;
  background: var(--color-surface-subtle);
  box-shadow: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}
.customer-batch-textarea textarea:focus {
  border-color: #438fd2;
  box-shadow: none;
  outline: none;
}
.customer-batch-textarea small {
  color: #889aaf;
  font-size: 12px;
}
.customer-import-dropzone {
  min-height: 116px;
  padding: 20px 16px;
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
.customer-import-preview {
  max-height: 340px;
  margin: 0 !important;
  border: 1px solid #dce6ef;
  border-radius: 0;
  overflow: auto;
}
.customer-import-preview table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
  table-layout: fixed;
}
.customer-import-preview th,
.customer-import-preview td {
  padding: 10px 11px;
  border-bottom: 1px solid #e8eef4;
  color: #405c74;
  font-size: 12px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.customer-import-preview th {
  position: sticky;
  top: 0;
  z-index: 2;
  color: #49647c;
  background: #f4f7fa;
  font-size: 12px;
  letter-spacing: 0.04em;
}
.customer-import-preview th:nth-child(1) {
  width: 70px;
}
.customer-import-preview th:nth-child(2) {
  width: 145px;
}
.customer-import-preview th:nth-child(3) {
  width: 150px;
}
.customer-import-preview th:nth-child(4) {
  width: 132px;
}
.customer-import-preview th:nth-child(5) {
  width: 145px;
}
.customer-import-preview th:nth-child(6) {
  width: 135px;
}
.customer-import-preview th:nth-child(7) {
  width: 108px;
}
.customer-import-preview tr.is-invalid td {
  background: #fff9fa;
}
.customer-import-value-pill,
.customer-import-ready {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: var(--radius-control);
  color: #237356;
  background: #eaf8f2;
  font-size: 12px;
  font-weight: 600;
}
.customer-import-value-pill.is-generated {
  color: #7f5d18;
  background: #fff7df;
}
.customer-import-validation-pill {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: var(--radius-control);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.customer-import-validation-pill.is-error {
  color: #a73d4c;
  background: #fff0f2;
}
.customer-import-validation-pill.is-warning {
  color: #84611a;
  background: #fff8e8;
}
.customer-import-issues {
  display: flex !important;
  flex-wrap: wrap;
  margin: 0 !important;
  gap: 5px !important;
}
.customer-import-issues > span {
  display: block;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  font-size: 12px;
  line-height: 1.5;
}
.customer-import-issues > .is-error {
  color: #a73d4c;
  background: #fff0f2;
}
.customer-import-issues > .is-warning {
  color: #84611a;
  background: #fff8e8;
}
.customer-import-issues b {
  margin-right: 3px;
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
@media (max-width: 760px) {
  .customer-batch-dialog {
    width: calc(100vw - 24px);
    max-height: 94vh;
    padding: 20px 18px 0;
  }
  .customer-batch-heading {
    display: grid;
  }
  .customer-template-button {
    width: 100%;
  }
  .customer-import-rules > div {
    grid-template-columns: 1fr;
  }
  .customer-import-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .customer-batch-actions {
    margin: 0 -18px !important;
    padding-inline: 18px;
    flex-wrap: wrap;
  }
  .customer-batch-actions > small {
    width: 100%;
  }
  .customer-batch-actions button {
    flex: 1 1 140px !important;
    min-width: 0;
  }
}
</style>

<style scoped src="../../../components/workspace/workspaceDialogStyles.css"></style>
