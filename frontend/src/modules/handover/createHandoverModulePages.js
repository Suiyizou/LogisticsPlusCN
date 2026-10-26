// @ts-check
import { reactive } from "vue";

// Public page projection only: state and commands remain owned by the shared workflows.
/** @param {import("../../types/businessModulePorts").HandoverModulePorts} ports */
export function createHandoverModulePages({ operations, permissions, formatters }) {
  /** @type {ReturnType<typeof import("../workspace/useCustomerOperations.js").useCustomerOperations>} */
  const typedOperations = operations;
  const {
    businessHandoverAgents,
    businessHandoverRequestPage,
    businessHandoverRequestPageSize,
    businessHandoverRequestStatus,
    businessHandoverRequestTotal,
    businessHandoverRequests,
    handoverEligibleCustomers,
    handoverWriteBusy,
    loadingBusinessHandoverAgents,
    loadingBusinessHandoverRequests,
    overseaTransferCustomerIds,
    transferForm,
    transferringCustomers,
    changeBusinessHandoverRequestPage,
    changeBusinessHandoverRequestPageSize,
    changeBusinessHandoverRequestStatus,
    openBusinessHandover,
    refreshBusinessHandoverData,
    submitOverseaAgentTransfer,
    businessHandoverStatusLabel,
    businessHandoverStatusType,
    transferCustomerIds,
    transferDialogOpen,
    closeCustomerTransfer,
    submitCustomerTransfer,
    businessHandoverDialogOpen,
    businessHandoverForm,
    businessHandoverTarget,
    submittingBusinessHandover,
    closeBusinessHandover,
    submitBusinessHandover
  } = typedOperations.handover;
  const { loadingTransferAgents, transferAgents, activeTransferAgents, selectedAgentOptionLabel } =
    typedOperations.agents;
  const { canRequestBusinessHandover, isOverseaAgent } = permissions;
  const { customerFilterOptionLabel, formatDateTime, statusLabel } = formatters;
  return {
    page: {
      permissions: reactive({ canRequestBusinessHandover, isOverseaAgent }),
      state: reactive({
        businessHandoverAgents,
        businessHandoverRequestPage,
        businessHandoverRequestPageSize,
        businessHandoverRequestStatus,
        businessHandoverRequestTotal,
        businessHandoverRequests,
        handoverEligibleCustomers,
        handoverWriteBusy,
        loadingBusinessHandoverAgents,
        loadingBusinessHandoverRequests,
        loadingTransferAgents,
        overseaTransferCustomerIds,
        transferAgents,
        transferForm,
        transferringCustomers
      }),
      actions: {
        changeBusinessHandoverRequestPage,
        changeBusinessHandoverRequestPageSize,
        changeBusinessHandoverRequestStatus,
        openBusinessHandover,
        refreshBusinessHandoverData,
        submitOverseaAgentTransfer
      },
      formatters: {
        businessHandoverStatusLabel,
        businessHandoverStatusType,
        customerFilterOptionLabel,
        formatDateTime,
        statusLabel
      }
    },
    transferDialog: {
      permissions: reactive({}),
      state: reactive({
        activeTransferAgents,
        handoverWriteBusy,
        loadingTransferAgents,
        transferCustomerIds,
        transferDialogOpen,
        transferForm,
        transferringCustomers
      }),
      actions: { closeCustomerTransfer, submitCustomerTransfer },
      formatters: { selectedAgentOptionLabel }
    },
    businessDialog: {
      permissions: reactive({}),
      state: reactive({
        businessHandoverDialogOpen,
        businessHandoverForm,
        businessHandoverTarget,
        handoverEligibleCustomers,
        handoverWriteBusy,
        submittingBusinessHandover
      }),
      actions: { closeBusinessHandover, submitBusinessHandover },
      formatters: { customerFilterOptionLabel }
    }
  };
}
