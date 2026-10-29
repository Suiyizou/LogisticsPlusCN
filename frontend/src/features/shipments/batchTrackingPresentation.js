export function batchSubtaskLabel(type, t) {
  return String(type || "").toUpperCase() === "BOOKING_REFERENCE"
    ? t("customers.bookingReferenceStage")
    : t("customers.transportDetailsStage");
}

export function batchStageStatusLabel(status, t) {
  const key = String(status || "PENDING").toUpperCase();
  if (key === "RUNNING" || key === "RETRY_WAIT") return t("customers.stageRunning");
  if (key === "SUCCEEDED") return t("customers.stageSucceeded");
  if (key === "FAILED") return t("customers.stageFailed");
  return t("customers.stagePending");
}

export function batchStageTagType(status) {
  const key = String(status || "PENDING").toUpperCase();
  if (key === "SUCCEEDED") return "success";
  if (key === "FAILED") return "danger";
  if (key === "RUNNING" || key === "RETRY_WAIT") return "primary";
  return "info";
}

export function batchMainStageStatus(result) {
  const explicit = String(result?.mainStatus || "").toUpperCase();
  if (["PENDING", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "FAILED"].includes(explicit)) {
    return explicit;
  }
  const status = String(result?.status || "PENDING").toUpperCase();
  const subtaskStatuses = (result?.subtasks || []).map((subtask) =>
    String(subtask.status || "PENDING").toUpperCase()
  );
  if (status === "FAILED") return "FAILED";
  if (
    ["SUCCEEDED", "PARTIAL"].includes(status) ||
    subtaskStatuses.some((value) => value !== "PENDING")
  ) {
    return "SUCCEEDED";
  }
  if (Number(result?.attempts || 0) > 0 || ["RUNNING", "RETRY_WAIT"].includes(status)) {
    return "RUNNING";
  }
  return "PENDING";
}

