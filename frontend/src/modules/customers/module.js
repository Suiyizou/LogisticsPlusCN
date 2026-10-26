// @ts-check

export const loadCustomerWorkspacePage = () => import("./pages/CustomerWorkspacePage.vue");

/** @type {import("../../types/moduleRegistry").RegisteredBusinessModuleDefinition} */
export const moduleDefinition = {
  id: "customers",
  mount: "directory",
  icon: "User",
  labelKey: "customers.tabCustomerManagement",
  roles: ["ADMIN", "BUSINESS", "OVERSEA_AGENT"],
  pages: [
    {
      name: "business-customers",
      path: "",
      view: "customerWorkspace"
    },
    {
      name: "business-customers-detail",
      path: ":customerId",
      selection: "customerId",
      view: "customerWorkspace"
    }
  ]
};

/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const customerRegistration = {
  module: moduleDefinition,
  views: { customerWorkspace: loadCustomerWorkspacePage }
};
