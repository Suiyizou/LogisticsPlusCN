// @ts-check
import { reactive } from "vue";
import { isNativeFileInput } from "../shared/workspaceRefs.js";

// Public page projection only: state and commands remain owned by the shared workflows.
/** @param {import("../../types/businessModulePorts").AgentModulePorts} ports */
export function createAgentModulePages({ operations, formatters, ui }) {
  /** @type {ReturnType<typeof import("../workspace/useCustomerOperations.js").useCustomerOperations>} */
  const typedOperations = operations;
  const {
    agentPage,
    agentPageSize,
    agentWriteBusy,
    loadingTransferAgents,
    paginatedTransferAgents,
    transferAgents,
    changeAgentPage,
    deleteAgent,
    editAgentDisplayName,
    loadTransferAgents,
    openAgentBatchImport,
    openAgentCreateDialog,
    resetAgentPassword,
    toggleAgentStatus,
    agentRowIndex,
    agentCreateDialogOpen,
    agentCreateError,
    agentCreateForm,
    agentPasswordChecks,
    canCreateAgent,
    creatingAgent,
    closeAgentCreateDialog,
    submitAgentCreate,
    agentBatchCreatedCount,
    agentBatchDialogOpen,
    agentBatchDropzoneActive,
    agentBatchError,
    agentBatchFileInput,
    agentBatchFileName,
    agentBatchInvalidCount,
    agentBatchReadyCount,
    agentBatchRows,
    importingAgents,
    parsingAgentFile,
    closeAgentBatchImport,
    downloadAgentImportTemplate,
    handleAgentBatchDrop,
    handleAgentWorkbook,
    submitAgentBatchImport,
    agentBatchRowClass
  } = typedOperations.agents;
  const { statusLabel } = formatters;
  const { tablePageTransitioning } = ui;
  return {
    page: {
      permissions: reactive({}),
      state: reactive({
        agentPage,
        agentPageSize,
        agentWriteBusy,
        loadingTransferAgents,
        paginatedTransferAgents,
        tablePageTransitioning,
        transferAgents
      }),
      actions: {
        changeAgentPage,
        deleteAgent,
        editAgentDisplayName,
        loadTransferAgents,
        openAgentBatchImport,
        openAgentCreateDialog,
        resetAgentPassword,
        toggleAgentStatus
      },
      formatters: { agentRowIndex, statusLabel }
    },
    createDialog: {
      permissions: reactive({}),
      state: reactive({
        agentCreateDialogOpen,
        agentCreateError,
        agentCreateForm,
        agentPasswordChecks,
        canCreateAgent,
        creatingAgent
      }),
      actions: { closeAgentCreateDialog, submitAgentCreate },
      formatters: {}
    },
    importDialog: {
      permissions: reactive({}),
      state: reactive({
        agentBatchCreatedCount,
        agentBatchDialogOpen,
        agentBatchDropzoneActive,
        agentBatchError,
        agentBatchFileInput,
        agentBatchFileName,
        agentBatchInvalidCount,
        agentBatchReadyCount,
        agentBatchRows,
        agentWriteBusy,
        importingAgents,
        parsingAgentFile
      }),
      actions: {
        closeAgentBatchImport,
        downloadAgentImportTemplate,
        handleAgentBatchDrop,
        handleAgentWorkbook,
        submitAgentBatchImport,
        setFileInput: (
          /** @type {import("../../types/businessModulePorts").FileInputRefTarget} */ input
        ) => {
          agentBatchFileInput.value = isNativeFileInput(input) ? input : null;
        }
      },
      formatters: { agentBatchRowClass }
    }
  };
}
