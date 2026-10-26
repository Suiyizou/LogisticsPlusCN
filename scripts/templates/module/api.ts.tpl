// Generated from the module contract. Do not edit by hand.
import type { components } from "./platform-api";
import { createContractClient, contractData } from "../services/contractClient";
export type __NAME__Write = components["schemas"]["__NAME__Write"];
export type __NAME__Update = components["schemas"]["__NAME__Update"];
export type __NAME__Response = components["schemas"]["__NAME__Response"];
export function create__NAME__Api() {
  const client = createContractClient("employee");
  return {
    list(page = 0, pageSize = 20, query = "", signal?: AbortSignal) {
      return contractData(client.GET("/business/__ID__", {params:{query:{page,pageSize,query}},signal}));
    },
    create(body: __NAME__Write, signal?: AbortSignal) {
      return contractData(client.POST("/business/__ID__", {body,signal}));
    },
    update(id:string, body:__NAME__Update, signal?:AbortSignal) {
      return contractData(client.PATCH("/business/__ID__/{id}", {params:{path:{id}},body,signal}));
    }
  };
}
