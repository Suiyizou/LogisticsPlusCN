import {
  MULTI_CARRIER_CATALOG, officialCarrierUrl, sameCarrierReference, trackingFailure
} from "./multi-carrier-catalog.mjs";

const text = (value) => typeof value === "string" ? value.trim().slice(0, 2000) || null : null;
const safeDate = (value) => {
  const date = text(value);
  return date && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(date)
    && Number.isFinite(Date.parse(date)) ? date : null;
};

/** Only evidence-qualified successful results become durable shipment snapshots. */
export function normalizeMultiCarrierSnapshot(result, carrier, request, source = "CARRIER_BROWSER_AGENT") {
  const definition = MULTI_CARRIER_CATALOG[carrier];
  if (!definition) throw trackingFailure(400, "INVALID_REFERENCE", "不支持的船司");
  const fail = (code, message) => trackingFailure(502, code, message);
  if (!result || result.carrier?.code !== carrier ||
      !sameCarrierReference(result.query?.reference, request.number, carrier, request.type) ||
      result.query?.referenceType !== (request.type === "BILLOFLADING" ? "BILL_OF_LADING" : request.type))
    throw fail("TRACKING_IDENTITY_MISMATCH", "货踪结果与请求的船司或单号不匹配，未保存结果");
  if (result.status === "HUMAN_REQUIRED")
    throw trackingFailure(409, "TRACKING_HUMAN_REQUIRED", "船司要求登录或人工验证，请先在官方查询页完成验证", {
      carrier, officialUrl: definition.trackingUrl, action: "OPEN_CARRIER_PAGE", retryable: false
    });
  if (result.status === "NOT_FOUND")
    throw trackingFailure(404, "UPSTREAM_EMPTY", "船司查询页明确返回无匹配货物");
  if (result.status !== "FOUND" || !result.shipment || /LABBOOKING123|演示数据|demo data/i.test(result.query.reference + (result.note || "")))
    throw fail("TRACKING_AGENT_FAILED", "船司未返回可验证的真实货踪结果，未保存快照");
  const evidence = (Array.isArray(result.evidence) ? result.evidence : [])
    .filter((item) => officialCarrierUrl(item?.sourceUrl, carrier) && text(item?.value));
  const identities = request.type === "CONTAINER"
    ? (result.containers ?? []).map((item) => item.number)
    : [result.shipment.bookingNumber, result.shipment.billOfLading];
  if (!identities.some((value) => sameCarrierReference(value, request.number, carrier, request.type)) ||
      !evidence.some((item) => /booking|billOfLading|transportDocument|number|reference/i.test(item.field || "") &&
        sameCarrierReference(item.value, request.number, carrier, request.type)))
    throw fail("TRACKING_EVIDENCE_REQUIRED", "货踪缺少同一单号的官网证据，未保存结果");

  const shipment = result.shipment;
  const normalizeEvent = (event) => ({
    name: text(event?.name), occurredAt: event?.actual === true ? safeDate(event.occurredAt) : null,
    estimatedAt: safeDate(event?.estimatedAt) ?? (event?.actual === false ? safeDate(event.occurredAt) : null),
    actual: event?.actual === true, location: text(event?.location),
    vesselVoyage: [text(event?.vessel), text(event?.voyage)].filter(Boolean).join(" / ") || null,
    transportMode: text(event?.transportMode), stage: null, oceanStage: null, terminal: null
  });
  const containers = (Array.isArray(result.containers) ? result.containers : [])
    .filter((item) => /^[A-Z]{4}\d{7}$/.test(text(item?.number) || ""))
    .map((item) => {
      const milestones = (Array.isArray(item.events) ? item.events : []).map(normalizeEvent).filter((event) => event.name);
      const actualEvents = milestones.filter((event) => event.actual && event.occurredAt)
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
      const latest = actualEvents[0];
      return {
        number: item.number, type: text(item.type), typeCode: text(item.type), typeLabel: null,
        sealNumber: null, trafficTerm: null, transportMode: latest?.transportMode ?? null,
        currentLocation: text(item.currentLocation) ?? latest?.location ?? null,
        latestEvent: text(item.latestEvent) ?? text(item.status) ?? latest?.name ?? null,
        latestEventTime: latest?.occurredAt ?? null, etaAtLastPod: safeDate(shipment.eta),
        ataAtLastPod: safeDate(shipment.actualArrival), detailSource: source,
        milestones, referenceNumbers: []
      };
    });
  if (request.type === "CONTAINER" && !containers.some((item) => item.number === request.number))
    throw fail("TRACKING_IDENTITY_MISMATCH", "货踪结果未包含请求的集装箱");
  if (!text(shipment.status) && !containers.some((item) => item.latestEvent || item.milestones.length))
    throw fail("TRACKING_EVIDENCE_REQUIRED", "官网结果没有运输状态或节点，未保存空快照");
  const types = new Map();
  for (const item of containers) types.set(item.type || "UNKNOWN", (types.get(item.type || "UNKNOWN") || 0) + 1);
  const events = containers.flatMap((item) => item.milestones);
  const latest = events.filter((event) => event.actual && event.occurredAt)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
  const origin = { name: text(shipment.origin), countryCode: null };
  const destination = { name: text(shipment.destination), countryCode: null };
  const booking = text(shipment.bookingNumber);
  const bill = text(shipment.billOfLading);
  const route = [
    { name: origin.name, locationType: "POL", event: "Port of loading", estimated: shipment.etd, actual: shipment.actualDeparture },
    { name: destination.name, locationType: "POD", event: "Port of discharge", estimated: shipment.eta, actual: shipment.actualArrival }
  ].filter((item) => item.name).map((item, index) => ({
    sequence: index + 1, locationType: item.locationType, city: item.name,
    countryName: null, countryCode: null, facilityCode: null, event: item.event,
    estimatedTime: safeDate(item.estimated), actualTime: safeDate(item.actual),
    timezone: null, transportModes: ["SEA"], active: item.locationType === "POD"
  }));
  return {
    channel: source === "CARRIER_DCSA_API" ? "NETWORK" : "AGENT", channelNumber: source === "CARRIER_DCSA_API" ? 1 : 4,
    channelLabel: source === "CARRIER_DCSA_API" ? "船司授权 API" : "官网浏览器 Agent", source,
    carrier: definition.name, provider: { code: carrier, name: definition.name, channel: source === "CARRIER_DCSA_API" ? "NETWORK" : "AGENT" },
    fetchedAt: safeDate(result.fetchedAt) ?? new Date().toISOString(),
    viewMode: request.type === "CONTAINER" ? "CONTAINER" : "SHIPMENT",
    tracking: { type: request.type, typeLabel: request.label, number: request.number },
    summary: {
      billOfLading: bill, bookingNumbers: booking ? [booking] : [], origin, destination,
      trafficTerm: null, serviceScopes: ["SEA"], status: text(shipment.status),
      containers: [...types].map(([cntrType, quantity]) => ({ cntrType, quantity })),
      latestEvent: latest ?? (text(shipment.status) ? { name: text(shipment.status), occurredAt: null, location: null } : null)
    },
    keyTimes: {
      actualDeparture: safeDate(shipment.actualDeparture) ? { time: safeDate(shipment.actualDeparture), location: origin.name } : null,
      actualArrival: safeDate(shipment.actualArrival) ? { time: safeDate(shipment.actualArrival), location: destination.name } : null,
      estimatedDelivery: safeDate(shipment.eta) ? { time: safeDate(shipment.eta), actualTime: safeDate(shipment.actualArrival), location: destination.name, timezone: null } : null
    },
    route, transportStatuses: events, sailingSchedule: [],
    routingLegs: origin.name || destination.name ? [{ sequence: 1, mode: "SEA", vesselName: text(shipment.vessel), voyage: text(shipment.voyage), loadPort: origin.name, dischargePort: destination.name, estimatedDeparture: safeDate(shipment.etd), actualDeparture: safeDate(shipment.actualDeparture), estimatedArrival: safeDate(shipment.eta), actualArrival: safeDate(shipment.actualArrival), masterBill: bill }] : [],
    containers, references: {
      masterBill: bill, bookingNumbers: booking ? [booking] : [], external: [],
      business: { clientNameCode: null, clientPoNumber: null, forwarderJobNumber: null }, information: []
    },
    verification: { runId: text(result.runId), evidenceCount: evidence.length, officialUrl: definition.trackingUrl },
    warnings: []
  };
}
