<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Link, Refresh } from "@element-plus/icons-vue";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceEmptyState from "../../components/workspace/WorkspaceEmptyState.vue";
import WorkspaceStatus from "../../components/workspace/WorkspaceStatus.vue";
import CommercialSummary from "../shared/CommercialSummary.vue";
import { commercialText } from "../../i18n/commercialWorkspaceMessages";
import { useCustomerModuleApi } from "./customerContext.js";
import {
  compactShipmentDate,
  compactShipmentId
} from "../../features/shipments/compactShipmentPresentation.js";

type Shipment = {
  shipmentId: string;
  referenceNo?: string;
  carrier?: string;
  trackingStatus?: string;
  updatedAt?: string;
  assignedAt?: string;
  forwarderJobNumber?: string;
  clientPoNumber?: string;
};

const pageSize = 20;
const api = useCustomerModuleApi();
const { t } = useI18n();
const rows = ref<Shipment[]>([]);
const total = ref(0);
const allTotal = ref(0);
const unfinishedTotal = ref(0);
const page = ref(1);
const busy = ref(false);
const loaded = ref(false);
const error = ref("");
const unfinishedOnly = ref(false);
const etaSort = ref("");
let currentRead: AbortController | undefined;
const hasNext = computed(() => page.value * pageSize < total.value);
const resultRange = computed(() => {
  const offset = (page.value - 1) * pageSize;
  return { first: offset + 1, last: offset + rows.value.length, total: total.value };
});
const metrics = computed(() => [
  { label: commercialText("shipmentTotal"), value: allTotal.value },
  { label: commercialText("unfinishedTotal"), value: unfinishedTotal.value }
]);

async function refresh(next = page.value) {
  currentRead?.abort();
  const operation = new AbortController();
  currentRead = operation;
  const params = new URLSearchParams({ page: String(next), pageSize: String(pageSize) });
  if (unfinishedOnly.value) params.set("unfinishedOnly", "true");
  if (etaSort.value) params.set("etaSort", etaSort.value);
  busy.value = true;
  error.value = "";
  try {
    const response = await api.request("/customer/shipments?" + params.toString(), {
      signal: operation.signal
    });
    if (currentRead !== operation || operation.signal.aborted) return;
    if (!Array.isArray(response?.items)) throw Error(t("customerSurface.invalidResponse"));
    rows.value = response.items;
    total.value = Number(response.total) || 0;
    allTotal.value = Number(response.allTotal ?? response.total) || 0;
    unfinishedTotal.value = Number(response.unfinishedTotal) || 0;
    page.value = Number(response.page) || next;
    loaded.value = true;
  } catch (failure) {
    if (currentRead === operation && !operation.signal.aborted)
      error.value = failure instanceof Error ? failure.message : String(failure);
  } finally {
    if (currentRead === operation && !operation.signal.aborted) busy.value = false;
  }
}

function setUnfinished(next: boolean) {
  if (next === unfinishedOnly.value) return;
  unfinishedOnly.value = next;
  void refresh(1);
}

onMounted(() => void refresh());
onScopeDispose(() => currentRead?.abort());
</script>

