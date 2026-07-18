<template>
  <main class="customer-access-page" data-i18n-ignore>
    <header class="customer-access-header">
      <RouterLink class="customer-access-brand" to="/workbenches">
        <img src="/favicon.svg" alt="" />
        <span>
          <strong>DrewesLogistics</strong>
          <small>{{ t("customers.productLine") }}</small>
        </span>
      </RouterLink>
      <div class="customer-access-header-actions">
        <LanguageSwitcher class="customer-access-language" />
        <span class="customer-access-party-pill">{{ t("customers.internalPartyAgent") }}</span>
        <div class="customer-access-user">
          <b>{{ displayName }}</b>
          <small>{{ t("customers.businessOperator") }}</small>
        </div>
        <button type="button" class="customer-access-logout" @click="emit('logout')">
          {{ t("customers.logout") }}
        </button>
      </div>
    </header>

    <section class="customer-access-content">
      <header class="customer-access-hero">
        <div>
          <span>{{ t("customers.eyebrow") }}</span>
          <h1>{{ t("customers.title") }}</h1>
          <p>{{ t("customers.description") }}</p>
        </div>
        <div class="customer-access-boundary">
          <i aria-hidden="true"></i>
          <span>
            <b>{{ t("customers.boundaryTitle") }}</b>
            <small>{{ t("customers.boundaryDescription") }}</small>
          </span>
        </div>
      </header>

      <p v-if="pageMessage" class="customer-access-message" :class="{ 'is-error': messageIsError }" role="status">
        {{ pageMessage }}
      </p>

      <div class="customer-access-layout">
        <aside class="customer-access-sidebar">
          <form class="customer-create-card" @submit.prevent="createCustomer">
            <header>
              <span>01</span>
              <div>
                <h2>{{ t("customers.createTitle") }}</h2>
                <p>{{ t("customers.createDescription") }}</p>
              </div>
            </header>
            <label>
              <span>{{ t("customers.username") }}</span>
              <input v-model.trim="createForm.username" :placeholder="t('customers.usernamePlaceholder')" required />
            </label>
            <label>
              <span>{{ t("customers.displayName") }}</span>
              <input v-model.trim="createForm.displayName" :placeholder="t('customers.displayNamePlaceholder')" required />
            </label>
            <label>
              <span>{{ t("customers.partyRole") }}</span>
              <el-select
                v-model="createForm.partyRole"
                class="business-select"
                popper-class="business-select-popper"
              >
                <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
                <el-option value="AGENT" :label="t('customers.roleAgent')" />
              </el-select>
            </label>
            <button class="customer-access-primary" type="submit" :disabled="creating">
              {{ creating ? t("customers.creating") : t("customers.create") }}
            </button>
          </form>

          <section class="customer-list-card">
            <header>
              <div>
                <span>{{ t("customers.directoryEyebrow") }}</span>
                <h2>{{ t("customers.directoryTitle") }}</h2>
              </div>
              <b>{{ customers.length }}</b>
            </header>
            <div v-if="loadingCustomers" class="customer-access-empty">{{ t("customers.loading") }}</div>
            <div v-else-if="!customers.length" class="customer-access-empty">{{ t("customers.emptyCustomers") }}</div>
            <button
              v-for="customer in customers"
              v-else
              :key="customer.id"
              type="button"
              class="customer-list-row"
              :class="{ 'is-active': selectedCustomerId === customer.id, 'is-disabled': customer.status !== 'ACTIVE' }"
              @click="selectCustomer(customer.id)"
            >
              <span class="customer-list-avatar">{{ customerInitial(customer) }}</span>
              <span class="customer-list-copy">
                <b>{{ customer.displayName || customer.username }}</b>
                <small>@{{ customer.username }} · {{ partyRoleLabel(customer.partyRole) }}</small>
              </span>
              <span class="customer-list-state">{{ statusLabel(customer.status) }}</span>
            </button>
          </section>
        </aside>

        <section class="customer-detail-card">
          <div v-if="!selectedCustomer" class="customer-detail-empty">
            <span>↗</span>
            <h2>{{ t("customers.selectTitle") }}</h2>
            <p>{{ t("customers.selectDescription") }}</p>
          </div>

          <template v-else>
            <header class="customer-detail-head">
              <div>
                <span>{{ t("customers.detailEyebrow") }}</span>
                <h2>{{ selectedCustomer.displayName || selectedCustomer.username }}</h2>
                <p>
                  @{{ selectedCustomer.username }}
                  <i>·</i>
                  {{ partyRoleLabel(selectedCustomer.partyRole) }}
                  <i>·</i>
                  {{ statusLabel(selectedCustomer.status) }}
                </p>
              </div>
              <div class="customer-detail-actions">
                <button type="button" @click="resetCode" :disabled="mutatingCustomer">
                  {{ t("customers.resetCode") }}
                </button>
                <button
                  v-if="selectedCustomer.status === 'ACTIVE'"
                  type="button"
                  class="is-danger"
                  @click="deactivateCustomer"
                  :disabled="mutatingCustomer"
                >
                  {{ t("customers.deactivate") }}
                </button>
                <button v-else type="button" @click="reactivateCustomer" :disabled="mutatingCustomer">
                  {{ t("customers.reactivate") }}
                </button>
              </div>
            </header>

            <section class="customer-edit-section">
              <div class="customer-section-title">
                <span>02</span>
                <div>
                  <h3>{{ t("customers.profileTitle") }}</h3>
                  <p>{{ t("customers.profileDescription") }}</p>
                </div>
              </div>
              <form class="customer-edit-form" @submit.prevent="saveCustomer">
                <label>
                  <span>{{ t("customers.username") }}</span>
                  <input v-model.trim="editForm.username" required />
                </label>
                <label>
                  <span>{{ t("customers.displayName") }}</span>
                  <input v-model.trim="editForm.displayName" required />
                </label>
                <label>
                  <span>{{ t("customers.partyRole") }}</span>
                  <el-select
                    v-model="editForm.partyRole"
                    class="business-select"
                    popper-class="business-select-popper"
                  >
                    <el-option value="SHIPPER" :label="t('customers.roleShipper')" />
                    <el-option value="CONSIGNEE" :label="t('customers.roleConsignee')" />
                    <el-option value="AGENT" :label="t('customers.roleAgent')" />
                  </el-select>
                </label>
                <button class="customer-access-primary" type="submit" :disabled="mutatingCustomer">
                  {{ t("customers.saveProfile") }}
                </button>
              </form>
              <div class="customer-code-meta">
                <span>{{ t("customers.codePrefix") }}</span>
                <b>{{ selectedCustomer.customerCodePrefix || t("customers.notAvailable") }}</b>
                <small>{{ t("customers.codePrefixHint") }}</small>
              </div>
            </section>

            <section class="customer-shipments-section">
              <div class="customer-section-title">
                <span>03</span>
                <div>
                  <h3>{{ t("customers.shipmentsTitle") }}</h3>
                  <p>{{ t("customers.shipmentsDescription") }}</p>
                </div>
              </div>

              <form class="customer-bind-form" @submit.prevent="bindShipment">
                <div class="customer-bind-mode" role="group" :aria-label="t('customers.bindMode')">
                  <button type="button" :class="{ 'is-active': bindMode === 'reference' }" @click="bindMode = 'reference'">
                    {{ t("customers.bindByReference") }}
                  </button>
                  <button type="button" :class="{ 'is-active': bindMode === 'shipmentId' }" @click="bindMode = 'shipmentId'">
                    {{ t("customers.bindByShipmentId") }}
                  </button>
                </div>
                <label v-if="bindMode === 'shipmentId'" class="customer-bind-wide">
                  <span>{{ t("customers.shipmentId") }}</span>
                  <input v-model.trim="bindForm.shipmentId" :placeholder="t('customers.shipmentIdPlaceholder')" required />
                  <small class="customer-field-hint">{{ t("customers.shipmentIdHint") }}</small>
                </label>
                <template v-else>
                  <label>
                    <span>{{ t("customers.carrier") }}</span>
                    <input v-model.trim="bindForm.carrier" :placeholder="t('customers.carrierPlaceholder')" required />
                  </label>
                  <label>
                    <span>{{ t("customers.referenceType") }}</span>
                    <el-select
                      v-model="bindForm.referenceType"
                      class="business-select"
                      popper-class="business-select-popper"
                    >
                      <el-option value="BOOKING" :label="t('customers.referenceBooking')" />
                      <el-option value="BILLOFLADING" :label="t('customers.referenceBill')" />
                    </el-select>
                  </label>
                  <label>
                    <span>{{ t("customers.referenceNo") }}</span>
                    <input v-model.trim="bindForm.referenceNo" :placeholder="t('customers.referenceNoPlaceholder')" required />
                  </label>
                  <p class="customer-reference-hint">{{ t("customers.referenceHint") }}</p>
                </template>
                <button class="customer-access-primary" type="submit" :disabled="bindingShipment">
                  {{ bindingShipment ? t("customers.binding") : t("customers.bind") }}
                </button>
              </form>

              <div class="customer-shipment-table">
                <div class="customer-shipment-table-head">
                  <span>{{ t("customers.shipmentReference") }}</span>
                  <span>{{ t("customers.shipmentStatus") }}</span>
                  <span>{{ t("customers.assignedAt") }}</span>
                  <span>{{ t("customers.actions") }}</span>
                </div>
                <div v-if="loadingShipments" class="customer-access-empty">{{ t("customers.loadingShipments") }}</div>
                <div v-else-if="!shipments.length" class="customer-access-empty">{{ t("customers.emptyShipments") }}</div>
                <div v-for="shipment in shipments" v-else :key="shipment.shipmentId" class="customer-shipment-row">
                  <span>
                    <b>{{ shipment.referenceNo || shipment.shipmentId }}</b>
                    <small>{{ shipment.carrier || "—" }} · {{ referenceTypeLabel(shipment.referenceType) }}</small>
                  </span>
                  <span><i class="customer-shipment-dot"></i>{{ shipment.trackingStatus || t("customers.bound") }}</span>
                  <span>{{ formatDate(shipment.assignedAt) }}</span>
                  <span>
                    <button type="button" @click="unbindShipment(shipment)" :disabled="unbindingShipmentId === shipment.shipmentId">
                      {{ t("customers.unbind") }}
                    </button>
                  </span>
                </div>
              </div>
            </section>
          </template>
        </section>
      </div>
    </section>

    <div v-if="revealedCode" class="customer-code-overlay" role="presentation" @click.self="closeCodeReveal">
      <section class="customer-code-dialog" role="dialog" aria-modal="true" :aria-label="t('customers.codeDialogTitle')">
        <span class="customer-code-kicker">ONE-TIME CREDENTIAL</span>
        <h2>{{ t("customers.codeDialogTitle") }}</h2>
        <p>{{ t("customers.codeDialogDescription", { name: revealedCode.displayName }) }}</p>
        <code>{{ revealedCode.customerCode }}</code>
        <small>{{ t("customers.codeDialogWarning") }}</small>
        <div>
          <button type="button" class="customer-access-primary" @click="copyRevealedCode">
            {{ codeCopied ? t("customers.copied") : t("customers.copyCode") }}
          </button>
          <button type="button" @click="closeCodeReveal">{{ t("customers.confirmStored") }}</button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import {
  bindBusinessCustomerShipment,
  createBusinessCustomer,
  deleteBusinessCustomer,
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  resetBusinessCustomerCode,
  unbindBusinessCustomerShipment,
  updateBusinessCustomer
} from "../services/businessCustomerApi";

