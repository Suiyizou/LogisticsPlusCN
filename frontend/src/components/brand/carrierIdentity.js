// Display identities only. This catalog never declares live tracking capabilities.
const carriers = [
  [
    "COSCO",
    "COSCO SHIPPING",
    "cosco-shipping-lines.png",
    ["COSCO SHIPPING", "COSCO SHIPPING LINES", "COSU"]
  ],
  ["OOCL", "OOCL", "oocl.svg", ["ORIENT OVERSEAS CONTAINER LINE", "OOLU"]],
  ["HMM", "HMM", "hmm.png", ["HYUNDAI MERCHANT MARINE"]],
  ["SML", "SM Line", "sml.png", ["SM LINE", "SM LINE CORPORATION"]],
  ["MATSON", "Matson", "matson.png", []],
  ["MSC", "MSC", "msc.webp", ["MEDITERRANEAN SHIPPING COMPANY"]],
  ["EVERGREEN", "Evergreen", "evergreen.svg", ["EVERGREEN LINE", "EMC"]],
  ["HAPAG_LLOYD", "Hapag-Lloyd", "hapag-lloyd.svg", ["HAPAG-LLOYD", "HAPAG LLOYD", "HLAG"]],
  ["KMTC", "KMTC", "kmtc.png", ["KOREA MARINE TRANSPORT"]],
  ["MAERSK", "Maersk", "maersk.jpg", ["MAERSK LINE"]],
  ["YML", "Yang Ming", "yml.png", ["YANG MING", "YANG MING LINE"]],
  ["ZIM", "ZIM", "zim.webp", []],
  ["ONE", "Ocean Network Express", "one.svg", ["OCEAN NETWORK EXPRESS"]],
  ["WAN_HAI", "Wan Hai", "", ["WAN HAI", "WANHAI", "WHL"]],
  ["HEDE", "HEDE", "", ["HEDE SHIPPING"]],
  ["CMA", "CMA CGM", "cma.svg", ["CMA CGM", "CMA_CGM"]]
];
const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
const identities = new Map();
for (const [code, name, asset, aliases] of carriers) {
  const identity = Object.freeze({ code, name, logo: asset ? `/carriers/${asset}` : "" });
  for (const alias of [code, name, ...aliases]) identities.set(normalize(alias), identity);
}
export function carrierIdentity(value) {
  const name = String(value ?? "").trim();
  return (
    identities.get(normalize(name)) || { code: name.toUpperCase(), name: name || "—", logo: "" }
  );
}
