import { logisticsPortCatalog } from "./logistics-port-catalog.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const string = (value) => (typeof value === "string" ? value.trim() : "");
const firstString = (...values) => values.map(string).find(Boolean) ?? "";
const valueId = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? String(value) : string(value);
const nameKey = (value) =>
  string(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const codeKey = (value) => {
  const code = nameKey(value).replace(/^([A-Z]{2})[ -]([A-Z2-9]{3})$/, "$1$2");
  return /^[A-Z]{2}[A-Z2-9]{3}$/.test(code) ? code : "";
};
const byCode = new Map(logisticsPortCatalog.map((port) => [port.id, port]));
const byName = new Map();
const countries = new Map();
const regionNames = ["en", "zh", "zh-Hant"].map(
  (language) => new Intl.DisplayNames(language, { type: "region" })
);

for (const port of logisticsPortCatalog) {
  for (const alias of new Set([port.label, ...port.aliases].map(nameKey))) {
    if (!byName.has(alias)) byName.set(alias, []);
    byName.get(alias).push(port);
  }
  if (!countries.has(port.countryCode)) {
    countries.set(port.countryCode, [
      port.countryCode,
      ...regionNames.map((names) => nameKey(names.of(port.countryCode)))
    ]);
  }
}
for (const [country, aliases] of [
  ["CN", ["CHN", "PRC", "MAINLAND CHINA", "P.R. CHINA"]],
  ["US", ["USA", "U.S.", "U.S.A.", "UNITED STATES OF AMERICA"]],
  ["GB", ["UK", "GREAT BRITAIN", "ENGLAND"]],
  ["KR", ["REPUBLIC OF KOREA", "KOREA, REPUBLIC OF"]],
  ["VN", ["VIET NAM"]],
  ["AE", ["UAE", "U.A.E."]],
  ["HK", ["HONG KONG SAR", "HONG KONG, CHINA"]],
  ["TW", ["TAIWAN", "TAIWAN, CHINA"]]
]) {
  countries.get(country).push(...aliases);
}

function countryFor(value) {
  const key = nameKey(value);
  if (!key) return "";
  for (const [country, names] of countries) {
    if (names.includes(key)) return country;
  }
  return /^[A-Z]{2}$/.test(key) ? key : "";
}

function candidatesFor(label, countryCode) {
  const key = nameKey(label);
  const compatible = (port) => !countryCode || countryCode === port.countryCode;
  const exactCode = byCode.get(codeKey(key));
  if (exactCode) return compatible(exactCode) ? [exactCode] : [];
  const exactName = byName.get(key);
  if (exactName) return exactName.filter(compatible);
  // Strip only an explicit "Port of" marker or a verified country/subdivision suffix.
  const trimmed = key.replace(/^PORT OF /, "");
  const exactPort = byName.get(trimmed);
  if (exactPort) return exactPort.filter(compatible);
  for (const delimiter of [",", "("]) {
    const position = trimmed.indexOf(delimiter);
    if (position < 1) continue;
    if (delimiter === "(" && !trimmed.endsWith(")")) continue;
    const name = trimmed.slice(0, position).trim();
    const suffix = trimmed.slice(position + 1, delimiter === "(" ? -1 : undefined).trim();
    const result = (byName.get(name) ?? []).filter(
      (port) =>
        compatible(port) &&
        (countryFor(suffix) === port.countryCode ||
          codeKey(suffix) === port.id ||
          port.subdivisions.map(nameKey).includes(suffix) ||
          (suffix.includes(",") &&
            countryFor(suffix.split(",").at(-1)) === port.countryCode &&
            port.subdivisions
              .map(nameKey)
              .includes(suffix.split(",").slice(0, -1).join(",").trim())))
    );
    if (result.length > 0) return result;
  }
  return [];
}

function positionValue(value, limit) {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
  ) {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
}

function describeLocation(value, country = "") {
  if (typeof value === "string") return { label: string(value), country };
  if (!value || typeof value !== "object") return { label: "", country };
  const loc = typeof value.location === "object" && value.location ? value.location : {};
  return {
    label: firstString(
      value.city,
      value.name,
      value.locationName,
      value.location,
      value.port,
      loc.city,
      loc.name
    ),
    country: firstString(
      value.countryCode,
      loc.countryCode,
      country,
      value.countryName,
      loc.countryName
    ),
    locode: firstString(
      value.unLocationCode,
      value.UNLocationCode,
      value.unLocode,
      value.locode,
      value.locationCode,
      loc.unLocationCode,
      loc.UNLocationCode,
      loc.unLocode,
      loc.locode,
      loc.locationCode,
      byCode.has(codeKey(value.facilityCode)) ? value.facilityCode : ""
    ),
    latitude:
      value.latitude ??
      value.lat ??
      value.coordinates?.latitude ??
      value.coordinates?.lat ??
      loc.latitude ??
      loc.lat,
    longitude:
      value.longitude ??
      value.lon ??
      value.lng ??
      value.coordinates?.longitude ??
      value.coordinates?.lon ??
      value.coordinates?.lng ??
      loc.longitude ??
      loc.lon ??
      loc.lng
  };
}

function resolveLocation(source) {
  const { label, locode } = source;
  const country = countryFor(source.country);
  const explicitCode = codeKey(locode);
  const codedPort = byCode.get(explicitCode);
  const nameCandidates = candidatesFor(label, country);
  const reportedLabel = label || locode || "";
  if (codedPort) {
    if (country && codedPort.countryCode !== country) return null;
    const unfiltered = candidatesFor(label, "");
    if (unfiltered.length > 0 && !unfiltered.includes(codedPort)) return null;
    return { ...codedPort, coordinateSource: "catalog" };
  }
  if (nameCandidates.length === 1 && !explicitCode) {
    return { ...nameCandidates[0], coordinateSource: "catalog" };
  }
  const latitude = positionValue(source.latitude, 90);
  const longitude = positionValue(source.longitude, 180);
  if (latitude === null || longitude === null || (latitude === 0 && longitude === 0)) return null;
  if (explicitCode && country && explicitCode.slice(0, 2) !== country) return null;
  return {
    id: `coordinates:${latitude},${longitude}:${nameKey(reportedLabel)}`,
    label: reportedLabel || `${latitude}, ${longitude}`,
    countryCode: country || explicitCode.slice(0, 2) || null,
    latitude,
    longitude,
    coordinateSource: "reported"
  };
}

function ordered(values) {
  const rows = list(values).filter(Boolean);
  const sequence = (row) => Number(row.sequence);
  return rows.every((row) => row.sequence != null && Number.isFinite(sequence(row)))
    ? [...rows].sort((a, b) => sequence(a) - sequence(b))
    : rows;
}

function isDescribed(location) {
  return Boolean(location.label || location.locode || resolveLocation(location));
}

function readLatestEvent(event) {
  const name = firstString(event, event?.name, event?.eventName, event?.description);
  const occurredAt = firstString(event?.occurredAt, event?.actualEventDateTime) || null;
  const reportedTime = string(event?.reportedTime) || null;
  const location =
    firstString(event?.location, event?.eventLocation, event?.location?.name) || null;
  return name || occurredAt || reportedTime || location
    ? { name, occurredAt, reportedTime, location }
    : null;
}

function routeRole(row, index, total) {
  const type = string(row.locationType).toUpperCase();
  if (type === "POR" || type.includes("RECEIPT")) return "origin";
  if (type === "FND" || type.includes("FINAL")) return "destination";
  if (["POL", "FPOL"].includes(type)) return index === 0 ? "origin" : "load";
  if (["POD", "LPOD"].includes(type)) return index === total - 1 ? "destination" : "discharge";
  if (index === 0) return "origin";
  if (index === total - 1) return "destination";
  return "transshipment";
}

const point = ({ latitude, longitude }) => ({ latitude, longitude });

// Split shortest signed longitude arcs at the date line to avoid a line through the whole map.
// These connectors show reported endpoint relationships; they are not navigational tracks.
export function splitLogisticsMapSegment(from, to) {
  const start = point(from);
  const end = point(to);
  const delta = end.longitude - start.longitude;
  if (Math.abs(delta) <= 180) return [[start, end]];
  const boundary = delta < 0 ? 180 : -180;
  const wrappedEnd = end.longitude + 2 * boundary;
  if (wrappedEnd === start.longitude) return [[start, { ...end, longitude: start.longitude }]];
  const ratio = (boundary - start.longitude) / (wrappedEnd - start.longitude);
  const latitude = start.latitude + ratio * (end.latitude - start.latitude);
  const segments = [];
  if (ratio > 0) segments.push([start, { latitude, longitude: boundary }]);
  if (ratio < 1) segments.push([{ latitude, longitude: -boundary }, end]);
  return segments;
}

export function buildLogisticsMapModel(records) {
  const nodes = new Map();
  const edges = new Map();
  const shipments = [];
  const unresolved = [];
  const seen = new Set();

  list(records).forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    const snapshot = record.snapshot ?? record;
    const summary = snapshot.summary ?? {};
    const reference = firstString(
      record.query?.number,
      record.referenceNo,
      record.reference,
      snapshot.tracking?.number,
      summary.billOfLading
    );
    const carrier = firstString(
      record.query?.carrier,
      snapshot.provider?.code,
      record.carrier,
      snapshot.tracking?.carrier
    );
    const referenceType = firstString(
      record.query?.type,
      record.referenceType,
      record.type,
      snapshot.tracking?.type
    );
    const id =
      valueId(record.shipmentId) ||
      valueId(record.id) ||
      (reference
        ? [carrier, referenceType, reference]
            .filter(Boolean)
            .map((part) => part.toUpperCase())
            .join(":")
        : `record:${index + 1}`);
    if (seen.has(id)) return;
    seen.add(id);
    const shipment = {
      id,
      label:
        firstString(record.label, reference, summary.billOfLading, valueId(record.shipmentId)) ||
        id,
      reference,
      referenceType,
      carrier,
      status: firstString(record.trackingStatus, summary.status, snapshot.tracking?.status),
      updatedAt:
        firstString(record.lastTrackedAt, record.savedAt, snapshot.fetchedAt, record.updatedAt) ||
        null,
      latestEvent: readLatestEvent(summary.latestEvent ?? snapshot.latestEvent),
      hasLocations: false,
      nodeIds: [],
      edgeIds: [],
      unresolved: []
    };
    const shipmentNodes = new Set();
    const shipmentEdges = new Set();
    const shipmentUnresolved = new Set();

    const capture = (source, role) => {
      const port = resolveLocation(source);
      if (!port) {
        const label = source.label || source.locode || "";
        const key = `${nameKey(label)}|${nameKey(source.country)}`;
        if (label && !shipmentUnresolved.has(key)) {
          shipmentUnresolved.add(key);
          const entry = { shipmentId: id, label, role };
          shipment.unresolved.push(entry);
          unresolved.push(entry);
        }
        return null;
      }
      if (!nodes.has(port.id)) {
        const { id: nodeId, label, latitude, longitude, countryCode, coordinateSource } = port;
        nodes.set(nodeId, {
          id: nodeId,
          label,
          labelZh: port.aliases?.find((alias) => /\p{Script=Han}/u.test(alias)) ?? null,
          locode: coordinateSource === "catalog" ? nodeId : null,
          latitude,
          longitude,
          countryCode,
          coordinateSource,
          shipmentIds: [],
          roles: []
        });
      }
      const node = nodes.get(port.id);
      if (!shipmentNodes.has(node.id)) {
        node.shipmentIds.push(id);
        shipmentNodes.add(node.id);
      }
      if (!node.roles.includes(role)) node.roles.push(role);
      return node;
    };

    const connect = (from, to, source) => {
      if (!from || !to || from.id === to.id) return;
      const id = `${encodeURIComponent(from.id)}>${encodeURIComponent(to.id)}`;
      if (!edges.has(id)) {
        edges.set(id, {
          id,
          from: from.id,
          to: to.id,
          shipmentIds: [],
          sources: [],
          segments: splitLogisticsMapSegment(from, to)
        });
      }
      const edge = edges.get(id);
      if (!edge.sources.includes(source)) edge.sources.push(source);
      if (!shipmentEdges.has(id)) {
        edge.shipmentIds.push(shipment.id);
        shipmentEdges.add(id);
      }
    };

    const summaryOrigin = describeLocation(summary.origin ?? record.origin);
    const summaryDestination = describeLocation(summary.destination ?? record.destination);
    const route = ordered(snapshot.route).map((row, i, rows) => ({
      location: describeLocation(row),
      role: routeRole(row, i, rows.length)
    }));
    const legs = ordered(snapshot.routingLegs).map((leg) => ({
      from: describeLocation(leg.loadPort ?? leg.origin, leg.loadCountryCode),
      to: describeLocation(leg.dischargePort ?? leg.destination, leg.dischargeCountryCode)
    }));
    const routeCount = route.filter(({ location }) => isDescribed(location)).length;
    const legCount = legs.filter(({ from, to }) => isDescribed(from) && isDescribed(to)).length;
    const origin = capture(summaryOrigin, "origin");
    if (routeCount >= 2 && (routeCount > 2 || legCount <= 1)) {
      let previous = null;
      for (const { location, role } of route) {
        const current = capture(location, role);
        connect(previous, current, "route");
        previous = current;
      }
      // Explicit legs may contain distinct endpoints absent from the carrier's route array.
      for (const { from, to } of legs) {
        capture(from, "load");
        capture(to, "discharge");
      }
      capture(summaryDestination, "destination");
    } else if (legCount > 0) {
      for (const { from, to } of legs) {
        connect(capture(from, "load"), capture(to, "discharge"), "routingLegs");
      }
      for (const { location, role } of route) capture(location, role);
      capture(summaryDestination, "destination");
    } else {
      const endpointIds = new Set(
        [origin?.id, resolveLocation(summaryDestination)?.id].filter(Boolean)
      );
      const otherReportedStop = [
        ...route.map(({ location }) => location),
        ...legs.flatMap(({ from, to }) => [from, to])
      ].some(
        (location) => isDescribed(location) && !endpointIds.has(resolveLocation(location)?.id)
      );
      for (const { location, role } of route) capture(location, role);
      for (const { from, to } of legs) {
        capture(from, "load");
        capture(to, "discharge");
      }
      const destination = capture(summaryDestination, "destination");
      if (!otherReportedStop) connect(origin, destination, "summary");
    }

    shipment.hasLocations = shipmentNodes.size > 0;
    shipment.nodeIds = [...shipmentNodes];
    shipment.edgeIds = [...shipmentEdges];
    shipments.push(shipment);
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()], shipments, unresolved };
}
