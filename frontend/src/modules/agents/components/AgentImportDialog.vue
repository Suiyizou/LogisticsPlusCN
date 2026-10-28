<template>
  <div data-i18n-ignore>
    <el-dialog
      :model-value="agentBatchDialogOpen"
      :before-close="closeAgentBatchImport"
      :title="t('customers.batchCreateAgents')"
      width="min(940px, 94vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!importingAgents"
      class="square-dialog agent-batch-dialog"
      :show-close="!importingAgents"
    >
      <div class="agent-batch-intro">
        <div>
          <span class="customer-code-kicker">{{ t("customers.agentBatchKicker") }}</span>
          <h3>{{ t("customers.agentBatchTitle") }}</h3>
          <p>{{ t("customers.agentBatchHint") }}</p>
        </div>
        <el-button type="primary" plain @click="downloadAgentImportTemplate">
          <el-icon><Document /></el-icon>{{ t("customers.downloadAgentTemplate") }}
        </el-button>
      </div>
      <div
        v-loading="parsingAgentFile"
        class="agent-import-dropzone"
        :class="{ 'has-file': agentBatchFileName, 'is-dragover': agentBatchDropzoneActive }"
        @dragover.prevent="agentBatchDropzoneActive = true"
        @dragleave.prevent="agentBatchDropzoneActive = false"
        @drop.prevent="handleAgentBatchDrop"
        @click="agentBatchFileInput?.click()"
      >
        <input
          :ref="actions.setFileInput"
          :disabled="importingAgents"
          type="file"
          accept=".xlsx,.xls,.csv"
          @change="handleAgentWorkbook"
        />
        <span
          ><el-icon><Upload /></el-icon
        ></span>
        <b>{{ agentBatchFileName || t("customers.chooseAgentExcel") }}</b>
        <small>{{ t("customers.agentExcelColumns") }}</small>
        <el-button size="small" @click.stop="agentBatchFileInput?.click()">
          {{ agentBatchFileName ? t("customers.replaceFile") : t("customers.chooseFile") }}
        </el-button>
      </div>
      <div v-if="agentBatchRows.length" class="agent-batch-summary">
        <span
          ><b>{{ agentBatchRows.length }}</b
          ><small>{{ t("customers.importTotalRows") }}</small></span
        >
        <span class="is-valid"
          ><b>{{ agentBatchReadyCount }}</b
          ><small>{{ t("customers.importValidRows") }}</small></span
        >
        <span class="is-invalid"
          ><b>{{ agentBatchInvalidCount }}</b
          ><small>{{ t("customers.importInvalidRows") }}</small></span
        >
        <span class="is-created"
          ><b>{{ agentBatchCreatedCount }}</b
          ><small>{{ t("customers.importCreatedCount") }}</small></span
        >
      </div>
      <el-table
        v-if="agentBatchRows.length"
        :data="agentBatchRows"
        max-height="360"
        stripe
        border
        class="standard-information-table agent-batch-preview"
        :row-class-name="agentBatchRowClass"
      >
        <el-table-column prop="rowNumber" :label="t('customers.excelRow')" width="78" />
        <el-table-column
          prop="username"
          :label="t('customers.username')"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="displayName"
          :label="t('customers.displayName')"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column :label="t('customers.initialPassword')" min-width="155">
          <template #default="{ row }"
            ><span class="agent-password-mask">{{
              "•".repeat(Math.min(row.password.length, 12))
            }}</span></template
          >
        </el-table-column>
        <el-table-column :label="t('customers.validationMessage')" min-width="280">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'CREATED'" size="small" type="success">{{
              t("customers.importCreatedCount")
            }}</el-tag>
            <el-tag v-else-if="row.status === 'FAILED'" size="small" type="danger">{{
              row.resultMessage
            }}</el-tag>
            <div v-else-if="row.errors.length" class="agent-row-errors">
              <span v-for="error in row.errors" :key="error">{{ error }}</span>
            </div>
            <el-tag v-else size="small" type="success" effect="plain">{{
              t("customers.importReady")
            }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-alert
        v-if="agentBatchError"
        :title="agentBatchError"
        type="error"
        :closable="false"
        show-icon
      />
      <template #footer>
        <el-button :disabled="importingAgents" @click="closeAgentBatchImport">{{
          t("customers.cancel")
        }}</el-button>
        <el-button
          type="primary"
          :loading="importingAgents"
          :disabled="
            agentWriteBusy ||
            parsingAgentFile ||
            !agentBatchReadyCount ||
            agentBatchInvalidCount > 0
          "
          @click="submitAgentBatchImport"
        >
          {{
            importingAgents
              ? t("customers.importing")
              : t("customers.importAgentsCount", { count: agentBatchReadyCount })
          }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { useModulePages } from "../../moduleContext.js";
import { Document, Upload } from "@element-plus/icons-vue";
const { t } = useI18n();
const workspace = useModulePages("agents").importDialog;
const {
  agentBatchCreatedCount,
  agentBatchDialogOpen,
  agentBatchDropzoneActive,
  agentBatchError,
  agentBatchFileInput,
  agentBatchFileName,
  agentBatchInvalidCount,
  agentBatchReadyCount,
  agentBatchRows,
  agentWriteBusy,
  importingAgents,
  parsingAgentFile
} = toRefs(workspace.state);
const actions = workspace.actions;
const {
  closeAgentBatchImport,
  downloadAgentImportTemplate,
  handleAgentBatchDrop,
  handleAgentWorkbook,
  submitAgentBatchImport
} = actions;
const { agentBatchRowClass } = workspace.formatters;
</script>
<style scoped src="../../shared/styles/businessDialogs.css"></style>
<style scoped>
.agent-batch-intro {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
  padding: 15px;
  border: 1px solid #d6e5f2;
  border-radius: 4px;
  background: var(--color-surface-subtle);
}
.agent-batch-intro {
  justify-content: space-between;
  align-items: center;
}
.agent-batch-intro > div {
  display: grid;
  gap: 4px;
}
.agent-batch-intro h3 {
  margin: 0;
  color: #1d3b55;
  font-size: 16px;
}
.agent-batch-intro p {
  margin: 0;
  color: #73899d;
  font-size: 10px;
}
.agent-import-dropzone {
  display: grid;
  min-height: 148px;
  padding: 22px;
  border: 1px dashed #abc8df;
  border-radius: 4px;
  color: #58758e;
  background: var(--color-surface-subtle);
  place-items: center;
  gap: 7px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}
.agent-import-dropzone:hover,
.agent-import-dropzone.is-dragover {
  border-color: #438fca;
  background-color: #f1f8ff;
  transform: translateY(-2px);
}
.agent-import-dropzone.has-file {
  border-color: #63b694;
  background-color: #f3fcf7;
}
.agent-import-dropzone input {
  display: none;
}
.agent-import-dropzone > span {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 4px;
  color: #2f78b4;
  background: #e5f2fd;
  place-items: center;
  font-size: 17px;
}
.agent-import-dropzone b {
  color: #264964;
  font-size: 12px;
}
.agent-import-dropzone small {
  color: #8498aa;
  font-size: 9px;
}
.agent-batch-summary {
  display: grid;
  margin: 14px 0 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.agent-batch-summary > span {
  display: grid;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid #dce6ef;
  border-radius: 4px;
  background: #f7fafc;
  align-content: center;
  gap: 2px;
}
.agent-batch-summary b {
  color: #274a65;
  font-size: 20px;
}
.agent-batch-summary small {
  color: #8397aa;
  font-size: 9px;
}
.agent-batch-summary .is-valid {
  border-color: #bde3d2;
  background: #f1fbf6;
}
.agent-batch-summary .is-invalid {
  border-color: #efc4ca;
  background: #fff5f6;
}
.agent-batch-summary .is-created {
  border-color: #bed9ee;
  background: #f1f8fe;
}
.agent-batch-preview {
  margin-bottom: 12px;
}
.agent-batch-preview :deep(.is-invalid td) {
  background: #fff7f8 !important;
}
.agent-batch-preview :deep(.is-created td) {
  background: #f4fbf7 !important;
}
.agent-password-mask {
  color: #667f94;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  letter-spacing: 0.08em;
}
.agent-row-errors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.agent-row-errors span {
  padding: 4px 6px;
  border-radius: 4px;
  color: #9c3d4b;
  background: #fff0f2;
  font-size: 9px;
}
@media (max-width: 680px) {
  .agent-batch-intro {
    align-items: stretch;
    flex-direction: column;
  }
  .agent-batch-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
