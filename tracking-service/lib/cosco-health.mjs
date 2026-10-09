/** COSCO 通道健康探测与定时监控。从 server.mjs 下沉为工厂，依赖由入口注入。 */
export function createCoscoHealthMonitor({
  request,
  enabled,
  intervalMs,
  normalizeTrackingRequest,
  fetchCoscoContainers,
  fetchCoscoEndpoint,
  fetchCoscoTrackingViaPlaywright,
  playwrightTimeoutMs
}) {
  const channelCHealth = {
    status: enabled ? "unknown" : "disabled",
    available: null,
    intervalMs,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    responseTimeMs: null,
    lastAttemptCount: 0,
    consecutiveFailures: 0,
    nextCheckAt: null,
    lastError: null
  };
  let channelCMonitorTimer = null;
  let channelCMonitorPromise = null;

  function probeResult(channel, available, startedAt, finishedAt, error = null) {
    return {
      channel,
      available,
      status: available ? "available" : "unavailable",
      responseTimeMs: Math.max(0, finishedAt - startedAt),
      error: error?.message ?? null
    };
  }

  async function runCoscoChannelChecks(input = request, options = {}) {
    const request = normalizeTrackingRequest(input);
    const now = options.now ?? Date.now;
    const networkProbe =
      options.networkProbe ??
      (async () => {
        if (request.type === "CONTAINER") {
          const result = await fetchCoscoContainers(request);
          if (!Array.isArray(result) || result.length === 0) {
            throw new Error("箱号接口没有返回动态");
          }
          return;
        }
        const detail = await fetchCoscoEndpoint("detail", request);
        if (!detail?.cargoTrackingSummary) throw new Error("运输详情缺少摘要");
      });
    const playwrightProbe =
      options.playwrightProbe ??
      (async () => {
        const result = await fetchCoscoTrackingViaPlaywright(request, {
          timeoutMs: playwrightTimeoutMs
        });
        if (request.type === "CONTAINER") {
          if (!Array.isArray(result?.containers) || result.containers.length === 0) {
            throw new Error("DOM 通道没有捕获到箱号结果");
          }
          return;
        }
        if (!result?.detail?.cargoTrackingSummary) {
          throw new Error("DOM 通道没有捕获到运输摘要");
        }
      });

    const runProbe = async (channel, probe) => {
      const startedAt = now();
      try {
        await probe(request);
        return probeResult(channel, true, startedAt, now());
      } catch (error) {
        return probeResult(channel, false, startedAt, now(), error);
      }
    };

    const [network, playwright] = await Promise.all([
      runProbe("NETWORK", networkProbe),
      runProbe("PLAYWRIGHT", playwrightProbe)
    ]);

    return {
      checkedAt: new Date(now()).toISOString(),
      strategy: {
        preferred: "NETWORK",
        fallback: "PLAYWRIGHT"
      },
      request: { type: request.type, number: request.number },
      channels: { NETWORK: network, PLAYWRIGHT: playwright }
    };
  }

  function getChannelCHealthStatus() {
    return {
      channel: "NETWORK",
      channelNumber: 1,
      channelLabel: "网络接口",
      legacyChannel: "C",
      source: "COSCO_INTERNAL_WEB_API",
      ...channelCHealth
    };
  }

  async function runChannelCHealthCheck(options = {}) {
    if (channelCMonitorPromise) return channelCMonitorPromise;

    const now = options.now ?? Date.now;
    const fetchDetail = options.fetchDetail ?? ((request) => fetchCoscoEndpoint("detail", request));
    const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1_500);
    const wait =
      options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    const startedAt = now();
    channelCHealth.status = "checking";
    channelCHealth.available = null;
    channelCHealth.lastError = null;

    channelCMonitorPromise = (async () => {
      let attemptCount = 0;

      try {
        const trackingRequest = normalizeTrackingRequest(request);
        let detail = null;
        let finalError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          attemptCount = attempt;

          try {
            detail = await fetchDetail(trackingRequest);
            if (!detail?.cargoTrackingSummary) {
              throw new Error("COSCO 返回结果缺少运输摘要");
            }
            finalError = null;
            break;
          } catch (error) {
            finalError = error;
            if (attempt < maxAttempts) await wait(retryDelayMs);
          }
        }

        if (finalError) throw finalError;

        channelCHealth.status = "available";
        channelCHealth.available = true;
        channelCHealth.consecutiveFailures = 0;
      } catch (error) {
        channelCHealth.status = "unavailable";
        channelCHealth.available = false;
        channelCHealth.lastError = error?.message || "通道一网络接口探测失败";
        channelCHealth.consecutiveFailures += 1;
      } finally {
        const finishedAt = now();
        const checkedAt = new Date(finishedAt).toISOString();
        channelCHealth.lastCheckedAt = checkedAt;
        channelCHealth.responseTimeMs = Math.max(0, finishedAt - startedAt);
        channelCHealth.lastAttemptCount = attemptCount;

        if (channelCHealth.available) {
          channelCHealth.lastSuccessAt = checkedAt;
        } else {
          channelCHealth.lastFailureAt = checkedAt;
        }
      }

      return getChannelCHealthStatus();
    })();

    try {
      return await channelCMonitorPromise;
    } finally {
      channelCMonitorPromise = null;
    }
  }

  function startChannelCMonitor() {
    if (!enabled || channelCMonitorTimer) return;

    const executeCheck = async () => {
      const status = await runChannelCHealthCheck();
      channelCHealth.nextCheckAt = new Date(Date.now() + intervalMs).toISOString();

      const message = status.available
        ? `available (${status.responseTimeMs} ms)`
        : `unavailable: ${status.lastError}`;
      console.log(`[channel-network-monitor] ${message}`);
    };

    void executeCheck();
    channelCMonitorTimer = setInterval(() => {
      void executeCheck();
    }, intervalMs);
    channelCMonitorTimer.unref();
  }

  function stopChannelCMonitor() {
    if (channelCMonitorTimer) {
      clearInterval(channelCMonitorTimer);
      channelCMonitorTimer = null;
    }
    channelCHealth.nextCheckAt = null;
  }

  return {
    getChannelCHealthStatus,
    runChannelCHealthCheck,
    runCoscoChannelChecks,
    startChannelCMonitor,
    stopChannelCMonitor
  };
}
