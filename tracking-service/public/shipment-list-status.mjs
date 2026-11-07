// Transport completion and business freshness are independent list indicators.
function statusText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return [value.name, value.eventName, value.status, value.description, value.event]
    .find(text => typeof text === "string" && text.trim()) || "";
}

export function isEmptyReturnStatus(value) {
  // A carrier's scheduled event label is not evidence that the box was returned.
  if (value && typeof value === "object" && value.actual === false) return false;
  const text = statusText(value).normalize("NFKC").toUpperCase().trim();
  if (!text || /未|尚未|待|预计|计划|預計|計劃|NOT\b|PENDING\b|EXPECTED\b|ESTIMATED\b|SCHEDULED\b/.test(text)) return false;
  const normalized = text.replace(/[^A-Z0-9\p{Script=Han}]+/gu, " ").trim();
  if (/还空箱|空箱返还|空箱已退回|空箱已归还/.test(normalized)) return true;
  if (!/\b(?:EMPTY|MTY)\b/.test(normalized)) return false;
  return /^(?:EMPTY RETURN|MTY RETURN)$/.test(normalized)
    || /\bRETURN OF EMPTY\b|\bEMPTY DROP OFF\b|\bRETURNED\b|\bRETURN (?:COMPLETE|CONFIRMED)\b|\b(?:RECEIVED AT|RECEIVED IN|IN|AT) DEPOT\b/.test(normalized);
}

export function isShipmentEmptyReturned(entry) {
  const snapshot = entry?.snapshot || entry || {};
  const containers = Array.isArray(snapshot.containers) ? snapshot.containers : [];
  const sourceCount = snapshot.summary?.containerCount?.declared;
  const declaredCount = typeof sourceCount === "string" && /^\d+$/.test(sourceCount.trim())
    ? Number(sourceCount) : sourceCount;
  // Do not mark the whole shipment complete when returned details omit boxes
  // or contradict the carrier's explicitly declared container count.
  if (Number.isSafeInteger(declaredCount) && declaredCount >= 0 &&
      (!declaredCount || containers.length !== declaredCount)) return false;
  if (containers.length) {
    return containers.every(container => isEmptyReturnStatus(
      container?.latestEvent || container?.currentMilestone || container?.milestones?.[0]
    ));
  }
  const currentStatus = [snapshot.summary?.latestEvent, snapshot.tracking?.status, entry?.trackingStatus]
    .find(value => statusText(value).trim());
  return isEmptyReturnStatus(currentStatus);
}

function businessDate(value) {
  if (!value) return "";
  // Zone-free business LocalDateTime values belong to Asia/Shanghai.
  const source = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
    ? `${value}+08:00` : value;
  const date = source instanceof Date ? source : new Date(source);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export function shipmentListIndicators(entry, now = new Date()) {
  const updatedAt = Object.hasOwn(entry || {}, "businessUpdatedAt")
    ? entry.businessUpdatedAt
    : entry?.agentLastRefreshedAt || entry?.updatedAt || entry?.snapshot?.fetchedAt;
  const updatedDate = businessDate(updatedAt);
  return {
    emptyReturned: isShipmentEmptyReturned(entry),
    updatedToday: Boolean(updatedDate) && updatedDate === businessDate(now)
  };
}
