import { COSCO_QUERY_CHANNELS, normalizeTrackingRequest } from "./carrier-adapters.mjs";
import { isCoscoProtectionError } from "./cosco-errors.mjs";
import { HttpError } from "./http-utils.mjs";

/**
 * COSCO 快照与容器/参考信息的归一化。从 server.mjs 下沉，供批量/单票查询共用。
 */

export function normalizeContainerNumber(container) {
  return container?.containerNumberWithCheckDigit ?? container?.containerNumber ?? null;
}

export function normalizeContainerMilestone(milestone) {
  if (!milestone) return null;

  return {
    name: milestone.eventName ?? null,
    occurredAt: milestone.actualEventDateTime ?? null,
    location: milestone.eventLocationName ?? milestone.eventLocation ?? null,
    stage: milestone.stageType ?? milestone.stage ?? null,
    oceanStage: milestone.eventStage ?? milestone.oceanStage ?? null,
    transportMode: milestone.transportMode ?? null
  };
}

export function normalizeShipmentContainer(container) {
  const currentMilestone = container?.currentMilestone ?? container?.milestones?.[0] ?? null;
  return {
    number: normalizeContainerNumber(container),
    type: container?.containerType ?? null,
    sealNumber: container?.sealNumber ?? null,
    trafficTerm: container?.trafficTerm ?? null,
    transportMode: currentMilestone?.transportMode ?? null,
    currentLocation: currentMilestone?.eventLocationName ?? currentMilestone?.eventLocation ?? null,
    latestEvent: currentMilestone?.eventName ?? null,
    latestEventTime: currentMilestone?.actualEventDateTime ?? null,
    etaAtLastPod: container?.etaAtLastPod ?? null,
    ataAtLastPod: container?.ataAtLastPod ?? null,
    detailSource: container?.detailSource ?? "SHIPMENT_QUERY",
    needsEnrichment: containerNeedsSubquery(container),
    milestones: (container?.milestones ?? []).map(normalizeContainerMilestone).filter(Boolean),
    referenceNumbers: (container?.refNumbers ?? []).map(normalizeReferenceValue).filter(Boolean)
  };
}

export function normalizeCoscoContainerList(containerInfo) {
  return (Array.isArray(containerInfo) ? containerInfo : [])
    .map(normalizeShipmentContainer)
    .filter((container) => container.number);
}

export function normalizeCoscoBookingReferences(bookingInfo = {}, containerInfo = []) {
  const externalReferences = (bookingInfo.externalReferenceNumbers ?? [])
    .map(normalizeReferenceValue)
    .filter(Boolean);
  const containerReferences = (Array.isArray(containerInfo) ? containerInfo : []).flatMap(
    (container) => (container.refNumbers ?? []).map(normalizeReferenceValue).filter(Boolean)
  );

  return {
    external: [...new Set([...externalReferences, ...containerReferences])],
    business: extractBusinessReferences(bookingInfo),
    information: (bookingInfo.referenceInformation ?? [])
      .map((item) => ({
        name: item.name ?? null,
        value: item.value ?? null,
        sequence: item.seq ?? null
      }))
      .filter((item) => item.name && item.value)
  };
}

export function normalizeCoscoSupplementalDetails(bookingInfo, containerInfo, request, fetchedAt) {
  return {
    fetchedAt,
    tracking: {
      type: request.type,
      number: request.number
    },
    containers: normalizeCoscoContainerList(containerInfo),
    references: normalizeCoscoBookingReferences(bookingInfo, containerInfo)
  };
}

export function selectRequestedContainers(containers, request) {
  const source = Array.isArray(containers) ? containers : [];
  const exact = source.filter(
    (container) => normalizeContainerNumber(container)?.toUpperCase() === request.number
  );
  const selected = exact.length > 0 ? exact : source;
  const unique = new Map();

  for (const container of selected) {
    const number = normalizeContainerNumber(container);
    if (!number || unique.has(number)) continue;
    unique.set(number, container);
  }

  return [...unique.values()];
}

export function normalizeReferenceValue(reference) {
  if (typeof reference === "string") return reference;
  return (
    reference?.value ??
    reference?.referenceNumber ??
    reference?.refNumber ??
    reference?.number ??
    null
  );
}

export function normalizeReferenceName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

