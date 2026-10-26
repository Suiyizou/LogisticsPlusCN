import { createCoscoUpstream } from "../lib/cosco-upstream.mjs";
import { createCoscoHealthMonitor } from "../lib/cosco-health.mjs";
import { normalizeTrackingRequest } from "../lib/carrier-adapters.mjs";
import {
  closeCoscoPlaywrightBrowser,
  fetchCoscoTrackingViaPlaywright,
  readCoscoPlaywrightProxyConfig
} from "../channels/cosco-playwright.mjs";
import { createCoscoEndpointClient } from "./cosco-endpoint-client.mjs";
import { createCoscoChannelExecutor } from "./cosco-channel-executor.mjs";
import { createCoscoFallbackRunner } from "./cosco-fallback-runner.mjs";
import { createCoscoSupplementalWorkflow } from "./cosco-supplemental-workflow.mjs";
import { createCoscoProxyClient, proxyStatus, readCoscoProxyConfig } from "../lib/cosco-proxy.mjs";
import {
  createCoscoProxyPool,
  readCoscoProxyPoolConfig,
  safeProxyNodeAlias
} from "../lib/cosco-proxy-pool.mjs";
import { createCoscoCircuitBreaker, createCoscoQueryGate } from "../lib/cosco-request-guard.mjs";
import { isIndependentCoscoPlaywrightProxy } from "./cosco-policy.mjs";

