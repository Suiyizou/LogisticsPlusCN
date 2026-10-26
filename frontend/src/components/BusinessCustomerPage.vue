<template>
  <main class="customer-access-page" data-i18n-ignore>
    <header class="customer-access-header">
      <RouterLink class="customer-access-brand" :to="roleHomePath">
        <img src="/favicon.svg" alt="" />
        <span>
          <strong>DrewesLogistics</strong>
          <small>{{ t("customers.productLine") }}</small>
        </span>
      </RouterLink>
      <div class="customer-access-header-actions">
        <LanguageSwitcher class="customer-access-language" />
        <span class="customer-access-party-pill">{{ t("customers.internalPartyAgent") }}</span>
        <button type="button" class="system-message-button" @click="emit('open-announcements')">
          <el-icon><Bell /></el-icon>
          <span>{{ t("customers.systemMessages") }}</span>
          <i v-if="announcementCount > 0">{{
            announcementCount > 99 ? "99+" : announcementCount
          }}</i>
        </button>
        <div class="customer-account" :class="{ 'is-open': accountMenuOpen }">
          <button
            type="button"
            class="customer-account-trigger"
            @click="accountMenuOpen = !accountMenuOpen"
          >
            <span
              ><b>{{ displayName }}</b
              ><small>{{
                isManager ? t("customers.businessOperator") : t("customers.overseaAgentEmployee")
              }}</small></span
            >
            <i aria-hidden="true">&#x2304;</i>
          </button>
          <div v-if="accountMenuOpen" class="customer-account-menu">
            <RouterLink v-if="isManager" to="/workbenches" @click="accountMenuOpen = false">{{
              t("customers.backWorkbench")
            }}</RouterLink>
            <button type="button" @click="emit('logout')">{{ t("customers.logout") }}</button>
          </div>
        </div>
      </div>
    </header>

    <p
      v-if="pageMessage"
      class="customer-access-message"
      :class="{ 'is-error': messageIsError }"
      role="status"
    >
      {{ pageMessage }}
    </p>

    <div
      v-if="refreshingShipment"
      class="shipment-updating-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="t('customers.updateTrackingTitle')"
    >
      <div class="shipment-updating-spinner" aria-hidden="true"></div>
      <p>{{ refreshTrackingStatus || t("customers.updatingTracking") }}</p>
      <button
        v-if="refreshAbortController"
        type="button"
        class="shipment-updating-cancel"
        @click="cancelRefreshShipment"
      >
        {{ t("customers.cancel") }}
      </button>
    </div>

    <div
      v-if="refreshTrackingResponse"
      class="shipment-response-toast"
      :class="{ 'is-error': !refreshTrackingResponse.ok, 'is-success': refreshTrackingResponse.ok }"
      role="status"
    >
      <button
        type="button"
        class="shipment-response-close"
        @click="refreshTrackingResponse = null"
        aria-label="Close"
      >
        ×
      </button>
      <div class="shipment-response-title">
        {{
          refreshTrackingResponse.ok
            ? t("customers.updateTrackingSuccessToast")
            : t("customers.updateTrackingErrorToast")
        }}
      </div>
      <div class="shipment-response-body">
        <div>
          <span>{{ t("customers.updateTrackingStatusCode") }}</span
          ><b>{{ refreshTrackingResponse.status }}</b>
        </div>
        <div>
          <span>{{ t("customers.updateTrackingResponseCode") }}</span
          ><b>{{ refreshTrackingResponse.code }}</b>
        </div>
        <div>
          <span>{{ t("customers.updateTrackingResponseMessage") }}</span
          ><b>{{ refreshTrackingResponse.message }}</b>
        </div>
        <div>
          <span>{{ t("customers.updateTrackingNumber") }}</span
          ><b
            >{{ refreshTrackingResponse.carrier }} /
            {{ referenceTypeLabel(refreshTrackingResponse.type) }} /
            {{ refreshTrackingResponse.number }}</b
          >
        </div>
        <div v-if="!refreshTrackingResponse.hasDetails">
          <span>{{ t("customers.updateTrackingNoDetails") }}</span
          ><b>{{ t("customers.updateTrackingNumberInvalidOrEmpty") }}</b>
        </div>
      </div>
    </div>

    <section class="workspace-layout">
      <aside class="workspace-sidebar">
        <nav class="sidebar-nav">
          <button
            v-for="section in businessNavigation.sections.value"
            :key="section.id"
            :class="{ active: menuItem === section.id }"
            @click="navigateTo(section.id)"
          >
            <el-icon><component :is="businessNavigationIcons[section.icon]" /></el-icon>
            <span>{{ t(section.labelKey) }}</span>
          </button>
        </nav>
        <button type="button" class="sidebar-profile-card" @click="openPersonalProfile">
          <span class="sidebar-profile-avatar">{{ displayName.slice(0, 1).toUpperCase() }}</span>
          <span class="sidebar-profile-copy">
            <b>{{ displayName }}</b>
            <small>{{ personalRoleLabel }}</small>
          </span>
          <el-icon><ArrowRight /></el-icon>
        </button>
      </aside>

      <div class="workspace-main">
        <RouterView />
      </div>
    </section>

    <CustomerDialogs v-if="isManager" />
    <AgentDialogs v-if="isManager" />
    <HandoverDialogs />

    <ManualShipmentCreateDialog :workflow="manualShipmentDialogWorkflow" />
    <ManualShipmentImportDialog :workflow="manualShipmentDialogWorkflow" />

    <PersonalProfileDialog :workflow="personalProfile" :current-user="currentUser" :t="t" />

    <div v-if="toastMessage" class="customer-toast" role="status">{{ toastMessage }}</div>
  </main>
