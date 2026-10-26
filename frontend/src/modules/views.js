// @ts-check
import { platformModuleCatalog } from "./registry.js";
import { composeApplicationViews } from "./moduleCatalog.js";

// One loader per application boundary. Router and login preloading share the same loaders.
const hostViews = {
  customer: () => import("./customer-space/CustomerSurfaceHost.vue"),
  planner: () => import("../App.vue"),
  operations: () => import("../OperationsEntry.vue"),
  workbenches: () => import("../components/WorkbenchPortal.vue"),
  admin: () => import("../components/AdminDashboard.vue"),
  business: () => import("../components/BusinessCustomerPage.vue"),
  legacyBusiness: () => import("./LegacyBusinessPage.vue")
};
export const applicationViews = composeApplicationViews(hostViews, platformModuleCatalog.views);