const props = defineProps({
  currentUser: { type: Object, default: null }
});
const emit = defineEmits(["logout"]);
const { t } = useI18n();

const customers = ref([]);
const selectedCustomerId = ref("");
const shipments = ref([]);
const loadingCustomers = ref(false);
const loadingShipments = ref(false);
const creating = ref(false);
const mutatingCustomer = ref(false);
const bindingShipment = ref(false);
const unbindingShipmentId = ref("");
const pageMessage = ref("");
const messageIsError = ref(false);
const revealedCode = ref(null);
const codeCopied = ref(false);
const bindMode = ref("reference");
const createForm = reactive({ username: "", displayName: "", partyRole: "SHIPPER" });
const editForm = reactive({ username: "", displayName: "", partyRole: "SHIPPER" });
const bindForm = reactive({ shipmentId: "", carrier: "COSCO", referenceType: "BOOKING", referenceNo: "" });
let shipmentRequestSequence = 0;

const displayName = computed(() => props.currentUser?.displayName || props.currentUser?.username || t("customers.businessOperator"));
const selectedCustomer = computed(() => customers.value.find((item) => item.id === selectedCustomerId.value) || null);

watch(selectedCustomer, (customer) => {
  editForm.username = customer?.username || "";
  editForm.displayName = customer?.displayName || "";
  editForm.partyRole = customer?.partyRole || "SHIPPER";
}, { immediate: true });

