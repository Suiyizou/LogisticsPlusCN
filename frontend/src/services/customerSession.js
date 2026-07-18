import { apiBaseCandidates } from "./apiClient";

const CUSTOMER_TOKEN_KEY = "cargo-planner-customer-token";
const CUSTOMER_SESSION_KEY = "cargo-planner-customer-session";

export function storedCustomerToken() {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY) || "";
}

export function storedCustomerSession() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveCustomerSession(response) {
  if (!response?.token) return;
  localStorage.setItem(CUSTOMER_TOKEN_KEY, response.token);
  localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({
    customer: response.customer || null,
    expiresAt: response.expiresAt || ""
  }));
}

export function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_SESSION_KEY);
}

export function isCustomerSessionExpired() {
  const expiresAt = storedCustomerSession()?.expiresAt;
  return Boolean(expiresAt && Date.now() >= new Date(expiresAt).getTime());
}

export async function loginCustomer(customerCode) {
  const configuredBase = import.meta.env.VITE_API_BASE_URL;
  let lastError;
  for (const base of apiBaseCandidates(configuredBase)) {
    try {
      const response = await fetch(`${base}/public/customers/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode })
      });
      const data = await readJson(response);
      if (!response.ok) {
        const error = new Error(data?.message || `API ${response.status}`);
        error.status = response.status;
        error.retryable = [404, 405, 502, 503, 504].includes(response.status);
        throw error;
      }
      saveCustomerSession(data);
      return data;
    } catch (error) {
      lastError = error;
      if (!error?.retryable) break;
    }
  }
  throw lastError || new Error("Customer login failed");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(`API ${response.status}`);
    error.retryable = true;
    throw error;
  }
}
