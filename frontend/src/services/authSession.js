const TOKEN_KEY = "cargo-planner-auth-token";
const USER_KEY = "cargo-planner-auth-user";
const EXPIRES_KEY = "cargo-planner-auth-expires-at";
const DEVICE_KEY = "cargo-planner-device-id";
const LEGACY_TOKEN_COOKIE_KEY = "cargo_planner_auth_token";

function clearLegacyTokenCookie() {
  try {
    document.cookie = `${LEGACY_TOKEN_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // Keep local session handling available when cookies are unavailable.
  }
}

clearLegacyTokenCookie();

export function storedToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function storedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function storedExpiresAt() {
  return localStorage.getItem(EXPIRES_KEY) || "";
}

export function saveSession(response) {
  if (!response?.token) return;
  localStorage.setItem(TOKEN_KEY, response.token);
  localStorage.setItem(USER_KEY, JSON.stringify(response.user || null));
  if (response.expiresAt) localStorage.setItem(EXPIRES_KEY, response.expiresAt);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  clearLegacyTokenCookie();
}

export function isSessionExpired() {
  const expiresAt = storedExpiresAt();
  return Boolean(expiresAt && Date.now() >= new Date(expiresAt).getTime());
}

export function authHeaders() {
  const token = storedToken();
  return token ? { "X-Auth-Token": token } : {};
}

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceName() {
  const platform = navigator.platform || "Web";
  const browser = navigator.userAgentData?.brands?.[0]?.brand || navigator.userAgent.split(" ")[0] || "Browser";
  return `${platform} / ${browser}`;
}
