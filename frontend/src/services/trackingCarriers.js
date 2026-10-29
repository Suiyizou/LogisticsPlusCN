// Backend identities; deployment mode selects the executable query capabilities.
export const ALL_TRACKING_CARRIERS = Object.freeze([
  { code: "COSCO", name: "COSCO SHIPPING" },
  { code: "CMA", name: "CMA CGM" },
  { code: "MAERSK", name: "Maersk" },
  { code: "HAPAG_LLOYD", name: "Hapag-Lloyd" },
  { code: "MSC", name: "MSC" },
  { code: "OOCL", name: "OOCL" },
  { code: "ONE", name: "ONE" },
  { code: "HMM", name: "HMM" },
  { code: "EVERGREEN", name: "Evergreen" },
  { code: "MATSON", name: "Matson" },
  { code: "YML", name: "Yang Ming" },
  { code: "WAN_HAI", name: "Wan Hai" },
  { code: "SML", name: "SM Line" },
  { code: "KMTC", name: "KMTC" },
  { code: "ZIM", name: "ZIM" },
  { code: "HEDE", name: "HEDE" }
]);
export function normalizeTrackingAdapterMode(value) {
  return String(value || "")
    .trim()
    .toUpperCase() === "LOCAL_QUEUE"
    ? "LOCAL_QUEUE"
    : "LEGACY";
}
// Old preview deployments remain LEGACY until the paired backend is explicitly migrated.
export const TRACKING_ADAPTER_MODE = normalizeTrackingAdapterMode(
  import.meta.env?.VITE_TRACKING_ADAPTER_MODE
);
export function trackingCarriersForMode(mode = TRACKING_ADAPTER_MODE) {
  return normalizeTrackingAdapterMode(mode) === "LOCAL_QUEUE"
    ? // HEDE is a recognized backend identity, but the desktop runner has no HEDE adapter.
      ALL_TRACKING_CARRIERS.filter((item) => item.code !== "HEDE")
    : ALL_TRACKING_CARRIERS.slice(0, 6);
}
export const TRACKING_CARRIERS = Object.freeze(trackingCarriersForMode());
export const OFFICIAL_TRACKING_URLS = Object.freeze({
  COSCO: "https://elines.coscoshipping.com/ebusiness/cargoTracking",
  CMA: "https://www.cma-cgm.com/ebusiness/tracking",
  MAERSK: "https://www.maersk.com/tracking/",
  HAPAG_LLOYD: "https://www.hapag-lloyd.com/solutions/tracking/",
  MSC: "https://www.msc.com/en/track-a-shipment",
  OOCL: "https://www.oocl.com/eng/"
});
export function supportsShipmentReference(carrier, type, mode = TRACKING_ADAPTER_MODE) {
  const local = normalizeTrackingAdapterMode(mode) === "LOCAL_QUEUE";
  return (
    trackingCarriersForMode(mode).some((item) => item.code === carrier) &&
    (type === "BOOKING" ||
      (carrier !== "CMA" && (local || carrier !== "COSCO") && type === "BILLOFLADING"))
  );
}