</template>

<script setup>
import { createWorkspacePresentation } from "../features/presentation/createWorkspacePresentation.js";
import { trackingWorkspaceLink } from "../features/navigation/trackingWorkspaceLink.js";
import { useWorkspaceFeedback } from "../features/shared/useWorkspaceFeedback.js";
import { useShipmentOperations } from "../modules/workspace/useShipmentOperations.js";
import { useCustomerOperations } from "../modules/workspace/useCustomerOperations.js";
import {
  hasRefreshIssue,
  shipmentBusinessState,
  preferredTrackingReference,
  needsManualSupplement,
  shipmentClientLabel,
  shipmentBoundUsers as resolveShipmentBoundUsers,
  primaryBoundCustomerName as resolvePrimaryBoundCustomerName
} from "../features/shipments/shipmentPresentation.js";
import CustomerDialogs from "../modules/customers/components/CustomerDialogs.vue";
import AgentDialogs from "../modules/agents/components/AgentDialogs.vue";
import HandoverDialogs from "../modules/handover/components/HandoverDialogs.vue";
import { createShipmentModulePages } from "../modules/shipments/index.js";
import { useShipmentCustomerBindings } from "../modules/shipments/index.js";

import { useCustomerShipmentAccess } from "../modules/customers/index.js";
import { useBusinessCommands } from "../modules/businessCommands.js";
import { provideBusinessCommands } from "../modules/businessCommandContext.js";
import { configuredBusinessModules } from "../modules/configuredRegistry.js";

import ManualShipmentCreateDialog from "../features/shipments/ManualShipmentCreateDialog.vue";
import ManualShipmentImportDialog from "../features/shipments/ManualShipmentImportDialog.vue";

import { usePersonalProfile } from "../features/account/usePersonalProfile.js";
import PersonalProfileDialog from "../features/account/PersonalProfileDialog.vue";

import { useTablePageTransition } from "../features/tables/useTablePageTransition.js";

import { RouterView, useRoute, useRouter } from "vue-router";
import { createAgentModulePages } from "../modules/agents/index.js";
import { createHandoverModulePages } from "../modules/handover/index.js";
import { createCustomerModulePages } from "../modules/customers/index.js";
import { provideModulePages } from "../modules/moduleContext.js";
import { useBusinessNavigation } from "../features/navigation/useBusinessNavigation.js";
import { defaultBusinessSection } from "../features/navigation/businessNavigation.js";

import { useReducedMotion } from "../composables/useReducedMotion.js";

import { requestBusinessTracking } from "../services/businessTrackingTransport.js";

import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessageBox } from "element-plus";
import "element-plus/es/components/message-box/style/css";

