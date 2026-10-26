import { authHeaders, clearSession, storedToken } from "./authSession";

export const API_ERROR_EVENT = "app-api-error";

const handledApiErrors = new WeakSet();
const pendingApiErrorNotices = new WeakMap();

export function markApiErrorHandled(error) {
  if (!isObjectError(error)) return;
  handledApiErrors.add(error);
  const timer = pendingApiErrorNotices.get(error);
  if (timer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(timer);
    pendingApiErrorNotices.delete(error);
  }
}

export function apiBaseCandidates(configuredBase) {
  if (configuredBase) return [normalizeBase(configuredBase)];
  return ["/api"];
}

export async function requestJson(path, options = {}, configuredBase = "") {
  const candidates = apiBaseCandidates(configuredBase);
  const identity = requestIdentity(options);
  let lastError;
  let routingError;
  for (const base of candidates) {
    try {
      return await requestJsonOnce(base, path, options, identity);
    } catch (error) {
      lastError = error;
      if (!routingError && isApiRoutingError(error)) routingError = error;
      if (!error.retryable) break;
    }
  }
  const finalError = routingError || lastError;
  scheduleGlobalErrorNotice(finalError);
  throw finalError;
}

export async function fetchWithApiFallback(path, options = {}, configuredBase = "") {
  const candidates = apiBaseCandidates(configuredBase);
  const identity = requestIdentity(options);
  let lastError;
  let routingError;
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: identity.headers
      });
      identity.assertCurrent();
      if (response.ok && !isHtmlResponse(response))
        return guardResponseBody(response, identity.assertCurrent);
      const message = await readResponseError(response);
      identity.assertCurrent();
      if (response.status === 401 && !options.ignoreAuthExpiry) {
        clearSession();
        window.dispatchEvent(new CustomEvent("auth-expired"));
      }
      const error = createApiError(message, {
        status: response.status,
        retryable: response.ok || shouldRetryStatus(response.status),
        url: response.url
      });
      throw error;
    } catch (error) {
      lastError = normalizeNetworkError(error);
      if (!routingError && isApiRoutingError(lastError)) routingError = lastError;
      if (!lastError.retryable) break;
    }
  }
  const finalError = routingError || lastError;
  scheduleGlobalErrorNotice(finalError);
  throw finalError;
}

function isHtmlResponse(response) {
  return /text\/html/i.test(response.headers.get("content-type") || "");
}

export async function readResponseError(response) {
  const text = await response.text();
  if (!text) return `API ${response.status}`;
  try {
    return JSON.parse(text)?.message || text;
  } catch {
    return nonJsonMessage(text, response.url);
  }
}

async function requestJsonOnce(base, path, options, identity) {
  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(!options.headers ? { "Content-Type": "application/json" } : {}),
      ...identity.headers
    },
    body: normalizeBody(options.body)
  });
  identity.assertCurrent();
  const text = await response.text();
  identity.assertCurrent();
  const data = parseJson(text, response.url);
  if (!response.ok) {
    if (response.status === 401 && !options.ignoreAuthExpiry) {
      clearSession();
      window.dispatchEvent(new CustomEvent("auth-expired"));
    }
    const error = createApiError(data?.message || `API ${response.status}`, {
      status: response.status,
      retryable: shouldRetryStatus(response.status) && !data?.message,
      data,
      url: response.url
    });
    throw error;
  }
  return data;
}

function parseJson(text, url) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(nonJsonMessage(text, url));
    error.retryable = true;
    throw error;
  }
}

function normalizeBody(body) {
  if (!body) return undefined;
  if (body instanceof FormData) return body;
  return typeof body === "string" ? body : JSON.stringify(body);
}

function normalizeBase(base) {
  return String(base || "/api").replace(/\/$/, "");
}

function shouldRetryStatus(status) {
  return [404, 405, 502, 503, 504].includes(status);
}

function normalizeNetworkError(error) {
  if (error.name === "AbortError") {
    error.retryable = false;
    return error;
  }
  if (error.retryable !== undefined) return error;
  error.retryable = true;
  return error;
}

function requestIdentity(options) {
  const token = storedToken();
  return {
    headers: { ...authHeaders(), ...(options.headers || {}) },
    assertCurrent() {
      // Logout deliberately addresses its captured old token after local revocation.
      if (!options.ignoreAuthExpiry && storedToken() !== token)
        throw new DOMException("Employee identity changed", "AbortError");
    }
  };
}

function guardResponseBody(response, assertCurrent) {
  // Downloads may finish reading a streamed body after another login. Preserve the
  // native Response contract while applying the same identity check to body reads.
  for (const name of ["arrayBuffer", "blob", "bytes", "formData", "json", "text"]) {
    if (typeof response[name] !== "function") continue;
    const read = response[name].bind(response);
    Object.defineProperty(response, name, {
      configurable: true,
      value: async (...args) => {
        assertCurrent();
        const value = await read(...args);
        assertCurrent();
        return value;
      }
    });
  }
  if (typeof response.clone === "function") {
    const clone = response.clone.bind(response);
    Object.defineProperty(response, "clone", {
      configurable: true,
      value: () => {
        assertCurrent();
        return guardResponseBody(clone(), assertCurrent);
      }
    });
  }
  return response;
}

function createApiError(message, { status, retryable, data, url } = {}) {
  const error = new Error(message);
  error.name = "ApiClientError";
  error.apiError = true;
  error.status = status;
  error.retryable = Boolean(retryable);
  error.code = data?.code;
  error.errorId = data?.errorId;
  error.retryAfterMs = data?.retryAfterMs;
  error.url = url;
  return error;
}

export function notifyApiFailure(error) {
  scheduleGlobalErrorNotice(error);
}

function scheduleGlobalErrorNotice(error) {
  if (!shouldNotifyApiError(error) || typeof window === "undefined") return;
  const timer = window.setTimeout(() => {
    pendingApiErrorNotices.delete(error);
    if (handledApiErrors.has(error)) return;
    window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: { error } }));
  }, 200);
  pendingApiErrorNotices.set(error, timer);
}

function shouldNotifyApiError(error) {
  if (!isObjectError(error) || handledApiErrors.has(error)) return false;
  if (error.name === "AbortError" || error.status === 401) return false;
  return true;
}

function isObjectError(error) {
  return (typeof error === "object" && error !== null) || typeof error === "function";
}

function isApiRoutingError(error) {
  return /\/api 未代理到后端|没有返回 JSON/.test(error.message || "");
}

function nonJsonMessage(text, url) {
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 80);
  if (/^<!doctype html|^<html|<body|<head/i.test(snippet)) {
    return `后端接口没有返回 JSON，可能是 /api 未代理到后端：${url}`;
  }
  return `后端接口返回了无法解析的内容：${snippet || "空响应"}`;
}
