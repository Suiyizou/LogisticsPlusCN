<template>
  <AdminLoginPage
    v-if="!currentUser"
    :form="loginForm"
    :busy="loading"
    :message="message"
    :copy="consoleCopy"
    @update-username="loginForm.username = $event"
    @update-password="loginForm.password = $event"
    @submit="adminConsole.handleLogin"
  />
  <section v-else-if="!isAdmin" class="admin-access-denied">
    <h1>{{ consoleCopy.accessDeniedLabel }}</h1>
    <p>{{ consoleCopy.accessDeniedDescription }}</p>
    <RouterLink to="/workbenches">{{ consoleCopy.switchWorkbench }}</RouterLink>
    <button type="button" @click="adminConsole.handleLogout">{{ consoleCopy.logout }}</button>
  </section>
  <AdminConsoleShell
    v-else
    :current-user="currentUser"
    :content-only="contentOnly"
    :display-name="displayAdminName"
    :nav-groups="adminNavGroups"
    :active-page="activeAdminPage"
    :expanded-group="expandedAdminGroup"
    :meta="activePageMeta"
    :busy="loading"
    :message="message"
    :has-error="hasError"
    :announcement-count="props.announcementCount"
    :system-messages="announcementCopy.systemMessages"
    :copy="consoleCopy"
    :transitioning="adminPageTransitioning"
    @select="selectAdminPage"
    @toggle="toggleAdminGroup"
    @refresh="loadDashboard"
    @logout="adminConsole.handleLogout"
    @open-announcements="emit('open-announcements')"
  >
    <component
      :is="activeAdminComponent"
      :key="activeAdminPage"
      v-bind="activeAdminBinding.props"
      v-on="activeAdminBinding.events"
    />
    <AdminAnnouncementDialogs
      ref="announcementDialogsRef"
      :workflow="adminAnnouncements"
      :presentation="announcementPresentation"
      :copy="announcementCopy"
      :busy="loading"
      :today="todayDateString"
    />

    <AdminEmployeeDialogs
      :workflow="adminAccounts"
      :busy="loading"
      :t="accountText"
      :status-text="statusText"
    />

    <AdminFilePreviewDialog :workflow="adminFilePreview" :t="fileText" />
  </AdminConsoleShell>
  <SystemWaitOverlay :visible="initialLoading" :message="t('app.loadingPage')" />
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, unref, watch } from "vue";
import AdminFilePreviewDialog from "../features/admin/AdminFilePreviewDialog.vue";
import { useAdminFiles } from "../features/admin/useAdminFiles.js";
import { useAdminFilePreview } from "../features/admin/useAdminFilePreview.js";
import { createAdminFilePresentation } from "../features/admin/adminFilePresentation.js";
import { adminShipmentFileId } from "../features/admin/adminFileRules.js";
import AdminAnnouncementDialogs from "../features/admin/AdminAnnouncementDialogs.vue";
import { createAnnouncementPresentation } from "../features/admin/announcementPresentation.js";
import { ANNOUNCEMENT_COPY } from "../features/admin/announcementCopy.js";
import { useAdminAnnouncements } from "../features/admin/useAdminAnnouncements.js";
import { useAdminDevices } from "../features/admin/useAdminDevices.js";
import AdminEmployeeDialogs from "../features/admin/AdminEmployeeDialogs.vue";
import { useAdminAccounts } from "../features/admin/useAdminAccounts.js";
import { useAdminLlmSettings } from "../features/admin/useAdminLlmSettings.js";
import { ElMessageBox } from "element-plus";
import "element-plus/es/components/message-box/style/css";
import SystemWaitOverlay from "./SystemWaitOverlay.vue";
import {
  clearAdminToken,
  createAdminAnnouncement,
  createEmployee,
  deleteAdminAnnouncement,
  deletePlatformCustomer,
  deleteAdminShipmentFile,
  deleteDevice,
  deleteEmployee,
  disableAdminAnnouncement,
  downloadAdminWorkspaceFile,
  downloadAdminShipmentFile,
  fetchAdminAnnouncements,
  fetchAdminMe,
  fetchAdminOverview,
  fetchAdminWorkspaceFiles,
  fetchAdminShipmentFileBlob,
  fetchAdminShipmentFiles,
  fetchAuditLog,
  fetchCustomerHandovers,
  fetchDevices,
  fetchEmployees,
  fetchLlmSettings,
  fetchMonitoring,
  fetchPlatformInfo,
  kickDevice,
  loginAdmin,
  publishAdminAnnouncement,
  resetEmployeePassword,
  storedAdminToken,
  uploadAdminAnnouncementImage,
  updateAdminAnnouncement,
  updateEmployee,
  updateLlmSettings
} from "../services/adminApi";
import { fetchAvailableBusinessShipments } from "../services/businessCustomerApi";
import { markApiErrorHandled } from "../services/apiClient";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

