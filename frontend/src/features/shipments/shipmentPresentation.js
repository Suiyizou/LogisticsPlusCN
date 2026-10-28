import { isToday } from "../shared/businessDates.js";
import { supportsShipmentReference } from "../../services/trackingCarriers.js";

// Presentation rules consume explicit records; no access to component state or browser services.

export function hasRefreshIssue(shipment) {
  return ["FAILED", "PARTIAL"].includes(String(shipment?.lastRefreshResult || "").toUpperCase());
}

export function shipmentBusinessState(shipment, now = new Date()) {
  const provided = String(shipment?.businessState || "").toUpperCase();
  if (
    ["COMPLETED", "UPDATE_FAILED", "MANUAL_REQUIRED", "TODAY_UPDATED", "TODAY_PENDING"].includes(
      provided
    )
  ) {
    return provided;
  }
  const trackingStatus = String(shipment?.trackingStatus || "")
    .replaceAll("_", " ")
    .toUpperCase();
  if (trackingStatus.includes("EMPTY RETURNED")) return "COMPLETED";
  if (hasRefreshIssue(shipment)) return "UPDATE_FAILED";
  if (
    shipment?.hasValidTracking === false ||
    String(shipment?.sourceChannel || "").toUpperCase() === "IMPORTED_MANUAL" ||
    !shipment?.lastTrackedAt
  ) {
    return "MANUAL_REQUIRED";
  }
  return isToday(shipment.lastTrackedAt, now) ? "TODAY_UPDATED" : "TODAY_PENDING";
}

export function preferredTrackingReference(row) {
  const bookingNumber = String(row?.bookingNumber || "").trim();
  if (bookingNumber) return { type: "BOOKING", number: bookingNumber };
  const carrier = String(row?.carrier || "")
    .trim()
    .toUpperCase();
  const originalType = String(row?.referenceType || "BOOKING")
    .trim()
    .toUpperCase();
  const originalNumber = String(row?.referenceNo || "").trim();
  const numericCoscoReference = originalNumber.replace(/^COSU/i, "");
  if (
    carrier === "COSCO" &&
    originalType === "BILLOFLADING" &&
    /^[0-9]{8,12}$/.test(numericCoscoReference)
  ) {
    return { type: "BOOKING", number: numericCoscoReference };
  }
  return originalType === "BOOKING" || supportsShipmentReference(carrier, originalType)
    ? { type: originalType, number: originalNumber }
    : { type: "BOOKING", number: "" };
}

export function needsManualSupplement(shipment) {
  return (
    shipment?.manualSupplementRequired === true || !String(shipment?.trackingStatus || "").trim()
  );
}

export function shipmentClientLabel(shipment) {
  const direct = [shipment?.clientNo || shipment?.clientNameCode, shipment?.clientName]
    .filter(Boolean)
    .map(String)
    .filter((value, index, values) => values.indexOf(value) === index);
  if (direct.length) return direct.join(" / ");
  const bound = Array.isArray(shipment?.boundCustomers) ? shipment.boundCustomers : [];
  const labels = bound
    .map((customer) => {
      if (typeof customer === "string") return customer;
      return [
        customer?.clientCode || customer?.clientNo,
        customer?.displayName || customer?.clientName || customer?.username
      ]
        .filter(Boolean)
        .map(String)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(" / ");
    })
    .filter(Boolean);
  return labels.length ? labels.join(" / ") : "—";
}

/**
 * @param {import("../../types/workspacePresentation").PresentationShipment | null | undefined} shipment
 * @param {Partial<Pick<import("../../types/workspacePresentation").PresentationDirectory, "customers" | "shipmentCustomerMap">>} [directory]
 */
export function shipmentBoundUsers(shipment, { customers = [], shipmentCustomerMap = {} } = {}) {
  const direct = Array.isArray(shipment?.boundUsers)
    ? shipment.boundUsers
    : Array.isArray(shipment?.participants)
      ? shipment.participants
      : Array.isArray(shipment?.boundCustomers)
        ? shipment.boundCustomers
        : [];
  const fallbackIds = shipment?.shipmentId ? shipmentCustomerMap[shipment.shipmentId] || [] : [];
  const source = direct.length
    ? direct
    : fallbackIds.map((id) => customers.find((item) => item.id === id) || { id });
  const seen = new Set();
  return source
    .map((user, index) => {
      const value = typeof user === "string" ? { id: user, name: user } : user || {};
      const name =
        value.displayName ||
        value.name ||
        value.username ||
        value.clientName ||
        value.id ||
        `#${index + 1}`;
      const role = value.partyRole || value.relationshipRole || value.role || "";
      return { ...value, name, role };
    })
    .filter((user) => {
      const key = String(user.id || `${user.name}:${user.role}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * @param {import("../../types/workspacePresentation").PresentationShipment | null | undefined} shipment
 * @param {Partial<Pick<import("../../types/workspacePresentation").PresentationDirectory, "customers" | "shipmentCustomerMap">>} [directory]
 */
export function primaryBoundCustomerName(shipment, directory) {
  const users = shipmentBoundUsers(shipment, directory);
  const preferred =
    users.find((user) => String(user.role || "").toUpperCase() === "SHIPPER") ||
    users.find((user) =>
      ["SHIPPER", "CONSIGNEE"].includes(String(user.role || "").toUpperCase())
    ) ||
    users.find((user) => String(user.role || "").toUpperCase() !== "OVERSEA_AGENT");
  return (
    preferred?.displayName ||
    preferred?.clientName ||
    preferred?.name ||
    preferred?.username ||
    preferred?.clientCode ||
    ""
  );
}
