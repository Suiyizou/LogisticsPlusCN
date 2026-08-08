const PACKING_RESUME_FINGERPRINT_VERSION = 3;

export function packingResumeFingerprint(container = {}, request = {}) {
  const canonical = stableFingerprintValue({
    version: PACKING_RESUME_FINGERPRINT_VERSION,
    container,
    cargos: request.cargos || [],
    utilizationPercent: request.utilizationPercent,
    globalGapCm: request.globalGapCm,
    balanceSettings: request.balanceSettings,
    supportSettings: request.supportSettings,
    supportRatio: request.supportRatio,
    supportRatioPercent: request.supportRatioPercent,
    supportPercent: request.supportPercent,
    nonStackSupportRatio: request.nonStackSupportRatio,
    nonStackSupportRatioPercent: request.nonStackSupportRatioPercent,
    nonStackSupportPercent: request.nonStackSupportPercent
  });
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ code, 0x85ebca6b) >>> 0;
    hashB = ((hashB << 13) | (hashB >>> 19)) >>> 0;
  }
  return `packing-v${PACKING_RESUME_FINGERPRINT_VERSION}-${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
}

function stableFingerprintValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => entry === undefined || typeof entry === "function"
      ? "null"
      : stableFingerprintValue(entry)).join(",")}]`;
  }
  const valueType = typeof value;
  if (valueType === "number") return Number.isFinite(value) ? String(value) : "null";
  if (valueType === "string" || valueType === "boolean") return JSON.stringify(value);
  if (valueType !== "object") return "null";
  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableFingerprintValue(value[key])}`);
  return `{${entries.join(",")}}`;
}
