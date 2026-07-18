let currentWorker = null;
let currentJobId = 0;

class PackingTimeoutError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PackingTimeoutError";
    this.code = "PACKING_TIMEOUT";
    Object.assign(this, details);
  }
}

export function calculatePacking(payload, options = {}) {
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }

  const jobId = ++currentJobId;
  currentWorker = new Worker(new URL("../workers/packingWorker.js", import.meta.url), { type: "module" });
  const workload = estimatePackingWorkload(payload);
  const timeoutMs = packingTimeoutMsFromEstimate(workload);
  const startedAt = Date.now();
  const onDecision = typeof options.onDecision === "function" ? options.onDecision : null;
  const onPartialResult = typeof options.onPartialResult === "function" ? options.onPartialResult : null;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new PackingTimeoutError("PACKING_TIMEOUT", {
        elapsedMs: Date.now() - startedAt,
        timeoutMs,
        workload
      }));
    }, timeoutMs);

    currentWorker.onmessage = (event) => {
      const { id, type, result, message, decisions, progress } = event.data || {};
      if (id !== jobId) return;
      if (type === "decision") {
        onDecision?.(Array.isArray(decisions) ? decisions : []);
        return;
      }
      if (type === "progress") {
        onProgress?.(progress || null);
        return;
      }
      if (type === "partial") {
        onPartialResult?.(result);
        return;
      }
      window.clearTimeout(timer);
      cleanup();
      if (type === "result") resolve(result);
      else reject(new Error(message || "本机计算失败"));
    };

    currentWorker.onerror = (error) => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error(error.message || "本机计算失败"));
    };

    currentWorker.postMessage({
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

function cleanup() {
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }
}

function toWorkerPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function packingTimeoutMsFromEstimate(estimate) {
  const estimatedMs = Math.max(0, Number(estimate.seconds || 0)) * 1000;
  const baseMs = estimate.level === "heavy" ? 420000 : estimate.level === "medium" ? 240000 : 120000;
  const minMs = estimate.level === "heavy" ? 420000 : estimate.level === "medium" ? 300000 : 120000;
  const specialMs = Math.max(0, Number(estimate.specialContainerCount || 0)) * 45000;
  return Math.min(900000, Math.max(minMs, estimatedMs + baseMs + specialMs));
}

export function estimatePackingWorkload(payload = {}) {
  const cargos = payload.cargos || [];
  const containers = payload.containers || [];
  const rawUnitCount = cargos.reduce((sum, cargo) => sum + Math.max(0, Math.floor(Number(cargo.quantity || 0))), 0);
  const typeCount = cargos.length;
  const groupingEnabled = rawUnitCount >= 120;
  const solverUnitCount = cargos.reduce((sum, cargo) => {
    const quantity = Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    if (groupingEnabled && quantity >= 24) return sum + Math.ceil(quantity / 4);
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
