<script setup>
import { computed, onMounted, onScopeDispose, ref, useId, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Download,
  Connection,
  Delete,
  FolderOpened,
  Plus,
  Refresh,
  UploadFilled
} from "@element-plus/icons-vue";
import CarrierBadge from "../../components/brand/CarrierBadge.vue";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import { markApiErrorHandled } from "../../services/apiClient";
import {
  cancelShipmentBatchTask,
  createShipmentBatchDraft,
  fetchShipmentBatchTask,
  deleteShipmentBatchTask,
  fetchShipmentBatchTaskSummaries,
  inspectBusinessShipmentImportConflicts,
  publishShipmentBatchDraft,
  recognizeShipmentImportSchema,
  retryShipmentBatchTask,
  updateShipmentBatchDraft
} from "../../services/businessCustomerApi";
import { recognizeShipmentBatchSchemas } from "../../services/shipmentBatchImport.js";
import { ALL_TRACKING_CARRIERS } from "../../services/trackingCarriers.js";
import ShipmentTaskBatchIdentity from "./ShipmentTaskBatchIdentity.vue";
import ShipmentTaskBatchPicker from "./ShipmentTaskBatchPicker.vue";
import {
  canDeleteShipmentTask,
  shipmentTaskSourceName,
  shortShipmentTaskId,
  taskWasRemoved
} from "./shipmentTaskBatch.js";
import { confirmShipmentTask, confirmShipmentTaskDeletion } from "./shipmentTaskConfirm.js";
import { queryResultFields, queryResultGroups } from "./shipmentQueryResult.js";
import { readTaskWorkbook, recognizeTaskWorkbook, taskNeedsModelRecognition, taskRuns } from "./shipmentTaskDraft.js";
import { taskIdFromQuery } from "./shipmentTaskNetworkModel.js";
import { useShipmentTaskPublisher } from "./useShipmentTaskPublisher.js";

const props = defineProps({
  customers: { type: Array, default: () => [] },
  customerLabel: { type: Function, default: (customer) => customer.name },
  onCompleted: { type: Function, default: () => {} }
});
const { t, te, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const copy = (key, params = {}) => t(`shipmentTask.${key}`, params);
let discardPrompt;
async function confirmDiscard() {
  if (!dirty.value) return true;
  discardPrompt ??= confirmShipmentTask(t, "discardTitle", copy("discard"));
  try {
    return await discardPrompt;
  } finally {
    discardPrompt = undefined;
  }
}
const {
  tasks,
  selected,
  editor,
  dirty,
  hasDraft,
  reviewed,
  busy,
  loading,
  error,
  pollError,
  notice,
  review,
  itemCount,
  issueCount,
  canPublish,
  list,
  startNew,
  importFile,
  open,
  save,
  publish,
  cancel,
  retry,
  remove,
  forget
} = useShipmentTaskPublisher({
  api: {
    list: fetchShipmentBatchTaskSummaries,
    get: fetchShipmentBatchTask,
    create: createShipmentBatchDraft,
    update: updateShipmentBatchDraft,
    publish: publishShipmentBatchDraft,
    cancel: cancelShipmentBatchTask,
    retry: retryShipmentBatchTask,
    remove: deleteShipmentBatchTask
  },
  reportError: markApiErrorHandled,
  confirmTaskAction: (action) => confirmShipmentTask(t, action),
  confirmDelete: (task, isDirty) => confirmShipmentTaskDeletion(t, task, isDirty),
  confirmPublish: confirmExistingShipments,
  onCompleted: props.onCompleted
});
const fileInput = ref(null);
const sheets = ref([]);
const dragOver = ref(false);
const fileError = ref("");
const schemaChecking = ref(false);
const fileSchemaStatus = ref("");
const locationError = ref("");
const mappingPending = ref(false);
const selectedId = computed(() => taskIdFromQuery(route.query.taskId));
const managementLocation = computed(() => ({
  path: "/workspace/tracking/task-management",
  query: selected.value ? { taskId: selected.value.taskId } : {}
}));
const mayDelete = computed(() => canDeleteShipmentTask(selected.value));
const problemsOnly = ref(false);
const taskNameId = useId();
const sheet = computed(() =>
  sheets.value.find(({ name }) => name === editor.value.sourceMeta?.sheetName)
);
const fileModelRecognitionRequired = computed(
  () => selected.value?.status === "DRAFT" && taskNeedsModelRecognition(selected.value)
);
const schemaStatus = computed(
  () => (schemaChecking.value ? "CHECKING" : fileModelRecognitionRequired.value ? "" :
    fileSchemaStatus.value || editor.value.sourceMeta?.schemaStatus)
);
const defaultTaskName = computed(() => shipmentTaskSourceName(editor.value.sourceFileName));
const sourceFormat = computed(() => editor.value.sourceFileName.match(/\.(xlsx|xls|csv)$/i)?.[1].toUpperCase());
const excludedCount = computed(() => review.value.length - itemCount.value);
const statusLabel = (status) =>
  te(`shipmentTask.status.${status}`) ? copy(`status.${status}`) : status;
const statusesWithProblems = new Set(["FAILED", "PARTIAL", "MANUAL", "CANCELLED"]);
const results = computed(() => {
  const rows = selected.value?.items || [];
  return problemsOnly.value ? rows.filter(({ status }) => statusesWithProblems.has(status)) : rows;
});
const mayCancel = computed(
  () => taskRuns.has(selected.value?.status) && selected.value.status !== "STOPPING"
);
const mayRetry = computed(
  () =>
    selected.value?.status === "COMPLETED" &&
    selected.value.items?.some(({ status }) => status === "FAILED")
);
const serverErrors = computed(() => (dirty.value ? [] : selected.value?.validationErrors || []));
const blockedReview = computed(
  () => dirty.value || issueCount.value || serverErrors.value.length || !itemCount.value || fileModelRecognitionRequired.value
);
const errorMessage = computed(() => {
  if (locationError.value) return locationError.value;
  if (fileError.value) return fileError.value;
  if (!error.value) return "";
  if (error.value.cause?.code === "INVALID_TASK_NAME") return copy("taskNameLength");
  if (["DRAFT_REVISION_CONFLICT", "DRAFT_CLOSED", "DRAFT_FROZEN"].includes(error.value.cause?.code))
    return copy("staleRevision");
  return error.value.cause?.message || t("app.requestFailed");
});

function formatTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}

