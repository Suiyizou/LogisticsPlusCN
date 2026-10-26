import { fetchBusinessCustomers } from "../../../services/businessCustomerApi.js";

// Read-only adapter to an existing authorized endpoint; no fictional API or second cache.
export async function readCustomerSummary() {
  const response = await fetchBusinessCustomers();
  return Array.isArray(response?.items) ? response.items : [];
}
