const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

function taskError(message, code, httpStatus = 409) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cancelledTaskError() {
  return taskError("Batch tracking task was cancelled", "BATCH_CANCELLED");
}

function waitWithSignal(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason ?? cancelledTaskError());
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal.reason ?? cancelledTaskError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  const minIntervalMs = integer(options.minIntervalMs, 3_000, 0, 60_000);
  const maxIntervalMs = integer(options.maxIntervalMs, 6_000, minIntervalMs, 60_000);
  const random = options.random ?? Math.random;
  const wait = options.wait ?? waitWithSignal;
  const active = new Map();
  const cancelled = new Map();
  const lastStartedAt = new Map();

  function prune() {
    const current = now();
    for (const [taskId, expiresAt] of cancelled) {
      if (expiresAt <= current) cancelled.delete(taskId);
    }
    for (const [taskId, startedAt] of lastStartedAt) {
      if (startedAt + cancelTtlMs <= current && !active.has(taskId)) lastStartedAt.delete(taskId);
    }
  }

  function begin(value) {
    const taskId = normalizeBatchTaskId(value, { required: true });
    prune();
    if (cancelled.has(taskId)) {
      throw cancelledTaskError();
    }
    if (active.has(taskId)) {
      throw taskError("Batch tracking task already has an active request", "BATCH_TASK_BUSY");
    }
    const controller = new AbortController();
    active.set(taskId, controller);
    let turnPromise = null;
    return {
      taskId,
      signal: controller.signal,
      waitForTurn() {
        if (!turnPromise) {
          turnPromise = (async () => {
            if (controller.signal.aborted) throw controller.signal.reason ?? cancelledTaskError();
            const previousStartedAt = lastStartedAt.get(taskId);
            const intervalMs = previousStartedAt == null
              ? 0
              : minIntervalMs + Math.floor(
                Math.min(0.999999999, Math.max(0, Number(random()) || 0)) *
                  (maxIntervalMs - minIntervalMs + 1)
              );
            const delayMs = previousStartedAt == null
              ? 0
              : Math.max(0, previousStartedAt + intervalMs - now());
            await wait(delayMs, controller.signal);
            if (controller.signal.aborted) throw controller.signal.reason ?? cancelledTaskError();
            lastStartedAt.set(taskId, now());
            return { delayMs, intervalMs };
          })();
        }
        return turnPromise;
      },
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
      controller.abort(cancelledTaskError());
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
