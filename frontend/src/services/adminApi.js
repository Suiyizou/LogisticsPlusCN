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

export async function changeOwnPassword(currentPassword, newPassword) {
  return request("/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword }
  });
}

export async function updateOwnProfile(displayName) {
  return request("/auth/profile", {
    method: "PATCH",
    body: { displayName }
  });
}

export async function fetchEmployees(options = {}) {
  return request(`/admin/employees?${pageParams(options)}`);
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

export async function fetchDevices(options = {}) {
  return request(`/admin/devices?${pageParams(options)}`);
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

export async function fetchAdminOverview() {
  return request("/admin/overview");
}

export async function fetchAuditLog(options = {}) {
  return request(`/admin/audit-log?${pageParams(options)}`);
}

export async function fetchPlatformInfo(options = {}) {
  return request(`/admin/platform-info?${pageParams(options)}`);
}

export async function deletePlatformCustomer(id) {
  return request(`/business/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAdminAnnouncements(options = {}) {
  return request(`/admin/announcements?${pageParams(options)}`);
}

export async function createAdminAnnouncement(payload) {
  return request("/admin/announcements", { method: "POST", body: payload });
}

export async function updateAdminAnnouncement(id, payload) {
  return request(`/admin/announcements/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload
  });
}

export async function deleteAdminAnnouncement(id) {
  return request(`/admin/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function publishAdminAnnouncement(id) {
  return request(`/admin/announcements/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function disableAdminAnnouncement(id) {
  return request(`/admin/announcements/${encodeURIComponent(id)}/disable`, { method: "POST" });
}

export async function uploadAdminAnnouncementImage(file) {
  const body = new FormData();
  body.append("file", file);
  return request("/admin/announcement-images", { method: "POST", body });
}

function pageParams(options = {}) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(0, Number(options.page || 0))));
  params.set("size", String(Math.max(1, Number(options.size || 20))));
  return params.toString();
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

export async function fetchAdminShipmentFileBlob(id) {
  const path = `/admin/shipment-files/${encodeURIComponent(id)}/download`;
  const response = await fetchWithApiFallback(path, {}, configuredBase);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return response.blob();
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
  const multipart = options.body instanceof FormData;
  return requestJson(path, {
    method: options.method || "GET",
    headers: multipart ? {} : { "Content-Type": "application/json" },
    body: options.body
  }, configuredBase);
}
