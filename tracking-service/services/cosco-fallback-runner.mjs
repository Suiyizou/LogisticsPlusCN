import {
  decorateProxyFailure,
  decorateProxySuccess,
  proxyAttemptDiagnostics,
  proxyPoolExhaustedError,
  safeSupplementalWarnings
} from "../lib/cosco-diagnostics.mjs";
import { COSCO_QUERY_CHANNELS } from "../lib/carrier-adapters.mjs";
import { HttpError } from "../lib/http-utils.mjs";
import { runWithProxyPoolRetries } from "../lib/cosco-proxy-pool.mjs";
import { shouldRotateCoscoProxy, shouldFallbackCoscoAutoToProxy } from "./cosco-policy.mjs";

/** Coordinates authorized fallback using the runtime's existing pool, circuits and cookie states. */
export function createCoscoFallbackRunner({
  upstream,
  proxyPool: coscoProxyPool,
  proxyConfigured,
  cookieStates: coscoPublicCookieStates,
  playwright
}) {
  const { coscoCircuitBreakerFor, ensureCoscoCircuitAvailable } = upstream;
  const {
    proxy: COSCO_PLAYWRIGHT_PROXY_CONFIG,
    proxyAlias: COSCO_PLAYWRIGHT_PROXY_ALIAS,
    autoFallbackEnabled: COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED
  } = playwright;

  async function rotateCoscoProxy(error) {
    if (!coscoProxyPool || !shouldRotateCoscoProxy(error)) return null;
    try {
      return await coscoProxyPool.rotate(
        error?.details?.code ?? error?.code ?? "COSCO_PROXY_FAILURE"
      );
    } catch (rotationError) {
      console.warn("COSCO proxy pool rotation failed", rotationError?.message ?? rotationError);
      return null;
    }
  }

  async function runCoscoWithProxyRotation(queryChannel, options, operation) {
    const routeOptions = queryChannel.code === "PROXY" ? { ...options, proxyMode: true } : options;
    const proxyRoute = queryChannel.code === "PROXY";
    const poolEnabled = proxyRoute && coscoProxyPool;
    const triedNodes = [];
    let activeProxyNode = null;
    let latestProxyAttempt = 0;
    return runWithProxyPoolRetries(
      {
        maximumAttempts: poolEnabled ? coscoProxyPool.maxAttemptsPerShipment : 1,
        shouldRetry: (error) => Boolean(poolEnabled && shouldRotateCoscoProxy(error)),
        rotate: (error) => rotateCoscoProxy(error),
        exhaustedError: (error, attempts) =>
          proxyPoolExhaustedError(error, attempts, triedNodes, activeProxyNode),
        onRotated: (rotation, attempt, maximumAttempts) => {
          console.warn(
            `COSCO proxy attempt ${attempt}/${maximumAttempts} failed; rotated ${rotation.previous ?? "unknown"} -> ${rotation.current}`
          );
          coscoCircuitBreakerFor(routeOptions).reset();
          coscoPublicCookieStates.delete("PROXY");
        }
      },
      async ({ attempt }) => {
        latestProxyAttempt = proxyRoute ? attempt : 0;
        let budget = null;
        if (poolEnabled) {
          try {
            budget = await coscoProxyPool.prepareAttempt();
            activeProxyNode = budget?.current ?? null;
            if (activeProxyNode) triedNodes.push(activeProxyNode);
            if (budget?.rotated) {
              console.info(
                `COSCO proxy request budget rotated ${budget.previous ?? "unknown"} -> ${budget.current}`
              );
              coscoCircuitBreakerFor(routeOptions).reset();
              coscoPublicCookieStates.delete("PROXY");
            }
          } catch (budgetError) {
            console.warn(
              "COSCO proxy request budget check failed; continuing with the configured proxy",
              budgetError?.message ?? budgetError
            );
          }
        }
        const diagnostics = proxyAttemptDiagnostics(
          activeProxyNode,
          latestProxyAttempt,
          triedNodes
        );
        try {
          ensureCoscoCircuitAvailable(routeOptions);
          const result = await operation(routeOptions);
          coscoCircuitBreakerFor(routeOptions).recordSuccess();
          return proxyRoute ? decorateProxySuccess(result, diagnostics, budget) : result;
        } catch (error) {
          throw proxyRoute ? decorateProxyFailure(error, diagnostics) : error;
        }
      }
    );
  }

  function decorateAutomaticProxyFallback(result, primaryError) {
    if (!result || typeof result !== "object") return result;
    const existingStrategy =
      result.strategy && typeof result.strategy === "object" ? result.strategy : {};
    return {
      ...result,
      proxyFallback: true,
      strategy: {
        ...existingStrategy,
        requested: "AUTO",
        used: "PROXY",
        fallbackUsed: true,
        primaryError: primaryError?.message ?? "Direct COSCO channel failed"
      }
    };
  }

  function decorateAutomaticPlaywrightFallback(result, directError, proxyError) {
    if (!result || typeof result !== "object") return result;
    const existingStrategy =
      result.strategy && typeof result.strategy === "object" ? result.strategy : {};
    const proxyDetails =
      proxyError?.details && typeof proxyError.details === "object" ? proxyError.details : {};
    return {
      ...result,
      proxyFallback: true,
      playwrightFallback: true,
      strategy: {
        ...existingStrategy,
        requested: "AUTO",
        used: "PLAYWRIGHT_PROXY",
        fallbackUsed: true,
        proxyNode: COSCO_PLAYWRIGHT_PROXY_ALIAS,
        proxyAttempts: 1,
        triedNodes: COSCO_PLAYWRIGHT_PROXY_ALIAS ? [COSCO_PLAYWRIGHT_PROXY_ALIAS] : [],
        apiProxyNode: proxyDetails.proxyNode ?? null,
        apiProxyAttempts: Math.max(0, Number(proxyDetails.proxyAttempts) || 0),
        apiTriedNodes: Array.isArray(proxyDetails.triedNodes) ? proxyDetails.triedNodes : [],
        playwrightAttempts: 1,
        primaryError: directError?.message ?? "Direct COSCO channel failed",
        proxyError: proxyError?.message ?? "COSCO proxy API channel failed"
      }
    };
  }

  function automaticPlaywrightFallbackError(directError, proxyError, playwrightError) {
    const directDetails =
      directError?.details && typeof directError.details === "object" ? directError.details : {};
    const proxyDetails =
      proxyError?.details && typeof proxyError.details === "object" ? proxyError.details : {};
    const playwrightDetails =
      playwrightError?.details && typeof playwrightError.details === "object"
        ? playwrightError.details
        : {};
    const warnings = safeSupplementalWarnings(
      directDetails.warnings,
      proxyDetails.warnings,
      playwrightDetails.warnings
    );
    return new HttpError(
      Number.isInteger(playwrightError?.status) ? playwrightError.status : 503,
      "Direct API, proxy API pool and dedicated-proxy Playwright all failed",
      {
        code: "COSCO_CHANNELS_UNAVAILABLE",
        causeCode: playwrightDetails.code ?? playwrightError?.code ?? "PLAYWRIGHT_FAILURE",
        directError: directError?.message ?? "Direct COSCO channel failed",
        proxyError: proxyError?.message ?? "COSCO proxy API channel failed",
        playwrightError: playwrightError?.message ?? "Dedicated-proxy Playwright failed",
        proxyNode: proxyDetails.proxyNode ?? null,
        proxyAttempts: Math.max(0, Number(proxyDetails.proxyAttempts) || 0),
        triedNodes: Array.isArray(proxyDetails.triedNodes) ? proxyDetails.triedNodes : [],
        playwrightProxyNode: playwrightDetails.proxyNode ?? COSCO_PLAYWRIGHT_PROXY_ALIAS,
        playwrightAttempts: 1,
        route: "PLAYWRIGHT_PROXY",
        ...(warnings.length > 0 ? { warnings } : {}),
        retryAfterMs: Math.max(
          1_000,
          Number(playwrightDetails.retryAfterMs) || 0,
          Number(proxyDetails.retryAfterMs) || 0
        )
      }
    );
  }

  async function runCoscoWithAutomaticProxyFallback(queryChannel, options, operation) {
    try {
      return await runCoscoWithProxyRotation(queryChannel, options, (routeOptions) =>
        operation(queryChannel, routeOptions)
      );
    } catch (directError) {
      if (
        queryChannel.code !== "AUTO" ||
        !shouldFallbackCoscoAutoToProxy(directError) ||
        options.signal?.aborted
      ) {
        throw directError;
      }
      try {
        options.authorizeProxyFallback?.();
      } catch {
        // Public AUTO requests are not allowed to consume the private proxy pool. Keep the
        // original upstream failure instead of exposing an authorization-specific response.
        throw directError;
      }

      let proxyError = null;
      if (proxyConfigured) {
        try {
          const result = await runCoscoWithProxyRotation(
            COSCO_QUERY_CHANNELS.PROXY,
            options,
            (routeOptions) => operation(COSCO_QUERY_CHANNELS.PROXY, routeOptions)
          );
          return decorateAutomaticProxyFallback(result, directError);
        } catch (error) {
          proxyError = error;
        }
      } else {
        proxyError = new HttpError(503, "COSCO proxy API channel is not configured", {
          code: "COSCO_PROXY_NOT_CONFIGURED",
          route: "PROXY",
          proxyAttempts: 0,
          triedNodes: []
        });
      }

      if (
        !options.allowPlaywrightFallback ||
        !COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED ||
        !shouldFallbackCoscoAutoToProxy(proxyError) ||
        options.signal?.aborted
      ) {
        throw proxyError;
      }

      try {
        const result = await operation(COSCO_QUERY_CHANNELS.PLAYWRIGHT, {
          ...options,
          dedicatedPlaywrightProxy: true,
          playwrightProxy: COSCO_PLAYWRIGHT_PROXY_CONFIG
        });
        return decorateAutomaticPlaywrightFallback(result, directError, proxyError);
      } catch (playwrightError) {
        if (options.signal?.aborted || playwrightError?.details?.code === "BATCH_CANCELLED") {
          throw playwrightError;
        }
        throw automaticPlaywrightFallbackError(directError, proxyError, playwrightError);
      }
    }
  }

  return Object.freeze({ runCoscoWithAutomaticProxyFallback });
}
