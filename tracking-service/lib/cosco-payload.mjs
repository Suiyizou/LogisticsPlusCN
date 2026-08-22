export const COSCO_XOR_KEY = "b3Ay6#9f1a@%&2^6";

export function decodeCoscoPayload(rawText) {
  let payload;

  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = rawText;
  }

  // COSCO occasionally returns a normal JSON error instead of the encoded body.
  if (payload && typeof payload === "object") {
    return payload;
  }

  if (typeof payload !== "string" || payload.length === 0) {
    throw new Error("COSCO 返回了无法识别的响应");
  }

  const encrypted = Buffer.from(payload, "base64");
  const key = Buffer.from(COSCO_XOR_KEY, "utf8");
  const decoded = Buffer.allocUnsafe(encrypted.length);

  for (let index = 0; index < encrypted.length; index += 1) {
    decoded[index] = encrypted[index] ^ key[index % key.length];
  }

  return JSON.parse(decoded.toString("utf8"));
}
