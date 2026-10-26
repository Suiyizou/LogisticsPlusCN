import { createDefaultCarrierAdapters } from "../services/default-carrier-adapters.mjs";
import { snapshotHasCompleteContainerDetails } from "../lib/snapshot-completeness.mjs";
import { normalizeCoscoContainerList } from "../lib/cosco-normalize.mjs";
import {
  COSCO_QUERY_CHANNELS,
  normalizeQueryChannel,
  normalizeTrackingRequest
} from "../lib/carrier-adapters.mjs";
import { HttpError, batchCancelledHttpError, readJsonBody, sendJson } from "../lib/http-utils.mjs";
import { normalizeBatchTaskId } from "../lib/batch-task-registry.mjs";
/** Request normalization, authorization, cache and batch leases are shared by every tracking route. */
export function createTrackingController({
  cosco,
  trackingCache,
  batchTaskRegistry,
  adapterKey = "",
  fetchCma,
  adapters = createDefaultCarrierAdapters({ cosco, adapterKey, fetchCma })
}) {
  const authorizeCoscoChannel = (request, channel) =>
    adapters.get("COSCO").authorizeChannel?.(channel, request.headers);

  async function handleCoscoContainerListRequest(request, response) {
    const input = await readJsonBody(request);
    const batchTaskId = normalizeBatchTaskId(input.batchTaskId);
    const trackingRequest = normalizeTrackingRequest(input);
    if (trackingRequest.type === "CONTAINER") {
      throw new HttpError(400, "箱号清单查询必须使用提单号或订舱号");
    }

    const batchLease = batchTaskId ? batchTaskRegistry.begin(batchTaskId) : null;
    try {
      await batchLease?.waitForTurn();
      const containerInfo = await cosco.fetchShipmentContainers(trackingRequest, {
        signal: batchLease?.signal
      });
      const containers = normalizeCoscoContainerList(containerInfo);
      sendJson(response, 200, {
        tracking: {
          type: trackingRequest.type,
          number: trackingRequest.number
        },
        total: containers.length,
        containers
      });
    } catch (error) {
      if (batchLease?.signal.aborted) throw batchCancelledHttpError();
      throw error;
    } finally {
      batchLease?.finish();
    }
  }

  async function handleCoscoSupplementalDetailsRequest(request, response) {
    const input = await readJsonBody(request);
    const trackingRequest = normalizeTrackingRequest(input);
    const queryChannel = normalizeQueryChannel(input.channel ?? "AUTO");
    authorizeCoscoChannel(request, queryChannel);
    if (trackingRequest.type === "CONTAINER")
      throw new HttpError(400, "补充详情查询必须使用提单号或订舱号");
    const result = await cosco.fetchSupplementalDetails(trackingRequest, queryChannel, {
      sources: input.sources,
      allowPlaywrightFallback: input.allowPlaywrightFallback === true,
      authorizeProxyFallback: () => authorizeCoscoChannel(request, COSCO_QUERY_CHANNELS.PROXY)
    });
    sendJson(response, 200, result);
  }

  async function handleTrackRequest(request, response, forcedCarrier, forcedChannel) {
    const input = await readJsonBody(request);
    const forceRefresh = input.forceRefresh === true;
    const batchTaskId = normalizeBatchTaskId(input.batchTaskId);
    const adapter = adapters.get(forcedCarrier ?? input.carrier ?? "COSCO");
    // prepare validates capabilities and authorization before reading any shared cache.
    const prepared = await adapter.prepare(input, {
      channel: forcedChannel,
      headers: request.headers
    });
    const trackingRequest = prepared.tracking,
      queryChannel = prepared.channel;
    if (
      !adapter.capabilities.types.includes(trackingRequest.type) ||
      !adapter.capabilities.channels.includes(queryChannel.code)
    )
      throw new HttpError(400, "当前船司不支持此查询类型或通道");
    const batchLease = batchTaskId ? batchTaskRegistry.begin(batchTaskId) : null;

    try {
      const cacheKey = JSON.stringify([
        adapter.code,
        queryChannel.code,
        trackingRequest.type,
        trackingRequest.number,
        prepared.cacheScope || ""
      ]);
      const cached = trackingCache.peek(cacheKey);

      if (
        !forceRefresh &&
        cached &&
        cached.expiresAt > Date.now() &&
        snapshotHasCompleteContainerDetails(cached.value?.snapshot, trackingRequest)
      ) {
        sendJson(response, 200, { ...cached.value, cached: true });
        return;
      }

      if (cached) trackingCache.invalidate(cacheKey);

      await batchLease?.waitForTurn();

      let requestPromise = batchTaskId || forceRefresh ? null : trackingCache.getInFlight(cacheKey);
      if (!requestPromise) {
        requestPromise = adapter.track(prepared, {
          signal: batchLease?.signal,
          batch: Boolean(batchTaskId)
        });
        if (!batchTaskId && !forceRefresh) trackingCache.setInFlight(cacheKey, requestPromise);
      }

      let value;
      try {
        value = await requestPromise;
      } finally {
        if (!batchTaskId && !forceRefresh) {
          trackingCache.clearInFlight(cacheKey, requestPromise);
        }
      }
      trackingCache.store(cacheKey, value);

      sendJson(response, 200, { ...value, cached: false });
    } catch (error) {
      if (batchLease?.signal.aborted) throw batchCancelledHttpError();
      throw error;
    } finally {
      batchLease?.finish();
    }
  }
  return {
    adapters,
    handleTrackRequest,
    handleCoscoContainerListRequest,
    handleCoscoSupplementalDetailsRequest,
    cancelBatch: (taskId) => batchTaskRegistry.cancel(taskId)
  };
}
