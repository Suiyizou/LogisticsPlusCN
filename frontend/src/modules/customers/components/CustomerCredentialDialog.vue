<template>
  <div data-i18n-ignore>
    <Teleport to="body"
      ><WorkspaceDialogTransition
        ><div
          v-if="batchCredentialRows.length"
          class="customer-code-overlay"
          role="presentation"
          @keydown="onDialogKeydown"
        >
          <section
            class="business-comp-dialog customer-code-dialog customer-credential-dialog workspace-modal--wide"
            ref="dialogElement"
            tabindex="-1"
            role="dialog"
            :aria-busy="exportingCredentials"
            aria-modal="true"
            :aria-label="t('customers.batchCredentialTitle')"
          >
            <header class="customer-batch-heading">
              <div>
                <span class="customer-code-kicker">{{
                  t("customers.dialogKickerCredentialExport")
                }}</span>
                <h2>{{ t("customers.batchCredentialTitle") }}</h2>
                <p>{{ t("customers.batchCredentialDescription") }}</p>
              </div>
              <button
                type="button"
                :disabled="exportingCredentials"
                class="customer-template-button"
                @click="downloadCredentialWorkbook"
              >
                {{
                  exportingCredentials
                    ? t("customers.preparingExport")
                    : t("customers.exportCredentials")
                }}
              </button>
            </header>

            <div class="customer-credential-body">
              <div v-if="credentialExportError" class="customer-import-file-error" role="alert">
                {{ credentialExportError }}
              </div>
              <div class="customer-import-summary">
                <span
                  ><b>{{ batchCredentialSummary.total }}</b
                  ><small>{{ t("customers.importTotalRows") }}</small></span
                >
                <span class="is-valid"
                  ><b>{{ batchCredentialSummary.created }}</b
                  ><small>{{ t("customers.importCreatedCount") }}</small></span
                >
                <span class="is-invalid"
                  ><b>{{ batchCredentialSummary.failed }}</b
                  ><small>{{ t("customers.importFailedCount") }}</small></span
                >
              </div>
              <div v-if="batchCredentialSummary.failed" class="customer-import-file-error">
                <b>{{ t("customers.importFailureExplanation") }}</b>
                <span>{{ t("customers.importFailureHint") }}</span>
              </div>
              <div class="customer-credential-table">
                <div class="customer-credential-table-head">
                  <span>{{ t("customers.excelRow") }}</span>
                  <span>{{ t("customers.createAccount") }}</span>
                  <span>{{ t("customers.createDisplayName") }}</span>
                  <span>{{ t("customers.clientCode") }}</span>
                  <span>{{ t("customers.initialPassword") }}</span>
                  <span>{{ t("customers.importStatus") }}</span>
                </div>
                <div
                  v-for="row in batchCredentialRows"
                  :key="`${row.rowNumber}-${row.username}`"
                  class="customer-credential-entry"
                  :class="{ 'is-failed': row.status !== 'CREATED' }"
                >
                  <div class="customer-credential-row">
                    <span
                      ><b>#{{ row.rowNumber }}</b></span
                    >
                    <span
                      ><b>{{ row.username || "—" }}</b></span
                    >
                    <span>{{ row.displayName || row.username || "—" }}</span>
                    <span>{{ row.customerCode || row.clientCode || "—" }}</span>
                    <span class="customer-credential-password">{{ row.password || "—" }}</span>
                    <span
                      ><i :class="row.status === 'CREATED' ? 'is-created' : 'is-failed'">{{
                        row.status === "CREATED"
                          ? t("customers.importCreated")
                          : t("customers.importFailedStatus")
                      }}</i></span
                    >
                  </div>
                  <div v-if="row.status !== 'CREATED'" class="customer-credential-message">
                    <b>{{ t("customers.failureReason") }}</b>
                    <span>{{ localizeCustomerImportResult(row.message) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <footer class="customer-dialog-actions customer-batch-actions">
              <small>{{ t("customers.credentialsSaveReminder") }}</small>
              <button class="customer-access-primary" type="button" @click="closeBatchCredentials">
                {{ t("customers.confirmStored") }}
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
const workspace = useModulePages("customers").credentialDialog;
const { batchCredentialRows, batchCredentialSummary, credentialExportError, exportingCredentials } =
  toRefs(workspace.state);
const actions = workspace.actions;
const { closeBatchCredentials, downloadCredentialWorkbook } = actions;
const { localizeCustomerImportResult } = workspace.formatters;
const dialogElement = ref(null);
const { onDialogKeydown } = useDialogFocus({
  dialogElement,
  isOpen: () => Boolean(batchCredentialRows.value.length),
  isBusy: () => Boolean(exportingCredentials.value),
  close: closeBatchCredentials
});
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.customer-credential-dialog {
  position: relative;
  width: min(1180px, calc(100vw - 48px));
  max-height: min(92vh, 980px);
  padding: 26px 28px 0;
  overflow: hidden;
  background: var(--color-surface-subtle);
}
.customer-credential-dialog .customer-credential-body {
  max-height: calc(min(92vh, 980px) - 174px);
}
.customer-credential-dialog .customer-import-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.customer-credential-table {
  border: 1px solid #e0e7f0;
  border-radius: var(--radius-control);
  max-height: 460px;
  overflow: auto;
}
.customer-credential-table-head,
.customer-credential-row {
  display: grid;
  min-width: 820px;
  grid-template-columns: 58px 130px 145px 130px minmax(150px, 1fr) 90px;
  align-items: start;
  gap: 10px;
  padding: 10px 12px;
  font-size: 12px;
}
.customer-credential-table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f4f7fb;
  color: #5e7794;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.04em;
}
.customer-credential-entry {
  min-width: 820px;
  border-bottom: 1px solid #eef2f7;
}
.customer-credential-entry.is-failed {
  background: #fff8f8;
}
.customer-credential-entry:last-child {
  border-bottom: 0;
}
.customer-credential-password {
  color: #204d70;
  font-family: var(--font-ui);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.customer-credential-row i {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: var(--radius-control);
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
}
.customer-credential-row i.is-created {
  color: #197454;
  background: #e9f8f1;
}
.customer-credential-row i.is-failed {
  color: #a93e4e;
  background: #ffeaed;
}
.customer-credential-message {
  display: flex;
  margin: 0 12px 10px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  color: #7b5360;
  background: #fff0f2;
  line-height: 1.6;
  overflow-wrap: anywhere;
  gap: 8px;
}
.customer-credential-message b {
  flex: 0 0 auto;
  color: #a93e4e;
}
@media (max-width: 760px) {
  .customer-credential-dialog {
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
