export const CHANNEL = "logisticspluscn-workspace-v1";
const VIEWS = new Set(["overview", "tracking"]);
function safePath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s]/.test(value)
  )
    return null;
  const url = new URL(value, "https://workspace.invalid");
  return url.origin === "https://workspace.invalid" &&
    /^(?:\/workbenches|\/home|\/planner(?:\/(?:cargos|config|results))?|\/smart-import\/(?:excel|image|text)|\/containers|\/algorithm|\/customers(?:\/[a-z0-9-]+)*|\/admin(?:\/[a-z0-9-]+)*|\/workspace\/tracking\/(?:overview|query|tasks))$/.test(
      url.pathname
    )
    ? url.pathname + url.search + url.hash
    : null;
}
/** Opt-in same-origin bridge. Standalone/shared tracking URLs retain their normal behavior. */
export function createTrackingWorkspaceBridge({
  hostWindow,
  applyRoute,
  applyLocale,
  applyVisibility
}) {
  const embedded =
    new URLSearchParams(hostWindow.location.search).get("embed") === "1" &&
    hostWindow.parent !== hostWindow;
  const origin = hostWindow.location.origin;
  let applyingRoute = false;
  function send(type, data = {}) {
    if (embedded) hostWindow.parent.postMessage({ channel: CHANNEL, type, ...data }, origin);
  }
  async function receive(event) {
    if (
      !embedded ||
      event.origin !== origin ||
      event.source !== hostWindow.parent ||
      event.data?.channel !== CHANNEL
    )
      return;
    const data = event.data;
    if (data.type === "set-route" && VIEWS.has(data.view)) {
      const query = {};
      for (const key of ["carrier", "type", "number", "returnTo"])
        if (typeof data.query?.[key] === "string") query[key] = data.query[key].slice(0, 2048);
      applyingRoute = true;
      try {
        await applyRoute(data.view, query);
      } finally {
        applyingRoute = false;
      }
    } else if (data.type === "set-locale" && ["zh-CN", "en-US"].includes(data.locale))
      applyLocale(data.locale);
    else if (data.type === "visibility" && typeof data.visible === "boolean")
      applyVisibility(data.visible);
  }
  if (embedded) hostWindow.addEventListener("message", receive);
  return {
    embedded,
    ready: () => send("ready"),
    routeChanged: (view, query = {}) => {
      if (!applyingRoute && VIEWS.has(view)) send("route-changed", { view, query });
    },
    navigate: (path) => {
      const target = safePath(path);
      if (!embedded || !target) return false;
      send("navigate", { path: target });
      return true;
    },
    authExpired: (sessionToken) => send("auth-expired", { sessionToken }),
    dispose: () => hostWindow.removeEventListener("message", receive)
  };
}