onMounted(loadCustomers);
onUnmounted(() => {
  revealedCode.value = null;
});

async function loadCustomers(preferredId = "") {
  loadingCustomers.value = true;
  clearMessage();
  try {
    const response = await fetchBusinessCustomers();
    customers.value = Array.isArray(response?.items) ? response.items : [];
    const nextId = preferredId || selectedCustomerId.value;
    if (nextId && customers.value.some((item) => item.id === nextId)) {
      await selectCustomer(nextId);
    } else if (customers.value[0]) {
      await selectCustomer(customers.value[0].id);
    } else {
      selectedCustomerId.value = "";
      shipments.value = [];
    }
  } catch (error) {
    showError(error, "customers.loadFailed");
  } finally {
    loadingCustomers.value = false;
  }
}

async function selectCustomer(customerId) {
  const requestSequence = ++shipmentRequestSequence;
  selectedCustomerId.value = customerId;
  loadingShipments.value = true;
  try {
    const response = await fetchBusinessCustomerShipments(customerId);
    if (requestSequence !== shipmentRequestSequence || selectedCustomerId.value !== customerId) return;
    shipments.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    if (requestSequence !== shipmentRequestSequence || selectedCustomerId.value !== customerId) return;
    shipments.value = [];
    showError(error, "customers.loadShipmentsFailed");
  } finally {
    if (requestSequence === shipmentRequestSequence) loadingShipments.value = false;
  }
}

