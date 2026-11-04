<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Aim, ArrowLeft, FullScreen, Minus, Plus, Refresh } from "@element-plus/icons-vue";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import { markApiErrorHandled } from "../../services/apiClient.js";
import {
  cancelShipmentBatchTask, fetchShipmentBatchTask, fetchShipmentBatchTaskSummaries, retryShipmentBatchTask
} from "../../services/businessCustomerApi.js";
import { ALL_TRACKING_CARRIERS } from "../../services/trackingCarriers.js";
import { queryResultFields, queryResultGroups } from "./shipmentQueryResult.js";
import {
  groupTaskStates, isTaskActive, shouldLoadTaskDetail, stateOf, taskIdFromQuery, taskStateColors,
  taskStatusTone, toShipmentTaskNetwork
} from "./shipmentTaskNetworkModel.js";
import { TaskNetwork } from "./taskNetwork.js";
import "./shipmentTaskManagement.css";

const route = useRoute();
const router = useRouter();
const { t, te, locale } = useI18n();
const copy = (key, params = {}) => t(`shipmentTaskManagement.${key}`, params);
const taskCopy = (key) => t(`shipmentTask.${key}`);
const statusLabel = (status) => {
  if (status === "EXCLUDED") return copy("state.excluded");
  if (!status || status === "UNKNOWN") return copy("state.unknown");
  return te(`shipmentTask.status.${status}`) ? taskCopy(`status.${status}`) : status;
};
const carriers = new Map(ALL_TRACKING_CARRIERS.map(({ code, name }) => [code, name]));
const carrierLabel = (code) => !code || code === "UNKNOWN" ? copy("unknownCarrier") : carriers.get(code) || code;

const layoutNames = ["neural", "forest", "tree", "status"];
const layout = ref("neural");
const filter = ref("all");
const search = ref("");
const canvas = ref(null);
const summaries = shallowRef([]);
const detail = shallowRef(null);
const selection = ref({ kind: "batch", key: "batch" });
const selectedId = computed(() => taskIdFromQuery(route.query.taskId));
const selectedSummary = computed(() => summaries.value.find(({ taskId }) => taskId === selectedId.value));
const task = computed(() => detail.value?.taskId === selectedId.value ? detail.value : null);
const batch = computed(() => task.value || selectedSummary.value);
const job = computed(() => toShipmentTaskNetwork(task.value));
const activeRow = computed(() => job.value?.items.some(({ status }) => ["RUNNING", "PERSISTING"].includes(status)));
const selectedEntry = computed(() => selection.value.kind === "task" ? job.value?.items[selection.value.index] : null);
const selectedItem = computed(() => selectedEntry.value?.item);
const selectedCarrier = computed(() => selection.value.kind === "carrier" ? selection.value.carrier : null);
const groupedRows = computed(() => {
  const entries = job.value?.items || [];
  return selectedCarrier.value
    ? entries.filter(({ carrier }) => (carrier || "UNKNOWN") === selectedCarrier.value)
    : entries;
});
const counts = computed(() => groupTaskStates(groupedRows.value));
const resultCount = computed(() => job.value?.items.filter(({ resultReady }) => resultReady).length || 0);
const availableFilters = computed(() => [
  ...new Set((job.value?.items || []).map(({ status }) => stateOf(status)))
]);
const visibleRows = computed(() => {
  const query = search.value.trim().toLowerCase();
  return (job.value?.items || []).flatMap((entry, index) => {
    const { item, reference, originalReference, carrier, status } = entry;
    return (filter.value === "all" || stateOf(status) === filter.value)
      && (!query || [reference, carrier, carrierLabel(carrier), item.sourceRow, originalReference].join(" ").toLowerCase().includes(query))
      ? [{ index, key: `task:${index}`, label: reference || copy("noReference"), carrier, sourceRow: item.sourceRow }]
      : [];
  });
});
const snapshot = computed(() => selectedItem.value?.payload?.snapshot || null);
const snapshotFields = computed(() => snapshot.value ? queryResultFields(snapshot.value, t) : []);
const snapshotGroups = computed(() => snapshot.value ? queryResultGroups(snapshot.value, t) : []);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const actionError = ref("");
const mayCancel = computed(() => isTaskActive(task.value?.status) && task.value?.status !== "STOPPING");
const mayRetry = computed(() => task.value?.status === "COMPLETED" && task.value?.items.some(({ status }) => status === "FAILED"));
const listLocation = computed(() => ({
  path: "/workspace/tracking/tasks",
  query: selectedId.value ? { taskId: selectedId.value } : {}
}));
let network;
let disposed = false;
let mounted = false;
let pollTimer;
let currentRead;
let observedTimestamp;

function formatTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: "short", timeStyle: "short" }).format(date)
    : "";
}

function selectBatch(value) {
  if (selectedId.value === value || busy.value) return;
  const query = { ...route.query };
  if (value) query.taskId = value;
  else delete query.taskId;
  void router.replace({ path: route.path, query });
}

function stopReads() {
  window.clearTimeout(pollTimer);
  currentRead?.abort();
  currentRead = undefined;
}

function schedule() {
  window.clearTimeout(pollTimer);
  if (disposed || document.hidden || busy.value) return;
  pollTimer = window.setTimeout(() => refresh(), isTaskActive(batch.value?.status) ? 3500 : 12000);
}

async function refresh({ force = false, list = true } = {}) {
  if (disposed || document.hidden || busy.value) return;
  stopReads();
  const request = new AbortController();
  currentRead = request;
  const id = selectedId.value;
  const current = () => !disposed && !request.signal.aborted && selectedId.value === id;
  const options = { signal: request.signal };
  if (!task.value && !summaries.value.length) loading.value = true;
  let listSucceeded = false;
  try {
    if (list) {
      try {
        const next = await fetchShipmentBatchTaskSummaries(options);
        if (!current()) return;
        summaries.value = Array.isArray(next) ? next : [];
        listSucceeded = true;
      } catch (cause) {
        markApiErrorHandled(cause);
        if (!current()) return;
        error.value = summaries.value.length ? "pollFailed" : "loadFailed";
        // An individual deep link can still resolve when the summary request fails.
        if (!id) return;
      }
      if (!id) {
        if (summaries.value.length) selectBatch(summaries.value[0].taskId);
        if (listSucceeded) error.value = "";
        return;
      }
    }

    const summary = selectedSummary.value;
    if (id && shouldLoadTaskDetail(task.value, summary, observedTimestamp, force)) {
      const fresh = await fetchShipmentBatchTask(id, options);
      if (!current()) return;
      detail.value = fresh;
      observedTimestamp = summary?.updatedAt;
      error.value = !list || listSucceeded ? "" : "pollFailed";
    } else if (listSucceeded) {
      error.value = "";
    }
  } catch (cause) {
    markApiErrorHandled(cause);
    if (current()) error.value = task.value ? "pollFailed" : "loadFailed";
  } finally {
    if (currentRead === request) {
      currentRead = undefined;
      loading.value = false;
      schedule();
    }
  }
}

async function changeTask(action) {
  const id = selectedId.value;
  const allowed = action === "cancel" ? mayCancel.value : mayRetry.value;
  if (!id || !allowed || busy.value || !window.confirm(taskCopy(`${action}Confirm`))) return;
  busy.value = true;
  actionError.value = "";
  stopReads();
  try {
    const response = await (action === "cancel" ? cancelShipmentBatchTask(id) : retryShipmentBatchTask(id));
    if (!disposed && selectedId.value === id) {
      detail.value = response;
      summaries.value = summaries.value.map((entry) => entry.taskId === id
        ? { ...entry, status: response.status, updatedAt: response.updatedAt }
        : entry);
    }
  } catch (cause) {
    markApiErrorHandled(cause);
    if (!disposed && selectedId.value === id) actionError.value = "actionFailed";
  } finally {
    busy.value = false;
    if (!disposed) void refresh();
  }
}

function selectEntry(event) {
  const key = event.target.value;
  if (key) network?.focus(key);
}

function renderGraph() {
  if (!network) return;
  network.update(job.value, {
    layout: layout.value, filter: filter.value, search: search.value,
    selectedKey: selection.value.key, locale: locale.value
  });
}

function setLayout(value) {
  if (selection.value.kind === "output" && value !== "neural") selection.value = { kind: "batch", key: "batch" };
  layout.value = value;
}

function visibilityChanged() {
  if (document.hidden) {
    stopReads();
    network?.container.classList.add("net-paused");
  } else {
    network?.container.classList.remove("net-paused");
    void refresh();
  }
}

