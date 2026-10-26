import { effectScope, ref } from "vue";
import { useCustomerOperations } from "../src/modules/workspace/useCustomerOperations.js";

export function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export const customer = {
  id: "A",
  username: "customer-a",
  displayName: "Customer A",
  clientCode: "ABC123",
  partyRole: "SHIPPER",
  status: "ACTIVE"
};
export function harness(context, overrides = {}) {
  const scope = effectScope(),
    canManage = ref(true),
    isOverseaAgent = ref(false),
    canRequestBusinessHandover = ref(true),
    refreshed = [],
    notices = [];
  const serviceNames = [
    "fetchBusinessCustomers",
    "fetchBusinessCustomerShipments",
    "fetchOverseaAgentLinkedCustomers",
    "updateOverseaAgentLinkedCustomers",
    "createBusinessCustomer",
    "updateBusinessCustomer",
    "deleteBusinessCustomer",
    "resetBusinessCustomerPassword",
    "fetchCustomerTransferAgents",
    "createOverseaAgentEmployee",
    "batchCreateOverseaAgentEmployees",
    "updateOverseaAgent",
    "resetOverseaAgentPassword",
    "deleteOverseaAgent",
    "batchCreateBusinessCustomers",
    "fetchBusinessHandoverAgents",
    "fetchBusinessHandoverRequests",
    "handoverBusinessCustomers",
    "transferBusinessCustomers"
  ];
  const services = {
    ...Object.fromEntries(serviceNames.map((key) => [key, async () => ({ items: [] })])),
    fetchBusinessCustomers: async () => ({ items: [{ ...customer }] }),
    ...overrides
  };
  const workflows = scope.run(() =>
    useCustomerOperations({
      services,
      permissions: { canManage, isOverseaAgent, canRequestBusinessHandover },
      feedback: {
        t: (key) => key,
        clearMessage: () => {},
        showError: (error) => notices.push(error),
        showSuccess: (key) => notices.push(key),
        markApiErrorHandled: () => {}
      },
      refreshShipments: async () => {
        refreshed.push(true);
      },
      loadXlsxModule: async () => {
        throw Error("unexpected workbook read");
      },
      waitForNextPaint: async () => {},
      runTablePageTransition: (callback) => callback()
    })
  );
  context.after(() => scope.stop());
  return {
    ...workflows,
    scope,
    canManage,
    isOverseaAgent,
    canRequestBusinessHandover,
    refreshed,
    notices
  };
}
