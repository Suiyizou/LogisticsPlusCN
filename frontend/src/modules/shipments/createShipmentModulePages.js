// @ts-check
import { reactive } from "vue";
import { isNativeFileInput, isSelectionTable } from "../shared/workspaceRefs.js";
import { isCreatedToday } from "../../features/shared/businessDates.js";

// Explicit ref projections: no copied state and no service dependencies in route pages.
/** @param {import("../../types/businessModulePorts").ShipmentModulePorts} ports */
export function createShipmentModulePages({
  operations,
  directory,
  view,
  permissions,
  bindings,
  ui,
  actions,
  formatters
}) {
  /** @type {ReturnType<typeof import("../workspace/useShipmentOperations.js").useShipmentOperations>} */
  const typedOperations = operations;
  const manualShipmentEntry = typedOperations.entry;
  const { shipmentTrackingChannel } = operations;
  const { openShipmentCreateDialog, openShipmentExcelImport } = typedOperations.entry;
  const {
    shipmentCustomerFilter,
    shipmentFilterCustomers,
    shipmentBusinessFilter,
    loadingAvailableShipments,
    selectedShipmentRows,
    displayedAvailableShipments,
    shipmentTotal,
    shipmentPage,
    shipmentPageSize,
    loadAvailableShipments,
    handleShipmentSelectionChange,
    changeShipmentPage,
    changeShipmentPageSize,
    shipmentTableRef,
    shipmentRowIndex
  } = typedOperations.list;
  const {
    savingShipment,
    loadingShipmentDetail,
    refreshingShipment,
    deletingShipment,
    detailForm,
    selectedShipment,
    invalidateSnapshot,
    refreshShipmentFromCarrier,
    removeShipment,
    saveManualSnapshot,
    saveShipmentDetail
  } = typedOperations.detail;
  const {
    batchTrackToolbarLabel,
    batchTrackRunning,
    batchTrackChecking,
    batchTrackFileParsing,
    toggleBatchTrackPanel,
    startRefreshSelectedShipments,
    startRefreshAllShipments,
    batchTrackCancelRequested,
    batchTrackCarrier,
    batchTrackReferenceType,
    batchTrackCustomerId,
    batchTrackDialogOpen,
    batchTrackDialogTitle,
    batchTrackDropzoneActive,
    batchTrackFileInput,
    batchTrackFileName,
    batchTrackManualCount,
    batchTrackNumbers,
    batchTrackImportPreview,
    batchTrackImportErrors,
    batchTrackPreviewRows,
    batchTrackProblemResults,
    batchTrackProblemsOnly,
    batchTrackProgress,
    batchTrackPublishToCustomer,
    batchTrackResults,
    batchTrackSelectedColumnIndex,
    batchTrackSelectedSheet,
    batchTrackSelectedSheetName,
    batchTrackSheets,
    batchTrackTrackableCount,
    visibleBatchTrackResults,
    cancelBatchTrack,
    clearBatchTrackFile,
    handleBatchTrackDrop,
    handleBatchTrackWorkbook,
    startBatchTrack,
    batchDiagnosticText,
    batchMainStageStatus,
    batchStageStatusLabel,
    batchStageTagType,
    batchSubtaskLabel,
    batchTrackElapsedText
  } = typedOperations.batch;
  const {
    batchSavingBusinessFields,
    batchDeletingShipments,
    openBatchBusinessFieldsEditor,
    batchDeleteSelectedShipments,
    updateShipmentTracking,
    deleteShipmentRow,
    batchBusinessFieldRows,
    batchBusinessFieldsDialogOpen,
    saveBatchBusinessFields,
    closeBatchBusinessFieldsEditor
  } = typedOperations.mutations;
  const { customers, assignableCustomers } = directory;
  const { isManager, isOverseaAgent } = permissions;
  const {
    selectedCustomerIds,
    batchBinding,
    batchBindingProgress,
    boundCustomersForSelectedShipment,
    batchBindCustomers,
    unbindCustomerFromShipment
  } = bindings;
  const { tablePageTransitioning } = ui;
  const { trackShipmentInWorkspace, editShipment, navigateTo, openTrackingWorkspace } = actions;
  const {
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
  } = formatters;
  const shipmentListWorkspace = {
    permissions: reactive({ isManager, isOverseaAgent }),
    state: reactive({
      savingShipment,
      loadingShipmentDetail,
      refreshingShipment,
      deletingShipment,
      batchTrackToolbarLabel,
      shipmentCustomerFilter,
      shipmentFilterCustomers,
      shipmentBusinessFilter,
      shipmentTrackingChannel,
      batchTrackRunning,
      batchTrackChecking,
      loadingAvailableShipments,
      selectedShipmentRows,
      batchSavingBusinessFields,
      batchDeletingShipments,
      batchTrackFileParsing,
      displayedAvailableShipments,
      tablePageTransitioning,
      shipmentTotal,
      shipmentPage,
      shipmentPageSize,
      entryBusy: manualShipmentEntry.entryBusy
    }),
    actions: {
      toggleBatchTrackPanel,
      openShipmentCreateDialog,
      openShipmentExcelImport,
      loadAvailableShipments,
      openBatchBusinessFieldsEditor,
      batchDeleteSelectedShipments,
      startRefreshSelectedShipments,
      startRefreshAllShipments,
      handleShipmentSelectionChange,
      clearShipmentSelection: () => shipmentTableRef.value?.clearSelection(),
      trackShipmentInWorkspace,
      editShipment,
      updateShipmentTracking,
      deleteShipmentRow,
      changeShipmentPage,
      changeShipmentPageSize,
      setTableRef: (
        /** @type {import("../../types/businessModulePorts").TableRefTarget<import("../../types/businessRecords").ShipmentRecord>} */ table
      ) => {
        shipmentTableRef.value = isSelectionTable(table) ? table : null;
      }
    },
    formatters: {
      customerFilterOptionLabel,
      shipmentRowIndex,
      referenceTypeLabel,
      shipmentClientLabel,
      shipmentBoundUsers,
      boundUserLabel,
      hasRefreshIssue,
      refreshOutcomeTooltip,
      shipmentBusinessStateTagType,
      shipmentBusinessStateLabel,
      isCreatedToday,
      formatDateTime
    }
  };
  return {
    view,
    list: shipmentListWorkspace,
    listDialogs: {
      permissions: reactive({}),
      state: reactive({
        assignableCustomers,
        batchBusinessFieldRows,
        batchBusinessFieldsDialogOpen,
        batchSavingBusinessFields,
        batchTrackCancelRequested,
        batchTrackCarrier,
        batchTrackReferenceType,
        batchTrackChecking,
        batchTrackCustomerId,
        batchTrackDialogOpen,
        batchTrackDialogTitle,
        batchTrackDropzoneActive,
        batchTrackFileInput,
        batchTrackFileName,
        batchTrackFileParsing,
        batchTrackManualCount,
        batchTrackNumbers,
        batchTrackImportPreview,
        batchTrackImportErrors,
        batchTrackPreviewRows,
        batchTrackProblemResults,
        batchTrackProblemsOnly,
        batchTrackProgress,
        batchTrackPublishToCustomer,
        batchTrackResults,
        batchTrackRunning,
        batchTrackSelectedColumnIndex,
        batchTrackSelectedSheet,
        batchTrackSelectedSheetName,
        batchTrackSheets,
        batchTrackTrackableCount,
        visibleBatchTrackResults
      }),
      actions: {
        cancelBatchTrack,
        clearBatchTrackFile,
        handleBatchTrackDrop,
        handleBatchTrackWorkbook,
        saveBatchBusinessFields,
        closeBatchBusinessFieldsEditor,
        startBatchTrack,
        setBatchFileInput: (
          /** @type {import("../../types/businessModulePorts").FileInputRefTarget} */ input
        ) => {
          batchTrackFileInput.value = isNativeFileInput(input) ? input : null;
        }
      },
      formatters: {
        batchDiagnosticText,
        batchMainStageStatus,
        batchStageStatusLabel,
        batchStageTagType,
        batchSubtaskLabel,
        batchTrackElapsedText,
        customerFilterOptionLabel,
        formatDateTime,
        selectedCustomerOptionLabel
      }
    },
    detail: {
      permissions: reactive({ isManager }),
      state: reactive({
        batchBinding,
        batchBindingProgress,
        boundCustomersForSelectedShipment,
        customers,
        deletingShipment,
        detailForm,
        entryBusy: manualShipmentEntry.entryBusy,
        loadingAvailableShipments,
        loadingShipmentDetail,
        refreshingShipment,
        savingShipment,
        selectedCustomerIds,
        selectedShipment
      }),
      actions: {
        batchBindCustomers,
        invalidateSnapshot,
        loadAvailableShipments,
        navigateTo,
        openShipmentCreateDialog,
        openTrackingWorkspace,
        refreshShipmentFromCarrier,
        removeShipment,
        saveManualSnapshot,
        saveShipmentDetail,
        unbindCustomerFromShipment
      },
      formatters: {
        getCustomerName,
        getCustomerUsername,
        isCustomerBoundToSelectedShipment,
        partyRoleLabel,
        referenceTypeLabel
      }
    }
  };
}
