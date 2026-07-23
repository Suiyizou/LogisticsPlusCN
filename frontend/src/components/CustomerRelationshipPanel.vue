<template>
  <section class="relationship-page">
    <header class="relationship-header">
      <div>
        <span>{{ t("customers.relationshipEyebrow") }}</span>
        <h2>{{ t("customers.relationshipTitle") }}</h2>
        <p>{{ t("customers.relationshipDescription") }}</p>
      </div>
      <el-button :loading="loading" @click="loadData">
        {{ t("customers.relationshipRefresh") }}
      </el-button>
    </header>

    <el-alert
      v-if="message"
      :title="message"
      type="error"
      show-icon
      :closable="false"
      class="relationship-message"
    />

    <div class="relationship-metrics">
      <article>
        <small>{{ t("customers.relationshipCustomerTotal") }}</small>
        <strong>{{ relationships.length }}</strong>
      </article>
      <article>
        <small>{{ t("customers.relationshipIncomingPending") }}</small>
        <strong>{{ incomingPending }}</strong>
      </article>
      <article>
        <small>{{ t("customers.relationshipOutgoingPending") }}</small>
        <strong>{{ outgoingPending }}</strong>
      </article>
    </div>

    <el-tabs v-model="activeTab" class="relationship-tabs">
      <el-tab-pane :label="t('customers.relationshipDirectoryTab')" name="directory">
        <div class="relationship-toolbar">
          <el-input
            v-model="search"
            clearable
            :placeholder="t('customers.relationshipSearchPlaceholder')"
          />
          <el-select
            v-model="ownerFilter"
            clearable
            filterable
            :placeholder="t('customers.relationshipOwnerFilter')"
          >
            <el-option
              v-for="owner in owners"
              :key="owner.id"
              :value="String(owner.id)"
              :label="ownerLabel(owner)"
            />
          </el-select>
          <el-button
            type="primary"
            :disabled="!selectedRows.length || selectedOwnersConflict"
            @click="openHandoverDialog"
          >
            {{ t("customers.relationshipStartHandover", { count: selectedRows.length }) }}
          </el-button>
        </div>

        <el-alert
          v-if="selectedOwnersConflict"
          type="warning"
          :closable="false"
          show-icon
          :title="t('customers.relationshipSameOwnerRequired')"
          class="relationship-selection-warning"
        />

        <el-table
          ref="relationshipTable"
          :data="filteredRelationships"
          stripe
          v-loading="loading"
          class="relationship-table"
          @selection-change="selectedRows = $event"
        >
          <el-table-column type="selection" width="48" :selectable="canSelectCustomer" />
          <el-table-column :label="t('customers.relationshipCustomer')" min-width="190">
            <template #default="{ row }">
              <div class="relationship-customer">
                <b>{{ row.displayName || row.username }}</b>
                <small>@{{ row.username }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('customers.clientCode')" min-width="145">
            <template #default="{ row }">
              <code>{{ row.clientCode || t("customers.missingValue") }}</code>
            </template>
          </el-table-column>
          <el-table-column :label="t('customers.partyRole')" min-width="125">
            <template #default="{ row }">{{ partyRoleLabel(row.partyRole) }}</template>
          </el-table-column>
          <el-table-column :label="t('customers.relationshipCurrentOwner')" min-width="170">
            <template #default="{ row }">
              <div class="relationship-owner">
                <b>{{ row.responsibleBusinessDisplayName || "—" }}</b>
                <small v-if="row.responsibleBusinessUsername">
                  @{{ row.responsibleBusinessUsername }}
                </small>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('customers.relationshipOverseaAgent')" min-width="170">
            <template #default="{ row }">
              <span>{{ row.linkedOverseaAgentDisplayName || "—" }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="shipmentCount"
            :label="t('customers.shipmentCount')"
            width="95"
            align="center"
          />
          <el-table-column :label="t('customers.relationshipHandoverStatus')" min-width="190">
            <template #default="{ row }">
              <el-tag v-if="row.pendingHandover" type="warning" effect="plain">
                {{
                  t("customers.relationshipPendingTo", {
                    name: row.pendingHandover.toBusinessDisplayName
                  })
                }}
              </el-tag>
              <el-tag v-else type="success" effect="plain">
                {{ t("customers.relationshipNoPending") }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('customers.status')" width="95">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
                {{ row.status === "ACTIVE" ? t("customers.statusActive") : t("customers.statusDisabled") }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane name="requests">
        <template #label>
          <span>
            {{ t("customers.relationshipRequestsTab") }}
            <el-badge v-if="incomingPending" :value="incomingPending" class="request-tab-badge" />
          </span>
        </template>

        <el-table :data="handoverRequests" stripe v-loading="loading" class="relationship-table">
          <el-table-column :label="t('customers.relationshipRequestCustomers')" min-width="240">
            <template #default="{ row }">
              <div class="relationship-request-customers">
                <el-tag
                  v-for="customer in row.customers"
                  :key="customer.id"
                  size="small"
                  effect="plain"
                >
                  {{ customer.displayName }} · {{ customer.clientCode || "—" }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('customers.relationshipFromOwner')" min-width="140">
            <template #default="{ row }">{{ row.fromBusinessDisplayName }}</template>
          </el-table-column>
          <el-table-column :label="t('customers.relationshipToOwner')" min-width="140">
            <template #default="{ row }">{{ row.toBusinessDisplayName }}</template>
          </el-table-column>
          <el-table-column prop="reason" :label="t('customers.relationshipReason')" min-width="190" show-overflow-tooltip />
          <el-table-column :label="t('customers.relationshipRequestStatus')" width="110">
            <template #default="{ row }">
              <el-tag :type="requestStatusType(row.status)" effect="plain">
                {{ requestStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('customers.relationshipRequestedAt')" width="170">
            <template #default="{ row }">{{ formatDateTime(row.requestedAt) }}</template>
          </el-table-column>
          <el-table-column :label="t('customers.actions')" width="180" fixed="right">
            <template #default="{ row }">
              <div v-if="row.canDecide" class="relationship-decision-actions">
                <el-button type="success" size="small" :loading="decidingId === row.id" @click="acceptRequest(row)">
                  {{ t("customers.relationshipAccept") }}
                </el-button>
                <el-button type="danger" plain size="small" :disabled="Boolean(decidingId)" @click="rejectRequest(row)">
                  {{ t("customers.relationshipReject") }}
                </el-button>
              </div>
              <span v-else>—</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="handoverDialogOpen"
      :title="t('customers.relationshipHandoverDialogTitle')"
      width="520px"
      :close-on-click-modal="false"
    >
      <p class="handover-dialog-description">
        {{ t("customers.relationshipHandoverDialogDescription", { count: selectedRows.length }) }}
      </p>
      <el-form label-position="top" @submit.prevent="submitHandover">
        <el-form-item :label="t('customers.relationshipTargetOwner')" required>
          <el-select
            v-model="handoverForm.targetBusinessUserId"
            filterable
            class="relationship-dialog-select"
            :placeholder="t('customers.relationshipTargetOwnerPlaceholder')"
          >
            <el-option
              v-for="owner in targetOwners"
              :key="owner.id"
              :value="owner.id"
              :label="ownerLabel(owner)"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('customers.relationshipReason')" required>
          <el-input
            v-model.trim="handoverForm.reason"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            :placeholder="t('customers.relationshipReasonPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="submitting" @click="handoverDialogOpen = false">
          {{ t("customers.cancel") }}
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!handoverForm.targetBusinessUserId || !handoverForm.reason"
          @click="submitHandover"
        >
          {{ t("customers.relationshipSubmitRequest") }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import {
  createCustomerHandoverRequest,
  decideCustomerHandoverRequest,
  fetchCustomerHandoverRequests,
  fetchCustomerRelationships
} from "../services/businessCustomerApi";
import { markApiErrorHandled } from "../services/apiClient";

const props = defineProps({
  currentUser: { type: Object, required: true }
});

const { t, locale } = useI18n();
const loading = ref(false);
const submitting = ref(false);
const decidingId = ref("");
const message = ref("");
const activeTab = ref("directory");
const relationships = ref([]);
const handoverRequests = ref([]);
const owners = ref([]);
const incomingPending = ref(0);
const outgoingPending = ref(0);
const search = ref("");
const ownerFilter = ref("");
const selectedRows = ref([]);
const relationshipTable = ref(null);
const handoverDialogOpen = ref(false);
const handoverForm = reactive({
  targetBusinessUserId: null,
  reason: ""
});

const filteredRelationships = computed(() => {
  const query = search.value.trim().toLowerCase();
  return relationships.value.filter((row) => {
    if (ownerFilter.value
        && String(row.responsibleBusinessUserId || "") !== ownerFilter.value) return false;
    if (!query) return true;
    return [
      row.displayName,
      row.username,
      row.clientCode,
      row.responsibleBusinessDisplayName,
      row.responsibleBusinessUsername,
      row.linkedOverseaAgentDisplayName
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
});

const selectedOwnerIds = computed(() => new Set(
  selectedRows.value.map((row) => String(row.responsibleBusinessUserId || ""))
));
const selectedOwnersConflict = computed(() => selectedOwnerIds.value.size > 1);
const selectedOwnerId = computed(() =>
  selectedRows.value[0]?.responsibleBusinessUserId ?? null
);
const targetOwners = computed(() => owners.value.filter(
  (owner) => String(owner.id) !== String(selectedOwnerId.value)
));

onMounted(loadData);

async function loadData() {
  if (loading.value) return;
  loading.value = true;
  message.value = "";
  try {
    const [relationshipResponse, requestResponse] = await Promise.all([
      fetchCustomerRelationships(),
      fetchCustomerHandoverRequests()
    ]);
    relationships.value = Array.isArray(relationshipResponse?.items)
      ? relationshipResponse.items
      : [];
    owners.value = Array.isArray(relationshipResponse?.owners)
      ? relationshipResponse.owners
      : [];
    incomingPending.value = Number(relationshipResponse?.incomingPending || 0);
    outgoingPending.value = Number(relationshipResponse?.outgoingPending || 0);
    handoverRequests.value = Array.isArray(requestResponse?.items)
      ? requestResponse.items
      : [];
    selectedRows.value = [];
    relationshipTable.value?.clearSelection();
  } catch (error) {
    markApiErrorHandled(error);
    message.value = error?.message || t("customers.relationshipLoadFailed");
  } finally {
    loading.value = false;
  }
}

function canSelectCustomer(row) {
  if (row.status !== "ACTIVE" || row.pendingHandover) return false;
  if (props.currentUser?.role === "ADMIN") return true;
  return String(row.responsibleBusinessUserId) === String(props.currentUser?.id);
}

function openHandoverDialog() {
  if (!selectedRows.value.length || selectedOwnersConflict.value) return;
  handoverForm.targetBusinessUserId = null;
  handoverForm.reason = "";
  handoverDialogOpen.value = true;
}

async function submitHandover() {
  if (submitting.value
      || !handoverForm.targetBusinessUserId
      || !handoverForm.reason
      || !selectedRows.value.length) return;
  submitting.value = true;
  try {
    await createCustomerHandoverRequest({
      customerIds: selectedRows.value.map((row) => row.id),
      targetBusinessUserId: Number(handoverForm.targetBusinessUserId),
      reason: handoverForm.reason
    });
    handoverDialogOpen.value = false;
    ElMessage.success(t("customers.relationshipRequestCreated"));
    await loadData();
    activeTab.value = "requests";
  } catch (error) {
    markApiErrorHandled(error);
    ElMessage.error(error?.message || t("customers.relationshipRequestFailed"));
  } finally {
    submitting.value = false;
  }
}

async function acceptRequest(request) {
  try {
    await ElMessageBox.confirm(
      t("customers.relationshipAcceptConfirm", { count: request.customers?.length || 0 }),
      t("customers.relationshipAccept"),
      {
        type: "warning",
        confirmButtonText: t("customers.relationshipAccept"),
        cancelButtonText: t("customers.cancel")
      }
    );
  } catch (error) {
    if (isDialogCancel(error)) return;
    throw error;
  }
  await decideRequest(request, "ACCEPTED", "");
}

async function rejectRequest(request) {
  let result;
  try {
    result = await ElMessageBox.prompt(
      t("customers.relationshipRejectPrompt"),
      t("customers.relationshipReject"),
      {
        type: "warning",
        inputType: "textarea",
        inputPlaceholder: t("customers.relationshipRejectReasonPlaceholder"),
        inputValidator: (value) =>
          Boolean(String(value || "").trim()) || t("customers.relationshipRejectReasonRequired"),
        confirmButtonText: t("customers.relationshipReject"),
        cancelButtonText: t("customers.cancel")
      }
    );
  } catch (error) {
    if (isDialogCancel(error)) return;
    throw error;
  }
  await decideRequest(request, "REJECTED", result.value);
}

async function decideRequest(request, decision, note) {
  if (decidingId.value) return;
  decidingId.value = request.id;
  try {
    await decideCustomerHandoverRequest(request.id, { decision, note });
    ElMessage.success(t(
      decision === "ACCEPTED"
        ? "customers.relationshipAccepted"
        : "customers.relationshipRejected"
    ));
    await loadData();
  } catch (error) {
    markApiErrorHandled(error);
    ElMessage.error(error?.message || t("customers.relationshipDecisionFailed"));
  } finally {
    decidingId.value = "";
  }
}

function ownerLabel(owner) {
  const name = owner?.displayName || owner?.username || "—";
  return owner?.username && owner.username !== name
    ? `${name} · @${owner.username}`
    : name;
}

function partyRoleLabel(role) {
  return t({
    OVERSEA_AGENT: "customers.roleOverseaAgent",
    SHIPPER: "customers.roleShipper",
    CONSIGNEE: "customers.roleConsignee"
  }[String(role || "").toUpperCase()] || "customers.roleShipper");
}

function requestStatusLabel(status) {
  return t({
    PENDING: "customers.relationshipStatusPending",
    ACCEPTED: "customers.relationshipStatusAccepted",
    REJECTED: "customers.relationshipStatusRejected"
  }[String(status || "").toUpperCase()] || "customers.relationshipStatusPending");
}

function requestStatusType(status) {
  const value = String(status || "").toUpperCase();
  if (value === "ACCEPTED") return "success";
  if (value === "REJECTED") return "danger";
  return "warning";
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(locale.value === "en-US" ? "en-US" : "zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
}

function isDialogCancel(error) {
  return error === "cancel" || error === "close" || error?.message === "cancel";
}
</script>

<style scoped>
.relationship-page {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.relationship-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px;
  border: 1px solid #dfe8f2;
  border-radius: 10px;
  background: #fff;
}

.relationship-header span {
  color: #3184cf;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.relationship-header h2 {
  margin: 5px 0 4px;
  color: #13243a;
  font-size: 23px;
}

.relationship-header p,
.handover-dialog-description {
  margin: 0;
  color: #718197;
  font-size: 13px;
  line-height: 1.6;
}

.relationship-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.relationship-metrics article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  border: 1px solid #dfe8f2;
  border-radius: 8px;
  background: #fff;
}

.relationship-metrics small {
  color: #687b91;
  font-weight: 700;
}

.relationship-metrics strong {
  color: #1769aa;
  font-size: 24px;
}

.relationship-tabs {
  padding: 6px 18px 18px;
  border: 1px solid #dfe8f2;
  border-radius: 10px;
  background: #fff;
}

.relationship-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(190px, 260px) auto;
  gap: 10px;
  margin-bottom: 14px;
}

.relationship-selection-warning,
.relationship-message {
  margin-bottom: 12px;
}

.relationship-customer,
.relationship-owner {
  display: grid;
  gap: 3px;
}

.relationship-customer b,
.relationship-owner b {
  color: #1b3048;
}

.relationship-customer small,
.relationship-owner small {
  color: #8492a5;
  font-size: 11px;
}

.relationship-table code {
  color: #175f99;
  font: 700 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.relationship-request-customers {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.relationship-decision-actions {
  display: flex;
  gap: 6px;
}

.relationship-dialog-select {
  width: 100%;
}

.request-tab-badge {
  margin-left: 8px;
}

@media (max-width: 900px) {
  .relationship-metrics {
    grid-template-columns: 1fr;
  }

  .relationship-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
