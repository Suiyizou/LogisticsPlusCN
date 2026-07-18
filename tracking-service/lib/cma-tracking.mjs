const MONTHS = Object.freeze({
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
});

function textOrNull(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

export function parseCmaLocalDateTime(value) {
  const text = textOrNull(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    return text.length === 16 ? `${text}:00` : text;
  }

  const match = text.toUpperCase().match(
    /(?:\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY)?\.?\s*,?\s*)?(\d{1,2})-([A-Z]{3})-(\d{4})(?:\s+|.*?)(\d{1,2}):(\d{2})\s*(AM|PM)/
  );
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText, meridiem] = match;
  const month = MONTHS[monthText];
  if (!month) return null;

  let hour = Number.parseInt(hourText, 10) % 12;
  if (meridiem === "PM") hour += 12;

  return [
    yearText,
    String(month).padStart(2, "0"),
    String(Number.parseInt(dayText, 10)).padStart(2, "0")
  ].join("-") + `T${String(hour).padStart(2, "0")}:${minuteText}:00`;
}

function inferTransportMode(eventName) {
  const event = String(eventName ?? "").toLowerCase();
  if (/vessel|ship|load(?:ed)? on/.test(event)) return "SEA";
  if (/rail|train/.test(event)) return "RAIL";
  if (/truck|gate|depot|container/.test(event)) return "TRUCK";
  return null;
}

function normalizeMilestone(milestone = {}) {
  const name = textOrNull(milestone.name ?? milestone.move);
  if (!name) return null;

  return {
    name,
    occurredAt:
      parseCmaLocalDateTime(milestone.occurredAt ?? milestone.dateText) ??
      textOrNull(milestone.occurredAt),
    location: textOrNull(milestone.location),
    terminal: textOrNull(milestone.terminal),
    vesselVoyage: textOrNull(milestone.vesselVoyage),
    stage: textOrNull(milestone.stage),
    oceanStage: textOrNull(milestone.oceanStage),
    transportMode:
      textOrNull(milestone.transportMode) ?? inferTransportMode(name)
  };
}

function timestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function latestMilestone(milestones) {
  return [...milestones].sort(
    (left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt)
  )[0] ?? null;
}

function findMilestone(milestones, pattern, fromEnd = false) {
  const source = fromEnd ? [...milestones].reverse() : milestones;
  return source.find((milestone) => pattern.test(milestone.name ?? "")) ?? null;
}

function countryCodeFromLocation(location) {
  return textOrNull(location)?.match(/\(([A-Z]{2})\)\s*$/)?.[1] ?? null;
}

function locationName(location) {
  return textOrNull(location)?.replace(/\s*\([A-Z]{2}\)\s*$/, "") ?? null;
}

function buildRoute(containers) {
  const first = containers[0];
  if (!first) return [];

  const route = [];
  if (first.origin?.name) {
    route.push({
      sequence: route.length + 1,
      locationType: "POL",
      city: locationName(first.origin.name),
      countryName: null,
      countryCode: first.origin.countryCode ?? countryCodeFromLocation(first.origin.name),
      facilityCode: null,
      event: "Port of loading",
      estimatedTime: null,
      actualTime: null,
      timezone: null,
      transportModes: ["SEA"],
      active: false
    });
  }
  if (first.destination?.name) {
    route.push({
      sequence: route.length + 1,
      locationType: "POD",
      city: locationName(first.destination.name),
      countryName: null,
      countryCode:
        first.destination.countryCode ?? countryCodeFromLocation(first.destination.name),
      facilityCode: null,
      event: "Port of discharge",
      estimatedTime: first.etaAtPod ?? null,
      actualTime: null,
      timezone: null,
      transportModes: ["SEA"],
      active: true
    });
  }
  return route;
}

function buildRoutingLegs(containers, masterBill) {
  const first = containers[0];
  if (!first?.origin?.name && !first?.destination?.name) return [];
  const milestones = containers.flatMap((container) => container.milestones);
  const loaded = findMilestone(milestones, /load(?:ed)?\s+(?:on|onto).*vessel/i);
  const departed = findMilestone(milestones, /vessel.*depart|depart.*load port/i);
  const arrived = findMilestone(
    milestones,
    /vessel.*arriv|arriv.*(?:discharge|destination|pod)/i,
    true
  );
  const vesselSource = loaded ?? departed ?? arrived;

  return [
    {
      sequence: 1,
      mode: "SEA",
      vesselName: vesselSource?.vesselVoyage ?? null,
      service: null,
      voyage: null,
      estimatedDeparture: null,
      actualDeparture: departed?.occurredAt ?? null,
      estimatedArrival: first.etaAtPod ?? null,
      actualArrival: arrived?.occurredAt ?? null,
      loadPort: locationName(first.origin?.name),
      loadCountryCode:
        first.origin?.countryCode ?? countryCodeFromLocation(first.origin?.name),
      dischargePort: locationName(first.destination?.name),
      dischargeCountryCode:
        first.destination?.countryCode ??
        countryCodeFromLocation(first.destination?.name),
      masterBill
    }
  ];
}

