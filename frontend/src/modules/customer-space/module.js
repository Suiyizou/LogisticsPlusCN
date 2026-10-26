// @ts-check
/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const customerWorkspaceRegistration = {
  module: {
    id: "customer-shipments",
    mount: "shipments",
    surface: "customer",
    labelKey: "customers.tabShipmentManagement",
    roles: ["CUSTOMER"],
    navigation: { group: "business", order: 0 },
    pages: [{ name: "customer-assigned-shipments", path: "", view: "customerAssignedShipments" }]
  },
  views: { customerAssignedShipments: () => import("./CustomerShipmentsPage.vue") }
};
