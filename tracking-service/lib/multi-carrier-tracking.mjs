import { boundedText, createCarrierAgentClient } from "./carrier-agent-client.mjs";
import { MULTI_CARRIER_CATALOG, officialCarrierUrl, sameCarrierReference, trackingFailure } from "./multi-carrier-catalog.mjs";
import { normalizeMultiCarrierSnapshot } from "./multi-carrier-snapshot.mjs";

const EVENTS = Object.freeze({
  LOAD: "Loaded", DISC: "Discharged", GTIN: "Gate in", GTOT: "Gate out",
  PICK: "Picked up", DROP: "Dropped off", INSP: "Inspected",
  ARRI: "Arrived", DEPA: "Departed", STRP: "Stripped", STUF: "Stuffed"
});

/** Explicitly configured DCSA Track & Trace endpoints only; never guess a private API. */
export function readCarrierApiConfig(carrier, env = process.env) {
  const endpoint = String(env[`${carrier}_TRACKING_API_URL`] || "").trim();
  if (!endpoint) return null;
  const key = String(env[`${carrier}_TRACKING_API_KEY`] || "").trim();
  const header = String(env[`${carrier}_TRACKING_API_KEY_HEADER`] || "API-Key").trim();
  if (!officialCarrierUrl(endpoint, carrier) || !key || /[\r\n]/.test(key) ||
      !["API-Key", "X-API-Key", "Consumer-Key", "Ocp-Apim-Subscription-Key", "Authorization"].includes(header))
    throw trackingFailure(503, "TRACKING_API_CONFIGURATION", "船司 API 配置无效；请配置已开通的官方 DCSA 接口及独立接口密钥");
  const url = new URL(endpoint);
  if ([...url.searchParams.keys()].some((name) => /key|token|password|secret|authorization/i.test(name)))
    throw trackingFailure(503, "TRACKING_API_CONFIGURATION", "接口密钥应通过请求头配置");
  return { endpoint, key, header };
}

function normalizeDcsaEvents(events, carrier, request, endpoint) {
  const referenceKey = request.type === "CONTAINER" ? "equipmentReference"
    : request.type === "BILLOFLADING" ? "transportDocumentReference" : "carrierBookingReference";
  const refs = (event, key) => [
    event[key], ...(event.documentReferences ?? []).filter((item) =>
      key === "transportDocumentReference" ? ["TRD", "BOL"].includes(item.documentReferenceType)
        : key === "carrierBookingReference" && item.documentReferenceType === "BKG"
    ).map((item) => item.documentReferenceValue)
  ].filter(Boolean);
  if (!events.some((event) => refs(event, referenceKey).some(
    (value) => sameCarrierReference(value, request.number, carrier, request.type)
  ))) throw trackingFailure(502, "TRACKING_IDENTITY_MISMATCH", "船司 API 未返回与请求单号相符的记录");
  const containers = new Map();
  for (const event of events) {
    if (!event || !["TRANSPORT", "EQUIPMENT", "SHIPMENT"].includes(event.eventType))
      throw trackingFailure(502, "TRACKING_API_SCHEMA", "船司接口不是支持的 DCSA Track & Trace 事件格式");
    const referenceValues = refs(event, referenceKey);
    if (referenceValues.length && !referenceValues.some((value) => sameCarrierReference(value, request.number, carrier, request.type)))
      throw trackingFailure(502, "TRACKING_IDENTITY_MISMATCH", "船司接口混入其他单号记录，未保存结果");
    if (!/^[A-Z]{4}\d{7}$/.test(event.equipmentReference || "")) continue;
    const container = containers.get(event.equipmentReference) || { number: event.equipmentReference, type: event.ISOEquipmentCode ?? null, events: [] };
    const code = event.equipmentEventTypeCode ?? event.transportEventTypeCode ?? event.shipmentEventTypeCode;
    const name = EVENTS[code] || code;
    if (typeof name !== "string" || !name) continue;
    const actual = event.eventClassifierCode === "ACT";
    const location = event.eventLocation ?? event.transportCall?.location ?? {};
    container.events.push({
      name, actual, occurredAt: actual ? event.eventDateTime : null,
      estimatedAt: actual ? null : event.eventDateTime,
      location: location.locationName ?? location.UNLocationCode ?? event.transportCall?.UNLocationCode ?? null,
      vessel: event.transportCall?.vessel?.vesselName ?? null,
      voyage: event.transportCall?.exportVoyageNumber ?? event.transportCall?.importVoyageNumber ?? null,
      transportMode: event.transportCall?.modeOfTransport ?? null
    });
    containers.set(container.number, container);
  }
  if (!containers.size)
    throw trackingFailure(502, "TRACKING_API_SCHEMA", "船司接口尚未返回可核对的集装箱事件");
  for (const container of containers.values()) {
    const latest = container.events.filter((event) => event.actual && event.occurredAt)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
    container.latestEvent = latest?.name ?? null;
    container.currentLocation = latest?.location ?? null;
  }
  const matching = events.find((event) => refs(event, referenceKey).some((value) => sameCarrierReference(value, request.number, carrier, request.type)));
  const result = {
    status: "FOUND", carrier: { code: carrier },
    query: { reference: request.number, referenceType: request.type === "BILLOFLADING" ? "BILL_OF_LADING" : request.type },
    fetchedAt: new Date().toISOString(),
    shipment: {
      bookingNumber: matching.carrierBookingReference ?? (request.type === "BOOKING" ? request.number : null),
      billOfLading: matching.transportDocumentReference ?? (request.type === "BILLOFLADING" ? request.number : null),
      status: null
    },
    containers: [...containers.values()],
    evidence: [{ field: referenceKey, value: request.number, sourceUrl: endpoint }]
  };
  return normalizeMultiCarrierSnapshot(result, carrier, request, "CARRIER_DCSA_API");
}

