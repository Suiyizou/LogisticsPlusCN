// Generated from the module contract. Do not edit by hand.
import type { components } from "./platform-api";
import { createContractClient, contractData } from "../services/contractClient";
export type ServiceCatalogWrite = components["schemas"]["ServiceCatalogWrite"];
export type ServiceCatalogUpdate = components["schemas"]["ServiceCatalogUpdate"];
export type ServiceCatalogResponse = components["schemas"]["ServiceCatalogResponse"];
export function createServiceCatalogApi() {
  const client = createContractClient("employee");
  return {
    list(page = 0, pageSize = 20, query = "", signal?: AbortSignal) {
      return contractData(
        client.GET("/business/service-catalog", {
          params: { query: { page, pageSize, query } },
          signal
        })
      );
    },
    create(body: ServiceCatalogWrite, signal?: AbortSignal) {
      return contractData(client.POST("/business/service-catalog", { body, signal }));
    },
    update(id: string, body: ServiceCatalogUpdate, signal?: AbortSignal) {
      return contractData(
        client.PATCH("/business/service-catalog/{id}", { params: { path: { id } }, body, signal })
      );
    }
  };
}
