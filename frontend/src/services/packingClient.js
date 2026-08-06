let currentJob = null;
let currentJobId = 0;

const PACKING_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const PACKING_HARD_TIMEOUT_MAX_MS = 30 * 60 * 1000;
const EXPECTED_BUDGET_MS = {
  light: 5 * 60 * 1000,
  medium: 12 * 60 * 1000,
  heavy: 25 * 60 * 1000
};
const HARD_BUDGET_MS = {
  light: 10 * 60 * 1000,
  medium: 20 * 60 * 1000,
  heavy: 30 * 60 * 1000
};

class PackingTimeoutError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PackingTimeoutError";
    this.code = "PACKING_TIMEOUT";
    Object.assign(this, details);
  }
}

export function calculatePacking(payload, options = {}) {
  currentJob?.cancel();

  const jobId = ++currentJobId;
  const worker = new Worker(new URL("../workers/packingWorker.js", import.meta.url), { type: "module" });
  const workload = estimatePackingWorkload(payload);
  const timeoutPolicy = packingTimeoutPolicyFromEstimate(workload);
  const startedAt = Date.now();
  const onDecision = typeof options.onDecision === "function" ? options.onDecision : null;
  const onPartialResult = typeof options.onPartialResult === "function" ? options.onPartialResult : null;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

  return new Promise((resolve, reject) => {
    let idleTimer = 0;
    let hardTimer = 0;
    let settled = false;
    let lastActivityAt = startedAt;
    let lastProgress = null;
    let lastPartialResult = null;

    const cleanup = () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(hardTimer);
      worker.terminate();
      if (currentJob?.id === jobId) currentJob = null;
    };

    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const rejectTimeout = (timeoutKind) => {
      const timeoutMs = timeoutKind === "idle"
        ? timeoutPolicy.idleTimeoutMs
        : timeoutPolicy.hardTimeoutMs;
      settle(() => reject(new PackingTimeoutError("PACKING_TIMEOUT", {
        elapsedMs: Date.now() - startedAt,
        timeoutMs,
        timeoutKind,
        idleTimeoutMs: timeoutPolicy.idleTimeoutMs,
        expectedMs: timeoutPolicy.expectedMs,
        hardTimeoutMs: timeoutPolicy.hardTimeoutMs,
        lastActivityAt,
        lastProgress,
        partialResult: lastPartialResult,
        workload
      })));
    };

    const markActivity = () => {
      lastActivityAt = Date.now();
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => rejectTimeout("idle"), timeoutPolicy.idleTimeoutMs);
    };

    currentJob = {
      id: jobId,
      cancel() {
        settle(() => {
          const error = new Error("PACKING_CANCELLED");
          error.code = "PACKING_CANCELLED";
          reject(error);
        });
      }
    };

    markActivity();
    hardTimer = window.setTimeout(() => rejectTimeout("hard"), timeoutPolicy.hardTimeoutMs);

    worker.onmessage = (event) => {
      const { id, type, result, message, decisions, progress } = event.data || {};
      if (id !== jobId) return;
      markActivity();
      if (type === "decision") {
        onDecision?.(Array.isArray(decisions) ? decisions : []);
        return;
      }
      if (type === "progress") {
        lastProgress = progress || null;
        onProgress?.(progress || null);
        return;
      }
      if (type === "partial") {
        lastPartialResult = result || null;
        onPartialResult?.(result);
        return;
      }
      if (type === "result") settle(() => resolve(result));
      else settle(() => reject(new Error(message || "本机计算失败")));
    };

    worker.onerror = (error) => {
      settle(() => reject(new Error(error.message || "本机计算失败")));
    };

    worker.postMessage({
      id: jobId,
      payload: {
        ...toWorkerPayload(payload),
        traceOptions: {
          enabled: Boolean(onDecision),
          maxEntries: Number(options.maxDecisionEntries || 240),
          batchSize: Number(options.decisionBatchSize || 12)
        },
        progressOptions: {
          enabled: Boolean(onProgress),
          intervalMs: Number(options.progressIntervalMs || 250)
        }
      }
    });
  });
}

function toWorkerPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

