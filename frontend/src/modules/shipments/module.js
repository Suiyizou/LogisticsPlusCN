// @ts-check

export const loadShipmentWorkspacePage = () => import("./pages/ShipmentWorkspacePage.vue");

/** @type {import("../../types/moduleRegistry").RegisteredBusinessModuleDefinition} */
export const moduleDefinition = {
  id: "shipments",
  mount: "shipments",
  icon: "Document",
  labelKey: "customers.tabShipmentManagement",
  agentLabelKey: "customers.shipmentOverview",
  roles: ["ADMIN", "BUSINESS", "OVERSEA_AGENT"],
  pages: [
    {
      name: "business-shipments",
      path: "",
      view: "shipmentWorkspace"
    },
    {
      name: "business-shipments-detail",
      path: ":shipmentId",
      selection: "shipmentId",
      view: "shipmentWorkspace"
    }
  ]
};

/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const shipmentRegistration = {
  module: moduleDefinition,
  views: { shipmentWorkspace: loadShipmentWorkspacePage }
};
