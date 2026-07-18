import { fetchWithApiFallback, requestJson } from "./apiClient";
import {
  clearSession,
  getDeviceId,
  getDeviceName,
  saveSession,
  storedToken
} from "./authSession";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

export function storedAdminToken() {
  return storedToken();
}

export function saveAdminToken(token) {
  if (token) saveSession({ token });
}

export function clearAdminToken() {
  clearSession();
}

export async function loginAdmin(username, password) {
  const response = await request("/auth/login", {
    method: "POST",
    body: {
      username,
      password,
      deviceId: getDeviceId(),
      deviceName: getDeviceName()
    }
  });
  saveSession(response);
  return response;
}

export async function logoutAdmin() {
  await request("/auth/logout", { method: "POST" });
  clearSession();
}

export async function fetchAdminMe() {
  return request("/auth/me");
}

export async function fetchEmployees() {
  return request("/admin/employees");
}

export async function createEmployee(payload) {
  return request("/admin/employees", { method: "POST", body: payload });
}

export async function updateEmployee(id, payload) {
  return request(`/admin/employees/${id}`, { method: "PATCH", body: payload });
}

export async function resetEmployeePassword(id) {
  return request(`/admin/employees/${id}/reset-password`, { method: "POST" });
}

export async function deleteEmployee(id) {
  return request(`/admin/employees/${id}`, { method: "DELETE" });
}

export async function fetchDevices() {
  return request("/admin/devices");
}

export async function kickDevice(id) {
  return request(`/admin/devices/${id}/kick`, { method: "POST" });
}

export async function deleteDevice(id) {
  return request(`/admin/devices/${id}`, { method: "DELETE" });
}

export async function fetchMonitoring() {
  return request("/admin/monitoring");
}

export async function fetchLlmSettings() {
  return request("/admin/settings/llm");
}

export async function updateLlmSettings(payload) {
  return request("/admin/settings/llm", { method: "PATCH", body: payload });
}

export async function fetchAdminWorkspaceFiles(options = {}) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(0, Number(options.page || 0))));
  params.set("size", String(Math.max(1, Number(options.size || 200))));
  if (options.userId) params.set("userId", options.userId);
  if (options.includeExpired != null) params.set("includeExpired", String(Boolean(options.includeExpired)));
  return request(`/admin/workspace-files?${params.toString()}`);
}

export async function downloadAdminWorkspaceFile(id, fileName = "workspace-file.xlsx") {
  return downloadAdminFile(
    `/admin/workspace-files/${encodeURIComponent(id)}/download`,
    fileName
  );
}

export async function fetchAdminShipmentFiles(options = {}) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(0, Number(options.page || 0))));
  params.set("size", String(Math.max(1, Number(options.size || 200))));
  if (options.shipmentId) params.set("shipmentId", options.shipmentId);
  if (options.uploaderUserId) params.set("uploaderUserId", options.uploaderUserId);
  if (options.includeDeleted != null) params.set("includeDeleted", String(Boolean(options.includeDeleted)));
  return request(`/admin/shipment-files?${params.toString()}`);
}

export async function downloadAdminShipmentFile(id, fileName = "shipment-file") {
  return downloadAdminFile(
    `/admin/shipment-files/${encodeURIComponent(id)}/download`,
    fileName
  );
}

export async function deleteAdminShipmentFile(id) {
  return request(`/admin/shipment-files/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function downloadAdminFile(path, fileName) {
  const response = await fetchWithApiFallback(path, {}, configuredBase);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function request(path, options = {}) {
  return requestJson(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body
  }, configuredBase);
}
