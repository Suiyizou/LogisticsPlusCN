import { snapshotHasCompleteContainerDetails } from "../lib/snapshot-completeness.mjs";
import { uniqueSafeProxyNodes } from "../lib/cosco-diagnostics.mjs";
import { isCoscoProtectionError } from "../lib/cosco-errors.mjs";
import {
  normalizeCoscoContainerSnapshot,
  normalizeCoscoSnapshot
} from "../lib/cosco-normalize.mjs";
import { COSCO_QUERY_CHANNELS } from "../lib/carrier-adapters.mjs";
import { HttpError, batchCancelledHttpError } from "../lib/http-utils.mjs";
import { safeProxyNodeAlias } from "../lib/cosco-proxy-pool.mjs";

/** Executes one selected channel. The runtime supplies shared endpoints, circuits and browser configuration. */
export function createCoscoChannelExecutor({ endpoints, upstream, fetchBrowser, playwright }) {
  const {
    fetchCoscoEndpoint,
    fetchCoscoContainers,
    optionalCoscoEndpoint,
    fetchCoscoShipmentContainers
  } = endpoints;
  const {
    coscoBlockedHttpError,
    coscoCircuitBreakerFor,
    coscoCoreTimeoutMs,
    coscoEnrichmentTimeoutMs,
    coscoRateLimitedHttpError,
    ensureCoscoCircuitAvailable
  } = upstream;
  const {
    proxy: COSCO_PLAYWRIGHT_PROXY_CONFIG,
    proxyAlias: COSCO_PLAYWRIGHT_PROXY_ALIAS,
    timeoutMs: PLAYWRIGHT_TIMEOUT_MS
  } = playwright;

  async function fetchCoscoTrackingViaNetwork(request, options = {}) {
    const queryChannel = options.queryChannel ?? COSCO_QUERY_CHANNELS.NETWORK;
    if (request.type === "CONTAINER") {
      const containers = await fetchCoscoContainers(request, options);
      const fetchedAt = new Date().toISOString();
      return {
        snapshot: normalizeCoscoContainerSnapshot(containers, request, fetchedAt, {
          queryChannel
        }),
        raw: { containers }
      };
    }

    const detail = await fetchCoscoEndpoint("detail", request, {
      timeoutMs: coscoCoreTimeoutMs(options),
      signal: options.signal,
      proxyMode: options.proxyMode
    });
    let bookingInfo = {};
    let containerInfo = [];
    let enrichmentWarning = null;
    if (!options.batch) {
      try {
        bookingInfo = await optionalCoscoEndpoint(
          "bookingInfo",
          request,
          {},
          {
            timeoutMs: coscoEnrichmentTimeoutMs(options),
            signal: options.signal,
            proxyMode: options.proxyMode
          }
        );
        containerInfo = await fetchCoscoShipmentContainers(request, options).catch((error) => {
          if (isCoscoProtectionError(error)) throw error;
          return [];
        });
      } catch (error) {
        if (!isCoscoProtectionError(error)) throw error;
        const errorDetails =
          error?.details && typeof error.details === "object" ? error.details : {};
        enrichmentWarning = {
          code: errorDetails.code ?? error?.code ?? "COSCO_ENRICHMENT_DEFERRED",
          message: error?.message ?? "Optional COSCO enrichment was deferred",
          causeCode: errorDetails.causeCode ?? null,
          route: errorDetails.route ?? (options.proxyMode ? "PROXY" : "NETWORK"),
          proxyNode: safeProxyNodeAlias(errorDetails.proxyNode),
          attempts: Math.max(0, Number(errorDetails.proxyAttempts ?? errorDetails.attempts) || 0),
          triedNodes: uniqueSafeProxyNodes(errorDetails.triedNodes),
          retryAfterMs:
            Math.max(0, Number(errorDetails.retryAfterMs ?? error?.retryAfterMs) || 0) || null
        };
      }
    }
    const fetchedAt = new Date().toISOString();
    const snapshot = normalizeCoscoSnapshot(detail, request, fetchedAt, {
      queryChannel,
      bookingInfo,
      containerInfo
    });

    return {
      snapshot,
      enrichment: {
        containerDetailsComplete: snapshotHasCompleteContainerDetails(snapshot, request),
        partial: Boolean(options.batch || enrichmentWarning),
        warning: enrichmentWarning
      },
      raw: {
        detail,
        bookingInfo,
        containerInfo
      }
    };
  }

  async function fetchCoscoTrackingWithPlaywright(request, options = {}) {
    let result;
    const playwrightProxy =
      options.playwrightProxy === undefined
        ? COSCO_PLAYWRIGHT_PROXY_CONFIG
        : options.playwrightProxy;
    const usesDedicatedProxy = Boolean(playwrightProxy);

    try {
      result = await fetchBrowser(request, {
        timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
        signal: options.signal,
        proxy: playwrightProxy,
        dedicatedFallback: options.dedicatedPlaywrightProxy === true
      });
    } catch (error) {
      if (options.signal?.aborted || error?.code === "BATCH_CANCELLED") {
        throw batchCancelledHttpError();
      }
      if (error?.upstreamStatus === 403) {
        if (usesDedicatedProxy) {
          throw new HttpError(503, "COSCO rejected the dedicated Playwright proxy", {
            code: "COSCO_UPSTREAM_BLOCKED",
            upstreamStatus: 403,
            route: "PLAYWRIGHT_PROXY",
            proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
            proxyAttempts: 1,
            triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : [],
            playwrightAttempts: 1,
            retryAfterMs: 15 * 60_000
          });
        }
        coscoCircuitBreakerFor(options).trip();
        throw coscoBlockedHttpError(options);
      }
      if (error?.upstreamStatus === 429 || error?.code === "COSCO_UPSTREAM_RATE_LIMITED") {
        if (usesDedicatedProxy) {
          throw new HttpError(429, "COSCO rate-limited the dedicated Playwright proxy", {
            code: "COSCO_UPSTREAM_RATE_LIMITED",
            upstreamStatus: 429,
            route: "PLAYWRIGHT_PROXY",
            proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
            proxyAttempts: 1,
            triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : [],
            playwrightAttempts: 1,
            retryAfterMs: Math.max(1_000, Number(error?.retryAfterMs) || 60_000)
          });
        }
        throw coscoRateLimitedHttpError(error?.retryAfterMs, options);
      }
      const details = error?.code
        ? {
            code: error.code,
            retryAfterMs: error?.retryAfterMs ?? undefined,
            route: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
            ...(usesDedicatedProxy
              ? {
                  proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
                  proxyAttempts: 1,
                  triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
                }
              : {}),
            playwrightAttempts: 1
          }
        : error?.upstreamCode
          ? {
              upstreamCode: error.upstreamCode,
              route: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
              ...(usesDedicatedProxy
                ? {
                    proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
                    proxyAttempts: 1,
                    triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
                  }
                : {}),
              playwrightAttempts: 1
            }
          : {
              route: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
              ...(usesDedicatedProxy
                ? {
                    proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
                    proxyAttempts: 1,
                    triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
                  }
                : {}),
              playwrightAttempts: 1
            };
      throw new HttpError(
        error?.httpStatus ?? 502,
        error?.message || "COSCO Playwright 通道查询失败",
        details
      );
    }

    const fetchedAt = new Date().toISOString();
    const { detail, bookingInfo, containerInfo, containers, browser } = result;

    if (request.type === "CONTAINER") {
      return {
        snapshot: normalizeCoscoContainerSnapshot(containers, request, fetchedAt, {
          queryChannel: COSCO_QUERY_CHANNELS.PLAYWRIGHT
        }),
        raw: { containers, browser }
      };
    }

    let enrichmentWarning = null;
    const snapshot = normalizeCoscoSnapshot(detail, request, fetchedAt, {
      queryChannel: COSCO_QUERY_CHANNELS.PLAYWRIGHT,
      bookingInfo,
      containerInfo
    });

    return {
      snapshot,
      enrichment: {
        containerDetailsComplete: snapshotHasCompleteContainerDetails(snapshot, request),
        partial:
          Boolean(options.batch || enrichmentWarning) ||
          !snapshotHasCompleteContainerDetails(snapshot, request),
        warning: enrichmentWarning
      },
      raw: {
        detail,
        bookingInfo,
        containerInfo,
        browser
      }
    };
  }

  async function fetchCoscoTracking(request, queryChannel, options = {}) {
    const routeOptions =
      queryChannel.code === "PROXY"
        ? { ...options, proxyMode: true, queryChannel: COSCO_QUERY_CHANNELS.PROXY }
        : options;
    if (queryChannel.code !== "PLAYWRIGHT" || !COSCO_PLAYWRIGHT_PROXY_CONFIG) {
      ensureCoscoCircuitAvailable(routeOptions);
    }
    if (queryChannel.code === "PROXY") {
      const result = await fetchCoscoTrackingViaNetwork(request, routeOptions);
      return {
        ...result,
        strategy: {
          requested: "PROXY",
          used: "PROXY",
          fallbackUsed: false
        }
      };
    }
    if (queryChannel.code === "AUTO") {
      const result = await fetchCoscoTrackingViaNetwork(request, options);
      return {
        ...result,
        strategy: {
          requested: "AUTO",
          used: "NETWORK",
          fallbackUsed: false
        }
      };
    }

    if (queryChannel.code === "PLAYWRIGHT") {
      const result = await fetchCoscoTrackingWithPlaywright(request, options);
      const usesDedicatedProxy = Boolean(
        options.playwrightProxy === undefined
          ? COSCO_PLAYWRIGHT_PROXY_CONFIG
          : options.playwrightProxy
      );
      return {
        ...result,
        strategy: {
          requested: "PLAYWRIGHT",
          used: usesDedicatedProxy ? "PLAYWRIGHT_PROXY" : "PLAYWRIGHT",
          fallbackUsed: false,
          ...(usesDedicatedProxy
            ? {
                proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
                proxyAttempts: 1,
                triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : []
              }
            : {}),
          playwrightAttempts: 1
        }
      };
    }

    return fetchCoscoTrackingViaNetwork(request, options);
  }

  return Object.freeze({ fetchCoscoTracking });
}
