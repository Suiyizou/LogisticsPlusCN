/** Official tracking entry points. A website login is not an API subscription. */
export const MULTI_CARRIER_CATALOG = Object.freeze({
  MAERSK: {
    code: "MAERSK", name: "Maersk",
    trackingUrl: "https://www.maersk.com/tracking/",
    officialHosts: ["maersk.com", "maersk.com.cn"], removablePrefixes: ["MAEU"]
  },
  HAPAG_LLOYD: {
    code: "HAPAG_LLOYD", name: "Hapag-Lloyd",
    trackingUrl: "https://www.hapag-lloyd.com/solutions/tracking/#/?language=en",
    officialHosts: ["hapag-lloyd.com", "hapag-lloyd.cn", "hlag.com"], removablePrefixes: ["HLCU"]
  },
  MSC: {
    code: "MSC", name: "MSC",
    trackingUrl: "https://www.msc.com/en/track-a-shipment",
    officialHosts: ["msc.com", "mymsc.com"], removablePrefixes: ["MEDU"]
  },
  OOCL: {
    code: "OOCL", name: "OOCL",
    trackingUrl: "https://www.oocl.com/eng/",
    officialHosts: ["oocl.com"], removablePrefixes: ["OOLU"]
  }
});

export const SUPPORTED_CARRIER_CODES = Object.freeze([
  "COSCO", "CMA", ...Object.keys(MULTI_CARRIER_CATALOG)
]);

export function officialCarrierUrl(value, carrier) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    return MULTI_CARRIER_CATALOG[carrier]?.officialHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    ) ?? false;
  } catch { return false; }
}

export function trackingFailure(status, code, message, details = {}) {
  return Object.assign(new Error(message), {
    httpStatus: status, code, details: { ...details, code }
  });
}

export function compactReference(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function sameCarrierReference(left, right, carrier, type) {
  const canonical = (value) => {
    const compact = compactReference(value);
    if (type === "CONTAINER") return compact;
    const prefix = MULTI_CARRIER_CATALOG[carrier]?.removablePrefixes.find(
      (candidate) => compact.startsWith(candidate) && compact.length > candidate.length + 3
    );
    return prefix ? compact.slice(prefix.length) : compact;
  };
  return Boolean(left && right) && canonical(left) === canonical(right);
}