function issueLabel({ code, message }) {
  if (te(`shipmentTask.issue${code}`)) return copy(`issue${code}`);
  if (te(`customers.trackImportIssue${code}`)) return t(`customers.trackImportIssue${code}`);
  return message || code;
}

function typeLabel(type) {
  if (type === "CONTAINER") return t("customers.referenceContainer");
  return t(type === "BOOKING" ? "customers.referenceBooking" : "customers.referenceBill");
}

function reviewableSheet(sheet) {
  return !sheet.resultSheet && Number.isInteger(sheet.suggestedColumnIndex) &&
    ((sheet.modelVerified && sheet.schemaStatus === "SUGGESTED") || sheet.schemaStatus === "REVIEW_HEADERS");
}

function statusTone(status) {
  if (["SUCCEEDED", "COMPLETED"].includes(status)) return "success";
  if (["FAILED", "PARTIAL"].includes(status)) return "danger";
  if (["MANUAL", "WAITING", "RETRY_WAIT"].includes(status)) return "warning";
  if (taskRuns.has(status) || status === "PERSISTING") return "active";
  return "neutral";
}

function taskLocation(taskId) {
  const query = { ...route.query };
  if (taskId) query.taskId = taskId;
  else delete query.taskId;
  return { path: route.path, query };
}

function rememberLocation() {
  const id = selected.value?.taskId || "";
  if (route.name === "business-shipment-tasks" && selectedId.value !== id)
    return router.replace(taskLocation(id));
}

function resetExtras() {
  sheets.value = [];
  fileError.value = "";
  fileSchemaStatus.value = "";
  problemsOnly.value = false;
}

async function newTask() {
  if (busy.value) return false;
  if (selectedId.value && selected.value) return router.push(taskLocation(""));
  if (!(await confirmDiscard()) || !startNew({ discardConfirmed: true })) return false;
  locationError.value = "";
  resetExtras();
  if (selectedId.value) return router.push(taskLocation(""));
  return true;
}

function selectTask(taskId) {
  if (!busy.value && taskId !== selectedId.value) return router.push(taskLocation(taskId));
}

let missingId = "";
async function openTask(id) {
  locationError.value = "";
  if (await open(id, { discardConfirmed: true })) {
    resetExtras();
    return true;
  }
  if (taskWasRemoved(error.value?.cause)) {
    forget(id);
    startNew({ discardConfirmed: true });
    resetExtras();
    missingId = id;
    locationError.value = copy("missingTask");
    return true;
  }
  return false;
}

