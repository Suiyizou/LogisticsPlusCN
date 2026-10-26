import { customerSurfaceFallback } from "./customerCopy.js";

/** Customer transport never reads employee sessions and never accepts arbitrary route families. */
export function createCustomerApi({
  readToken,
  clearSession,
  fetchImpl = globalThis.fetch,
  baseUrl = "/api",
  t = customerSurfaceFallback
}) {
  async function send(
    path,
    { method = "GET", body, signal, token = readToken() } = {},
    login = false
  ) {
    const decodedPath = decodeURIComponent(path.split(/[?#]/, 1)[0]);
    if (
      !login &&
      (!decodedPath.startsWith("/customer/") ||
        decodedPath.includes("..") ||
        decodedPath.includes("\\"))
    )
      throw Error("Customer API route is outside its scope");
    if (!login && !token) throw Object.assign(Error(t("customerSurface.expired")), { status: 401 });
    const owner = readToken();
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(!login ? { "X-Customer-Token": token } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!login && readToken() !== owner)
      throw new DOMException("Customer identity changed", "AbortError");
    let data;
    try {
      data = await response.json();
    } catch {
      if (response.status === 401 && !login && readToken() === token) clearSession();
      throw Object.assign(Error(t("customerSurface.invalidResponse")), { status: response.status });
    }
    if (!login && readToken() !== owner)
      throw new DOMException("Customer identity changed", "AbortError");
    if (!response.ok) {
      if (response.status === 401 && !login && readToken() === token) clearSession();
      throw Object.assign(Error(data?.message || `API ${response.status}`), {
        status: response.status
      });
    }
    return data;
  }
  return Object.freeze({
    request: (path, options) => send(path, options),
    login: (credentials) =>
      send("/public/customers/login", { method: "POST", body: credentials }, true)
  });
}