import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale } from "../i18n";
import {
  batchUpdateBusinessShipmentFields,
  batchBindBusinessCustomerShipments,
  batchCreateOverseaAgentEmployees,
  batchDeleteBusinessShipments,
  bindBusinessCustomerShipment,
  batchCreateBusinessCustomers,
  cancelShipmentBatchTask,
  createBusinessCustomer,
  createOverseaAgentEmployee,
  createBusinessShipment,
  createShipmentBatchRefreshTask,
  createShipmentBatchTask,
  createShipmentRefreshAllTask,
  deleteBusinessCustomer,
  deleteOverseaAgent,
  deleteBusinessShipment,
  fetchAvailableBusinessShipments,
  fetchBusinessHandoverAgents,
  fetchBusinessHandoverRequests,
  fetchBusinessCustomers,
  fetchBusinessCustomerShipments,
  fetchBusinessShipmentSnapshot,
  fetchCustomerTransferAgents,
  fetchOverseaAgentLinkedCustomers,
  fetchShipmentBatchTask,
  handoverBusinessCustomers,
  invalidateBusinessShipmentSnapshot,
  inspectBusinessShipmentImportConflicts,
  resetBusinessCustomerPassword,
  resetOverseaAgentPassword,
  setBusinessShipmentPublication,
  transferBusinessCustomers,
  unbindBusinessCustomerShipment,
  updateBusinessCustomer,
  updateOverseaAgent,
  updateOverseaAgentLinkedCustomers,
  updateBusinessShipment,
  updateBusinessShipmentManualSnapshot
} from "../services/businessCustomerApi";

import { changeOwnPassword, updateOwnProfile } from "../services/adminApi";
import { saveStoredUser } from "../services/authSession";
import { markApiErrorHandled } from "../services/apiClient";
import {
  User,
  Document,
  UserFilled,
  Operation,
  DataBoard,
  ArrowRight,
  Bell
} from "@element-plus/icons-vue";

const props = defineProps({
  currentUser: { type: Object, default: null },
  announcementCount: { type: Number, default: 0 }
});
const emit = defineEmits(["logout", "user-updated", "open-announcements"]);
const { t } = useI18n();
const {
  pageMessage,
  messageIsError,
  toastMessage,
  clearMessage,
  showInfo,
  showSuccess,
  showError
} = useWorkspaceFeedback({ t, markApiErrorHandled });
const isManager = computed(() => ["BUSINESS", "ADMIN"].includes(props.currentUser?.role));
const isOverseaAgent = computed(() => props.currentUser?.role === "OVERSEA_AGENT");
const canRequestBusinessHandover = computed(() => props.currentUser?.role === "BUSINESS");
const roleHomePath = computed(() => (isOverseaAgent.value ? "/customers" : "/workbenches"));
let xlsxModulePromise;

function loadXlsxModule() {
  if (!xlsxModulePromise) xlsxModulePromise = import("xlsx");
  return xlsxModulePromise;
}

function waitForNextPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

const accountMenuOpen = ref(false);
const personalProfile = usePersonalProfile({
  currentUser: () => props.currentUser,
  updateOwnProfile,
  changeOwnPassword,
  saveStoredUser,
  onUserUpdated: (user) => emit("user-updated", user),
  showSuccess,
  t
});
const { openPersonalProfile } = personalProfile;

const prefersReducedMotion = useReducedMotion();

const menuItem = ref(defaultBusinessSection(props.currentUser?.role));
const subView = ref("list");

const selectedShipmentId = ref("");

const { tablePageTransitioning, runTablePageTransition } = useTablePageTransition({
  reducedMotion: prefersReducedMotion
});
const customerOperations = useCustomerOperations({
  permissions: { canManage: isManager, isOverseaAgent, canRequestBusinessHandover },
  feedback: { t, clearMessage, showSuccess, showError, markApiErrorHandled },
  refreshShipments: () => loadAvailableShipments(),
  loadXlsxModule,
  waitForNextPaint,
  runTablePageTransition,
  services: {
    fetchBusinessCustomers,
    fetchBusinessCustomerShipments,
    fetchOverseaAgentLinkedCustomers,
    updateOverseaAgentLinkedCustomers,
    createBusinessCustomer,
    updateBusinessCustomer,
    deleteBusinessCustomer,
    resetBusinessCustomerPassword,
    fetchCustomerTransferAgents,
    createOverseaAgentEmployee,
    batchCreateOverseaAgentEmployees,
    updateOverseaAgent,
    resetOverseaAgentPassword,
    deleteOverseaAgent,
    batchCreateBusinessCustomers,
    fetchBusinessHandoverAgents,
    fetchBusinessHandoverRequests,
    handoverBusinessCustomers,
    transferBusinessCustomers
  }
});
const customerWorkspace = customerOperations.workspace;

