// Display identities only. This catalog never declares live tracking capabilities.
const carriers = [
  [
    "COSCO",
    "COSCO SHIPPING",
    "cosco-shipping-lines.png",
    ["COSCO SHIPPING", "COSCO SHIPPING LINES", "COSU"]
  ],
  ["OOCL", "OOCL", "oocl.svg", ["ORIENT OVERSEAS CONTAINER LINE", "OOLU"]],
  ["HMM", "HMM", "", ["HYUNDAI MERCHANT MARINE"]],
  ["SML", "SM Line", "", ["SM LINE", "SM LINE CORPORATION"]],
  ["MATSON", "Matson", "", []],
  ["MSC", "MSC", "", ["MEDITERRANEAN SHIPPING COMPANY"]],
  ["EVERGREEN", "Evergreen", "", ["EVERGREEN LINE", "EMC"]],
  ["HAPAG_LLOYD", "Hapag-Lloyd", "", ["HAPAG-LLOYD", "HAPAG LLOYD", "HLAG"]],
  ["KMTC", "KMTC", "", ["KOREA MARINE TRANSPORT"]],
  ["MAERSK", "Maersk", "", ["MAERSK LINE"]],
  ["YML", "Yang Ming", "", ["YANG MING", "YANG MING LINE"]],
  ["ZIM", "ZIM", "", []],
  ["CMA", "CMA CGM", "", ["CMA CGM", "CMA_CGM"]]
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
