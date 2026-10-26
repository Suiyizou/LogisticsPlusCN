// @ts-check
import { adminShipmentFileDeleted } from "./adminFileRules.js";

/** @param {import("../../types/adminFiles").AdminFilePresentationPorts} ports */
export function createAdminFilePresentation({ t, roleText, formatDate }) {
  /** @param {number | undefined} bytes */
  function formatFileSize(bytes) {
    const value = bytes ?? 0;
    if (!Number.isFinite(value) || value < 0) return "-";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  /** @param {string | null | undefined} value */
  function fileDate(value) {
    return value && Number.isFinite(new Date(value).getTime()) ? formatDate(value) : "-";
  }
  /** @param {string | number | null | undefined} value */
  const identifier = (value) => (value == null || value === "" ? "-" : String(value));
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  function shipmentFileKey(file) {
    return String(file.publicId ?? file.id ?? "");
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  function shipmentPublicId(file) {
    return identifier(file.shipmentPublicId ?? file.shipment?.publicId ?? file.shipmentId);
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  function shipmentFileReference(file) {
    const reference =
      file.shipmentReference ||
      file.reference ||
      file.referenceNo ||
      file.shipment?.primaryReference;
    if (reference && typeof reference === "object") {
      const type = reference.referenceType || reference.type || "";
      const number =
        reference.referenceNo || reference.normalizedReferenceNo || reference.number || "";
      return [type, number].filter(Boolean).join(" · ") || "-";
    }
    const type = file.referenceType || file.shipment?.referenceType || "";
    const number = reference || file.shipment?.referenceNo || "";
    return [type, number].filter(Boolean).join(" · ") || "-";
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  function shipmentFileUploader(file) {
    return (
      file.uploaderDisplayName ||
      file.uploader?.displayName ||
      file.ownerDisplayName ||
      file.uploadedBy ||
      "-"
    );
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  function shipmentFileUploaderDetail(file) {
    const role = file.uploaderRole || file.uploaderRoleSnapshot || file.uploader?.role;
    const id = file.uploaderUserId ?? file.uploader?.id ?? file.userId;
    return (
      [role ? roleText(role) : "", identifier(id) === "-" ? "" : `ID ${id}`]
        .filter(Boolean)
        .join(" · ") || "-"
    );
  }
  /** @param {string | undefined} visibility */
  function shipmentFileVisibilityText(visibility) {
    /** @type {Record<string,string>} */
    const keys = {
      SHIPPER: "visibilityShipper",
      CONSIGNEE: "visibilityConsignee",
      OVERSEA_AGENT: "visibilityOverseaAgent",
      INTERNAL: "visibilityInternal",
      PARTIES: "visibilityParties",
      PUBLIC: "visibilityPublic"
    };
    return t(`admin.files.${keys[String(visibility || "").toUpperCase()] || "visibilityShipper"}`);
  }
  /** @param {string | undefined} visibility */
  const shipmentFileVisibilityClass = (visibility) => String(visibility || "SHIPPER").toLowerCase();
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  function shipmentFileStatusText(file) {
    /** @type {Record<string,string>} */
    const keys = {
      READY: "statusReady",
      QUARANTINED: "statusQuarantined",
      PENDING: "statusPending",
      DELETED: "statusDeleted"
    };
    return t(
      `admin.files.${adminShipmentFileDeleted(file) ? "statusDeleted" : keys[String(file.status || "READY").toUpperCase()] || "statusReady"}`
    );
  }
  /** @param {import("../../types/adminFiles").AdminShipmentFile} file */
  const isShipmentFilePending = (file) =>
    !adminShipmentFileDeleted(file) &&
    ["QUARANTINED", "PENDING"].includes(String(file.status || "").toUpperCase());
  return {
    identifier,
    formatFileSize,
    fileDate,
    shipmentFileKey,
    shipmentPublicId,
    shipmentFileReference,
    shipmentFileUploader,
    shipmentFileUploaderDetail,
    shipmentFileVisibilityText,
    shipmentFileVisibilityClass,
    shipmentFileStatusText,
    isShipmentFilePending,
    isShipmentFileDeleted: adminShipmentFileDeleted
  };
}
