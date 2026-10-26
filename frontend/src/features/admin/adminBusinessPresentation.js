// @ts-check
/** @param {unknown} value */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
/** Normalize both flat and item/shipment envelopes returned by the existing shipment API.
 * @param {unknown} payload @returns {import("../../types/adminBusinessLists").AdminTicket | null} */
export function normalizeAdminTicket(payload) {
  const outer = record(payload);
  if (!outer) return null;
  const envelope = ("item" in outer && record(outer.item)) || outer;
  const shipment = "shipment" in envelope && record(envelope.shipment);
  const normalized = { ...(shipment || envelope), ...(shipment ? envelope : {}) };
  if ("shipment" in normalized) delete normalized.shipment;
  return /** @type {import("../../types/adminBusinessLists").AdminTicket} */ (normalized);
}
/** @param {{ copy: import("../../types/adminBusinessLists").AdminBusinessCopy, formatDate: (value: string) => string }} ports */
export function createAdminBusinessPresentation({ copy, formatDate }) {
  /** @param {string | null | undefined} value */
  function date(value) {
    return value && Number.isFinite(new Date(value).getTime()) ? formatDate(value) : "-";
  }
  /** @param {import("../../types/adminBusinessLists").AdminPlatformCustomer} row */
  function platformRowKey(row) {
    return `${row.customerId}:${row.agentUserId ?? "unassigned"}`;
  }
  /** @param {string | undefined} type */
  function referenceType(type) {
    const key = String(type || "")
      .toUpperCase()
      .replaceAll("_", "");
    const types = copy.ticket().referenceTypes;
    return key === "BOOKING" || key === "BILLOFLADING" || key === "CONTAINER"
      ? types[key]
      : type || "-";
  }
  /** @param {import("../../types/adminBusinessLists").AdminTicket} row */
  function clientLabel(row) {
    const code = row.clientNo || row.clientNameCode || row.clientCode || "";
    const name = row.clientName || row.customerDisplayName || "";
    if (code && name && String(code).toLowerCase() !== String(name).toLowerCase())
      return `${code} · ${name}`;
    if (code || name) return code || name;
    const customer = Array.isArray(row.boundCustomers) ? row.boundCustomers[0] : null;
    return customer?.clientCode || customer?.displayName || customer?.username || "-";
  }
  /** @param {import("../../types/adminBusinessLists").AdminTicket} row */
  function ownerLabel(row) {
    const direct =
      row.responsibleAgentDisplayName ||
      row.businessDisplayName ||
      row.responsibleAgentUsername ||
      row.businessUsername;
    if (direct) return direct;
    const participants = Array.isArray(row.participants) ? row.participants : [];
    const owner = participants.find(
      (user) =>
        user?.accountRole === "BUSINESS" ||
        user?.bindingRole === "RESPONSIBLE" ||
        user?.role === "BUSINESS"
    );
    return owner?.displayName || owner?.username || "-";
  }
  /** @param {import("../../types/adminBusinessLists").AdminTicket} row */
  function boundUsersLabel(row) {
    const labels = (Array.isArray(row.boundUsers) ? row.boundUsers : [])
      .map((user) => user?.displayName || user?.username || user?.clientCode)
      .filter(Boolean);
    return labels.length
      ? labels.slice(0, 3).join(copy.separator()) +
          (labels.length > 3 ? ` +${labels.length - 3}` : "")
      : "-";
  }
  /** @param {import("../../types/adminBusinessLists").AdminHandover} row @param {"source" | "target"} direction */
  function handoverUserLabel(row, direction) {
    const user = direction === "source" ? row.sourceBusinessUser : row.targetBusinessUser;
    return (
      user?.displayName ||
      (direction === "source" ? row.sourceBusinessUserName : row.targetBusinessUserName) ||
      user?.username ||
      "-"
    );
  }
  /** @param {import("../../types/adminBusinessLists").AdminHandover} row @param {"source" | "target"} direction */
  function handoverUserHandle(row, direction) {
    const user = direction === "source" ? row.sourceBusinessUser : row.targetBusinessUser;
    return String(
      user?.username ??
        (direction === "source" ? row.sourceBusinessUserId : row.targetBusinessUserId) ??
        "-"
    );
  }
  /** @param {import("../../types/adminBusinessLists").AdminHandover} row */
  function handoverCustomerNames(row) {
    const names = (Array.isArray(row.customers) ? row.customers : [])
      .map((customer) => customer?.displayName || customer?.clientCode || customer?.id)
      .filter((value) => value != null && value !== "");
    if (!names.length)
      return copy.handover().customerUnit.replace("{count}", String(row.customerCount ?? 0));
    const visible = names.slice(0, 2).join(copy.separator());
    return names.length > 2
      ? `${visible} · ${copy.handover().customersMore.replace("{count}", String(names.length - 2))}`
      : visible;
  }
  /** @param {string | undefined} status */
  function handoverStatusText(status) {
    const normalized = String(status || "").toUpperCase();
    const labels = copy.handover();
    return normalized === "PENDING"
      ? labels.pending
      : normalized === "APPROVED"
        ? labels.approved
        : normalized === "REJECTED"
          ? labels.rejected
          : status || "-";
  }
  /** @param {string | undefined} status */
  function handoverStatusClass(status) {
    const normalized = String(status || "").toLowerCase();
    return ["pending", "approved", "rejected"].includes(normalized) ? normalized : "unknown";
  }
  /** @param {import("../../types/adminBusinessLists").AdminHandover} row */
  function handoverReviewer(row) {
    const reviewer = row.reviewedBy?.displayName || row.reviewedBy?.username;
    if (reviewer) return reviewer;
    const status = String(row.status || "").toUpperCase();
    return status === "APPROVED"
      ? copy.handover().notReviewed
      : status === "REJECTED"
        ? copy.handover().reviewerMissing
        : copy.handover().noCompletion;
  }
  return {
    date,
    platformRowKey,
    referenceType,
    clientLabel,
    ownerLabel,
    boundUsersLabel,
    handoverUserLabel,
    handoverUserHandle,
    handoverCustomerNames,
    handoverStatusText,
    handoverStatusClass,
    handoverReviewer
  };
}
