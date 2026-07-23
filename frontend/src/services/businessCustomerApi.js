import { requestJson } from "./apiClient";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

export function fetchBusinessCustomers() {
  return request("/business/customers");
}

export function createBusinessCustomer(payload) {
  return request("/business/customers", { method: "POST", body: payload });
}

export function batchCreateBusinessCustomers(payload) {
  return request("/business/customers/batch", { method: "POST", body: payload });
}

export function fetchCustomerTransferAgents() {
  return request("/business/customers/transfer-agents");
}

export function transferBusinessCustomers(payload) {
  return request("/business/customers/transfer", { method: "POST", body: payload });
}

export function fetchCustomerRelationships() {
  return request("/business/customer-relationships");
}

export function fetchCustomerHandoverRequests() {
  return request("/business/customer-relationships/handover-requests");
}

export function createCustomerHandoverRequest(payload) {
  return request("/business/customer-relationships/handover-requests", {
    method: "POST",
    body: payload
  });
}

export function decideCustomerHandoverRequest(requestId, payload) {
  return request(
    `/business/customer-relationships/handover-requests/${encodeURIComponent(requestId)}/decision`,
    { method: "POST", body: payload }
  );
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

export function resetBusinessCustomerPassword(customerId, password) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/reset-password`, {
    method: "POST",
    body: { password }
  });
}

export function fetchBusinessCustomerShipments(customerId) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/shipments`);
}

export function fetchOverseaAgentLinkedCustomers(customerId) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/linked-customers`);
}

export function updateOverseaAgentLinkedCustomers(customerId, customerIds) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/linked-customers`, {
    method: "PUT",
    body: { customerIds }
  });
}

export function fetchAvailableBusinessShipments({
  page = 1,
  pageSize = 20,
  customerId = "",
  refreshIssuesOnly = false
} = {}) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (customerId) query.set("customerId", customerId);
  if (refreshIssuesOnly) query.set("refreshIssuesOnly", "true");
  return request(`/business/shipments?${query}`);
}

export function createShipmentRefreshAllTask(channel = "AUTO") {
  return request("/business/shipments/refresh-all", {
    method: "POST",
    body: { channel }
  });
}

export function createShipmentBatchRefreshTask(shipmentIds, channel = "AUTO") {
  return request("/business/shipments/batch-refresh", {
    method: "POST",
    body: { shipmentIds, channel }
  });
}

export function createShipmentBatchTask(payload) {
  return request("/business/shipment-batch-tasks", { method: "POST", body: payload });
}

export function fetchShipmentBatchTask(taskId) {
  return request(`/business/shipment-batch-tasks/${encodeURIComponent(taskId)}`);
}

export function cancelShipmentBatchTask(taskId) {
  return request(`/business/shipment-batch-tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });
}

export function fetchBusinessShipmentSnapshot(shipmentId) {
  return request(`/business/shipments/${encodeURIComponent(shipmentId)}`);
}

export function fetchPendingClientMatches() {
  return request("/business/customers/pending-client-matches");
}

export function resolvePendingClientMatch(matchId, customerId) {
  return request(`/business/customers/pending-client-matches/${encodeURIComponent(matchId)}/resolve`, {
    method: "POST",
    body: { customerId }
  });
}

export function createBusinessShipment(payload) {
  return request("/business/customers/shipments", { method: "POST", body: payload });
}

export function updateBusinessShipment(shipmentId, payload) {
  return request(`/business/customers/shipments/${encodeURIComponent(shipmentId)}`, {
    method: "PATCH",
    body: payload
  });
}

export function updateBusinessShipmentManualSnapshot(shipmentId, payload) {
  return request(`/business/customers/shipments/${encodeURIComponent(shipmentId)}/manual-snapshot`, {
    method: "POST",
    body: payload
  });
}

export function batchUpdateBusinessShipmentFields(items) {
  return request("/business/customers/shipments/batch-business-fields", {
    method: "PATCH",
    body: { items }
  });
}

export function invalidateBusinessShipmentSnapshot(shipmentId, reason) {
  return request(`/business/customers/shipments/${encodeURIComponent(shipmentId)}/invalidate-snapshot`, {
    method: "POST",
    body: { reason }
  });
}

export function setBusinessShipmentPublication(customerId, shipmentId, published) {
  return request(
    `/business/customers/${encodeURIComponent(customerId)}/shipments/${encodeURIComponent(shipmentId)}/publication`,
    { method: "PATCH", body: { published } }
  );
}

export function deleteBusinessShipment(shipmentId) {
  return request(`/business/customers/shipments/${encodeURIComponent(shipmentId)}`, {
    method: "DELETE"
  });
}

export function batchDeleteBusinessShipments(shipmentIds) {
  return request("/business/shipments/batch-delete", {
    method: "POST",
    body: { shipmentIds }
  });
}

export function updateBusinessShipmentNote(shipmentId, note) {
  return request(`/business/customers/shipments/${encodeURIComponent(shipmentId)}/note`, {
    method: "PATCH",
    body: { note }
  });
}


export function bindBusinessCustomerShipment(customerId, payload) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/shipments`, {
    method: "POST",
    body: payload
  });
}

export function batchBindBusinessCustomerShipments(customerId, shipmentIds) {
  return request(`/business/customers/${encodeURIComponent(customerId)}/shipments/batch`, {
    method: "POST",
    body: { shipmentIds }
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