<template>
  <section class="customer-assigned-page" :aria-busy="busy">
    <WorkspacePageHeader
      :title="t('customerSurface.shipments')"
      :eyebrow="commercialText('customerShipmentsKicker')"
      :description="t('customerSurface.intro')"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="busy" @click="refresh()">{{
          t("customerSurface.refresh")
        }}</el-button>
        <a class="customer-tracking-link" href="/tracking/">
          <span aria-hidden="true"
            ><el-icon><Link /></el-icon
          ></span>
          {{ t("customerSurface.tracking") }}
        </a>
      </template>
    </WorkspacePageHeader>

    <CommercialSummary v-if="loaded" :metrics="metrics" />

    <div class="customer-shipment-toolbar">
      <div class="shipment-scope">
        <button type="button" :aria-pressed="!unfinishedOnly" @click="setUnfinished(false)">
          {{ commercialText("shipmentAll") }}
        </button>
        <button type="button" :aria-pressed="unfinishedOnly" @click="setUnfinished(true)">
          {{ commercialText("shipmentUnfinished") }}
        </button>
      </div>
      <label class="shipment-sort">
        <span>{{ commercialText("shipmentSort") }}</span>
        <el-select
          v-model="etaSort"
          :aria-label="commercialText('shipmentSort')"
          @change="refresh(1)"
        >
          <el-option value="" :label="commercialText('shipmentSortAssigned')" />
          <el-option value="asc" :label="commercialText('shipmentSortEtaAsc')" />
          <el-option value="desc" :label="commercialText('shipmentSortEtaDesc')" />
        </el-select>
      </label>
    </div>

    <div v-if="error" class="customer-shipment-error commercial-state">
      <el-alert
        :title="commercialText('shipmentLoadError')"
        :description="error"
        type="error"
        :closable="false"
        show-icon
        role="alert"
      />
      <el-button @click="refresh(1)">{{ commercialText("retry") }}</el-button>
    </div>

    <div v-else class="customer-shipment-results" v-loading="busy">
      <WorkspaceEmptyState
        v-if="loaded && !busy && !rows.length"
        class="commercial-state"
        :title="unfinishedOnly ? commercialText('shipmentEmptyFilter') : t('customerSurface.empty')"
        :description="
          commercialText(unfinishedOnly ? 'shipmentEmptyFilterHint' : 'shipmentEmptyHint')
        "
      >
        <template v-if="unfinishedOnly" #actions>
          <el-button @click="setUnfinished(false)">{{ commercialText("shipmentAll") }}</el-button>
        </template>
      </WorkspaceEmptyState>
      <div
        v-else-if="rows.length"
        class="table-scroll commercial-reveal"
        tabindex="0"
        role="region"
        :aria-label="t('customerSurface.shipments')"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t("customerSurface.reference") }}</th>
              <th scope="col">{{ t("customerSurface.status") }}</th>
              <th scope="col">{{ t("customerSurface.carrier") }}</th>
              <th scope="col">{{ commercialText("jobNumber") }}</th>
              <th scope="col">{{ commercialText("poNumber") }}</th>
              <th scope="col">{{ t("customerSurface.updated") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.shipmentId">
              <td>
                <strong>{{ row.referenceNo || "—" }}</strong>
                <small :title="row.shipmentId">
                  {{ t("customerSurface.shipmentId") }} {{ compactShipmentId(row.shipmentId) }}
                </small>
                <small v-if="row.assignedAt">
                  {{ commercialText("shipmentAssignedAt") }}
                  <time :datetime="row.assignedAt">{{ compactShipmentDate(row.assignedAt) }}</time>
                </small>
              </td>
              <td>
                <WorkspaceStatus
                  :label="row.trackingStatus || commercialText('shipmentNoStatus')"
                />
              </td>
              <td>{{ row.carrier || "—" }}</td>
              <td>{{ row.forwarderJobNumber || "—" }}</td>
              <td>{{ row.clientPoNumber || "—" }}</td>
              <td>
                <time :datetime="row.updatedAt || undefined" :title="row.updatedAt || '—'">
                  {{ compactShipmentDate(row.updatedAt) }}
                </time>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer v-if="rows.length">
        <span aria-live="polite">{{ commercialText("shipmentResults", resultRange) }}</span>
        <div>
          <el-button :disabled="busy || page <= 1" @click="refresh(page - 1)">
            {{ t("customerSurface.previous") }}
          </el-button>
          <el-button :disabled="busy || !hasNext" @click="refresh(page + 1)">
            {{ t("customerSurface.next") }}
          </el-button>
        </div>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.customer-assigned-page {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
.customer-tracking-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-on-primary);
  text-decoration: none;
  font-size: 14px;
}
.customer-tracking-link:hover,
.customer-tracking-link:focus-visible {
  text-decoration: underline;
}
.customer-shipment-toolbar,
.shipment-sort,
.shipment-scope,
footer,
footer > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.customer-shipment-toolbar {
  justify-content: space-between;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-subtle);
}
.shipment-sort {
  color: var(--color-muted);
  font-size: 13px;
}
.shipment-sort .el-select {
  width: 192px;
  max-width: 100%;
}
.shipment-scope button {
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-foreground);
  background: var(--color-surface);
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}
.shipment-scope button[aria-pressed="true"] {
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}
footer .el-button {
  margin: 0;
}
.customer-shipment-results {
  min-height: 160px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.customer-shipment-error {
  display: grid;
  justify-items: start;
  gap: 10px;
}
.table-scroll {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  text-align: start;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
th {
  background: var(--color-surface-subtle);
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 600;
}
td {
  height: 52px;
  font-size: 14px;
}
td strong,
td small {
  display: block;
}
td small {
  margin-top: 3px;
  color: var(--color-muted);
  font-size: 12px;
}
td :deep(.workspace-status) {
  max-width: min(220px, 40vw);
  white-space: normal;
}
tbody tr:hover {
  background: var(--color-surface-subtle);
}
footer {
  justify-content: space-between;
  padding: 12px;
  font-size: 13px;
  color: var(--color-muted);
}
@media (prefers-reduced-motion: reduce) {
  .shipment-scope button {
    transition: none;
  }
}
@media (max-width: 680px) {
  .customer-assigned-page {
    padding: 16px;
  }
  .shipment-sort,
  .shipment-sort .el-select {
    width: 100%;
  }
}
</style>
<style scoped src="../shared/commercialWorkspaceMotion.css"></style>
