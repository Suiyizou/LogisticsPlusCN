const failureKinds = Object.freeze({
  TRACKING_HUMAN_REQUIRED: "verification",
  TRACKING_NO_BUSINESS_DATA: "noData",
  TRACKING_QUERY_FAILED: "query",
  TRACKING_LOCAL_JOB_FAILED: "query",
  UPSTREAM_EMPTY: "unstructured",
  TRACKING_LOCAL_UNAVAILABLE: "unavailable",
  TRACKING_LOCAL_TIMEOUT: "timeout"
});

// This is presentation only. Keep the server's terminal state and diagnostic code.
export function shipmentTaskFailurePresentation(item, t) {
  if (item?.status !== "FAILED") return null;
  const code = item.errorCode || item.mainErrorCode;
  const kind = typeof code === "string" && Object.hasOwn(failureKinds, code) ? failureKinds[code] : null;
  return kind ? {
    label: t(`shipmentTask.failure.${kind}.label`),
    message: t(`shipmentTask.failure.${kind}.message`),
    tone: kind === "verification" || kind === "noData" ? "warning" : "danger"
  } : null;
}

export function shipmentTaskErrorMessage(item, t) {
  return shipmentTaskFailurePresentation(item, t)?.message ||
    [item?.error, item?.mainError, item?.errorCode, item?.mainErrorCode]
      .find((value) => typeof value === "string" && value.trim()) || "";
}
