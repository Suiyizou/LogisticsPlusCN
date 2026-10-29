<template>
  <section
    class="algorithm-page excel-template-page"
    :class="{
      'is-coordinated': coordinated,
      'is-text-import': recognitionInput === 'text',
      'has-recognition-result': recognitionHasResult
    }"
    data-i18n-ignore
  >
    <WorkspacePageHeader
      v-if="!coordinated"
      :title="ui('excel.importCargoTitle')"
      :eyebrow="ui('excel.importCargoEyebrow')"
      :description="wt('importCargoHint')"
    />

    <div class="excel-workspace-layout">
      <div class="excel-main-pane">
        <div
          v-if="excelMode === 'manual'"
          id="cargo-import-panel"
          class="excel-import-card excel-manual-card"
          role="tabpanel"
          aria-labelledby="quick-import-tab"
          :class="{ 'is-dragging': manualDropActive, 'is-busy': importBusy }"
          @dragenter.prevent="handleManualDragEnter"
          @dragover.prevent="handleManualDragOver"
          @dragleave.prevent="handleManualDragLeave"
          @drop.prevent="handleManualDrop"
        >
          <div class="excel-import-hero">
            <div>
              <strong>{{ ui("excel.manualPath") }}</strong>
              <p>{{ ui("excel.manualPathText") }}</p>
            </div>
            <div class="excel-import-actions">
              <input
                ref="manualFileInput"
                hidden
                type="file"
                multiple
                :accept="WORKBOOK_FILE_ACCEPT"
                @change="handleFile"
              />
              <el-button
                type="primary"
                :loading="manualImportBusy || previewBusy"
                @click="openManualFilePicker"
              >
                {{ ui("common.chooseFile") }}
              </el-button>
              <el-button
                :disabled="!workbook || manualQueueProcessing"
                @click="openManualWorkbookPreview"
                >{{ ui("excel.previewWorkbook") }}</el-button
              >
              <el-button @click="openWorkspaceFiles('manual')">{{
                ui("excel.workspaceFiles")
              }}</el-button>
            </div>
          </div>

          <el-alert
            class="quick-import-check-alert"
            type="warning"
            show-icon
            :closable="false"
            :title="ui('excel.quickImportCheckTitle')"
            :description="ui('excel.quickImportCheckDescription')"
          />

          <div
            class="excel-drop-zone"
            :class="{ active: manualDropActive }"
            role="button"
            tabindex="0"
            @click="openManualFilePicker"
            @keydown.enter.prevent="openManualFilePicker"
            @keydown.space.prevent="openManualFilePicker"
          >
            <el-icon class="excel-drop-icon"><UploadFilled /></el-icon>
            <div class="excel-drop-copy">
              <strong>
                {{
                  ui(
                    importBusy
                      ? "excel.dropBusy"
                      : manualDropActive
                        ? "excel.dropRelease"
                        : "excel.dropToRecognize"
                  )
                }}
              </strong>
              <span>{{ ui("excel.dropSupportText") }}</span>
            </div>
            <span class="excel-drop-formats">XLSX / XLS / CSV / TSV</span>
          </div>

          <div v-if="manualFileQueue.length" class="import-file-queue">
            <header>
              <strong>{{ ui("excel.fileQueue") }}</strong>
              <span>{{ ui("excel.fileQueueCount", { count: manualFileQueue.length }) }}</span>
            </header>
            <div class="import-file-queue-list">
              <button
                v-for="item in manualFileQueue"
                :key="item.id"
                type="button"
                class="import-file-queue-item"
                :class="{ active: item.id === activeManualFileId }"
                :disabled="!item.snapshot || manualQueueProcessing"
                @click="selectManualQueueItem(item)"
              >
                <span class="import-file-name">{{ item.file.name }}</span>
                <small>{{ formatFileSize(item.file.size) }}</small>
                <em :class="`status-${item.status}`">{{ queueStatusText(item.status) }}</em>
              </button>
            </div>
          </div>

          <el-alert
            v-if="importStatusMessage"
            :key="importStatusMessage"
            class="excel-import-status"
            :type="importStatusType"
            :title="importStatusMessage"
            show-icon
            :closable="false"
          />
          <el-skeleton
            v-if="manualImportBusy || previewBusy"
            class="excel-import-skeleton"
            :rows="3"
            animated
          />

          <div class="excel-summary-grid">
            <div>
              <span>{{ ui("excel.currentFile") }}</span>
              <strong>{{ workbook?.fileName || ui("common.notSelected") }}</strong>
            </div>
            <div>
              <span>{{ ui("excel.validRows") }}</span>
              <strong>{{ manualValidRowCount }}</strong>
            </div>
            <div>
              <span>{{ ui("excel.issueRows") }}</span>
              <strong>{{ unresolvedInvalidRows.length }}</strong>
            </div>
            <div>
              <span>{{ ui("excel.aggregatedCargo") }}</span>
              <strong>{{ approvedAggregated.length }}</strong>
            </div>
            <div>
              <span>{{ ui("excel.importPieces") }}</span>
              <strong>{{ approvedQuantity }}</strong>
            </div>
          </div>
        </div>

        <div
          v-else-if="excelMode === 'recognition'"
          id="cargo-import-panel"
          class="excel-import-card smart-recognition-card"
          role="tabpanel"
          aria-labelledby="smart-import-tab"
          :class="{ 'is-dragging': preciseDropActive, 'is-busy': importBusy }"
          @dragenter.prevent="handlePreciseDragEnter"
          @dragover.prevent="handlePreciseDragOver"
          @dragleave.prevent="handlePreciseDragLeave"
          @drop.prevent="handlePreciseDrop"
        >
          <div v-if="!coordinated" class="recognition-head">
            <div>
              <strong class="recognition-title">
                <span class="hollow-star" aria-hidden="true">☆</span>
                {{ ui("excel.recognitionPath") }}
              </strong>
              <p>{{ ui("excel.recognitionPathText") }}</p>
            </div>
            <div class="recognition-actions">
              <input
                v-if="!sourceFile"
                ref="preciseFileInput"
                hidden
                type="file"
                multiple
                :accept="WORKBOOK_FILE_ACCEPT"
                @change="handlePreciseFile"
              />
              <el-button
                v-if="!coordinated && !sourceFile"
                type="primary"
                :loading="preciseImportBusy"
                @click="openPreciseFilePicker"
              >
                {{ ui("common.chooseFile") }}
              </el-button>
              <el-button v-if="!sourceFile" @click="openWorkspaceFiles('recognition')">{{
                ui("excel.workspaceFiles")
              }}</el-button>
              <el-button v-if="!sourceFile" :disabled="importBusy" @click="fillRecognitionSample">{{
                ui("common.useSample")
              }}</el-button>
              <el-button v-if="!sourceFile" :disabled="importBusy" @click="clearRecognition">{{
                ui("common.clear")
              }}</el-button>
            </div>
          </div>

          <div
            v-if="!coordinated && !sourceFile"
            class="excel-drop-zone"
            :class="{ active: preciseDropActive }"
            role="button"
            tabindex="0"
            @click="openPreciseFilePicker"
            @keydown.enter.prevent="openPreciseFilePicker"
            @keydown.space.prevent="openPreciseFilePicker"
          >
            <el-icon class="excel-drop-icon"><UploadFilled /></el-icon>
            <div class="excel-drop-copy">
              <strong>
                {{
                  ui(
                    importBusy
                      ? "excel.smartDropBusy"
                      : preciseDropActive
                        ? "excel.smartDropRelease"
                        : "excel.smartDropToRecognize"
                  )
                }}
              </strong>
              <span>{{ ui("excel.smartDropSupportText") }}</span>
            </div>
            <span class="excel-drop-formats">XLSX / XLS / CSV / TSV</span>
          </div>

          <div
            v-if="recognitionInput !== 'text' && !sourceFile && preciseFileQueue.length"
            class="import-file-queue"
          >
            <header>
              <strong>{{ ui("excel.fileQueue") }}</strong>
              <span>{{ ui("excel.smartQueueHint") }}</span>
            </header>
            <div class="import-file-queue-list">
              <article
                v-for="item in preciseFileQueue"
                :key="item.id"
                class="import-file-queue-item"
                :class="{ active: item.id === activePreciseFileId }"
              >
                <button
                  type="button"
                  class="import-file-queue-select"
                  :title="item.error || item.file.name"
                  :disabled="!item.snapshot || preciseQueueProcessing"
                  @click="selectPreciseQueueItem(item)"
                >
                  <span class="import-file-name">{{ item.file.name }}</span>
                  <small>{{ formatFileSize(item.file.size) }}</small>
                  <em :class="`status-${item.status}`">{{ queueStatusText(item.status) }}</em>
                </button>
                <el-button
                  v-if="item.status === 'queued' && !preciseQueueProcessing"
                  link
                  type="primary"
                  @click.stop="processPreciseQueueItem(item)"
                >
                  {{ ui("excel.recognizeThisFile") }}
                </el-button>
              </article>
            </div>
          </div>

          <section
            v-if="recognitionInput === 'text' && !sourceFile"
            class="recognition-text-editor"
          >
            <label for="smart-import-cargo-text">{{ textCopy.label }}</label>
            <p>{{ textCopy.hint }}</p>
            <el-input
              id="smart-import-cargo-text"
              v-model="recognitionText"
              type="textarea"
              :disabled="importBusy"
              @input="resetRecognitionResult"
              :rows="7"
              :placeholder="t('smartImport.recognitionPlaceholder')"
            />
            <div class="recognition-submit-row">
              <el-button
                type="primary"
                :disabled="!recognitionText.trim() || importBusy"
                :loading="recognitionAgentBusy"
                @click="submitTextRecognitionTask"
              >
                <span class="hollow-star button-star" aria-hidden="true">☆</span>
                {{
                  recognitionAgentBusy ? ui("excel.recognizing") : ui("excel.startSmartRecognition")
                }}
              </el-button>
              <el-button :disabled="importBusy || !recognitionText" @click="clearRecognition">{{
                ui("common.clear")
              }}</el-button>
            </div>
          </section>
          <div v-if="recognitionAgentBusy" class="recognition-loading-panel">
            <span class="recognition-loader"></span>
            <div>
              <strong>{{ ui("excel.recognizingCargo") }}</strong>
              <p>{{ ui("excel.recognizingCargoText") }}</p>
            </div>
            <time class="recognition-elapsed" aria-live="polite">
              {{ ui("excel.elapsedTime", { time: recognitionElapsedText }) }}
            </time>
          </div>

          <div v-if="sourceWorkbookFile" class="source-workbook-bar">
            <div>
              <span>{{ ui("excel.sourceWorkbook") }}</span>
              <strong>{{ sourceWorkbookFile.name }}</strong>
              <small>{{ sourceWorkbookFileSize }}</small>
            </div>
            <div class="source-workbook-actions">
              <el-button
                :disabled="!recognitionWorkbook || preciseQueueProcessing"
                @click="openSourceWorkbookPreview"
                >{{ ui("excel.previewWorkbook") }}</el-button
              >
              <el-button @click="downloadSourceWorkbook">{{
                ui("excel.downloadOriginalWorkbook")
              }}</el-button>
            </div>
          </div>

          <div
            v-if="recognitionStatusMessage"
            class="recognition-placeholder"
            :class="{ error: recognitionMessageType === 'error' }"
          >
            <span>{{
              ui(recognitionMessageType === "error" ? "excel.needsAction" : "excel.recognitionTip")
            }}</span>
            <strong>{{ recognitionStatusMessage }}</strong>
          </div>

          <div v-if="recognitionHasResult" class="recognition-review-workspace">
            <div class="excel-summary-grid recognition-summary-grid">
              <div>
                <span>{{ ui("excel.textItems") }}</span>
                <strong>{{ recognitionTotalRows }}</strong>
              </div>
              <div>
                <span>{{ ui("excel.validItems") }}</span>
                <strong>{{ recognitionValidCount }}</strong>
              </div>
              <div>
                <span>{{ ui("excel.issueItems") }}</span>
                <strong>{{ recognitionReviewFindings.length }}</strong>
              </div>
              <div>
                <span>{{ ui("excel.aggregatedCargo") }}</span>
                <strong>{{ recognitionRows.length }}</strong>
              </div>
              <div>
                <span>{{ ui("excel.importPieces") }}</span>
                <strong>{{ recognitionQuantity }}</strong>
              </div>
            </div>

            <div v-if="recognitionAgentTask" class="agent-status-row text-agent-status">
              <span :title="recognitionAgentTask.taskNo">
                {{
                  recognitionPackingReview.strict
                    ? ui("excel.originalWorkbookChecked")
                    : recognitionAgentTask.agentNotes
                }}</span
              >
              <small v-if="recognitionElapsedSeconds">{{
                ui("excel.completedIn", { time: recognitionElapsedText })
              }}</small>
              <el-button
                :disabled="!recognitionAgentTask.id"
                @click="downloadRecognitionAgentResult"
              >
                {{ ui("common.downloadRecognitionExcel") }}
              </el-button>
            </div>

            <PackingReconciliationPanel
              class="recognition-check-sidebar"
              :review="recognitionPackingReview"
              v-model:volume-confirmed="recognitionVolumeConfirmed"
            />

            <div class="recognition-import-row">
              <el-form-item :label="ui('excel.importMode')">
                <el-select
                  popper-class="business-select-popper workspace-select-popper"
                  v-model="importMode"
                >
                  <el-option :label="ui('excel.replaceCargo')" value="replace" />
                  <el-option :label="ui('excel.appendCargo')" value="append" />
                </el-select>
              </el-form-item>
              <el-button :disabled="!recognitionHasResult" @click="openRecognitionReviewDialog">
                {{ ui("excel.openRecognitionReview") }}
              </el-button>
              <el-button
                type="primary"
                :disabled="!recognitionCanImport"
                @click="importRecognitionRows"
              >
                {{ ui("common.import") }} {{ recognitionRows.length }} {{ ui("unit.classes") }} /
                {{ recognitionQuantity }} {{ ui("unit.cargoPieces") }}
              </el-button>
            </div>

            <div
              v-if="recognitionRows.length"
              class="template-table-wrap recognition-result-table-wrap"
            >
              <header class="recognition-list-heading">
                <h2>{{ ui("excel.openRecognitionReview") }}</h2>
                <span
                  >{{ recognitionRows.length }} {{ ui("unit.classes") }} / {{ recognitionQuantity }}
                  {{ ui("unit.cargoPieces") }}</span
                >
                <el-button @click="openRecognitionReviewDialog">{{ ui("common.edit") }}</el-button>
              </header>
              <table class="template-table sample recognition-result-table">
                <thead>
                  <tr>
                    <th>{{ ui("excel.packageIdentity") }}</th>
                    <th>{{ ui("common.cargo") }}</th>
                    <th>{{ ui("common.model") }}</th>
                    <th>{{ ui("common.dimensionsCm") }}</th>
                    <th>{{ ui("common.quantity") }}</th>
                    <th>{{ ui("common.unitWeightKg") }}</th>
                    <th>{{ ui("common.type") }}</th>
                    <th>{{ ui("common.remark") }}</th>
                    <th>{{ ui("excel.packageSourceRows") }}</th>
                    <th>{{ ui("common.actions") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(cargo, index) in recognitionRows" :key="cargoKey(cargo, index)">
                    <td>{{ packageIdentityLabel(cargo) }}</td>
                    <td>{{ cargo.name }}</td>
                    <td>{{ cargo.model || "-" }}</td>
                    <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                    <td>{{ cargo.quantity }}</td>
                    <td>{{ cargo.weightKg }}</td>
                    <td :title="cargoRuleText(cargo)">{{ cargoRuleText(cargo) }}</td>
                    <td>{{ cargo.remark || "-" }}</td>
                    <td>{{ packageSourceLabel(cargo) }}</td>
                    <td>
                      <el-button link type="primary" @click="openRecognitionEdit(cargo, index)">{{
                        ui("common.edit")
                      }}</el-button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="recognitionIssues.length" class="template-table-wrap">
              <table class="template-table">
                <thead>
                  <tr>
                    <th>{{ ui("common.sourceLine") }}</th>
                    <th>{{ ui("common.issue") }}</th>
                    <th>{{ ui("common.suggestedName") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in recognitionIssues" :key="`issue-${row.rowNumber}`">
                    <td>{{ row.text || row.rawText || "-" }}</td>
                    <td>{{ issueMessages(row).join("；") }}</td>
                    <td>{{ suggestionCargoLabel(row.suggestion?.cargo) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <PackingReconciliationPanel
      v-if="excelMode === 'manual' && preview"
      :review="manualPackingReview"
      v-model:volume-confirmed="manualVolumeConfirmed"
    />
    <div v-if="excelMode === 'manual' && preview" class="excel-preview-actions">
      <p v-if="unresolvedInvalidRows.length" class="excel-warning">
        {{ ui("common.has") }} {{ unresolvedInvalidRows.length }}
        {{ ui("excel.rowsFailedValidation") }}
      </p>
      <p v-else class="excel-ok">{{ ui("excel.allRowsValid") }}</p>
      <div class="excel-preview-compact-controls">
        <el-select
          popper-class="business-select-popper workspace-select-popper"
          v-if="workbook?.sheets?.length > 1"
          v-model="selectedSheetName"
          :aria-label="ui('excel.worksheet')"
          @change="selectSheet"
        >
          <el-option
            v-for="sheet in workbook.sheets"
            :key="sheet.name"
            :label="`${sheet.name} / ${sheet.rows.length} ${ui('unit.rows')}`"
            :value="sheet.name"
          />
        </el-select>
        <el-select
          popper-class="business-select-popper workspace-select-popper"
          v-model="importMode"
          :aria-label="ui('excel.importMode')"
        >
          <el-option :label="ui('excel.replaceCargo')" value="replace" />
          <el-option :label="ui('excel.appendCargo')" value="append" />
        </el-select>
        <el-button @click="openManualWorkbookPreview">{{ ui("excel.previewWorkbook") }}</el-button>
        <el-button type="primary" :disabled="!manualCanImport" @click="importPreview">
          {{ ui("common.import") }} {{ approvedAggregated.length }} {{ ui("unit.classes") }} /
          {{ approvedQuantity }} {{ ui("unit.cargoPieces") }}
        </el-button>
      </div>
    </div>

    <div v-if="excelMode === 'manual' && preview" class="template-grid">
      <article class="algorithm-note">
        <strong>{{ ui("excel.validPreview") }}</strong>
        <div class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>{{ ui("excel.packageIdentity") }}</th>
                <th>{{ ui("common.cargo") }}</th>
                <th>{{ ui("common.model") }}</th>
                <th>{{ ui("common.dimensionsCm") }}</th>
                <th>{{ ui("common.quantity") }}</th>
                <th>{{ ui("common.unitWeightKg") }}</th>
                <th>{{ ui("common.type") }}</th>
                <th>{{ ui("common.remark") }}</th>
                <th>{{ ui("excel.packageSourceRows") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cargo in approvedAggregated.slice(0, 12)" :key="cargoKey(cargo)">
                <td>{{ packageIdentityLabel(cargo) }}</td>
                <td>{{ cargo.name }}</td>
                <td>{{ cargo.model || "-" }}</td>
                <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                <td>{{ cargo.quantity }}</td>
                <td>{{ cargo.weightKg }}</td>
                <td>{{ cargoRuleText(cargo) }}</td>
                <td>{{ cargo.remark || "-" }}</td>
                <td>{{ packageSourceLabel(cargo) }}</td>
              </tr>
              <tr v-if="approvedAggregated.length > 12">
                <td colspan="9">
                  {{ ui("common.more") }} {{ approvedAggregated.length - 12 }}
                  {{ ui("excel.moreCargoHidden") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>{{ ui("excel.issueRows") }}</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>{{ ui("common.rowNumber") }}</th>
                <th>{{ ui("common.issue") }}</th>
                <th>{{ ui("common.originalName") }}</th>
                <th>{{ ui("common.suggestion") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in unresolvedInvalidRows.slice(0, 12)" :key="row.rowNumber">
                <td>{{ row.rowNumber }}</td>
                <td>{{ row.errors.join("；") }}</td>
                <td>{{ row.cargo.name || "-" }}</td>
                <td>
                  <el-button link type="primary" @click="openSuggestion(row)">{{
                    ui("excel.suggestEdit")
                  }}</el-button>
                </td>
              </tr>
              <tr v-if="!unresolvedInvalidRows.length">
                <td colspan="4">{{ ui("excel.noIssueRows") }}</td>
              </tr>
              <tr v-if="unresolvedInvalidRows.length > 12">
                <td colspan="4">
                  {{ ui("common.more") }} {{ unresolvedInvalidRows.length - 12 }}
                  {{ ui("excel.moreIssueRowsHidden") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <el-dialog
      v-model="sourcePreviewOpen"
      class="v2-import-dialog planner-dialog source-workbook-dialog workspace-el-dialog"
      width="min(1180px, calc(100vw - 32px))"
      destroy-on-close
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui("excel.onlinePreview") }}</p>
          <h2>{{ sourcePreviewFile?.name || ui("excel.sourceWorkbook") }}</h2>
        </div>
      </template>
      <div class="source-preview-toolbar">
        <el-select
          popper-class="business-select-popper workspace-select-popper"
          v-model="sourcePreviewSheetName"
        >
          <el-option
            v-for="sheet in sourcePreviewWorkbook?.sheets || []"
            :key="sheet.name"
            :label="`${sheet.name} / ${sourceSheetRowCount(sheet)} ${ui('unit.rows')}`"
            :value="sheet.name"
          />
        </el-select>
        <span>{{ ui("excel.previewLimit", { count: SOURCE_PREVIEW_ROW_LIMIT }) }}</span>
      </div>
      <div class="template-table-wrap source-preview-table-wrap">
        <table :key="sourcePreviewIdentity" class="template-table source-preview-table">
          <tbody>
            <tr v-for="(row, rowIndex) in sourcePreviewRows" :key="`source-row-${rowIndex}`">
              <th>{{ rowIndex + 1 }}</th>
              <td
                v-for="(cell, columnIndex) in row"
                :key="`source-cell-${rowIndex}-${columnIndex}`"
              >
                {{ cell ?? "" }}
              </td>
            </tr>
            <tr v-if="!sourcePreviewRows.length">
              <td>{{ ui("excel.emptyWorksheet") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <el-button :disabled="!sourcePreviewFile" @click="downloadPreviewWorkbook">{{
          ui("excel.downloadOriginalWorkbook")
        }}</el-button>
        <el-button type="primary" @click="sourcePreviewOpen = false">{{
          ui("common.close")
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="workspaceFilesOpen"
      class="v2-import-dialog planner-dialog workspace-files-dialog workspace-el-dialog"
      width="min(1080px, calc(100vw - 32px))"
      destroy-on-close
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui("excel.workspaceFilesEyebrow") }}</p>
          <h2>{{ ui("excel.workspaceFiles") }}</h2>
        </div>
      </template>
      <div class="workspace-files-toolbar">
        <span>{{ ui("excel.workspaceFilesRetention") }}</span>
        <el-button :loading="workspaceFilesBusy" @click="loadWorkspaceFiles">{{
          ui("excel.refreshFiles")
        }}</el-button>
      </div>
      <el-alert
        v-if="workspaceFilesError"
        type="warning"
        :closable="false"
        show-icon
        :title="workspaceFilesError"
      />
      <div v-if="workspaceFilesBusy && !workspaceFileGroups.length" class="workspace-files-loading">
        <el-skeleton :rows="5" animated />
      </div>
      <div v-else-if="workspaceFileGroups.length" class="workspace-file-groups">
        <section
          v-for="group in workspaceFileGroups"
          :key="group.date"
          class="workspace-file-group"
        >
          <header>
            <strong>{{ displayWorkspaceDate(group.date) }}</strong>
            <span>{{ ui("excel.fileQueueCount", { count: group.items.length }) }}</span>
          </header>
          <div class="workspace-file-list">
            <article v-for="file in group.items" :key="file.id" class="workspace-file-row">
              <div>
                <strong>{{ file.originalFileName }}</strong>
                <small
                  >{{ formatFileSize(file.sizeBytes) }} ·
                  {{ displayWorkspaceTime(file.uploadedAt) }}</small
                >
              </div>
              <span class="workspace-file-expiry">{{
                ui("excel.workspaceFileDaysRemaining", { count: file.daysRemaining ?? 0 })
              }}</span>
              <div class="workspace-file-actions">
                <el-button link type="primary" @click="previewWorkspaceFile(file)">{{
                  ui("excel.previewWorkbook")
                }}</el-button>
                <el-button v-if="!sourceFile" link type="primary" @click="useWorkspaceFile(file)">{{
                  ui(
                    workspaceFilesTargetMode === "recognition"
                      ? "excel.useForSmartImport"
                      : "excel.useForQuickImport"
                  )
                }}</el-button>
                <el-button link type="danger" @click="removeWorkspaceFile(file)">{{
                  ui("common.delete")
                }}</el-button>
              </div>
            </article>
          </div>
        </section>
      </div>
      <p v-else class="recognition-review-empty">{{ ui("excel.workspaceFilesEmpty") }}</p>
      <template #footer>
        <el-button type="primary" @click="workspaceFilesOpen = false">{{
          ui("common.close")
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="recognitionReviewDialogOpen"
      :model-value="true"
      class="v2-import-dialog planner-dialog recognition-review-dialog workspace-el-dialog"
      width="min(1280px, calc(100vw - 32px))"
      align-center
      destroy-on-close
      @close="closeRecognitionReviewDialog"
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui("excel.recognitionReviewEyebrow") }}</p>
          <h2>{{ ui("excel.recognitionReviewTitle") }}</h2>
        </div>
      </template>

      <div class="recognition-review-body">
        <p class="recognition-review-notice">
          {{ ui("excel.recognitionReviewNotice") }}
        </p>

        <el-alert
          v-if="recognitionMissingPalletDimensionIssues.length"
          class="recognition-pallet-dimensions-alert"
          type="error"
          show-icon
          :closable="false"
          :title="
            ui('excel.reviewPalletDimensionsMissingTitle', {
              count: recognitionMissingPalletDimensionIssues.length
            })
          "
          :description="ui('excel.reviewPalletDimensionsMissingDescription')"
        />

        <div class="excel-summary-grid recognition-review-metrics">
          <div>
            <span>{{ ui("excel.validItems") }}</span>
            <strong>{{ recognitionRows.length }}</strong>
          </div>
          <div>
            <span>{{ ui("excel.reviewNormalItems") }}</span>
            <strong>{{ recognitionNormalRows.length }}</strong>
          </div>
          <div>
            <span>{{ ui("excel.reviewNeedsConfirmItems") }}</span>
            <strong>{{ recognitionReviewFindings.length }}</strong>
          </div>
          <div>
            <span>{{ ui("excel.importPieces") }}</span>
            <strong>{{ recognitionQuantity }}</strong>
          </div>
        </div>

        <PackingReconciliationPanel
          :review="recognitionPackingReview"
          v-model:volume-confirmed="recognitionVolumeConfirmed"
        />

        <el-collapse v-model="recognitionReviewActiveNames" class="recognition-review-collapse">
          <el-collapse-item name="needsReview">
            <template #title>
              <span class="recognition-review-title-line">
                {{ ui("excel.reviewNeedsConfirm") }}
                <b>{{ recognitionReviewFindings.length }}</b>
              </span>
            </template>

            <div v-if="recognitionReviewFindings.length" class="recognition-review-issue-list">
              <article
                v-for="finding in recognitionReviewFindings"
                :key="finding.id"
                class="recognition-review-issue"
                :class="{
                  'is-pallet-dimensions-missing': isPalletDimensionsMissingFinding(finding)
                }"
              >
                <header>
                  <strong>{{ finding.title }}</strong>
                  <span class="recognition-review-status">{{
                    ui("excel.reviewNeedsConfirm")
                  }}</span>
                </header>
                <ol class="recognition-review-three-lines">
                  <li class="recognition-review-line source-line">
                    <div class="recognition-review-line-label">
                      <span>1</span>
                      <strong>{{ ui("excel.reviewOriginalData") }}</strong>
                    </div>
                    <div class="recognition-review-line-content">
                      <small v-if="finding.issue?.rowNumber != null">
                        {{ ui("excel.reviewRowNumber") }} {{ finding.issue.rowNumber }}
                      </small>
                      <p>{{ recognitionReviewSourceText(finding) }}</p>
                    </div>
                  </li>

                  <li class="recognition-review-line agent-line">
                    <div class="recognition-review-line-label">
                      <span>2</span>
                      <strong>{{ ui("excel.reviewAgentSuggestion") }}</strong>
                    </div>
                    <div class="recognition-review-line-content">
                      <div
                        v-if="recognitionReviewSuggestionGroups(finding).length"
                        class="recognition-review-groups"
                      >
                        <section
                          v-for="group in recognitionReviewSuggestionGroups(finding)"
                          :key="`suggestion-${finding.id}-${group.key}`"
                          class="recognition-review-group"
                        >
                          <strong>{{ group.title }}</strong>
                          <div class="recognition-review-inline-fields">
                            <span
                              v-for="row in group.rows"
                              :key="`suggestion-${finding.id}-${group.key}-${row.label}`"
                              :class="{ 'is-missing-dimension': row.missing }"
                            >
                              <b>{{ row.label }}</b
                              >{{ row.value }}
                            </span>
                          </div>
                        </section>
                      </div>
                      <p v-else class="recognition-review-card-empty">
                        {{ ui("excel.reviewNoSuggestion") }}
                      </p>
                      <div class="recognition-review-reason">
                        <strong>{{ ui("excel.reviewSystemJudgement") }}</strong>
                        <ul>
                          <li v-for="message in finding.messages" :key="message">{{ message }}</li>
                        </ul>
                      </div>
                    </div>
                  </li>

                  <li class="recognition-review-line import-line">
                    <div class="recognition-review-line-label">
                      <span>3</span>
                      <strong>{{ ui("excel.reviewImportedCandidate") }}</strong>
                    </div>
                    <div class="recognition-review-line-content">
                      <div
                        v-if="recognitionReviewCargoGroups(finding.cargo, finding).length"
                        class="recognition-review-groups import-fields"
                      >
                        <section
                          v-for="group in recognitionReviewCargoGroups(finding.cargo, finding)"
                          :key="`cargo-${finding.id}-${group.key}`"
                          class="recognition-review-group"
                        >
                          <strong>{{ group.title }}</strong>
                          <div class="recognition-review-inline-fields">
                            <span
                              v-for="row in group.rows"
                              :key="`cargo-${finding.id}-${group.key}-${row.label}`"
                              :class="{ 'is-missing-dimension': row.missing }"
                            >
                              <b>{{ row.label }}</b
                              >{{ row.value }}
                            </span>
                          </div>
                        </section>
                      </div>
                      <p v-else class="recognition-review-card-empty">
                        {{ ui("excel.reviewNotImportedYet") }}
                      </p>
                    </div>
                    <el-button
                      v-if="finding.canEdit"
                      type="primary"
                      plain
                      :icon="EditPen"
                      @click="editRecognitionReviewCargo(finding)"
                    >
                      {{
                        isPalletDimensionsMissingFinding(finding)
                          ? ui("excel.reviewEnterPalletDimensions")
                          : ui("excel.reviewEditImport")
                      }}
                    </el-button>
                  </li>
                </ol>
              </article>
            </div>
            <p v-else class="recognition-review-empty">{{ ui("excel.reviewNoIssues") }}</p>
          </el-collapse-item>

          <el-collapse-item name="normal">
            <template #title>
              <span class="recognition-review-title-line">
                {{ ui("excel.reviewNormal") }}
                <b>{{ recognitionNormalRows.length }}</b>
              </span>
            </template>

            <div
              v-if="recognitionNormalRows.length"
              class="template-table-wrap recognition-review-table-wrap"
            >
              <table class="template-table recognition-review-table">
                <thead>
                  <tr>
                    <th>{{ ui("common.cargo") }}</th>
                    <th>{{ ui("common.model") }}</th>
                    <th>{{ ui("common.dimensionsCm") }}</th>
                    <th>{{ ui("common.quantity") }}</th>
                    <th>{{ ui("common.unitWeightKg") }}</th>
                    <th>{{ ui("common.type") }}</th>
                    <th>{{ ui("common.remark") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in recognitionNormalRows" :key="cargoKey(item.cargo, item.index)">
                    <td>{{ item.cargo.name }}</td>
                    <td>{{ item.cargo.model || "-" }}</td>
                    <td>
                      {{ item.cargo.lengthCm }} × {{ item.cargo.widthCm }} ×
                      {{ item.cargo.heightCm }}
                    </td>
                    <td>{{ item.cargo.quantity }}</td>
                    <td>{{ item.cargo.weightKg }}</td>
                    <td>{{ cargoRuleText(item.cargo) }}</td>
                    <td>{{ item.cargo.remark || "-" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="recognition-review-empty">{{ ui("excel.reviewAllNeedConfirm") }}</p>
          </el-collapse-item>
        </el-collapse>
      </div>

      <template #footer>
        <el-button type="primary" @click="closeRecognitionReviewDialog">{{
          ui("common.acknowledged")
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="suggestionRow"
      :model-value="true"
      class="v2-import-dialog planner-dialog workspace-el-dialog"
      width="720px"
      align-center
      destroy-on-close
      @close="closeSuggestion"
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui("unit.row") }} {{ suggestionRow.rowNumber }}</p>
          <h2>{{ ui("excel.suggestStandardCargo") }}</h2>
        </div>
      </template>

      <div class="suggestion-summary">
        <strong>{{ suggestionSummary }}</strong>
        <ul>
          <li v-for="note in suggestionRow.suggestion.notes" :key="note">{{ note }}</li>
          <li v-if="!suggestionRow.suggestion.notes.length">{{ ui("excel.preserveFields") }}</li>
        </ul>
      </div>

      <el-form :model="suggestionForm" label-position="top" class="suggestion-form-grid">
        <el-form-item :label="ui('excel.cargoName')">
          <el-input v-model.trim="suggestionForm.name" />
        </el-form-item>
        <el-form-item :label="ui('excel.modelSpec')">
          <el-input v-model.trim="suggestionForm.model" />
        </el-form-item>
        <el-form-item :label="ui('excel.lengthCm')">
          <el-input-number
            v-model="suggestionForm.lengthCm"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('excel.widthCm')">
          <el-input-number
            v-model="suggestionForm.widthCm"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('excel.heightCm')">
          <el-input-number
            v-model="suggestionForm.heightCm"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('common.quantity')">
          <el-input-number
            v-model="suggestionForm.quantity"
            :min="1"
            :step="1"
            :precision="0"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('excel.singleWeightKg')">
          <el-input-number
            v-model="suggestionForm.weightKg"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('cargo.packageType')">
          <el-select
            popper-class="business-select-popper workspace-select-popper"
            v-model="suggestionForm.type"
          >
            <el-option :label="ui('cargo.normal')" value="normal" />
            <el-option :label="ui('cargo.pallet')" value="pallet" />
          </el-select>
        </el-form-item>
        <el-form-item class="span-2" :label="ui('excel.handlingConstraints')">
          <el-checkbox v-model="suggestionForm.nonStack">{{ ui("cargo.nonstack") }}</el-checkbox>
          <el-checkbox v-model="suggestionForm.keepUpright">{{ ui("cargo.upright") }}</el-checkbox>
        </el-form-item>
        <el-form-item :label="ui('common.remark')">
          <el-input v-model.trim="suggestionForm.remark" />
        </el-form-item>
      </el-form>

      <p v-if="suggestionErrors.length" class="excel-warning suggestion-error">
        {{ ui("excel.needsChanges") }}：{{ suggestionErrors.join("；") }}
      </p>

      <template #footer>
        <el-button @click="closeSuggestion">{{ ui("common.cancel") }}</el-button>
        <el-button type="primary" @click="applySuggestion">{{
          ui("common.applyToImportPreview")
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="recognitionEditIndex >= 0"
      :model-value="true"
      class="v2-import-dialog planner-dialog workspace-el-dialog"
      width="720px"
      align-center
      destroy-on-close
      @close="closeRecognitionEdit"
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui("excel.recognitionResultNo") }} {{ recognitionEditIndex + 1 }}</p>
          <h2>{{ ui("excel.editRecognitionCargo") }}</h2>
        </div>
      </template>

      <div class="suggestion-summary">
        <strong>{{ recognitionEditSummary }}</strong>
        <ul>
          <li>{{ ui("excel.editNoAgent") }}</li>
          <li>{{ ui("excel.editUseCase") }}</li>
        </ul>
      </div>

      <el-form :model="recognitionEditForm" label-position="top" class="suggestion-form-grid">
        <el-form-item :label="ui('excel.cargoName')">
          <el-input v-model.trim="recognitionEditForm.name" />
        </el-form-item>
        <el-form-item :label="ui('excel.modelSpec')">
          <el-input v-model.trim="recognitionEditForm.model" />
        </el-form-item>
        <el-form-item :label="ui('excel.lengthCm')">
          <el-input-number
            v-model="recognitionEditForm.lengthCm"
            :min="0"
            :step="0.01"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('excel.widthCm')">
          <el-input-number
            v-model="recognitionEditForm.widthCm"
            :min="0"
            :step="0.01"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('excel.heightCm')">
          <el-input-number
            v-model="recognitionEditForm.heightCm"
            :min="0"
            :step="0.01"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('common.quantity')">
          <el-input-number
            v-model="recognitionEditForm.quantity"
            :min="1"
            :step="1"
            :precision="0"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('excel.singleWeightKg')">
          <el-input-number
            v-model="recognitionEditForm.weightKg"
            :min="0"
            :step="0.01"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item :label="ui('cargo.packageType')">
          <el-select
            popper-class="business-select-popper workspace-select-popper"
            v-model="recognitionEditForm.type"
            :disabled="recognitionEditIssueCode === 'PALLET_DIMENSIONS_MISSING'"
          >
            <el-option :label="ui('cargo.normal')" value="normal" />
            <el-option :label="ui('cargo.pallet')" value="pallet" />
          </el-select>
        </el-form-item>
        <el-form-item class="span-2" :label="ui('excel.handlingConstraints')">
          <el-checkbox v-model="recognitionEditForm.nonStack">{{
            ui("cargo.nonstack")
          }}</el-checkbox>
          <el-checkbox v-model="recognitionEditForm.keepUpright">{{
            ui("cargo.upright")
          }}</el-checkbox>
        </el-form-item>
        <el-form-item :label="ui('common.remark')">
          <el-input v-model.trim="recognitionEditForm.remark" />
        </el-form-item>
      </el-form>

      <p v-if="recognitionEditErrors.length" class="excel-warning suggestion-error">
        {{ ui("excel.needsChanges") }}：{{ recognitionEditErrors.join("；") }}
      </p>

      <template #footer>
        <el-button @click="closeRecognitionEdit">{{ ui("common.cancel") }}</el-button>
        <el-button type="primary" @click="applyRecognitionEdit">{{
          ui("common.saveToRecognitionResult")
        }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import WorkspacePageHeader from "./workspace/WorkspacePageHeader.vue";
import { wt } from "./workspace/workspaceCopy";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { EditPen, UploadFilled } from "@element-plus/icons-vue";
import { aggregateCargos, validateCargo } from "../services/excelImport";
import { buildPreviewInWorker, readWorkbookInWorker } from "../services/excelImportClient";
import {
  createTextRecognitionTask,
  createWorkbookRecognitionTask,
  downloadTextRecognitionExcel,
  fetchTextRecognitionCapabilities,
  waitForTextRecognitionTask
} from "../services/excelAgentApi";
import {
  deleteWorkspaceFile,
  fetchWorkspaceFileBlob,
  fetchWorkspaceFiles,
  reuseWorkspaceFile,
  uploadWorkspaceFiles
} from "../services/workspaceFileApi";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";
import { unifiedImportMessages } from "../i18n/unifiedImportMessages.js";
import { uid } from "../utils/format";
import {
  cargoConstraintFlags,
  cargoHandlingUnitType,
  normalizeCargoConstraints
} from "../utils/cargoConstraints";

import PackingReconciliationPanel from "./PackingReconciliationPanel.vue";
import {
  cargoProvenance,
  packageIdentityLabel,
  packageSourceLabel,
  packingIdentityKey,
  packingNumbers,
  recognitionDataIssues,
  reviewPackingTask,
  reviewCargoPreview,
  taskReconciliation,
  supportsWorkbookRecognition,
  supportsTextRecognition,
  supportsCreatedRecognitionTask
} from "../services/packingReconciliation";

const emit = defineEmits(["import-cargos", "review-change"]);
const props = defineProps({
  currentCargoCount: {
    type: Number,
    default: 0
  },
  reviewSource: { type: Object, default: null },
  coordinated: { type: Boolean, default: false },
  recognitionInput: {
    type: String,
    default: "excel",
    validator: (value) => ["excel", "text"].includes(value)
  },
  sourceFile: { type: Object, default: null },
  externalImportBlocked: { type: Boolean, default: false }
});

const textCopy = computed(
  () => (unifiedImportMessages[currentLocale.value] || unifiedImportMessages["zh-CN"]).textEditor
);

function tr(value) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

const colors = [
  "#2a9d8f",
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
  "#e11d48",
  "#65a30d",
  "#0891b2",
  "#c026d3"
];
const workbook = ref(null);
const recognitionWorkbook = ref(null);
const selectedSheetName = ref("");
const activeSheet = ref(null);
const preview = ref(null);
const excelMode = ref("recognition");
const recognitionText = ref("");
const recognitionPreview = ref(null);
const recognitionMessage = ref("");
const recognitionMessageKey = ref("");
const recognitionMessageParams = ref({});
const recognitionMessageFactory = ref(null);
const recognitionMessageType = ref("ok");
const recognitionAgentBusy = ref(false);
const recognitionElapsedSeconds = ref(0);
const sourceWorkbookFile = ref(null);
const sourcePreviewOpen = ref(false);
const sourcePreviewSheetName = ref("");
const sourcePreviewWorkbook = ref(null);
const sourcePreviewFile = ref(null);
const sourcePreviewIdentity = ref("");
const manualSourceWorkbookFile = ref(null);
const manualImportBusy = ref(false);
const manualDropActive = ref(false);
const preciseDropActive = ref(false);
const manualFileInput = ref(null);
const preciseFileInput = ref(null);
const quickImportTab = ref(null);
const smartImportTab = ref(null);
const previewBusy = ref(false);
const preciseImportBusy = ref(false);
const manualFileQueue = ref([]);
const preciseFileQueue = ref([]);
const activeManualFileId = ref("");
const activePreciseFileId = ref("");
const manualQueueProcessing = ref(false);
const preciseQueueProcessing = ref(false);
const workspaceFilesOpen = ref(false);
const workspaceFilesBusy = ref(false);
const workspaceFilesError = ref("");
const workspaceFiles = ref([]);
const workspaceFilesTargetMode = ref("manual");
const manualImportMessage = ref("");
const manualImportMessageKey = ref("");
const manualImportMessageParams = ref({});
const manualImportMessageType = ref("info");
const recognitionAgentTask = ref(null);
const recognitionEditIndex = ref(-1);
const recognitionEditAppendMode = ref(false);
const recognitionEditPackageInfo = ref(null);
const recognitionEditIdentity = ref({});
const recognitionVolumeConfirmed = ref(false);
const recognitionEditFindingId = ref("");
const recognitionEditIssueCode = ref("");
const recognitionEditErrors = ref([]);
const recognitionReviewDialogOpen = ref(false);
const recognitionReviewActiveNames = ref(["needsReview", "normal"]);
const recognitionReviewIndexOverrides = ref({});
const manualCorrections = ref([]);
const manualVolumeConfirmed = ref(false);
const suggestionRow = ref(null);
const suggestionErrors = ref([]);
const mapping = reactive({});
const suggestionForm = reactive({
  name: "",
  model: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  quantity: 1,
  weightKg: 0,
  type: "normal",
  nonStack: false,
  keepUpright: false,
  color: "",
  sku: "",
  remark: ""
});
const recognitionEditForm = reactive({
  name: "",
  model: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  quantity: 1,
  weightKg: 0,
  type: "normal",
  nonStack: false,
  keepUpright: false,
  color: "",
  sku: "",
  remark: ""
});
const options = reactive({ dimensionUnit: "auto", weightUnit: "auto" });
const importMode = ref(props.currentCargoCount > 0 ? "append" : "replace");
const importBusy = computed(
  () =>
    manualImportBusy.value ||
    previewBusy.value ||
    preciseImportBusy.value ||
    recognitionAgentBusy.value
);
const backendImportActive = computed(() => workbook.value?.source === "backend");
const correctedRowNumbers = computed(
  () => new Set(manualCorrections.value.map((cargo) => cargo.sourceRowNumber))
);
const unresolvedInvalidRows = computed(() =>
  preview.value
    ? preview.value.invalidRows.filter((row) => !correctedRowNumbers.value.has(row.rowNumber))
    : []
);
const approvedAggregated = computed(() => {
  if (!preview.value) return [];
  const baseCargos =
    Array.isArray(preview.value.aggregated) && preview.value.aggregated.length
      ? preview.value.aggregated
      : preview.value.validRows.map((row) => row.cargo);
  return aggregateCargos([...baseCargos, ...manualCorrections.value]);
});
const manualPackingReview = computed(() =>
  reviewCargoPreview(preview.value, approvedAggregated.value, {
    volumeConfirmed: manualVolumeConfirmed.value
  })
);
const manualCanImport = computed(
  () =>
    !props.externalImportBlocked &&
    approvedAggregated.value.length > 0 &&
    manualPackingReview.value.canImport
);
const approvedQuantity = computed(() =>
  approvedAggregated.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const manualValidRowCount = computed(
  () => previewValidRowCount(preview.value) + manualCorrections.value.length
);
const importStatusMessage = computed(() => {
  const explicitMessage = manualImportMessageKey.value
    ? ui(manualImportMessageKey.value, manualImportMessageParams.value)
    : tr(manualImportMessage.value);
  if (manualImportMessageType.value === "error" && explicitMessage) return explicitMessage;
  if (!preview.value) {
    return explicitMessage;
  }
  return preview.value.invalidRows.length
    ? ui("excel.previewCompleteWithIssues", {
        valid: previewValidRowCount(preview.value),
        invalid: preview.value.invalidRows.length
      })
    : ui("excel.previewCompleteAllValid", { count: previewValidRowCount(preview.value) });
});
const importStatusType = computed(() => {
  if (
    manualImportMessageType.value === "error" &&
    (manualImportMessageKey.value || manualImportMessage.value)
  )
    return "error";
  if (!preview.value) return manualImportMessageType.value;
  return preview.value.invalidRows.length ? "warning" : "success";
});
const recognitionStatusMessage = computed(() => {
  if (recognitionMessageFactory.value) return recognitionMessageFactory.value();
  if (recognitionMessageKey.value)
    return ui(recognitionMessageKey.value, recognitionMessageParams.value);
  return tr(recognitionMessage.value);
});
const recognitionRows = computed(() =>
  (recognitionAgentTask.value?.cleanedRows || []).map((cargo) => {
    const normalized = normalizeCargoConstraints(cargo);
    return { ...normalized, type: cargoHandlingUnitType(normalized) };
  })
);
const recognitionIssues = computed(() => recognitionDataIssues(recognitionAgentTask.value));
const recognitionPackingReview = computed(() =>
  reviewPackingTask(recognitionAgentTask.value, recognitionRows.value, {
    volumeConfirmed: recognitionVolumeConfirmed.value
  })
);
const recognitionCanImport = computed(
  () =>
    !props.externalImportBlocked &&
    recognitionHasResult.value &&
    !recognitionBlockingIssues.value.length &&
    recognitionPackingReview.value.canImport
);
const recognitionQuantity = computed(() =>
  recognitionRows.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const recognitionTotalRows = computed(() => recognitionAgentTask.value?.rowCount ?? 0);
const recognitionValidCount = computed(() => recognitionAgentTask.value?.validCount ?? 0);
const recognitionHasResult = computed(() => recognitionAgentTask.value?.status === "SUCCEEDED");
const recognitionBlockingIssueCodes = new Set([
  "AGENT_OUTPUT_LIMIT",
  "AGENT_ROW_COVERAGE",
  "AGENT_REQUEST_BUDGET",
  "INPUT_TRUNCATED",
  "PALLET_DIMENSIONS_MISSING"
]);
const recognitionBlockingIssues = computed(() =>
  recognitionIssues.value.filter((issue, index) => {
    const code = String(issue?.code || "");
    if (!recognitionBlockingIssueCodes.has(code)) return false;
    if (code === "INPUT_TRUNCATED") return true;
    return !isRecognitionIssueOverrideResolved(issue, index);
  })
);
const recognitionMissingPalletDimensionIssues = computed(() =>
  recognitionBlockingIssues.value.filter(
    (issue) => String(issue?.code || "") === "PALLET_DIMENSIONS_MISSING"
  )
);
const recognitionElapsedText = computed(() => formatElapsedTime(recognitionElapsedSeconds.value));
const sourceWorkbookFileSize = computed(() => formatFileSize(sourceWorkbookFile.value?.size || 0));
const sourcePreviewSheet = computed(
  () =>
    sourcePreviewWorkbook.value?.sheets?.find(
      (sheet) => sheet.name === sourcePreviewSheetName.value
    ) ||
    sourcePreviewWorkbook.value?.sheets?.[0] ||
    null
);
const workspaceFileGroups = computed(() => {
  const groups = new Map();
  for (const item of workspaceFiles.value) {
    const date =
      item.uploadedDate || String(item.uploadedAt || "").slice(0, 10) || ui("excel.unknownDate");
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(item);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
});
const SOURCE_PREVIEW_ROW_LIMIT = 200;
const sourcePreviewRows = computed(() => {
  const sheet = sourcePreviewSheet.value;
  const rows =
    Array.isArray(sheet?.rawRows) && sheet.rawRows.length
      ? sheet.rawRows
      : [[...(sheet?.headers || [])], ...(sheet?.rows || [])];
  return rows.slice(0, SOURCE_PREVIEW_ROW_LIMIT);
});
const recognitionRowsWithIndex = computed(() =>
  recognitionRows.value.map((cargo, index) => ({ cargo, index }))
);
const recognitionReviewFindings = computed(() => {
  const findings = [];
  const issueCargoKeys = new Set();

  recognitionIssues.value.forEach((issue, index) => {
    const messages = issueMessages(issue);
    if (isSoftRecognitionIssue(issue, messages)) return;
    const cargo = issue?.suggestion?.cargo || null;
    const findingId = recognitionIssueFindingId(issue, index);
    const overriddenIndex = recognitionReviewIndexOverrides.value[findingId];
    const cargoIndex =
      Number.isInteger(overriddenIndex) &&
      overriddenIndex >= 0 &&
      overriddenIndex < recognitionRows.value.length
        ? overriddenIndex
        : cargo
          ? findRecognitionCargoIndex(cargo)
          : -1;
    if (
      String(issue?.code || "") === "PALLET_DIMENSIONS_MISSING" &&
      isRecognitionIssueOverrideResolved(issue, index)
    )
      return;
    if (cargoIndex >= 0) issueCargoKeys.add(cargoReviewKey(recognitionRows.value[cargoIndex]));
    findings.push({
      id: findingId,
      title:
        cargoIndex >= 0
          ? reviewCargoTitle(recognitionRows.value[cargoIndex], cargoIndex)
          : cargo?.name
            ? suggestionCargoLabel(cargo)
            : ui("excel.reviewUnknownItem"),
      source: issue.text || issue.rawText || "",
      messages,
      issue,
      suggestion: issue?.suggestion || null,
      cargo: cargoIndex >= 0 ? recognitionRows.value[cargoIndex] : cargo,
      index: cargoIndex,
      canEdit: issue?.code !== "INPUT_TRUNCATED"
    });
  });

  recognitionRows.value.forEach((cargo, index) => {
    const reasons = cargoReviewReasons(cargo);
    const key = cargoReviewKey(cargo);
    if (!reasons.length || issueCargoKeys.has(key)) return;
    findings.push({
      id: `cargo-review-${index}`,
      title: reviewCargoTitle(cargo, index),
      source: cargo.remark || "",
      messages: reasons,
      issue: null,
      suggestion: null,
      cargo,
      index,
      canEdit: true
    });
  });

  return findings;
});
const recognitionReviewIndexes = computed(
  () =>
    new Set(
      recognitionReviewFindings.value.map((finding) => finding.index).filter((index) => index >= 0)
    )
);
const recognitionNormalRows = computed(() =>
  recognitionRowsWithIndex.value.filter((item) => !recognitionReviewIndexes.value.has(item.index))
);
const recognitionSkippedIssueCount = computed(
  () =>
    recognitionIssues.value.filter((issue, index) => {
      if (
        Number.isInteger(
          recognitionReviewIndexOverrides.value[recognitionIssueFindingId(issue, index)]
        )
      )
        return false;
      const messages = issueMessages(issue);
      if (isSoftRecognitionIssue(issue, messages)) return false;
      const text = messages.join(" ").toLowerCase();
      if (text.includes("\u590d\u6838") || text.includes("review:")) return false;
      const cargo = issue?.suggestion?.cargo || null;
      return !cargo || findRecognitionCargoIndex(cargo) < 0;
    }).length
);
const suggestionSummary = computed(() => {
  if (!suggestionRow.value) return "";
  const name = suggestionForm.name || ui("excel.unnamedCargo");
  const label = suggestionForm.model ? `${name} ${suggestionForm.model}` : name;
  return cargoEditSummary(label, suggestionForm);
});
const recognitionEditSummary = computed(() => {
  if (recognitionEditIndex.value < 0) return "";
  const name = recognitionEditForm.name || ui("excel.unnamedCargo");
  const label = recognitionEditForm.model ? `${name} ${recognitionEditForm.model}` : name;
  return cargoEditSummary(label, recognitionEditForm);
});

function cargoEditSummary(label, form) {
  return ui("excel.cargoEditSummary", {
    label,
    length: form.lengthCm || "-",
    width: form.widthCm || "-",
    height: form.heightCm || "-",
    quantity: form.quantity || 0,
    weight: form.weightKg || 0
  });
}

const reviewKeywords = {
  emptyPallet: [
    "\u7a7a\u6258\u76d8",
    "\u7a7a\u6258",
    "\u7a7a\u6728\u6258",
    "empty pallet",
    "empty skid"
  ],
  mixedPallet: [
    "\u62fc\u88c5",
    "\u62fc\u6258",
    "\u6df7\u88c5",
    "\u5408\u62fc",
    "\u5171\u6258",
    "mixed pallet",
    "combined pallet",
    "mixed skid",
    "combined skid"
  ],
  uncertain: [
    "\u53ef\u80fd",
    "\u4e0d\u786e\u5b9a",
    "\u672a\u786e\u8ba4",
    "\u7591\u4f3c",
    "\u4eba\u5de5\u786e\u8ba4",
    "\u91cd\u590d",
    "\u590d\u6838",
    "uncertain",
    "maybe",
    "possible",
    "duplicate"
  ],
  standalone: ["\u5355\u72ec", "\u72ec\u7acb", "\u5355\u4e2a", "separate", "standalone", "alone"],
  pallet: ["\u6258\u76d8", "\u6728\u6258", "\u6808\u677f", "pallet", "skid"]
};
const hardRecognitionIssueKeywords = [
  "\u7f3a\u5c11\u8d27\u7269\u540d\u79f0",
  "\u540d\u79f0\u672a\u8bc6\u522b",
  "\u957f\u5ea6\u5fc5\u987b",
  "\u5bbd\u5ea6\u5fc5\u987b",
  "\u9ad8\u5ea6\u5fc5\u987b",
  "\u5c3a\u5bf8\u672a\u8bc6\u522b",
  "\u6570\u91cf\u5fc5\u987b",
  "\u6570\u91cf\u672a\u8bc6\u522b",
  "missing name",
  "invalid name",
  "missing dimension",
  "invalid dimension",
  "missing quantity",
  "invalid quantity"
];
const WORKBOOK_FILE_ACCEPT = ".xlsx,.xls,.csv,.tsv,text/csv,text/tab-separated-values";
const SUPPORTED_WORKBOOK_FILE_PATTERN = /\.(xlsx|xls|csv|tsv)$/i;

let previewSeq = 0;
let workbookVersion = 0;
let lastPreviewSignature = "";
let pendingPreviewSignature = "";
let manualDragDepth = 0;
let preciseDragDepth = 0;
let preciseProcessSeq = 0;
let workspacePreviewSeq = 0;
let componentActive = true;
let recognitionRunVersion = 0;

function openManualFilePicker() {
  if (props.sourceFile) return;
  manualFileInput.value?.click();
}

function openPreciseFilePicker() {
  if (props.recognitionInput === "text") return;
  if (props.sourceFile) return;
  preciseFileInput.value?.click();
}

function handleFile(event) {
  if (props.sourceFile) return;
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  enqueueManualFiles(files);
}

function handlePreciseFile(event) {
  if (props.recognitionInput === "text") return;
  if (props.sourceFile) return;
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  enqueuePreciseFiles(files);
}

function handleManualDragEnter(event) {
  if (props.sourceFile) return;
  if (!dragContainsFiles(event)) return;
  manualDragDepth += 1;
  manualDropActive.value = true;
}

function handleManualDragOver(event) {
  if (props.sourceFile) return;
  if (!dragContainsFiles(event)) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  manualDropActive.value = true;
}

function handleManualDragLeave() {
  if (!manualDropActive.value) return;
  manualDragDepth = Math.max(0, manualDragDepth - 1);
  if (manualDragDepth === 0) manualDropActive.value = false;
}

async function handleManualDrop(event) {
  if (props.sourceFile) return;
  manualDragDepth = 0;
  manualDropActive.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  enqueueManualFiles(files);
}

function handlePreciseDragEnter(event) {
  if (props.recognitionInput === "text") return;
  if (props.sourceFile) return;
  if (!dragContainsFiles(event)) return;
  preciseDragDepth += 1;
  preciseDropActive.value = true;
}

function handlePreciseDragOver(event) {
  if (props.recognitionInput === "text") return;
  if (props.sourceFile) return;
  if (!dragContainsFiles(event)) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  preciseDropActive.value = true;
}

function handlePreciseDragLeave() {
  if (!preciseDropActive.value) return;
  preciseDragDepth = Math.max(0, preciseDragDepth - 1);
  if (preciseDragDepth === 0) preciseDropActive.value = false;
}

async function handlePreciseDrop(event) {
  if (props.recognitionInput === "text") return;
  if (props.sourceFile) return;
  preciseDragDepth = 0;
  preciseDropActive.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  enqueuePreciseFiles(files);
}

function enqueueManualFiles(files) {
  if (props.sourceFile) return;
  const items = appendQueueFiles(manualFileQueue, files, "manual");
  if (!items.length) return;
  void persistWorkspaceQueueItems(items, "QUICK_IMPORT");
  void processManualFileQueue();
}

function enqueuePreciseFiles(files) {
  if (props.recognitionInput === "text") return;
  if (props.sourceFile) return;
  const items = appendQueueFiles(preciseFileQueue, files, "recognition");
  if (!items.length) return;
  void persistWorkspaceQueueItems(items, "AGENT_IMPORT");
  if (!preciseQueueProcessing.value) void processPreciseQueueItem(items[0]);
}

function appendQueueFiles(queueRef, files, mode = "manual") {
  const existing = new Set(queueRef.value.map((item) => fileQueueKey(item.file)));
  const items = [];
  for (const file of Array.from(files || [])) {
    if (!isSupportedWorkbookFile(file)) {
      if (mode === "recognition") {
        setRecognitionStatus("error", "excel.dropUnsupportedFile", { name: file?.name || "-" });
      } else {
        showManualFileError("excel.dropUnsupportedFile", { name: file?.name || "-" });
      }
      continue;
    }
    const key = fileQueueKey(file);
    if (existing.has(key)) continue;
    existing.add(key);
    const item = {
      id: uid("import-file"),
      file,
      status: "queued",
      error: "",
      snapshot: null,
      workspaceFile: null
    };
    queueRef.value.push(item);
    items.push(item);
  }
  return items;
}

function fileQueueKey(file) {
  return [file?.name || "", Number(file?.size || 0), Number(file?.lastModified || 0)].join("|");
}

async function persistWorkspaceQueueItems(items, source) {
  try {
    const response = await uploadWorkspaceFiles(
      items.map((item) => item.file),
      source
    );
    const saved = Array.isArray(response?.items) ? response.items : [];
    items.forEach((item, index) => {
      item.workspaceFile =
        saved.find((entry) => entry.originalFileName === item.file.name) || saved[index] || null;
    });
    if (workspaceFilesOpen.value) await loadWorkspaceFiles();
  } catch {
    // The import remains available locally when file-library persistence is temporarily unavailable.
  }
}

async function processManualFileQueue() {
  if (manualQueueProcessing.value) return;
  manualQueueProcessing.value = true;
  try {
    let item;
    while ((item = manualFileQueue.value.find((entry) => entry.status === "queued"))) {
      activeManualFileId.value = item.id;
      item.status = "processing";
      item.error = "";
      await loadWorkbookFile(item.file);
      if (workbook.value && preview.value) {
        item.status = "ready";
        item.snapshot = captureManualSnapshot(item.file);
      } else {
        item.status = "failed";
        item.error = importStatusMessage.value;
      }
    }
  } finally {
    manualQueueProcessing.value = false;
  }
}

function captureManualSnapshot(file) {
  return {
    file,
    workbook: workbook.value,
    selectedSheetName: selectedSheetName.value,
    activeSheet: activeSheet.value,
    preview: preview.value,
    mapping: { ...mapping },
    options: { ...options },
    manualCorrections: [...manualCorrections.value],
    messageType: manualImportMessageType.value,
    messageKey: manualImportMessageKey.value,
    messageParams: { ...manualImportMessageParams.value },
    message: manualImportMessage.value
  };
}

function selectManualQueueItem(item) {
  if (!item?.snapshot || manualQueueProcessing.value) return;
  if (activeManualFileId.value && activeManualFileId.value !== item.id) {
    syncActiveManualQueueSnapshot();
  }
  activeManualFileId.value = item.id;
  applyManualSnapshot(item.snapshot, `manual:${item.id}`);
}

function applyManualSnapshot(snapshot, previewIdentity = "") {
  if (props.sourceFile) return;
  if (!snapshot) return;
  previewSeq += 1;
  workbookVersion += 1;
  lastPreviewSignature = "";
  pendingPreviewSignature = "";
  previewBusy.value = false;
  manualVolumeConfirmed.value = false;
  manualSourceWorkbookFile.value = snapshot.file;
  workbook.value = snapshot.workbook;
  selectedSheetName.value = snapshot.selectedSheetName;
  activeSheet.value = snapshot.activeSheet;
  preview.value = snapshot.preview;
  Object.keys(mapping).forEach((key) => delete mapping[key]);
  Object.assign(mapping, snapshot.mapping);
  Object.assign(options, snapshot.options);
  manualCorrections.value = [...snapshot.manualCorrections];
  manualImportMessageType.value = snapshot.messageType;
  manualImportMessageKey.value = snapshot.messageKey;
  manualImportMessageParams.value = { ...snapshot.messageParams };
  manualImportMessage.value = snapshot.message;
  syncOpenWorkbookPreview(
    snapshot.workbook,
    snapshot.file,
    previewIdentity || `manual:${fileQueueKey(snapshot.file)}`
  );
}

function syncActiveManualQueueSnapshot() {
  const activeItem = manualFileQueue.value.find((item) => item.id === activeManualFileId.value);
  if (!activeItem?.snapshot || activeItem.status !== "ready") return;
  activeItem.snapshot = captureManualSnapshot(activeItem.file);
}

async function processPreciseQueueItem(item) {
  if (props.sourceFile && item?.file !== props.sourceFile) return false;
  if (!item || preciseQueueProcessing.value || item.status === "processing") return;
  if (activePreciseFileId.value && activePreciseFileId.value !== item.id) {
    syncActivePreciseQueueSnapshot();
  }
  preciseQueueProcessing.value = true;
  activePreciseFileId.value = item.id;
  const processSeq = ++preciseProcessSeq;
  const isCurrentItem = () =>
    processSeq === preciseProcessSeq && activePreciseFileId.value === item.id;
  const previousStatus = item.snapshot
    ? item.snapshot.task?.status === "SUCCEEDED"
      ? "ready"
      : "failed"
    : "queued";
  item.status = "processing";
  item.error = "";
  try {
    const applied = await loadWorkbookFileForRecognition(item.file, { shouldApply: isCurrentItem });
    if (!applied || !isCurrentItem()) {
      item.status = previousStatus;
      return;
    }
    item.snapshot = capturePreciseSnapshot(item.file);
    item.status = recognitionAgentTask.value?.status === "SUCCEEDED" ? "ready" : "failed";
    if (item.status === "failed") item.error = recognitionStatusMessage.value;
  } catch (error) {
    if (isCurrentItem()) {
      item.snapshot = capturePreciseSnapshot(item.file);
      item.status = "failed";
      item.error = error?.message || "";
    } else {
      item.status = previousStatus;
    }
  } finally {
    if (processSeq === preciseProcessSeq) preciseQueueProcessing.value = false;
  }
}

function capturePreciseSnapshot(file) {
  return {
    file,
    workbook: recognitionWorkbook.value,
    text: recognitionText.value,
    task: recognitionAgentTask.value,
    elapsedSeconds: recognitionElapsedSeconds.value,
    message: recognitionMessage.value,
    messageKey: recognitionMessageKey.value,
    messageParams: { ...recognitionMessageParams.value },
    messageFactory: recognitionMessageFactory.value,
    messageType: recognitionMessageType.value,
    indexOverrides: { ...recognitionReviewIndexOverrides.value }
  };
}

function selectPreciseQueueItem(item) {
  if (props.sourceFile) return;
  if (!item?.snapshot || preciseQueueProcessing.value) return;
  if (activePreciseFileId.value && activePreciseFileId.value !== item.id) {
    syncActivePreciseQueueSnapshot();
  }
  activePreciseFileId.value = item.id;
  applyPreciseSnapshot(item.snapshot, `recognition:${item.id}`);
}

function applyPreciseSnapshot(snapshot, previewIdentity = "") {
  if (props.sourceFile && snapshot?.file !== props.sourceFile) return false;
  if (!snapshot) return;
  sourceWorkbookFile.value = snapshot.file;
  recognitionWorkbook.value = snapshot.workbook;
  recognitionText.value = snapshot.text;
  recognitionVolumeConfirmed.value = false;
  recognitionAgentTask.value = snapshot.task;
  recognitionElapsedSeconds.value = snapshot.elapsedSeconds;
  recognitionMessage.value = snapshot.message;
  recognitionMessageKey.value = snapshot.messageKey;
  recognitionMessageParams.value = { ...snapshot.messageParams };
  recognitionMessageFactory.value = snapshot.messageFactory;
  recognitionMessageType.value = snapshot.messageType;
  recognitionReviewIndexOverrides.value = { ...snapshot.indexOverrides };
  syncOpenWorkbookPreview(
    snapshot.workbook,
    snapshot.file,
    previewIdentity || `recognition:${fileQueueKey(snapshot.file)}`
  );
}

function syncActivePreciseQueueSnapshot() {
  const activeItem = preciseFileQueue.value.find((item) => item.id === activePreciseFileId.value);
  if (!activeItem?.snapshot || !["ready", "failed"].includes(activeItem.status)) return;
  activeItem.snapshot = capturePreciseSnapshot(activeItem.file);
}

function queueStatusText(status) {
  const key =
    {
      queued: "excel.queueQueued",
      processing: "excel.queueProcessing",
      ready: "excel.queueReady",
      failed: "excel.queueFailed"
    }[status] || "excel.queueQueued";
  return ui(key);
}

function dragContainsFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function isSupportedWorkbookFile(file) {
  return Boolean(file?.name && SUPPORTED_WORKBOOK_FILE_PATTERN.test(file.name));
}

function setManualImportStatus(type, key = "", params = {}, fallback = "") {
  manualImportMessageType.value = type;
  manualImportMessageKey.value = key;
  manualImportMessageParams.value = params;
  manualImportMessage.value = fallback;
}

function showManualFileError(key, params = {}, fallback = "") {
  setManualImportStatus("error", key, params, fallback);
}

function setRecognitionStatus(type, key = "", params = {}, fallback = "") {
  recognitionMessageType.value = type;
  recognitionMessageKey.value = key;
  recognitionMessageParams.value = params;
  recognitionMessage.value = fallback;
  recognitionMessageFactory.value = null;
}

function setRecognitionStatusFactory(type, factory) {
  recognitionMessageType.value = type;
  recognitionMessageKey.value = "";
  recognitionMessageParams.value = {};
  recognitionMessage.value = "";
  recognitionMessageFactory.value = factory;
}

function clearRecognitionStatus() {
  setRecognitionStatus("ok");
}

async function loadWorkbookFile(file) {
  if (props.sourceFile) return;
  if (!isSupportedWorkbookFile(file)) {
    showManualFileError("excel.dropUnsupportedFile", { name: file?.name || "-" });
    return;
  }
  manualImportBusy.value = true;
  manualVolumeConfirmed.value = false;
  manualSourceWorkbookFile.value = file;
  sourceWorkbookFile.value = null;
  recognitionWorkbook.value = null;
  clearWorkbookPreview();
  workbook.value = null;
  preview.value = null;
  activeSheet.value = null;
  setManualImportStatus("info", "excel.quickImportParsing");
  try {
    await loadWorkbookFileLocally(file);
  } catch (error) {
    workbook.value = null;
    activeSheet.value = null;
    preview.value = null;
    setManualImportStatus("error", "excel.quickImportFailed", {}, error?.message || "");
  } finally {
    manualImportBusy.value = false;
  }
}

async function loadWorkbookFileForRecognition(file, context = {}) {
  if (props.recognitionInput === "text") return false;
  if (props.sourceFile && file !== props.sourceFile) return false;
  const callerShouldApply =
    typeof context.shouldApply === "function" ? context.shouldApply : () => true;
  if (!componentActive || !callerShouldApply()) return false;
  if (!isSupportedWorkbookFile(file)) {
    setRecognitionStatus("error", "excel.dropUnsupportedFile", { name: file?.name || "-" });
    return true;
  }
  const runVersion = ++recognitionRunVersion;
  const shouldApply = () =>
    componentActive && runVersion === recognitionRunVersion && callerShouldApply();
  preciseImportBusy.value = true;
  sourceWorkbookFile.value = file;
  recognitionWorkbook.value = null;
  clearWorkbookPreview();
  recognitionText.value = "";
  resetRecognitionResult();
  startRecognitionTimer();
  try {
    // Local parsing is only for the source preview. The original workbook is always uploaded.
    try {
      const nextWorkbook = await readWorkbookInWorker(file);
      if (!shouldApply()) return false;
      recognitionWorkbook.value = nextWorkbook;
    } catch {
      if (!shouldApply()) return false;
      recognitionWorkbook.value = null;
    }
    excelMode.value = "recognition";
    const applied = await submitTextRecognitionTask({
      file,
      sourceName: file?.name || ui("excel.excelFormattedSource"),
      keepTimer: true,
      requestVersion: runVersion,
      shouldApply
    });
    return applied !== false && shouldApply();
  } catch (error) {
    if (!shouldApply()) return false;
    setRecognitionStatus("error", "excel.excelAgentFailed");
    return true;
  } finally {
    if (runVersion === recognitionRunVersion && componentActive) {
      preciseImportBusy.value = false;
      if (!recognitionAgentBusy.value) stopRecognitionTimer();
    }
  }
}

async function loadWorkbookFileLocally(file, backendError) {
  setManualImportStatus(
    backendError ? "warning" : "info",
    backendError ? "excel.localParseFallback" : "excel.localParsing",
    backendError ? { message: backendError.message } : {}
  );
  try {
    workbook.value = await readWorkbookInWorker(file);
    workbookVersion += 1;
    lastPreviewSignature = "";
    pendingPreviewSignature = "";
    selectedSheetName.value = workbook.value.sheets[0]?.name || "";
    manualCorrections.value = [];
    setManualImportStatus("info", "excel.workbookRead", { count: workbook.value.sheets.length });
    await selectSheet();
  } catch (error) {
    workbook.value = null;
    activeSheet.value = null;
    preview.value = null;
    setManualImportStatus("error", "excel.fileParseFailed", {}, error?.message || "");
  }
}

function applyBackendImportResult(result, file) {
  workbookVersion += 1;
  lastPreviewSignature = "";
  pendingPreviewSignature = "";
  workbook.value = result?.workbook || {
    source: "backend",
    fileName: file?.name || result?.fileName || "",
    sheets: []
  };
  workbook.value.source = "backend";
  selectedSheetName.value = workbook.value.sheets?.[0]?.name || "";
  activeSheet.value = result?.activeSheet || workbook.value.sheets?.[0] || null;
  Object.keys(mapping).forEach((key) => delete mapping[key]);
  Object.assign(mapping, activeSheet.value?.mapping || {});
  preview.value = normalizeBackendPreview(result?.preview);
  manualCorrections.value = [];
  applyPreviewMessage(preview.value);
}

function switchExcelMode(mode) {
  const nextMode = mode === "agent" ? "recognition" : mode;
  if (props.sourceFile && nextMode !== "recognition") return;
  if (importBusy.value || !["manual", "recognition"].includes(nextMode)) return;
  manualDragDepth = 0;
  preciseDragDepth = 0;
  manualDropActive.value = false;
  preciseDropActive.value = false;
  excelMode.value = nextMode;
}

async function selectImportModeFromKeyboard(mode) {
  switchExcelMode(mode);
  await nextTick();
  const target = mode === "recognition" ? smartImportTab.value : quickImportTab.value;
  (target?.$el || target)?.focus?.();
}

async function selectSheet() {
  activeSheet.value =
    workbook.value?.sheets.find((sheet) => sheet.name === selectedSheetName.value) || null;
  Object.keys(mapping).forEach((key) => delete mapping[key]);
  Object.assign(mapping, activeSheet.value?.mapping || {});
  if (backendImportActive.value) {
    if (preview.value) applyPreviewMessage(preview.value);
    return;
  }
  await refreshPreview();
}

async function refreshPreview() {
  manualVolumeConfirmed.value = false;
  if (backendImportActive.value) {
    if (preview.value) applyPreviewMessage(preview.value);
    return;
  }
  const sheet = cloneSheetForWorker(activeSheet.value);
  if (!sheet) {
    preview.value = null;
    return;
  }
  const workerMapping = { ...mapping };
  const workerOptions = { ...options };
  const signature = previewSignature(sheet, workerMapping, workerOptions);
  if (signature === pendingPreviewSignature) return;
  if (signature === lastPreviewSignature && preview.value) {
    previewBusy.value = false;
    applyPreviewMessage(preview.value);
    return;
  }
  const seq = ++previewSeq;
  pendingPreviewSignature = signature;
  previewBusy.value = true;
  if (!preview.value) {
    setManualImportStatus("info", "excel.validatingRows");
  }
  try {
    const nextPreview = await buildPreviewInWorker(sheet, workerMapping, workerOptions);
    if (seq !== previewSeq) return;
    preview.value = nextPreview;
    lastPreviewSignature = signature;
    applyPreviewMessage(nextPreview);
  } catch (error) {
    if (seq !== previewSeq) return;
    preview.value = null;
    setManualImportStatus("error", "excel.previewValidationFailed", {}, error?.message || "");
  } finally {
    if (seq === previewSeq) {
      if (pendingPreviewSignature === signature) pendingPreviewSignature = "";
      previewBusy.value = false;
    }
  }
  manualCorrections.value = [];
  closeSuggestion();
}

function previewSignature(sheet, workerMapping, workerOptions) {
  return JSON.stringify({
    workbookVersion,
    sheetName: sheet.name,
    headerRowIndex: sheet.headerRowIndex,
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    mapping: workerMapping,
    options: workerOptions
  });
}

function applyPreviewMessage(nextPreview) {
  manualImportMessageType.value = nextPreview.invalidRows.length ? "warning" : "success";
  manualImportMessageKey.value = "";
  manualImportMessageParams.value = {};
  manualImportMessage.value = "";
}

function cloneSheetForWorker(sheet) {
  if (!sheet) return null;
  return {
    name: sheet.name,
    headerRowIndex: Number(sheet.headerRowIndex || 0),
    headers: [...(sheet.headers || [])],
    rows: (sheet.rows || []).map((row) => [...row]),
    mapping: { ...(sheet.mapping || {}) },
    rawRows: (sheet.rawRows || []).map((row) => [...row]),
    merges: [...(sheet.merges || [])],
    mergeCells: (sheet.mergeCells || []).map((merge) => ({ ...merge })),
    formulaCells: (sheet.formulaCells || []).map((cell) => ({ ...cell }))
  };
}

function normalizeBackendPreview(nextPreview) {
  const normalized = nextPreview || {};
  const validRows = Array.isArray(normalized.validRows) ? normalized.validRows : [];
  const invalidRows = Array.isArray(normalized.invalidRows) ? normalized.invalidRows : [];
  const aggregated = Array.isArray(normalized.aggregated) ? normalized.aggregated : [];
  return {
    totalRows: Number(normalized.totalRows || validRows.length + invalidRows.length),
    validRowCount: Number(normalized.validRowCount ?? validRows.length),
    invalidRowCount: Number(normalized.invalidRowCount ?? invalidRows.length),
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: Number(
      normalized.importedQuantity ||
        aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
    ),
    skippedRows: Number(normalized.skippedRows ?? invalidRows.length),
    validRowsSampled: Boolean(normalized.validRowsSampled)
  };
}

function previewValidRowCount(nextPreview) {
  if (!nextPreview) return 0;
  return Number(nextPreview.validRowCount ?? nextPreview.validRows?.length ?? 0);
}

function resetRecognitionResult() {
  recognitionPreview.value = null;
  recognitionVolumeConfirmed.value = false;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  clearRecognitionStatus();
  closeRecognitionReviewDialog();
  closeRecognitionEdit();
}

async function submitTextRecognitionTask(options = {}) {
  if (props.recognitionInput === "text" && options.file) return false;
  if (props.sourceFile && options.file !== props.sourceFile) return false;
  const text = String(options.textOverride ?? recognitionText.value).trim();
  const callerShouldApply =
    typeof options.shouldApply === "function" ? options.shouldApply : () => true;
  if ((!options.file && !text) || !componentActive || !callerShouldApply()) return false;
  const runVersion = options.requestVersion ?? ++recognitionRunVersion;
  const shouldApply = () =>
    componentActive && runVersion === recognitionRunVersion && callerShouldApply();
  if (!shouldApply()) return false;
  if (!options.file) {
    sourceWorkbookFile.value = null;
    recognitionWorkbook.value = null;
    clearWorkbookPreview();
  }
  if (!options.keepTimer) startRecognitionTimer();
  recognitionAgentBusy.value = true;
  clearRecognitionStatus();
  recognitionPreview.value = null;
  recognitionVolumeConfirmed.value = false;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  try {
    const capabilities = await assertExcelAgentBackendReady(Boolean(options.file));
    if (!shouldApply()) return false;
    const task = options.file
      ? await createWorkbookRecognitionTask(options.file, { languageHint: "auto" })
      : await createTextRecognitionTask(text, {
          sourceName: options.sourceName || ui("excel.pastedTextSource"),
          mode: "agent",
          languageHint: "auto"
        });
    if (!shouldApply()) return false;
    assertCreatedExcelTaskEngine(task, capabilities, Boolean(options.file));
    const completedTask = task?.id ? await waitForTextRecognitionTask(task.id) : task;
    if (!shouldApply()) return false;
    recognitionVolumeConfirmed.value = false;
    recognitionAgentTask.value = { ...completedTask, _workbookUpload: Boolean(options.file) };
    closeRecognitionEdit();
    const recognitionPartial =
      recognitionBlockingIssues.value.length > 0 ||
      recognitionPackingReview.value.blockingIssues.length > 0;
    if (recognitionAgentTask.value.status === "FAILED") {
      const task = recognitionAgentTask.value;
      setRecognitionStatusFactory("error", () => recognitionTaskFailureMessage(task));
    } else if (recognitionPartial) {
      setRecognitionStatusFactory("error", () => recognitionBlockingMessage());
    } else {
      setRecognitionStatus("ok", "excel.recognitionCompleteMessage", {
        types: recognitionRows.value.length,
        pieces: recognitionQuantity.value,
        review: recognitionReviewFindings.value.length
      });
    }
    if (recognitionAgentTask.value.status === "FAILED") {
      closeRecognitionReviewDialog();
    } else {
      openRecognitionReviewDialog();
    }
    return true;
  } catch (error) {
    if (!shouldApply()) return false;
    if (error?.code === "TEXT_RECOGNITION_TIMEOUT") {
      setRecognitionStatus("error", "excel.recognitionTimeout");
    } else if (error?.code === "TEXT_RECOGNITION_BACKEND_OUTDATED") {
      setRecognitionStatus("error", "excel.recognitionBackendOutdated");
    } else {
      setRecognitionStatus("error", "excel.recognitionUnavailable", { message: error.message });
    }
    closeRecognitionReviewDialog();
    return true;
  } finally {
    if (runVersion === recognitionRunVersion && componentActive) {
      recognitionAgentBusy.value = false;
      stopRecognitionTimer();
    }
  }
}

async function assertExcelAgentBackendReady(workbookUpload = false) {
  let capabilities;
  try {
    capabilities = await fetchTextRecognitionCapabilities();
  } catch (error) {
    if (
      [404, 405].includes(Number(error?.status)) ||
      /API\s+(404|405)\b/i.test(String(error?.message || ""))
    ) {
      throw textRecognitionBackendOutdatedError();
    }
    throw error;
  }
  if (
    !(workbookUpload
      ? supportsWorkbookRecognition(capabilities)
      : supportsTextRecognition(capabilities))
  ) {
    throw textRecognitionBackendOutdatedError();
  }
  return capabilities;
}

function textRecognitionBackendOutdatedError() {
  const error = new Error("TEXT_RECOGNITION_BACKEND_OUTDATED");
  error.code = "TEXT_RECOGNITION_BACKEND_OUTDATED";
  return error;
}

function assertCreatedExcelTaskEngine(task, capabilities, workbookUpload = false) {
  if (!supportsCreatedRecognitionTask(task, capabilities, workbookUpload)) {
    throw textRecognitionBackendOutdatedError();
  }
}

function recognitionTaskFailureMessage(task) {
  const message = String(task?.errorMessage || "").trim();
  const legacyOutputLimit = message.includes(
    "\u8bf7\u91cd\u8bd5\u6216\u51cf\u5c11\u65e0\u5173\u5de5\u4f5c\u8868\u3001\u7a7a\u767d\u884c"
  );
  if (legacyOutputLimit) return ui("excel.recognitionBackendOutdated");
  return ui("excel.recognitionFailed", {
    message: message || ui("excel.recognitionFailedFallback")
  });
}

function recognitionIssueFindingId(issue, index) {
  return `issue-${issue?.rowNumber ?? index}-${index}`;
}

let recognitionTimerId = null;

function startRecognitionTimer() {
  stopRecognitionTimer();
  recognitionElapsedSeconds.value = 0;
  const startedAt = Date.now();
  recognitionTimerId = window.setInterval(() => {
    recognitionElapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
  }, 250);
}

function stopRecognitionTimer() {
  if (recognitionTimerId != null) {
    window.clearInterval(recognitionTimerId);
    recognitionTimerId = null;
  }
}

function formatElapsedTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes
    ? `${minutes}:${String(remaining).padStart(2, "0")}`
    : `${remaining} ${ui("unit.seconds")}`;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function sourceSheetRowCount(sheet) {
  return sheet?.rawRows?.length || sheet?.rows?.length || 0;
}

function openSourceWorkbookPreview() {
  const activeItem = preciseFileQueue.value.find((item) => item.id === activePreciseFileId.value);
  const snapshot = activeItem?.snapshot;
  if (activeItem && !snapshot) return;
  const nextWorkbook = snapshot?.workbook || recognitionWorkbook.value;
  const nextFile = snapshot?.file || sourceWorkbookFile.value;
  if (!nextWorkbook) return;
  openWorkbookPreview(
    nextWorkbook,
    nextFile,
    activeItem ? `recognition:${activeItem.id}` : `recognition:${fileQueueKey(nextFile)}`
  );
}

function openManualWorkbookPreview() {
  const activeItem = manualFileQueue.value.find((item) => item.id === activeManualFileId.value);
  const snapshot = activeItem?.snapshot;
  if (activeItem && !snapshot) return;
  const nextWorkbook = snapshot?.workbook || workbook.value;
  const nextFile = snapshot?.file || manualSourceWorkbookFile.value;
  if (!nextWorkbook) return;
  openWorkbookPreview(
    nextWorkbook,
    nextFile,
    activeItem ? `manual:${activeItem.id}` : `manual:${fileQueueKey(nextFile)}`
  );
}

function openWorkbookPreview(nextWorkbook, nextFile, identity = "") {
  if (!nextWorkbook) return;
  sourcePreviewIdentity.value = identity || `workbook:${fileQueueKey(nextFile)}`;
  sourcePreviewWorkbook.value = nextWorkbook;
  sourcePreviewFile.value = nextFile || null;
  sourcePreviewSheetName.value = nextWorkbook?.sheets?.[0]?.name || "";
  sourcePreviewOpen.value = true;
}

function syncOpenWorkbookPreview(nextWorkbook, nextFile, identity = "") {
  if (!sourcePreviewOpen.value) return;
  if (!nextWorkbook) {
    clearWorkbookPreview();
    return;
  }
  openWorkbookPreview(nextWorkbook, nextFile, identity);
}

function clearWorkbookPreview() {
  sourcePreviewOpen.value = false;
  sourcePreviewSheetName.value = "";
  sourcePreviewWorkbook.value = null;
  sourcePreviewFile.value = null;
  sourcePreviewIdentity.value = "";
}

function downloadSourceWorkbook() {
  if (!sourceWorkbookFile.value) return;
  const url = URL.createObjectURL(sourceWorkbookFile.value);
  const link = document.createElement("a");
  link.href = url;
  link.download = sourceWorkbookFile.value.name || "source-workbook.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadPreviewWorkbook() {
  if (!sourcePreviewFile.value) return;
  downloadBrowserFile(sourcePreviewFile.value);
}

function downloadBrowserFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || "source-workbook.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function openWorkspaceFiles(mode = "manual") {
  if (props.sourceFile) return;
  workspaceFilesTargetMode.value = mode === "recognition" ? "recognition" : "manual";
  workspaceFilesOpen.value = true;
  await loadWorkspaceFiles();
}

async function loadWorkspaceFiles() {
  workspaceFilesBusy.value = true;
  workspaceFilesError.value = "";
  try {
    const response = await fetchWorkspaceFiles({ page: 0, size: 200 });
    workspaceFiles.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    workspaceFilesError.value = ui("excel.workspaceFilesLoadFailed", {
      message: error?.message || "-"
    });
  } finally {
    workspaceFilesBusy.value = false;
  }
}

async function useWorkspaceFile(item) {
  if (props.sourceFile) return;
  workspacePreviewSeq += 1;
  workspaceFilesBusy.value = true;
  workspaceFilesError.value = "";
  try {
    await reuseWorkspaceFile(item.id);
    const blob = await fetchWorkspaceFileBlob(item.id, "download");
    const file = new File([blob], item.originalFileName || `workspace-${item.id}.xlsx`, {
      type: item.contentType || blob.type || "application/octet-stream",
      lastModified: Date.now()
    });
    workspaceFilesOpen.value = false;
    if (workspaceFilesTargetMode.value === "recognition") {
      switchExcelMode("recognition");
      const queued = appendQueueFiles(preciseFileQueue, [file], "recognition");
      if (queued[0]) queued[0].workspaceFile = item;
      if (!preciseQueueProcessing.value && queued[0]) void processPreciseQueueItem(queued[0]);
    } else {
      switchExcelMode("manual");
      const queued = appendQueueFiles(manualFileQueue, [file], "manual");
      if (queued[0]) queued[0].workspaceFile = item;
      if (queued.length) void processManualFileQueue();
    }
  } catch (error) {
    workspaceFilesError.value = ui("excel.workspaceFileReuseFailed", {
      message: error?.message || "-"
    });
  } finally {
    workspaceFilesBusy.value = false;
  }
}

async function previewWorkspaceFile(item) {
  const previewSeq = ++workspacePreviewSeq;
  workspaceFilesBusy.value = true;
  workspaceFilesError.value = "";
  try {
    const blob = await fetchWorkspaceFileBlob(item.id, "preview");
    if (previewSeq !== workspacePreviewSeq) return;
    const file = new File([blob], item.originalFileName || `workspace-${item.id}.xlsx`, {
      type: item.contentType || blob.type || "application/octet-stream",
      lastModified: Date.now()
    });
    const nextWorkbook = await readWorkbookInWorker(file);
    if (previewSeq !== workspacePreviewSeq) return;
    openWorkbookPreview(nextWorkbook, file, `workspace:${item.id}`);
  } catch (error) {
    if (previewSeq === workspacePreviewSeq) {
      workspaceFilesError.value = ui("excel.workspaceFilePreviewFailed", {
        message: error?.message || "-"
      });
    }
  } finally {
    if (previewSeq === workspacePreviewSeq) workspaceFilesBusy.value = false;
  }
}

async function removeWorkspaceFile(item) {
  workspacePreviewSeq += 1;
  workspaceFilesBusy.value = true;
  workspaceFilesError.value = "";
  try {
    await deleteWorkspaceFile(item.id);
    workspaceFiles.value = workspaceFiles.value.filter((entry) => entry.id !== item.id);
  } catch (error) {
    workspaceFilesError.value = ui("excel.workspaceFileDeleteFailed", {
      message: error?.message || "-"
    });
  } finally {
    workspaceFilesBusy.value = false;
  }
}

function displayWorkspaceDate(value) {
  const text = String(value || "");
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text || ui("excel.unknownDate");
  return new Intl.DateTimeFormat(currentLocale.value, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

function displayWorkspaceTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(currentLocale.value, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

watch(
  [recognitionAgentTask, recognitionRows, importBusy],
  () =>
    emit("review-change", {
      task: recognitionAgentTask.value,
      rows: recognitionRows.value,
      busy: importBusy.value
    }),
  { deep: true, immediate: true }
);
watch(
  () => props.sourceFile,
  (file) => {
    if (file) loadWorkbookFileForRecognition(file);
  },
  { immediate: true }
);

watch(approvedAggregated, () => {
  manualVolumeConfirmed.value = false;
});
watch(recognitionRows, () => {
  recognitionVolumeConfirmed.value = false;
});
watch(
  () => props.reviewSource,
  (source) => {
    if (!source?.preview || !source?.workbook) return;
    if (props.coordinated) {
      if (source.file && !props.sourceFile) loadWorkbookFileForRecognition(source.file);
      return;
    }
    excelMode.value = "manual";
    const sheet = source.workbook.sheets?.[0];
    applyManualSnapshot({
      file: source.file,
      workbook: source.workbook,
      selectedSheetName: sheet?.name || "",
      activeSheet: sheet,
      preview: source.preview,
      mapping: sheet?.mapping || {},
      options: { dimensionUnit: "auto", weightUnit: "auto" },
      manualCorrections: [],
      messageType: "warning",
      messageKey: "excel.importNeedsReconciliation",
      messageParams: {},
      message: ""
    });
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  componentActive = false;
  preciseProcessSeq += 1;
  workspacePreviewSeq += 1;
  stopRecognitionTimer();
});

function fillRecognitionSample() {
  if (props.sourceFile) return;
  recognitionRunVersion += 1;
  sourceWorkbookFile.value = null;
  recognitionWorkbook.value = null;
  clearWorkbookPreview();
  recognitionText.value = t("smartImport.recognitionSample");
  recognitionPreview.value = null;
  recognitionVolumeConfirmed.value = false;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  closeRecognitionReviewDialog();
  closeRecognitionEdit();
  setRecognitionStatusFactory("ok", () => t("smartImport.sampleLoadedMessage"));
}

function clearRecognition() {
  if (props.sourceFile) return;
  recognitionRunVersion += 1;
  sourceWorkbookFile.value = null;
  recognitionWorkbook.value = null;
  clearWorkbookPreview();
  recognitionText.value = "";
  recognitionPreview.value = null;
  recognitionVolumeConfirmed.value = false;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  closeRecognitionReviewDialog();
  closeRecognitionEdit();
  clearRecognitionStatus();
}

function importRecognitionRows() {
  if (!recognitionRows.value.length) return;
  if (!recognitionCanImport.value) {
    setRecognitionStatusFactory("error", () => recognitionBlockingMessage());
    openRecognitionReviewDialog();
    return;
  }
  const sourceReport = taskReconciliation(recognitionAgentTask.value);
  const sourceRows = recognitionRows.value.map((cargo) =>
    sourceReport
      ? {
          ...cargo,
          packageInfo: { ...(cargo.packageInfo || {}), sourceReconciliation: sourceReport }
        }
      : cargo
  );
  const cargos = aggregateCargos(sourceRows).map((cargo, index) =>
    normalizeImportedCargo(cargo, index)
  );
  const importReview = reviewPackingTask(recognitionAgentTask.value, cargos, {
    volumeConfirmed: recognitionVolumeConfirmed.value
  });
  if (!importReview.canImport) {
    setRecognitionStatus("error", "excel.packingCheckBlocked");
    openRecognitionReviewDialog();
    return;
  }
  emit("import-cargos", {
    cargos,
    mode: importMode.value,
    skippedRows: recognitionSkippedIssueCount.value,
    importKind: "precise",
    volumeConfirmed: recognitionVolumeConfirmed.value
  });
}

function openRecognitionReviewDialog() {
  recognitionReviewActiveNames.value = recognitionReviewFindings.value.length
    ? ["needsReview", "normal"]
    : ["normal"];
  recognitionReviewDialogOpen.value = true;
}

function closeRecognitionReviewDialog() {
  recognitionReviewDialogOpen.value = false;
}

function editRecognitionReviewCargo(finding) {
  if (!finding) return;
  let cargo = finding.cargo ||
    finding.suggestion?.cargo || {
      name: ui("excel.reviewUnknownItem"),
      model: "",
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      quantity: 0,
      weightKg: 0,
      type: "normal",
      remark: recognitionReviewSourceText(finding)
    };
  if (isPalletDimensionsMissingFinding(finding)) {
    const cargoType = String(cargo.type || "")
      .trim()
      .toLowerCase();
    cargo = {
      ...cargo,
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      type: ["pallet", "nonstack", "upright"].includes(cargoType) ? cargoType : "pallet"
    };
  }
  const append = finding.index < 0;
  const index = append ? recognitionRows.value.length : finding.index;
  closeRecognitionReviewDialog();
  openRecognitionEdit(cargo, index, {
    append,
    findingId: finding.id,
    issueCode: finding.issue?.code || ""
  });
}

function issueMessages(issue) {
  const codedMessageKey = {
    AGENT_OUTPUT_LIMIT: "excel.recognitionIssueOutputLimit",
    AGENT_ROW_COVERAGE: "excel.recognitionIssueRowCoverage",
    AGENT_REQUEST_BUDGET: "excel.recognitionIssueRequestBudget",
    INPUT_TRUNCATED: "excel.recognitionIssueInputTruncated",
    PALLET_DIMENSIONS_MISSING: "excel.recognitionIssuePalletDimensionsMissing",
    PACKAGE_SOURCE_INVALID: "excel.packageSourceNeedsReview",
    PACKAGE_PLAN_INVALID: "excel.packageSourceNeedsReview",
    PACKAGE_CONSERVATION_MISMATCH: "excel.packageSourceNeedsReview",
    PACKAGE_IDENTITY_AMBIGUOUS: "excel.packageIdentityUnclear",
    PACKAGE_CONTENT_MISMATCH: "excel.packageContentsUnclear",
    PACKAGE_SOURCE_VOLUME_MISMATCH: "excel.volumeDifferenceReview"
  }[String(issue?.code || "")];
  if (codedMessageKey) return [ui(codedMessageKey)];
  const errors = Array.isArray(issue?.errors) ? issue.errors.filter(Boolean) : [];
  if (errors.length) return errors;
  const message = String(issue?.message || "").trim();
  return message ? [message] : [ui("excel.reviewUnknownReason")];
}

function isPalletDimensionsMissingFinding(finding) {
  return String(finding?.issue?.code || "") === "PALLET_DIMENSIONS_MISSING";
}

function isRecognitionIssueOverrideResolved(issue, issueIndex) {
  const findingId = recognitionIssueFindingId(issue, issueIndex);
  const cargoIndex = recognitionReviewIndexOverrides.value[findingId];
  if (!Number.isInteger(cargoIndex) || cargoIndex < 0 || cargoIndex >= recognitionRows.value.length)
    return false;
  if (String(issue?.code || "") !== "PALLET_DIMENSIONS_MISSING") return true;
  return isUserConfirmedPalletDimensions(recognitionRows.value[cargoIndex]);
}

function isUserConfirmedPalletDimensions(cargo) {
  const packageInfo = cargo?.packageInfo || {};
  return (
    Number(cargo?.lengthCm) > 0 &&
    Number(cargo?.widthCm) > 0 &&
    Number(cargo?.heightCm) > 0 &&
    cargoHandlingUnitType(cargo) === "pallet" &&
    String(packageInfo.handlingUnitType || "")
      .trim()
      .toLowerCase() === "pallet" &&
    String(packageInfo.packageUnit || "")
      .trim()
      .toLowerCase() === "pallet" &&
    String(packageInfo.dimensionSource || "")
      .trim()
      .toLowerCase() === "user" &&
    packageInfo.handlingUnitDimensionsExplicit === true
  );
}

function recognitionBlockingMessage() {
  if (recognitionPackingReview.value.blockingIssues.length) return ui("excel.packingCheckBlocked");
  if (
    recognitionPackingReview.value.requiresVolumeConfirmation &&
    !recognitionVolumeConfirmed.value
  )
    return ui("excel.volumeDifferenceReview");
  if (recognitionMissingPalletDimensionIssues.value.length) {
    return ui("excel.recognitionPalletDimensionsBlocking", {
      count: recognitionMissingPalletDimensionIssues.value.length
    });
  }
  return ui("excel.recognitionPartial", { count: recognitionBlockingIssues.value.length });
}

function isSoftRecognitionIssue(issue, messages = []) {
  if (recognitionBlockingIssueCodes.has(String(issue?.code || ""))) return false;
  const suggestion = issue?.suggestion || {};
  const text = [
    issue?.message,
    issue?.text,
    issue?.rawText,
    ...(Array.isArray(issue?.errors) ? issue.errors : []),
    ...(Array.isArray(suggestion.notes) ? suggestion.notes : []),
    ...(Array.isArray(suggestion.errors) ? suggestion.errors : []),
    ...messages
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (hardRecognitionIssueKeywords.some((keyword) => text.includes(keyword))) return false;
  return (
    text.includes("review:") ||
    containsReviewKeyword(text, reviewKeywords.emptyPallet) ||
    containsReviewKeyword(text, reviewKeywords.mixedPallet) ||
    containsReviewKeyword(text, reviewKeywords.uncertain) ||
    (containsReviewKeyword(text, reviewKeywords.standalone) &&
      containsReviewKeyword(text, reviewKeywords.pallet))
  );
}

function cargoReviewReasons(cargo) {
  const reasons = [];
  if (isPalletRecognitionCargo(cargo) && Number(cargo?.weightKg || 0) <= 0) {
    reasons.push(ui("excel.reviewReasonPalletWeight"));
  }
  return [...new Set(reasons)];
}

function isPalletRecognitionCargo(cargo) {
  return cargoHandlingUnitType(cargo) === "pallet";
}

function containsReviewKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function reviewSearchText(cargo) {
  let packageText = "";
  try {
    packageText = cargo?.packageInfo ? JSON.stringify(cargo.packageInfo) : "";
  } catch {
    packageText = "";
  }
  return [cargo?.name, cargo?.model, cargo?.remark, cargo?.type, packageText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function reviewCargoTitle(cargo, index) {
  const label = suggestionCargoLabel(cargo) || ui("excel.reviewUnknownItem");
  return `${index + 1}. ${label} · ${cargo.lengthCm || "-"} × ${cargo.widthCm || "-"} × ${cargo.heightCm || "-"} cm`;
}

function recognitionReviewSourceText(finding) {
  const issue = finding?.issue || {};
  return issue.text || issue.rawText || finding?.source || finding?.cargo?.remark || "-";
}

function recognitionReviewSuggestionGroups(finding) {
  const suggestion = finding?.suggestion || {};
  const groups = recognitionReviewCargoGroups(suggestion.cargo, finding);
  const noteRows = [];
  const notes = reviewListValue(suggestion.notes);
  if (notes) noteRows.push({ label: ui("excel.reviewAgentNotes"), value: notes });
  const errors = reviewListValue(suggestion.errors);
  if (errors) noteRows.push({ label: ui("excel.reviewValidation"), value: errors });
  if (noteRows.length) mergeReviewNotesGroup(groups, noteRows);
  return groups;
}

function recognitionReviewCargoGroups(cargo, finding = null) {
  if (!cargo) return [];
  const packageInfo = cargo.packageInfo || {};
  const innerCargo = packageInfo.innerCargo || {};
  const pallet = isPalletRecognitionCargo(cargo);
  const identifiedPackage = Boolean(
    cargo.packageNo ||
    cargo.marks ||
    packageInfo.packageNo ||
    packageInfo.marks ||
    packageInfo.algorithmBasis === "source-package-group"
  );
  const outerPackageDetails = identifiedPackage && !pallet;
  const innerDimensions = recognitionInnerCartonDimensions(cargo);
  const cargoDimensions = pallet ? innerDimensions : normalizeReviewDimensions(cargo);
  const innerQuantity = firstReviewValue(
    innerCargo.totalQuantity,
    innerCargo.cartonCount,
    innerCargo.totalCartons,
    innerCargo.pieceCount
  );
  const innerUnitWeight = firstReviewValue(
    innerCargo.unitNetWeightKg,
    innerCargo.netWeightKg,
    innerCargo.cartonGrossWeightKg,
    innerCargo.unitGrossWeightKg,
    innerCargo.unitWeightKg
  );
  const groups = [
    {
      key: "cargo",
      title: ui(outerPackageDetails ? "excel.packageUnitDetails" : "excel.reviewCargoUnitInfo"),
      rows: [
        { label: ui("common.cargo"), value: innerCargo.name || cargo.name || "-" },
        { label: ui("common.model"), value: innerCargo.model || cargo.model || "-" },
        {
          label: ui("common.dimensionsCm"),
          value: cargoDimensions ? recognitionDimensionText(cargoDimensions) : "-"
        },
        {
          label: ui(outerPackageDetails ? "excel.packageCount" : "common.quantity"),
          value: outerPackageDetails ? cargo.quantity : (innerQuantity ?? cargo.quantity ?? "-")
        },
        {
          label: ui(outerPackageDetails ? "excel.packageGrossWeight" : "common.unitWeightKg"),
          value: outerPackageDetails
            ? cargo.weightKg
            : (innerUnitWeight ?? (pallet ? "-" : (cargo.weightKg ?? "-")))
        }
      ]
    }
  ];

  if (pallet) {
    const piecesPerPallet = firstReviewValue(
      innerCargo.piecesPerPackage,
      innerCargo.cartonsPerPallet,
      packageInfo.packagesPerPallet,
      packageInfo.cartonsPerPallet
    );
    const dimensions = recognitionReviewDimensionRows(cargo, finding);
    groups.push({
      key: "pallet",
      title: ui("excel.reviewPalletInfo"),
      rows: [
        {
          label: ui("excel.reviewPiecesPerPallet"),
          value:
            piecesPerPallet == null
              ? "-"
              : ui("excel.reviewPiecesCount", { count: piecesPerPallet })
        },
        ...dimensions,
        {
          label: ui("excel.reviewPalletCount"),
          value: cargo.quantity ?? packageInfo.packageQuantity ?? "-"
        },
        { label: ui("common.unitWeightKg"), value: cargo.weightKg ?? "-" },
        { label: ui("common.type"), value: cargoRuleText(cargo) }
      ]
    });
  } else {
    groups[0].rows.push({ label: ui("common.type"), value: cargoRuleText(cargo) });
  }

  if (outerPackageDetails)
    groups[0].rows.push({ label: ui("excel.innerGoodsCount"), value: innerQuantity ?? "—" });
  if (cargo.packageNo || cargo.marks || packageInfo.sourceRows) {
    groups.push({
      key: "source",
      title: ui("excel.packageTraceability"),
      rows: [
        { label: ui("excel.packageIdentity"), value: packageIdentityLabel(cargo) },
        { label: ui("excel.packageSourceRows"), value: packageSourceLabel(cargo) },
        ...(Array.isArray(innerCargo.lines)
          ? innerCargo.lines.map((line) => ({
              label: [line.name, line.model].filter(Boolean).join(" · "),
              value: `${line.quantity ?? "—"} ${ui("excel.goodsPiecesUnit")}${line.sourceRowNumber ? ` · ${ui("excel.sourceRowAt", { row: line.sourceRowNumber })}` : ""}`
            }))
          : [])
      ]
    });
  }
  const noteRows = [];
  if (cargo.remark) noteRows.push({ label: ui("common.remark"), value: cargo.remark });
  const packageNotes = firstReviewValue(
    packageInfo.notes,
    packageInfo.remark,
    packageInfo.handlingRequirements
  );
  if (packageNotes && packageNotes !== cargo.remark) {
    noteRows.push({ label: ui("excel.reviewPackageInfo"), value: reviewValue(packageNotes) });
  }
  if (noteRows.length) mergeReviewNotesGroup(groups, noteRows);
  return groups;
}

function mergeReviewNotesGroup(groups, rows) {
  const existing = groups.find((group) => group.key === "notes");
  if (existing) existing.rows.push(...rows);
  else groups.push({ key: "notes", title: ui("excel.reviewNotesInfo"), rows: [...rows] });
}

function firstReviewValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function recognitionReviewDimensionRows(cargo, finding) {
  if (!isPalletDimensionsMissingFinding(finding)) {
    return [{ label: ui("common.dimensionsCm"), value: recognitionDimensionText(cargo) }];
  }

  const rows = [
    {
      label: ui("excel.reviewFinalPalletOuterDimensions"),
      value: ui("excel.reviewDimensionsNotProvided"),
      missing: true
    }
  ];
  const cartonDimensions =
    recognitionInnerCartonDimensions(cargo) ||
    dimensionsFromText(recognitionReviewSourceText(finding));
  if (cartonDimensions) {
    rows.push({
      label: ui("excel.reviewOriginalCartonDimensions"),
      value: recognitionDimensionText(cartonDimensions)
    });
  }
  return rows;
}

function recognitionInnerCartonDimensions(cargo) {
  const packageInfo = cargo?.packageInfo || {};
  const innerCargo = packageInfo?.innerCargo || {};
  const candidates = [
    innerCargo.cartonDimensionsCm,
    innerCargo.unitDimensionsCm,
    innerCargo.packageDimensionsCm,
    packageInfo.cartonDimensionsCm,
    packageInfo.innerPackageDimensionsCm
  ];
  for (const candidate of candidates) {
    const dimensions = normalizeReviewDimensions(candidate);
    if (dimensions) return dimensions;
  }
  return normalizeReviewDimensions({
    lengthCm: innerCargo.cartonLengthCm ?? innerCargo.unitLengthCm ?? innerCargo.lengthCm,
    widthCm: innerCargo.cartonWidthCm ?? innerCargo.unitWidthCm ?? innerCargo.widthCm,
    heightCm: innerCargo.cartonHeightCm ?? innerCargo.unitHeightCm ?? innerCargo.heightCm
  });
}

function normalizeReviewDimensions(value) {
  if (!value) return null;
  if (typeof value === "string") return dimensionsFromText(value);
  if (Array.isArray(value)) {
    const [lengthCm, widthCm, heightCm] = value.map(Number);
    return positiveReviewDimensions(lengthCm, widthCm, heightCm);
  }
  if (typeof value !== "object") return null;
  return positiveReviewDimensions(
    Number(value.lengthCm ?? value.length ?? value.l),
    Number(value.widthCm ?? value.width ?? value.w),
    Number(value.heightCm ?? value.height ?? value.h)
  );
}

function dimensionsFromText(value) {
  const match = String(value || "").match(
    /(\d+(?:\.\d+)?)\s*(?:cm)?\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?/i
  );
  if (!match) return null;
  return positiveReviewDimensions(Number(match[1]), Number(match[2]), Number(match[3]));
}

function positiveReviewDimensions(lengthCm, widthCm, heightCm) {
  if (!(lengthCm > 0 && widthCm > 0 && heightCm > 0)) return null;
  return { lengthCm, widthCm, heightCm };
}

function recognitionDimensionText(cargo) {
  return `${cargo?.lengthCm ?? "-"} × ${cargo?.widthCm ?? "-"} × ${cargo?.heightCm ?? "-"} cm`;
}

function reviewListValue(value) {
  if (!Array.isArray(value)) return "";
  return value
    .filter(Boolean)
    .map((item) => reviewValue(item))
    .join("；");
}

function reviewValue(value) {
  if (value == null || value === "") return "-";
  if (typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      return text.length > 260 ? `${text.slice(0, 260)}...` : text;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function findRecognitionCargoIndex(cargo) {
  const key = cargoReviewKey(cargo);
  return recognitionRows.value.findIndex((item) => cargoReviewKey(item) === key);
}

function cargoReviewKey(cargo) {
  if (!cargo) return "";
  return [
    packingIdentityKey(cargo),
    cargo.name || "",
    cargo.model || "",
    Number(cargo.lengthCm || 0),
    Number(cargo.widthCm || 0),
    Number(cargo.heightCm || 0),
    Number(cargo.quantity || 0),
    Number(cargo.weightKg || 0),
    cargo.type || "",
    Boolean(cargo.nonStack),
    Boolean(cargo.keepUpright)
  ].join("|");
}

async function downloadRecognitionAgentResult() {
  if (!recognitionAgentTask.value?.id) return;
  try {
    await downloadTextRecognitionExcel(
      recognitionAgentTask.value.id,
      `${recognitionAgentTask.value.taskNo || "text-recognition"}.xlsx`
    );
  } catch (error) {
    setRecognitionStatus("error", "excel.downloadFailed", { message: error.message });
  }
}

function importPreview() {
  if (!manualCanImport.value) {
    setManualImportStatus("warning", "excel.importNeedsReconciliation");
    return;
  }
  const cargos = approvedAggregated.value.map((cargo, index) =>
    normalizeImportedCargo(cargo, index)
  );
  emit("import-cargos", {
    cargos,
    mode: importMode.value,
    skippedRows: unresolvedInvalidRows.value.length,
    importKind: "quick",
    volumeConfirmed: manualVolumeConfirmed.value
  });
}

function normalizeImportedCargo(cargo, index) {
  const constraints = cargoConstraintFlags(cargo);
  return normalizeCargoConstraints({
    id: uid("cargo"),
    name: cargo.name,
    model: cargo.model || "",
    ...packingNumbers(cargo),
    ...cargoProvenance(cargo),
    type: cargoHandlingUnitType(cargo),
    nonStack: constraints.nonStack,
    keepUpright: constraints.keepUpright,
    color: cargo.color || colors[index % colors.length],
    sku: cargo.sku || "",
    remark: cargo.remark || "",
    packageInfo: cargo.packageInfo || null
  });
}

function openRecognitionEdit(cargo, index, options = {}) {
  recognitionEditIndex.value = index;
  recognitionEditAppendMode.value = Boolean(options.append);
  recognitionEditPackageInfo.value = cargo.packageInfo || null;
  recognitionEditIdentity.value = cargoProvenance(cargo);
  recognitionEditFindingId.value = options.findingId || "";
  recognitionEditIssueCode.value = options.issueCode || "";
  const constraints = cargoConstraintFlags(cargo);
  Object.assign(recognitionEditForm, {
    name: cargo.name || "",
    model: cargo.model || "",
    lengthCm: cargo.lengthCm || "",
    widthCm: cargo.widthCm || "",
    heightCm: cargo.heightCm || "",
    quantity: Number(cargo.quantity) > 0 ? Number(cargo.quantity) : null,
    weightKg: cargo.weightKg || 0,
    type: cargoHandlingUnitType(cargo),
    nonStack: constraints.nonStack,
    keepUpright: constraints.keepUpright,
    color: cargo.color || "",
    sku: cargo.sku || "",
    remark: cargo.remark || ""
  });
  recognitionEditErrors.value = [];
}

function closeRecognitionEdit() {
  recognitionEditIndex.value = -1;
  recognitionEditAppendMode.value = false;
  recognitionEditPackageInfo.value = null;
  recognitionEditIdentity.value = {};
  recognitionEditFindingId.value = "";
  recognitionEditIssueCode.value = "";
  recognitionEditErrors.value = [];
}

function applyRecognitionEdit() {
  if (!recognitionAgentTask.value || recognitionEditIndex.value < 0) return;
  const cargo = normalizeRecognitionEditCargo();
  const errors = validateCargo(cargo);
  if (errors.length) {
    recognitionEditErrors.value = errors;
    return;
  }
  const rows = recognitionEditAppendMode.value
    ? [...recognitionRows.value, cargo]
    : recognitionRows.value.map((item, index) =>
        index === recognitionEditIndex.value ? { ...item, ...cargo } : item
      );
  if (recognitionEditFindingId.value) {
    const nextOverrides = { ...recognitionReviewIndexOverrides.value };
    if (
      recognitionEditIssueCode.value !== "PALLET_DIMENSIONS_MISSING" ||
      isUserConfirmedPalletDimensions(cargo)
    ) {
      nextOverrides[recognitionEditFindingId.value] = recognitionEditIndex.value;
    } else {
      delete nextOverrides[recognitionEditFindingId.value];
    }
    recognitionReviewIndexOverrides.value = nextOverrides;
  }
  recognitionVolumeConfirmed.value = false;
  recognitionAgentTask.value = { ...recognitionAgentTask.value, cleanedRows: rows };
  if (recognitionBlockingIssues.value.length) {
    setRecognitionStatusFactory("error", () => recognitionBlockingMessage());
  } else {
    setRecognitionStatus("ok", "excel.recognitionEditSaved", {
      index: recognitionEditIndex.value + 1
    });
  }
  closeRecognitionEdit();
}

function normalizeRecognitionEditCargo() {
  const { lengthCm, widthCm, heightCm } = packingNumbers(recognitionEditForm);
  const type = recognitionEditForm.type === "pallet" ? "pallet" : "normal";
  let packageInfo = recognitionEditPackageInfo.value
    ? { ...recognitionEditPackageInfo.value }
    : null;
  if (type === "pallet") {
    packageInfo = {
      ...(packageInfo || {}),
      handlingUnitType: "pallet",
      packageUnit: "pallet"
    };
  } else if (packageInfo && cargoHandlingUnitType({ type: "normal", packageInfo }) === "pallet") {
    packageInfo = { ...packageInfo, handlingUnitType: "package", packageUnit: "package" };
  }
  if (
    recognitionEditIssueCode.value === "PALLET_DIMENSIONS_MISSING" &&
    lengthCm > 0 &&
    widthCm > 0 &&
    heightCm > 0
  ) {
    packageInfo = {
      ...(packageInfo || {}),
      handlingUnitType: "pallet",
      packageUnit: "pallet",
      dimensionSource: "user",
      handlingUnitDimensionsExplicit: true,
      packageDimensionsCm: { lengthCm, widthCm, heightCm }
    };
  }
  return normalizeCargoConstraints({
    ...recognitionEditIdentity.value,
    name: String(recognitionEditForm.name || "").trim(),
    model: String(recognitionEditForm.model || "").trim(),
    lengthCm,
    widthCm,
    heightCm,
    quantity: Number(recognitionEditForm.quantity || 0),
    weightKg: Number(recognitionEditForm.weightKg || 0),
    type,
    nonStack: Boolean(recognitionEditForm.nonStack),
    keepUpright: Boolean(recognitionEditForm.keepUpright),
    color: recognitionEditForm.color || "",
    sku: recognitionEditForm.sku || "",
    remark: String(recognitionEditForm.remark || "").trim(),
    packageInfo
  });
}

function openSuggestion(row) {
  suggestionRow.value = row;
  const cargo = normalizeCargoConstraints(row.suggestion.cargo || {});
  Object.assign(suggestionForm, cargo, { type: cargoHandlingUnitType(cargo) });
  suggestionErrors.value = [...row.suggestion.errors];
}

function closeSuggestion() {
  suggestionRow.value = null;
  suggestionErrors.value = [];
}

function applySuggestion() {
  const cargo = normalizeSuggestionCargo();
  const errors = validateCargo(cargo);
  if (errors.length) {
    suggestionErrors.value = errors;
    return;
  }
  const rowNumber = suggestionRow.value.rowNumber;
  manualVolumeConfirmed.value = false;
  manualCorrections.value = [
    ...manualCorrections.value.filter((item) => item.sourceRowNumber !== rowNumber),
    { ...cargo, sourceRowNumber: rowNumber }
  ];
  closeSuggestion();
}

function normalizeSuggestionCargo() {
  return normalizeCargoConstraints({
    name: String(suggestionForm.name || "").trim(),
    model: String(suggestionForm.model || "").trim(),
    lengthCm: round2(suggestionForm.lengthCm),
    widthCm: round2(suggestionForm.widthCm),
    heightCm: round2(suggestionForm.heightCm),
    quantity: Math.round(Number(suggestionForm.quantity || 0)),
    weightKg: round2(suggestionForm.weightKg),
    type: suggestionForm.type || "normal",
    nonStack: Boolean(suggestionForm.nonStack),
    keepUpright: Boolean(suggestionForm.keepUpright),
    color: suggestionForm.color || "",
    sku: suggestionForm.sku || "",
    remark: String(suggestionForm.remark || "").trim()
  });
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function typeText(type) {
  return (
    {
      normal: ui("cargo.normal"),
      upright: ui("cargo.upright"),
      nonstack: ui("cargo.nonstack"),
      pallet: ui("cargo.pallet")
    }[type] || ui("cargo.normal")
  );
}

function cargoRuleText(cargo) {
  const flags = cargoConstraintFlags(cargo);
  const labels = [typeText(cargoHandlingUnitType(cargo))];
  if (flags.nonStack) labels.push(ui("cargo.nonstack"));
  if (flags.keepUpright) labels.push(ui("cargo.upright"));
  return [...new Set(labels)].join(" + ");
}

function suggestionCargoLabel(cargo) {
  if (!cargo?.name) return "-";
  return cargo.model ? `${cargo.name} ${cargo.model}` : cargo.name;
}

function cargoKey(cargo, index = "") {
  return `${index}-${packingIdentityKey(cargo)}-${cargo.name}-${cargo.lengthCm}-${cargo.widthCm}-${cargo.heightCm}-${cargo.quantity}-${cargo.weightKg}-${cargo.type}-${Boolean(cargo.nonStack)}-${Boolean(cargo.keepUpright)}`;
}
</script>

<style scoped>
.excel-template-page {
  gap: 24px;
  color: #0c1c3a;
  font-family: var(--font-ui);
}
.excel-import-mode-switch {
  display: flex;
  gap: 10px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-subtle);
}
.excel-import-mode-switch .el-button {
  flex: 1;
  margin: 0;
  font-size: 14px;
}
.excel-import-card {
  border-radius: var(--radius-card);
}
.excel-import-hero strong {
  font-size: 18px;
  font-weight: 600;
}
.excel-import-hero p {
  font-size: 14px;
  line-height: 1.7;
}
.excel-drop-zone {
  border-radius: var(--radius-card);
}
.excel-drop-copy strong {
  font-size: 18px;
}
.excel-drop-copy span {
  font-size: 13px;
}
.excel-summary-grid span {
  font-size: 12px;
}
.excel-summary-grid strong {
  font-weight: 500;
}
.excel-workspace-layout {
  gap: 24px;
}
.template-table {
  font-size: 14px;
}
.template-table th {
  font-size: 13px;
}
.template-table td {
  min-height: 48px;
  padding-block: 12px;
}
.import-file-queue {
  border-radius: var(--radius-card);
}
.import-file-queue-item {
  border-radius: var(--radius-control);
  font-size: 14px;
}
.recognition-review-notice,
.recognition-review-issue,
.workspace-file-row small {
  font-size: 13px;
  line-height: 1.7;
}
:global(.v2-import-dialog) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 40px);
  border-radius: var(--radius-dialog);
  overflow: hidden;
}
:global(.v2-import-dialog .el-dialog__header),
:global(.v2-import-dialog .el-dialog__footer) {
  flex: none;
}
:global(.v2-import-dialog .el-dialog__body) {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
@media (max-width: 760px) {
  .excel-workspace-layout {
    grid-template-columns: 1fr;
  }
  .excel-import-hero {
    flex-wrap: wrap;
    gap: 18px;
  }
  .excel-import-actions {
    flex-wrap: wrap;
  }
  .excel-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .recognition-review-three-lines {
    grid-template-columns: 1fr;
  }
  .workspace-file-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .workspace-file-actions {
    flex-wrap: wrap;
  }
}

/* Embedded import pages share their parent title and source controls. */
.excel-template-page.is-coordinated {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.is-coordinated .excel-workspace-layout {
  display: block;
  margin-top: 0;
}
.is-coordinated .smart-recognition-card {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.recognition-text-editor {
  display: grid;
  gap: 12px;
}
.recognition-text-editor > label {
  font-size: 15px;
  font-weight: 600;
  color: #273e55;
}
.recognition-text-editor > p {
  margin: 0;
  font-size: 13px;
  color: #61758b;
  line-height: 1.7;
}
.recognition-text-editor :deep(.el-textarea__inner) {
  min-height: 240px;
  padding: 20px;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 0 0 1px #d5e0eb inset;
  font-size: 14px;
  line-height: 1.85;
  color: #273e55;
}
.recognition-text-editor :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 2px #6d9acb inset;
}
.is-coordinated .source-workbook-bar {
  padding: 18px 22px;
  background: #fff;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  margin-bottom: 20px;
}
.is-coordinated.has-recognition-result .source-workbook-bar {
  min-height: 48px;
  margin: 0 0 10px;
  padding: 4px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-sizing: border-box;
}
.is-coordinated.has-recognition-result .source-workbook-bar > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 10px;
  overflow: hidden;
  font-size: 13px;
}
.is-coordinated.has-recognition-result .source-workbook-bar strong {
  max-width: 360px;
  font-size: 13px;
  font-weight: 500;
}
.is-coordinated.has-recognition-result .source-workbook-actions .el-button {
  min-height: 34px;
  height: 34px;
  padding: 7px 12px;
  font-size: 13px;
}
.is-coordinated.has-recognition-result .recognition-placeholder {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 14px;
  padding: 8px 12px;
  border-style: solid;
  border-color: #d5e4fb;
  border-radius: 6px;
  background: #eaf2ff;
  font-size: 13px;
  line-height: 1.6;
}
.is-coordinated.has-recognition-result .recognition-placeholder > span {
  flex: none;
  font-weight: 500;
}
.is-coordinated.has-recognition-result .recognition-placeholder > strong {
  font-weight: 400;
}
.is-coordinated.has-recognition-result .recognition-placeholder.error {
  border-color: #f5d0c6;
  background: #fff5f1;
  color: #a84028;
}
.is-coordinated .recognition-loading-panel {
  background: #f3f7fc;
  border-color: #dce7f2;
}
.is-coordinated .recognition-import-row {
  padding: 20px 24px;
}
.recognition-review-workspace {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(280px, 3fr);
  gap: 18px;
  align-items: start;
  min-width: 0;
}
.recognition-review-workspace > * {
  min-width: 0;
}
.recognition-review-workspace > .recognition-summary-grid {
  grid-column: 1;
  grid-row: 1;
  margin: 0;
  padding: 16px 20px;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  background: #fff;
  gap: 12px;
}
.recognition-summary-grid > div {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.recognition-summary-grid span {
  color: #6b7d99;
  font-size: 13px;
  font-weight: 400;
}
.recognition-summary-grid strong {
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  color: #0c1c3a;
  font-variant-numeric: tabular-nums;
}
.recognition-review-workspace > .text-agent-status {
  grid-column: 1;
  grid-row: 3;
  margin: 0;
  padding: 8px 12px;
  background: #f4f7fc;
  border: 1px solid #e2e9f3;
  border-radius: 7px;
  color: #3c5e8f;
  font-size: 13px;
}
.recognition-review-workspace > .recognition-result-table-wrap {
  display: block;
  grid-column: 1;
  grid-row: 2;
  align-self: start;
  align-content: start;
  height: auto;
  min-height: 0;
  margin: 0;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  background: #fff;
}
.recognition-list-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-width: 0;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e9f3;
}
.recognition-list-heading h2 {
  margin: 0;
  color: #0c1c3a;
  font-size: 18px;
  line-height: 1.4;
  font-weight: 600;
}
.recognition-list-heading > span {
  font-size: 13px;
  color: #6b7d99;
}
.recognition-list-heading .el-button {
  margin-left: auto;
  color: #0866e8;
  border-color: #d5e2f5;
}
.recognition-result-table {
  display: table;
  align-self: start;
  height: auto;
  min-height: 0;
  font-size: 14px;
}
.recognition-result-table thead,
.recognition-result-table tbody {
  height: auto;
}
.recognition-result-table thead tr {
  height: 40px;
}
.recognition-result-table th {
  box-sizing: border-box;
  height: 40px;
  padding: 8px 12px;
  background: #f4f7fc;
  color: #0c1c3a;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  border-color: #e2e9f3;
}
.recognition-result-table tbody tr,
.recognition-result-table td {
  height: 46px;
}
.recognition-result-table td {
  box-sizing: border-box;
  min-height: 0;
  padding: 6px 12px;
  border-color: #e2e9f3;
  color: #243a5a;
  line-height: 20px;
  white-space: normal;
  overflow: visible;
  overflow-wrap: anywhere;
  text-overflow: clip;
}
.recognition-result-table td .el-button {
  height: 32px;
  min-height: 32px;
  padding-block: 4px;
}
.recognition-result-table tbody tr:hover {
  background: #f7faff;
}
.recognition-review-workspace > .recognition-check-sidebar {
  grid-column: 2;
  grid-row: 1 / span 4;
  margin: 0;
  padding: 22px 20px;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  background: #fff;
}
.recognition-check-sidebar :deep(header) {
  display: grid;
  gap: 6px;
  margin-bottom: 18px;
}
.recognition-check-sidebar :deep(h3) {
  font-size: 18px;
  font-weight: 600;
  color: #0c1c3a;
}
.recognition-check-sidebar :deep(header span),
.recognition-check-sidebar :deep(.packing-check-metrics span),
.recognition-check-sidebar :deep(.packing-check-metrics small) {
  color: #6b7d99;
  font-size: 13px;
  font-weight: 400;
}
.recognition-check-sidebar :deep(.packing-check-metrics) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 14px;
  padding: 18px 0;
  border-color: #e2e9f3;
}
.recognition-check-sidebar :deep(.packing-check-metrics strong) {
  color: #0866e8;
  font-size: 25px;
  font-weight: 600;
  line-height: 1.3;
}
.recognition-check-sidebar :deep(.packing-check-blocked) {
  padding: 14px;
  border: 1px solid #f5d0c6;
  background: #fff5f1;
  color: #a84028;
  font-size: 13px;
  line-height: 1.75;
}
.recognition-check-sidebar :deep(.packing-volume-review) {
  padding: 14px;
  border: 1px solid #f6dba9;
  background: #fff9ee;
  color: #946115;
  font-size: 13px;
  line-height: 1.75;
}
.recognition-check-sidebar :deep(.packing-check-matched) {
  padding: 14px;
  border: 1px solid #bde7d8;
  border-radius: 7px;
  background: #eef9f4;
  color: #1b825c;
  font-size: 13px;
  line-height: 1.75;
}
.recognition-check-sidebar :deep(input) {
  accent-color: #0866e8;
}
.recognition-review-workspace > .recognition-import-row {
  grid-column: 1 / -1;
  grid-row: 5;
  margin: 2px 0 0;
  border: 1px solid #e2e9f3;
  border-radius: 10px;
  background: #fff;
}
.recognition-import-row :deep(.el-form-item__label) {
  color: #6b7d99;
  font-size: 13px;
  font-weight: 500;
}
.recognition-review-workspace > .template-table-wrap:not(.recognition-result-table-wrap) {
  grid-column: 1;
  grid-row: 4;
}
.excel-template-page :deep(.el-input__wrapper),
.excel-template-page :deep(.el-select__wrapper) {
  min-height: 38px;
  font: 400 14px/1.5 var(--font-ui);
}
@media (max-width: 1020px) {
  .recognition-review-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .recognition-review-workspace > .recognition-check-sidebar {
    grid-column: 1;
    grid-row: 4;
  }
  .recognition-review-workspace > .template-table-wrap:not(.recognition-result-table-wrap) {
    grid-row: 5;
  }
  .recognition-review-workspace > .recognition-import-row {
    grid-row: 6;
  }
  .recognition-check-sidebar :deep(.packing-check-metrics) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .recognition-review-workspace > .recognition-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .recognition-check-sidebar :deep(.packing-check-metrics) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .recognition-import-row {
    align-items: stretch;
    flex-direction: column;
  }
  .recognition-import-row .el-form-item,
  .recognition-import-row .el-select {
    min-width: 0;
    width: 100%;
  }
  .recognition-import-row > .el-button {
    margin-left: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .is-coordinated .recognition-loader {
    animation: none;
  }
}
</style>

<style scoped src="./workspace/workspaceElementDialog.css"></style>
