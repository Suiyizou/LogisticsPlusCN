import type { CarrierCode } from "./contracts.js";

export interface CarrierDefinition {
  code: CarrierCode;
  name: string;
  trackingUrl: string | null;
  mode: "BROWSER_AGENT" | "EXISTING_SYSTEM";
  strongPrefixes: string[];
  officialHosts: string[];
  queryHint: string;
  removableReferencePrefixes?: string[];
}

export const CARRIERS: Record<CarrierCode, CarrierDefinition> = {
  MAERSK: {
    code: "MAERSK",
    name: "Maersk",
    trackingUrl: "https://www.maersk.com/tracking/",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["MAEU", "MSKU"],
    officialHosts: ["maersk.com", "maersk.com.cn"],
    queryHint: "Use the public shipment tracking input. For MAEU-prefixed B/L references, enter the 9-character suffix without MAEU; the Track control is inside a Shadow DOM component, which the browser snapshot can expose.",
    removableReferencePrefixes: ["MAEU"],
  },
  OOCL: {
    code: "OOCL",
    name: "OOCL",
    trackingUrl: "https://www.oocl.com/eng/",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["OOLU"],
    officialHosts: ["oocl.com"],
    queryHint: "Use the Cargo Tracking widget on the official OOCL homepage. The legacy CargoSmart tracking page has been discontinued. Select the reference type, refresh the snapshot, fill the visible tracking field and submit. Follow only official OOCL tracking links; stop at login or verification. Do not confuse site search with cargo tracking.",
  },
  CMA: {
    code: "CMA",
    name: "CMA CGM",
    trackingUrl: "https://www.cma-cgm.com/ebusiness/tracking",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["CMDU", "CMAU"],
    officialHosts: ["cma-cgm.com"],
    queryHint: "Use Shipment Tracking and explicitly select B/L for this routed reference. Do not reject a B/L merely because it lacks a CMDU/CMAU prefix.",
  },
  COSCO: {
    code: "COSCO",
    name: "COSCO SHIPPING Lines",
    trackingUrl: null,
    mode: "EXISTING_SYSTEM",
    strongPrefixes: ["COSU"],
    officialHosts: ["elines.coscoshipping.com", "coscoshipping.com"],
    queryHint: "Delegate to the existing COSCO integration; do not run the browser agent.",
  },
  HAPAG_LLOYD: {
    code: "HAPAG_LLOYD",
    name: "Hapag-Lloyd",
    trackingUrl: "https://www.hapag-lloyd.com/solutions/tracking/#/?language=en",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["HLCU"],
    officialHosts: ["hapag-lloyd.com", "hapag-lloyd.cn"],
    queryHint: "Use Track by booking/B/L for a long HLCU-prefixed reference; when the visible format hint requires it, enter the suffix without HLCU (for example BO2260433677).",
    removableReferencePrefixes: ["HLCU"],
  },
  MSC: {
    code: "MSC",
    name: "MSC",
    trackingUrl: "https://www.msc.com/en/track-a-shipment",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["MSCU", "MEDU"],
    officialHosts: ["msc.com", "mymsc.com"],
    queryHint: "Use the public Track a Shipment widget and inspect embedded frames if the main DOM has no input. For a MEDU-prefixed long reference, follow the visible format hint and try the suffix without MEDU as B/L/booking.",
    removableReferencePrefixes: ["MEDU"],
  },
  MATSON: {
    code: "MATSON",
    name: "Matson",
    trackingUrl: "https://www.matson.com/shipment-tracking.html",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["MATS"],
    officialHosts: ["matson.com", "cargo.matson.com"],
    queryHint: "Use the public Ocean Shipment Tracking form and select container, booking, or bill of lading to match the request.",
  },
  ONE: {
    code: "ONE",
    name: "Ocean Network Express (ONE)",
    trackingUrl: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["ONEY"],
    officialHosts: ["one-line.com"],
    queryHint: "MANDATORY ONE order: open the exact Cargo Tracking URL; snapshot; if Skip/Try it is present click Skip first; snapshot; if the cookie Close control is present click it; snapshot again; only then fill the 12-character suffix without ONEY and click Search. Never fill or click Search while either overlay remains. On the result table, Booking Ref is identity, Container No. is the container number, Latest Place is only container.currentLocation, Latest Event Status/Time supplies status text, and POD/Vessel Arrival supplies a displayed arrival value. Do not set shipment.origin from Latest Place and do not invent Mexico or another country. Default to bookingNumber + one exact visible status + container numbers; omit all other optional fields unless exactly evidenced. ONE result-table values read from browser_screenshot MUST use method VISION and the exact screenshot URL; never label screenshot-read table text as DOM. The identity evidence value is the visible 12-character suffix, not the full ONEY-prefixed query.",
    removableReferencePrefixes: ["ONEY"],
  },
  HMM: {
    code: "HMM",
    name: "HMM",
    trackingUrl: "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["HDMU"],
    officialHosts: ["hmm21.com"],
    queryHint: "Use Track & Trace as B/L. Its reference is split across length-limited fields; record an explicit invalid-format message as ERROR, not NOT_FOUND.",
  },
  EVERGREEN: {
    code: "EVERGREEN",
    name: "Evergreen Line",
    trackingUrl: "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["EGLV"],
    officialHosts: ["shipmentlink.com", "evergreen-line.com", "evergreen-marine.com"],
    queryHint: "Use ShipmentLink Cargo Tracking and select B/L. For an EGLV-prefixed B/L enter the 12-character suffix without EGLV, then wait for the servlet result area.",
    removableReferencePrefixes: ["EGLV"],
  },
  YANG_MING: {
    code: "YANG_MING",
    name: "Yang Ming",
    trackingUrl: "https://www.yangming.com/en/esolution/cargo_tracking",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["YMJA"],
    officialHosts: ["yangming.com"],
    queryHint: "Use the Cargo Tracking SPA field as B/L and click the search icon attached to that input, not the site's global search; snapshot again after React state renders.",
  },
  WAN_HAI: {
    code: "WAN_HAI",
    name: "Wan Hai Lines",
    trackingUrl: "https://www.wanhai.com/views/cargo_track_v2/tracking_query.xhtml",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["WHLC"],
    officialHosts: ["wanhai.com"],
    queryHint: "Use the public B/L tracking form and follow any visible instruction to enter the WHLC suffix. If needed, try only the official legacy /views/cargoTrack/CargoTrack.xhtml route. Stop with HUMAN_REQUIRED at Imperva or another verification step.",
    removableReferencePrefixes: ["WHLC"],
  },
  ZIM: {
    code: "ZIM",
    name: "ZIM",
    trackingUrl: "https://www.zim.com/tools/track-a-shipment",
    mode: "BROWSER_AGENT",
    strongPrefixes: ["ZIMU"],
    officialHosts: ["zim.com"],
    queryHint: "Use Track a Shipment as B/L/booking and follow the visible format hint; a ZIMU-prefixed long reference may require the suffix without ZIMU.",
    removableReferencePrefixes: ["ZIMU"],
  },
};

export const BROWSER_CARRIERS = Object.values(CARRIERS).filter(
  (carrier) => carrier.mode === "BROWSER_AGENT",
);

export const OFFICIAL_HOSTS = [...new Set(Object.values(CARRIERS).flatMap((carrier) => carrier.officialHosts))];