async function createCustomer() {
  if (creating.value) return;
  creating.value = true;
  clearMessage();
  try {
    const response = await createBusinessCustomer({ ...createForm });
    const customer = normalizeCustomer(response);
    revealCode(response, customer);
    createForm.username = "";
    createForm.displayName = "";
    createForm.partyRole = "SHIPPER";
    await loadCustomers(customer.id);
  } catch (error) {
    showError(error, "customers.createFailed");
  } finally {
    creating.value = false;
  }
}

async function saveCustomer() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  mutatingCustomer.value = true;
  clearMessage();
  try {
    const response = await updateBusinessCustomer(selectedCustomer.value.id, { ...editForm });
    replaceCustomer(normalizeCustomer(response));
    showSuccess("customers.saved");
  } catch (error) {
    showError(error, "customers.saveFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function resetCode() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  if (!window.confirm(t("customers.resetConfirm"))) return;
  mutatingCustomer.value = true;
  clearMessage();
  try {
    const response = await resetBusinessCustomerCode(selectedCustomer.value.id);
    const customer = normalizeCustomer(response);
    replaceCustomer(customer);
    revealCode(response, customer);
  } catch (error) {
    showError(error, "customers.resetFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function deactivateCustomer() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  if (!window.confirm(t("customers.deactivateConfirm"))) return;
  mutatingCustomer.value = true;
  try {
    await deleteBusinessCustomer(selectedCustomer.value.id);
    replaceCustomer({ ...selectedCustomer.value, status: "DISABLED" });
    showSuccess("customers.deactivated");
  } catch (error) {
    showError(error, "customers.deactivateFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function reactivateCustomer() {
  if (!selectedCustomer.value || mutatingCustomer.value) return;
  mutatingCustomer.value = true;
  try {
    const response = await updateBusinessCustomer(selectedCustomer.value.id, { status: "ACTIVE" });
    replaceCustomer(normalizeCustomer(response));
    showSuccess("customers.reactivated");
  } catch (error) {
    showError(error, "customers.reactivateFailed");
  } finally {
    mutatingCustomer.value = false;
  }
}

async function bindShipment() {
  if (!selectedCustomer.value || bindingShipment.value) return;
  bindingShipment.value = true;
  clearMessage();
  try {
    const payload = bindMode.value === "shipmentId"
      ? { shipmentId: bindForm.shipmentId }
      : {
          carrier: bindForm.carrier,
          referenceType: bindForm.referenceType,
          referenceNo: bindForm.referenceNo
        };
    await bindBusinessCustomerShipment(selectedCustomer.value.id, payload);
    bindForm.shipmentId = "";
    bindForm.referenceNo = "";
    await selectCustomer(selectedCustomer.value.id);
    showSuccess("customers.boundSuccess");
  } catch (error) {
    showError(error, "customers.bindFailed");
  } finally {
    bindingShipment.value = false;
  }
}

async function unbindShipment(shipment) {
  if (!selectedCustomer.value || unbindingShipmentId.value) return;
  if (!window.confirm(t("customers.unbindConfirm"))) return;
  unbindingShipmentId.value = shipment.shipmentId;
  try {
    await unbindBusinessCustomerShipment(selectedCustomer.value.id, shipment.shipmentId);
    shipments.value = shipments.value.filter((item) => item.shipmentId !== shipment.shipmentId);
    showSuccess("customers.unboundSuccess");
  } catch (error) {
    showError(error, "customers.unbindFailed");
  } finally {
    unbindingShipmentId.value = "";
  }
}

function normalizeCustomer(response) {
  return response?.customer || response || {};
}

function replaceCustomer(customer) {
  if (!customer?.id) return;
  const index = customers.value.findIndex((item) => item.id === customer.id);
  if (index >= 0) customers.value.splice(index, 1, { ...customers.value[index], ...customer });
  else customers.value.unshift(customer);
}

function revealCode(response, customer) {
  if (!response?.customerCode) return;
  revealedCode.value = {
    customerCode: response.customerCode,
    displayName: customer.displayName || customer.username || ""
  };
  codeCopied.value = false;
}

async function copyRevealedCode() {
  if (!revealedCode.value?.customerCode) return;
  try {
    await navigator.clipboard.writeText(revealedCode.value.customerCode);
    codeCopied.value = true;
  } catch {
    codeCopied.value = false;
  }
}

function closeCodeReveal() {
  revealedCode.value = null;
  codeCopied.value = false;
}

function customerInitial(customer) {
  return String(customer.displayName || customer.username || "C").slice(0, 1).toUpperCase();
}

function partyRoleLabel(role) {
  return t({ AGENT: "customers.roleAgent", SHIPPER: "customers.roleShipper", CONSIGNEE: "customers.roleConsignee" }[role] || "customers.roleShipper");
}

function statusLabel(status) {
  return t(status === "ACTIVE" ? "customers.statusActive" : "customers.statusDisabled");
}

function referenceTypeLabel(type) {
  return t({ BOOKING: "customers.referenceBooking", BILLOFLADING: "customers.referenceBill", CONTAINER: "customers.referenceContainer" }[type] || "customers.referenceUnknown");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function clearMessage() {
  pageMessage.value = "";
  messageIsError.value = false;
}

function showSuccess(key) {
  pageMessage.value = t(key);
  messageIsError.value = false;
}

function showError(error, fallbackKey) {
  const message = String(error?.message || "");
  if (/Tracked shipment not found|Shipment not found/i.test(message)) {
    pageMessage.value = t("customers.trackedShipmentNotFound");
  } else if (/explicit operator access|permission|forbidden/i.test(message)) {
    pageMessage.value = t("customers.shipmentAccessRequired");
  } else {
    pageMessage.value = message || t(fallbackKey);
  }
  messageIsError.value = true;
}
</script>

<style scoped>
.customer-access-page {
  min-height: 100dvh;
  color: #102a46;
  background:
    radial-gradient(circle at 88% 8%, rgba(28, 131, 224, 0.12), transparent 25%),
    linear-gradient(180deg, #f8fbff 0%, #edf4fb 100%);
}

.customer-access-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 78px;
  padding: 0 clamp(24px, 4.5vw, 76px);
  border-bottom: 1px solid rgba(115, 148, 180, 0.2);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 34px rgba(31, 70, 108, 0.06);
  backdrop-filter: blur(16px);
}

.customer-access-brand,
.customer-access-header-actions,
.customer-access-user {
  display: flex;
  align-items: center;
}

.customer-access-brand {
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.customer-access-brand img {
  width: 38px;
  height: 38px;
}

.customer-access-brand span,
.customer-access-user {
  display: grid;
  gap: 2px;
}

.customer-access-brand strong { font-size: 17px; }
.customer-access-brand small,
.customer-access-user small { color: #7a8fa6; font-size: 10px; }

.customer-access-header-actions { gap: 13px; }
.customer-access-user { padding-left: 3px; }
.customer-access-user b { font-size: 12px; }

.customer-access-party-pill {
  padding: 7px 11px;
  border: 1px solid #cfe2f5;
  border-radius: 999px;
  color: #1767ae;
  background: #f2f8ff;
  font-size: 10px;
  font-weight: 800;
}

.customer-access-logout,
.customer-detail-actions button,
.customer-shipment-row button,
.customer-code-dialog button {
  min-height: 36px;
  padding: 8px 13px;
  border: 1px solid #ccdae8;
  border-radius: 9px;
  color: #31516f;
  background: #fff;
  font-weight: 750;
}

.customer-access-content {
  width: min(1480px, calc(100% - 48px));
  margin: 0 auto;
  padding: 54px 0 72px;
}

.customer-access-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.65fr);
  align-items: end;
  gap: 44px;
  margin-bottom: 28px;
}

.customer-access-hero > div:first-child > span,
.customer-list-card header span,
.customer-detail-head > div > span,
.customer-code-kicker {
  color: #1377ce;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.16em;
}

.customer-access-hero h1 {
  max-width: 780px;
  margin: 10px 0 12px;
  font-size: clamp(34px, 4vw, 58px);
  letter-spacing: -0.045em;
  line-height: 1.02;
}

.customer-access-hero p {
  max-width: 760px;
  margin: 0;
  color: #627b94;
  line-height: 1.7;
}

.customer-access-boundary {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 18px;
  border: 1px solid #cfe2f2;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.customer-access-boundary i {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #24b889;
  box-shadow: 0 0 0 3px rgba(36, 184, 137, 0.13);
}

.customer-access-boundary span { display: grid; gap: 5px; }
.customer-access-boundary b { font-size: 13px; }
.customer-access-boundary small { color: #6d8298; line-height: 1.55; }

.customer-access-message {
  margin: 0 0 18px;
  padding: 12px 15px;
  border: 1px solid #bce7d6;
  border-radius: 10px;
  color: #14704f;
  background: #effbf6;
}

.customer-access-message.is-error {
  border-color: #efc1c8;
  color: #a22f42;
  background: #fff3f5;
}

.customer-access-layout {
  display: grid;
  grid-template-columns: minmax(310px, 0.62fr) minmax(660px, 1.38fr);
  gap: 22px;
  align-items: start;
}

.customer-access-sidebar { display: grid; gap: 18px; }
.customer-create-card,
.customer-list-card,
.customer-detail-card {
  border: 1px solid rgba(158, 184, 210, 0.48);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 55px rgba(30, 70, 109, 0.08);
}

.customer-create-card { display: grid; gap: 13px; padding: 20px; }
.customer-create-card header,
.customer-section-title { display: flex; align-items: flex-start; gap: 12px; }
.customer-create-card header > span,
.customer-section-title > span {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #1477ce;
  background: #eaf5ff;
  font-size: 11px;
  font-weight: 900;
}

.customer-create-card h2,
.customer-list-card h2,
.customer-section-title h3 { margin: 0; font-size: 16px; }
.customer-create-card p,
.customer-section-title p { margin: 4px 0 0; color: #72879c; font-size: 11px; line-height: 1.5; }

.customer-create-card label,
.customer-edit-form label,
.customer-bind-form label { display: grid; gap: 6px; }
.customer-create-card label > span,
.customer-edit-form label > span,
.customer-bind-form label > span { color: #435d76; font-size: 11px; font-weight: 800; }

.customer-create-card input,
.customer-create-card select,
.customer-edit-form input,
.customer-edit-form select,
.customer-bind-form input,
.customer-bind-form select {
  min-height: 42px;
  width: 100%;
  padding: 8px 11px;
  border: 1px solid #cfdeec;
  border-radius: 9px;
  outline: 0;
  color: #183652;
  background: #fbfdff;
}

.customer-create-card input:focus,
.customer-create-card select:focus,
.customer-edit-form input:focus,
.customer-edit-form select:focus,
.customer-bind-form input:focus,
.customer-bind-form select:focus {
  border-color: #2a89df;
  box-shadow: 0 0 0 3px rgba(42, 137, 223, 0.1);
}

.customer-access-primary {
  min-height: 43px;
  border: 1px solid #126fc3;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(110deg, #1264b0, #168fe2);
  box-shadow: 0 10px 24px rgba(18, 105, 188, 0.18);
  font-weight: 800;
}

.customer-list-card { overflow: hidden; }
.customer-list-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e0e9f2;
}
.customer-list-card header > div { display: grid; gap: 5px; }
.customer-list-card header > b {
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  border-radius: 9px;
  color: #176cb7;
  background: #edf6ff;
}

.customer-list-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 18px;
  border: 0;
  border-bottom: 1px solid #edf2f7;
  color: inherit;
  background: transparent;
  text-align: left;
}
.customer-list-row:hover,
.customer-list-row.is-active { background: #f0f7ff; }
.customer-list-row.is-active { box-shadow: inset 3px 0 #1885df; }
.customer-list-row.is-disabled { opacity: 0.62; }
.customer-list-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: #176db8;
  background: #e6f3ff;
  font-weight: 900;
}
.customer-list-copy { display: grid; gap: 3px; min-width: 0; }
.customer-list-copy b,
.customer-list-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.customer-list-copy b { font-size: 12px; }
.customer-list-copy small { color: #71869c; font-size: 10px; }
.customer-list-state { color: #248565; font-size: 9px; font-weight: 850; }
.customer-list-row.is-disabled .customer-list-state { color: #a0626a; }

.customer-detail-card { min-height: 670px; overflow: hidden; }
.customer-detail-empty {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 670px;
  padding: 40px;
  text-align: center;
}
.customer-detail-empty > span {
  display: grid;
  place-items: center;
  width: 50px;
  height: 50px;
  border-radius: 15px;
  color: #177bce;
  background: #e9f5ff;
  font-size: 24px;
}
.customer-detail-empty h2 { margin: 16px 0 6px; }
.customer-detail-empty p { margin: 0; color: #72879b; }

.customer-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px;
  border-bottom: 1px solid #dfe9f2;
  background: linear-gradient(100deg, #fff, #f1f8ff);
}
.customer-detail-head h2 { margin: 6px 0; font-size: 26px; }
.customer-detail-head p { margin: 0; color: #6a8096; font-size: 11px; }
.customer-detail-head p i { padding: 0 5px; font-style: normal; }
.customer-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.customer-detail-actions .is-danger { color: #ac3d4d; border-color: #edc5cc; background: #fff7f8; }

.customer-edit-section,
.customer-shipments-section { padding: 24px 26px; }
.customer-shipments-section { border-top: 1px solid #e1eaf3; }
.customer-edit-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 11px;
  margin-top: 18px;
}
.customer-edit-form .customer-access-primary { padding: 0 18px; }
.customer-code-meta {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 11px 13px;
  border-radius: 9px;
  color: #607890;
  background: #f4f8fc;
  font-size: 10px;
}
.customer-code-meta b { color: #18466f; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .08em; }
.customer-code-meta small { text-align: right; }

.customer-bind-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 10px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #dbe7f1;
  border-radius: 6px;
  background: #f8fbfe;
}
.customer-bind-mode {
  display: flex;
  grid-column: 1 / -1;
  gap: 4px;
  width: fit-content;
  padding: 3px;
  border: 1px solid #d7e3ee;
  border-radius: 5px;
  background: #fff;
}
.customer-bind-mode button {
  min-height: 32px;
  padding: 6px 10px;
  border: 0;
  border-radius: 3px;
  color: #6c8196;
  background: transparent;
  font-size: 10px;
  font-weight: 800;
}
.customer-bind-mode button.is-active { color: #126dbd; background: #eaf5ff; }
.customer-bind-wide { grid-column: span 3; }
.customer-bind-form .customer-access-primary { padding: 0 18px; }

.customer-field-hint,
.customer-reference-hint {
  margin: 0;
  color: #6f8296;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.55;
}

.customer-reference-hint {
  grid-column: 1 / -2;
  padding: 2px 2px 0;
}

.customer-shipment-table {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  border: 0;
  border-radius: 0;
}
.customer-shipment-table-head,
.customer-shipment-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.35fr) minmax(130px, .8fr) minmax(110px, .65fr) 80px;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
}
.customer-shipment-table-head {
  border: 1px solid #dce7f1;
  color: #75889b;
  background: #f3f7fb;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.customer-shipment-row {
  border: 1px solid #dce7f1;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(28, 66, 103, 0.035);
  font-size: 10px;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.customer-shipment-row:hover {
  border-color: #a9cbe8;
  box-shadow: 0 8px 20px rgba(28, 86, 138, 0.08);
  transform: translateY(-1px);
}
.customer-shipment-table > .customer-access-empty {
  border: 1px solid #dce7f1;
  border-radius: 4px;
  background: #fff;
}
.customer-shipment-row > span:first-child { display: grid; gap: 3px; }
.customer-shipment-row b { font-size: 11px; }
.customer-shipment-row small { color: #72869a; }
.customer-shipment-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: #31bd8d;
}

.customer-access-empty { padding: 24px; color: #8193a6; text-align: center; }
button:disabled { cursor: wait; opacity: .58; }

.customer-code-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(6, 28, 49, 0.58);
  backdrop-filter: blur(8px);
}
.customer-code-dialog {
  display: grid;
  gap: 13px;
  width: min(520px, 100%);
  padding: 30px;
  border: 1px solid rgba(173, 205, 232, 0.55);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 30px 90px rgba(4, 29, 55, .3);
}
.customer-code-dialog h2 { margin: 0; font-size: 26px; }
.customer-code-dialog p,
.customer-code-dialog > small { margin: 0; color: #6b8095; line-height: 1.6; }
.customer-code-dialog code {
  display: block;
  padding: 18px;
  border: 1px dashed #8ec2ec;
  border-radius: 12px;
  color: #0e5fa7;
  background: #eff8ff;
  font-size: clamp(18px, 3vw, 26px);
  font-weight: 850;
  letter-spacing: .08em;
  text-align: center;
  overflow-wrap: anywhere;
}
.customer-code-dialog > div { display: flex; gap: 10px; margin-top: 4px; }
.customer-code-dialog > div button { flex: 1; }

@media (max-width: 1100px) {
  .customer-access-layout { grid-template-columns: 1fr; }
  .customer-access-sidebar { grid-template-columns: minmax(280px, .8fr) minmax(320px, 1.2fr); }
}

@media (max-width: 760px) {
  .customer-access-header { padding: 0 16px; }
  .customer-access-user,
  .customer-access-party-pill { display: none; }
  .customer-access-content { width: min(100% - 28px, 1480px); padding-top: 34px; }
  .customer-access-hero { grid-template-columns: 1fr; gap: 20px; }
  .customer-access-sidebar { grid-template-columns: 1fr; }
  .customer-detail-head { align-items: flex-start; flex-direction: column; }
  .customer-edit-form,
  .customer-bind-form { grid-template-columns: 1fr; }
  .customer-bind-wide,
  .customer-bind-mode,
  .customer-reference-hint { grid-column: 1; }
  .customer-shipment-table-head { display: none; }
  .customer-shipment-row { grid-template-columns: 1fr auto; }
  .customer-shipment-row > span:nth-child(2),
  .customer-shipment-row > span:nth-child(3) { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
}
</style>