function recoverMissingLocation() {
  if (!missingId || selectedId.value !== missingId) return;
  missingId = "";
  void router.replace(taskLocation(""));
}

async function saveTask() {
  if (await save()) await rememberLocation();
}

async function deleteTask() {
  if (!(await remove())) return;
  resetExtras();
  locationError.value = "";
  await rememberLocation();
  void list();
}

async function readFile(file) {
  if (!file || busy.value) return;
  fileError.value = "";
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    fileError.value = copy("fileError");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    fileError.value = copy("fileLimit");
    return;
  }
  if ((hasDraft.value && !(await confirmDiscard())) || busy.value) return;
  locationError.value = "";
  fileSchemaStatus.value = "";
  if (await importFile(async () => {
    try {
      const [xlsx, bytes] = await Promise.all([import("xlsx"), file.arrayBuffer()]);
      const parsed = await recognizeShipmentBatchSchemas(
        readTaskWorkbook(bytes, xlsx, file.name),
        (payload, options) => {
          schemaChecking.value = true;
          return recognizeShipmentImportSchema(payload, options);
        }
      );
      const best = parsed
        .filter(reviewableSheet)
        .sort(
          (a, b) =>
            b.columns[b.suggestedColumnIndex].score - a.columns[a.suggestedColumnIndex].score
        )[0];
      if (!best) {
        if (parsed.some(({ schemaStatus }) => schemaStatus === "UNAVAILABLE"))
          fileSchemaStatus.value = "UNAVAILABLE";
        else if (parsed.some(({ schemaStatus }) => schemaStatus === "NO_MATCH"))
          fileSchemaStatus.value = "NO_MATCH";
        const invalid = parsed[0];
        if (invalid) {
          const problem = recognizeTaskWorkbook(invalid, invalid.suggestedColumnIndex).problems[0];
          if (problem) throw new Error(issueLabel(problem));
        }
        throw new Error(copy("noRows"));
      }
      const { rows, sourceMeta, problems } = recognizeTaskWorkbook(best, best.suggestedColumnIndex, { autoReferenceColumns: true });
      sourceMeta.workbookSheetNames = parsed.map(({ name }) => name);
      if (problems.length || !rows.length)
        throw new Error(problems.length ? issueLabel(problems[0]) : copy("noRows"));
      sheets.value = parsed.filter(reviewableSheet);
      return { sourceFileName: file.name, rows, sourceMeta };
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : copy("fileError"));
    } finally {
      schemaChecking.value = false;
    }
  }, { discardConfirmed: true })) await rememberLocation();
}

function chooseFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  void readFile(file);
}

function dropFile(event) {
  dragOver.value = false;
  void readFile(event.dataTransfer?.files?.[0]);
}

async function changeMapping(sheetName, column) {
  const targetSheet = sheets.value.find(({ name }) => name === sheetName);
  if (!targetSheet || busy.value || mappingPending.value) return;
  const autoReferenceColumns = column === null || column === "AUTO";
  const targetColumn = autoReferenceColumns ? targetSheet.suggestedColumnIndex : column;
  if (
    editor.value.sourceMeta?.sheetName === sheetName &&
    editor.value.sourceMeta.column === targetColumn &&
    Boolean(editor.value.sourceMeta.autoReferenceColumns) === autoReferenceColumns
  )
    return;
  mappingPending.value = true;
  const confirmed = await confirmShipmentTask(t, "replaceTitle", copy("replaceReview"));
  mappingPending.value = false;
  if (!confirmed || busy.value || !sheets.value.includes(targetSheet)) return;
  const { rows, sourceMeta, problems } = recognizeTaskWorkbook(targetSheet, targetColumn, { autoReferenceColumns });
  sourceMeta.workbookSheetNames = editor.value.sourceMeta?.workbookSheetNames || sheets.value.map(({ name }) => name);
  if (problems.length || !rows.length) {
    fileError.value = problems.length ? issueLabel(problems[0]) : copy("noRows");
    return;
  }
  fileError.value = "";
  Object.assign(editor.value, { rows, sourceMeta });
}

