import { decodeCoscoPayload } from "../lib/cosco-payload.mjs";
import { HttpError, batchCancelledHttpError } from "../lib/http-utils.mjs";
import { isCoscoProtectionError } from "../lib/cosco-errors.mjs";
import { parseRetryAfter } from "./cosco-policy.mjs";

/**
 * COSCO HTTP protocol and public-page session handling. The runtime supplies
 * its existing upstream routing/circuits/session state and shared request gate.
 * This client never chooses a channel, starts a monitor or owns a browser.
 * @param {{
 *   upstream: ReturnType<typeof import("../lib/cosco-upstream.mjs").createCoscoUpstream>,
 *   gate: ReturnType<typeof import("../lib/cosco-request-guard.mjs").createCoscoQueryGate>
 * }} dependencies
 */
export function createCoscoEndpointClient({ upstream, gate }) {
  const coscoUpstreamGate = gate;
  const {
    coscoBlockedHttpError,
    coscoCircuitBreakerFor,
    coscoCoreTimeoutMs,
    coscoEnrichmentTimeoutMs,
    coscoPublicCookieState,
    coscoRateLimitedHttpError,
    ensureCoscoCircuitAvailable,
    fetchCoscoUpstream,
    signalForTimeout
  } = upstream;
  const COSCO_TRACKING_BASE =
    "https://elines.coscoshipping.com/scct/scct_customer/public/cargoTracking";
  const COSCO_TRACKING_EX_BASE =
    "https://elines.coscoshipping.com/scct/scct_customer_ex/public/cargoTracking";
  const COSCO_PUBLIC_TRACKING_PAGE = "https://elines.coscoshipping.com/scct/public/ct/base";
  const COSCO_PAGE_URL = "https://elines.coscoshipping.com/ebusiness/cargoTracking";
  const UPSTREAM_TIMEOUT_MS = 30_000;

  async function fetchCoscoEndpoint(endpoint, request, options = {}) {
    ensureCoscoCircuitAvailable(options);
    return coscoUpstreamGate.run(
      () => {
        ensureCoscoCircuitAvailable(options);
        return fetchCoscoEndpointNow(endpoint, request, options);
      },
      { signal: options.signal }
    );
  }

  async function fetchCoscoEndpointNow(endpoint, request, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const baseUrl = options.baseUrl ?? COSCO_TRACKING_BASE;
    const referer =
      options.referer ??
      `${COSCO_PAGE_URL}?trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

    try {
      const upstream = await fetchCoscoUpstream(
        `${baseUrl}/${endpoint}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            Referer: referer,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
            tz: "Asia/Shanghai",
            ...(options.cookie ? { Cookie: options.cookie } : {})
          },
          body: JSON.stringify({
            businessNumber: request.number,
            businessNumberType: request.businessNumberType,
            notFilterResult: false
          }),
          signal: signalForTimeout(controller, options.signal)
        },
        options
      );

      const rawText = await upstream.text();

      if (!upstream.ok) {
        if (upstream.status === 403) {
          coscoCircuitBreakerFor(options).trip();
          throw coscoBlockedHttpError(options);
        }
        if (upstream.status === 401) {
          throw new HttpError(502, "COSCO public session expired", {
            code: "COSCO_COOKIE_EXPIRED",
            upstreamStatus: 401
          });
        }
        if (upstream.status === 429) {
          throw coscoRateLimitedHttpError(
            parseRetryAfter(upstream.headers.get("retry-after")),
            options
          );
        }
        if (upstream.status === 503) {
          const retryAfterMs = parseRetryAfter(upstream.headers.get("retry-after")) ?? 30_000;
          coscoCircuitBreakerFor(options).recordFailure({ retryAfterMs, immediate: true });
          throw new HttpError(503, "COSCO upstream is temporarily unavailable", {
            code: "COSCO_UPSTREAM_UNAVAILABLE",
            upstreamStatus: 503,
            retryAfterMs: Math.max(retryAfterMs, coscoCircuitBreakerFor(options).remainingMs())
          });
        }
        throw new HttpError(502, `COSCO 接口返回 HTTP ${upstream.status}`);
      }

      let decoded;
      try {
        decoded = decodeCoscoPayload(rawText);
      } catch (error) {
        throw new HttpError(502, "COSCO 响应解码失败", error.message);
      }

      const decodedCode = String(decoded?.code ?? "");
      if (decodedCode === "429") {
        throw coscoRateLimitedHttpError(Number(decoded?.retryAfterMs) || 60_000, options);
      }
      if (decodedCode === "403") {
        coscoCircuitBreakerFor(options).trip(Number(decoded?.retryAfterMs) || undefined);
        throw coscoBlockedHttpError(options);
      }
      if (decodedCode === "503") {
        const retryAfterMs = Math.max(1_000, Number(decoded?.retryAfterMs) || 30_000);
        coscoCircuitBreakerFor(options).recordFailure({ retryAfterMs, immediate: true });
        throw new HttpError(503, decoded?.message || "COSCO upstream is temporarily unavailable", {
          code: "COSCO_UPSTREAM_UNAVAILABLE",
          upstreamStatus: 503,
          retryAfterMs: Math.max(retryAfterMs, coscoCircuitBreakerFor(options).remainingMs())
        });
      }
      if (decodedCode === "401") {
        throw new HttpError(502, "COSCO public session expired", {
          code: "COSCO_COOKIE_EXPIRED",
          upstreamCode: decoded?.code
        });
      }
      if (decoded?.code !== "200" || decoded?.success !== true || decoded?.result == null) {
        const status = decoded?.code === "404" ? 404 : 502;
        throw new HttpError(status, decoded?.message || "COSCO 没有返回有效的跟踪结果", {
          upstreamCode: decoded?.code ?? null
        });
      }

      return decoded.result;
    } catch (error) {
      if (options.signal?.aborted) throw batchCancelledHttpError();
      if (error?.name === "AbortError") {
        throw new HttpError(504, "COSCO 查询超时");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function extractCoscoPageCookies(html, headers) {
    const cookies = [];
    const setCookies = headers?.getSetCookie?.() ?? [];
    for (const value of setCookies) {
      const cookie = value.split(";", 1)[0];
      if (cookie) cookies.push(cookie);
    }

    for (const match of String(html).matchAll(/document\.cookie\s*=\s*"([^;]+);/g)) {
      cookies.push(match[1]);
    }

    return [...new Set(cookies)].join("; ");
  }

  async function getCoscoPublicCookies(request, options = {}) {
    const state = coscoPublicCookieState(options);
    if (state.cache?.expiresAt > Date.now()) {
      return state.cache.value;
    }
    if (!state.promise) {
      state.promise = getCoscoPublicCookiesOnce(request, options).finally(() => {
        state.promise = null;
      });
    }
    return state.promise;
  }

  async function getCoscoPublicCookiesOnce(request, options = {}) {
    const state = coscoPublicCookieState(options);
    if (state.cache?.expiresAt > Date.now()) {
      return state.cache.value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), coscoCoreTimeoutMs(options));
    const pageUrl = `${COSCO_PUBLIC_TRACKING_PAGE}?lang=en&trackingType=${encodeURIComponent(request.type)}&number=${encodeURIComponent(request.number)}`;

    try {
      const response = await coscoUpstreamGate.run(
        () => {
          ensureCoscoCircuitAvailable(options);
          return fetchCoscoUpstream(
            pageUrl,
            {
              headers: {
                Accept: "text/html,application/xhtml+xml",
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
              },
              signal: signalForTimeout(controller, options.signal)
            },
            options
          );
        },
        { signal: options.signal }
      );
      if (response.status === 403) {
        coscoCircuitBreakerFor(options).trip();
        throw coscoBlockedHttpError(options);
      }
      if (response.status === 429) {
        throw coscoRateLimitedHttpError(
          parseRetryAfter(response.headers.get("retry-after")),
          options
        );
      }
      if (!response.ok) {
        throw new HttpError(502, `COSCO public page returned HTTP ${response.status}`);
      }
      const html = await response.text();
      const value = extractCoscoPageCookies(html, response.headers);
      state.cache = {
        value,
        expiresAt: Date.now() + 5 * 60_000
      };
      return value;
    } catch (error) {
      if (options.signal?.aborted) throw batchCancelledHttpError();
      if (error?.name === "AbortError") {
        throw new HttpError(504, "COSCO 公共查询页初始化超时");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchCoscoContainers(request, options = {}) {
    const referer = `${COSCO_PUBLIC_TRACKING_PAGE}?lang=en&trackingType=CONTAINER&number=${encodeURIComponent(request.number)}`;
    let finalError = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const cookie = await getCoscoPublicCookies(request, options);
        return await fetchCoscoEndpoint("containers", request, {
          baseUrl: COSCO_TRACKING_EX_BASE,
          referer,
          cookie,
          timeoutMs: coscoCoreTimeoutMs(options),
          signal: options.signal,
          proxyMode: options.proxyMode
        });
      } catch (error) {
        finalError = error;
        if (
          options.signal?.aborted ||
          isCoscoProtectionError(error) ||
          error?.details?.code !== "COSCO_COOKIE_EXPIRED"
        ) {
          throw error;
        }
        coscoPublicCookieState(options).cache = null;
      }
    }

    throw finalError;
  }

  async function optionalCoscoEndpoint(endpoint, request, fallback, options = {}) {
    try {
      return await fetchCoscoEndpoint(endpoint, request, options);
    } catch (error) {
      if (isCoscoProtectionError(error)) throw error;
      return fallback;
    }
  }

  async function fetchCoscoShipmentContainers(request, options = {}) {
    const result = await fetchCoscoEndpoint("containerInfo", request, {
      timeoutMs: coscoEnrichmentTimeoutMs(options),
      signal: options.signal,
      proxyMode: options.proxyMode
    });
    return Array.isArray(result) ? result : [];
  }

  return Object.freeze({
    fetchCoscoEndpoint,
    fetchCoscoContainers,
    optionalCoscoEndpoint,
    fetchCoscoShipmentContainers
  });
}
