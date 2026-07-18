import { requestJson } from "./apiClient";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

export function fetchBusinessCustomers() {
  return request("/business/customers");
}

export function createBusinessCustomer(payload) {
  return request("/business/customers", { method: "POST", body: payload });
}

export function updateBusinessCustomer(customerId, payload) {
  return request(`/business/customers/${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    body: payload
  });
}

export function deleteBusinessCustomer(customerId) {
  return request(`/business/customers/${encodeURIComponent(customerId)}`, { method: "DELETE" });
}

export function resetBusinessCustomerCode(customerId) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/reset-code`, { method: "POST" });
}

export function fetchBusinessCustomerShipments(customerId) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/shipments`);
}

export function bindBusinessCustomerShipment(customerId, payload) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/shipments`, {
    method: "POST",
    body: payload
  });
}

export function unbindBusinessCustomerShipment(customerId, shipmentId) {
  return request(
    `/business/customers/${encodeURIComponent(customerId)}/shipments/${encodeURIComponent(shipmentId)}`,
    { method: "DELETE" }
  );
}

function request(path, options = {}) {
  return requestJson(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body
  }, configuredBase);
}
