import { preferredTrackingReference } from "../shipments/shipmentPresentation.js";

/** Tracking links preserve a resolved workspace route instead of a fixed module mount. */
export function trackingWorkspaceLink({ returnTo, shipment }) {
  if (
    typeof returnTo !== "string" ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\") ||
    [...returnTo].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  )
    throw Error("Tracking return route must be a local resolved path");
  const parameters = new URLSearchParams({ returnTo });
  const reference = preferredTrackingReference(shipment);
  if (reference.number) {
    parameters.set("carrier", shipment?.carrier || "COSCO");
    parameters.set("type", reference.type);
    parameters.set("number", reference.number);
  }
  return `/workspace/tracking/${reference.number ? "query" : "overview"}?${parameters.toString()}`;
}
