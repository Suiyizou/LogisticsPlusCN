import { platformModules } from "./registry.js";

// An explicit development switch; the example is never enabled in production.
export const configuredPlatformModules = platformModules.map((module) =>
  module.id === "customer-summary-example"
    ? {
        ...module,
        enabled: Boolean(
          import.meta.env?.DEV && import.meta.env?.VITE_ENABLE_MODULE_EXAMPLE === "true"
        )
      }
    : module
);

export const configuredBusinessModules = configuredPlatformModules.filter(
  (module) => (module.surface || "business") === "business"
);
