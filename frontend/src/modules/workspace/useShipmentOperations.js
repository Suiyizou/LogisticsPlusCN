import { computed, ref } from "vue";
import { useShipmentList } from "../../features/shipments/useShipmentList.js";
import { useShipmentDetail } from "../../features/shipments/useShipmentDetail.js";
import { useManualShipmentEntry } from "../../features/shipments/useManualShipmentEntry.js";
import { useShipmentBatchTracking } from "../../features/shipments/useShipmentBatchTracking.js";
import { useShipmentListMutations } from "../../features/shipments/useShipmentListMutations.js";
import { normalizeBusinessShipment } from "../../features/shipments/shipmentModel.js";

// One host scope owns list/detail, entry and background observation across route changes.
export function useShipmentOperations({
  directory,
  context,
  services,
  feedback,
  formatters,
  navigation,
  adapters,
  batchOptions = {}
}) {
  const { canManage, currentUser, selectedShipmentId, menuItem, subView } = context;
  const { t, showSuccess, showError, showInfo, markApiErrorHandled } = feedback;
  const ownerIdentity = computed(() =>
    JSON.stringify([currentUser()?.id, currentUser()?.username, currentUser()?.role])
  );
  const shipmentTrackingChannel = ref("AUTO");
  const list = useShipmentList({
    customers: directory.customers,
    customersLoaded: directory.customersLoaded,
    customerFilterOptionLabel: formatters.customerFilterOptionLabel,
    fetchAvailableBusinessShipments: services.fetchAvailableBusinessShipments,
    normalizeBusinessShipment,
    showError,
    runTablePageTransition: adapters.runTablePageTransition
  });
  const entry = useManualShipmentEntry({
    canManage,
    ownerIdentity,
    selectedCustomerId: directory.selectedCustomerId,
    assignableCustomers: directory.assignableCustomers,
    shipmentPage: list.shipmentPage,
    loadAvailableShipments: list.loadAvailableShipments,
    createBusinessShipment: services.createBusinessShipment,
    inspectBusinessShipmentImportConflicts: services.inspectBusinessShipmentImportConflicts,
    loadXlsxModule: adapters.loadXlsxModule,
    waitForNextPaint: adapters.waitForNextPaint,
    confirm: adapters.confirmEntry,
    t,
    showSuccess,
    showError,
    markApiErrorHandled
  });
  function replaceShipmentInLocalCollections(shipment) {
    for (const collection of [directory.shipments.value, list.availableShipments.value]) {
      const index = collection.findIndex(
        (candidate) => candidate.shipmentId === shipment.shipmentId
      );
      if (index >= 0) collection.splice(index, 1, { ...collection[index], ...shipment });
    }
  }
  const detail = useShipmentDetail({
    canManage,
    selectedShipmentId,
    menuItem,
    subView,
    availableShipments: list.availableShipments,
    shipments: directory.shipments,
    selectedCustomer: directory.selectedCustomer,
    selectedCustomerId: directory.selectedCustomerId,
    shipmentTrackingChannel,
    fetchBusinessShipmentSnapshot: services.fetchBusinessShipmentSnapshot,
    updateBusinessShipment: services.updateBusinessShipment,
    updateBusinessShipmentManualSnapshot: services.updateBusinessShipmentManualSnapshot,
    invalidateBusinessShipmentSnapshot: services.invalidateBusinessShipmentSnapshot,
    deleteBusinessShipment: services.deleteBusinessShipment,
    requestTracking: services.requestTracking,
    normalizeBusinessShipment,
    replaceShipmentInLocalCollections,
    loadAvailableShipments: list.loadAvailableShipments,
    selectCustomer: directory.selectCustomer,
    primaryBoundCustomerName: formatters.primaryBoundCustomerName,
    preferredTrackingReference: formatters.preferredTrackingReference,
    navigateTo: navigation.navigateTo,
    t,
    showSuccess,
    showError,
    showInfo,
    promptInvalidation: adapters.promptInvalidation,
    confirmDeletion: adapters.confirmDeletion
  });
  const batch = useShipmentBatchTracking({
    canManage,
    owner: currentUser()?.id || currentUser()?.username || "current",
    selectedCustomerId: directory.selectedCustomerId,
    assignableCustomers: directory.assignableCustomers,
    shipmentTrackingChannel,
    refreshingShipment: detail.refreshingShipment,
    selectedShipmentRows: list.selectedShipmentRows,
    shipmentTableRef: list.shipmentTableRef,
    createShipmentBatchTask: services.createShipmentBatchTask,
    createShipmentRefreshAllTask: services.createShipmentRefreshAllTask,
    createShipmentBatchRefreshTask: services.createShipmentBatchRefreshTask,
    fetchShipmentBatchTask: services.fetchShipmentBatchTask,
    cancelShipmentBatchTask: services.cancelShipmentBatchTask,
    inspectBusinessShipmentImportConflicts: services.inspectBusinessShipmentImportConflicts,
    loadXlsxModule: adapters.loadXlsxModule,
    waitForNextPaint: adapters.waitForNextPaint,
    loadAvailableShipments: list.loadAvailableShipments,
    t,
    formatDateTime: formatters.formatDateTime,
    showSuccess,
    storage: batchOptions.storage,
    scheduler: batchOptions.scheduler,
    now: batchOptions.now,
    confirm: batchOptions.confirm
  });
  const mutations = useShipmentListMutations({
    list,
    detail,
    directory,
    selectedShipmentId,
    canManage,
    ownerIdentity,
    feedback,
    formatters,
    confirm: adapters.confirmDeletion,
    isLocked: () =>
      detail.savingShipment.value ||
      detail.loadingShipmentDetail.value ||
      entry.entryBusy.value ||
      batch.batchTrackRunning.value ||
      batch.batchTrackChecking.value,
    services: {
      deleteShipment: services.deleteBusinessShipment,
      deleteShipments: services.batchDeleteBusinessShipments,
      updateFields: services.batchUpdateBusinessShipmentFields,
      requestTracking: services.requestTracking,
      readChannel: () => shipmentTrackingChannel.value
    }
  });
  return { list, detail, entry, batch, mutations, shipmentTrackingChannel };
}
