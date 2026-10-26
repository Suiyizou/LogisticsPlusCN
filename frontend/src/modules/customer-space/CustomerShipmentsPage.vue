<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useCustomerModuleApi } from "./customerContext.js";
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
  <section>
    <header>
      <h1>{{ t("customerSurface.shipments") }}</h1>
      <button type="button" :disabled="busy" @click="refresh()">
        {{ t("customerSurface.refresh") }}
      </button>
    </header>
    <p>{{ t("customerSurface.intro") }}</p>
    <a href="/tracking/">{{ t("customerSurface.tracking") }}</a>
    <p v-if="busy" role="status">{{ t("customerSurface.loading") }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="table-scroll">
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
            <td>{{ row.shipmentId }}</td>
            <td>{{ row.referenceNo || "—" }}</td>
            <td>{{ row.carrier || "—" }}</td>
            <td>{{ row.trackingStatus || "—" }}</td>
            <td>{{ row.updatedAt || "—" }}</td>
          </tr>
          <tr v-if="!busy && !rows.length">
            <td colspan="5">{{ t("customerSurface.empty") }}</td>
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
</style>
