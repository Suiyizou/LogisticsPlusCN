import { createContractClient, contractData } from "./contractClient";
import type { components } from "../generated/platform-api";
export function readCustomerDirectory(signal?: AbortSignal) {
  return contractData(createContractClient("employee").GET("/business/customers", { signal }));
}
export function readCustomerProfile(customerId: string, signal?: AbortSignal) {
  return contractData(
    createContractClient("employee").GET("/business/customers/{customerId}", {
      params: { path: { customerId } },
      signal
    })
  );
}
export function createCustomerProfile(body: components["schemas"]["CustomerProfileCreate"]) {
  return contractData(createContractClient("employee").POST("/business/customers", { body }));
}
export function updateCustomerProfile(
  customerId: string,
  body: components["schemas"]["CustomerProfileUpdate"]
) {
  return contractData(
    createContractClient("employee").PATCH("/business/customers/{customerId}", {
      params: { path: { customerId } },
      body
    })
  );
}