const customerDirectory = customerWorkspace.directory;
const {
  customers,
  customersLoaded,
  selectedCustomerId,
  shipments,
  assignableCustomers,
  loadCustomers,
  selectCustomer
} = customerDirectory;
const {
  formatDateTime,
  formatDate,
  customerFilterOptionLabel,
  selectedCustomerOptionLabel,
  partyRoleLabel,
  boundUserLabel,
  shipmentBusinessStateLabel,
  shipmentBusinessStateTagType,
  refreshOutcomeTooltip,
  getCustomerName,
  getCustomerUsername,
  isCustomerBoundToSelectedShipment,
  primaryBoundCustomerName,
  shipmentBoundUsers,
  boundRoleSummary,
  customerInitial,
  statusLabel,
  referenceTypeLabel
} = createWorkspacePresentation({
  t,
  getLocale: () => currentLocale.value,
  readDirectory: () => ({
    customers: customers.value,
    assignableCustomers: assignableCustomers.value,
    shipmentCustomerMap: shipmentOperations.list.shipmentCustomerMap.value
  }),
  getBoundCustomerIds: () => boundCustomersForSelectedShipment.value
});
const shipmentOperations = useShipmentOperations({
  directory: customerDirectory,
  context: {
    canManage: isManager,
    currentUser: () => props.currentUser,
    selectedShipmentId,
    menuItem,
    subView
  },
  feedback: { t, showSuccess, showError, showInfo, markApiErrorHandled },
  formatters: {
    customerFilterOptionLabel,
    primaryBoundCustomerName,
    preferredTrackingReference,
    formatDateTime
  },
  navigation: { navigateTo },
  adapters: {
    loadXlsxModule,
    waitForNextPaint,
    runTablePageTransition,
    confirmEntry: (...args) => ElMessageBox.confirm(...args)
  },
  services: {
    fetchAvailableBusinessShipments,
    createBusinessShipment,
    inspectBusinessShipmentImportConflicts,
    fetchBusinessShipmentSnapshot,
    updateBusinessShipment,
    updateBusinessShipmentManualSnapshot,
    invalidateBusinessShipmentSnapshot,
    deleteBusinessShipment,
    requestTracking: requestBusinessTracking,
    createShipmentBatchTask,
    createShipmentRefreshAllTask,
    createShipmentBatchRefreshTask,
    fetchShipmentBatchTask,
    cancelShipmentBatchTask,
    batchDeleteBusinessShipments,
    batchUpdateBusinessShipmentFields
  }
});
const {
  availableShipments,
  shipmentsLoaded,
  shipmentTotal,
  shipmentCustomerMap,
  loadAvailableShipments
} = shipmentOperations.list;

const agentManagement = customerOperations.agents;
const { transferAgentsLoaded, transferAgents, loadTransferAgents } = agentManagement;

const { handoverAgentsLoaded, loadBusinessHandoverAgents, loadBusinessHandoverRequests } =
  customerOperations.handover;
const displayName = computed(
  () =>
    props.currentUser?.displayName || props.currentUser?.username || t("customers.businessOperator")
);
const personalRoleLabel = computed(() =>
  t(
    {
      ADMIN: "portal.roleAdmin",
      BUSINESS: "portal.roleBusiness",
      OVERSEA_AGENT: "portal.roleOverseaAgent"
    }[props.currentUser?.role] || "portal.roleEmployee"
  )
);

