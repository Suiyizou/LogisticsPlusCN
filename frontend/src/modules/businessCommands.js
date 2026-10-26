// @ts-check
import { onScopeDispose } from "vue";

/** Cross-module ports carry IDs, never another module's writable refs. */
/**
 * @param {{
 * navigation: {
 *   openCustomer: (id: string) => boolean,
 *   openShipment: (id: string) => boolean
 * },
 * refreshCustomers: () => unknown | Promise<unknown>,
 * refreshShipments: () => unknown | Promise<unknown>
 * }} inputs
 */
export function useBusinessCommands({ navigation, refreshCustomers, refreshShipments }) {
  let disposed = false;
  /** @param {"openCustomer" | "openShipment"} method @param {string} id */
  const open = (method, id) => {
    const value = typeof id === "string" ? id.trim() : "";
    return !disposed && value ? navigation[method](value) : false;
  };
  async function refreshShipmentRelations() {
    if (disposed) return false;
    // Attempt both independent reads, even if one fails. Never report a partial refresh as success.
    const results = await Promise.allSettled([
      Promise.resolve().then(() => !disposed && refreshCustomers()),
      Promise.resolve().then(() => !disposed && refreshShipments())
    ]);
    if (disposed) return false;
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    return results.every((result) => result.status === "fulfilled" && result.value !== false);
  }
  onScopeDispose(() => {
    disposed = true;
  });
  return Object.freeze({
    openCustomer: (/** @type {string} */ id) => open("openCustomer", id),
    openShipment: (/** @type {string} */ id) => open("openShipment", id),
    refreshShipmentRelations
  });
}
