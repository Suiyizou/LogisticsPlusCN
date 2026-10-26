import { normalizeCoscoSupplementalDetails } from "../lib/cosco-normalize.mjs";
import { HttpError } from "../lib/http-utils.mjs";
import { shouldRotateCoscoProxy } from "./cosco-policy.mjs";

/** Reads selected supplemental sources through the runtime's shared gate and authorized fallback chain. */
export function createCoscoSupplementalWorkflow({
  endpoints,
  upstream,
  gate: coscoQueryGate,
  runWithFallback: runCoscoWithAutomaticProxyFallback,
  fetchTracking: fetchCoscoTracking
}) {
  const { fetchCoscoEndpoint, fetchCoscoShipmentContainers } = endpoints;
  const { coscoEnrichmentTimeoutMs } = upstream;

  async function fetchSupplementalDetails(
    trackingRequest,
    queryChannel,
    { sources, allowPlaywrightFallback = false, authorizeProxyFallback } = {}
  ) {
    const allowedSources = new Set(["bookingInfo", "containerInfo"]);
    const requestedSources = new Set(
      (Array.isArray(sources) ? sources : [])
        .map((source) => String(source ?? "").trim())
        .filter((source) => allowedSources.has(source))
    );
    if (requestedSources.size === 0) {
      allowedSources.forEach((source) => requestedSources.add(source));
    }

    const result = await coscoQueryGate.run(() =>
      runCoscoWithAutomaticProxyFallback(
        queryChannel,
        {
          allowPlaywrightFallback,
          authorizeProxyFallback
        },
        async (activeChannel, routeOptions) => {
          if (activeChannel.code === "PLAYWRIGHT") {
            const playwrightResult = await fetchCoscoTracking(
              trackingRequest,
              activeChannel,
              routeOptions
            );
            const snapshot = playwrightResult?.snapshot ?? {};
            const details = {
              fetchedAt: snapshot.fetchedAt ?? new Date().toISOString(),
              tracking: {
                type: trackingRequest.type,
                number: trackingRequest.number
              },
              containers: requestedSources.has("containerInfo")
                ? Array.isArray(snapshot.containers)
                  ? snapshot.containers
                  : []
                : [],
              references: requestedSources.has("bookingInfo")
                ? {
                    external: Array.isArray(snapshot.references?.external)
                      ? snapshot.references.external
                      : [],
                    business: snapshot.references?.business ?? {},
                    information: Array.isArray(snapshot.references?.information)
                      ? snapshot.references.information
                      : []
                  }
                : { external: [], business: {}, information: [] },
              partial: false,
              warnings: [],
              strategy: playwrightResult?.strategy ?? null
            };
            const hasContainerData = details.containers.length > 0;
            const hasReferenceData =
              details.references.external.length > 0 ||
              details.references.information.length > 0 ||
              Object.values(details.references.business).some(Boolean);
            if (requestedSources.has("bookingInfo") && !hasReferenceData) {
              details.warnings.push({
                source: "bookingInfo",
                code: "COSCO_SUPPLEMENTAL_EMPTY",
                message: "COSCO 浏览器兜底未返回订舱参考信息",
                route: "PLAYWRIGHT_PROXY"
              });
            }
            if (requestedSources.has("containerInfo") && !hasContainerData) {
              details.warnings.push({
                source: "containerInfo",
                code: "COSCO_SUPPLEMENTAL_EMPTY",
                message: "COSCO 浏览器兜底未返回运输详情",
                route: "PLAYWRIGHT_PROXY"
              });
            }
            details.partial = details.warnings.length > 0;
            if (details.warnings.length === requestedSources.size) {
              throw new HttpError(502, "COSCO 浏览器兜底未返回可用的补充详情", {
                code: "COSCO_SUPPLEMENTAL_UNAVAILABLE",
                route: "PLAYWRIGHT_PROXY",
                warnings: details.warnings
              });
            }
            return details;
          }

          const warnings = [];
          let bookingInfo = {};
          let containerInfo = [];
          if (requestedSources.has("bookingInfo")) {
            try {
              bookingInfo = await fetchCoscoEndpoint("bookingInfo", trackingRequest, {
                ...routeOptions,
                timeoutMs: coscoEnrichmentTimeoutMs(routeOptions)
              });
            } catch (error) {
              if (shouldRotateCoscoProxy(error)) throw error;
              const errorDetails = error?.details ?? {};
              warnings.push({
                source: "bookingInfo",
                message: error?.message ?? "订舱参考信息查询失败",
                code: errorDetails.code ?? error?.code ?? `HTTP_${error?.status ?? 502}`,
                causeCode: errorDetails.causeCode ?? null,
                route: errorDetails.route ?? activeChannel.code,
                proxyNode: errorDetails.proxyNode ?? null,
                attempts: errorDetails.proxyAttempts ?? errorDetails.attempts ?? 0,
                triedNodes: Array.isArray(errorDetails.triedNodes) ? errorDetails.triedNodes : [],
                retryAfterMs: errorDetails.retryAfterMs ?? null
              });
            }
          }
          if (requestedSources.has("containerInfo")) {
            try {
              containerInfo = await fetchCoscoShipmentContainers(trackingRequest, routeOptions);
            } catch (error) {
              if (shouldRotateCoscoProxy(error)) throw error;
              const errorDetails = error?.details ?? {};
              warnings.push({
                source: "containerInfo",
                message: error?.message ?? "运输详情查询失败",
                code: errorDetails.code ?? error?.code ?? `HTTP_${error?.status ?? 502}`,
                causeCode: errorDetails.causeCode ?? null,
                route: errorDetails.route ?? activeChannel.code,
                proxyNode: errorDetails.proxyNode ?? null,
                attempts: errorDetails.proxyAttempts ?? errorDetails.attempts ?? 0,
                triedNodes: Array.isArray(errorDetails.triedNodes) ? errorDetails.triedNodes : [],
                retryAfterMs: errorDetails.retryAfterMs ?? null
              });
            }
          }

          const details = normalizeCoscoSupplementalDetails(
            bookingInfo,
            containerInfo,
            trackingRequest,
            new Date().toISOString()
          );
          const allRequestedSourcesFailed = [...requestedSources].every((source) =>
            warnings.some((warning) => warning.source === source)
          );
          if (allRequestedSourcesFailed || (allowPlaywrightFallback && warnings.length > 0)) {
            throw new HttpError(
              502,
              allRequestedSourcesFailed
                ? "COSCO 未返回可用的补充详情"
                : "COSCO 返回的补充详情不完整，继续尝试下一查询通道",
              {
                code: "COSCO_SUPPLEMENTAL_UNAVAILABLE",
                warnings,
                partial: !allRequestedSourcesFailed
              }
            );
          }
          return {
            ...details,
            partial: warnings.length > 0,
            warnings,
            strategy: {
              requested: queryChannel.code,
              used: activeChannel.code === "AUTO" ? "NETWORK" : activeChannel.code,
              fallbackUsed: false
            }
          };
        }
      )
    );
    return result;
  }
  return Object.freeze({ fetchSupplementalDetails });
}