const manualShipmentEntry = shipmentOperations.entry;
const { openShipmentCreateDialog, openShipmentExcelImport } = manualShipmentEntry;
const manualShipmentDialogWorkflow = reactive({
  ...manualShipmentEntry,
  assignableCustomers,
  customerFilterOptionLabel,
  selectedCustomerOptionLabel
});

const {
  refreshingShipment,
  refreshAbortController,
  refreshTrackingStatus,
  refreshTrackingResponse,
  cancelRefreshShipment
} = shipmentOperations.detail;
const { restoreBatchTrackTask, toggleBatchTrackPanel } = shipmentOperations.batch;

const businessNavigationIcons = { DataBoard, User, Operation, Document, UserFilled };
const businessNavigation = useBusinessNavigation({
  modules: configuredBusinessModules,
  role: computed(() => props.currentUser?.role),
  route: useRoute(),
  router: useRouter(),
  menuItem,
  subView,
  selectedShipmentId,
  selectedCustomerId,
  loadSection: loadMenuData,
  onLoadError: (error) => showError(error, "customers.loadFailed")
});

const businessCommands = useBusinessCommands({
  navigation: businessNavigation,
  refreshCustomers: () => loadCustomers("", { selectFirst: false }),
  refreshShipments: loadAvailableShipments
});
provideBusinessCommands(businessCommands);
const customerShipmentAccess = useCustomerShipmentAccess({
  directory: customerDirectory,
  availableShipments,
  canManage: isManager,
  services: {
    bind: bindBusinessCustomerShipment,
    batchBind: batchBindBusinessCustomerShipments,
    unbind: unbindBusinessCustomerShipment,
    publish: setBusinessShipmentPublication
  },
  commands: businessCommands,
  clearMessage,
  showSuccess,
  showError,
  t
});

const {
  selectedCustomerIds,
  batchBinding,
  batchBindingProgress,
  boundCustomersForSelectedShipment,
  batchBindCustomers,
  unbindCustomerFromShipment
} = useShipmentCustomerBindings({
  selectedShipmentId,
  shipmentCustomerMap,
  canManage: isManager,
  services: { bind: bindBusinessCustomerShipment, unbind: unbindBusinessCustomerShipment },
  commands: businessCommands,
  t,
  showSuccess,
  showError
});

// Explicit page contract; shared workflow survives list/detail navigation.
const shipmentModulePages = createShipmentModulePages({
  operations: shipmentOperations,
  directory: customerDirectory,
  view: subView,
  permissions: { isManager, isOverseaAgent },
  bindings: {
    selectedCustomerIds,
    batchBinding,
    batchBindingProgress,
    boundCustomersForSelectedShipment,
    batchBindCustomers,
    unbindCustomerFromShipment
  },
  ui: { tablePageTransitioning },
  actions: { trackShipmentInWorkspace, editShipment, navigateTo, openTrackingWorkspace },
  formatters: {
    customerFilterOptionLabel,
    referenceTypeLabel,
    shipmentClientLabel,
    shipmentBoundUsers,
    boundUserLabel,
    hasRefreshIssue,
    refreshOutcomeTooltip,
    shipmentBusinessStateTagType,
    shipmentBusinessStateLabel,
    formatDateTime,
    selectedCustomerOptionLabel,
    getCustomerName,
    getCustomerUsername,
    isCustomerBoundToSelectedShipment,
    partyRoleLabel
  }
});

watch(availableShipments, (list) => {
  if (!list || !selectedShipmentId.value) return;
  // A paginated or filtered list is not proof that a detail ticket no longer exists.
  if (menuItem.value === "shipments" && subView.value === "detail") return;
  const stillExists = list.some((s) => s.shipmentId === selectedShipmentId.value);
  if (!stillExists) {
    selectedShipmentId.value = "";
    selectedCustomerIds.value = [];
  }
});

