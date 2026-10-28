import { updateSchedulePreviewRegistration } from "./update-schedule-preview/module.js";
import { generatedModuleRegistrations } from "./generatedRegistrations.js";
import { adminRegistrations } from "./admin/module.js";
import { customerWorkspaceRegistration } from "./customer-space/module.js";
import { modulesForSurface } from "./moduleCatalog.js";
import { overviewRegistration } from "./overview/module.js";
import { customerRegistration } from "./customers/module.js";
import { handoverRegistration } from "./handover/module.js";
import { shipmentRegistration } from "./shipments/module.js";
import { agentRegistration } from "./agents/module.js";
import { customerSummaryRegistration } from "./examples/customer-summary/module.js";
import { createBusinessModuleCatalog } from "./moduleCatalog.js";
export { validateModules } from "./moduleCatalog.js";

// Generated contributions use the same registration protocol as built-in modules.
const registrations = [
  overviewRegistration,
  updateSchedulePreviewRegistration,
  customerRegistration,
  handoverRegistration,
  shipmentRegistration,
  agentRegistration,
  customerSummaryRegistration,
  ...adminRegistrations,
  customerWorkspaceRegistration,
  ...generatedModuleRegistrations
];
export const platformModuleCatalog = createBusinessModuleCatalog(registrations);
export const platformModules = platformModuleCatalog.modules;
export const businessModuleCatalog = createBusinessModuleCatalog(
  registrations.filter(({ module }) => (module.surface || "business") === "business")
);
export const businessModules = businessModuleCatalog.modules;

export function modulesForRole(role, modules = businessModules) {
  return modulesForSurface(modules, "business", role).map((module) => ({
    ...module,
    labelKey: role === "OVERSEA_AGENT" ? module.agentLabelKey || module.labelKey : module.labelKey,
    routeName: module.pages.find((page) => page.path === "").name
  }));
}

export function moduleDestination(location, modules = businessModules) {
  const module = modules.find((item) => item.enabled !== false && item.id === location.section);
  if (!module) return null;
  const selection = location.shipmentId
    ? "shipmentId"
    : location.customerId && location.view === "detail"
      ? "customerId"
      : "";
  const page = module.pages.find((item) =>
    selection ? item.selection === selection : item.path === ""
  );
  return page
    ? { name: page.name, params: selection ? { [selection]: location[selection] } : {} }
    : null;
}

// Undefined roles mean any authenticated user; an empty list grants nobody access.
export function canAccessRoute(routeOrMeta, role) {
  if (!role) return false;
  const policies = routeOrMeta.matched?.map((record) => record.meta) || [routeOrMeta];
  return policies.every((meta) => !meta.roles || meta.roles.includes(role));
}
export function operationsHome(role) {
  return role === "OVERSEA_AGENT" ? "/customers" : "/workbenches";
}

/** Preserve an authorized in-app deep link across the login gate. */
export function postLoginDestination(route, role) {
  if (
    route?.name &&
    route.name !== "workbenches" &&
    route.matched?.length &&
    typeof route.fullPath === "string" &&
    route.fullPath.startsWith("/") &&
    !route.fullPath.startsWith("//") &&
    canAccessRoute(route, role)
  )
    return route.fullPath;
  return operationsHome(role);
}
