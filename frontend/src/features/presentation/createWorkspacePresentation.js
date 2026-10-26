// @ts-check
import {
  shipmentBusinessState,
  shipmentBoundUsers as resolveShipmentBoundUsers,
  primaryBoundCustomerName as resolvePrimaryBoundCustomerName
} from "../shipments/shipmentPresentation.js";

/** @type {Record<string, string>} */
const businessStateKeys = {
  COMPLETED: "customers.businessCompleted",
  UPDATE_FAILED: "customers.businessUpdateFailed",
  MANUAL_REQUIRED: "customers.manualEntryRequired",
  TODAY_UPDATED: "customers.todayUpdatedBusiness",
  TODAY_PENDING: "customers.todayPendingUpdate"
};
/** @type {Record<string, import("../../types/workspacePresentation").WorkspaceTagType>} */
const businessStateTags = {
  COMPLETED: "success",
  UPDATE_FAILED: "danger",
  MANUAL_REQUIRED: "warning",
  TODAY_UPDATED: "success",
  TODAY_PENDING: "info"
};
/** @type {Record<string, string>} */
const partyRoleKeys = {
  AGENT: "customers.roleAgent",
  OVERSEA_AGENT: "customers.roleOverseaAgent",
  SHIPPER: "customers.roleShipper",
  CONSIGNEE: "customers.roleConsignee"
};
/** @type {Record<string, string>} */
const boundRoleKeys = {
  ...partyRoleKeys,
  ADMIN: "portal.roleAdmin",
  BUSINESS: "portal.roleBusiness",
  OVERSEA_AGENT: "portal.roleOverseaAgent",
  EMPLOYEE: "portal.roleEmployee"
};

// Readers stay lazy: the host can connect workflows created later in the same scope.
// Each call reads current refs, so directory reloads and locale changes remain observable.
/**
 * @param {import("../../types/workspacePresentation").WorkspacePresentationInputs} inputs
 * @returns {import("../../types/workspacePresentation").WorkspacePresentation}
 */
export function createWorkspacePresentation({ t, getLocale, readDirectory, getBoundCustomerIds }) {
  function directory() {
    return readDirectory();
  }

  /** @param {import("../../types/workspacePresentation").RecordId} customerId */
  function findCustomer(customerId) {
    return directory().customers.find((customer) => String(customer.id) === String(customerId));
  }

  /** @param {import("../../types/workspacePresentation").DisplayDate} value */
  function formatDateTime(value) {
    if (!value) return "—";
    try {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      /** @param {number} number */
      const pad = (number) => String(number).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } catch {
      return String(value);
    }
  }

  /** @param {import("../../types/workspacePresentation").DisplayDate} value */
  function formatDate(value) {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(getLocale() === "en-US" ? "en-US" : "zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  /** @param {import("../../types/workspacePresentation").PresentationCustomer | null | undefined} customer */
  function customerFilterOptionLabel(customer) {
    const name =
      customer?.displayName || customer?.username || customer?.id || t("customers.missingValue");
    const code = customer?.clientCode;
    return code && code !== name ? `${name} · ${code}` : String(name);
  }

  /** @param {import("../../types/workspacePresentation").RecordId | null | undefined} value */
  function selectedCustomerOptionLabel(value) {
    const customer = directory().assignableCustomers.find(
      (item) => String(item.id) === String(value)
    );
    return customer ? customerFilterOptionLabel(customer) : "";
  }

  /** @param {string | null | undefined} role */
  function partyRoleLabel(role) {
    const normalized = String(role || "")
      .trim()
      .toUpperCase();
    return partyRoleKeys[normalized]
      ? t(partyRoleKeys[normalized])
      : normalized
        ? normalized.replaceAll("_", " ")
        : t("customers.missingValue");
  }

  /** @param {import("../../types/workspacePresentation").BoundUserLabelInput | null | undefined} user */
  function boundUserLabel(user) {
    const role = String(user?.role || "")
      .trim()
      .toUpperCase();
    const name = String(user?.name || t("customers.missingValue"));
    const roleName = boundRoleKeys[role]
      ? t(boundRoleKeys[role])
      : role
        ? role.replaceAll("_", " ")
        : "";
    return roleName ? `${name} (${roleName})` : name;
  }

  /** @param {import("../../types/workspacePresentation").PresentationShipment | null | undefined} shipment */
  function shipmentBusinessStateLabel(shipment) {
    return t(businessStateKeys[shipmentBusinessState(shipment)]);
  }

  /** @param {import("../../types/workspacePresentation").PresentationShipment | null | undefined} shipment */
  function shipmentBusinessStateTagType(shipment) {
    return businessStateTags[shipmentBusinessState(shipment)] || "info";
  }

  /** @param {import("../../types/workspacePresentation").PresentationShipment | null | undefined} shipment */
  function refreshOutcomeTooltip(shipment) {
    return [
      shipment?.lastRefreshErrorCode,
      shipment?.lastRefreshError,
      shipment?.lastRefreshAttempts
        ? t("customers.mainAttempts", { count: shipment.lastRefreshAttempts })
        : "",
      shipment?.lastRefreshProxyAttempts
        ? t("customers.proxyAttempts", { count: shipment.lastRefreshProxyAttempts })
        : "",
      shipment?.lastRefreshAt ? formatDateTime(shipment.lastRefreshAt) : ""
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return {
    formatDateTime,
    formatDate,
    customerFilterOptionLabel,
    selectedCustomerOptionLabel,
    partyRoleLabel,
    boundUserLabel,
    shipmentBusinessStateLabel,
    shipmentBusinessStateTagType,
    refreshOutcomeTooltip,
    getCustomerName: (customerId) => {
      const customer = findCustomer(customerId);
      return String(customer?.displayName || customer?.username || customerId);
    },
    getCustomerUsername: (customerId) => String(findCustomer(customerId)?.username || customerId),
    isCustomerBoundToSelectedShipment: (customerId) =>
      getBoundCustomerIds().some((id) => String(id) === String(customerId)),
    primaryBoundCustomerName: (shipment) =>
      String(resolvePrimaryBoundCustomerName(shipment, directory())),
    shipmentBoundUsers: (shipment) =>
      resolveShipmentBoundUsers(shipment, directory()).map(
        /** @param {import("../../types/workspacePresentation").BoundUserLabelInput} user */
        (user) => ({ ...user, name: String(user.name), role: String(user.role || "") })
      ),
    boundRoleSummary: (shipment) => {
      const roles = Array.isArray(shipment?.boundRoles) ? shipment.boundRoles : [];
      return roles.length ? roles.map(partyRoleLabel).join(" / ") : t("customers.noPartiesBound");
    },
    customerInitial: (customer) =>
      String(customer?.displayName || customer?.username || "C")
        .slice(0, 1)
        .toUpperCase(),
    statusLabel: (status) =>
      t(status === "ACTIVE" ? "customers.statusActive" : "customers.statusDisabled"),
    referenceTypeLabel: (type) =>
      t(
        {
          BOOKING: "customers.referenceBooking",
          BILLOFLADING: "customers.referenceBill",
          CONTAINER: "customers.referenceContainer"
        }[type || ""] || "customers.referenceUnknown"
      )
  };
}
