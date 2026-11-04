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
    || (type === "CONTAINER" && !localQueue);
}