function normalizeContainer(container = {}) {
  const milestones = (container.milestones ?? [])
    .map(normalizeMilestone)
    .filter(Boolean);
  const summaryEvent = normalizeMilestone({
    name: container.latestEvent,
    occurredAt: container.latestEventTime,
    location: container.currentLocation,
    terminal: container.currentTerminal
  });
  if (summaryEvent && !milestones.some((item) =>
    item.name === summaryEvent.name && item.occurredAt === summaryEvent.occurredAt
  )) {
    milestones.push(summaryEvent);
  }

  const latest = summaryEvent ?? latestMilestone(milestones);
  return {
    number: textOrNull(container.number),
    type: [textOrNull(container.typeCode), textOrNull(container.typeLabel)]
      .filter(Boolean)
      .join(" ") || null,
    typeCode: textOrNull(container.typeCode),
    typeLabel: textOrNull(container.typeLabel),
    sealNumber: null,
    trafficTerm: null,
    transportMode: latest?.transportMode ?? null,
    currentLocation: latest?.location ?? textOrNull(container.currentLocation),
    latestEvent: latest?.name ?? textOrNull(container.latestEvent),
    latestEventTime: latest?.occurredAt ?? parseCmaLocalDateTime(container.latestEventTime),
    etaAtLastPod: parseCmaLocalDateTime(container.etaAtPod),
    ataAtLastPod: null,
    detailSource: "CMA_SERVER_RENDERED_HTML",
    milestones,
    referenceNumbers: [],
    origin: container.origin ?? { name: null, countryCode: null },
    destination: container.destination ?? { name: null, countryCode: null },
    etaAtPod: parseCmaLocalDateTime(container.etaAtPod),
    bookingReference: textOrNull(container.bookingReference),
    pdfUrl: textOrNull(container.pdfUrl)
  };
}

export function normalizeCmaSnapshot(result, request, fetchedAt) {
  const containers = (result?.containers ?? [])
    .map(normalizeContainer)
    .filter((container) => container.number);
  if (containers.length === 0) {
    const error = new Error("CMA CGM 没有返回箱号信息");
    error.httpStatus = 404;
    throw error;
  }

  const bookingReference =
    textOrNull(result?.bookingReference) ??
    containers.find((container) => container.bookingReference)?.bookingReference ??
    (request.type === "BOOKING" ? request.number : null);
  const masterBill = request.type === "BILLOFLADING" ? request.number : null;
  const milestones = containers.flatMap((container) => container.milestones);
  const latest = latestMilestone(milestones);
  const departed = findMilestone(milestones, /vessel.*depart|depart.*load port/i);
  const arrived = findMilestone(
    milestones,
    /vessel.*arriv|arriv.*(?:discharge|destination|pod)/i,
    true
  );
  const first = containers[0];
  const containerTypes = new Map();
  for (const container of containers) {
    const type = container.type ?? "UNKNOWN";
    containerTypes.set(type, (containerTypes.get(type) ?? 0) + 1);
  }

  return {
    channel: "PLAYWRIGHT",
    channelNumber: 2,
    channelLabel: "服务端 HTML · Playwright",
    source: "CMA_SERVER_RENDERED_HTML",
    carrier: "CMA CGM",
    provider: {
      code: "CMA",
      name: "CMA CGM",
      channel: "PLAYWRIGHT"
    },
    fetchedAt,
    viewMode: request.type === "CONTAINER" ? "CONTAINER" : "SHIPMENT",
    tracking: {
      type: request.type,
      typeLabel: request.label,
      number: request.number
    },
    summary: {
      billOfLading: masterBill,
      bookingNumbers: bookingReference ? [bookingReference] : [],
      origin: {
        name: locationName(first.origin?.name),
        countryCode:
          first.origin?.countryCode ?? countryCodeFromLocation(first.origin?.name)
      },
      destination: {
        name: locationName(first.destination?.name),
        countryCode:
          first.destination?.countryCode ??
          countryCodeFromLocation(first.destination?.name)
      },
      trafficTerm: null,
      serviceScopes: ["SEA"],
      containers: [...containerTypes.entries()].map(([cntrType, quantity]) => ({
        cntrType,
        quantity
      })),
      latestEvent: latest
        ? {
            name: latest.name,
            occurredAt: latest.occurredAt,
            location: latest.location,
            stage: latest.stage,
            oceanStage: latest.oceanStage,
            transportMode: latest.transportMode
          }
        : null
    },
    keyTimes: {
      actualDeparture: departed
        ? { time: departed.occurredAt, location: departed.location }
        : null,
      actualArrival: arrived
        ? { time: arrived.occurredAt, location: arrived.location }
        : null,
      estimatedDelivery: first.etaAtPod
        ? {
            time: first.etaAtPod,
            actualTime: null,
            location: locationName(first.destination?.name),
            timezone: null
          }
        : null
    },
    route: buildRoute(containers),
    transportStatuses: milestones,
    sailingSchedule: [],
    routingLegs: buildRoutingLegs(containers, masterBill),
    containers: containers.map(({ origin, destination, etaAtPod, bookingReference: _booking, ...container }) => container),
    references: {
      masterBill,
      bookingNumbers: bookingReference ? [bookingReference] : [],
      external: [],
      business: {
        clientNameCode: null,
        clientPoNumber: null,
        forwarderJobNumber: null
      },
      information: containers
        .filter((container) => container.pdfUrl)
        .map((container, index) => ({
          name: `CMA container report ${container.number}`,
          value: container.pdfUrl,
          sequence: index + 1
        }))
    }
  };
}
