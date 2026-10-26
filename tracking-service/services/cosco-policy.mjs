import { isCoscoProtectionError } from "../lib/cosco-errors.mjs";
export function isIndependentCoscoPlaywrightProxy(playwrightProxy, apiProxy) {
  if (!playwrightProxy?.server) return false;
  if (!apiProxy?.server) return true;
  try {
    const playwrightUrl = new URL(playwrightProxy.server);
    const apiUrl = new URL(apiProxy.server);
    return (
      playwrightUrl.host.toLowerCase() !== apiUrl.host.toLowerCase() ||
      String(playwrightProxy.username ?? "") !== String(apiProxy.username ?? "")
    );
  } catch {
    return false;
  }
}

export function parseRetryAfter(value, now = Date.now()) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1_000, Math.ceil(seconds * 1_000));
  }
  const date = Date.parse(normalized);
  return Number.isFinite(date) ? Math.max(1_000, date - now) : null;
}

export function shouldRotateCoscoProxy(error) {
  return (
    isCoscoProtectionError(error) ||
    [502, 503, 504].includes(error?.status) ||
    error?.details?.code === "COSCO_PROXY_UNAVAILABLE" ||
    error?.details?.code === "COSCO_CHANNELS_UNAVAILABLE" ||
    error?.details?.code === "COSCO_SUPPLEMENTAL_UNAVAILABLE"
  );
}

export function shouldFallbackCoscoAutoToProxy(error) {
  const message = String(error?.message ?? "");
  return (
    shouldRotateCoscoProxy(error) ||
    [502, 503, 504].includes(error?.status) ||
    /timeout|timed out|fetch failed|network|socket|econn|enet|ehost/i.test(message)
  );
}
