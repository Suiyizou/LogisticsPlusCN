function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cancelledError() {
  const error = new Error("Batch tracking task was cancelled");
  error.name = "AbortError";
  error.code = "BATCH_CANCELLED";
  error.httpStatus = 409;
  return error;
}

export function createCoscoQueryGate(options = {}) {
  const minIntervalMs = integer(options.minIntervalMs, 2_500, 0, 60_000);
  const queueLimit = integer(options.queueLimit, 50, 0, 1_000);
  const queueTimeoutMs = integer(options.queueTimeoutMs, 120_000, 1_000, 600_000);
  const queue = [];
  let active = false;
  let lastStartedAt = 0;

  function cleanup(job) {
    clearTimeout(job.queueTimer);
    if (job.signal && job.onAbort) job.signal.removeEventListener("abort", job.onAbort);
  }

  function dispatch() {
    if (active || queue.length === 0) return;
    active = true;
    const job = queue.shift();
    const delay = Math.max(0, minIntervalMs - (Date.now() - lastStartedAt));
    job.startTimer = setTimeout(async () => {
      cleanup(job);
      if (job.signal?.aborted) {
        job.reject(cancelledError());
        active = false;
        dispatch();
        return;
      }
      lastStartedAt = Date.now();
      try {
        job.resolve(await job.operation());
      } catch (error) {
        job.reject(error);
      } finally {
        active = false;
        dispatch();
      }
    }, delay);
  }

  function run(operation, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(cancelledError());
    if (queue.length >= queueLimit) {
      const error = new Error("COSCO query queue is full");
      error.code = "COSCO_QUEUE_BUSY";
      error.httpStatus = 429;
      error.retryAfterMs = queueTimeoutMs;
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const job = { operation, resolve, reject, signal };
      job.onAbort = () => {
        const index = queue.indexOf(job);
        if (index < 0) return;
        queue.splice(index, 1);
        cleanup(job);
        reject(cancelledError());
      };
      if (signal) signal.addEventListener("abort", job.onAbort, { once: true });
      job.queueTimer = setTimeout(() => {
        const index = queue.indexOf(job);
        if (index < 0) return;
        queue.splice(index, 1);
        cleanup(job);
        const error = new Error("COSCO query queue timed out");
        error.code = "COSCO_QUEUE_BUSY";
        error.httpStatus = 429;
        error.retryAfterMs = queueTimeoutMs;
        reject(error);
      }, queueTimeoutMs);
      queue.push(job);
      dispatch();
    });
  }

  return Object.freeze({
    run,
    stats: () => ({
      active: active ? 1 : 0,
      queued: queue.length,
      minIntervalMs,
      queueLimit,
      queueTimeoutMs
    })
  });
}

export function createCoscoCircuitBreaker(options = {}) {
  const cooldownMs = integer(options.cooldownMs, 30 * 60_000, 10_000, 86_400_000);
  const now = options.now ?? Date.now;
  let blockedUntil = 0;
  return Object.freeze({
    trip: () => (blockedUntil = Math.max(blockedUntil, now() + cooldownMs)),
    reset: () => (blockedUntil = 0),
    remainingMs: () => Math.max(0, blockedUntil - now()),
    status() {
      const retryAfterMs = Math.max(0, blockedUntil - now());
      return {
        blocked: retryAfterMs > 0,
        blockedUntil: retryAfterMs > 0 ? new Date(blockedUntil).toISOString() : null,
        retryAfterMs,
        cooldownMs
      };
    }
  });
}