provideModulePages({
  overview: {
    readFallback: () => ({
      shipments: [...availableShipments.value],
      shipmentTotal: shipmentTotal.value,
      customers: [...customers.value],
      agents: [...transferAgents.value]
    })
  },
  agents: createAgentModulePages({
    operations: customerOperations,
    formatters: { statusLabel },
    ui: { tablePageTransitioning }
  }),
  handover: createHandoverModulePages({
    operations: customerOperations,
    permissions: { canRequestBusinessHandover, isOverseaAgent },
    formatters: { customerFilterOptionLabel, formatDateTime, statusLabel }
  }),
  customers: createCustomerModulePages({
    operations: customerOperations,
    shipmentOperations,
    bindings: customerShipmentAccess,
    view: subView,
    permissions: { isManager },
    ui: { tablePageTransitioning },
    actions: { selectCustomerFromList, navigateTo, openShipmentDetail, openShipmentSupplement },
    formatters: {
      customerInitial,
      formatDateTime,
      partyRoleLabel,
      statusLabel,
      boundRoleSummary,
      formatDate,
      needsManualSupplement,
      referenceTypeLabel
    }
  }),
  shipments: shipmentModulePages
});

onMounted(() => {
  businessNavigation.initialize();
  void restoreBatchTrackTask();
});
function navigateTo(item) {
  if (item === "batch-tracking") {
    if (businessNavigation.navigate("shipments")) toggleBatchTrackPanel();
    return;
  }
  businessNavigation.navigate(item);
}

async function loadMenuData(item, preferredCustomerId = "", { isCurrent = () => true } = {}) {
  if (item === "overview") return; // The overview route owns its read lifecycle.
  if (item === "customers") {
    if (!customersLoaded.value) {
      await loadCustomers(preferredCustomerId, {
        selectFirst: Boolean(preferredCustomerId),
        isCurrent
      });
    } else if (preferredCustomerId) {
      if (customers.value.some((customer) => customer.id === preferredCustomerId)) {
        await selectCustomer(preferredCustomerId);
      } else {
        selectedCustomerId.value = "";
      }
    }
    return;
  }
  if (item === "shipments") {
    const jobs = [];
    if (!customersLoaded.value && isManager.value) {
      jobs.push(loadCustomers("", { selectFirst: false, isCurrent }));
    }
    if (!shipmentsLoaded.value) jobs.push(loadAvailableShipments());
    await Promise.all(jobs);
    return;
  }
  if (item === "agents" && !transferAgentsLoaded.value) {
    await loadTransferAgents();
    return;
  }
  if (item === "handover") {
    const jobs = [];
    if (isOverseaAgent.value) {
      if (!transferAgentsLoaded.value) jobs.push(loadTransferAgents());
    } else if (!handoverAgentsLoaded.value) {
      jobs.push(loadBusinessHandoverAgents());
    }
    if (canRequestBusinessHandover.value) jobs.push(loadBusinessHandoverRequests());
    if (isManager.value && !customersLoaded.value) {
      jobs.push(loadCustomers("", { selectFirst: false, isCurrent }));
    } else if (isOverseaAgent.value && !customersLoaded.value) {
      jobs.push(loadCustomers("", { selectFirst: false, isCurrent }));
    }
    await Promise.all(jobs);
  }
}

function selectCustomerFromList(row) {
  businessCommands.openCustomer(row.id);
}

function openShipmentDetail(shipment) {
  navigateToShipmentDetail(shipment);
}

function editShipment(row) {
  navigateToShipmentDetail(row);
}

function navigateToShipmentDetail(row) {
  businessCommands.openShipment(row?.shipmentId);
}

function trackShipmentInWorkspace(shipment) {
  openTrackingWorkspace(shipment);
}

function openTrackingWorkspace(shipment = null) {
  const returnTo = businessNavigation.trackingReturnTo();
  if (returnTo) window.location.assign(trackingWorkspaceLink({ returnTo, shipment }));
}

function openShipmentSupplement(shipment) {
  navigateToShipmentDetail(shipment);
}
</script>