import AdminConsoleShell from "../features/admin/AdminConsoleShell.vue";
import AdminLoginPage from "../features/admin/AdminLoginPage.vue";
import { useAdminConsole } from "../features/admin/useAdminConsole.js";
import { useAdminBusinessLists } from "../features/admin/useAdminBusinessLists.js";
import { createAdminBusinessCopy } from "../features/admin/adminBusinessCopy.js";
import { createAdminBusinessPresentation } from "../features/admin/adminBusinessPresentation.js";
import { createAdminConsoleCopy } from "../features/admin/adminConsoleCopy.js";
import { normalizeDisplayName } from "../features/admin/adminDisplayName.js";
import { adminNavigation } from "../features/admin/adminNavigation.js";
import { useRoute, useRouter } from "vue-router";
import { configuredPlatformModules } from "../modules/configuredRegistry.js";
import { platformModuleCatalog } from "../modules/registry.js";
import { workspaceSessionKey } from "../modules/workspaceContext.js";
import { saveSession } from "../services/authSession.js";
import { useReducedMotion } from "../composables/useReducedMotion.js";
import { useTablePageTransition } from "../features/tables/useTablePageTransition.js";
const props = defineProps({
  contentOnly: Boolean,
  currentUser: { type: Object, default: null },
  announcementCount: { type: Number, default: 0 }
});
const emit = defineEmits(["logout", "user-updated", "open-announcements"]);

const initialLoading = ref(false),
  message = ref(""),
  hasError = ref(false);
const currentUser = ref(normalizeDisplayName(props.currentUser));
const isAdmin = computed(
  () =>
    currentUser.value?.role === "ADMIN" &&
    currentUser.value.id != null &&
    currentUser.value.id !== ""
);
const activeAdminPage = ref("overview"),
  expandedAdminGroup = ref("overview");
const { tablePageTransitioning: adminPageTransitioning, runTablePageTransition } =
  useTablePageTransition({ reducedMotion: useReducedMotion() });
