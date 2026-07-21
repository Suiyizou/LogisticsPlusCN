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
  const minIntervalMs = integer(options.minIntervalMs, 3_000, 0, 60_000);
  const maxIntervalMs = integer(options.maxIntervalMs, 6_000, minIntervalMs, 60_000);
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const queueLimit = integer(options.queueLimit, 50, 0, 1_000);
  const queueTimeoutMs = integer(options.queueTimeoutMs, 120_000, 1_000, 600_000);
  const queue = [];
  let active = false;
  let lastStartedAt = 0;

  function cleanup(job) {
    clearTimer(job.queueTimer);
    clearTimer(job.startTimer);
    if (job.signal && job.onAbort) job.signal.removeEventListener("abort", job.onAbort);
  }

  function dispatch() {
    if (active || queue.length === 0) return;
    active = true;
    const job = queue.shift();
    const jitter = Math.min(0.999999999, Math.max(0, Number(random()) || 0));
    const intervalMs = lastStartedAt === 0
      ? 0
      : minIntervalMs + Math.floor(jitter * (maxIntervalMs - minIntervalMs + 1));
    const delay = Math.max(0, intervalMs - (now() - lastStartedAt));
    job.startTimer = setTimer(async () => {
      job.startTimer = null;
      cleanup(job);
      if (job.signal?.aborted) {
        job.reject(cancelledError());
        active = false;
        dispatch();
        return;
      }
      lastStartedAt = now();
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
        if (index >= 0) queue.splice(index, 1);
        else if (!job.startTimer) return;
        clearTimer(job.startTimer);
        job.startTimer = null;
        cleanup(job);
        reject(cancelledError());
        if (active) {
          active = false;
          dispatch();
        }
      };
      if (signal) signal.addEventListener("abort", job.onAbort, { once: true });
      job.queueTimer = setTimer(() => {
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
      maxIntervalMs,
      queueLimit,
      queueTimeoutMs
    })
  });
}

export function createCoscoCircuitBreaker(options = {}) {
  const cooldownMs = integer(options.cooldownMs, 30 * 60_000, 10_000, 86_400_000);
  const failureThreshold = integer(options.failureThreshold, 2, 1, 20);
  const now = options.now ?? Date.now;
  let blockedUntil = 0;
  let consecutiveFailures = 0;
  return Object.freeze({
    trip: (requestedCooldownMs = cooldownMs) => {
      const durationMs = integer(requestedCooldownMs, cooldownMs, 1_000, 86_400_000);
      blockedUntil = Math.max(blockedUntil, now() + durationMs);
      return blockedUntil;
    },
    recordFailure({ retryAfterMs, immediate = false } = {}) {
      consecutiveFailures += 1;
      if (immediate || consecutiveFailures >= failureThreshold) {
        const exponential = Math.min(
          cooldownMs,
          15_000 * (2 ** Math.min(10, consecutiveFailures - 1))
        );
        this.trip(Math.max(Number(retryAfterMs) || 0, exponential));
      }
      return this.status();
    },
    reset: () => {
      blockedUntil = 0;
      consecutiveFailures = 0;
    },
    recordSuccess: () => {
      consecutiveFailures = 0;
    },
    remainingMs: () => Math.max(0, blockedUntil - now()),
    status() {
      const retryAfterMs = Math.max(0, blockedUntil - now());
      return {
        blocked: retryAfterMs > 0,
        blockedUntil: retryAfterMs > 0 ? new Date(blockedUntil).toISOString() : null,
        retryAfterMs,
        cooldownMs,
        consecutiveFailures,
        failureThreshold
      };
    }
  });
}
