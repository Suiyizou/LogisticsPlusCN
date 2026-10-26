// @ts-check
/** @template {import("../../types/workspace").WorkspaceUser} T @param {T | null} record */
export function normalizeDisplayName(record) {
  if (!record) return record;
  return { ...record, displayName: repairMojibake(record.displayName || "未命名") };
}

/** @param {string} value */
function repairMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂæçå€˜™œ]/.test(text)) return text;
  try {
    const bytes = [];
    for (const ch of text) {
      const code = CP1252_BYTES[ch] ?? ch.charCodeAt(0);
      if (code > 255) return text;
      bytes.push(code);
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    return hasMoreChinese(decoded, text) ? decoded : text;
  } catch {
    return text;
  }
}

/** @param {string} next @param {string} prev */
function hasMoreChinese(next, prev) {
  return countChinese(next) > countChinese(prev) && !next.includes("�");
}

/** @param {string} text */
function countChinese(text) {
  return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
}

/** @type {Record<string, number>} */
const CP1252_BYTES = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f
};
