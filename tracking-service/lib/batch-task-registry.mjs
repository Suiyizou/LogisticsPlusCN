const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

function taskError(message, code, httpStatus = 409) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

export function normalizeBatchTaskId(value, { required = false } = {}) {
  const taskId = String(value ?? "").trim();
  if (!taskId && !required) return null;
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw taskError("Batch task id is invalid", "INVALID_BATCH_TASK_ID", 400);
  }
  return taskId;
}

export function createBatchTaskRegistry(options = {}) {
  const now = options.now ?? Date.now;
  const cancelTtlMs = options.cancelTtlMs ?? 60 * 60_000;
  const active = new Map();
  const cancelled = new Map();

  function prune() {
    const current = now();
    for (const [taskId, expiresAt] of cancelled) {
      if (expiresAt <= current) cancelled.delete(taskId);
    }
  }

  function begin(value) {
    const taskId = normalizeBatchTaskId(value, { required: true });
    prune();
    if (cancelled.has(taskId)) {
      throw taskError("Batch tracking task was cancelled", "BATCH_CANCELLED");
    }
    if (active.has(taskId)) {
      throw taskError("Batch tracking task already has an active request", "BATCH_TASK_BUSY");
    }
    const controller = new AbortController();
    active.set(taskId, controller);
    return {
      taskId,
      signal: controller.signal,
      finish() {
        if (active.get(taskId) === controller) active.delete(taskId);
      }
    };
  }

  function cancel(value) {
    const taskId = normalizeBatchTaskId(value, { required: true });
    prune();
    cancelled.set(taskId, now() + cancelTtlMs);
    const controller = active.get(taskId);
    if (controller) {
      active.delete(taskId);
      controller.abort(taskError("Batch tracking task was cancelled", "BATCH_CANCELLED"));
    }
    return {
      taskId,
      status: "cancelled",
      activeRequestCancelled: Boolean(controller)
    };
  }

  return Object.freeze({
    begin,
    cancel,
    status(value) {
      const taskId = normalizeBatchTaskId(value, { required: true });
      prune();
      return { taskId, active: active.has(taskId), cancelled: cancelled.has(taskId) };
    }
  });
}