<style scoped src="../modules/shared/styles/workspaceControls.css"></style>
<style scoped>
.customer-access-page {
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #1a2d42;
  background: #f0f3f7;
}
.customer-access-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 clamp(24px, 3vw, 48px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #0f1d2e;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}
.customer-access-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e8edf3;
  text-decoration: none;
}
.customer-access-brand img {
  width: 34px;
  height: 34px;
}
.customer-access-brand span {
  display: grid;
  gap: 1px;
}
.customer-access-brand strong {
  font-size: 16px;
  color: #fff;
}
.customer-access-brand small {
  color: #8899b0;
  font-size: 10px;
}
.customer-access-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.customer-access-party-pill {
  padding: 5px 10px;
  border: 1px solid rgba(100, 150, 210, 0.35);
  border-radius: 999px;
  color: #a0c4e8;
  background: rgba(255, 255, 255, 0.06);
  font-size: 10px;
  font-weight: 750;
}
.customer-access-message {
  margin: 0;
  padding: 10px 16px;
  border-bottom: 1px solid #d4e2f0;
  color: #1b5e3f;
  background: #eafaf1;
  font-size: 13px;
  text-align: center;
}
.customer-access-message.is-error {
  border-color: #f0c4cc;
  color: #a63142;
  background: #fff3f5;
}
.shipment-updating-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(2px);
}
.shipment-updating-overlay p {
  margin: 0;
  color: #1a2b4a;
  font-size: 15px;
  font-weight: 500;
}
.shipment-updating-cancel {
  margin-top: 8px;
  padding: 8px 18px;
  border: 1px solid #c9d6e8;
  border-radius: 8px;
  background: #ffffff;
  color: #3a4d65;
  font-size: 13px;
  cursor: pointer;
}
.shipment-updating-cancel:hover {
  background: #f3f6fa;
}
.shipment-response-toast {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 2001;
  width: 360px;
  padding: 16px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 8px 30px rgba(15, 29, 46, 0.14);
  border-left: 4px solid #2563eb;
}
.shipment-response-toast.is-error {
  border-left-color: #dc2626;
}
.shipment-response-toast.is-success {
  border-left-color: #16a34a;
}
.shipment-response-close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: none;
  background: transparent;
  color: #8a9bb0;
  font-size: 18px;
  cursor: pointer;
}
.shipment-response-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #0f1d2e;
}
.shipment-response-body > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 12px;
  border-bottom: 1px solid #eef2f7;
}
.shipment-response-body > div:last-child {
  border-bottom: none;
}
.shipment-response-body span {
  color: #6a8096;
}
.shipment-response-body b {
  font-weight: 600;
  color: #1a2d42;
  text-align: right;
  word-break: break-word;
  max-width: 60%;
}
.shipment-updating-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e6f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: shipment-updating-spin 0.8s linear infinite;
}
@keyframes shipment-updating-spin {
  to {
    transform: rotate(360deg);
  }
}
.customer-account {
  position: relative;
}
.customer-account-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 140px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #dce4ef;
  background: rgba(255, 255, 255, 0.05);
  text-align: left;
  cursor: pointer;
}
.customer-account-trigger:hover,
.customer-account.is-open .customer-account-trigger {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.customer-account-trigger span {
  display: grid;
  flex: 1;
  gap: 1px;
}
.customer-account-trigger b {
  font-size: 12px;
  color: #fff;
}
.customer-account-trigger small {
  color: #8a9cb5;
  font-size: 10px;
}
.customer-account-trigger i {
  color: #7a90ae;
  font-style: normal;
  font-size: 14px;
}
.customer-account-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  display: grid;
  min-width: 168px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: #152a40;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}
.customer-account-menu a,
.customer-account-menu button {
  padding: 9px 12px;
  border: 0;
  border-radius: 6px;
  color: #c8d6e5;
  background: transparent;
  text-align: left;
  text-decoration: none;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
.customer-account-menu a:hover,
.customer-account-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.system-message-button {
  position: relative;
  display: inline-flex;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #d7e7f5;
  background: rgba(255, 255, 255, 0.06);
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
}
.system-message-button:hover {
  border-color: rgba(114, 207, 255, 0.45);
  background: rgba(91, 174, 226, 0.14);
  transform: translateY(-1px);
}
.system-message-button > i {
  display: inline-grid;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  color: #fff;
  background: #ef596f;
  box-shadow: 0 0 0 3px rgba(239, 89, 111, 0.14);
  place-items: center;
  font-size: 9px;
  font-style: normal;
}
.workspace-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.workspace-sidebar {
  width: 180px;
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f5f7fa 0%, #eceff4 100%);
  border-right: 1px solid #dce1e8;
  overflow: hidden;
  padding: 12px 0;
}
.sidebar-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
  overflow-y: auto;
}
.sidebar-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  color: #5a6d80;
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  text-align: left;
}
.sidebar-nav button:hover {
  color: #1e40af;
  background: #e0e7ff;
}
.sidebar-nav button.active {
  color: #1e40af;
  background: #e0e7ff;
  font-weight: 800;
}
.sidebar-profile-card {
  display: grid;
  width: calc(100% - 16px);
  min-width: 0;
  margin: auto 8px 0;
  padding: 10px;
  border: 1px solid #d4deea;
  border-radius: 11px;
  color: #25415d;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 10px 24px rgba(38, 70, 102, 0.08);
  grid-template-columns: 34px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}
