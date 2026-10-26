export function normalizeBusinessShipment(payload) {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload.item && typeof payload.item === "object" ? payload.item : payload;
  const shipment =
    envelope.shipment && typeof envelope.shipment === "object" ? envelope.shipment : envelope;
  const rawSnapshot =
    envelope.snapshot ?? shipment.snapshot ?? envelope.snapshotJson ?? shipment.snapshotJson;
  let snapshot = rawSnapshot;
  if (typeof rawSnapshot === "string") {
    try {
      snapshot = JSON.parse(rawSnapshot);
    } catch (_error) {
      snapshot = null;
    }
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) snapshot = null;

  const normalized = {
    ...shipment,
    ...(envelope.shipment ? envelope : {}),
    snapshot,
    dataAvailable: envelope.dataAvailable ?? shipment.dataAvailable ?? Boolean(snapshot)
  };
  delete normalized.shipment;

  if (!snapshot) return normalized;
  const summary = snapshot.summary || {};
  const keyTimes = snapshot.keyTimes || {};
  const references = snapshot.references || {};
  const business = references.business || {};
  const firstContainer = Array.isArray(snapshot.containers) ? snapshot.containers[0] : null;
  const firstLeg = Array.isArray(snapshot.routingLegs) ? snapshot.routingLegs[0] : null;
  const vesselVoyage = [firstLeg?.vessel, firstLeg?.voyage].filter(Boolean).join(" / ");
  const details = {
    bookingNumber:
      (Array.isArray(references.bookingNumbers) ? references.bookingNumbers[0] : null) ||
      (Array.isArray(summary.bookingNumbers) ? summary.bookingNumbers[0] : null) ||
      references.booking,
    forwarderJobNumber: business.forwarderJobNumber,
    clientPoNumber: business.clientPoNumber,
    clientNameCode: business.clientNameCode,
    portOfLoading: summary.origin?.name,
    portOfDischarge: summary.destination?.name,
    vesselVoyage: summary.vesselVoyage || vesselVoyage,
    volume: summary.volume,
    estimatedDeparture: keyTimes.estimatedDeparture?.time,
    estimatedArrival: keyTimes.estimatedFinalArrival?.time || keyTimes.estimatedArrival?.time,
    actualDeparture: keyTimes.actualDeparture?.time,
    actualArrival: keyTimes.actualArrival?.time,
    actualDelivery: keyTimes.actualDelivery?.time,
    currentLocation: summary.latestEvent?.location,
    containerNumber: firstContainer?.number,
    containerType: firstContainer?.type
  };
  for (const [key, value] of Object.entries(details)) {
    if (
      (normalized[key] === null || normalized[key] === undefined || normalized[key] === "") &&
      value
    ) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function deduplicateBusinessShipments(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item) continue;
    const shipmentId = String(item.shipmentId || "").trim();
    const fallbackKey = [item.carrier, item.referenceType, item.referenceNo]
      .map((value) =>
        String(value || "")
          .trim()
          .toUpperCase()
      )
      .join("|");
    const key = shipmentId ? `shipment:${shipmentId}` : `reference:${fallbackKey}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}