export function batchTrackElapsedText(result, now, t) {
  const startedAt = Date.parse(result?.startedAt || "");
  const finishedAt = Date.parse(result?.finishedAt || "");
  let elapsedMs = Number(result?.elapsedMs || 0);
  if (!Number.isFinite(finishedAt)) {
    const observedAt = Number(result?.elapsedObservedAt || now);
    elapsedMs += Math.max(0, now - observedAt);
  }
  if (elapsedMs <= 0 && Number.isFinite(startedAt)) {
    const end = Number.isFinite(finishedAt) ? finishedAt : now;
    elapsedMs = Math.max(0, end - startedAt);
  }
  if (Number.isFinite(startedAt) && elapsedMs < 1000) {
    return t("customers.elapsedUnderSecond");
  }
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${padded(hours)}:${padded(minutes)}:${padded(seconds)}`
    : `${padded(minutes)}:${padded(seconds)}`;
}

export function batchTrackItemMessage(item, taskStatus = "", stopReason = "", t, formatDateTime) {
  const status = String(item.status || "PENDING").toUpperCase();
  const interrupted = ["PENDING", "RUNNING", "RETRY_WAIT"].includes(status);
  if (taskStatus === "STOPPED" && interrupted) return t("customers.trackStopped");
  if (
    String(stopReason || "").toUpperCase() === "CIRCUIT_BREAKER" &&
    taskStatus === "PAUSED" &&
    interrupted
  )
    return t("customers.batchTrackCircuitSkipped");
  if (item.mainCacheStale) {
    return t("customers.trackStaleFallback", {
      time: item.mainFetchedAt ? formatDateTime(item.mainFetchedAt) : "-"
    });
  }
  if (status === "RETRY_WAIT") return t("customers.batchTrackRetryItem");
  if (item.error) return item.error;
  if (status === "SUCCEEDED" && item.source === "AUTO_PROXY") {
    return t("customers.trackSucceededViaProxy");
  }
  if (status === "SUCCEEDED" && item.mainDataChanged === false) {
    return t("customers.trackLiveNoChange");
  }
  if (status === "SUCCEEDED") return t("customers.trackSucceeded");
  if (status === "PARTIAL") {
    const details = [
      ...new Set(
        (item.subtasks || [])
          .filter((subtask) => String(subtask.status || "").toUpperCase() === "FAILED")
          .map((subtask) => subtask.error)
          .filter(Boolean)
      )
    ];
    if (item.supplementalRetryPending) return t("customers.trackPartialRetryScheduled");
    return details.join("; ") || t("customers.trackPartial");
  }
  if (status === "MANUAL") return t("customers.trackManualPlaceholder");
  if (status === "FAILED") return t("customers.trackFailed");
  if (status === "RUNNING") return t("customers.trackRunning");
  return t("customers.trackPending");
}

export function batchDiagnosticText(result) {
  const details =
    result?.errorDetails && typeof result.errorDetails === "object" ? result.errorDetails : {};
  const failedSubtasks = (result?.subtasks || [])
    .filter((subtask) => String(subtask?.status || "").toUpperCase() === "FAILED")
    .flatMap((subtask) => {
      const prefix = `[${subtask.type || "SUPPLEMENTAL"}]`;
      return [
        subtask.errorCode ? `${prefix} code: ${subtask.errorCode}` : "",
        subtask.error ? `${prefix} error: ${subtask.error}` : "",
        subtask.route ? `${prefix} route: ${subtask.route}` : "",
        subtask.proxyNode ? `${prefix} proxyNode: ${subtask.proxyNode}` : "",
        subtask.triedProxyNodes?.length
          ? `${prefix} triedProxyNodes: ${subtask.triedProxyNodes.join(" -> ")}`
          : ""
      ];
    });
  const serializedDetails =
    Object.keys(details).length > 0 ? `details:\n${JSON.stringify(details, null, 2)}` : "";
  const lines = [
    result?.mainErrorCode ? `mainCode: ${result.mainErrorCode}` : "",
    result?.mainError ? `mainError: ${result.mainError}` : "",
    result?.errorCode ? `code: ${result.errorCode}` : "",
    result?.message && result.message !== result.mainError ? `message: ${result.message}` : "",
    details.causeCode ? `causeCode: ${details.causeCode}` : "",
    details.route ? `route: ${details.route}` : "",
    details.upstreamStatus ? `upstreamStatus: ${details.upstreamStatus}` : "",
    details.retryAfterMs ? `retryAfterMs: ${details.retryAfterMs}` : "",
    result?.proxyNode ? `proxyNode: ${result.proxyNode}` : "",
    result?.triedProxyNodes?.length
      ? `triedProxyNodes: ${result.triedProxyNodes.join(" -> ")}`
      : "",
    ...failedSubtasks,
    serializedDetails
  ].filter(Boolean);
  return [...new Set(lines)].join("\n");
}

/** @returns {import("../../types/businessRecords").BatchProgress} */
export function emptyBatchProgress(status = "") {
  return { total: 0, done: 0, succeeded: 0, partial: 0, manual: 0, failed: 0, pending: 0, status };
}

export function presentBatchTask(task, taskObservedAt, t, formatDateTime) {
  if (!task) return { progress: emptyBatchProgress(), results: [] };
  const status = String(task.status || "").toUpperCase();

  const progress = {
    total: Number(task.total || 0),
    done: Number(task.processed || 0),
    succeeded: Number(task.succeeded || 0),
    partial: Number(task.partial || 0),
    manual: Number(task.manual || 0),
    failed: Number(task.failed || 0),
    pending: Number(task.pending || 0),
    status,
    startedAt: task.startedAt || null,
    finishedAt: task.finishedAt || null,
    elapsedMs: Number(task.elapsedMs || 0),
    elapsedObservedAt: taskObservedAt,
    ignoredDuplicateCount: Number(task.ignoredDuplicateCount || 0),
    stopReason: String(task.stopReason || "").toUpperCase(),
    stopMessage: task.stopMessage || "",
    circuitFailureCount: Number(task.circuitFailureCount || 0),
    circuitFailureThreshold: Number(task.circuitFailureThreshold || 0),
    circuitErrorCode: task.circuitErrorCode || "",
    nextAttemptAt:
      task.nextAttemptAt ||
      task.cooldownUntil ||
      (task.items || []).find((item) => String(item.status || "").toUpperCase() === "RETRY_WAIT")
        ?.nextRetryAt ||
      null
  };
  const results = (task.items || []).map((item, index) => {
    const itemStatus = String(item.status || "PENDING").toUpperCase();
    const circuitStopped =
      String(task.stopReason || "").toUpperCase() === "CIRCUIT_BREAKER" && status === "PAUSED";
    const stopped =
      (status === "STOPPED" || circuitStopped) &&
      ["PENDING", "RUNNING", "RETRY_WAIT"].includes(itemStatus);
    const subtasks = (item.subtasks || []).map((subtask) => ({
      ...subtask,
      status: String(subtask.status || "PENDING").toUpperCase()
    }));
    const failedSubtasks = subtasks.filter(
      (subtask) => String(subtask.status || "").toUpperCase() === "FAILED"
    );
    const subtaskErrorCodes = failedSubtasks.map((subtask) => subtask.errorCode).filter(Boolean);
    return {
      index: index + 1,
      shipmentId: item.shipmentId,
      number: item.displayNumber || item.number,
      carrier: item.carrier,
      sourceRow: item.sourceRow || null,
      payload: item.payload || null,
      manualOnly: Boolean(item.manualOnly),
      source: item.source || "",
      mainStatus: String(item.mainStatus || "").toUpperCase(),
      mainSource: item.mainSource || item.source || "",
      mainChannel: item.mainChannel || "",
      mainFetchedAt: item.mainFetchedAt || null,
      mainCacheStale: Boolean(item.mainCacheStale),
      mainDataChanged: item.mainDataChanged,
      mainError: item.mainError || "",
      mainErrorCode: item.mainErrorCode || "",
      status: stopped ? "stopped" : itemStatus.toLowerCase(),
      message: batchTrackItemMessage(item, status, task.stopReason, t, formatDateTime),
      errorCode: item.errorCode || [...new Set(subtaskErrorCodes)].join(", "),
      attempts: Number(item.attempts || 0),
      proxyAttempts: Number(
        item.proxyAttempts ||
          Math.max(0, ...failedSubtasks.map((subtask) => Number(subtask.proxyAttempts || 0)))
      ),
      proxyNode:
        item.proxyNode || failedSubtasks.find((subtask) => subtask.proxyNode)?.proxyNode || "",
      triedProxyNodes: item.triedProxyNodes || [],
      errorDetails: item.errorDetails || {},
      supplementalRetryPending: Boolean(item.supplementalRetryPending),
      startedAt: item.startedAt || null,
      finishedAt: item.finishedAt || null,
      elapsedMs: Number(item.elapsedMs || 0),
      elapsedObservedAt: taskObservedAt,
      subtasks,
      failedSubtasks
    };
  });

  return { progress, results };
}
