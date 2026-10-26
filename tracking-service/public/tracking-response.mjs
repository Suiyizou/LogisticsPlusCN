const diagnosticCodes = new Set([
  "RATE_LIMITED",
  "UPSTREAM_EMPTY",
  "INVALID_REFERENCE",
  "ADAPTER_FAILURE"
]);

/** Spring's message remains authoritative; legacy adapters can supply nested/string errors. */
export function trackingResponseMessage(payload, response) {
  const directMessage = typeof payload?.message === "string" ? payload.message.trim() : "";
  const nestedMessage =
    typeof payload?.error?.message === "string" ? payload.error.message.trim() : "";
  const stringError = typeof payload?.error === "string" ? payload.error.trim() : "";
  return (
    directMessage ||
    nestedMessage ||
    stringError ||
    `${response?.status ?? ""} ${response?.statusText || "Request failed"}`.trim()
  );
}

export function trackingDiagnosticCode(payload, response) {
  const provided = String(payload?.code ?? payload?.errorCode ?? payload?.error?.code ?? "")
    .trim()
    .toUpperCase();
  if (diagnosticCodes.has(provided)) return provided;
  const status = Number(response?.status);
  if (status === 429 || status === 403) return "RATE_LIMITED";
  if (status === 400) return "INVALID_REFERENCE";
  if (status >= 500) return "ADAPTER_FAILURE";
  return "UPSTREAM_EMPTY";
}

function redactDiagnosticCredentials(value) {
  return value
    .replace(/\b(https?:\/\/)[^\s/?#]*@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+[^\s,;'"<>]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b((?:access[_-]?token|auth[_-]?token|x-auth-token|password|passwd|secret|token|api[_-]?key|authorization|proxy[_-]?password)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&;,]+)/gi,
      "$1[REDACTED]"
    );
}

/** The host owns permissions and translation; unauthorized callers never inspect diagnostics. */
export function trackingDiagnosticMessage(payload, response, { t, canViewDiagnostics = false }) {
  if (canViewDiagnostics !== true) return t("error.customerFriendly");
  const technical = redactDiagnosticCredentials(trackingResponseMessage(payload, response));
  return `${t(`diagnostic.${trackingDiagnosticCode(payload, response)}`)}: ${technical}`;
}

/** Missing endpoint markers allow older deployments to fall back, never an ambiguous business 404. */
export function isPublicTrackingRouteUnavailable(result) {
  const { response, payload } = result ?? {};
  if (response?.status === 405) return true;
  if (response?.status !== 404) return false;
  const headerMarker = response?.headers?.get?.("X-Route-Not-Found");
  if (String(headerMarker ?? "").toLowerCase() === "true") return true;
  if (payload?.routeNotFound === true || payload?.endpointNotFound === true) return true;
  const code = String(payload?.code ?? payload?.errorCode ?? payload?.error?.code ?? "")
    .trim()
    .toUpperCase();
  if (["ROUTE_NOT_FOUND", "ENDPOINT_NOT_FOUND", "NO_HANDLER"].includes(code)) return true;
  const path = String(payload?.path ?? payload?.instance ?? "")
    .split("?", 1)[0]
    .replace(/\/+$/, "");
  const targetsPublicRoute = path === "/api/public/shipments/track";
  const message = trackingResponseMessage(payload, { status: 404, statusText: "" });
  const routeMarker =
    /(?:no\s+(?:static\s+resource|handler|route|endpoint)|route\s+not\s+found|endpoint\s+not\s+found|cannot\s+post)/i;
  const messageNamesPublicRoute = message.includes("/api/public/shipments/track");
  if (routeMarker.test(message) && (targetsPublicRoute || messageNamesPublicRoute)) return true;
  const hasSpecificMessage =
    (typeof payload?.message === "string" && payload.message.trim()) ||
    (typeof payload?.error?.message === "string" && payload.error.message.trim());
  const genericError = typeof payload?.error === "string" ? payload.error.trim() : "";
  return targetsPublicRoute && !hasSpecificMessage && /^not found$/i.test(genericError);
}