async function confirmExistingShipments(task) {
  if (task.mode !== "IMPORT") return true;
  const response = await inspectBusinessShipmentImportConflicts(
    (task.items || []).filter((item) => item.type !== "CONTAINER").map((item) => ({
      carrier: item.carrier,
      referenceType: item.type,
      referenceNo: item.number
    }))
  );
  const conflicts = response?.conflicts || [];
  if (!conflicts.length) return true;
  return confirmShipmentTask(
    t,
    "overwriteTitle",
    t("customers.batchTrackExistingConfirm", {
      count: conflicts.length,
      references: conflicts
        .slice(0, 6)
        .map(({ referenceNo }) => referenceNo)
        .filter(Boolean)
        .join(", "),
      more:
        conflicts.length > 6
          ? t("customers.moreOverwriteSnapshots", { count: conflicts.length - 6 })
          : ""
    })
  );
}

function preventUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

onBeforeRouteUpdate((to, from) => {
  const taskId = taskIdFromQuery(to.query.taskId);
  if (taskId === taskIdFromQuery(from.query.taskId) || taskId === (selected.value?.taskId || "")) return;
  return !busy.value && confirmDiscard();
});

watch(selectedId, async (id) => {
  if (route.name !== "business-shipment-tasks" || id === (selected.value?.taskId || "")) return;
  if (!startNew({ discardConfirmed: true })) return;
  resetExtras();
  locationError.value = "";
  if (id) {
    await openTask(id);
    recoverMissingLocation();
  }
});

function refreshTasks() {
  void list();
  if (selectedId.value && !selected.value) void openTask(selectedId.value).then(recoverMissingLocation);
}

onMounted(() => {
  refreshTasks();
  window.addEventListener("beforeunload", preventUnload);
});
onScopeDispose(() => window.removeEventListener("beforeunload", preventUnload));
onBeforeRouteLeave(() => !busy.value && confirmDiscard());
</script>

