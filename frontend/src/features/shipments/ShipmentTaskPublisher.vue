<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Download,
  Document,
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
  fetchShipmentBatchTasks,
  inspectBusinessShipmentImportConflicts,
  publishShipmentBatchDraft,
  retryShipmentBatchTask,
  updateShipmentBatchDraft
} from "../../services/businessCustomerApi";
import { parseShipmentBatchWorkbook } from "../../services/shipmentBatchImport.js";
import { ALL_TRACKING_CARRIERS } from "../../services/trackingCarriers.js";
import { queryResultFields, queryResultGroups } from "./shipmentQueryResult.js";
import { recognizeTaskWorkbook, taskRuns } from "./shipmentTaskDraft.js";
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
const confirmAction = (key) => window.confirm(copy(key));
const confirmDiscard = () => confirmAction("discard");
const {
  tasks,
  selected,
  editor,
  dirty,
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
  retry
} = useShipmentTaskPublisher({
  api: {
    list: fetchShipmentBatchTasks,
    get: fetchShipmentBatchTask,
    create: createShipmentBatchDraft,
    update: updateShipmentBatchDraft,
    publish: publishShipmentBatchDraft,
    cancel: cancelShipmentBatchTask,
    retry: retryShipmentBatchTask
  },
  reportError: markApiErrorHandled,
  confirmDiscard,
  confirmPublish: confirmExistingShipments,
  onCompleted: props.onCompleted
});
const fileInput = ref(null);
const sheets = ref([]);
const dragOver = ref(false);
const fileError = ref("");
const problemsOnly = ref(false);
const sheet = computed(() =>
  sheets.value.find(({ name }) => name === editor.value.sourceMeta?.sheetName)
);
const isEditor = computed(
  () => selected.value?.status === "DRAFT" || Boolean(editor.value.rows.length)
);
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
  () => dirty.value || issueCount.value || serverErrors.value.length || !itemCount.value
);
const errorMessage = computed(() => {
  if (fileError.value) return fileError.value;
  if (!error.value) return "";
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
  return t(type === "BOOKING" ? "customers.referenceBooking" : "customers.referenceBill");
}

function statusTone(status) {
  if (["SUCCEEDED", "COMPLETED"].includes(status)) return "success";
  if (["FAILED", "PARTIAL"].includes(status)) return "danger";
  if (["MANUAL", "WAITING", "RETRY_WAIT"].includes(status)) return "warning";
  if (taskRuns.has(status) || status === "PERSISTING") return "active";
  return "neutral";
}

let restoringLocation = false;
function syncTaskLocation(taskId) {
  if (restoringLocation || route.name !== "business-shipment-tasks" || (route.query.taskId || "") === taskId) return;
  const query = { ...route.query };
  if (taskId) query.taskId = taskId;
  else delete query.taskId;
  void router.replace({ path: route.path, query });
}

watch(
  () => selected.value?.taskId,
  (taskId) => syncTaskLocation(taskId || ""),
  { flush: "sync" }
);

function newTask() {
  if (!startNew()) return false;
  sheets.value = [];
  fileError.value = "";
  problemsOnly.value = false;
  return true;
}

async function openTask(id) {
  if (!(await open(id))) return false;
  sheets.value = [];
  fileError.value = "";
  problemsOnly.value = false;
  return true;
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
  await importFile(async () => {
    try {
      const [xlsx, bytes] = await Promise.all([import("xlsx"), file.arrayBuffer()]);
      const workbook = xlsx.read(bytes, { type: "array", cellDates: false, cellNF: true });
      const parsed = parseShipmentBatchWorkbook(workbook, xlsx);
      const best = parsed
        .filter(
          ({ resultSheet, suggestedColumnIndex }) => !resultSheet && suggestedColumnIndex !== null
        )
        .sort(
          (a, b) =>
            b.columns[b.suggestedColumnIndex].score - a.columns[a.suggestedColumnIndex].score
        )[0];
      if (!best) {
        const invalid = parsed[0];
        if (invalid) {
          const problem = recognizeTaskWorkbook(invalid, invalid.suggestedColumnIndex).problems[0];
          if (problem) throw new Error(issueLabel(problem));
        }
        throw new Error(copy("noRows"));
      }
      const { rows, sourceMeta, problems } = recognizeTaskWorkbook(best, best.suggestedColumnIndex);
      if (problems.length || !rows.length)
        throw new Error(problems.length ? issueLabel(problems[0]) : copy("noRows"));
      sheets.value = parsed.filter(
        ({ resultSheet, suggestedColumnIndex }) => !resultSheet && suggestedColumnIndex !== null
      );
      return { sourceFileName: file.name, rows, sourceMeta };
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : copy("fileError"));
    }
  });
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

function changeMapping(event, sheetName, column) {
  const targetSheet = sheets.value.find(({ name }) => name === sheetName);
  if (!targetSheet) return;
  const targetColumn = column ?? targetSheet.suggestedColumnIndex;
  if (
    editor.value.sourceMeta?.sheetName === sheetName &&
    editor.value.sourceMeta.column === targetColumn
  )
    return;
  const previous = event.target.value;
  event.target.value = event.target.dataset.current;
  if (!window.confirm(copy("replaceReview"))) return;
  const { rows, sourceMeta, problems } = recognizeTaskWorkbook(targetSheet, targetColumn);
  if (problems.length || !rows.length) {
    fileError.value = problems.length ? issueLabel(problems[0]) : copy("noRows");
    return;
  }
  fileError.value = "";
  Object.assign(editor.value, { rows, sourceMeta });
  event.target.value = previous;
}

async function confirmExistingShipments(task) {
  if (task.mode !== "IMPORT") return true;
  const response = await inspectBusinessShipmentImportConflicts(
    (task.items || []).map((item) => ({
      carrier: item.carrier,
      referenceType: item.type,
      referenceNo: item.number
    }))
  );
  const conflicts = response?.conflicts || [];
  if (!conflicts.length) return true;
  return window.confirm(
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

onBeforeRouteUpdate(async (to, from) => {
  const taskId = taskIdFromQuery(to.query.taskId);
  if (taskId === taskIdFromQuery(from.query.taskId) || taskId === (selected.value?.taskId || "")) return;
  restoringLocation = true;
  try {
    return taskId ? await openTask(taskId) : newTask();
  } finally {
    restoringLocation = false;
  }
});

onMounted(() => {
  void list();
  const taskId = taskIdFromQuery(route.query.taskId);
  if (taskId) void openTask(taskId);
  window.addEventListener("beforeunload", preventUnload);
});
onScopeDispose(() => window.removeEventListener("beforeunload", preventUnload));
onBeforeRouteLeave(() => !busy.value && (!dirty.value || confirmDiscard()));
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
          :to="{ path: '/workspace/tracking/task-management', query: selected ? { taskId: selected.taskId } : {} }"
          class="task-button"
        >
          {{ t("shipmentTaskManagement.title") }}
        </RouterLink>
        <RouterLink :to="{ name: 'business-shipments' }" class="task-button">
          <el-icon><FolderOpened /></el-icon>{{ copy("openPanel") }}
        </RouterLink>
        <button
          type="button"
          class="task-button task-primary"
          :disabled="Boolean(busy)"
          @click="newTask"
        >
          <el-icon><Plus /></el-icon>{{ copy("new") }}
        </button>
      </template>
    </WorkspacePageHeader>

    <div class="task-layout">
      <aside class="task-history task-card">
        <header>
          <div>
            <h2>{{ copy("history") }}</h2>
            <p>{{ copy("historyHint") }}</p>
          </div>
          <button
            type="button"
            class="task-button task-icon-button"
            :aria-label="copy('refresh')"
            :title="copy('refresh')"
            :disabled="loading || Boolean(busy)"
            @click="list"
          >
            <el-icon><Refresh /></el-icon>
          </button>
        </header>
        <p v-if="loading && !tasks.length" class="task-empty">{{ t("app.loadingPage") }}</p>
        <p v-else-if="!tasks.length" class="task-empty">{{ copy("emptyHistory") }}</p>
        <ul v-else>
          <li v-for="task in tasks" :key="task.taskId">
            <button
              type="button"
              class="task-history-item"
              :class="{ 'is-selected': selected?.taskId === task.taskId }"
              :aria-current="selected?.taskId === task.taskId ? 'true' : undefined"
              :disabled="Boolean(busy)"
              @click="openTask(task.taskId)"
            >
              <span class="task-history-name"
                ><el-icon><Document /></el-icon
                ><b>{{ task.sourceFileName || task.taskId }}</b></span
              >
              <span class="task-history-meta">
                <span class="task-pill" :data-tone="statusTone(task.status)">{{
                  statusLabel(task.status)
                }}</span>
                <small>{{ formatTime(task.createdAt) }}</small>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <div class="task-workbench">
        <p v-if="errorMessage" class="task-alert" role="alert">{{ errorMessage }}</p>
        <p v-if="notice === 'published'" class="task-alert task-notice" role="status">
          {{ copy("publishQueued") }}
        </p>
        <p v-if="pollError" class="task-alert" role="status">{{ copy("pollError") }}</p>

        <section v-if="!selected && !isEditor" class="task-card task-upload">
          <div
            class="task-drop"
            :class="{ 'is-over': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="dropFile"
          >
            <span class="task-upload-icon"
              ><el-icon><UploadFilled /></el-icon
            ></span>
            <h2>{{ copy("upload") }}</h2>
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
            <input
              ref="fileInput"
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              @change="chooseFile"
            />
          </div>
        </section>

        <template v-else-if="isEditor">
          <section class="task-card task-settings">
            <header>
              <div>
                <h2>{{ copy("draft") }}</h2>
                <p>{{ editor.sourceFileName }}</p>
              </div>
              <span class="task-pill" :data-tone="dirty ? 'warning' : 'success'" role="status">
                {{ dirty ? copy("unsaved") : copy("stored") }}
              </span>
            </header>
            <div class="task-settings-grid">
              <label
                ><b>{{ copy("mode") }}</b>
                <select v-model="editor.mode" :disabled="Boolean(busy)">
                  <option value="IMPORT">{{ copy("import") }}</option>
                  <option value="QUERY_ONLY">{{ copy("query") }}</option>
                </select>
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
            <label v-if="editor.mode === 'IMPORT'" class="task-check">
              <input v-model="editor.publishToCustomer" type="checkbox" :disabled="Boolean(busy)" />
              {{ copy("visibility") }}
            </label>
          </section>

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
                <select
                  v-if="sheets.length > 1"
                  :value="editor.sourceMeta.sheetName"
                  :data-current="editor.sourceMeta.sheetName"
                  :disabled="Boolean(busy)"
                  @change="changeMapping($event, $event.target.value, null)"
                >
                  <option v-for="entry in sheets" :key="entry.name" :value="entry.name">
                    {{ entry.name }}
                  </option>
                </select>
                <b v-else>{{ editor.sourceMeta.sheetName }}</b>
              </label>
              <label
                ><span>{{ t("customers.trackColumn") }}</span>
                <select
                  v-if="sheet"
                  :value="editor.sourceMeta.column"
                  :data-current="editor.sourceMeta.column"
                  :disabled="Boolean(busy)"
                  @change="changeMapping($event, sheet.name, Number($event.target.value))"
                >
                  <option
                    v-for="column in sheet.columns.filter(({ score }) => score > 0)"
                    :key="column.index"
                    :value="column.index"
                  >
                    {{ column.label }}
                  </option>
                </select>
                <b v-else>{{ editor.sourceMeta.columnLabel }}</b>
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
                      <select
                        v-model="row.carrier"
                        :aria-label="t('customers.carrier') + ' ' + row.sourceRow"
                        :disabled="Boolean(busy) || row.disposition === 'EXCLUDE'"
                      >
                        <option value="">{{ copy("chooseCarrier") }}</option>
                        <option
                          v-if="
                            row.carrier &&
                            !ALL_TRACKING_CARRIERS.some(({ code }) => code === row.carrier)
                          "
                          :value="row.carrier"
                        >
                          {{ row.carrier }}
                        </option>
                        <option
                          v-for="carrier in ALL_TRACKING_CARRIERS"
                          :key="carrier.code"
                          :value="carrier.code"
                        >
                          {{ carrier.name }}
                        </option>
                      </select>
                      <small v-if="row.originalCarrier" :title="row.originalCarrier"
                        >{{
                          t(`customers.trackingQueryEvidence${row.carrierEvidence || "unknown"}`)
                        }}
                        · {{ row.originalCarrier }}</small
                      >
                    </td>
                    <td>
                      <select
                        v-model="row.type"
                        :aria-label="t('customers.referenceType') + ' ' + row.sourceRow"
                        :disabled="Boolean(busy) || row.disposition === 'EXCLUDE'"
                      >
                        <option value="">{{ copy("chooseType") }}</option>
                        <option value="BOOKING">{{ typeLabel("BOOKING") }}</option>
                        <option value="BILLOFLADING">{{ typeLabel("BILLOFLADING") }}</option>
                      </select>
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
                      <select
                        v-model="row.disposition"
                        :aria-label="copy('disposition') + ' ' + row.sourceRow"
                        :disabled="Boolean(busy)"
                      >
                        <option value="QUERY">{{ copy("include") }}</option>
                        <option
                          v-if="editor.mode === 'IMPORT' || row.disposition === 'MANUAL'"
                          value="MANUAL"
                        >
                          {{ copy("manual") }}
                        </option>
                        <option value="EXCLUDE">{{ copy("exclude") }}</option>
                      </select>
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
            <label class="task-check">
              <input
                v-model="reviewed"
                type="checkbox"
                :disabled="Boolean(busy || blockedReview)"
              />
              {{ copy("review") }}
            </label>
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
                @click="save"
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
              <h2>{{ selected.sourceFileName || t("customers.trackingTaskStatus") }}</h2>
              <p>
                {{ copy(selected.mode === "QUERY_ONLY" ? "query" : "import") }} ·
                {{ formatTime(selected.publishedAt || selected.createdAt) }}
              </p>
            </div>
            <span class="task-pill" :data-tone="statusTone(selected.status)" role="status">{{
              statusLabel(selected.status)
            }}</span>
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
            <label v-if="selected.items?.length" class="task-check">
              <input v-model="problemsOnly" type="checkbox" />{{ copy("problemsOnly") }}
            </label>
            <button
              v-if="mayCancel"
              class="task-button"
              type="button"
              :disabled="Boolean(busy)"
              @click="confirmAction('cancelConfirm') && cancel()"
            >
              {{ copy("cancel") }}
            </button>
            <button
              v-if="mayRetry"
              class="task-button"
              type="button"
              :disabled="Boolean(busy)"
              @click="confirmAction('retryConfirm') && retry()"
            >
              {{ copy("retry") }}
            </button>
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
