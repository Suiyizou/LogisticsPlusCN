import { inject } from "vue";
/** @type {import("vue").InjectionKey<ReturnType<typeof import("./customerApi.js").createCustomerApi>>} */
export const customerApiKey = Symbol("customer-module-api");
export function useCustomerModuleApi() {
  const api = inject(customerApiKey, null);
  if (!api) throw Error("Customer modules require the isolated customer surface host");
  return api;
}
