// Labels only: original identifiers and timestamps remain on the records and title attributes.
export function compactShipmentDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function compactShipmentId(value) {
  const text = String(value ?? "");
  return /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(text)
    ? `${text.slice(0, 8)}…${text.slice(-6)}`
    : text || "—";
}
