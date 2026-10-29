/** Presentation follows evidence on each node, never its position in the route. */
export function milestoneTiming(node = {}) {
  const actual = typeof node.actualTime === "string" ? node.actualTime.trim() : "";
  const estimated = typeof node.estimatedTime === "string" ? node.estimatedTime.trim() : "";
  return {
    state: actual ? "actual" : estimated ? "estimated" : "unknown",
    actual,
    estimated,
    // A carrier highlight alone does not establish that an event happened.
    reportedCurrent: node.active === true
  };
}

export function uniqueMilestones(route = []) {
  const seen = new Set();
  return route.filter((node) => {
    if (!node) return false;
    const identity = [
      node.locationType,
      node.city,
      node.countryCode,
      node.event,
      node.actualTime,
      node.estimatedTime,
      node.timezone
    ]
      .map((value) =>
        String(value ?? "")
          .trim()
          .toUpperCase()
      )
      .join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function currentMilestoneIndex(route = []) {
  // Some adapters mark the destination active even while it is only planned.
  // Highlight the last node with actual evidence; an adapter flag is not evidence.
  return route.reduce((latest, node, index) => (milestoneTiming(node).actual ? index : latest), -1);
}

export function containerMilestoneTiming(milestone = {}) {
  return milestoneTiming({
    actualTime: milestone.actual === false ? "" : milestone.occurredAt,
    estimatedTime: milestone.estimatedAt
  });
}
