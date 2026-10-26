// @ts-check

export const loadCustomerSummaryExample = () => import("./pages/CustomerSummaryExamplePage.vue");

/** @type {import("../../../types/moduleRegistry").RegisteredBusinessModuleDefinition} */
export const customerSummaryExample = {
  id: "customer-summary-example",
  mount: "module-example",
  icon: "Document",
  labelKey: "moduleExample.title",
  roles: ["ADMIN", "BUSINESS"],
  enabled: false,
  pages: [
    {
      name: "business-customer-summary-example",
      path: "",
      view: "customerSummaryExample"
    }
  ]
};

/** @type {import("../../../types/moduleRegistry").BusinessModuleRegistration} */
export const customerSummaryRegistration = {
  module: customerSummaryExample,
  views: { customerSummaryExample: loadCustomerSummaryExample }
};