watch(selectedId, () => {
  observedTimestamp = undefined;
  if (!mounted || route.name !== "business-shipment-task-management") return;
  detail.value = null;
  selection.value = { kind: "batch", key: "batch" };
  filter.value = "all";
  search.value = "";
  error.value = "";
  actionError.value = "";
  void refresh({ list: false });
});
watch(availableFilters, (values) => {
  if (filter.value !== "all" && !values.includes(filter.value)) filter.value = "all";
});
watch([job, layout, filter, search, locale], renderGraph, { flush: "post" });

onMounted(async () => {
  mounted = true;
  await nextTick();
  if (disposed) return;
  network = new TaskNetwork(canvas.value, { copy, carrierLabel, statusLabel, onSelect: (node) => { selection.value = node; } });
  renderGraph();
  document.addEventListener("visibilitychange", visibilityChanged);
  void refresh();
});

onBeforeUnmount(() => {
  disposed = true;
  stopReads();
  document.removeEventListener("visibilitychange", visibilityChanged);
  network?.destroy();
});
</script>

<template>
  <section class="shipment-task-management">
    <WorkspacePageHeader :eyebrow="copy('eyebrow')" :title="copy('title')" :description="copy('description')">
      <template #actions>
        <RouterLink :to="listLocation" class="stm-button">
          <el-icon><ArrowLeft /></el-icon>{{ copy("taskList") }}
        </RouterLink>
        <button class="stm-button" type="button" :disabled="busy" @click="refresh({ force: true })">
          <el-icon><Refresh /></el-icon>{{ copy("refresh") }}
        </button>
      </template>
    </WorkspacePageHeader>

    <div class="stm-batch">
      <label class="stm-batch-picker">
        <span>{{ copy("chooseBatch") }}</span>
        <select :value="selectedId" :disabled="busy || (!summaries.length && !selectedId)" @change="selectBatch($event.target.value)">
          <option value="">{{ summaries.length ? copy("chooseBatch") : copy("noBatches") }}</option>
          <option v-if="selectedId && !selectedSummary" :value="selectedId">
            {{ task?.sourceFileName || selectedId }}
          </option>
          <option v-for="summary in summaries" :key="summary.taskId" :value="summary.taskId">
            {{ summary.sourceFileName || summary.taskId }} · {{ statusLabel(summary.status) }} · {{ formatTime(summary.createdAt) }}
          </option>
        </select>
      </label>
      <div v-if="batch" class="stm-batch-progress" :aria-label="copy('batchStatus')">
        <span class="stm-pill" :style="{ '--stm-state': taskStateColors[taskStatusTone(batch)] }">
          {{ statusLabel(batch.status) }}
        </span>
        <span v-if="batch.status !== 'DRAFT'">{{ copy("rowsProcessed", { processed: batch.processed, total: batch.total }) }}</span>
        <span v-else>{{ copy("rowCount", { count: job?.items.length ?? batch.total }) }}</span>
      </div>
      <div v-if="task" class="stm-batch-actions">
        <button v-if="mayCancel" type="button" class="stm-button" :disabled="busy" @click="changeTask('cancel')">
          {{ taskCopy("cancel") }}
        </button>
        <button v-if="mayRetry" type="button" class="stm-button" :disabled="busy" @click="changeTask('retry')">
          {{ taskCopy("retry") }}
        </button>
        <RouterLink v-if="task.status === 'DRAFT'" class="stm-button stm-primary" :to="listLocation">
          {{ copy("openDraft") }}
        </RouterLink>
      </div>
    </div>

    <p v-if="error || actionError" class="stm-alert" role="alert">{{ copy(actionError || error) }}</p>
    <p v-else-if="batch?.status === 'DRAFT'" class="stm-draft">{{ copy("draftBanner") }}</p>

    <div class="stm-workspace">
      <section class="stm-map" :aria-label="copy('graphTitle')">
        <header class="stm-map-header">
          <div>
            <h2>{{ copy("graphTitle") }}</h2>
            <p>{{ copy("graphHint") }}</p>
          </div>
          <div class="stm-layouts" role="group" :aria-label="copy('layout')">
            <button v-for="mode in layoutNames" :key="mode" type="button"
              :aria-pressed="layout === mode" @click="setLayout(mode)">{{ copy(`layouts.${mode}`) }}</button>
          </div>
        </header>
        <div class="stm-search-bar">
          <input v-model="search" type="search" :disabled="!job?.items.length" :aria-label="copy('searchLabel')" :placeholder="copy('search')" />
          <select v-model="filter" :aria-label="copy('filter')" :disabled="!job?.items.length">
            <option value="all">{{ copy("all") }}</option>
            <option v-for="value in availableFilters" :key="value" :value="value">{{ copy(`state.${value}`) }}</option>
          </select>
          <select :value="selection.kind === 'task' && visibleRows.some(({ key }) => key === selection.key) ? selection.key : ''"
            :disabled="!visibleRows.length" :aria-label="copy('jump')" @change="selectEntry">
            <option value="">{{ copy("jump") }}</option>
            <option v-for="entry in visibleRows" :key="entry.key" :value="entry.key">
              {{ entry.label }} · {{ carrierLabel(entry.carrier) }}{{ entry.sourceRow ? ` · ${copy('sourceRow')} ${entry.sourceRow}` : "" }}
            </option>
          </select>
        </div>
        <div class="stm-canvas-wrap">
          <div ref="canvas" class="stm-canvas"></div>
          <p v-if="loading && !job" class="stm-loading" role="status">{{ t("app.loadingPage") }}</p>
          <div v-if="job?.items.length && !visibleRows.length" class="stm-no-matches">
            {{ copy("noMatches") }}
            <button type="button" @click="search = ''; filter = 'all'">{{ copy("clearFilters") }}</button>
          </div>
          <div v-if="job?.items.length" class="stm-zoom" role="group" :aria-label="copy('graphTitle')">
            <button type="button" :aria-label="copy('zoomOut')" :title="copy('zoomOut')" @click="network?.zoomBy(0.8)"><el-icon><Minus /></el-icon></button>
            <button type="button" :aria-label="copy('zoomIn')" :title="copy('zoomIn')" @click="network?.zoomBy(1.25)"><el-icon><Plus /></el-icon></button>
            <button type="button" :aria-label="copy('fit')" :title="copy('fit')" @click="network?.fit()"><el-icon><FullScreen /></el-icon></button>
            <button type="button" :aria-label="copy('locate')" :title="copy('locate')" @click="network?.focus(selection.key)"><el-icon><Aim /></el-icon></button>
            <button v-if="activeRow" type="button" @click="network?.focusRunning()">{{ copy("focusRunning") }}</button>
          </div>
        </div>
        <div class="stm-legend" v-if="job?.items.length">
          <button v-for="value in availableFilters" :key="value" type="button"
            :style="{ '--stm-state': taskStateColors[value] }" :aria-pressed="filter === value"
            @click="filter = filter === value ? 'all' : value">{{ copy(`state.${value}`) }}</button>
        </div>
      </section>

      <aside class="stm-details" :aria-label="copy('nodeDetails')">
        <header>
          <p>{{ copy("nodeDetails") }}</p>
          <h2 v-if="selectedEntry">{{ selectedEntry.reference || copy("noReference") }}</h2>
          <h2 v-else-if="selectedCarrier">{{ carrierLabel(selectedCarrier) }}</h2>
          <h2 v-else-if="selection.kind === 'output'">{{ copy("outputNode") }}</h2>
          <h2 v-else>{{ copy("batchDetails") }}</h2>
        </header>

        <template v-if="selectedEntry && selectedItem">
          <span class="stm-pill" :style="{ '--stm-state': taskStateColors[stateOf(selectedEntry.status)] }">
            {{ statusLabel(selectedEntry.status) }}
          </span>
          <dl>
            <dt>{{ copy("carrier") }}</dt><dd>{{ carrierLabel(selectedEntry.carrier) }}</dd>
            <template v-if="selectedItem.type">
              <dt>{{ copy("referenceType") }}</dt><dd>{{ t(selectedItem.type === "BOOKING" ? "customers.referenceBooking" : "customers.referenceBill") }}</dd>
            </template>
            <template v-if="selectedItem.sourceRow">
              <dt>{{ copy("sourceRow") }}</dt><dd>{{ selectedItem.sourceRow }}</dd>
            </template>
            <template v-if="selectedEntry.originalReference">
              <dt>{{ copy("sourceReference") }}</dt><dd>{{ selectedEntry.originalReference }}</dd>
            </template>
            <template v-if="selectedItem.localJobId">
              <dt>{{ copy("localJob") }}</dt><dd><code>{{ selectedItem.localJobId }}</code></dd>
            </template>
            <template v-if="selectedItem.attempts">
              <dt>{{ copy("attempts") }}</dt><dd>{{ selectedItem.attempts }}</dd>
            </template>
            <template v-if="selectedItem.nextRetryAt && ['WAITING','RETRY_WAIT'].includes(selectedEntry.status)">
              <dt>{{ copy("nextRetry") }}</dt><dd>{{ formatTime(selectedItem.nextRetryAt) }}</dd>
            </template>
            <template v-if="selectedItem.updatedAt">
              <dt>{{ copy("updated") }}</dt><dd>{{ formatTime(selectedItem.updatedAt) }}</dd>
            </template>
          </dl>
          <p v-if="selectedItem.error || selectedItem.errorCode" class="stm-alert">
            {{ selectedItem.error || selectedItem.errorCode }}
          </p>
          <p v-if="selectedItem.recognitionErrorCode && batch?.status === 'DRAFT'" class="stm-alert">
            {{ te(`shipmentTask.issue${selectedItem.recognitionErrorCode}`) ? taskCopy(`issue${selectedItem.recognitionErrorCode}`) : selectedItem.recognitionErrorCode }}
          </p>
          <RouterLink v-if="selectedItem.shipmentId" class="stm-button stm-primary"
            :to="{ name: 'business-shipments-detail', params: { shipmentId: selectedItem.shipmentId } }">
            {{ taskCopy("openShipment") }}
          </RouterLink>
          <div v-if="snapshot" class="stm-snapshot">
            <h3>{{ copy("snapshot") }}</h3>
            <dl v-if="snapshotFields.length">
              <template v-for="field in snapshotFields" :key="field.key">
                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
              </template>
            </dl>
            <p v-if="batch?.mode === 'QUERY_ONLY'">{{ t("customers.trackingQueryUnverified") }}</p>
            <details v-for="group in snapshotGroups" :key="group.key">
              <summary>{{ group.label }} · {{ group.rows.length }}</summary>
              <dl v-for="(row, index) in group.rows" :key="index">
                <template v-for="entry in row" :key="entry.key">
                  <dt>{{ entry.key }}</dt><dd>{{ entry.value }}</dd>
                </template>
              </dl>
            </details>
          </div>
          <p v-else-if="batch?.status !== 'DRAFT'">{{ copy(selectedItem.shipmentId ? "savedResult" : "noResult") }}</p>
        </template>

        <template v-else-if="batch">
          <dl v-if="selection.kind === 'batch'">
            <template v-if="batch.sourceFileName"><dt>{{ copy("sourceFile") }}</dt><dd>{{ batch.sourceFileName }}</dd></template>
            <dt>{{ copy("taskId") }}</dt><dd><code>{{ batch.taskId }}</code></dd>
            <dt>{{ copy("status") }}</dt><dd>{{ statusLabel(batch.status) }}</dd>
            <dt>{{ copy("resultMode") }}</dt><dd>{{ copy(batch.mode === "IMPORT" ? "saveShipments" : "queryOnly") }}</dd>
            <template v-if="batch.createdAt"><dt>{{ copy("created") }}</dt><dd>{{ formatTime(batch.createdAt) }}</dd></template>
            <template v-if="batch.publishedAt"><dt>{{ copy("published") }}</dt><dd>{{ formatTime(batch.publishedAt) }}</dd></template>
            <template v-if="batch.updatedAt"><dt>{{ copy("updated") }}</dt><dd>{{ formatTime(batch.updatedAt) }}</dd></template>
          </dl>
          <p v-if="selection.kind === 'output'">{{ job?.draft ? copy("draftCaption") : copy("outputCount", { count: resultCount }) }}</p>
          <ul v-if="counts.length && selection.kind !== 'output'" class="stm-counts">
            <li v-for="{ status, count } in counts" :key="status">
              <span class="stm-pill" :style="{ '--stm-state': taskStateColors[stateOf(status)] }">{{ statusLabel(status) }}</span>
              <strong>{{ count }}</strong>
            </li>
          </ul>
          <p v-if="selection.kind !== 'output'">{{ copy("chooseNode") }}</p>
          <RouterLink v-if="selection.kind === 'batch' && batch.status !== 'DRAFT'" class="stm-button" :to="listLocation">
            {{ copy("openTask") }}
          </RouterLink>
        </template>
        <p v-else>{{ copy("chooseNode") }}</p>
      </aside>
    </div>
  </section>
</template>
