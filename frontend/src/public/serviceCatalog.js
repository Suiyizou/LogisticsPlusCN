import { configuredPlatformModules } from "../modules/configuredRegistry.js";
import { canAccessRoute } from "../modules/registry.js";

export const serviceGroups = [
  { id: "transport", services: ["transport", "planning", "containers", "booking"] },
  { id: "business", services: ["operations", "shipments", "customers", "agents"] },
  { id: "collaboration", services: ["handover", "files", "customerportal", "administration"] }
];

const definitions = [
  {
    id: "transport",
    group: "transport",
    icon: "location",
    access: "public",
    layout: "tracking",
    image: "transport"
  },
  {
    id: "planning",
    group: "transport",
    icon: "box",
    access: "authenticated",
    entry: "/planner/cargos",
    layout: "planning",
    image: "planning"
  },
  {
    id: "containers",
    group: "transport",
    icon: "equipment",
    access: "authenticated",
    entry: "/containers",
    layout: "containers",
    image: "planning"
  },
  {
    id: "booking",
    group: "transport",
    icon: "ship",
    access: "external",
    entry: "http://booking.dreweslogistics.com/login",
    layout: "external",
    image: "transport"
  },
  {
    id: "operations",
    group: "business",
    icon: "chart",
    moduleId: "overview",
    layout: "overview",
    image: "collaboration"
  },
  {
    id: "shipments",
    group: "business",
    icon: "document",
    moduleId: "shipments",
    layout: "shipment",
    image: "transport"
  },
  {
    id: "customers",
    group: "business",
    icon: "users",
    moduleId: "customers",
    layout: "relationships",
    image: "collaboration"
  },
  {
    id: "agents",
    group: "business",
    icon: "globe",
    moduleId: "agents",
    layout: "agents",
    image: "collaboration"
  },
  {
    id: "handover",
    group: "collaboration",
    icon: "transfer",
    moduleId: "handover",
    layout: "handover",
    image: "collaboration"
  },
  {
    id: "files",
    group: "collaboration",
    icon: "folder",
    moduleId: "shipments",
    access: "context",
    layout: "files",
    image: "collaboration"
  },
  {
    id: "customerportal",
    group: "collaboration",
    icon: "user",
    moduleId: "customer-shipments",
    layout: "customer",
    image: "collaboration"
  },
  {
    id: "administration",
    group: "collaboration",
    icon: "settings",
    moduleId: "admin-overview",
    layout: "administration",
    image: "collaboration"
  }
];

function modulePath(module) {
  const base =
    module.surface === "admin"
      ? "/admin"
      : module.surface === "customer"
        ? "/customer-workspace"
        : "/customers";
  return base + "/" + module.mount;
}

// Marketing metadata consumes the registered module contract; it never grants access.
export const publicServices = definitions.flatMap((definition) => {
  const module =
    definition.moduleId &&
    configuredPlatformModules.find(
      (item) => item.id === definition.moduleId && item.enabled !== false
    );
  if (definition.moduleId && !module) return [];
  return [
    {
      ...definition,
      access: definition.access || "registered",
      entry: definition.entry || (module ? modulePath(module) : ""),
      roles: module ? module.roles : undefined,
      detailPath: "/services/" + definition.id
    }
  ];
});

export function findPublicService(id) {
  return publicServices.find((service) => service.id === id);
}

export function serviceEntry(service, role, trackingPath = "/tracking/") {
  if (service.id === "transport")
    return {
      href: trackingPath.split("#")[0] + "#tracking",
      allowed: true,
      external: false
    };
  if (service.access === "external") return { href: service.entry, allowed: true, external: true };
  if (service.access === "context") {
    return {
      href: trackingPath.split("#")[0] + "#tracking",
      allowed: true,
      external: false
    };
  }
  const allowed =
    !role ||
    (service.access === "authenticated"
      ? role !== "CUSTOMER" && canAccessRoute({}, role)
      : canAccessRoute({ roles: service.roles }, role));
  return {
    href: allowed
      ? service.entry
      : role === "CUSTOMER"
        ? "/customer-workspace/shipments"
        : "/workbenches",
    allowed,
    external: false
  };
}

export const serviceImages = {
  transport: "/brand/v2/maritime-640.webp",
  planning: "/brand/v2/loading-640.webp",
  collaboration: "/brand/v2/collaboration-640.webp"
};
