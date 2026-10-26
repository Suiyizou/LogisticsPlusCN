import { businessModules, modulesForRole, moduleDestination } from "../../modules/registry.js";

// Menu rendering, links and URL validation use the module registry's role policy.
export function businessSections(role, modules = businessModules) {
  return modulesForRole(role, modules);
}
export function defaultBusinessSection(role, modules = businessModules) {
  return businessSections(role, modules)[0]?.id || "";
}
export function isBusinessSection(role, section, modules = businessModules) {
  return businessSections(role, modules).some((item) => item.id === section);
}
function queryText(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}
export function readBusinessLocation(query, role, modules = businessModules) {
  const requestedSection = queryText(query.section);
  let section = isBusinessSection(role, requestedSection, modules)
    ? requestedSection
    : defaultBusinessSection(role, modules);
  const shipmentId = isBusinessSection(role, "shipments", modules) ? queryText(query.shipment) : "";
  const customerId = isBusinessSection(role, "customers", modules) ? queryText(query.customer) : "";
  if (shipmentId) section = "shipments";
  else if (customerId && !isBusinessSection(role, requestedSection, modules)) section = "customers";
  // Legacy customer links select a customer in the list; explicit detail links carry view=detail.
  const detail = Boolean(
    shipmentId || (section === "customers" && customerId && queryText(query.view) === "detail")
  );
  return { section, view: detail ? "detail" : "list", shipmentId, customerId };
}
export function businessLocationQuery(query, location) {
  const next = { ...query };
  for (const key of ["section", "shipment", "customer", "view"]) delete next[key];
  if (location.section) next.section = location.section;
  if (location.section === "shipments" && location.shipmentId) next.shipment = location.shipmentId;
  if (location.section === "customers" && location.customerId) {
    next.customer = location.customerId;
    if (location.view === "detail") next.view = "detail";
  }
  return next;
}

export function readBusinessRoute(route, role, modules = businessModules) {
  if (!route.meta?.section) return readBusinessLocation(route.query, role, modules);
  const section = route.meta.section;
  if (!isBusinessSection(role, section, modules)) return readBusinessLocation({}, role, modules);
  return readBusinessLocation(
    {
      section,
      shipment: section === "shipments" ? route.params?.shipmentId : "",
      customer: section === "customers" ? route.params?.customerId || route.query.customer : "",
      view: route.params?.customerId ? "detail" : "list"
    },
    role,
    modules
  );
}

export function businessRouteTarget(router, route, location, modules = businessModules) {
  const destination = moduleDestination(location, modules);
  if (destination && router.hasRoute(destination.name)) {
    const query = { ...route.query };
    for (const key of ["section", "shipment", "customer", "view"]) delete query[key];
    if (location.section === "customers" && location.view !== "detail" && location.customerId)
      query.customer = location.customerId;
    return { ...destination, query, hash: route.hash };
  }
  // Compatibility for workbenches that have not yet adopted registered page routes.
  return {
    path: route.path,
    query: businessLocationQuery(route.query, location),
    hash: route.hash
  };
}