export function packingTimeoutPolicyFromEstimate(estimate = {}) {
  const estimatedMs = Math.max(0, Number(estimate.seconds || 0)) * 1000;
  const level = ["light", "medium", "heavy"].includes(estimate.level) ? estimate.level : "light";
  const specialMs = Math.max(0, Number(estimate.specialContainerCount || 0)) * 45000;
  const hardTimeoutMs = Math.min(
    PACKING_HARD_TIMEOUT_MAX_MS,
    Math.max(HARD_BUDGET_MS[level], estimatedMs * 4 + specialMs)
  );
  return {
    level,
    expectedMs: EXPECTED_BUDGET_MS[level],
    idleTimeoutMs: PACKING_IDLE_TIMEOUT_MS,
    hardTimeoutMs
  };
}

export function estimatePackingWorkload(payload = {}) {
  const cargos = payload.cargos || [];
  const completedContainerIds = new Set(
    (payload.resumeEvaluations || [])
      .map((evaluation) => String(evaluation?.container?.id || ""))
      .filter((id) => id && id !== "mixed-plan")
  );
  const containers = (payload.containers || []).filter((container) => !completedContainerIds.has(String(container?.id || "")));
  const rawUnitCount = cargos.reduce((sum, cargo) => sum + Math.max(0, Math.floor(Number(cargo.quantity || 0))), 0);
  const typeCount = cargos.length;
  const groupingEnabled = rawUnitCount >= 80;
  const groupSize = rawUnitCount >= 240 ? 8 : rawUnitCount >= 160 ? 6 : 4;
  const solverUnitCount = cargos.reduce((sum, cargo) => {
    const quantity = Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    if (groupingEnabled && quantity >= 12) return sum + Math.ceil(quantity / groupSize);
    return sum + quantity;
  }, 0);
  const typeFactor = Math.max(1, Math.log2(typeCount + 1));
  const diversityPenalty = typeCount >= 80 ? 2.2 : typeCount >= 40 ? 1.55 : 1;
  const containerCount = Math.max(1, containers.length);
  const specialContainerCount = containers.filter(isSpecialContainerForEstimate).length;
  const strategyFactor = 1 + (LOCAL_SEARCH_PASS_ESTIMATE / 10);
  const specialPenalty = 1 + specialContainerCount * 0.38;
  const mixedPlanPenalty = containerCount >= 2 ? 1.22 : 1;
  const score = solverUnitCount * containerCount * typeFactor * diversityPenalty * strategyFactor * specialPenalty * mixedPlanPenalty;
  const seconds = Math.max(2, Math.ceil(score / 120));
  const hasGrouping = solverUnitCount < rawUnitCount;
  const level = seconds >= 90 || typeCount >= 80 ? "heavy" : seconds >= 25 || typeCount >= 40 ? "medium" : "light";
  const title = hasGrouping ? "已启用同规格块化" : "预计计算耗时";
  const detail = hasGrouping
    ? `原始 ${rawUnitCount} 件压缩为约 ${solverUnitCount} 个搜索块，预计 ${formatDuration(seconds)}。`
    : `${typeCount} 类 / ${rawUnitCount} 件 / ${containerCount} 个箱型，预计 ${formatDuration(seconds)}。`;
  const advice = typeCount >= 40
    ? "货物种类较多，算法会保留更多候选组合；可以等待，或按项目/批次拆分后再算。"
    : "数量较大时系统会优先合并同规格货物，减少浏览器计算压力。";

  return {
    level,
    title,
    detail,
    advice,
    seconds,
    durationLabel: formatDuration(seconds),
    rawUnitCount,
    solverUnitCount,
    typeCount,
    containerCount,
    specialContainerCount,
    completedContainerCount: completedContainerIds.size,
    hasGrouping
  };
}

const LOCAL_SEARCH_PASS_ESTIMATE = 5;

function isSpecialContainerForEstimate(container) {
  const profile = `${container?.usagePriority || ""} ${container?.visualKind || ""} ${container?.equipmentClass || ""} ${container?.id || ""} ${container?.name || ""}`.toLowerCase();
  return /special|flat|rack|reefer|\u51b7\u85cf|\u5e73\u677f|fr|rf/.test(profile);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}