/** COSCO orchestration owns its configuration, queues, circuits and health monitor. No HTTP objects enter here. */
export function createCoscoRuntime({
  env = process.env,
  fetchDirect,
  fetchBrowser = fetchCoscoTrackingViaPlaywright,
  closeBrowser = closeCoscoPlaywrightBrowser
} = {}) {
  const NETWORK_CORE_TIMEOUT_MS = 10_000;
  const NETWORK_ENRICHMENT_TIMEOUT_MS = 4_000;
  const PROXY_NETWORK_CORE_TIMEOUT_MS = boundedEnvironmentInteger(
    env.COSCO_PROXY_CORE_TIMEOUT_MS,
    15_000,
    NETWORK_CORE_TIMEOUT_MS,
    30_000
  );
  const PROXY_NETWORK_ENRICHMENT_TIMEOUT_MS = boundedEnvironmentInteger(
    env.COSCO_PROXY_ENRICHMENT_TIMEOUT_MS,
    8_000,
    NETWORK_ENRICHMENT_TIMEOUT_MS,
    20_000
  );
  const PLAYWRIGHT_TIMEOUT_MS = 20_000;

  const DEFAULT_CHANNEL_C_MONITOR_INTERVAL_MS = 6 * 60 * 60_000;
  const configuredMonitorInterval = Number.parseInt(env.CHANNEL_C_MONITOR_INTERVAL_MS ?? "", 10);
  const CHANNEL_C_MONITOR_INTERVAL_MS =
    Number.isFinite(configuredMonitorInterval) && configuredMonitorInterval > 0
      ? configuredMonitorInterval
      : DEFAULT_CHANNEL_C_MONITOR_INTERVAL_MS;
  const CHANNEL_C_MONITOR_ENABLED =
    String(env.CHANNEL_C_MONITOR_ENABLED ?? "true").toLowerCase() !== "false";
  const CHANNEL_C_MONITOR_REQUEST = Object.freeze({
    type: env.CHANNEL_C_MONITOR_TYPE ?? "BOOKING",
    number: env.CHANNEL_C_MONITOR_NUMBER ?? "6502077380"
  });

  const COSCO_PROXY_CONFIG = readCoscoProxyConfig(env);
  const coscoProxyClient = createCoscoProxyClient(COSCO_PROXY_CONFIG);
  const COSCO_PROXY_POOL_CONFIG = readCoscoProxyPoolConfig(env);
  const coscoProxyPool = createCoscoProxyPool(COSCO_PROXY_POOL_CONFIG);
  const COSCO_PLAYWRIGHT_PROXY_CONFIG = readCoscoPlaywrightProxyConfig(env);
  const COSCO_PLAYWRIGHT_PROXY_ALIAS = safeProxyNodeAlias(COSCO_PLAYWRIGHT_PROXY_CONFIG?.server);
  const COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED = isIndependentCoscoPlaywrightProxy(
    COSCO_PLAYWRIGHT_PROXY_CONFIG,
    COSCO_PROXY_CONFIG
  );
  const coscoQueryGate = createCoscoQueryGate({
    minIntervalMs: env.COSCO_QUERY_MIN_INTERVAL_MS,
    maxIntervalMs: env.COSCO_QUERY_MAX_INTERVAL_MS,
    queueLimit: env.COSCO_QUERY_QUEUE_LIMIT,
    queueTimeoutMs: env.COSCO_QUERY_QUEUE_TIMEOUT_MS
  });

  function boundedEnvironmentInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  const coscoUpstreamGate = createCoscoQueryGate({
    minIntervalMs: env.COSCO_UPSTREAM_MIN_INTERVAL_MS ?? 10_000,
    maxIntervalMs: env.COSCO_UPSTREAM_MAX_INTERVAL_MS ?? 12_000,
    queueLimit: env.COSCO_UPSTREAM_QUEUE_LIMIT ?? 500,
    queueTimeoutMs: env.COSCO_UPSTREAM_QUEUE_TIMEOUT_MS ?? 600_000
  });
  const coscoCircuitBreakers = Object.freeze({
    DIRECT: createCoscoCircuitBreaker({
      cooldownMs: env.COSCO_BLOCK_COOLDOWN_MS,
      failureThreshold: env.COSCO_CIRCUIT_FAILURE_THRESHOLD
    }),
    PROXY: createCoscoCircuitBreaker({
      cooldownMs: env.COSCO_PROXY_BLOCK_COOLDOWN_MS ?? env.COSCO_BLOCK_COOLDOWN_MS,
      failureThreshold:
        env.COSCO_PROXY_CIRCUIT_FAILURE_THRESHOLD ?? env.COSCO_CIRCUIT_FAILURE_THRESHOLD
    })
  });

  const coscoPublicCookieStates = new Map();

  const coscoUpstream = createCoscoUpstream({
    fetchDirect,
    circuitBreakers: coscoCircuitBreakers,
    proxyClient: coscoProxyClient,
    cookieStates: coscoPublicCookieStates,
    networkCoreTimeoutMs: NETWORK_CORE_TIMEOUT_MS,
    proxyNetworkCoreTimeoutMs: PROXY_NETWORK_CORE_TIMEOUT_MS,
    networkEnrichmentTimeoutMs: NETWORK_ENRICHMENT_TIMEOUT_MS,
    proxyNetworkEnrichmentTimeoutMs: PROXY_NETWORK_ENRICHMENT_TIMEOUT_MS
  });
  const endpoints = createCoscoEndpointClient({ upstream: coscoUpstream, gate: coscoUpstreamGate });
  const { fetchCoscoEndpoint, fetchCoscoContainers, fetchCoscoShipmentContainers } = endpoints;
  const playwright = Object.freeze({
    proxy: COSCO_PLAYWRIGHT_PROXY_CONFIG,
    proxyAlias: COSCO_PLAYWRIGHT_PROXY_ALIAS,
    timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
    autoFallbackEnabled: COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED
  });
  const { fetchCoscoTracking } = createCoscoChannelExecutor({
    endpoints,
    upstream: coscoUpstream,
    fetchBrowser,
    playwright
  });
  const { runCoscoWithAutomaticProxyFallback } = createCoscoFallbackRunner({
    upstream: coscoUpstream,
    proxyPool: coscoProxyPool,
    proxyConfigured: Boolean(coscoProxyClient),
    cookieStates: coscoPublicCookieStates,
    playwright
  });
  const { fetchSupplementalDetails } = createCoscoSupplementalWorkflow({
    endpoints,
    upstream: coscoUpstream,
    gate: coscoQueryGate,
    runWithFallback: runCoscoWithAutomaticProxyFallback,
    fetchTracking: fetchCoscoTracking
  });
  const coscoHealthMonitor = createCoscoHealthMonitor({
    request: CHANNEL_C_MONITOR_REQUEST,
    enabled: CHANNEL_C_MONITOR_ENABLED,
    intervalMs: CHANNEL_C_MONITOR_INTERVAL_MS,
    normalizeTrackingRequest,
    fetchCoscoContainers,
    fetchCoscoEndpoint,
    fetchCoscoTrackingViaPlaywright: fetchBrowser,
    playwrightTimeoutMs: PLAYWRIGHT_TIMEOUT_MS
  });
  const {
    getChannelCHealthStatus,
    runChannelCHealthCheck,
    runCoscoChannelChecks,
    startChannelCMonitor,
    stopChannelCMonitor
  } = coscoHealthMonitor;

  function runCoscoTrackingRequest(request, queryChannel, options = {}) {
    return coscoQueryGate.run(
      () =>
        runCoscoWithAutomaticProxyFallback(
          queryChannel,
          { ...options, allowPlaywrightFallback: true },
          (activeChannel, routeOptions) => fetchCoscoTracking(request, activeChannel, routeOptions)
        ),
      { signal: options.signal }
    );
  }

  let disposed = false;
  async function dispose() {
    if (disposed) return;
    disposed = true;
    stopChannelCMonitor();
    await Promise.allSettled([closeBrowser(), coscoProxyClient?.close()]);
  }
  return {
    runTracking: runCoscoTrackingRequest,
    fetchShipmentContainers: fetchCoscoShipmentContainers,
    fetchSupplementalDetails,
    hasPlaywrightProxy: Boolean(COSCO_PLAYWRIGHT_PROXY_CONFIG),
    getChannelCHealthStatus,
    runChannelCHealthCheck,
    startChannelCMonitor: () => {
      if (!disposed) startChannelCMonitor();
    },
    stopChannelCMonitor,
    runCoscoChannelChecks: (input = {}, options = {}) =>
      runCoscoChannelChecks(
        {
          type: input.type ?? CHANNEL_C_MONITOR_REQUEST.type,
          number: input.number ?? CHANNEL_C_MONITOR_REQUEST.number
        },
        options
      ),
    getHealth: () => ({
      ok: true,
      channel: "NETWORK",
      coscoProtection: {
        proxy: proxyStatus(COSCO_PROXY_CONFIG),
        proxyPool: coscoProxyPool?.status() ?? { enabled: false },
        circuitBreakers: {
          direct: coscoCircuitBreakers.DIRECT.status(),
          proxy: coscoCircuitBreakers.PROXY.status()
        },
        queue: coscoQueryGate.stats()
      },
      channels: {
        NETWORK: getChannelCHealthStatus(),
        PLAYWRIGHT: {
          channel: "PLAYWRIGHT",
          channelNumber: 2,
          channelLabel: "Playwright 浏览器",
          status: COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED
            ? "dedicated-proxy-configured"
            : COSCO_PLAYWRIGHT_PROXY_CONFIG
              ? "shared-proxy-auto-disabled"
              : "direct-only",
          enabled: true,
          autoFallbackEnabled: COSCO_PLAYWRIGHT_AUTO_FALLBACK_ENABLED,
          defaultMaxConcurrency: 1
        },
        PROXY: {
          channel: "PROXY",
          channelNumber: 3,
          channelLabel: "SOCKS5 proxy",
          status: COSCO_PROXY_CONFIG ? "configured" : "missing",
          enabled: Boolean(COSCO_PROXY_CONFIG)
        }
      },
      time: new Date().toISOString()
    }),
    dispose
  };
}