export function extractBusinessReferences(bookingInfo = {}) {
  const information = Array.isArray(bookingInfo.referenceInformation)
    ? bookingInfo.referenceInformation
    : [];
  const findByName = (patterns) => {
    const match = information.find((item) => {
      const name = normalizeReferenceName(item?.name ?? item?.label ?? item?.type);
      return patterns.some((pattern) => pattern.test(name));
    });
    return normalizeReferenceValue(match);
  };

  return {
    clientNameCode:
      bookingInfo.clientNameCode ??
      bookingInfo.customerCode ??
      findByName([/client name/, /client code/, /customer.*code/, /客户.*代码/]) ??
      null,
    clientPoNumber:
      bookingInfo.clientPoNumber ??
      bookingInfo.customerPoNumber ??
      findByName([/client.*po/, /customer.*po/, /purchase order/, /客户订单/]) ??
      null,
    forwarderJobNumber:
      bookingInfo.forwarderJobNumber ??
      bookingInfo.jobNumber ??
      findByName([/forwarder.*job/, /job number/, /freight.*order/, /货代订单/]) ??
      null
  };
}

export function containerNeedsSubquery(container) {
  const currentMilestone = container?.currentMilestone ?? container?.milestones?.[0] ?? null;
  return Boolean(
    normalizeContainerNumber(container) &&
    (!Array.isArray(container?.milestones) ||
      container.milestones.length === 0 ||
      !currentMilestone?.eventName ||
      !currentMilestone?.actualEventDateTime ||
      !(currentMilestone?.eventLocationName ?? currentMilestone?.eventLocation) ||
      !currentMilestone?.transportMode)
  );
}

