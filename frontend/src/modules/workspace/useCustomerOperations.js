import { useCustomerWorkspace } from "../customers/useCustomerWorkspace.js";
import { usePasswordResetResult } from "../../features/account/usePasswordResetResult.js";
import { useAgentManagement } from "../../features/agents/useAgentManagement.js";
import { useCustomerBatchImport } from "../../features/customers/useCustomerBatchImport.js";
import { useCustomerHandover } from "../../features/customers/useCustomerHandover.js";

// Composition only: all child workflows share this directory and its write lock.
// The host owns this scope across route changes; no state is persisted or recreated by pages.
export function useCustomerOperations({
  services,
  permissions,
  feedback,
  refreshShipments,
  loadXlsxModule,
  waitForNextPaint,
  runTablePageTransition
}) {
  const { canManage, isOverseaAgent, canRequestBusinessHandover } = permissions;
  const { t, clearMessage, showSuccess, showError, markApiErrorHandled } = feedback;
  const credentials = usePasswordResetResult({ canManage, t });
  const workspace = useCustomerWorkspace({
    directory: {
      fetchBusinessCustomers: services.fetchBusinessCustomers,
      fetchBusinessCustomerShipments: services.fetchBusinessCustomerShipments,
      fetchOverseaAgentLinkedCustomers: services.fetchOverseaAgentLinkedCustomers,
      updateOverseaAgentLinkedCustomers: services.updateOverseaAgentLinkedCustomers,
      canManage,
      clearMessage,
      showError,
      showSuccess,
      runTablePageTransition
    },
    forms: {
      canManage,
      createBusinessCustomer: services.createBusinessCustomer,
      updateBusinessCustomer: services.updateBusinessCustomer,
      deleteBusinessCustomer: services.deleteBusinessCustomer,
      resetBusinessCustomerPassword: services.resetBusinessCustomerPassword,
      loadAvailableShipments: refreshShipments,
      openPasswordResetResult: credentials.openPasswordResetResult,
      t,
      clearMessage,
      showSuccess,
      showError
    }
  });
  const agents = useAgentManagement({
    directory: workspace.directory,
    canManage,
    fetchCustomerTransferAgents: services.fetchCustomerTransferAgents,
    createOverseaAgentEmployee: services.createOverseaAgentEmployee,
    batchCreateOverseaAgentEmployees: services.batchCreateOverseaAgentEmployees,
    updateOverseaAgent: services.updateOverseaAgent,
    resetOverseaAgentPassword: services.resetOverseaAgentPassword,
    deleteOverseaAgent: services.deleteOverseaAgent,
    loadXlsxModule,
    runTablePageTransition,
    markApiErrorHandled,
    openPasswordResetResult: credentials.openPasswordResetResult,
    t,
    showSuccess,
    showError
  });
  const importing = useCustomerBatchImport({
    directory: workspace.directory,
    canManage,
    batchCreateBusinessCustomers: services.batchCreateBusinessCustomers,
    loadXlsxModule,
    waitForNextPaint,
    t
  });
  const handover = useCustomerHandover({
    directory: workspace.directory,
    canManage,
    isOverseaAgent,
    canRequestBusinessHandover,
    agentManagement: agents,
    fetchBusinessHandoverAgents: services.fetchBusinessHandoverAgents,
    fetchBusinessHandoverRequests: services.fetchBusinessHandoverRequests,
    handoverBusinessCustomers: services.handoverBusinessCustomers,
    transferBusinessCustomers: services.transferBusinessCustomers,
    loadAvailableShipments: refreshShipments,
    t,
    showSuccess,
    showError
  });
  return { workspace, agents, importing, handover, credentials };
}
