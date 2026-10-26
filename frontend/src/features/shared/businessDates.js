export function localDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function isToday(value, now = new Date()) {
  const key = localDateKey(value);
  return Boolean(key) && key === localDateKey(now);
}

export function isCreatedToday(item, now = new Date()) {
  return isToday(item?.createdAt, now);
}