export async function fetchCarrierDcsa(carrier, request, config, { signal, fetchImpl = fetch } = {}) {
  const deadline = AbortSignal.timeout(30000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const url = new URL(config.endpoint);
  url.searchParams.set(request.type === "CONTAINER" ? "equipmentReference"
    : request.type === "BILLOFLADING" ? "transportDocumentReference" : "carrierBookingReference", request.number);
  url.searchParams.set("limit", "100");
  const events = [];
  const cursors = new Set();
  for (let page = 0; page < 20; page++) {
    let response;
    try {
      response = await fetchImpl(url, {
        signal: combined, redirect: "error", headers: { Accept: "application/json", [config.header]: config.key }
      });
    } catch {
      if (signal?.aborted) throw trackingFailure(409, "BATCH_CANCELLED", "货踪查询已取消");
      throw trackingFailure(deadline.aborted ? 504 : 503,
        deadline.aborted ? "TRACKING_API_TIMEOUT" : "TRACKING_API_UNAVAILABLE", "船司 API 请求超时或连接失败");
    }
    if (!response.ok) {
      const status = response.status;
      throw trackingFailure(status === 404 ? 404 : status === 429 ? 429 : 502,
        status === 404 ? "UPSTREAM_EMPTY" : status === 429 ? "RATE_LIMITED" : "TRACKING_API_UNAVAILABLE",
        status === 404 ? "船司 API 未找到该单号" : "船司 API 暂不可用或接口凭据失效");
    }
    let payload;
    try { payload = JSON.parse(await boundedText(response, 4 * 1024 * 1024)); }
    catch (error) { if (error.code) throw error; throw trackingFailure(502, "TRACKING_API_SCHEMA", "船司 API 未返回 JSON 事件数据"); }
    const values = Array.isArray(payload) ? payload : payload?.events;
    if (!Array.isArray(values) || values.length > 1000)
      throw trackingFailure(502, "TRACKING_API_SCHEMA", "船司接口不是支持的 DCSA 事件列表");
    events.push(...values);
    const cursor = response.headers.get("next-page-cursor");
    if (!cursor) {
      if (!events.length) throw trackingFailure(404, "UPSTREAM_EMPTY", "船司 API 返回空事件列表");
      return normalizeDcsaEvents(events, carrier, request, config.endpoint);
    }
    if (page === 19 || cursors.has(cursor))
      throw trackingFailure(502, "TRACKING_API_PAGINATION", "船司 API 分页未完整结束，未保存截断快照");
    cursors.add(cursor);
    url.searchParams.set("cursor", cursor);
  }
}

export function createMultiCarrierTracker({ env = process.env, agent, fetchImpl = fetch } = {}) {
  let browserAgent = agent;
  return async function track(carrier, request, channel = "AUTO", { signal } = {}) {
    if (!MULTI_CARRIER_CATALOG[carrier]) throw trackingFailure(400, "INVALID_REFERENCE", "不支持的船司");
    if (!["AUTO", "NETWORK", "AGENT", "PLAYWRIGHT"].includes(channel))
      throw trackingFailure(400, "INVALID_REFERENCE", "当前船司不支持此追踪通道");
    let fallbackUsed = false;
    let apiFailure = null;
    if (["AUTO", "NETWORK"].includes(channel)) {
      const config = readCarrierApiConfig(carrier, env);
      if (channel === "NETWORK" && !config)
        throw trackingFailure(503, "TRACKING_API_NOT_CONFIGURED", "尚未配置该船司的独立 API 凭据；可使用自动或 Agent 通道");
      if (config) {
        try {
          return { snapshot: await fetchCarrierDcsa(carrier, request, config, { signal, fetchImpl }), strategy: { requested: channel, used: "NETWORK", fallbackUsed: false } };
        } catch (error) {
          if (signal?.aborted || channel === "NETWORK" || [404, 429].includes(error.httpStatus) ||
              ["TRACKING_IDENTITY_MISMATCH", "TRACKING_API_PAGINATION"].includes(error.code)) throw error;
          fallbackUsed = true;
          apiFailure = error.code || "TRACKING_API_UNAVAILABLE";
        }
      }
    }
    browserAgent ||= createCarrierAgentClient({ baseUrl: env.CARRIER_AGENT_BASE_URL, timeoutMs: Number(env.CARRIER_AGENT_TIMEOUT_MS || 450000), fetchImpl });
    const result = await browserAgent.track(carrier, request, { signal });
    const snapshot = normalizeMultiCarrierSnapshot(result, carrier, request);
    return { snapshot, strategy: { requested: channel, used: "AGENT", fallbackUsed, ...(apiFailure ? { apiFailure } : {}) } };
  };
}
