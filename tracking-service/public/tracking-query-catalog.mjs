import { MULTI_CARRIER_CATALOG, SUPPORTED_CARRIER_CODES } from "./carrier-catalog.mjs";

const LOCAL_QUEUE_ONLY_CARRIERS = Object.freeze({
  ONE: "ONE",
  HMM: "HMM",
  EVERGREEN: "Evergreen",
  MATSON: "Matson",
  YML: "Yang Ming",
  WAN_HAI: "Wan Hai",
  SML: "SM Line",
  KMTC: "KMTC",
  ZIM: "ZIM"
});

const CARRIER_ALIASES = new Map([
  ["CMA_CGM", "CMA"],
  ["CMA CGM", "CMA"],
  ["HPL", "HAPAG_LLOYD"],
  ["YANGMING", "YML"],
  ["YANG MING", "YML"],
  ["WHL", "WAN_HAI"],
  ["WHZ", "WAN_HAI"],
  ["WAN HAI", "WAN_HAI"],
  ["MSK", "MAERSK"],
  ["EMC", "EVERGREEN"],
  ["MATSN", "MATSON"]
]);

export function canonicalTrackingCarrier(value) {
  const code = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return CARRIER_ALIASES.get(code) ?? code;
}

// Printed bill prefixes identify the issuing carrier. Container owner codes
// do not establish which line is carrying the container on this voyage.
const ISSUER_PREFIXES = {
  COSU: "COSCO", ONEY: "ONE", MATS: "MATSON", HDMU: "HMM", SHAM: "HMM",
  EGLV: "EVERGREEN", MAEU: "MAERSK", MEDU: "MSC", CMDU: "CMA", TJN: "CMA",
  HLCU: "HAPAG_LLOYD", OOLU: "OOCL", YMJ: "YML", YMLU: "YML",
  WHLC: "WAN_HAI", ZIMU: "ZIM", KORP: "KMTC", KMTC: "KMTC", SMLM: "SML"
};
const CONTAINER_NUMBER = /^[A-Z]{3}[UJZ][0-9]{6}-?[0-9]$/;
const TYPE_PREFIXES = { BL: "BILLOFLADING", BK: "BOOKING", CN: "CONTAINER" };

export function parseTrackingReference(value, localQueue) {
  const parts = String(value ?? "").trim().toUpperCase().replaceAll("：", ":").split(":");
  const number = parts.pop().replace(/\s+/g, "");
  if (!/^[A-Z0-9][A-Z0-9-]{3,34}$/.test(number) || parts.length > 2) {
    return { error: "query.invalidReference" };
  }
  const carrierPrefix = parts[0]?.trim();
  const explicitCarrier = parts.length
    ? (Object.hasOwn(ISSUER_PREFIXES, carrierPrefix) ? ISSUER_PREFIXES[carrierPrefix] : canonicalTrackingCarrier(carrierPrefix))
    : null;
  const typePrefix = parts.length === 2 ? parts[1].trim() : null;
  if (typePrefix !== null && !Object.hasOwn(TYPE_PREFIXES, typePrefix)) {
    return { error: "query.invalidReference" };
  }
  const container = CONTAINER_NUMBER.test(number);
  const issuer = Object.entries(ISSUER_PREFIXES).find(([prefix]) =>
    number.startsWith(prefix) && number.length > prefix.length && /\d/.test(number)
  )?.[1];
  const carrier = explicitCarrier ?? (container ? null : issuer);
  if (!carrier) return { error: "query.carrierPrefixRequired" };
  if (!Object.hasOwn(trackingQueryCarriers(localQueue), carrier)) {
    return { error: "query.unsupportedReference" };
  }
  // In legacy mode COSCO's booking endpoint accepts the numeric part of COSU bills.
  if (!typePrefix && !container && !localQueue && carrier === "COSCO" && /^COSU\d+$/.test(number)) {
    return { carrier, type: "BOOKING", number: number.slice(4) };
  }
  let type = container ? "CONTAINER" : (carrier === issuer && carrier !== "CMA" ? "BILLOFLADING" : "BOOKING");
  if (typePrefix) type = TYPE_PREFIXES[typePrefix];
  if (type === "CONTAINER" && !container) return { error: "query.invalidReference" };
  if (!supportsTrackingQuery(carrier, type, localQueue)) return { error: "query.unsupportedReference" };
  return { carrier, type, number: type === "CONTAINER" ? number.replace("-", "") : number };
}

// Restored links can contain unprefixed legacy numbers or an explicit type
// that differs from the inferred one. A re-submit must preserve that identity.
export function formatTrackingReference(query, localQueue) {
  for (const value of [query.number, `${query.carrier}:${query.number}`]) {
    const parsed = parseTrackingReference(value, localQueue);
    if (parsed.carrier === query.carrier && parsed.type === query.type && parsed.number === query.number) return value;
  }
  const prefix = Object.keys(TYPE_PREFIXES).find((key) => TYPE_PREFIXES[key] === query.type);
  return `${query.carrier}:${prefix}:${query.number}`;
}

export function trackingQueryCarriers(localQueue) {
  const carriers = {
    COSCO: { name: "COSCO SHIPPING", source: "COSCO · PUBLIC WEB" },
    CMA: { name: "CMA CGM", source: "CMA CGM · SERVER HTML" },
    ...Object.fromEntries(
      Object.values(MULTI_CARRIER_CATALOG).map(({ code, name }) => [
        code, { name, source: "OFFICIAL API / BROWSER AGENT" }
      ])
    ),
    ...(localQueue && Object.fromEntries(
      Object.entries(LOCAL_QUEUE_ONLY_CARRIERS).map(([code, name]) => [code, { name }])
    ))
  };
  return Object.fromEntries(
    Object.entries(carriers).map(([code, carrier]) => [code, { code, ...carrier }])
  );
}

export function supportsTrackingQuery(carrier, type, localQueue) {
  const legacyCarrier = SUPPORTED_CARRIER_CODES.includes(carrier);
  if (!legacyCarrier && !(localQueue && Object.hasOwn(LOCAL_QUEUE_ONLY_CARRIERS, carrier))) {
    return false;
  }
  return type === "BOOKING"
    || (type === "BILLOFLADING" && carrier !== "CMA" && (localQueue || carrier !== "COSCO"))
    || (type === "CONTAINER" && (!localQueue || carrier !== "KMTC"));
}
