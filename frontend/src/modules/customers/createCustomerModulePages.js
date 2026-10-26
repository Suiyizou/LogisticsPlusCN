// @ts-check
import { reactive } from "vue";
import { isNativeFileInput, isSelectionTable } from "../shared/workspaceRefs.js";
import { isTransferableCustomer } from "../../features/customers/useCustomerDirectory.js";

// Public page projection only: state and commands remain owned by the shared workflows.
/** @param {import("../../types/businessModulePorts").CustomerModulePorts} ports */
export function createCustomerModulePages({
  operations,
  shipmentOperations,
  bindings,
  view,
  permissions,
  ui,
  actions,
  formatters
}) {
  /** @type {ReturnType<typeof import("../workspace/useCustomerOperations.js").useCustomerOperations>} */
  const typedOperations = operations;
  const manualShipmentEntry = shipmentOperations.entry;
  const { openShipmentCreateDialog } = shipmentOperations.entry;
  const {
    customerPage,
    customerPageSize,
    customerSearch,
    filteredCustomers,
    loadingCustomers,
    paginatedCustomers,
    selectedCustomerRows,
    changeCustomerPage,
    handleCustomerSelectionChange,
    customerTableRef,
    customerRowIndex,
    selectedCustomer,
    linkableCustomers,
    linkedCustomerIds,
    loadingLinkedCustomers,
    loadingShipments,
    savingLinkedCustomers,
    shipments,
    saveLinkedCustomers
  } = typedOperations.workspace.directory;
  const {
    mutatingCustomer,
    deleteSelectedCustomers,
    openCreateCustomer,
    openEditCustomer,
    openResetPassword,
    createDialogOpen,
    createForm,
    creating,
    isEditMode,
    closeCreateDialog,
    submitCustomerForm,
    clientCodeDialogOpen,
    clientCodeSupplement,
    closeClientCodeSupplement,
    saveClientCodeSupplement,
    resetPasswordDialogOpen,
    closeResetPasswordDialog,
    resetPassword,
    editForm,
    deactivateCustomer,
    openClientCodeSupplement,
    reactivateCustomer,
    saveCustomer
  } = typedOperations.workspace.forms;
  const {
    openBatchImport,
    activeCustomerBatchPreview,
    batchDropzoneActive,
    batchFileInput,
    batchFileName,
    batchImportDialogOpen,
    batchImportMode,
    batchPreviewError,
    canSubmitCustomerBatchImport,
    customerFileParsing,
    importingCustomers,
    quickImportText,
    closeBatchImport,
    downloadCustomerImportTemplate,
    handleBatchDrop,
    handleCustomerWorkbook,
    selectCustomerBatchMode,
    submitBatchImport,
    customerImportFieldLabel,
    customerImportIssueText,
    customerPartyRoleLabel,
    batchCredentialRows,
    batchCredentialSummary,
    credentialExportError,
    exportingCredentials,
    closeBatchCredentials,
    downloadCredentialWorkbook,
    localizeCustomerImportResult
  } = typedOperations.importing;
  const { passwordResetResult, closePasswordResetResult, copyPasswordResetResult } =
    typedOperations.credentials;
  const { openCustomerTransfer } = typedOperations.handover;
  const {
    bindForm,
    bindMode,
    bindingShipment,
    draftShipments,
    publishingAllShipments,
    publishingShipmentId,
    selectedCandidateShipmentIds,
    unbindingShipmentId,
    unboundAvailableShipments,
    batchBindSelectedShipments,
    bindShipment,
    publishAllDraftShipments,
    quickBindShipment,
    toggleCandidateShipment,
    togglePublication,
    unbindShipment
  } = bindings;
  const {
    loadingAvailableShipments,
    shipmentPage,
    shipmentPageSize,
    shipmentTotal,
    changeShipmentPage,
    loadAvailableShipments
  } = shipmentOperations.list;
  const { isManager } = permissions;
  const { tablePageTransitioning } = ui;
  const { selectCustomerFromList, navigateTo, openShipmentDetail, openShipmentSupplement } =
    actions;
  const {
    customerInitial,
    formatDateTime,
    partyRoleLabel,
    statusLabel,
    boundRoleSummary,
    formatDate,
    needsManualSupplement,
    referenceTypeLabel
  } = formatters;
  return {
    view,
    directory: {
      permissions: reactive({ isManager }),
      state: reactive({
        customerPage,
        customerPageSize,
        customerSearch,
        filteredCustomers,
        loadingCustomers,
        mutatingCustomer,
        paginatedCustomers,
        selectedCustomerRows,
        tablePageTransitioning
      }),
      actions: {
        changeCustomerPage,
        deleteSelectedCustomers,
        handleCustomerSelectionChange,
        openBatchImport,
        openCreateCustomer,
        openCustomerTransfer,
        openEditCustomer,
        openResetPassword,
        selectCustomerFromList,
        setTableRef: (
          /** @type {import("../../types/businessModulePorts").TableRefTarget<import("../../types/businessRecords").CustomerRecord>} */ table
        ) => {
          customerTableRef.value = isSelectionTable(table) ? table : null;
        }
      },
      formatters: {
        customerInitial,
        customerRowIndex,
        formatDateTime,
        isTransferableCustomer,
        partyRoleLabel,
        statusLabel
      }
    },
    formDialog: {
      permissions: reactive({}),
      state: reactive({ createDialogOpen, createForm, creating, isEditMode }),
      actions: { closeCreateDialog, submitCustomerForm },
      formatters: {}
    },
    importDialog: {
      permissions: reactive({}),
      state: reactive({
        activeCustomerBatchPreview,
        batchDropzoneActive,
        batchFileInput,
        batchFileName,
        batchImportDialogOpen,
        batchImportMode,
        batchPreviewError,
        canSubmitCustomerBatchImport,
        customerFileParsing,
        importingCustomers,
        quickImportText
      }),
      actions: {
        closeBatchImport,
        downloadCustomerImportTemplate,
        handleBatchDrop,
        handleCustomerWorkbook,
        selectCustomerBatchMode,
        submitBatchImport,
        setFileInput: (
          /** @type {import("../../types/businessModulePorts").FileInputRefTarget} */ input
        ) => {
          batchFileInput.value = isNativeFileInput(input) ? input : null;
        }
      },
      formatters: { customerImportFieldLabel, customerImportIssueText, customerPartyRoleLabel }
    },
    credentialDialog: {
      permissions: reactive({}),
      state: reactive({
        batchCredentialRows,
        batchCredentialSummary,
        credentialExportError,
        exportingCredentials
      }),
      actions: { closeBatchCredentials, downloadCredentialWorkbook },
      formatters: { localizeCustomerImportResult }
    },
    clientCodeDialog: {
      permissions: reactive({}),
      state: reactive({ clientCodeDialogOpen, clientCodeSupplement, mutatingCustomer }),
      actions: { closeClientCodeSupplement, saveClientCodeSupplement },
      formatters: {}
    },
    passwordDialog: {
      permissions: reactive({}),
      state: reactive({ mutatingCustomer, resetPasswordDialogOpen, selectedCustomer }),
      actions: { closeResetPasswordDialog, resetPassword },
      formatters: {}
    },
    passwordResultDialog: {
      permissions: reactive({}),
      state: reactive({ passwordResetResult }),
      actions: { closePasswordResetResult, copyPasswordResetResult },
      formatters: {}
    },
    detail: {
      permissions: reactive({ isManager }),
      state: reactive({
        bindForm,
        bindMode,
        bindingShipment,
        draftShipments,
        editForm,
        entryBusy: manualShipmentEntry.entryBusy,
        linkableCustomers,
        linkedCustomerIds,
        loadingAvailableShipments,
        loadingLinkedCustomers,
        loadingShipments,
        mutatingCustomer,
        publishingAllShipments,
        publishingShipmentId,
        resetPasswordDialogOpen,
        savingLinkedCustomers,
        selectedCandidateShipmentIds,
        selectedCustomer,
        shipmentPage,
        shipmentPageSize,
        shipmentTotal,
        shipments,
        unbindingShipmentId,
        unboundAvailableShipments
      }),
      actions: {
        batchBindSelectedShipments,
        bindShipment,
        changeShipmentPage,
        deactivateCustomer,
        loadAvailableShipments,
        navigateTo,
        openClientCodeSupplement,
        openShipmentCreateDialog,
        openShipmentDetail,
        openShipmentSupplement,
        publishAllDraftShipments,
        quickBindShipment,
        reactivateCustomer,
        saveCustomer,
        saveLinkedCustomers,
        toggleCandidateShipment,
        togglePublication,
        unbindShipment
      },
      formatters: {
        boundRoleSummary,
        formatDate,
        needsManualSupplement,
        partyRoleLabel,
        referenceTypeLabel,
        statusLabel
      }
    }
  };
}
