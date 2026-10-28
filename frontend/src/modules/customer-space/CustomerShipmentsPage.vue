<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from "vue";
import { useI18n } from "vue-i18n";
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import WorkspaceEmptyState from "../../components/workspace/WorkspaceEmptyState.vue";
import { wt } from "../../components/workspace/workspaceCopy";
import { useCustomerModuleApi } from "./customerContext.js";
import {
  compactShipmentDate,
  compactShipmentId
} from "../../features/shipments/compactShipmentPresentation.js";
const api = useCustomerModuleApi();
const { t } = useI18n();
type Shipment = {
  shipmentId: string;
  referenceNo?: string;
  carrier?: string;
  trackingStatus?: string;
  updatedAt?: string;
};
const rows = ref<Shipment[]>([]),
  total = ref(0),
  page = ref(1),
  busy = ref(false),
  error = ref("");
let disposed = false,
  version = 0;
let currentRead: AbortController | undefined;
const hasNext = computed(() => page.value * 20 < total.value);
async function refresh(next = page.value) {
  if (disposed) return;
  currentRead?.abort();
  currentRead = new AbortController();
  const current = ++version;
  busy.value = true;
  error.value = "";
  try {
    const response = await api.request(`/customer/shipments?page=${next}&pageSize=20`, {
      signal: currentRead.signal
    });
    if (disposed || current !== version) return;
    rows.value = Array.isArray(response?.items) ? response.items : [];
    total.value = Number(response?.total) || 0;
    page.value = next;
  } catch (failure) {
    if (!disposed && current === version)
      error.value = failure instanceof Error ? failure.message : String(failure);
  } finally {
    if (!disposed && current === version) busy.value = false;
  }
}
onMounted(() => void refresh());
onScopeDispose(() => {
  disposed = true;
  currentRead?.abort();
  ++version;
});
</script>
<template>
  <section class="customer-assigned-page" :aria-busy="busy">
    <WorkspacePageHeader
      :title="t('customerSurface.shipments')"
      :description="wt('customerSpaceHint')"
      ><template #actions
        ><a class="customer-tracking-link" href="/tracking/">{{ t("customerSurface.tracking") }}</a
        ><el-button :loading="busy" @click="refresh()">{{
          t("customerSurface.refresh")
        }}</el-button></template
      ><template #meta
        ><span>{{ t("customerSurface.summary", { page, total }) }}</span></template
      ></WorkspacePageHeader
    >
    <Transition name="workspace-state"
      ><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert"
    /></Transition>
    <div class="table-scroll" v-loading="busy">
      <table>
        <thead>
          <tr>
            <th>{{ t("customerSurface.shipmentId") }}</th>
            <th>{{ t("customerSurface.reference") }}</th>
            <th>{{ t("customerSurface.carrier") }}</th>
            <th>{{ t("customerSurface.status") }}</th>
            <th>{{ t("customerSurface.updated") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.shipmentId">
            <td>
              <span class="customer-compact-id" :title="row.shipmentId">{{
                compactShipmentId(row.shipmentId)
              }}</span>
            </td>
            <td>
              <span class="customer-compact-reference" :title="row.referenceNo || '—'">{{
                row.referenceNo || "—"
              }}</span>
            </td>
            <td>{{ row.carrier || "—" }}</td>
            <td>
              <span class="customer-compact-status" :title="row.trackingStatus || '—'">{{
                row.trackingStatus || "—"
              }}</span>
            </td>
            <td>
              <time :datetime="row.updatedAt || undefined" :title="row.updatedAt || '—'">{{
                compactShipmentDate(row.updatedAt)
              }}</time>
            </td>
          </tr>
          <tr v-if="!busy && !rows.length">
            <td colspan="5"><WorkspaceEmptyState :title="t('customerSurface.empty')" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer>
      <button :disabled="busy || page <= 1" type="button" @click="refresh(page - 1)">
        {{ t("customerSurface.previous") }}</button
      ><span>{{ t("customerSurface.summary", { page, total }) }}</span
      ><button :disabled="busy || !hasNext" type="button" @click="refresh(page + 1)">
        {{ t("customerSurface.next") }}
      </button>
    </footer>
  </section>
</template>
<style scoped>
header,
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
section {
  min-width: 0;
}
.table-scroll {
  overflow: auto;
}
.customer-compact-id,
.customer-compact-reference,
.customer-compact-status {
  display: block;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.customer-compact-id {
  max-width: 150px;
  font-variant-numeric: tabular-nums;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 24px 0;
}
th,
td {
  text-align: left;
  padding: 14px;
  border-bottom: 1px solid #dce6ee;
  white-space: nowrap;
}
button {
  padding: 8px 12px;
}

.customer-assigned-page {
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
.customer-tracking-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-primary);
  text-decoration: none;
  font-size: 14px;
}
.table-scroll {
  margin-top: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
table {
  margin: 0;
}
th {
  background: var(--color-surface-subtle);
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 500;
}
td {
  height: 52px;
  font-size: 14px;
}
tbody tr:hover {
  background: var(--color-surface-subtle);
}
footer {
  margin-top: 22px;
  font-size: 13px;
  color: var(--color-muted);
  flex-wrap: wrap;
}
@media (max-width: 680px) {
  .customer-assigned-page {
    padding: 18px;
  }
  footer {
    justify-content: flex-start;
  }
}
</style>
