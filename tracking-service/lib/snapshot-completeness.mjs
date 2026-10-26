/** Shared snapshot completeness rule for every carrier, independent from transports. */
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
