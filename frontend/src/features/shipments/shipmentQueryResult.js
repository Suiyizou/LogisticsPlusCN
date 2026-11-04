export function queryResultFields(snapshot, t) {
  const summary = snapshot.summary || {};
  const source = snapshot.sourceDetails || {};
  return [
    ["status", "customers.trackingQueryStatus", summary.status || summary.transportStatus],
    [
      "origin",
      "customers.trackingQueryOrigin",
      summary.origin?.name || summary.portOfLoading || source.origin
    ],
    [
      "destination",
      "customers.trackingQueryDestination",
      summary.destination?.name || summary.portOfDischarge || source.destination
    ],
    ["vessel", "customers.trackingQueryVessel", summary.vesselVoyage || source.vessel],
    [
      "etd",
      "customers.trackingQueryEtd",
      snapshot.keyTimes?.estimatedDeparture?.reportedTime ||
        snapshot.keyTimes?.estimatedDeparture?.time ||
        snapshot.keyTimes?.estimatedDeparture?.value ||
        summary.estimatedDeparture
    ],
    [
      "eta",
      "customers.trackingQueryEta",
      snapshot.keyTimes?.estimatedArrival?.reportedTime ||
        snapshot.keyTimes?.estimatedArrival?.time ||
        snapshot.keyTimes?.estimatedArrival?.value ||
        summary.estimatedArrival
    ]
  ]
    .filter(([, , value]) => value !== null && value !== undefined && value !== "")
    .map(([key, label, value]) => ({
      key,
      label: t(label),
      value: typeof value === "object" ? JSON.stringify(value) : String(value)
    }));
}
export function queryResultGroups(snapshot, t) {
  const source = snapshot.sourceDetails || {};
  const groups = [
    ["containers", "customers.trackingQueryContainers", snapshot.containers || []],
    ["route", "customers.trackingQueryRoute", snapshot.routingLegs || []],
    ["entries", "customers.trackingQueryEntries", snapshot.events || []],
    [
      "fields",
      "customers.trackingQuerySourceFields",
      [
        ...(Array.isArray(source.fields) ? source.fields : []),
        ...Object.entries(source.extraFields || {}).map(([key, value]) => ({ key, value }))
      ]
    ]
  ];
  return groups
    .filter(([, , records]) => Array.isArray(records) && records.length)
    .map(([key, label, records]) => ({
      key,
      label: t(label),
      rows: records.slice(0, 200).map((record) =>
        Object.entries(record || {})
          .filter(
            ([field, value]) =>
              !/evidence|screenshot|text_path|token|cookie|secret/i.test(field) &&
              value !== "" &&
              value !== null &&
              value !== undefined
          )
          .map(([field, value]) => ({ key: field, value: queryResultValue(value) }))
      )
    }));
}
function queryResultValue(value) {
  const text =
    typeof value === "object"
      ? JSON.stringify(
          value,
          (key, entry) =>
            /evidence|screenshot|text_path|token|cookie|secret/i.test(key) ? undefined : entry,
          2
        )
      : String(value);
  // Keep diagnostics in the owning API; this read-only view never presents local evidence paths.
  return (text || "")
    .replace(/(?:[A-Za-z]:[\\/]|file:\/\/)[^\s"<>]*/g, "[local file]")
    .slice(0, 12000);
}