export function mergeContainerMilestone(primary, fallback) {
  const merged = { ...(fallback ?? {}) };
  for (const [key, value] of Object.entries(primary ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export async function enrichCoscoShipmentContainers(containerInfo, fetchContainerDetails) {
  const containers = Array.isArray(containerInfo) ? containerInfo : [];
  if (containers.length === 0 || typeof fetchContainerDetails !== "function") return containers;

  const enriched = [...containers];
  const batchSize = 4;

  for (let offset = 0; offset < containers.length; offset += batchSize) {
    const batch = containers.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (container) => {
        if (!containerNeedsSubquery(container)) return container;

        const number = normalizeContainerNumber(container);
        const request = normalizeTrackingRequest({ type: "CONTAINER", number });

        try {
          const response = await fetchContainerDetails(request);
          const detail = selectRequestedContainers(response, request)[0];
          if (!detail) return container;

          return {
            ...detail,
            ...container,
            containerNumber: container.containerNumber ?? detail.containerNumber ?? null,
            containerNumberWithCheckDigit:
              container.containerNumberWithCheckDigit ??
              detail.containerNumberWithCheckDigit ??
              null,
            containerType: container.containerType ?? detail.containerType ?? null,
            sealNumber: container.sealNumber ?? detail.sealNumber ?? null,
            milestones:
              Array.isArray(detail.milestones) && detail.milestones.length > 0
                ? detail.milestones
                : (container.milestones ?? []),
            currentMilestone: mergeContainerMilestone(
              container.currentMilestone,
              detail.milestones?.[0] ?? detail.currentMilestone
            ),
            etaAtLastPod: container.etaAtLastPod ?? detail.etaAtLastPod ?? null,
            ataAtLastPod: container.ataAtLastPod ?? detail.ataAtLastPod ?? null,
            detailSource: "CONTAINER_SUBQUERY"
          };
        } catch (error) {
          if (isCoscoProtectionError(error)) throw error;
          return { ...container, detailSource: "SHIPMENT_QUERY" };
        }
      })
    );

    results.forEach((container, index) => {
      enriched[offset + index] = container;
    });
  }

  return enriched;
}

export function buildRoutingLegs(result) {
  const summary = result?.cargoTrackingSummary ?? {};
  const route = result?.cargoTrackingFullChain ?? [];
  const schedules = result?.cargoTrackingSailingSchedule ?? [];
  const countryForCity = (city) =>
    route.find(
      (node) => node.city && city && node.city.trim().toLowerCase() === city.trim().toLowerCase()
    )?.countryCode ?? null;
  const legs = schedules.map((sailing, index) => ({
    sequence: index + 1,
    mode: "SEA",
    vesselName: sailing.vesselName ?? null,
    service: sailing.service ?? null,
    voyage: sailing.voyage ?? null,
    estimatedDeparture: sailing.etd ?? null,
    actualDeparture: sailing.atd ?? null,
    estimatedArrival: sailing.eta ?? null,
    actualArrival: sailing.ata ?? null,
    loadPort: sailing.polPort ?? null,
    loadCountryCode: countryForCity(sailing.polPort),
    dischargePort: sailing.podPort ?? null,
    dischargeCountryCode: countryForCity(sailing.podPort),
    masterBill: summary.blNumber ?? null
  }));

  const finalNode = [...route].reverse().find((node) => node.locationType === "FND");
  const podNode = [...route].reverse().find((node) => node.locationType === "LPOD");
  const lastSchedule = schedules.at(-1);
  const latest = summary.latestMilestone;
  const hasInlandDestination =
    finalNode?.city &&
    lastSchedule?.podPort &&
    finalNode.city.trim().toLowerCase() !== lastSchedule.podPort.trim().toLowerCase();

  if (hasInlandDestination) {
    const latestIsDeparture = /depart/i.test(latest?.eventName ?? "");
    legs.push({
      sequence: legs.length + 1,
      mode: latest?.transportMode ?? "INLAND",
      vesselName: null,
      service: null,
      voyage: null,
      estimatedDeparture: null,
      actualDeparture: latestIsDeparture ? (latest.actualEventDateTime ?? null) : null,
      estimatedArrival: finalNode.estimatedTime ?? null,
      actualArrival: finalNode.actualTime ?? null,
      loadPort: podNode?.city ?? lastSchedule.podPort,
      loadCountryCode: podNode?.countryCode ?? countryForCity(lastSchedule.podPort),
      dischargePort: finalNode.city,
      dischargeCountryCode: finalNode.countryCode ?? null,
      masterBill: summary.blNumber ?? null
    });
  }

  return legs;
}

export function normalizeCoscoSnapshot(result, request, fetchedAt, extras = {}) {
  const queryChannel = extras.queryChannel ?? COSCO_QUERY_CHANNELS.NETWORK;
  const summary = result?.cargoTrackingSummary ?? {};
  const latest = summary.latestMilestone ?? null;
  const bookingInfo = extras.bookingInfo ?? {};
  const containerInfo = extras.containerInfo ?? [];
  const normalizedReferences = normalizeCoscoBookingReferences(bookingInfo, containerInfo);
  const routingLegs = buildRoutingLegs(result);
  const actualDepartureLeg = routingLegs.find((leg) => leg.actualDeparture);
  const actualArrivalLeg = [...routingLegs].reverse().find((leg) => leg.actualArrival);
  const finalRouteNode = [...(result?.cargoTrackingFullChain ?? [])]
    .reverse()
    .find((node) => node.locationType === "FND");
  const businessReferences = normalizedReferences.business;

  return {
    channel: queryChannel.code,
    channelNumber: queryChannel.number,
    channelLabel: queryChannel.label,
    source: queryChannel.source,
    carrier: "COSCO SHIPPING Lines",
    provider: {
      code: "COSCO",
      name: "COSCO SHIPPING Lines",
      channel: queryChannel.code
    },
    fetchedAt,
    tracking: {
      type: request.type,
      typeLabel: request.label,
      number: request.number
    },
    summary: {
      billOfLading: summary.blNumber ?? null,
      bookingNumbers: summary.bookingNumber ?? [],
      origin: {
        name: summary.por ?? null,
        countryCode: summary.porCountryCode ?? null
      },
      destination: {
        name: summary.fnd ?? null,
        countryCode: summary.fndCountryCode ?? null
      },
      trafficTerm: summary.trafficTerm ?? null,
      serviceScopes: (summary.serviceScopes ?? []).filter(Boolean),
      containers: summary.containerSummaryInfos ?? [],
      latestEvent: latest
        ? {
            name: latest.eventName ?? null,
            occurredAt: latest.actualEventDateTime ?? null,
            location: latest.eventLocation ?? null,
            // The COSCO payload uses both pairs depending on which query path
            // answered. Preserve the source phase (for example EXPORT) in the
            // durable snapshot instead of keeping only the display event name.
            stage: latest.stageType ?? latest.stage ?? null,
            oceanStage: latest.eventStage ?? latest.oceanStage ?? null,
            transportMode: latest.transportMode ?? null
          }
        : null
    },
    keyTimes: {
      actualDeparture: actualDepartureLeg
        ? {
            time: actualDepartureLeg.actualDeparture,
            location: actualDepartureLeg.loadPort
          }
        : null,
      actualArrival: actualArrivalLeg
        ? {
            time: actualArrivalLeg.actualArrival,
            location: actualArrivalLeg.dischargePort
          }
        : null,
      estimatedDelivery: finalRouteNode
        ? {
            time: finalRouteNode.estimatedTime ?? null,
            actualTime: finalRouteNode.actualTime ?? null,
            location: finalRouteNode.city ?? null,
            timezone: finalRouteNode.localTimezone ?? null
          }
        : null
    },
    route: (result?.cargoTrackingFullChain ?? []).map((item, index) => ({
      sequence: index + 1,
      locationType: item.locationType ?? null,
      city: item.city ?? null,
      countryName: item.countryName ?? null,
      countryCode: item.countryCode ?? null,
      facilityCode: item.facilityCode ?? null,
      event: item.event ?? null,
      estimatedTime: item.estimatedTime ?? null,
      actualTime: item.actualTime ?? null,
      timezone: item.localTimezone ?? null,
      transportModes: item.transportModes ?? [],
      active: Boolean(item.active)
    })),
    transportStatuses: result?.cargoTrackingTransportStatus ?? [],
    sailingSchedule: result?.cargoTrackingSailingSchedule ?? [],
    routingLegs,
    containers: normalizeCoscoContainerList(containerInfo),
    references: {
      masterBill: summary.blNumber ?? null,
      bookingNumbers: summary.bookingNumber ?? [],
      ...normalizedReferences,
      business: businessReferences
    }
  };
}

export function normalizeCoscoContainerSnapshot(containerResult, request, fetchedAt, extras = {}) {
  const queryChannel = extras.queryChannel ?? COSCO_QUERY_CHANNELS.NETWORK;
  const selectedContainers = selectRequestedContainers(containerResult, request);

  if (selectedContainers.length === 0) {
    throw new HttpError(404, "COSCO 没有返回该箱号的动态");
  }

  const primaryContainer = selectedContainers[0];
  const primaryMilestone = primaryContainer.milestones?.[0] ?? null;
  const latest = normalizeContainerMilestone(primaryMilestone);
  const containers = selectedContainers.map((container) => {
    const milestone = container.milestones?.[0] ?? null;
    return {
      number: normalizeContainerNumber(container),
      type: container.containerType ?? null,
      sealNumber: container.sealNumber ?? null,
      trafficTerm: null,
      transportMode: milestone?.transportMode ?? null,
      currentLocation: milestone?.eventLocationName ?? milestone?.eventLocation ?? null,
      latestEvent: milestone?.eventName ?? null,
      latestEventTime: milestone?.actualEventDateTime ?? null,
      etaAtLastPod: container.etaAtLastPod ?? null,
      ataAtLastPod: container.ataAtLastPod ?? null,
      referenceNumbers: [],
      milestones: (container.milestones ?? []).map(normalizeContainerMilestone).filter(Boolean)
    };
  });

  return {
    channel: queryChannel.code,
    channelNumber: queryChannel.number,
    channelLabel: queryChannel.label,
    source: queryChannel.source,
    carrier: "COSCO SHIPPING Lines",
    provider: {
      code: "COSCO",
      name: "COSCO SHIPPING Lines",
      channel: queryChannel.code
    },
    fetchedAt,
    viewMode: "CONTAINER",
    tracking: {
      type: request.type,
      typeLabel: request.label,
      number: request.number
    },
    summary: {
      billOfLading: null,
      bookingNumbers: [],
      origin: { name: null, countryCode: null },
      destination: { name: null, countryCode: null },
      trafficTerm: null,
      serviceScopes: [],
      containers: containers.map((container) => ({
        containerNumber: container.number,
        containerType: container.type,
        quantity: 1
      })),
      latestEvent: latest
    },
    keyTimes: {
      actualDeparture: null,
      actualArrival: primaryContainer.ataAtLastPod
        ? { time: primaryContainer.ataAtLastPod, location: null }
        : null,
      estimatedDelivery: primaryContainer.etaAtLastPod
        ? { time: primaryContainer.etaAtLastPod, actualTime: null, location: null, timezone: null }
        : null
    },
    route: [],
    transportStatuses: primaryContainer.milestones ?? [],
    sailingSchedule: [],
    routingLegs: [],
    containers,
    references: {
      masterBill: null,
      bookingNumbers: [],
      external: [],
      business: {
        clientNameCode: null,
        clientPoNumber: null,
        forwarderJobNumber: null
      },
      information: []
    }
  };
}