const announcementDialogsRef = ref(null);
const announcementPresentation = createAnnouncementPresentation({
  getOrigin: () => window.location.origin
});
const { safeAnnouncementUrl } = announcementPresentation;
const adminFeedback = {
  clear: () => {
    message.value = "";
    hasError.value = false;
  },
  success: showMessage,
  handled: markApiErrorHandled,
  error: async (text, { popup = false } = {}) => {
    if (popup) await showAdminErrorDialog(text);
    else {
      hasError.value = true;
      message.value = text;
    }
  }
};
function accountText(key, params) {
  return key.startsWith("profile.") || key.startsWith("common.") ? ui(key, params) : t(key, params);
}
const adminAccounts = useAdminAccounts({
  currentUser,
  isHostBusy: () =>
    adminConsole.busy.value ||
    adminBusiness.busy.value ||
    adminLlm.busy.value ||
    adminDevices.busy.value ||
    adminAnnouncements.busy.value ||
    adminFiles.busy.value,
  services: {
    fetchEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    resetEmployeePassword
  },
  feedback: adminFeedback,
  t,
  translate: tr,
  confirmDelete: confirmEmployeeDeletion,
  writeClipboard: (text) => navigator.clipboard.writeText(text),
  onUserUpdated: (user) => {
    currentUser.value = normalizeDisplayName(user);
    emit("user-updated", currentUser.value);
  }
});
const adminLlm = useAdminLlmSettings({
  currentUser,
  isHostBusy: () =>
    adminConsole.busy.value ||
    adminBusiness.busy.value ||
    adminAccounts.busy.value ||
    adminDevices.busy.value ||
    adminAnnouncements.busy.value ||
    adminFiles.busy.value,
  services: { fetchLlmSettings, updateLlmSettings },
  feedback: adminFeedback,
  t,
  translate: tr
});
const adminDevices = useAdminDevices({
  currentUser,
  isHostBusy: () =>
    adminConsole.busy.value ||
    adminBusiness.busy.value ||
    adminAccounts.busy.value ||
    adminLlm.busy.value ||
    adminAnnouncements.busy.value ||
    adminFiles.busy.value,
  services: { fetchDevices, kickDevice, deleteDevice },
  feedback: adminFeedback,
  t,
  translate: tr,
  confirmDelete: async (device) =>
    window.confirm(
      t("adminWorkflow.confirmDeleteDevice", {
        device:
          device.deviceName || device.deviceId || device.ipAddress || t("adminWorkflow.webDevice")
      })
    )
});
const adminAnnouncements = useAdminAnnouncements({
  currentUser,
  isHostBusy: () =>
    adminConsole.busy.value ||
    adminBusiness.busy.value ||
    adminAccounts.busy.value ||
    adminLlm.busy.value ||
    adminDevices.busy.value ||
    adminFiles.busy.value,
  services: {
    fetchAnnouncements: fetchAdminAnnouncements,
    createAnnouncement: createAdminAnnouncement,
    updateAnnouncement: updateAdminAnnouncement,
    publishAnnouncement: publishAdminAnnouncement,
    disableAnnouncement: disableAdminAnnouncement,
    deleteAnnouncement: deleteAdminAnnouncement,
    uploadImage: uploadAdminAnnouncementImage
  },
  feedback: adminFeedback,
  t,
  translate: tr,
  copy: () => announcementCopy.value,
  today: todayDateString,
  safeUrl: safeAnnouncementUrl,
  confirmDelete: confirmAnnouncementDeletion,
  editor: {
    opened: () => announcementDialogsRef.value?.opened(),
    cleared: () => announcementDialogsRef.value?.cleared(),
    insertImage: (url, alt) => announcementDialogsRef.value?.insertImage(url, alt)
  }
});
const {
  announcements,
  announcementTotal,
  announcementPage,
  announcementPageSize,
  announcementsLoaded,
  loadAnnouncementPageWithoutLoading,
  loadAnnouncementPage,
  openAnnouncementEditor,
  openAnnouncementPreview,
  handlePublishAnnouncement,
  handleDeactivateAnnouncement,
  handleDeleteAnnouncement
} = adminAnnouncements;
const {
  devices,
  deviceTotal,
  devicePage,
  devicePageSize,
  loadDevicePage,
  handleKickDevice,
  handleDeleteDevice
} = adminDevices;
const fileText = (key, params) =>
  key.startsWith("admin.files.") || key.startsWith("common.") ? ui(key, params) : t(key, params);
const filePresentation = createAdminFilePresentation({ t: fileText, roleText, formatDate });
const adminFilePreview = useAdminFilePreview({
  currentUser,
  fetchBlob: fetchAdminShipmentFileBlob,
  downloadFile: (file) => adminFiles.handleDownloadShipmentFile(file),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  t: fileText,
  handled: markApiErrorHandled
});
const { handlePreviewShipmentFile } = adminFilePreview;
const adminFiles = useAdminFiles({
  currentUser,
  isHostBusy: () =>
    adminConsole.busy.value ||
    adminBusiness.busy.value ||
    adminAccounts.busy.value ||
    adminLlm.busy.value ||
    adminDevices.busy.value ||
    adminAnnouncements.busy.value,
  services: {
    fetchWorkspaceFiles: fetchAdminWorkspaceFiles,
    fetchShipmentFiles: fetchAdminShipmentFiles,
    downloadWorkspaceFile: downloadAdminWorkspaceFile,
    downloadShipmentFile: downloadAdminShipmentFile,
    deleteShipmentFile: deleteAdminShipmentFile
  },
  feedback: adminFeedback,
  t: fileText,
  translate: tr,
  confirmDelete: async (file) =>
    window.confirm(
      ui("admin.files.deleteConfirm", {
        name: file.originalFileName || file.fileName || String(adminShipmentFileId(file))
      })
    ),
  onDeleted: adminFilePreview.closeDeletedFile
});
const {
  adminWorkspaceFiles,
  adminWorkspaceFileTotal,
  adminWorkspaceFilePage,
  adminWorkspaceFilePageSize,
  adminShipmentFiles,
  adminShipmentFileTotal,
  adminShipmentFilePage,
  adminShipmentFilePageSize,
  adminFilesLoaded,
  includeExpiredFiles,
  activeAdminFileSection,
  loadAdminFileListsWithoutLoading,
  loadAdminWorkspaceFiles,
  loadAdminShipmentFiles,
  handleWorkspaceExpiredToggle,
  handleDownloadWorkspaceFile,
  handleDownloadShipmentFile,
  handleDeleteShipmentFile
} = adminFiles;

