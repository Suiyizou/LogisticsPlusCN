import { HttpError } from "./http-utils.mjs";

/** COSCO 上游访问、熔断与代理路由。从 server.mjs 下沉为工厂。 */
export function createCoscoUpstream({
  circuitBreakers,
  proxyClient,
  cookieStates,
  networkCoreTimeoutMs,
  proxyNetworkCoreTimeoutMs,
  networkEnrichmentTimeoutMs,
  proxyNetworkEnrichmentTimeoutMs,
  fetchDirect = (...args) => fetch(...args)
}) {
  function coscoCoreTimeoutMs(options = {}) {
    return options.proxyMode ? proxyNetworkCoreTimeoutMs : networkCoreTimeoutMs;
  }

  function coscoEnrichmentTimeoutMs(options = {}) {
    return options.proxyMode ? proxyNetworkEnrichmentTimeoutMs : networkEnrichmentTimeoutMs;
  }

  function coscoRouteKey(options = {}) {
    return options.proxyMode ? "PROXY" : "DIRECT";
  }

  function coscoCircuitBreakerFor(options = {}) {
    return circuitBreakers[coscoRouteKey(options)];
  }

  function coscoBlockedHttpError(options = {}) {
    const breaker = coscoCircuitBreakerFor(options);
    const retryAfterMs = Math.max(1_000, breaker.remainingMs());
    return new HttpError(503, "COSCO temporarily rejected this outbound IP", {
      code: "COSCO_UPSTREAM_BLOCKED",
      upstreamStatus: 403,
      route: coscoRouteKey(options),
      retryAfterMs
    });
  }

  function coscoRateLimitedHttpError(retryAfterMs, options = {}) {
    const breaker = coscoCircuitBreakerFor(options);
    const safeRetryAfterMs = Math.max(1_000, Number(retryAfterMs) || 60_000);
    breaker.recordFailure({ retryAfterMs: safeRetryAfterMs, immediate: true });
    return new HttpError(429, "COSCO temporarily rate-limited this server", {
      code: "COSCO_UPSTREAM_RATE_LIMITED",
      upstreamStatus: 429,
      route: coscoRouteKey(options),
      retryAfterMs: Math.max(safeRetryAfterMs, breaker.remainingMs())
    });
  }

  function ensureCoscoCircuitAvailable(options = {}) {
    if (coscoCircuitBreakerFor(options).remainingMs() > 0) {
      throw coscoBlockedHttpError(options);
    }
  }

  function signalForTimeout(timeoutController, externalSignal) {
    return externalSignal
      ? AbortSignal.any([timeoutController.signal, externalSignal])
      : timeoutController.signal;
  }

  async function fetchCoscoUpstream(url, requestOptions = {}, routeOptions = {}) {
    if (!routeOptions.proxyMode) return fetchDirect(url, requestOptions);
    if (!proxyClient) {
      throw new HttpError(503, "COSCO proxy channel is not configured", {
        code: "COSCO_PROXY_NOT_CONFIGURED",
        route: "PROXY"
      });
    }
    try {
      return await proxyClient.fetch(url, requestOptions);
    } catch (error) {
      if (requestOptions.signal?.aborted || error?.name === "AbortError") throw error;
      throw new HttpError(502, "Configured COSCO proxy is unavailable", {
        code: "COSCO_PROXY_UNAVAILABLE",
        route: "PROXY"
      });
    }
  }

  function coscoPublicCookieState(options = {}) {
    const key = coscoRouteKey(options);
    if (!cookieStates.has(key)) {
      cookieStates.set(key, { cache: null, promise: null });
    }
    return cookieStates.get(key);
  }

  return {
    coscoBlockedHttpError,
    coscoCircuitBreakerFor,
    coscoCoreTimeoutMs,
    coscoEnrichmentTimeoutMs,
    coscoPublicCookieState,
    coscoRateLimitedHttpError,
    coscoRouteKey,
    ensureCoscoCircuitAvailable,
    fetchCoscoUpstream,
    signalForTimeout
  };
}
