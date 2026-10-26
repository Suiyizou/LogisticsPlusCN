import { computed, onScopeDispose, watch } from "vue";
import { businessModules } from "../../modules/registry.js";
import {
  businessSections,
  defaultBusinessSection,
  isBusinessSection,
  readBusinessRoute,
  businessRouteTarget
} from "./businessNavigation.js";

/** Vue Router owns business links and browser history; page refs are its view state. */
export function useBusinessNavigation({
  role,
  modules = businessModules,
  route,
  router,
  menuItem,
  subView,
  selectedShipmentId,
  selectedCustomerId,
  loadSection,
  onLoadError
}) {
  const sections = computed(() => businessSections(role.value, modules));
  let started = false;
  let disposed = false;
  let locationVersion = 0;
  const isWorkspace = () =>
    route.meta?.workspace === "business" ||
    route.path === "/customers" ||
    (route.path === "/workbenches" && role.value === "OVERSEA_AGENT");
  function applyLocation() {
    if (disposed || !started || !isWorkspace()) return;
    const location = readBusinessRoute(route, role.value, modules);
    if (route.meta?.workspace === "business" && !route.meta.section) {
      void router.replace(businessRouteTarget(router, route, location, modules));
      return;
    }
    const version = ++locationVersion;
    const isCurrent = () => !disposed && version === locationVersion && isWorkspace();
    menuItem.value = location.section;
    subView.value = location.view;
    selectedShipmentId.value = location.shipmentId;
    if (location.customerId) selectedCustomerId.value = location.customerId;
    else if (location.section === "customers") selectedCustomerId.value = "";
    void Promise.resolve()
      .then(() => {
        if (isCurrent()) return loadSection(location.section, location.customerId, { isCurrent });
      })
      .catch((error) => {
        if (isCurrent()) onLoadError?.(error);
      });
  }
  function initialize() {
    if (started || disposed) return;
    started = true;
    applyLocation();
  }
  function move(location) {
    if (disposed || !isWorkspace() || !isBusinessSection(role.value, location.section, modules))
      return false;
    void router.push(businessRouteTarget(router, route, location, modules));
    return true;
  }
  function navigate(section) {
    return move({ section, view: "list" });
  }
  function openShipment(shipmentId) {
    return shipmentId ? move({ section: "shipments", view: "detail", shipmentId }) : false;
  }
  function openCustomer(customerId) {
    return customerId ? move({ section: "customers", view: "detail", customerId }) : false;
  }
  function trackingReturnTo() {
    if (disposed || !isWorkspace()) return "";
    const location = readBusinessRoute(route, role.value, modules);
    if (!isBusinessSection(role.value, location.section, modules)) return "";
    return router.resolve(businessRouteTarget(router, route, location, modules)).fullPath;
  }
  watch(
    () => [
      route.path,
      route.query.section,
      route.query.shipment,
      route.query.customer,
      route.query.view,
      route.params?.shipmentId,
      route.params?.customerId,
      role.value
    ],
    applyLocation
  );
  // Deleted or removed tickets cannot remain in a shareable detail URL.
  watch(selectedShipmentId, (id, previous) => {
    if (
      disposed ||
      !started ||
      !previous ||
      id ||
      menuItem.value !== "shipments" ||
      subView.value !== "detail"
    )
      return;
    subView.value = "list";
    void router.replace(businessRouteTarget(router, route, { section: "shipments" }, modules));
  });
  watch(selectedCustomerId, (id, previous) => {
    if (
      disposed ||
      !started ||
      !previous ||
      id ||
      menuItem.value !== "customers" ||
      subView.value !== "detail"
    )
      return;
    subView.value = "list";
    void router.replace(businessRouteTarget(router, route, { section: "customers" }, modules));
  });
  onScopeDispose(() => {
    disposed = true;
  });
  return {
    sections,
    initialize,
    navigate,
    openShipment,
    openCustomer,
    trackingReturnTo,
    defaultSection: () => defaultBusinessSection(role.value, modules)
  };
}
