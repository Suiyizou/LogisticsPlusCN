// @ts-check
/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const serviceCatalogRegistration = {
  module: {
    id: "service-catalog",
    mount: "service-catalog",
    labelKey: "serviceCatalog.title",
    icon: "Document",
    surface: "business",
    navigation: { group: "business", order: 100 },
    roles: ["ADMIN", "BUSINESS"],
    pages: [{ name: "business-service-catalog", path: "", view: "serviceCatalog" }]
  },
  views: { serviceCatalog: () => import("./pages/ServiceCatalogPage.vue") }
};
