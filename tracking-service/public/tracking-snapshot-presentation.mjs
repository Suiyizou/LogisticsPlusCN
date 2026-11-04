export function reportedRouteTime(snapshot, direction) {
  const key = direction === "departure" ? "origin_departure" : "destination_arrival";
  const side = direction === "departure" ? "origin" : "destination";
  const details = snapshot.sourceDetails;
  if (snapshot.noBusinessData || details?.noBusinessData) return null;
  const field = details?.fields?.find(
    (field) => field.source === "shipment.fields_extra" && field.key === key
  );
  const value = field?.value ?? details?.extraFields?.[key];
  const time = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(time)) return null;

  // The route display can differ from recorded events and does not classify the time as actual or estimated.
  return { time, location: snapshot.summary?.[side]?.name };
}

export function snapshotContainerCounts(snapshot) {
  const source = snapshot.summary?.containerCount?.declared;
  const count = typeof source === "string" && /^\d+$/.test(source.trim()) ? Number(source) : source;
  return {
    declared: Number.isSafeInteger(count) && count >= 0 ? count : null,
    returned: Array.isArray(snapshot.containers) ? snapshot.containers.length : 0
  };
}

export function carrierReferenceForDisplay(snapshot, value) {
  const reference = typeof value === "string" ? value.trim() : "";
  if (snapshot.sourceDetails?.businessVerified !== false) return reference;

  // Unverified carrier pages can return button labels or shipment statuses in identifier fields.
  return /[0-9]/.test(reference) && /^[a-z0-9][a-z0-9._/-]*$/i.test(reference) ? reference : "";
}