.sidebar-profile-card:hover {
  border-color: #9cc4e7;
  box-shadow: 0 14px 30px rgba(38, 100, 154, 0.13);
  transform: translateY(-2px);
}
.sidebar-profile-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(135deg, #226fb5, #55b9d0);
  box-shadow: 0 7px 16px rgba(34, 111, 181, 0.22);
  place-items: center;
  font-size: 13px;
  font-weight: 850;
}
.sidebar-profile-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.sidebar-profile-copy b,
.sidebar-profile-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-profile-copy b {
  font-size: 11px;
}
.sidebar-profile-copy small {
  color: #7d91a5;
  font-size: 9px;
}
.sidebar-profile-card > .el-icon {
  color: #8aa1b8;
  font-size: 12px;
}
.workspace-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px 30px;
  background: #f0f3f7;
}
/* Vue applies the host scope to routed module roots; keep their shared gutter here. */
.workspace-view {
  padding-inline: 2px;
}

:global(.shipment-overwrite-danger-button) {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

:global(.shipment-overwrite-danger-button:hover),
:global(.shipment-overwrite-danger-button:focus-visible) {
  color: #fff;
  border-color: var(--el-color-danger);
  background: var(--el-color-danger);
}
.customer-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  z-index: 200;
  transform: translateX(-50%);
  padding: 10px 18px;
  border: 1px solid #a9dfca;
  border-radius: 8px;
  color: #146a4c;
  background: #effbf6;
  box-shadow: 0 12px 32px rgba(18, 94, 68, 0.14);
  font-weight: 750;
  font-size: 13px;
}
button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.workspace-sidebar ::-webkit-scrollbar,
.workspace-main ::-webkit-scrollbar {
  width: 5px;
}
.workspace-sidebar ::-webkit-scrollbar-track {
  background: transparent;
}
.workspace-sidebar ::-webkit-scrollbar-thumb {
  background: #c5d0dc;
  border-radius: 4px;
}
.workspace-main ::-webkit-scrollbar-track {
  background: #e8edf3;
}
.workspace-main ::-webkit-scrollbar-thumb {
  background: #c5d0dc;
  border-radius: 4px;
}
@media (max-width: 900px) {
  .workspace-sidebar {
    width: 160px;
    flex: 0 0 160px;
  }
  .workspace-main {
    padding: 18px 16px 22px;
  }
}
@media (max-width: 680px) {
  .workspace-view {
    padding-inline: 0;
  }
  .customer-access-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 12px 10px;
  }
  .customer-access-header-actions {
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    gap: 8px;
  }
  .customer-access-party-pill {
    display: none;
  }
  .customer-access-page {
    height: auto;
    overflow: visible;
  }
  .workspace-layout {
    flex-direction: column;
    overflow: visible;
  }
  .workspace-sidebar {
    width: 100%;
    flex: 0 0 auto;
    max-height: none;
    padding-bottom: 8px;
  }
  .workspace-main {
    padding: 14px 10px 18px;
  }
  .sidebar-nav {
    flex-direction: row;
    padding: 4px 6px;
    overflow-x: auto;
  }
  .sidebar-nav button {
    flex: 1;
    justify-content: center;
    min-height: 36px;
    padding: 6px 8px;
    font-size: 10px;
  }
  .sidebar-profile-card {
    width: calc(100% - 12px);
    margin: 5px 6px 0;
  }
  .system-message-button > span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shipment-updating-spinner {
    animation: none;
  }
  .system-message-button:hover,
  .sidebar-profile-card:hover {
    transform: none;
  }
}
</style>
