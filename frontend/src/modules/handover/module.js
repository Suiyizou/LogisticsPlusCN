// @ts-check

export const loadCustomerHandoverPage = () => import("./pages/CustomerHandoverPage.vue");

/** @type {import("../../types/moduleRegistry").RegisteredBusinessModuleDefinition} */
export const moduleDefinition = {
  id: "handover",
  mount: "handover",
  icon: "Operation",
  labelKey: "customers.businessHandover",
  agentLabelKey: "customers.businessTransfer",
  roles: ["ADMIN", "BUSINESS", "OVERSEA_AGENT"],
  pages: [
    {
      name: "business-handover",
      path: "",
      view: "handoverWorkspace"
    }
  ]
};

/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const handoverRegistration = {
  module: moduleDefinition,
  views: { handoverWorkspace: loadCustomerHandoverPage }
};