const businessCopy = createAdminBusinessCopy({ locale: () => currentLocale.value, t, ui });
const businessPresentation = createAdminBusinessPresentation({ copy: businessCopy, formatDate });
const consoleCopyFactory = createAdminConsoleCopy(() => currentLocale.value);
const consoleCopy = computed(() => consoleCopyFactory());
const otherWorkflowsBusy = () =>
  adminAccounts.busy.value ||
  adminLlm.busy.value ||
  adminDevices.busy.value ||
  adminAnnouncements.busy.value ||
  adminFiles.busy.value;
const adminBusiness = useAdminBusinessLists({
  currentUser,
  isHostBusy: () => adminConsole.busy.value || otherWorkflowsBusy(),
  services: {
    fetchPlatformInfo,
    fetchCustomerHandovers,
    fetchAvailableBusinessShipments,
    deletePlatformCustomer
  },
  feedback: adminFeedback,
  t,
  translate: tr,
  copy: businessCopy,
  confirmDelete: async (row) => {
    const copy = businessCopy.platform();
    try {
      await ElMessageBox.confirm(
        copy.confirm.replace(
          "{name}",
          String(row.customerDisplayName || row.customerUsername || row.customerId)
        ),
        copy.delete,
        {
          type: "warning",
          confirmButtonText: copy.delete,
          cancelButtonText: copy.cancel,
          customClass: "admin-destructive-message-box",
          confirmButtonClass: "admin-destructive-message-box__confirm",
          closeOnClickModal: false
        }
      );
      return true;
    } catch {
      return false;
    }
  },
  afterCustomerDeleted: async (isCurrent) => {
    if (!isCurrent()) return;
    const results = await Promise.allSettled([
      adminConsole.loadOverview(),
      adminConsole.loadAudit()
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (isCurrent() && failed?.status === "rejected") throw failed.reason;
  }
});
const {
  platformInfo,
  platformCustomers,
  platformTotal,
  platformPage,
  platformPageSize,
  customerHandovers,
  customerHandoverTotal,
  customerHandoverPage,
  customerHandoverPageSize,
  customerHandoverStatus,
  customerHandoversLoaded,
  adminTickets,
  adminTicketTotal,
  adminTicketPage,
  adminTicketPageSize,
  adminTicketsLoaded
} = adminBusiness;
const adminConsole = useAdminConsole({
  currentUser,
  isHostBusy: () => adminBusiness.busy.value || otherWorkflowsBusy(),
  services: {
    login: (username, password) => loginAdmin(username, password, { persist: false }),
    fetchMe: fetchAdminMe,
    fetchOverview: fetchAdminOverview,
    fetchMonitoring,
    fetchAudit: fetchAuditLog
  },
  feedback: adminFeedback,
  t,
  translate: tr,
  copy: () => consoleCopy.value,
  commitLogin: saveSession,
  clearSession: clearAdminToken,
  updateUser: (user) => {
    currentUser.value = normalizeDisplayName(user);
    if (user) emit("user-updated", currentUser.value);
  },
  loggedOut: () => emit("logout"),
  refreshOther: () => [
    loadEmployeePage(),
    loadDevicePage(),
    loadLlmSettings(),
    adminBusiness.loadPlatformPage(),
    ...(activeAdminPage.value === "files" ? [loadAdminFileListsWithoutLoading()] : []),
    ...(activeAdminPage.value === "announcements" ? [loadAnnouncementPageWithoutLoading()] : []),
    ...(activeAdminPage.value === "tickets" ? [adminBusiness.loadAdminTicketPage()] : []),
    ...(activeAdminPage.value === "handovers" ? [adminBusiness.loadCustomerHandoverPage()] : [])
  ]
});
const {
  loginForm,
  systemOverview,
  monitoring,
  apiAuditRows,
  apiAuditTotal,
  apiAuditPage,
  apiAuditPageSize
} = adminConsole;
const loading = computed(
  () =>
    adminConsole.busy.value ||
    adminBusiness.busy.value ||
    adminAccounts.busy.value ||
    adminLlm.busy.value ||
    adminDevices.busy.value ||
    adminAnnouncements.busy.value ||
    adminFiles.busy.value
);
const {
  employees,
  employeeTotal,
  employeePage,
  employeePageSize,
  loadEmployeePage,
  openEmployeeDialog,
  openResetPasswordDialog,
  toggleEmployee,
  handleDeleteEmployee
} = adminAccounts;
const { loadLlmSettings } = adminLlm;

const announcementCopy = computed(
  () => ANNOUNCEMENT_COPY[currentLocale.value === "en-US" ? "en-US" : "zh-CN"]
);
const navigation = computed(() =>
  adminNavigation(currentLocale.value, t, configuredPlatformModules)
);
const adminPages = computed(() => navigation.value.pages);
const adminNavGroups = computed(() =>
  navigation.value.groups.map((group) => ({
    ...group,
    children: adminPages.value.filter((item) => item.group === group.key)
  }))
);
// Legacy page workflows keep their scope; new registered pages own their runtime.
const adminRoute = useRoute(),
  adminRouter = useRouter();
const adminComponents = Object.fromEntries(
  Object.entries(platformModuleCatalog.views).map(([view, loader]) => [
    view,
    defineAsyncComponent(loader)
  ])
);
const adminPageBindings = {
  overview: () => ({
    props: {
      overview: unref(systemOverview),
      locale: unref(currentLocale),
      busy: unref(loading),
      recentAuditRows: unref(adminConsole.recentAuditRows),
      auditLoading: unref(adminConsole.recentAuditLoading),
      auditLoaded: unref(adminConsole.recentAuditLoaded),
      auditError: unref(adminConsole.recentAuditError)
    },
    events: {
      audit: () => selectAdminPage("audit"),
      retryAudit: () => runAdminRead(adminConsole.loadRecentAudit)
    }
  }),
  audit: () => ({
    props: {
      rows: unref(apiAuditRows),
      total: unref(apiAuditTotal),
      page: unref(apiAuditPage),
      pageSize: unref(apiAuditPageSize),
      busy: unref(loading),
      locale: unref(currentLocale),
      t: unref(t),
      ui: unref(ui),
      roleText: unref(roleText)
    },
    events: {
      refresh: adminConsole.refreshAudit,
      page: adminConsole.changeAuditPage
    }
  }),
  employees: () => ({
    props: {
      rows: unref(pagedEmployees),
      total: unref(employeeTotal),
      page: unref(employeePage),
      pageSize: unref(employeePageSize),
      busy: unref(loading),
      currentUserId: unref(currentUser)?.id,
      t: unref(accountText),
      roleText: unref(roleText),
      partyRoleText: unref(partyRoleText),
      statusText: unref(statusText),
      formatDate: unref(formatDate)
    },
    events: {
      create: () => openEmployeeDialog(),
      refresh: loadDashboard,
      edit: openEmployeeDialog,
      reset: openResetPasswordDialog,
      toggle: toggleEmployee,
      delete: handleDeleteEmployee,
      page: changeEmployeePage
    }
  }),
  platform: () => ({
    props: {
      rows: unref(platformCustomers),
      info: unref(platformInfo),
      total: unref(platformTotal),
      page: unref(platformPage),
      pageSize: unref(platformPageSize),
      busy: unref(loading),
      copy: unref(businessCopy),
      presentation: unref(businessPresentation),
      partyRoleText: unref(partyRoleText),
      statusText: unref(statusText)
    },
    events: {
      refresh: adminBusiness.refreshPlatformPage,
      page: adminBusiness.changePlatformPage,
      delete: adminBusiness.handleDeletePlatformCustomer
    }
  }),
  handovers: () => ({
    props: {
      rows: unref(customerHandovers),
      total: unref(customerHandoverTotal),
      page: unref(customerHandoverPage),
      pageSize: unref(customerHandoverPageSize),
      status: unref(customerHandoverStatus),
      busy: unref(loading),
      copy: unref(businessCopy),
      presentation: unref(businessPresentation)
    },
    events: {
      refresh: adminBusiness.refreshCustomerHandoverPage,
      page: adminBusiness.changeCustomerHandoverPage,
      "page-size": adminBusiness.changeCustomerHandoverPageSize,
      status: adminBusiness.changeCustomerHandoverStatus
    }
  }),
  tickets: () => ({
    props: {
      rows: unref(adminTickets),
      total: unref(adminTicketTotal),
      page: unref(adminTicketPage),
      pageSize: unref(adminTicketPageSize),
      busy: unref(loading),
      copy: unref(businessCopy),
      presentation: unref(businessPresentation)
    },
    events: {
      refresh: adminBusiness.refreshAdminTicketPage,
      page: adminBusiness.changeAdminTicketPage
    }
  }),
  announcements: () => ({
    props: {
      rows: unref(announcements),
      total: unref(announcementTotal),
      page: unref(announcementPage),
      pageSize: unref(announcementPageSize),
      busy: unref(loading),
      copy: unref(announcementCopy),
      presentation: unref(announcementPresentation),
      formatDate: unref(formatDate)
    },
    events: {
      create: () => openAnnouncementEditor(),
      refresh: () => loadAnnouncementPage(),
      preview: openAnnouncementPreview,
      edit: openAnnouncementEditor,
      publish: handlePublishAnnouncement,
      disable: handleDeactivateAnnouncement,
      delete: handleDeleteAnnouncement,
      page: changeAnnouncementPage
    }
  }),
  devices: () => ({
    props: {
      rows: unref(pagedDevices),
      total: unref(deviceTotal),
      page: unref(devicePage),
      pageSize: unref(devicePageSize),
      busy: unref(loading),
      deviceLimit: unref(monitoring)?.deviceLimit ?? 5,
      t: unref(t),
      formatDate: unref(formatDate)
    },
    events: {
      kick: handleKickDevice,
      delete: handleDeleteDevice,
      page: changeDevicePage
    }
  }),
  files: () => ({
    props: {
      workspaceRows: unref(adminWorkspaceFiles),
      shipmentRows: unref(adminShipmentFiles),
      workspaceTotal: unref(adminWorkspaceFileTotal),
      shipmentTotal: unref(adminShipmentFileTotal),
      workspacePage: unref(adminWorkspaceFilePage),
      shipmentPage: unref(adminShipmentFilePage),
      workspacePageSize: unref(adminWorkspaceFilePageSize),
      shipmentPageSize: unref(adminShipmentFilePageSize),
      section: unref(activeAdminFileSection),
      includeExpired: unref(includeExpiredFiles),
      busy: unref(loading),
      t: unref(fileText),
      presentation: unref(filePresentation)
    },
    events: {
      section: ($event) => (activeAdminFileSection.value = $event),
      expired: changeWorkspaceExpiredFilter,
      "refresh-workspace": () => loadAdminWorkspaceFiles(),
      "refresh-shipment": () => loadAdminShipmentFiles(),
      "workspace-page": changeAdminWorkspaceFilePage,
      "shipment-page": changeAdminShipmentFilePage,
      "download-workspace": handleDownloadWorkspaceFile,
      "download-shipment": handleDownloadShipmentFile,
      preview: handlePreviewShipmentFile,
      delete: handleDeleteShipmentFile
    }
  }),
  system: () => ({
    props: {
      workflow: unref(adminLlm),
      monitoring: unref(monitoring),
      busy: unref(loading),
      t: unref(t),
      formatDate: unref(formatDate)
    },
    events: {}
  })
};
const activeAdminBinding = computed(
  () => adminPageBindings[activeAdminPage.value]?.() || { props: {}, events: {} }
);
const activeAdminComponent = computed(() => {
  const item = adminPages.value.find((page) => page.key === activeAdminPage.value);
  const module = platformModuleCatalog.modules.find((entry) => entry.id === item?.moduleId);
  return module
    ? adminComponents[
        adminRoute.meta.moduleId === module.id
          ? adminRoute.meta.moduleView
          : module.pages.find((page) => page.path === "")?.view
      ]
    : undefined;
});
watch(
  () => adminRoute.meta.moduleId,
  (id) => {
    const page = adminPages.value.find((item) => item.moduleId === id);
    if (page) selectAdminPage(page.key, false);
    else if (adminRoute.name === "admin") selectAdminPage("overview", false);
  },
  { immediate: true }
);
const activePageMeta = computed(
  () => adminPages.value.find((item) => item.key === activeAdminPage.value) || adminPages.value[0]
);
const displayAdminName = computed(
  () => normalizeDisplayName(currentUser.value)?.displayName || consoleCopy.value.currentAdmin
);
const normalizedEmployees = computed(() => employees.value.map(normalizeDisplayName));
const normalizedDevices = computed(() => devices.value.map(normalizeDisplayName));
const pagedEmployees = computed(() => normalizedEmployees.value);
const pagedDevices = computed(() => normalizedDevices.value);

onMounted(async () => {
  if (!storedAdminToken() || !isAdmin.value) return;
  initialLoading.value = true;
  try {
    await adminConsole.refreshDashboard(false, false);
  } finally {
    initialLoading.value = false;
  }
});
watch(
  () => props.currentUser,
  (user) => {
    currentUser.value = normalizeDisplayName(user);
  }
);
watch(
  () => workspaceSessionKey(currentUser.value),
  () => {
    activeAdminPage.value = "overview";
    expandedAdminGroup.value = "overview";
    adminFeedback.clear();
  },
  { flush: "sync" }
);
async function loadDashboard() {
  return adminConsole.refreshDashboard();
}
function selectAdminPage(page, navigate = true) {
  if (
    (navigate && loading.value) ||
    !isAdmin.value ||
    !adminPages.value.some((item) => item.key === page)
  )
    return;
  const previousPage = activeAdminPage.value;
  activeAdminPage.value = page;
  expandedAdminGroup.value =
    adminPages.value.find((item) => item.key === page)?.group || expandedAdminGroup.value;
  const routeName = adminPages.value.find((item) => item.key === page)?.routeName;
  if (navigate && routeName && adminRouter.hasRoute(routeName))
    void adminRouter.push({ name: routeName });
  if (page === "overview" && previousPage !== page) void runAdminRead(adminConsole.loadRecentAudit);
  if (page === "files" && !adminFilesLoaded.value)
    void runAdminRead(loadAdminFileListsWithoutLoading);
  if (page === "announcements" && !announcementsLoaded.value)
    void runAdminRead(loadAnnouncementPageWithoutLoading);
  if (page === "tickets" && !adminTicketsLoaded.value) void adminBusiness.refreshAdminTicketPage();
  if (page === "handovers" && !customerHandoversLoaded.value)
    void adminBusiness.refreshCustomerHandoverPage();
}
function toggleAdminGroup(group) {
  if (!loading.value) expandedAdminGroup.value = expandedAdminGroup.value === group ? "" : group;
}
async function runAdminRead(action) {
  const context = workspaceSessionKey(currentUser.value);
  try {
    await action();
  } catch (error) {
    markApiErrorHandled(error);
    if (isAdmin.value && workspaceSessionKey(currentUser.value) === context)
      await adminFeedback.error(tr(error.message || t("admin.employee.errorFallback")));
  }
}
async function withAdminPageTransition(task) {
  let result;
  runTablePageTransition(() => {
    result = task();
  });
  return result;
}
const changeEmployeePage = (page) =>
  withAdminPageTransition(() => adminAccounts.changeEmployeePage(page));
const changeDevicePage = (page) =>
  withAdminPageTransition(() => adminDevices.changeDevicePage(page));
const changeAnnouncementPage = (page) =>
  withAdminPageTransition(() => adminAnnouncements.changeAnnouncementPage(page));
function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function confirmAnnouncementDeletion(record) {
  const title = record?.title || announcementCopy.value.untitled;
  try {
    await ElMessageBox.confirm(
      announcementCopy.value.deleteConfirm.replace("{title}", title),
      announcementCopy.value.delete,
      {
        type: "warning",
        confirmButtonText: announcementCopy.value.delete,
        cancelButtonText: announcementCopy.value.cancel,
        customClass: "admin-destructive-message-box",
        confirmButtonClass: "admin-destructive-message-box__confirm",
        closeOnClickModal: false
      }
    );
    return true;
  } catch {
    return false;
  }
}

async function confirmEmployeeDeletion(user) {
  const english = currentLocale.value === "en-US";
  const prompt = english
    ? `Delete account “${user.username}”? Sign-in access will be revoked and the account cannot be restored. Historical business records will be retained.`
    : `\u786e\u8ba4\u5220\u9664\u8d26\u53f7\u300c${user.username}\u300d\u5417\uff1f\u5220\u9664\u540e\u5c06\u64a4\u9500\u767b\u5f55\u6743\u9650\u4e14\u65e0\u6cd5\u6062\u590d\uff0c\u5386\u53f2\u4e1a\u52a1\u8bb0\u5f55\u4f1a\u4fdd\u7559\u3002`;
  try {
    await ElMessageBox.confirm(prompt, english ? "Delete account" : "\u5220\u9664\u8d26\u53f7", {
      type: "warning",
      confirmButtonText: english ? "Delete" : "\u5220\u9664",
      cancelButtonText: english ? "Cancel" : "\u53d6\u6d88",
      customClass: "admin-destructive-message-box",
      confirmButtonClass: "admin-destructive-message-box__confirm",
      closeOnClickModal: false
    });
  } catch {
    return false;
  }
  return true;
}

function changeWorkspaceExpiredFilter(include) {
  if (loading.value) return;
  includeExpiredFiles.value = include;
  return handleWorkspaceExpiredToggle();
}
async function changeAdminWorkspaceFilePage(page) {
  await withAdminPageTransition(() => adminFiles.changeAdminWorkspaceFilePage(page));
}
async function changeAdminShipmentFilePage(page) {
  await withAdminPageTransition(() => adminFiles.changeAdminShipmentFilePage(page));
}

async function showAdminErrorDialog(errorText) {
  await ElMessageBox.alert(errorText, t("admin.employee.errorTitle"), {
    type: "error",
    confirmButtonText: t("admin.employee.errorConfirm"),
    closeOnClickModal: false,
    closeOnPressEscape: false,
    showClose: false,
    customClass: "admin-error-message-box"
  });
}

function showMessage(text) {
  hasError.value = false;
  message.value = tr(text);
}

function roleText(role) {
  const key =
    {
      ADMIN: "profile.role.admin",
      BUSINESS: "profile.role.business",
      OPERATOR: "profile.role.business",
      OVERSEA_AGENT: "profile.role.overseaAgent"
    }[role] || "profile.role.employee";
  return ui(key);
}

function partyRoleText(partyRole, role) {
  const normalized = partyRole || (role === "BUSINESS" || role === "ADMIN" ? "AGENT" : "SHIPPER");
  return t(
    {
      AGENT: "customers.roleAgent",
      SHIPPER: "customers.roleShipper",
      CONSIGNEE: "customers.roleConsignee"
    }[normalized] || "customers.roleShipper"
  );
}

function statusText(status) {
  return tr(status === "ACTIVE" ? "启用" : "禁用");
}

function formatDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "-";
  return new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function tr(value) {
  return translateLegacyText(value, currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}
</script>
<style scoped>
.admin-access-denied {
  padding: 32px;
  display: grid;
  gap: 16px;
}
</style>
