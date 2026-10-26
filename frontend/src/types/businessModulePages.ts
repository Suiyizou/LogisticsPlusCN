import type { createCustomerModulePages } from "../modules/customers/createCustomerModulePages.js";
import type { createShipmentModulePages } from "../modules/shipments/createShipmentModulePages.js";
import type { createAgentModulePages } from "../modules/agents/createAgentModulePages.js";
import type { createHandoverModulePages } from "../modules/handover/createHandoverModulePages.js";

/** Shapes are inferred from the runtime factories, so removing a page port breaks its consumer. */
export interface BusinessModulePageMap {
  customers: ReturnType<typeof createCustomerModulePages>;
  shipments: ReturnType<typeof createShipmentModulePages>;
  agents: ReturnType<typeof createAgentModulePages>;
  handover: ReturnType<typeof createHandoverModulePages>;
  overview: { readFallback: () => unknown };
}
