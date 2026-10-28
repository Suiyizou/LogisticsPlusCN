// Presentation metadata only; backend capabilities and permissions remain authoritative.
export const TRACKING_CARRIERS = Object.freeze([
  { code: "COSCO", name: "COSCO SHIPPING" },
  { code: "CMA", name: "CMA CGM" },
  { code: "MAERSK", name: "Maersk" },
  { code: "HAPAG_LLOYD", name: "Hapag-Lloyd" },
  { code: "MSC", name: "MSC" },
  { code: "OOCL", name: "OOCL" }
]);

export const OFFICIAL_TRACKING_URLS = Object.freeze({
  COSCO: "https://elines.coscoshipping.com/ebusiness/cargoTracking",
  CMA: "https://www.cma-cgm.com/ebusiness/tracking",
  MAERSK: "https://www.maersk.com/tracking/",
  HAPAG_LLOYD: "https://www.hapag-lloyd.com/solutions/tracking/",
  MSC: "https://www.msc.com/en/track-a-shipment",
  OOCL: "https://www.oocl.com/eng/"
});

export function supportsShipmentReference(carrier, type) {
  return TRACKING_CARRIERS.some((item) => item.code === carrier)
    && (type === "BOOKING" || (!["COSCO", "CMA"].includes(carrier) && type === "BILLOFLADING"));
}
