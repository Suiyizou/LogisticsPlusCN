// @ts-check

export const loadBusinessOverviewPage = () => import("./pages/BusinessOverviewPage.vue");

/** @type {import("../../types/moduleRegistry").RegisteredBusinessModuleDefinition} */
export const moduleDefinition = {
  id: "overview",
  mount: "overview",
  icon: "DataBoard",
  labelKey: "customers.overview",
  roles: ["ADMIN", "BUSINESS"],
  pages: [
    {
      name: "business-overview",
      path: "",
      view: "businessOverview"
    }
  ]
};

/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const overviewRegistration = {
  module: moduleDefinition,
  views: { businessOverview: loadBusinessOverviewPage }
};
