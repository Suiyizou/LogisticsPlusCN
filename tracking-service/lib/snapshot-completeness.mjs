/** Data coverage describes what the carrier supplied, not whether more responses will arrive. */
export function snapshotHasCompleteContainerDetails(snapshot, trackingRequest) {
  if (trackingRequest.type === "CONTAINER") {
    return Array.isArray(snapshot?.containers) && snapshot.containers.length > 0;
  }

  const expectedContainerCount = (snapshot?.summary?.containers ?? []).reduce(
    (total, container) => total + Number(container?.quantity ?? container?.count ?? 0),
    0
  );
  if (expectedContainerCount <= 0) return true;

  const actualContainerCount = new Set(
    (snapshot?.containers ?? [])
      .map((container) =>
        String(container?.number ?? "")
          .trim()
          .toUpperCase()
      )
      .filter(Boolean)
  ).size;
  return actualContainerCount >= expectedContainerCount;
}

/** Single responses are reusable within their TTL even when the source has data gaps. */
export function snapshotHasReusableResponse(snapshot, trackingRequest) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.deliveryMode === "SINGLE_RESPONSE") return true;
  return snapshotHasCompleteContainerDetails(snapshot, trackingRequest);
}