<template>
  <section class="task-publisher">
    <WorkspacePageHeader
      :eyebrow="t('customers.trackingTaskEyebrow')"
      :title="t('customers.trackingTaskList')"
      :description="copy('description')"
    >
      <template #actions>
        <RouterLink
          :to="managementLocation"
          class="task-button"
        >
          <el-icon><Connection /></el-icon>{{ t("shipmentTaskManagement.title") }}
        </RouterLink>
        <RouterLink :to="{ name: 'business-shipments' }" class="task-button">
          <el-icon><FolderOpened /></el-icon>{{ copy("openPanel") }}
        </RouterLink>
      </template>
    </WorkspacePageHeader>

    <div class="task-layout">
      <div class="task-toolbar">
        <ShipmentTaskBatchPicker
          :model-value="selectedId"
          :tasks="tasks"
          :current="selected"
          :loading="loading"
          :disabled="Boolean(busy)"
          history
          @update:model-value="selectTask"
        />
        <button
          type="button"
          class="task-button task-icon-button"
          :aria-label="copy('refresh')"
          :title="copy('refresh')"
          :disabled="loading || Boolean(busy)"
          @click="refreshTasks"
        >
          <el-icon><Refresh /></el-icon>
        </button>
        <button
          type="button"
          class="task-button task-primary task-toolbar-new"
          :disabled="Boolean(busy)"
          @click="newTask"
        >
          <el-icon><Plus /></el-icon>{{ copy("new") }}
        </button>
      </div>

      <div class="task-workbench">
        <p v-if="errorMessage" class="task-alert" role="alert">{{ errorMessage }}</p>
        <div v-if="notice === 'published'" class="task-alert task-notice">
          <span role="status">{{ copy("publishQueued") }}</span>
          <RouterLink :to="managementLocation" class="task-button task-primary">
            <el-icon><Connection /></el-icon>{{ copy("viewProgress") }}
          </RouterLink>
        </div>
        <p v-if="pollError" class="task-alert" role="status">{{ copy("pollError") }}</p>
        <p v-if="schemaStatus && te(`shipmentTask.schema${schemaStatus}`)" class="task-alert" role="status">
          {{ copy(`schema${schemaStatus}`) }}
        </p>
        <p v-if="fileModelRecognitionRequired" class="task-alert" role="alert">
          {{ copy("issueMODEL_RECOGNITION_REQUIRED") }}
        </p>
        <p v-if="editor.sourceMeta?.workbookSheetNames?.length > 1" class="task-alert" role="status">
          {{ copy("worksheetScope", {
            selected: editor.sourceMeta.sheetName,
            others: editor.sourceMeta.workbookSheetNames.filter((name) => name !== editor.sourceMeta.sheetName).join(" / ")
          }) }}
        </p>

        <p v-if="busy === 'open'" class="task-alert" role="status">{{ t("app.loadingPage") }}</p>
        <section v-else-if="!selected || hasDraft" class="task-card task-settings">
          <header>
            <div>
              <h2>{{ copy(hasDraft ? "draft" : "new") }}</h2>
              <p v-if="!hasDraft">{{ copy("newTaskHint") }}</p>
              <p v-else-if="selected" class="task-draft-meta">
                <span v-if="selected.createdAt">{{ copy("batchCreatedAt", { time: formatTime(selected.createdAt) }) }}</span>
                <code :title="selected.taskId">#{{ shortShipmentTaskId(selected.taskId) }}</code>
              </p>
            </div>
            <div v-if="hasDraft" class="task-draft-actions">
              <span class="task-pill" :data-tone="dirty ? 'warning' : 'success'" role="status">
                {{ dirty ? copy("unsaved") : copy("stored") }}
              </span>
              <div v-if="selected" class="task-batch-delete">
                <button type="button" class="task-button task-danger" :disabled="Boolean(busy)" @click="deleteTask">
                  <el-icon><Delete /></el-icon>{{ copy("deleteTask") }}
                </button>
              </div>
            </div>
          </header>
          <div class="task-intake">
            <div class="task-name-field">
              <label :for="taskNameId"><b>{{ copy("taskName") }}</b></label>
              <input
                :id="taskNameId"
                v-model="editor.taskName"
                type="text"
                maxlength="120"
                :placeholder="defaultTaskName || copy('taskNamePlaceholder')"
                :aria-describedby="`${taskNameId}-hint`"
                :disabled="Boolean(busy)"
              />
              <small :id="`${taskNameId}-hint`">{{ copy("taskNameHint") }}</small>
            </div>
            <dl v-if="hasDraft" class="task-source-meta">
              <div>
                <dt>{{ copy("sourceFile") }}</dt>
                <dd :title="editor.sourceFileName">{{ editor.sourceFileName || "—" }}</dd>
              </div>
              <div>
                <dt>{{ copy("sourceFormat") }}</dt>
                <dd>{{ sourceFormat || "—" }}</dd>
              </div>
              <div>
                <dt>{{ copy("sourceRowCount") }}</dt>
                <dd>{{ editor.sourceMeta?.total ?? review.length }}</dd>
              </div>
            </dl>
            <div
              v-else
              class="task-drop"
              :class="{ 'is-over': dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="dropFile"
            >
              <span class="task-upload-icon" aria-hidden="true"><el-icon><UploadFilled /></el-icon></span>
              <div>
                <h3>{{ copy("upload") }}</h3>
                <p>{{ copy("uploadHint") }}</p>
                <div class="task-actions">
                  <button
                    type="button"
                    class="task-button task-primary"
                    :disabled="Boolean(busy)"
                    @click="fileInput?.click()"
                  >
                    {{ busy === "file" ? t("app.loadingPage") : copy("pickFile") }}
                  </button>
                  <a class="task-button" href="/tracking-task-example.csv" download>
                    <el-icon><Download /></el-icon>{{ copy("template") }}
                  </a>
                </div>
              </div>
              <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="chooseFile" />
            </div>
          </div>
          <template v-if="hasDraft">
            <div class="task-settings-grid">
              <label
                ><b>{{ copy("mode") }}</b>
                <el-select v-model="editor.mode" :aria-label="copy('mode')" :disabled="Boolean(busy)">
                  <el-option value="IMPORT" :label="copy('import')" />
                  <el-option value="QUERY_ONLY" :label="copy('query')" />
                </el-select>
                <small>{{ copy(editor.mode === "IMPORT" ? "importHint" : "queryHint") }}</small>
              </label>
              <label v-if="editor.mode === 'IMPORT'"
                ><b>{{ copy("customer") }}</b>
                <el-select
                  v-model="editor.customerId"
                  :aria-label="copy('customer')"
                  :placeholder="copy('customerPlaceholder')"
                  :disabled="Boolean(busy)"
                  filterable
                  clearable
                >
                  <el-option
                    v-for="customer in customers"
                    :key="customer.id"
                    :value="customer.id"
                    :label="customerLabel(customer)"
                  />
                </el-select>
                <small v-if="!editor.customerId">{{ copy("missingCustomer") }}</small>
              </label>
            </div>
            <div v-if="editor.mode === 'IMPORT'" class="task-check-row">
              <el-checkbox v-model="editor.publishToCustomer" class="task-check" :disabled="Boolean(busy)">
                {{ copy("visibility") }}
              </el-checkbox>
            </div>
          </template>
        </section>

        <template v-if="hasDraft">
          <section class="task-card task-review">
            <header>
              <div>
                <h2>{{ copy("reviewRows") }}</h2>
                <p>
                  {{
                    copy("scope", {
                      total: editor.sourceMeta?.total ?? review.length,
                      window: review.length,
                      outside: Math.max(
                        0,
                        (editor.sourceMeta?.total ?? review.length) - review.length
                      ),
                      excluded: excludedCount
                    })
                  }}
                </p>
              </div>
              <span v-if="issueCount" class="task-pill" data-tone="danger"
                >{{ t("customers.trackingTaskIssues") }} · {{ issueCount }}</span
              >
            </header>
            <div v-if="editor.sourceMeta" class="task-mapping">
              <label
                ><span>{{ t("customers.trackSheet") }}</span>
                <el-select
                  v-if="sheets.length > 1" :model-value="editor.sourceMeta.sheetName"
                  :aria-label="t('customers.trackSheet')" :disabled="Boolean(busy) || mappingPending"
                  filterable @change="changeMapping($event, null)"
                >
                  <el-option v-for="entry in sheets" :key="entry.name" :value="entry.name" :label="entry.name" />
                </el-select>
                <b v-else>{{ editor.sourceMeta.sheetName }}</b>
              </label>
              <label
                ><span>{{ t("customers.trackColumn") }}</span>
                <el-select
                  v-if="sheet" :model-value="editor.sourceMeta.autoReferenceColumns ? 'AUTO' : editor.sourceMeta.column" :aria-label="t('customers.trackColumn')"
                  :disabled="Boolean(busy) || mappingPending" filterable @change="changeMapping(sheet.name, $event)"
                >
                  <el-option value="AUTO" :label="copy('autoColumns')" />
                  <el-option
                    v-for="column in sheet.columns.filter(({ score }) => score > 0)"
                    :key="column.index" :value="column.index" :label="column.label"
                  />
                </el-select>
                <b v-else>{{ editor.sourceMeta.columnLabel }}</b>
                <small v-if="editor.sourceMeta.referenceSuggested">{{ copy("schemaReference") }}</small>
              </label>
            </div>
            <div class="task-table-wrap">
              <table class="task-table">
                <thead>
                  <tr>
                    <th scope="col">{{ t("customers.trackSourceRow") }}</th>
                    <th scope="col">{{ t("customers.carrier") }}</th>
                    <th scope="col">{{ t("customers.referenceType") }}</th>
                    <th scope="col">{{ t("customers.trackQueryReference") }}</th>
                    <th scope="col">{{ copy("disposition") }}</th>
                    <th scope="col">{{ copy("rowState") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="{ row, errors } in review"
                    :key="row.id"
                    :class="{ 'is-excluded': row.disposition === 'EXCLUDE' }"
                  >
                    <th scope="row">
                      <b>{{ row.sourceRow }}</b>
                      <details v-if="row.sourceCells.length" class="task-source">
                        <summary>{{ copy("sourceCells") }}</summary>
                        <dl>
                          <template v-for="(cell, index) in row.sourceCells" :key="index">
                            <template v-if="cell">
                              <dt>{{ editor.sourceMeta?.headers?.[index] || index + 1 }}</dt>
                              <dd>{{ cell }}</dd>
                            </template>
                          </template>
                        </dl>
                      </details>
                    </th>
                    <td>
                      <el-select
                        v-model="row.carrier" :aria-label="t('customers.carrier') + ' ' + row.sourceRow"
                        :placeholder="copy('chooseCarrier')" :disabled="Boolean(busy) || row.disposition === 'EXCLUDE'"
                        filterable clearable :value-on-clear="''"
                      >
                        <el-option
                          v-if="row.carrier && !ALL_TRACKING_CARRIERS.some(({ code }) => code === row.carrier)"
                          :value="row.carrier" :label="row.carrier"
                        />
                        <el-option
                          v-for="carrier in ALL_TRACKING_CARRIERS" :key="carrier.code"
                          :value="carrier.code" :label="carrier.name"
                        />
                      </el-select>
                      <small v-if="row.originalCarrier" :title="row.sourceCarrierLabel || row.originalCarrier"
                        >{{
                          t(`customers.trackingQueryEvidence${row.carrierEvidence || "unknown"}`)
                        }}
                        · {{ row.sourceCarrierLabel || row.originalCarrier }}</small
                      >
                    </td>
                    <td>
                      <el-select
                        v-model="row.type" :aria-label="t('customers.referenceType') + ' ' + row.sourceRow"
                        :placeholder="copy('chooseType')" :disabled="Boolean(busy) || row.disposition === 'EXCLUDE'"
                        clearable :value-on-clear="''"
                      >
                        <el-option value="BOOKING" :label="typeLabel('BOOKING')" />
                        <el-option value="BILLOFLADING" :label="typeLabel('BILLOFLADING')" />
                        <el-option value="CONTAINER" :label="typeLabel('CONTAINER')" />
                      </el-select>
                      <small v-if="row.defaultedBooking && row.type === 'BOOKING'">{{ copy("defaultBooking") }}</small>
                    </td>
                    <td>
                      <input
                        v-model.trim="row.number"
                        type="text"
                        :aria-label="t('customers.trackQueryReference') + ' ' + row.sourceRow"
                        autocomplete="off"
                        :disabled="Boolean(busy) || row.disposition === 'EXCLUDE'"
                        @input="row.referenceEdited = true"
                      />
                      <small :title="row.originalReference"
                        >{{ row.sourceAddress }} {{ copy("original") }} ·
                        {{ row.originalReference || "—" }}</small
                      >
                    </td>
                    <td>
                      <el-select
                        v-model="row.disposition" :aria-label="copy('disposition') + ' ' + row.sourceRow" :disabled="Boolean(busy)"
                      >
                        <el-option value="QUERY" :label="copy('include')" />
                        <el-option v-if="editor.mode === 'IMPORT' || row.disposition === 'MANUAL'" value="MANUAL" :label="copy('manual')" />
                        <el-option value="EXCLUDE" :label="copy('exclude')" />
                      </el-select>
                    </td>
                    <td>
                      <ul v-if="errors.length" class="task-row-errors">
                        <li v-for="entry in errors" :key="entry.code">{{ issueLabel(entry) }}</li>
                      </ul>
                      <span v-else-if="row.disposition === 'EXCLUDE'" class="task-pill">{{
                        copy("exclude")
                      }}</span>
                      <span v-else class="task-pill" data-tone="success">{{ copy("ready") }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul v-if="serverErrors.length" class="task-server-errors">
              <li v-for="(entry, index) in serverErrors" :key="index">
                <b v-if="entry.sourceRow"
                  >{{ t("customers.trackImportRow", { row: entry.sourceRow }) }} · </b
                >{{ issueLabel(entry) }}
              </li>
            </ul>
          </section>

          <footer class="task-card task-submit">
            <el-checkbox v-model="reviewed" class="task-check" :disabled="Boolean(busy || blockedReview)">
              {{ copy("review") }}
            </el-checkbox>
            <p>
              {{
                blockedReview
                  ? copy("reviewHint")
                  : selected
                    ? copy("revision", { revision: selected.revision })
                    : copy("draftUnstored")
              }}
            </p>
            <div class="task-actions">
              <button
                type="button"
                class="task-button"
                :disabled="!dirty || Boolean(busy)"
                @click="saveTask"
              >
                {{ copy("save") }}
              </button>
              <button
                type="button"
                class="task-button task-primary"
                :disabled="!canPublish"
                @click="publish"
              >
                {{ copy("publish") }}
              </button>
            </div>
          </footer>
        </template>

        <section v-else-if="selected" class="task-card task-results">
          <header>
            <div>
              <ShipmentTaskBatchIdentity :task="selected" />
              <p>{{ copy(selected.mode === "QUERY_ONLY" ? "query" : "import") }}</p>
            </div>
            <RouterLink :to="managementLocation" class="task-button">
              <el-icon><Connection /></el-icon>{{ copy("viewProgress") }}
            </RouterLink>
          </header>
          <dl class="task-metrics">
            <div>
              <dt>{{ copy("executed") }}</dt>
              <dd>{{ selected.processed || 0 }} / {{ selected.total || 0 }}</dd>
            </div>
            <div>
              <dt>{{ copy("success") }}</dt>
              <dd>{{ selected.succeeded || 0 }}</dd>
            </div>
            <div>
              <dt>{{ copy("failed") }}</dt>
              <dd>{{ selected.failed || 0 }}</dd>
            </div>
            <div>
              <dt>{{ copy("awaitingManual") }}</dt>
              <dd>{{ selected.manual || 0 }}</dd>
            </div>
          </dl>
          <progress
            v-if="selected.total"
            :value="selected.processed || 0"
            :max="selected.total"
            :aria-label="t('customers.trackingTaskStatus')"
          />
          <p v-if="selected.nextAttemptAt">
            {{ copy("nextAttempt", { time: formatTime(selected.nextAttemptAt) }) }}
          </p>
          <p v-if="taskRuns.has(selected.status)">{{ copy("returnHint") }}</p>
          <div class="task-result-actions">
            <el-checkbox v-if="selected.items?.length" v-model="problemsOnly" class="task-check" :disabled="Boolean(busy)">
              {{ copy("problemsOnly") }}
            </el-checkbox>
            <button
              v-if="mayCancel"
              class="task-button"
              type="button"
              :disabled="Boolean(busy)"
              @click="cancel"
            >
              {{ copy("cancel") }}
            </button>
            <button
              v-if="mayRetry"
              class="task-button"
              type="button"
              :disabled="Boolean(busy)"
              @click="retry"
            >
              {{ copy("retry") }}
            </button>
            <div class="task-batch-delete">
              <button type="button" class="task-button task-danger" :disabled="Boolean(busy) || !mayDelete" @click="deleteTask">
                <el-icon><Delete /></el-icon>{{ copy("deleteTask") }}
              </button>
              <small v-if="!mayDelete">{{ copy("deleteActiveHint") }}</small>
            </div>
          </div>
          <p v-if="!results.length" class="task-empty">{{ copy("noResult") }}</p>
          <ul v-else class="task-result-list">
            <li v-for="(item, index) in results" :key="item.id || index">
              <div class="task-result-row">
                <div class="task-result-reference">
                  <b>{{ item.displayNumber || item.number || "—" }}</b>
                  <small
                    >{{
                      item.sourceRow ? t("customers.trackImportRow", { row: item.sourceRow }) : ""
                    }}
                    {{ item.type ? typeLabel(item.type) : "" }}</small
                  >
                </div>
                <CarrierBadge v-if="item.carrier" :carrier="item.carrier" />
                <span class="task-pill" :data-tone="statusTone(item.status)">{{
                  statusLabel(item.status)
                }}</span>
                <RouterLink
                  v-if="item.shipmentId"
                  :to="{
                    name: 'business-shipments-detail',
                    params: { shipmentId: item.shipmentId }
                  }"
                  class="task-button"
                >
                  {{ copy("openShipment") }}
                </RouterLink>
              </div>
              <p v-if="item.error || item.mainError" class="task-result-error">
                {{ item.error || item.mainError }}
                <small v-if="item.errorCode">({{ item.errorCode }})</small>
              </p>
              <p v-if="item.nextRetryAt && item.status === 'WAITING'">
                {{ copy("nextAttempt", { time: formatTime(item.nextRetryAt) }) }}
              </p>
              <details v-if="item.payload?.snapshot" class="task-source">
                <summary>{{ t("customers.trackingQueryResult") }}</summary>
                <dl>
                  <template
                    v-for="field in queryResultFields(item.payload.snapshot, t)"
                    :key="field.key"
                  >
                    <dt>{{ field.label }}</dt>
                    <dd>{{ field.value }}</dd>
                  </template>
                </dl>
                <p>{{ t("customers.trackingQueryUnverified") }}</p>
                <details
                  v-for="group in queryResultGroups(item.payload.snapshot, t)"
                  :key="group.key"
                >
                  <summary>{{ group.label }} · {{ group.rows.length }}</summary>
                  <dl v-for="(row, rowIndex) in group.rows" :key="rowIndex">
                    <template v-for="entry in row" :key="entry.key">
                      <dt>{{ entry.key }}</dt>
                      <dd>{{ entry.value }}</dd>
                    </template>
                  </dl>
                </details>
              </details>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </section>
</template>
<style scoped src="./shipmentTaskPublisher.css"></style>
