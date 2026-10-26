import { storedToken } from "./authSession";

// Preserve the tracking diagnostic payload on HTTP failures; the detail feature
// presents the carrier response before turning it into an actionable error.
export async function requestBusinessTracking(payload, signal) {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  const response = await fetch(`${apiBase}/api/public/shipments/track`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-Auth-Token": storedToken() },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
