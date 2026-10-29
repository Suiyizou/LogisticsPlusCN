export const TRACKING_BRIDGE = "logisticspluscn-workspace-v1";
export const TRACKING_SOURCE = "/tracking/?embed=1";
export function trackingRoutePayload(route) {
  const query = {};
  for (const key of ["carrier", "type", "number", "returnTo"]) {
    if (typeof route.query?.[key] === "string") query[key] = route.query[key].slice(0, 2048);
  }
  return { view: route.meta?.trackingView === "query" ? "tracking" : "overview", query };
}
export function allowedWorkspaceTarget(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    /[\\\s]/.test(value) ||
    value.startsWith("//")
  )
    return null;
  const url = new URL(value, "https://workspace.invalid");
  if (
    url.origin !== "https://workspace.invalid" ||
    !/^(?:\/workbenches|\/home|\/planner(?:\/(?:cargos|config|results))?|\/smart-import\/(?:excel|image|text)|\/containers|\/algorithm|\/customers(?:\/[a-z0-9-]+)*|\/admin(?:\/[a-z0-9-]+)*|\/workspace\/tracking\/(?:overview|query))$/.test(
      url.pathname
    )
  )
    return null;
  return url.pathname + url.search + url.hash;
}
/** Every received message must come from this exact same-origin frame. */
export function createTrackingParentBridge({
  hostWindow,
  getFrame,
  getRoute,
  getLocale,
  navigate,
  authExpired,
  isVisible,
  getSessionToken,
  getCurrentSessionToken
}) {
  const origin = hostWindow.location.origin;
  let ready = false;
  function send(type, payload = {}) {
    getFrame()?.contentWindow?.postMessage({ channel: TRACKING_BRIDGE, type, ...payload }, origin);
  }
  function sync() {
    if (!ready) return;
    send("visibility", { visible: isVisible() });
    send("set-locale", { locale: getLocale() });
    if (isVisible()) send("set-route", trackingRoutePayload(getRoute()));
  }
  function receive(event) {
    if (
      event.origin !== origin ||
      event.source !== getFrame()?.contentWindow ||
      event.data?.channel !== TRACKING_BRIDGE
    )
      return;
    const data = event.data;
    if (data.type === "ready") {
      ready = true;
      sync();
    } else if (data.type === "auth-expired") {
      const mountedToken = getSessionToken?.();
      const currentToken = getCurrentSessionToken?.();
      if (
        mountedToken &&
        ((data.sessionToken === mountedToken && (!currentToken || currentToken === mountedToken)) ||
          (data.sessionToken === "" && !currentToken))
      )
        authExpired();
    } else if (data.type === "navigate") {
      const path = allowedWorkspaceTarget(data.path);
      if (path) navigate(path);
    } else if (
      data.type === "route-changed" &&
      isVisible() &&
      ["overview", "tracking"].includes(data.view)
    ) {
      const query = {};
      for (const key of ["carrier", "type", "number", "returnTo"]) {
        if (typeof data.query?.[key] === "string") query[key] = data.query[key].slice(0, 2048);
      }
      navigate(
        { path: `/workspace/tracking/${data.view === "tracking" ? "query" : "overview"}`, query },
        true
      );
    }
  }
  hostWindow.addEventListener("message", receive);
  return { sync, dispose: () => hostWindow.removeEventListener("message", receive) };
}
