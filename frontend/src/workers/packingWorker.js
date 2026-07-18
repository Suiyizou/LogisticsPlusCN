import { normalizeContainerHeightFields } from "../services/localData.js";

const TYPE_RULES = {
  normal: { rotatable: true, nonStack: false, extraGapCm: 0 },
  upright: { rotatable: false, nonStack: false, extraGapCm: 0 },
  nonstack: { rotatable: true, nonStack: true, extraGapCm: 0 },
  pallet: { rotatable: true, nonStack: false, extraGapCm: 0 }
};

const COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const EPS = 0.0001;
const DEFAULT_SUPPORT_RATIO = 0.8;
const DEFAULT_NONSTACK_SUPPORT_RATIO = 0.985;
const MAX_DETAILED_BOXES = 24;
const LOCAL_SEARCH_PASSES = 5;
const GROUPING_MIN_TOTAL_UNITS = 120;
const GROUPING_MIN_CARGO_QUANTITY = 24;
const GROUPING_MAX_BLOCK_QUANTITY = 4;
const NON_STACK_TOP_LAYER_CANDIDATES = 16;
const LOWER_GAP_SWAP_MAX_EDGE_MOVERS = 24;
const LOWER_GAP_SWAP_MAX_LATE_MOVERS = 3;
const LOWER_GAP_SWAP_MIN_DROP_CM = 5;
const SPARSE_TAIL_SPREAD_MIN_FREE_CM = 10;
const SPARSE_TAIL_SPREAD_MAX_INSERT_GAP_CM = 45;
const SPARSE_TAIL_SPREAD_MAX_CANDIDATES = 10;
const VERTICAL_TAIL_FILL_MAX_PASSES = 16;
const VERTICAL_TAIL_FILL_MAX_CANDIDATES = 24;
const EDGE_ORIENTATION_REPACK_MAX_CANDIDATES = 6;
const EDGE_ORIENTATION_REPACK_MAX_BAND_ROWS = 6;
const NON_STACK_DISPLACEMENT_MAX_SWAPS = 2;
const NON_STACK_DISPLACEMENT_MAX_MOVERS = 2;
const NON_STACK_DISPLACEMENT_MAX_RECEIVERS = 3;
const MIXED_PLAN_MAX_SOLVER_UNITS = 120;
const MIXED_REPLACEMENT_CANDIDATE_LIMIT = 3;
const MIXED_COMBINATION_BEAM_WIDTH = 8;
const BALANCE_GREEN_LIMIT_PERCENT = 2.5;
const BALANCE_RED_LIMIT_PERCENT = 5;
const FRONT_MAX_PERCENT = 60;
const REAR_MIN_PERCENT_40FR = 30;
const LATERAL_OFFSET_LIMIT_CM = 8;
const BALANCE_SKIP_BELOW_WEIGHT_KG = 18000;
const HEAVY_TOP_FRACTION = 0.35;
const BALANCE_SCORE_WEIGHT = 250000;
const EARLY_BALANCE_SCORE_WEIGHT = 65000;
const HEAVY_CENTER_WEIGHT = 1600;
const HEAVY_ZONE_WEIGHT = 4200;
const LIGHT_ZONE_WEIGHT = 650;
const BALANCE_ZONE_ORDER = ["frontLeft", "rearRight", "frontRight", "rearLeft"];
const FIT_STATUS = {
  FIT: "fit",
  ESTIMATED: "estimated",
  BALANCE_BLOCKED: "balance-blocked",
  OVERSIZE: "oversize"
};
const UTILIZATION_LOW_WARN_PERCENT = 55;
const UTILIZATION_HIGH_WARN_PERCENT = 92;
const REFERENCE_PRICE_BASE = 1000;
const RECOMMENDATION_BOX_WEIGHT = 110;
const AXIS_LENGTH = "\u957f";
const AXIS_WIDTH = "\u5bbd";
const AXIS_HEIGHT = "\u9ad8";
const LAYER_ROW_FILL_STRATEGY_ID = "layer-row-fill";

const SEARCH_STRATEGIES = [
  { id: "laff-footprint", name: "LAFF 大底面积优先", unitOrder: "footprint", pointOrder: "low-wide", blueVertical: false },
  { id: LAYER_ROW_FILL_STRATEGY_ID, name: "LAFF Single-Layer Row Fill", unitOrder: "footprint", pointOrder: "low-wide", blueVertical: false },
  { id: "laff-height", name: "LAFF 高度优先", unitOrder: "height", pointOrder: "low-wide", blueVertical: false },
  { id: "support-first", name: "普通承重货物优先", unitOrder: "support", pointOrder: "support", blueVertical: false },
  { id: "nonstack-last", name: "不可重压货物最后", unitOrder: "nonstack-last", pointOrder: "low-wide", blueVertical: false },
  { id: "blue-vertical", name: "蓝色/小件竖放支撑", unitOrder: "small-vertical", pointOrder: "support", blueVertical: true }
];

let activeTrace = null;
let activeProgress = null;

const workerScope = typeof self !== "undefined" ? self : null;
if (workerScope?.addEventListener) {
  workerScope.onmessage = (event) => {
    const { id, payload } = event.data || {};
    const trace = createWorkerTrace(id, payload?.traceOptions);
    const progress = createWorkerProgress(id, payload?.progressOptions);
    activeTrace = trace;
    activeProgress = progress;
    try {
      const result = calculate(payload || {}, {
        onStageResult(stageResult) {
          trace.flush();
          workerScope.postMessage({ id, type: "partial", result: stageResult });
        }
      });
      progress.report({ phase: "recommendation", completedContainers: progress.totalContainers(), stageFraction: 1, force: true });
      trace.flush();
      workerScope.postMessage({ id, type: "result", result });
    } catch (error) {
      trace.flush();
      workerScope.postMessage({ id, type: "error", message: error.message || "本机计算失败" });
    } finally {
      activeTrace = null;
      activeProgress = null;
    }
  };
}

function createWorkerTrace(id, options = {}) {
  const enabled = Boolean(options?.enabled) && Boolean(workerScope?.postMessage);
  const maxEntries = Math.min(120, Math.max(30, Math.floor(Number(options?.maxEntries || 80))));
  const batchSize = Math.min(40, Math.max(6, Math.floor(Number(options?.batchSize || 12))));
  const buffer = [];
  let emitted = 0;
  let dropped = 0;

  return {
    log(entry) {
      if (!enabled || !entry?.text) return;
      if (entry.level === "detail") return;
      if (emitted >= maxEntries) {
        dropped += 1;
        return;
      }
      emitted += 1;
      buffer.push({
        index: emitted,
        phase: entry.phase || "search",
        level: entry.level || "summary",
        text: String(entry.text)
      });
      if (buffer.length >= batchSize) this.flush();
    },
    flush() {
      if (!enabled || !buffer.length) return;
      const decisions = buffer.splice(0);
      workerScope.postMessage({ id, type: "decision", decisions });
    },
    droppedCount() {
      return dropped;
    }
  };
}

function traceDecision(entry) {
  activeTrace?.log(entry);
}

function createWorkerProgress(id, options = {}) {
  const enabled = Boolean(options?.enabled) && Boolean(workerScope?.postMessage);
  const minIntervalMs = Math.min(1000, Math.max(100, Number(options?.intervalMs || 250)));
  let state = {
    phase: "start",
    completedContainers: 0,
    totalContainers: 0,
    stageFraction: 0
  };
  let lastEmittedAt = 0;
  let lastKey = "";

  return {
    report(entry = {}) {
      state = { ...state, ...entry };
      if (!enabled) return;
      const progress = normalizeWorkerProgress(state);
      const now = Date.now();
      const key = [
        progress.phase,
        progress.containerIndex,
        progress.completedContainers,
        progress.boxIndex,
        progress.strategyIndex,
        progress.layerNo,
        progress.percent
      ].join("|");
      if (!entry.force && key === lastKey && now - lastEmittedAt < minIntervalMs) return;
      lastEmittedAt = now;
      lastKey = key;
      workerScope.postMessage({ id, type: "progress", progress });
    },
    totalContainers() {
      return Number(state.totalContainers || 0);
    }
  };
}

function normalizeWorkerProgress(state) {
  const totalContainers = Math.max(1, Number(state.totalContainers || 1));
  const completedContainers = Math.min(totalContainers, Math.max(0, Number(state.completedContainers || 0)));
  const stageFraction = Math.min(1, Math.max(0, Number(state.stageFraction || 0)));
  const containerRatio = Math.min(1, (completedContainers + stageFraction) / totalContainers);
  const percent = Number.isFinite(Number(state.percent))
    ? Number(state.percent)
    : 2 + containerRatio * 92;

  return {
    phase: state.phase || "start",
    percent: roundProgressPercent(percent),
    completedContainers,
    totalContainers,
    containerIndex: Number(state.containerIndex || completedContainers + 1),
    containerName: state.containerName || "",
    boxIndex: Number(state.boxIndex || 0),
    strategyIndex: Number(state.strategyIndex || 0),
    strategyCount: Number(state.strategyCount || SEARCH_STRATEGIES.length),
    strategyId: state.strategyId || "",
    layerNo: Number(state.layerNo || 0),
    remainingUnits: Number(state.remainingUnits || 0),
    placedUnits: Number(state.placedUnits || 0),
    partialReady: Boolean(state.partialReady)
  };
}

function roundProgressPercent(value) {
  const number = Math.min(99, Math.max(0, Number(value || 0)));
  return Math.round(number * 10) / 10;
}

function traceProgress(entry) {
  activeProgress?.report(entry);
}

export function calculate(request = {}, options = {}) {
  const globalGapCm = safeGlobalGapCm(request.globalGapCm);
  const cargos = request.cargos || [];
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const balanceSettings = normalizeBalanceSettings(request.balanceSettings);
  const supportSettings = normalizeSupportSettings(request);
  const evaluations = [];
  const orderedContainers = orderContainersForCalculation((request.containers || []).map(normalizeContainerHeightFields));
  const primaryCount = orderedContainers.filter(isPrimaryCalculationContainer).length;
  traceProgress({
    phase: "start",
    totalContainers: orderedContainers.length,
    completedContainers: 0,
    stageFraction: 0,
    force: true
  });
  traceDecision({
    phase: "start",
    level: "summary",
    text: `开始本机装箱：${cargos.length} 类货物 / ${total.totalQuantity} 件，${(request.containers || []).length} 个箱型参与计算；单箱总重不超过 ${round(balanceSettings.skipBelowWeightKg / 1000)}t 时跳过偏载拦截。`
  });

  for (let i = 0; i < orderedContainers.length; i += 1) {
    const container = orderedContainers[i];
    const runtimeContainer = { ...container, balanceSettings, supportSettings };
    traceProgress({
      phase: "container",
      totalContainers: orderedContainers.length,
      completedContainers: i,
      containerIndex: i + 1,
      containerName: container.name,
      stageFraction: 0.04,
      force: true
    });
    traceDecision({
      phase: "container",
      level: "summary",
      text: `评估箱型：${container.name}，内尺寸 ${round(container.lengthCm)}×${round(container.widthCm)}×${round(container.heightCm)}cm，最大载重 ${round(Number(container.payloadKg || 0) / 1000)}t。`
    });
    const units = buildUnits(cargos, globalGapCm, runtimeContainer, total);
    traceProgress({
      phase: "prepare",
      totalContainers: orderedContainers.length,
      completedContainers: i,
      containerIndex: i + 1,
      containerName: container.name,
      stageFraction: 0.12,
      remainingUnits: units.length
    });
    traceDecision({
      phase: "prepare",
      level: "summary",
      text: units.length < total.totalQuantity
        ? `${container.name} · 启用同规格块化：原始 ${total.totalQuantity} 件压缩为 ${units.length} 个搜索单元，最大组合块 ${GROUPING_MAX_BLOCK_QUANTITY} 件。`
        : `${container.name} · 保持单件搜索：共 ${units.length} 个搜索单元。`
    });
    const evaluation = evaluateContainer(runtimeContainer, units, total, utilization, globalGapCm);
    evaluation.container = { ...container };
    evaluations.push(evaluation);
    traceProgress({
      phase: "recommendation",
      totalContainers: orderedContainers.length,
      completedContainers: i + 1,
      containerIndex: i + 1,
      containerName: container.name,
      stageFraction: 1,
      partialReady: true,
      force: true
    });
    if (typeof options.onStageResult === "function") {
      options.onStageResult(buildCalculationResult(evaluations, {
        partial: true,
        stage: i + 1 >= primaryCount ? "primary" : "container",
        completedContainers: i + 1,
        pendingContainers: orderedContainers.length - (i + 1),
        latestContainerId: container.id,
        latestContainerName: container.name
      }));
      traceDecision({
        phase: "recommendation",
        level: "summary",
        text: `${container.name} stage result is ready; ${orderedContainers.length - (i + 1)} container types are still running in the background.`
      });
    }
    traceDecision({
      phase: "container",
      level: "summary",
      text: `${container.name} · 计算完成：${evaluation.fitStatus === FIT_STATUS.FIT ? "可装" : evaluation.fitStatus === FIT_STATUS.ESTIMATED ? "估算候选，未完成全部逐箱验证" : evaluation.fitStatus === FIT_STATUS.BALANCE_BLOCKED ? "偏载拦截" : "不可装"}，${evaluation.boxes > 0 ? `${evaluation.boxes} 箱` : "未形成完整方案"}，首箱利用率 ${round(evaluation.firstBoxFillPercent)}%，平均利用率 ${round(evaluation.averageFillPercent)}%。`
    });
  }

  const mixedEvaluation = shouldBuildMixedContainerEvaluation(orderedContainers, total)
    ? safeBuildMixedContainerEvaluation(orderedContainers, cargos, total, utilization, globalGapCm, balanceSettings, supportSettings, evaluations)
    : null;
  if (mixedEvaluation) {
    evaluations.push(mixedEvaluation);
    traceDecision({
      phase: "recommendation",
      level: "summary",
      text: `混合箱型候选：${mixedEvaluation.mixedPlan?.summary || "组合方案"}，${mixedEvaluation.boxes} 箱，平均利用率 ${round(mixedEvaluation.averageFillPercent)}%。`
    });
  }

  applyGlobalPriceComparability(evaluations);
  evaluations.sort(compareEvaluation);
  const bestEvaluation = evaluations.find((evaluation) => evaluation.fitStatus === FIT_STATUS.FIT) || null;
  traceDecision({
    phase: "recommendation",
    level: "summary",
    text: bestEvaluation
      ? `当前搜索最优方案：${bestEvaluation.mixedPlan?.summary || bestEvaluation.container.name}，${bestEvaluation.boxes > 0 ? `${bestEvaluation.boxes} 箱` : "暂无完整方案"}，${freightConclusionText(bestEvaluation)}。`
      : evaluations.some((evaluation) => evaluation.fitStatus === FIT_STATUS.ESTIMATED)
        ? "当前参与计算的箱型仅生成估算候选，尚未完成全部逐箱验证。"
        : "当前参与计算的箱型未生成可行方案。"
  });
  return {
    bestContainerId: bestEvaluation?.container.id || null,
    evaluations
  };
}

function buildCalculationResult(evaluations, extra = {}) {
  applyGlobalPriceComparability(evaluations);
  const sorted = [...evaluations].sort(compareEvaluation);
  return {
    bestContainerId: sorted.find((evaluation) => evaluation.fitStatus === FIT_STATUS.FIT)?.container.id || null,
    evaluations: sorted,
    ...extra
  };
}

function orderContainersForCalculation(containers) {
  const ordered = [...containers].sort((a, b) => containerCalculationRank(a) - containerCalculationRank(b));
  const primary = ordered.filter(isPrimaryCalculationContainer);
  const secondary = ordered.filter((container) => !isPrimaryCalculationContainer(container));
  return [...primary, ...secondary];
}

function isPrimaryCalculationContainer(container) {
  const meta = equipmentMeta(container);
  if (container?.usagePriority === "special") return false;
  return meta.equipmentClass === "GP" || meta.equipmentClass === "HQ";
}

function containerCalculationRank(container) {
  const id = String(container?.id || "").toLowerCase();
  const fixedOrder = ["20gp", "40gp", "40hq", "20hq", "45hq", "20rf", "40rf", "20fr", "40fr"];
  const fixedIndex = fixedOrder.indexOf(id);
  if (fixedIndex >= 0) return fixedIndex;
  const meta = equipmentMeta(container);
  const classRank = {
    GP: 10,
    HQ: 20,
    RF: 60,
    FR: 80
  }[meta.equipmentClass] || 90;
  const priorityPenalty = container?.usagePriority === "special" ? 20 : 0;
  return classRank + priorityPenalty + Math.min(9, volumeM3(container) / 100);
}

function evaluateContainer(container, units, total, utilizationPercent, globalGapCm) {
  const multi = packMultiple(container, units);
  return buildEvaluation(container, units, total, utilizationPercent, globalGapCm, multi);
}

function evaluateContainerFromReusable(container, units, total, utilizationPercent, globalGapCm, reusable) {
  const placed = reusable.firstBox.placed.map(copyUnit);
  const placedIds = new Set(placed.map((unit) => unit.unitKey));
  const unplaced = units.filter((unit) => !placedIds.has(unit.unitKey));
  const firstBox = makePackedBox(placed, unplaced, {
    id: "reused-one-box",
    name: `复用 ${reusable.container.name} 的单箱坐标`
  }, { localSearchPasses: 0, repairedCount: 0 });
  const multi = {
    boxes: unplaced.length ? 2 : 1,
    firstBox,
    packedBoxes: [firstBox],
    estimated: unplaced.length > 0,
    fatalOversize: false
  };
  return buildEvaluation(container, units, total, utilizationPercent, globalGapCm, multi);
}

function buildEvaluation(container, units, total, utilizationPercent, globalGapCm, multi) {
  const usableVolume = volumeM3(container) * utilizationPercent / 100;
  const usage = usageMetricsForPackedBoxes(container, multi.packedBoxes, utilizationPercent);
  const firstPackedRawVolume = sumCargoVolumeM3(multi.firstBox.placed);
  const firstPackedOccupiedVolume = firstPackedRawVolume;
  const fillPercent = usage.firstFillPercent;
  const rawFillPercent = usableVolume > 0 ? firstPackedRawVolume / usableVolume * 100 : 0;
  const remainingVolume = usableVolume - firstPackedOccupiedVolume;
  const weightBoxes = container.payloadKg > 0 ? Math.ceil(total.totalWeightKg / container.payloadKg) : 0;
  const packedBoxBalances = multi.packedBoxes.map((box) => box.balanceValidation || validateWeightBalance(box.container || container, box.placed));
  const placementConstraintsBlocked = multi.packedBoxes.some((box) => !validateAllPlacements(box.container || container, box.placed || []));
  const balanceBlocked = Boolean(
    multi.balanceBlocked
    || packedBoxBalances.some((validation) => validation?.severity === "red")
    || multi.firstBox?.strategySummary?.complianceBlocked
  );
  const geometryFeasible = multi.boxes > 0 && multi.firstBox?.placed?.length > 0 && !placementConstraintsBlocked;
  const boxes = geometryFeasible ? Math.max(multi.boxes, weightBoxes) : -1;
  const fitStatus = !geometryFeasible
    ? FIT_STATUS.OVERSIZE
    : balanceBlocked
      ? FIT_STATUS.BALANCE_BLOCKED
      : multi.estimated
        ? FIT_STATUS.ESTIMATED
        : FIT_STATUS.FIT;
  const averageFillPercent = geometryFeasible && boxes > 0
    ? averageUsagePercentForBoxCount(container, multi.packedBoxes, utilizationPercent, boxes, total)
    : 0;

  const evaluation = {
    container,
    feasible: fitStatus === FIT_STATUS.FIT,
    geometryFeasible,
    complianceFeasible: fitStatus === FIT_STATUS.FIT,
    placementConstraintsBlocked,
    balanceBlocked,
    fitStatus,
    fatalOversize: fitStatus === FIT_STATUS.OVERSIZE,
    boxes,
    totalUnits: total.totalQuantity,
    solverUnits: units.length,
    groupedBlockCount: units.filter((unit) => unit.groupQuantity > 1).length,
    groupedPhysicalUnits: units.reduce((sum, unit) => sum + Math.max(0, unitQuantity(unit) - 1), 0),
    usableVolumeM3: round(usableVolume),
    totalRawVolumeM3: round(total.totalRawVolumeM3),
    totalWeightKg: round(total.totalWeightKg),
    usageMode: usage.mode,
    firstBoxFillPercent: round(fillPercent),
    firstBoxRawFillPercent: round(rawFillPercent),
    averageFillPercent: round(averageFillPercent),
    firstBoxDeckAreaPercent: round(usage.firstDeckAreaPercent),
    firstBoxLengthPercent: round(usage.firstLengthPercent),
    averageDeckAreaPercent: round(usage.averageDeckAreaPercent),
    firstBoxOccupiedVolumeM3: round(firstPackedOccupiedVolume),
    firstBoxRemainingVolumeM3: round(Math.max(0, remainingVolume)),
    estimatedBoxes: multi.estimated,
    detailedBoxes: multi.packedBoxes.length,
    detailedBoxLimit: multi.detailedBoxLimit || MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed: multi.remainingUnitCountAfterDetailed || 0,
    trace: buildTrace(container, units, total, multi, {
      utilizationPercent,
      globalGapCm,
      usableVolume,
      firstPackedRawVolume,
      firstPackedOccupiedVolume,
      fillPercent,
      rawFillPercent,
      usage,
      averageFillPercent,
      remainingVolume,
      weightBoxes,
      boxes
    }),
    packedBoxes: multi.packedBoxes.map((box, index) => {
      const balanceValidation = packedBoxBalances[index] || validateWeightBalance(box.container || container, box.placed);
      const placedForOutput = expandGroupedPlacements(box.placed);
      return {
        index: index + 1,
        container: box.container ? { ...box.container } : undefined,
        strategyId: box.strategyId,
        strategyName: box.strategyName,
        strategySummary: box.strategySummary,
        balanceValidation,
        placed: placedForOutput.map(toPlacementDto),
        unplacedUnitKeys: box.unplaced.map((unit) => unit.unitKey)
      };
    })
  };
  evaluation.recommendation = buildRecommendation(evaluation);
  Object.defineProperty(evaluation, "_sourceFirstBox", { value: multi.firstBox, enumerable: false });
  Object.defineProperty(evaluation, "_sourcePackedBoxes", { value: multi.packedBoxes, enumerable: false });
  return evaluation;
}

function canSeedReusableOneBox(evaluation) {
  return evaluation.boxes === 1
    && evaluation._sourceFirstBox
    && evaluation._sourceFirstBox.placed.length === evaluation.totalUnits
    && !evaluation._sourceFirstBox.unplaced.length;
}

function canReuseOneBox(reusable, container, total) {
  if (!reusable?.firstBox?.placed?.length) return false;
  if (container.payloadKg > 0 && total.totalWeightKg > container.payloadKg) return false;
  return reusable.firstBox.placed.every((unit) =>
    unit.x + unit.lengthCm <= container.lengthCm + EPS
    && unit.y + unit.widthCm <= container.widthCm + EPS
    && unit.z + unit.heightCm <= containerHeightLimit(container) + EPS
  );
}

function packMultiple(container, allUnits) {
  let remaining = allUnits.map(copyUnit);
  const packedBoxes = [];
  let firstBox = { placed: [], unplaced: remaining, strategyId: "none", strategyName: "无可行摆放", strategySummary: {} };
  let estimated = false;
  let fatalOversize = false;
  let balanceBlocked = false;
  let remainingUnitCountAfterDetailed = 0;

  for (let boxIndex = 0; remaining.length && boxIndex < MAX_DETAILED_BOXES; boxIndex += 1) {
    traceProgress({
      phase: "box",
      boxIndex: boxIndex + 1,
      remainingUnits: sumUnitQuantity(remaining),
      stageFraction: Math.min(0.86, 0.18 + boxIndex * 0.06)
    });
    traceDecision({
      phase: "box",
      level: "summary",
      text: `${container.name} · 第 ${boxIndex + 1} 货舱开始：剩余 ${sumUnitQuantity(remaining)} 件 / ${remaining.length} 个搜索单元。`
    });
    const packed = packContainer(container, remaining);
    if (boxIndex === 0) firstBox = packed;
    if (!packed.placed.length) {
      fatalOversize = true;
      break;
    }
    if (packed.balanceValidation?.severity === "red" || packed.strategySummary?.complianceBlocked) {
      balanceBlocked = true;
    }
    packedBoxes.push(packed);
    traceDecision({
      phase: "box",
      level: "summary",
      text: `${container.name} · 第 ${boxIndex + 1} 货舱完成：装入 ${sumUnitQuantity(packed.placed)} 件，剩余 ${sumUnitQuantity(packed.unplaced)} 件，采用「${packed.strategyName || "未知策略"}」。`
    });
    remaining = packed.unplaced.map(stripPlacement);
  }

  let boxes = packedBoxes.length;
  if (remaining.length && packedBoxes.length && !fatalOversize) {
    remainingUnitCountAfterDetailed = sumUnitQuantity(remaining);
    const averagePlaced = Math.max(1, Math.round(packedBoxes.reduce((sum, box) => sum + sumUnitQuantity(box.placed), 0) / packedBoxes.length));
    boxes += Math.ceil(remainingUnitCountAfterDetailed / averagePlaced);
    estimated = true;
    remaining = [];
  }

  return {
    boxes: remaining.length ? -1 : boxes,
    firstBox,
    packedBoxes,
    detailedBoxLimit: MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed,
    estimated,
    fatalOversize: fatalOversize || remaining.length > 0,
    balanceBlocked
  };
}

function safeBuildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings, supportSettings, baseEvaluations = []) {
  try {
    return buildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings, supportSettings, baseEvaluations);
  } catch (error) {
    return null;
  }
}

function shouldBuildMixedContainerEvaluation(containers, total) {
  if (!Array.isArray(containers) || containers.length < 2) return false;
  if (Number(total?.totalQuantity || 0) > 360) return false;
  return true;
}

function buildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings, supportSettings, baseEvaluations = []) {
  if (!Array.isArray(containers) || containers.length < 2 || !total.totalQuantity) return null;
  const runtimeContainers = containers.map((container) => ({ ...container, balanceSettings, supportSettings }));
  const priceEligibleContainers = runtimeContainers.filter((container) => equipmentMeta(container).priceAvailable);
  const priceCurrencies = new Set(priceEligibleContainers.map((container) => equipmentMeta(container).referenceCurrency));
  if (!priceEligibleContainers.length || priceCurrencies.size > 1) return null;
  const upgradedFromSinglePlans = buildMixedContainerEvaluationFromSinglePlans(runtimeContainers, baseEvaluations, total, utilizationPercent, globalGapCm);
  const mixedCandidates = upgradedFromSinglePlans ? [upgradedFromSinglePlans] : [];

  const seedContainer = pickMixedSeedContainer(priceEligibleContainers);
  let remaining = buildUnits(cargos, globalGapCm, seedContainer, total).map(copyUnit);
  if (remaining.length > MIXED_PLAN_MAX_SOLVER_UNITS) return mixedCandidates.sort(compareEvaluation)[0] || null;
  if (!remaining.length) return mixedCandidates.sort(compareEvaluation)[0] || null;

  const packedBoxes = [];
  let balanceBlocked = false;
  let fatalOversize = false;

  for (let boxIndex = 0; remaining.length && boxIndex < MAX_DETAILED_BOXES; boxIndex += 1) {
    const candidates = priceEligibleContainers
      .map((container) => {
        const packed = packContainer(container, remaining);
        const placedQuantity = sumUnitQuantity(packed.placed);
        if (!placedQuantity) return null;
        const fitStatus = packed.balanceValidation?.severity === "red" || packed.strategySummary?.complianceBlocked
          ? FIT_STATUS.BALANCE_BLOCKED
          : FIT_STATUS.FIT;
        return {
          container,
          packed,
          placedQuantity,
          fitStatus,
          score: mixedBoxCandidateScore(container, packed, remaining, utilizationPercent, fitStatus)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);

    const selected = candidates.find((candidate) => candidate.fitStatus === FIT_STATUS.FIT) || candidates[0];
    if (!selected?.packed?.placed?.length) {
      fatalOversize = true;
      break;
    }

    const selectedBox = {
      ...selected.packed,
      container: { ...selected.container, balanceSettings: undefined, supportSettings: undefined }
    };
    packedBoxes.push(selectedBox);
    if (selected.fitStatus === FIT_STATUS.BALANCE_BLOCKED) balanceBlocked = true;
    remaining = selected.packed.unplaced.map(stripPlacement);
  }

  if (remaining.length) fatalOversize = true;
  if (!packedBoxes.length) return mixedCandidates.sort(compareEvaluation)[0] || null;
  if (fatalOversize || combinationDuplicatesBasePlan(packedBoxes, baseEvaluations)) {
    return mixedCandidates.sort(compareEvaluation)[0] || null;
  }
  const mixedFreight = mixedPlanFreightCost(packedBoxes);

  const mixedContainer = {
    id: "mixed-plan",
    name: "智能组合方案",
    lengthCm: packedBoxes[0].container.lengthCm,
    widthCm: packedBoxes[0].container.widthCm,
    heightCm: packedBoxes[0].container.heightCm,
    payloadKg: packedBoxes.reduce((sum, box) => sum + Number(box.container.payloadKg || 0), 0),
    equipmentClass: "MIX",
    priceTier: "mixed",
    costFactor: mixedPlanCost(packedBoxes),
    referencePrice: Number.isFinite(mixedFreight) ? mixedFreight : undefined,
    mixedPlan: true
  };
  const multi = {
    boxes: fatalOversize ? -1 : packedBoxes.length,
    firstBox: packedBoxes[0],
    packedBoxes,
    detailedBoxLimit: MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed: sumUnitQuantity(remaining),
    estimated: false,
    fatalOversize,
    balanceBlocked
  };
  const units = packedBoxes.flatMap((box) => box.placed.map(copyUnit));
  const evaluation = buildEvaluation(mixedContainer, units, total, utilizationPercent, globalGapCm, multi);
  evaluation.isMixedPlan = true;
  const totalUsableVolume = packedBoxes.reduce((sum, box) => sum + volumeM3(box.container) * utilizationPercent / 100, 0);
  const totalOccupiedVolume = packedBoxes.reduce((sum, box) => sum + sumCargoVolumeM3(box.placed), 0);
  const usage = usageMetricsForPackedBoxes(mixedContainer, packedBoxes, utilizationPercent);
  evaluation.usableVolumeM3 = round(totalUsableVolume);
  evaluation.firstBoxOccupiedVolumeM3 = round(totalOccupiedVolume);
  evaluation.firstBoxRemainingVolumeM3 = round(Math.max(0, totalUsableVolume - totalOccupiedVolume));
  evaluation.usageMode = usage.mode;
  evaluation.firstBoxFillPercent = round(usage.averageFillPercent);
  evaluation.firstBoxRawFillPercent = evaluation.firstBoxFillPercent;
  evaluation.averageFillPercent = evaluation.firstBoxFillPercent;
  evaluation.firstBoxDeckAreaPercent = round(usage.firstDeckAreaPercent);
  evaluation.firstBoxLengthPercent = round(usage.firstLengthPercent);
  evaluation.averageDeckAreaPercent = round(usage.averageDeckAreaPercent);
  evaluation.mixedPlan = {
    summary: mixedPlanSummary(packedBoxes),
    boxes: packedBoxes.map((box, index) => ({
      index: index + 1,
      containerId: box.container.id,
      containerName: box.container.name,
      placedCount: sumUnitQuantity(box.placed)
    }))
  };
  evaluation.recommendation = buildRecommendation(evaluation);
  mixedCandidates.push(evaluation);
  return mixedCandidates.sort(compareEvaluation)[0] || null;
}

function buildMixedContainerEvaluationFromSinglePlans(runtimeContainers, baseEvaluations, total, utilizationPercent, globalGapCm) {
  const candidates = [];
  const usableContainers = runtimeContainers
    .filter((container) => (isPrimaryCalculationContainer(container) || container?.usagePriority === "special") && equipmentMeta(container).priceAvailable)
    .sort((a, b) => {
      const priceDiff = equipmentMeta(a).referencePrice - equipmentMeta(b).referencePrice;
      if (Math.abs(priceDiff) > EPS) return priceDiff;
      return volumeM3(a) - volumeM3(b);
    });
  if (!usableContainers.length) return null;

  for (const baseEvaluation of baseEvaluations || []) {
    if (!canUseEvaluationAsMixedBase(baseEvaluation)) continue;
    let beam = [{ boxes: [], freight: 0, currency: "" }];
    let failed = false;
    for (const sourceBox of baseEvaluation._sourcePackedBoxes || []) {
      const replacements = containerCandidatesForPackedBox(usableContainers, sourceBox, utilizationPercent);
      if (!replacements.length) {
        failed = true;
        break;
      }
      const expanded = [];
      for (const state of beam) {
        for (const replacement of replacements) {
          const meta = equipmentMeta(replacement.container);
          if (state.currency && state.currency !== meta.referenceCurrency) continue;
          expanded.push({
            boxes: [...state.boxes, replacement],
            freight: state.freight + meta.referencePrice,
            currency: state.currency || meta.referenceCurrency
          });
        }
      }
      beam = retainMixedCombinationStates(expanded);
      if (!beam.length) {
        failed = true;
        break;
      }
    }
    if (failed || !beam.length) continue;
    for (const state of beam) {
      if (combinationDuplicatesBasePlan(state.boxes, baseEvaluations)) continue;
      const mixedFreight = mixedPlanFreightCost(state.boxes);
      if (!(mixedFreight < estimatedFreightCost(baseEvaluation) - EPS)) continue;
      const evaluation = buildMixedEvaluationFromPackedBoxes(state.boxes, total, utilizationPercent, globalGapCm);
      evaluation.mixedPlan = {
        ...evaluation.mixedPlan,
        sourceContainerId: baseEvaluation.container?.id,
        sourceContainerName: baseEvaluation.container?.name,
        searchMethod: "bounded-fixed-partition-beam",
        retainedCandidatesPerBox: MIXED_REPLACEMENT_CANDIDATE_LIMIT,
        beamWidth: MIXED_COMBINATION_BEAM_WIDTH,
        distinctContainerCount: new Set(state.boxes.map((box) => box.container?.id).filter(Boolean)).size
      };
      evaluation.recommendation = buildRecommendation(evaluation);
      candidates.push(evaluation);
    }
  }

  return candidates.sort(compareEvaluation)[0] || null;
}

function combinationDuplicatesBasePlan(packedBoxes, baseEvaluations) {
  const containerIds = [...new Set((packedBoxes || []).map((box) => box.container?.id).filter(Boolean))];
  if (containerIds.length !== 1) return false;
  const base = (baseEvaluations || []).find((evaluation) =>
    evaluation?.container?.id === containerIds[0]
    && evaluation.fitStatus === FIT_STATUS.FIT
    && !evaluation.estimatedBoxes
  );
  if (!base || Number(base.boxes || 0) !== packedBoxes.length) return false;
  const combinationFreight = mixedPlanFreightCost(packedBoxes);
  const baseFreight = estimatedFreightCost(base);
  return Number.isFinite(combinationFreight)
    && Number.isFinite(baseFreight)
    && Math.abs(combinationFreight - baseFreight) <= EPS;
}

function canUseEvaluationAsMixedBase(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  const sourceBoxes = evaluation?._sourcePackedBoxes || [];
  return evaluation
    && !evaluation.isMixedPlan
    && evaluation.fitStatus === FIT_STATUS.FIT
    && boxes > 1
    && !evaluation.estimatedBoxes
    && sourceBoxes.length === boxes
    && sourceBoxes.every((box) => box?.placed?.length)
    && !(sourceBoxes[sourceBoxes.length - 1]?.unplaced || []).length;
}

function retainMixedCombinationStates(states) {
  const unique = new Map();
  [...states]
    .sort((a, b) => a.freight - b.freight)
    .forEach((state) => {
      const signature = `${state.currency}:${state.boxes.map((box) => box.container?.id || "unknown").join("|")}`;
      if (!unique.has(signature)) unique.set(signature, state);
    });
  return [...unique.values()].slice(0, MIXED_COMBINATION_BEAM_WIDTH);
}

function containerCandidatesForPackedBox(containers, sourceBox, utilizationPercent) {
  const sourceUnits = (sourceBox?.placed || []).map(stripPlacement);
  const sourceQuantity = sumUnitQuantity(sourceUnits);
  const candidates = [];
  for (const container of containers) {
    if (!sourceUnits.length) continue;
    if (Number(container.payloadKg || 0) > 0 && sourceUnits.reduce((sum, unit) => sum + Number(unit.weightKg || 0), 0) > Number(container.payloadKg || 0) + EPS) {
      continue;
    }
    const packed = packContainer(container, sourceUnits.map(stripPlacement));
    if (!packed?.placed?.length || packed.unplaced?.length || sumUnitQuantity(packed.placed) < sourceQuantity) continue;
    if (packed.balanceValidation?.severity === "red" || packed.strategySummary?.complianceBlocked) continue;
    const meta = equipmentMeta(container);
    if (!meta.priceAvailable) continue;
    const capacity = Math.max(EPS, usageCapacity(container, utilizationPercent));
    const fillPercent = usageUsedCapacity(container, packed.placed) / capacity * 100;
    candidates.push({
      container,
      packed,
      price: meta.referencePrice,
      volume: volumeM3(container),
      fillPercent,
      specialPenalty: meta.equipmentClass === "FR" ? 3 : meta.equipmentClass === "RF" ? 2 : 0
    });
  }
  const selected = candidates.sort((a, b) => {
    const priceDiff = a.price - b.price;
    if (Math.abs(priceDiff) > EPS) return priceDiff;
    const specialDiff = a.specialPenalty - b.specialPenalty;
    if (specialDiff) return specialDiff;
    const volumeDiff = a.volume - b.volume;
    if (Math.abs(volumeDiff) > EPS) return volumeDiff;
    return b.fillPercent - a.fillPercent;
  }).slice(0, MIXED_REPLACEMENT_CANDIDATE_LIMIT);
  return selected.map((candidate) => ({
    ...candidate.packed,
    container: mixedPlanBoxContainer(candidate.container),
    strategySummary: {
      ...(candidate.packed.strategySummary || {}),
      mixedReplacementFrom: sourceBox?.container?.name || "",
      mixedReplacementFillPercent: round(candidate.fillPercent)
    }
  }));
}

function buildMixedEvaluationFromPackedBoxes(packedBoxes, total, utilizationPercent, globalGapCm, fatalOversize = false, balanceBlocked = false) {
  const mixedFreight = mixedPlanFreightCost(packedBoxes);
  const mixedContainer = {
    id: "mixed-plan",
    name: "智能组合方案",
    lengthCm: packedBoxes[0].container.lengthCm,
    widthCm: packedBoxes[0].container.widthCm,
    heightCm: packedBoxes[0].container.heightCm,
    payloadKg: packedBoxes.reduce((sum, box) => sum + Number(box.container.payloadKg || 0), 0),
    equipmentClass: "MIX",
    priceTier: "mixed",
    costFactor: mixedPlanCost(packedBoxes),
    referencePrice: Number.isFinite(mixedFreight) ? mixedFreight : undefined,
    mixedPlan: true
  };
  const multi = {
    boxes: fatalOversize ? -1 : packedBoxes.length,
    firstBox: packedBoxes[0],
    packedBoxes,
    detailedBoxLimit: MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed: 0,
    estimated: false,
    fatalOversize,
    balanceBlocked
  };
  const units = packedBoxes.flatMap((box) => box.placed.map(copyUnit));
  const evaluation = buildEvaluation(mixedContainer, units, total, utilizationPercent, globalGapCm, multi);
  evaluation.isMixedPlan = true;
  const totalUsableVolume = packedBoxes.reduce((sum, box) => sum + volumeM3(box.container) * utilizationPercent / 100, 0);
  const totalOccupiedVolume = packedBoxes.reduce((sum, box) => sum + sumCargoVolumeM3(box.placed), 0);
  const usage = usageMetricsForPackedBoxes(mixedContainer, packedBoxes, utilizationPercent);
  evaluation.usableVolumeM3 = round(totalUsableVolume);
  evaluation.firstBoxOccupiedVolumeM3 = round(totalOccupiedVolume);
  evaluation.firstBoxRemainingVolumeM3 = round(Math.max(0, totalUsableVolume - totalOccupiedVolume));
  evaluation.usageMode = usage.mode;
  evaluation.firstBoxFillPercent = round(usage.averageFillPercent);
  evaluation.firstBoxRawFillPercent = evaluation.firstBoxFillPercent;
  evaluation.averageFillPercent = evaluation.firstBoxFillPercent;
  evaluation.firstBoxDeckAreaPercent = round(usage.firstDeckAreaPercent);
  evaluation.firstBoxLengthPercent = round(usage.firstLengthPercent);
  evaluation.averageDeckAreaPercent = round(usage.averageDeckAreaPercent);
  evaluation.mixedPlan = {
    summary: mixedPlanSummary(packedBoxes),
    boxes: packedBoxes.map((box, index) => ({
      index: index + 1,
      containerId: box.container.id,
      containerName: box.container.name,
      placedCount: sumUnitQuantity(box.placed)
    }))
  };
  evaluation.recommendation = buildRecommendation(evaluation);
  return evaluation;
}

function mixedPlanBoxContainer(container) {
  const copy = { ...container };
  delete copy.balanceSettings;
  delete copy.supportSettings;
  return copy;
}

function mixedBoxCandidateScore(container, packed, remaining, utilizationPercent, fitStatus) {
  const placedQuantity = sumUnitQuantity(packed.placed);
  const totalQuantity = Math.max(1, sumUnitQuantity(remaining));
  const placedVolume = sumCargoVolumeM3(packed.placed);
  const usableCapacity = Math.max(EPS, usageCapacity(container, utilizationPercent));
  const fillPercent = usageUsedCapacity(container, packed.placed) / usableCapacity * 100;
  const meta = equipmentMeta(container);
  const priceScore = meta.priceAvailable ? meta.referencePrice / REFERENCE_PRICE_BASE : 1000000;
  const placedRatio = placedQuantity / totalQuantity;
  const completesAll = placedQuantity >= totalQuantity;
  const underfillPenalty = completesAll ? Math.max(0, 60 - fillPercent) * 0.12 : Math.max(0, 48 - fillPercent) * 0.05;
  const blockedPenalty = fitStatus === FIT_STATUS.BALANCE_BLOCKED ? 500 : 0;
  const fillReward = Math.min(fillPercent, 88) / 100 * 1.4;
  return blockedPenalty
    + priceScore
    + underfillPenalty
    - fillReward
    - placedRatio * 1.25
    - placedVolume / Math.max(EPS, priceScore) * 0.02;
}

function mixedPlanCost(packedBoxes) {
  return packedBoxes.reduce((sum, box) => sum + equipmentMeta(box.container).costFactor, 0);
}

function mixedPlanFreightCost(packedBoxes) {
  if (!Array.isArray(packedBoxes) || !packedBoxes.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  const currencies = new Set();
  for (const box of packedBoxes) {
    const meta = equipmentMeta(box.container);
    if (!meta.priceAvailable) return Number.POSITIVE_INFINITY;
    currencies.add(meta.referenceCurrency);
    if (currencies.size > 1) return Number.POSITIVE_INFINITY;
    total += meta.referencePrice;
  }
  return total;
}

function mixedPlanSummary(packedBoxes) {
  const counts = new Map();
  packedBoxes.forEach((box) => {
    const name = box.container?.name || "箱型";
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()].map(([name, count]) => count > 1 ? `${name}×${count}` : name).join(" + ");
}

function pickMixedSeedContainer(containers) {
  return [...containers].sort((a, b) => {
    const metaA = equipmentMeta(a);
    const metaB = equipmentMeta(b);
    const classPenaltyA = metaA.equipmentClass === "FR" || metaA.equipmentClass === "RF" ? 1000 : 0;
    const classPenaltyB = metaB.equipmentClass === "FR" || metaB.equipmentClass === "RF" ? 1000 : 0;
    const scoreA = classPenaltyA - volumeM3(a);
    const scoreB = classPenaltyB - volumeM3(b);
    return scoreA - scoreB;
  })[0] || containers[0] || null;
}

function buildUnits(cargos, globalGapCm, container = null, total = null) {
  const units = [];
  const totalQuantity = total?.totalQuantity ?? cargos.reduce((sum, cargo) => sum + Math.max(0, Math.floor(Number(cargo.quantity || 0))), 0);
  const canGroup = Boolean(container) && totalQuantity >= GROUPING_MIN_TOTAL_UNITS;
  cargos.forEach((cargo, cargoIndex) => {
    const rule = cargoPackingRule(cargo);
    const gap = globalGapCm + rule.extraGapCm;
    const cargoId = cargo.id || `cargo-${cargoIndex}`;
    const quantity = Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    if (canGroup && quantity >= GROUPING_MIN_CARGO_QUANTITY) {
      units.push(...buildGroupedCargoUnits(cargo, cargoIndex, cargoId, rule, gap, globalGapCm, container, quantity));
      return;
    }

    for (let i = 0; i < quantity; i += 1) {
      units.push(makeCargoUnit(cargo, cargoIndex, cargoId, i, 1, rule, gap, globalGapCm));
    }
  });
  markHeavyUnits(units);
  return orderUnits(units, "support");
}

function cargoPackingRule(cargo = {}) {
  const legacyType = String(cargo.type || "normal").trim().toLowerCase();
  const handlingUnit = String(
    cargo?.packageInfo?.handlingUnitType
    || cargo?.packageInfo?.packageUnit
    || ""
  ).trim().toLowerCase();
  const physicalType = ["pallet", "skid", "crate", "wooden", "wooden-case"].includes(handlingUnit)
    ? "pallet"
    : legacyType === "pallet" ? "pallet" : "normal";
  const baseRule = TYPE_RULES[physicalType] || TYPE_RULES.normal;
  const nonStack = cargo.nonStack === false
    ? false
    : cargo.nonStack === true || cargo.nonStackable === true || legacyType === "nonstack";
  const keepUpright = cargo.keepUpright === false
    ? false
    : cargo.keepUpright === true || cargo.upright === true || legacyType === "upright";
  return {
    ...baseRule,
    nonStack,
    keepUpright,
    rotatable: keepUpright ? true : baseRule.rotatable,
    extraGapCm: baseRule.extraGapCm
  };
}

function markHeavyUnits(units) {
  const weights = units
    .map((unit) => Number(unit.weightKg || 0))
    .filter((weight) => weight > 0)
    .sort((a, b) => b - a);
  if (!weights.length) return units;
  const topCount = Math.max(1, Math.ceil(weights.length * HEAVY_TOP_FRACTION));
  const threshold = weights[Math.min(weights.length - 1, topCount - 1)];
  units.forEach((unit) => {
    unit.isHeavy = Number(unit.weightKg || 0) >= threshold - EPS;
  });
  return units;
}

function buildGroupedCargoUnits(cargo, cargoIndex, cargoId, rule, gap, globalGapCm, container, quantity) {
  const units = [];
  let remaining = quantity;
  let serial = 0;
  while (remaining > 0) {
    const layout = remaining > 1
      ? bestGroupLayout(cargo, rule, gap, container, Math.min(GROUPING_MAX_BLOCK_QUANTITY, remaining))
      : null;
    if (layout?.count > 1) {
      units.push(makeCargoUnit(cargo, cargoIndex, cargoId, serial, layout.count, rule, gap, globalGapCm, layout));
      remaining -= layout.count;
    } else {
      units.push(makeCargoUnit(cargo, cargoIndex, cargoId, serial, 1, rule, gap, globalGapCm));
      remaining -= 1;
    }
    serial += 1;
  }
  return units;
}

function bestGroupLayout(cargo, rule, gap, container, maxCount) {
  const itemLength = Number(cargo.lengthCm) + gap;
  const itemWidth = Number(cargo.widthCm) + gap;
  const itemHeight = Number(cargo.heightCm);
  if (itemHeight > containerHeightLimit(container) + EPS) return null;

  let best = null;
  for (let count = maxCount; count >= 2; count -= 1) {
    for (let rows = 1; rows <= count; rows += 1) {
      if (count % rows !== 0) continue;
      const cols = count / rows;
      const lengthCm = itemLength * cols;
      const widthCm = itemWidth * rows;
      if (!flatBlockFits(container, lengthCm, widthCm, itemHeight, rule.rotatable)) continue;
      const score = Math.abs(lengthCm - widthCm) + Math.max(lengthCm, widthCm) * 0.02;
      if (!best || count > best.count || (count === best.count && score < best.score)) {
        best = { count, cols, rows, score };
      }
    }
    if (best?.count === count) break;
  }
  return best;
}

function flatBlockFits(container, lengthCm, widthCm, heightCm, rotatable) {
  const heightLimit = containerHeightLimit(container);
  const fits = lengthCm <= container.lengthCm + EPS && widthCm <= container.widthCm + EPS && heightCm <= heightLimit + EPS;
  const rotatedFits = rotatable && widthCm <= container.lengthCm + EPS && lengthCm <= container.widthCm + EPS && heightCm <= heightLimit + EPS;
  return fits || rotatedFits;
}

function makeCargoUnit(cargo, cargoIndex, cargoId, itemIndex, groupQuantity, rule, gap, globalGapCm, layout = null) {
  const cols = layout?.cols || 1;
  const rows = layout?.rows || 1;
  const baseLengthCm = Number(cargo.lengthCm) * cols;
  const baseWidthCm = Number(cargo.widthCm) * rows;
  const baseHeightCm = Number(cargo.heightCm);
  const physicalLengthCm = baseLengthCm + gap * Math.max(0, cols - 1);
  const physicalWidthCm = baseWidthCm + gap * Math.max(0, rows - 1);
  const occupiedLengthCm = physicalLengthCm + gap;
  const occupiedWidthCm = physicalWidthCm + gap;
  const unit = {
    unitKey: groupQuantity > 1 ? `${cargoId}-g${itemIndex}-x${groupQuantity}` : `${cargoId}-${itemIndex}`,
    cargoId,
    cargoIndex,
    itemIndex,
    name: cargoDisplayName(cargo),
    baseName: cargo.name,
    model: cargo.model || "",
    color: cargo.color || COLORS[cargoIndex % COLORS.length],
    type: cargo.type || "normal",
    baseLengthCm,
    baseWidthCm,
    baseHeightCm,
    lengthCm: occupiedLengthCm,
    widthCm: occupiedWidthCm,
    heightCm: Number(cargo.heightCm),
    physicalLengthCm,
    physicalWidthCm,
    physicalHeightCm: baseHeightCm,
    canonicalPhysicalLengthCm: physicalLengthCm,
    canonicalPhysicalWidthCm: physicalWidthCm,
    canonicalPhysicalHeightCm: baseHeightCm,
    canonicalOccupiedLengthCm: occupiedLengthCm,
    canonicalOccupiedWidthCm: occupiedWidthCm,
    canonicalOccupiedHeightCm: baseHeightCm,
    x: 0,
    y: 0,
    z: 0,
    weightKg: Number(cargo.weightKg || 0) * groupQuantity,
    rotatable: rule.rotatable,
    nonStack: rule.nonStack,
    keepUpright: rule.keepUpright,
    extraGapCm: rule.extraGapCm,
    globalGapCm,
    verticalGapCm: 0,
    gapCm: gap,
    horizontalGapCm: gap,
    groupQuantity,
    groupCols: cols,
    groupRows: rows,
    packedLengthCm: occupiedLengthCm,
    packedWidthCm: occupiedWidthCm,
    packedHeightCm: Number(cargo.heightCm),
    volumeM3: Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) * groupQuantity / 1_000_000
  };
  unit.orientations = generateOrientations(unit);
  return unit;
}

function generateOrientations(unit, options = {}) {
  const gap = Number(unit.gapCm || unit.horizontalGapCm || 0);
  const grouped = unitQuantity(unit) > 1;
  const cols = Math.max(1, Math.floor(Number(unit.groupCols || 1)));
  const rows = Math.max(1, Math.floor(Number(unit.groupRows || 1)));
  const singleLength = singleRawLengthCm(unit);
  const singleWidth = singleRawWidthCm(unit);
  const singleHeight = singleRawHeightCm(unit);
  const rawLength = grouped
    ? Number(unit.canonicalPhysicalLengthCm ?? (singleLength * cols + gap * Math.max(0, cols - 1)))
    : singleLength;
  const rawWidth = grouped
    ? Number(unit.canonicalPhysicalWidthCm ?? (singleWidth * rows + gap * Math.max(0, rows - 1)))
    : singleWidth;
  const rawHeight = grouped
    ? Number(unit.canonicalPhysicalHeightCm ?? singleHeight)
    : singleHeight;
  const canonicalOccupiedLengthCm = grouped
    ? Number(unit.canonicalOccupiedLengthCm ?? unit.packedLengthCm ?? (rawLength + gap))
    : rawLength + gap;
  const canonicalOccupiedWidthCm = grouped
    ? Number(unit.canonicalOccupiedWidthCm ?? unit.packedWidthCm ?? (rawWidth + gap))
    : rawWidth + gap;
  const make = (
    physicalLengthCm,
    physicalWidthCm,
    physicalHeightCm,
    lengthAxis,
    widthAxis,
    heightAxis,
    occupiedLengthCm = physicalLengthCm + gap,
    occupiedWidthCm = physicalWidthCm + gap
  ) => {
    const orientationKey = `${axisOrientationCode(lengthAxis)}${axisOrientationCode(widthAxis)}${axisOrientationCode(heightAxis)}`;
    return {
      lengthCm: occupiedLengthCm,
      widthCm: occupiedWidthCm,
      heightCm: physicalHeightCm,
      physicalLengthCm,
      physicalWidthCm,
      physicalHeightCm,
      lengthAxis,
      widthAxis,
      heightAxis,
      orientationKey,
      groupRotated: grouped && orientationKey === "WLH"
    };
  };

  const base = [
    make(
      rawLength,
      rawWidth,
      rawHeight,
      AXIS_LENGTH,
      AXIS_WIDTH,
      AXIS_HEIGHT,
      canonicalOccupiedLengthCm,
      canonicalOccupiedWidthCm
    )
  ];
  if (unit.keepUpright || (grouped && unit.rotatable)) {
    base.push(
      make(
        rawWidth,
        rawLength,
        rawHeight,
        AXIS_WIDTH,
        AXIS_LENGTH,
        AXIS_HEIGHT,
        canonicalOccupiedWidthCm,
        canonicalOccupiedLengthCm
      )
    );
  } else if (unit.rotatable) {
    base.push(
      make(rawWidth, rawLength, rawHeight, AXIS_WIDTH, AXIS_LENGTH, AXIS_HEIGHT),
      make(rawLength, rawHeight, rawWidth, AXIS_LENGTH, AXIS_HEIGHT, AXIS_WIDTH),
      make(rawHeight, rawLength, rawWidth, AXIS_HEIGHT, AXIS_LENGTH, AXIS_WIDTH),
      make(rawWidth, rawHeight, rawLength, AXIS_WIDTH, AXIS_HEIGHT, AXIS_LENGTH),
      make(rawHeight, rawWidth, rawLength, AXIS_HEIGHT, AXIS_WIDTH, AXIS_LENGTH)
    );
  }

  const seen = new Set();
  const orientations = base.filter((dims) => {
    const key = `${round3(dims.lengthCm)}/${round3(dims.widthCm)}/${round3(dims.heightCm)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return orientations.sort((a, b) => {
    if (options.preferVertical || shouldPreferVertical(unit)) {
      const heightDiff = b.heightCm - a.heightCm;
      if (Math.abs(heightDiff) > EPS) return heightDiff;
    }
    const areaDiff = b.lengthCm * b.widthCm - a.lengthCm * a.widthCm;
    if (Math.abs(areaDiff) > EPS) return areaDiff;
    return a.heightCm - b.heightCm;
  });
}

function axisOrientationCode(axis) {
  if (axis === AXIS_LENGTH) return "L";
  if (axis === AXIS_WIDTH) return "W";
  if (axis === AXIS_HEIGHT) return "H";
  return "?";
}

function packContainer(container, units) {
  const { stackable, nonStack } = splitUnitsForFinalNonStackPass(units);
  const stackableContainer = container;
  const baseAttempts = [];
  const attempts = [];
  let rejectedByBalance = 0;
  for (let strategyIndex = 0; strategyIndex < SEARCH_STRATEGIES.length; strategyIndex += 1) {
    const strategy = SEARCH_STRATEGIES[strategyIndex];
    traceProgress({
      phase: "strategy",
      strategyIndex: strategyIndex + 1,
      strategyCount: SEARCH_STRATEGIES.length,
      strategyId: strategy.id,
      stageFraction: 0.28 + strategyIndex / Math.max(1, SEARCH_STRATEGIES.length) * 0.26
    });
    traceDecision({
      phase: "strategy",
      level: "summary",
      text: `${container.name} · base strategy "${strategy.id}" started.`
    });
    const ordered = orderUnits(stackable, strategy.unitOrder);
    const stackableAttempt = packLayerLaff(stackableContainer, ordered, strategy);
    const attempt = finalizeWithDeferredNonStack(container, stackableAttempt, nonStack, strategy, rejectedByBalance);
    if (attempt.balanceValidation?.severity === "red") rejectedByBalance += 1;
    baseAttempts.push(stackableAttempt);
    attempts.push(attempt);
    traceDecision({
      phase: "strategy",
      level: "summary",
      text: `${container.name} · base strategy "${strategy.id}" placed ${sumUnitQuantity(attempt.placed)} pcs, remaining ${sumUnitQuantity(attempt.unplaced)} pcs, ${attempt.strategySummary?.layerCount || 0} layers, balance ${balanceDecisionText(attempt.balanceValidation)}.`
    });
    const rowFillAttempted = SEARCH_STRATEGIES
      .slice(0, strategyIndex + 1)
      .some((candidate) => usesLayerRowFill(candidate));
    if (!attempt.unplaced.length && attempt.balanceValidation?.severity !== "red" && rowFillAttempted) break;
  }

  const baseBest = selectBestAttempt(container, baseAttempts);
  if (baseBest?.placed?.length) {
    const bestStrategy = strategyById(baseBest.strategyId);
    traceProgress({
      phase: "repair",
      strategyId: bestStrategy.id,
      stageFraction: 0.76
    });
    let gapSwapped = optimizeLowerGapSwaps(stackableContainer, baseBest, bestStrategy);
    gapSwapped = optimizeEdgeOrientationRows(stackableContainer, gapSwapped, bestStrategy);
    gapSwapped = optimizeVerticalTailFills(stackableContainer, gapSwapped, bestStrategy);
    gapSwapped = optimizeLowerGapSwaps(stackableContainer, gapSwapped, bestStrategy);
    gapSwapped = optimizeEdgeOrientationRows(stackableContainer, gapSwapped, bestStrategy);
    gapSwapped = optimizeVerticalTailFills(stackableContainer, gapSwapped, bestStrategy);
    gapSwapped = optimizeSparseTailSupport(stackableContainer, gapSwapped, bestStrategy);
    if (gapSwapped !== baseBest) {
      const finalGapSwapped = finalizeWithDeferredNonStack(container, gapSwapped, nonStack, bestStrategy, rejectedByBalance);
      if (finalGapSwapped.balanceValidation?.severity === "red") rejectedByBalance += 1;
      attempts.push(finalGapSwapped);
      traceDecision({
        phase: "repair",
        level: "summary",
        text: `${container.name} - ${bestStrategy.id}: lower-gap/support tuning moved ${gapSwapped.strategySummary?.lowerGapSwapCount || 0} edge pcs down, filled ${gapSwapped.strategySummary?.verticalTailFillCount || 0} vertical tail slots, spread ${gapSwapped.strategySummary?.sparseTailSpreadCount || 0} tail pcs, and backfilled ${gapSwapped.strategySummary?.sparseTailBackfillPlacedCount || 0} pcs.`
      });
    }
  }
  if (baseBest?.unplaced?.length) {
    const bestStrategy = strategyById(baseBest.strategyId);
    traceProgress({
      phase: "repair",
      strategyId: bestStrategy.id,
      remainingUnits: sumUnitQuantity(baseBest.unplaced),
      stageFraction: 0.82
    });
    traceDecision({
      phase: "repair",
      level: "summary",
      text: `${container.name} · refine only the best base strategy "${bestStrategy.id}" with block downgrade and local backfill.`
    });
    const beforeRefine = sumUnitQuantity(baseBest.unplaced);
    let refined = enhanceWithBlockDowngrade(stackableContainer, baseBest, bestStrategy);
    if (refined.unplaced.length) {
      refined = repairWithLocalSearch(stackableContainer, refined, orderUnits(refined.unplaced.map(stripPlacement), bestStrategy.unitOrder), bestStrategy);
    }
    refined = optimizeLowerGapSwaps(stackableContainer, refined, bestStrategy);
    refined = optimizeEdgeOrientationRows(stackableContainer, refined, bestStrategy);
    refined = optimizeVerticalTailFills(stackableContainer, refined, bestStrategy);
    refined = optimizeLowerGapSwaps(stackableContainer, refined, bestStrategy);
    refined = optimizeEdgeOrientationRows(stackableContainer, refined, bestStrategy);
    refined = optimizeVerticalTailFills(stackableContainer, refined, bestStrategy);
    refined = optimizeSparseTailSupport(stackableContainer, refined, bestStrategy);
    const finalRefined = finalizeWithDeferredNonStack(container, refined, nonStack, bestStrategy, rejectedByBalance);
    if (finalRefined.balanceValidation?.severity === "red") rejectedByBalance += 1;
    attempts.push(finalRefined);
    traceDecision({
      phase: "repair",
      level: "summary",
      text: `${container.name} · refined "${bestStrategy.id}": before ${beforeRefine} pcs stackable remaining, after ${sumUnitQuantity(finalRefined.unplaced)} pcs total remaining, block passes ${finalRefined.strategySummary?.blockDowngradePasses || 0}, refill passes ${finalRefined.strategySummary?.refillPasses || 0}, sparse tail spread ${finalRefined.strategySummary?.sparseTailSpreadCount || 0} pcs.`
    });
  }

  const accepted = attempts.filter((attempt) => attempt.balanceValidation?.severity !== "red");
  if (accepted.length) return accepted.sort(comparePackAttempt(container))[0];

  const blocked = attempts
    .filter((attempt) => attempt.placed.length)
    .sort(comparePackAttempt(container))[0];
  if (blocked) {
    blocked.strategySummary = {
      ...blocked.strategySummary,
      balanceRejected: true,
      balanceRejectedCount: rejectedByBalance,
      complianceBlocked: true
    };
    return blocked;
  }

  const fallback = makePackedBox([], units, { id: "none", name: "balance rejected" }, {
    localSearchPasses: 0,
    repairedCount: 0,
    balanceRejectedCount: rejectedByBalance
  });
  fallback.balanceValidation = emptyWeightBalance(container);
  fallback.strategySummary.balanceRejectedCount = rejectedByBalance;
  return fallback;
}

function splitUnitsForFinalNonStackPass(units) {
  const stackable = [];
  const nonStack = [];
  for (const unit of units || []) {
    const clean = stripPlacement(unit);
    if (clean.nonStack) nonStack.push(clean);
    else stackable.push(clean);
  }
  return { stackable, nonStack };
}

function finalizeWithDeferredNonStack(container, stackableAttempt, deferredNonStack, strategy, rejectedByBalance = 0) {
  let placed = (stackableAttempt.placed || []).filter((unit) => !unit.nonStack).map(copyUnit);
  const stackableUnplaced = (stackableAttempt.unplaced || []).filter((unit) => !unit.nonStack).map(stripPlacement);
  let nonStackTopPlacedCount = 0;
  let nonStackUnplaced = [];
  let nonStackDisplacementSwapCount = 0;
  let nonStackDisplacementPlacedCount = 0;

  if (deferredNonStack.length) {
    const nonStackResult = placeDeferredNonStackOnTop(container, placed, deferredNonStack, strategy);
    nonStackTopPlacedCount = nonStackResult.placedCount;
    nonStackUnplaced = nonStackResult.unplaced.map(stripPlacement);
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} - ${strategy.name} - global non-stack final pass: ${nonStackTopPlacedCount}/${sumUnitQuantity(deferredNonStack)} non-stack pcs placed after all stackable search/refill stages.`
    });
  }
  if (nonStackUnplaced.length && placed.some((unit) => unit.nonStack)) {
    const displaced = optimizeDeferredNonStackDisplacement(container, placed, nonStackUnplaced, strategy);
    if (displaced.placedCount > 0) {
      placed = displaced.placed;
      nonStackUnplaced = displaced.unplaced.map(stripPlacement);
      nonStackTopPlacedCount += displaced.placedCount;
      nonStackDisplacementSwapCount = displaced.swapCount;
      nonStackDisplacementPlacedCount = displaced.placedCount;
      traceDecision({
        phase: "repair",
        level: "summary",
        text: `${container.name} - ${strategy.name} - non-stack displacement: swapped ${nonStackDisplacementSwapCount} top stackable pcs into lower non-stack pockets and placed ${nonStackDisplacementPlacedCount} more non-stack pcs.`
      });
    }
  }

  const valid = validateAllPlacements(container, placed);
  const attempt = makePackedBox(valid ? placed : stackableAttempt.placed.map(copyUnit), valid ? [...stackableUnplaced, ...nonStackUnplaced] : [
    ...stackableUnplaced,
    ...deferredNonStack.map(stripPlacement)
  ], {
    id: stackableAttempt.strategyId || strategy.id,
    name: stackableAttempt.strategyName || strategy.name
  }, {
    ...(stackableAttempt.strategySummary || {}),
    nonStackTopPlacedCount,
    nonStackDisplacementSwapCount,
    nonStackDisplacementPlacedCount,
    finalNonStackPass: deferredNonStack.length ? 1 : 0,
    layerCount: countLayers(valid ? placed : stackableAttempt.placed)
  });

  return finalizeAttempt(container, attempt, strategy, rejectedByBalance);
}

function finalizeAttempt(container, attempt, strategy, rejectedByBalance = 0) {
  let next = centerPackedLayout(container, attempt, strategy);
  next = withBalanceValidation(container, next, rejectedByBalance);
  return next;
}

function selectBestAttempt(container, attempts) {
  const accepted = attempts.filter((attempt) => attempt.balanceValidation?.severity !== "red");
  const pool = accepted.length ? accepted : attempts.filter((attempt) => attempt.placed.length);
  return pool.sort(comparePackAttempt(container))[0] || attempts[0] || null;
}

function strategyById(strategyId) {
  return SEARCH_STRATEGIES.find((strategy) => strategy.id === strategyId) || SEARCH_STRATEGIES[0];
}

function packLayerLaff(container, units, strategy, fixedPlaced = []) {
  if (isFlatRackUsage(container) && !fixedPlaced.length) {
    return packFlatRackDeckFirst(container, units, strategy);
  }
  return packLayerLaffCore(container, units, strategy, fixedPlaced);
}

function packFlatRackDeckFirst(container, units, strategy) {
  const placed = [];
  const pending = [];
  let deckPlacedCount = 0;
  const ordered = orderUnits(units.map(stripPlacement), strategy.unitOrder);

  for (const unit of ordered) {
    const placement = packExtremePoint(container, placed, unit, strategy, { floorOnly: true, preferDeckSpread: true });
    if (placement) {
      placed.push(applyPlacement(unit, placement));
      deckPlacedCount += unitQuantity(unit);
    } else {
      pending.push(unit);
    }
  }

  if (!pending.length) {
    return makePackedBox(placed, [], strategy, {
      localSearchPasses: 0,
      repairedCount: 0,
      deckFloorPlacedCount: deckPlacedCount,
      layerCount: countLayers(placed)
    });
  }

  const layered = packLayerLaffCore(container, pending, strategy, placed);
  layered.strategySummary = {
    ...layered.strategySummary,
    deckFloorPlacedCount: deckPlacedCount
  };
  traceDecision({
    phase: "layer",
    level: "summary",
    text: `${container.name} · ${strategy.name} · \u5e73\u677f\u7532\u677f\u4f18\u5148\uff1a\u9996\u5c42\u5148\u94fa\u5165 ${deckPlacedCount} \u4ef6\uff0c\u518d\u5bf9\u5269\u4f59 ${sumUnitQuantity(pending)} \u4ef6\u5c1d\u8bd5\u4e0a\u5c42/\u56de\u586b\u3002`
  });
  return layered;
}

function packLayerLaffCore(container, units, strategy, fixedPlaced = []) {
  const placed = fixedPlaced.map(copyUnit);
  const unplaced = [];
  const originalActive = units.map(stripPlacement);
  const deferredNonStack = [];
  const active = [];
  for (const unit of originalActive) {
    const clean = copyUnit(unit);
    if (clean.nonStack) deferredNonStack.push(clean);
    else active.push(clean);
  }
  const stackableContainer = container;
  let nextLayerBottom = 0;
  let layerNo = countLayers(placed);
  let layerTailSpreadCount = 0;
  let layerTailSupportGain = 0;

  while (active.length) {
    const seedIndex = pickLayerSeedIndex(active, stackableContainer, placed, strategy, { layerBottom: nextLayerBottom });
    if (seedIndex < 0) {
      unplaced.push(...active.splice(0));
      break;
    }

    const seed = active.splice(seedIndex, 1)[0];
    const seedPlacement = packExtremePoint(stackableContainer, placed, seed, strategy, { layerBottom: nextLayerBottom });
    if (!seedPlacement) {
      unplaced.push(seed);
      continue;
    }

    const placedSeed = applyPlacement(seed, seedPlacement);
    placed.push(placedSeed);
    const layerBottom = placedSeed.z;
    let layerTop = placedSeed.z + placedSeed.heightCm;
    layerNo += 1;
    let layerPlacedQuantity = unitQuantity(placedSeed);
    traceProgress({
      phase: "layer",
      layerNo,
      placedUnits: sumUnitQuantity(placed),
      remainingUnits: sumUnitQuantity(active),
      stageFraction: Math.min(0.72, 0.48 + layerNo * 0.035)
    });
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} · ${strategy.name} · 第 ${layerNo} 层选种子：${decisionUnitName(seed)} ${decisionDims(seedPlacement)}，底面积 ${round(seedPlacement.lengthCm * seedPlacement.widthCm)}cm²，放置 ${decisionPoint(seedPlacement)}，层高上限 z=${round(layerTop)}cm。`
    });

    let changed = true;
    while (changed) {
      changed = false;
      const layerCandidates = orderLayerCandidates(active, layerBottom, layerTop, strategy, placedSeed);
      for (const unit of layerCandidates) {
        const index = active.findIndex((item) => item.unitKey === unit.unitKey);
        if (index < 0) continue;
        const placement = packExtremePoint(stackableContainer, placed, unit, strategy, { layerBottom, baseZOnly: true });
        if (!placement) continue;
        active.splice(index, 1);
        placed.push(applyPlacement(unit, placement));
        layerTop = Math.max(layerTop, placement.z + placement.heightCm);
        layerPlacedQuantity += unitQuantity(unit);
        traceDecision({
          phase: "placement",
          level: "detail",
          text: `${container.name} · 第 ${layerNo} 层装入：${decisionUnitName(unit)} ${decisionDims(placement)} → ${decisionPoint(placement)}，不超过当前层高 ${round(layerTop - layerBottom)}cm。`
        });
        changed = true;
      }
    }

    const remainingHeight = containerHeightLimit(stackableContainer) - layerBottom;
    const skippedByHeight = active.filter((unit) =>
      !unit.orientations.some((dims) => dims.heightCm <= remainingHeight + EPS)
    ).length;
    if (skippedByHeight) {
      traceDecision({
        phase: "layer",
        level: "summary",
        text: `${container.name} · 第 ${layerNo} 层跳过 ${skippedByHeight} 个较高搜索单元：高度超过本层 ${round(layerTop - layerBottom)}cm，保留到下一层继续作为候选。`
      });
    }
    const layerSpread = optimizeCurrentLayerSparseTailSupport(stackableContainer, placed, strategy, layerBottom);
    if (layerSpread?.spreadCount) {
      placed.splice(0, placed.length, ...layerSpread.placed);
      layerTailSpreadCount += layerSpread.spreadCount;
      layerTailSupportGain += layerSpread.supportGain;
      traceDecision({
        phase: "repair",
        level: "summary",
        text: `${container.name} · \u7b2c ${layerNo} \u5c42\u672b\u6392\u652f\u6491\u4f18\u5316\uff1a\u644a\u5f00 ${layerSpread.spreadCount} \u4ef6\u5c3e\u6392\u8d27\u7269\uff0c\u589e\u52a0\u7ea6 ${round(layerSpread.supportGain)}cm2 \u4e0a\u5c42\u843d\u811a\u9762\u3002`
      });
    }
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} · 第 ${layerNo} 层完成：本层装入 ${layerPlacedQuantity} 件，累计 ${sumUnitQuantity(placed)} 件，剩余 ${sumUnitQuantity(active)} 件；下一层从 z=${round(layerTop)}cm 开始。`
    });
    nextLayerBottom = Math.max(nextLayerBottom, layerTop);
  }

  let nonStackTopPlacedCount = 0;
  if (deferredNonStack.length) {
    const nonStackResult = placeDeferredNonStackOnTop(container, placed, deferredNonStack, strategy);
    nonStackTopPlacedCount = nonStackResult.placedCount;
    unplaced.push(...nonStackResult.unplaced);
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} · ${strategy.name} · non-stack deferred: stackable cargo first, then ${nonStackTopPlacedCount}/${sumUnitQuantity(deferredNonStack)} non-stack pcs placed on top candidates.`
    });
  }

  const valid = validateAllPlacements(container, placed);
  return makePackedBox(valid ? placed : fixedPlaced.map(copyUnit), valid ? unplaced : originalActive, strategy, {
    localSearchPasses: 0,
    repairedCount: 0,
    fixedPlacedCount: fixedPlaced.length,
    layerCount: countLayers(placed),
    nonStackTopPlacedCount,
    sparseTailSpreadCount: layerTailSpreadCount,
    sparseTailSupportGain: layerTailSupportGain
  });
}

function placeDeferredNonStackOnTop(container, placed, units, strategy) {
  let pending = orderUnits(units.map(stripPlacement), strategy.unitOrder);
  let placedCount = 0;

  const runPass = (items) => {
    const next = [];
    for (const unit of orderUnits(items.map(stripPlacement), strategy.unitOrder)) {
      const placement = findTopExposedPlacement(container, placed, unit, strategy);
      if (placement) {
        placed.push(applyPlacement(unit, placement));
        placedCount += unitQuantity(unit);
      } else {
        next.push(unit);
      }
    }
    return next;
  };

  pending = runPass(pending);
  if (pending.some((unit) => unitQuantity(unit) > 2)) {
    pending = runPass(downgradeUnits(pending, 2, container));
  }
  if (pending.some((unit) => unitQuantity(unit) > 1)) {
    pending = runPass(downgradeUnits(pending, 1, container));
  }

  return { placedCount, unplaced: pending };
}

function optimizeDeferredNonStackDisplacement(container, placed, nonStackUnplaced, strategy) {
  let currentPlaced = placed.map(copyUnit);
  let pending = nonStackUnplaced.map(stripPlacement);
  let placedCount = 0;
  let swapCount = 0;

  for (let pass = 0; pass < NON_STACK_DISPLACEMENT_MAX_SWAPS && pending.length; pass += 1) {
    const candidate = bestDeferredNonStackDisplacement(container, currentPlaced, pending, strategy);
    if (!candidate) break;
    currentPlaced = candidate.placed.map(copyUnit);
    pending = candidate.unplaced.map(stripPlacement);
    placedCount += candidate.placedCount;
    swapCount += 1;
  }

  return { placed: currentPlaced, unplaced: pending, placedCount, swapCount };
}

function bestDeferredNonStackDisplacement(container, placed, pending, strategy) {
  const movers = nonStackDisplacementMoverCandidates(container, placed);
  const receivers = nonStackDisplacementReceiverCandidates(placed);
  const beforePending = sumUnitQuantity(pending);
  let best = null;

  for (const receiver of receivers) {
    for (const mover of movers) {
      if (mover.unitKey === receiver.unitKey) continue;
      if (Number(mover.z || 0) <= Number(receiver.z || 0) + LOWER_GAP_SWAP_MIN_DROP_CM) continue;
      const candidate = buildNonStackDisplacementCandidate(container, placed, pending, mover, receiver, strategy, beforePending);
      if (!candidate) continue;
      if (!best || candidate.score > best.score + EPS) best = candidate;
    }
  }

  return best;
}

function nonStackDisplacementMoverCandidates(container, placed) {
  const top = maxTop(placed);
  const minTop = Math.max(0, top - 55);
  return placed
    .filter((unit) =>
      !unit.nonStack
      && unit.rotatable
      && unitQuantity(unit) === 1
      && Number(unit.z || 0) + Number(unit.heightCm || 0) >= minTop - EPS
      && !hasAnyBoxInColumnAbove(unit, placed)
      && fitsContainerDims(container, unit)
    )
    .sort((a, b) => {
      const topDiff = (Number(b.z || 0) + Number(b.heightCm || 0)) - (Number(a.z || 0) + Number(a.heightCm || 0));
      if (Math.abs(topDiff) > EPS) return topDiff;
      return unitVolumeCm3(a) - unitVolumeCm3(b);
    })
    .slice(0, NON_STACK_DISPLACEMENT_MAX_MOVERS);
}

function nonStackDisplacementReceiverCandidates(placed) {
  return placed
    .filter((unit) =>
      unit.nonStack
      && unitQuantity(unit) === 1
      && !hasAnyBoxInColumnAbove(unit, placed)
    )
    .sort((a, b) => {
      const zDiff = Number(a.z || 0) - Number(b.z || 0);
      if (Math.abs(zDiff) > EPS) return zDiff;
      const topAreaDiff = (Number(b.lengthCm || 0) * Number(b.widthCm || 0)) - (Number(a.lengthCm || 0) * Number(a.widthCm || 0));
      if (Math.abs(topAreaDiff) > EPS) return topAreaDiff;
      return Number(a.y || 0) - Number(b.y || 0);
    })
    .slice(0, NON_STACK_DISPLACEMENT_MAX_RECEIVERS);
}

function buildNonStackDisplacementCandidate(container, placed, pending, mover, receiver, strategy, beforePending) {
  const movingKeys = new Set([mover.unitKey, receiver.unitKey]);
  const basePlaced = placed
    .filter((unit) => !movingKeys.has(unit.unitKey))
    .map(copyUnit);
  const replacement = bestStackablePlacementForNonStackPocket(container, basePlaced, mover, receiver, strategy);
  if (!replacement) return null;

  const movedStackable = {
    ...applyPlacement(stripPlacement(mover), replacement),
    supportRatioOverride: mover.supportRatioOverride
  };
  const withMovedStackable = [...basePlaced, movedStackable];
  const rehomedNonStackPlacement = bestNonStackPlacementForFreedStackablePocket(container, withMovedStackable, receiver, mover, strategy);
  if (!rehomedNonStackPlacement) return null;
  const withRehomedNonStack = [
    ...withMovedStackable,
    applyPlacement(stripPlacement(receiver), rehomedNonStackPlacement)
  ];
  if (!validateAllPlacements(container, withRehomedNonStack)) return null;

  const retry = placeOneDeferredNonStackOnTop(container, withRehomedNonStack, pending, strategy);
  if (!retry || !validateAllPlacements(container, retry.placed)) return null;
  const placedCount = beforePending - sumUnitQuantity(retry.unplaced);
  if (placedCount <= 0) return null;
  const dropDepth = Number(mover.z || 0) - Number(receiver.z || 0);
  const supportScore = supportCoverageRatio(replacement, basePlaced);
  return {
    placed: retry.placed,
    unplaced: retry.unplaced.map(stripPlacement),
    placedCount,
    score: placedCount * 1_000_000 + dropDepth * 10_000 + supportScore * 1000 - Number(receiver.z || 0)
  };
}

function placeOneDeferredNonStackOnTop(container, placed, pending, strategy) {
  const basePlaced = placed.map(copyUnit);
  const ordered = orderUnits(pending.map(stripPlacement), strategy.unitOrder);
  const trials = ordered.slice(0, 1);
  for (const unit of trials) {
    const candidatePlaced = basePlaced.map(copyUnit);
    const placement = findTopExposedPlacement(container, candidatePlaced, unit, strategy);
    if (!placement) continue;
    candidatePlaced.push(applyPlacement(unit, placement));
    const remaining = ordered
      .filter((item) => item.unitKey !== unit.unitKey)
      .map(stripPlacement);
    return { placed: candidatePlaced, unplaced: remaining, placedCount: unitQuantity(unit) };
  }
  return null;
}

function bestNonStackPlacementForFreedStackablePocket(container, placed, nonStackUnit, freedPocket, strategy) {
  const unit = stripPlacement(nonStackUnit);
  const supportRatio = supportRatioForUnit(container, unit, strategy);
  const pocketRect = {
    x: Number(freedPocket.x || 0),
    y: Number(freedPocket.y || 0),
    lengthCm: Number(freedPocket.lengthCm || 0),
    widthCm: Number(freedPocket.widthCm || 0)
  };
  let best = null;

  for (const dims of generateOrientations(unit, { preferVertical: strategy.blueVertical })) {
    if (!fitsContainerDims(container, dims)) continue;
    const xs = pocketCoordinateCandidates(pocketRect.x, pocketRect.lengthCm, dims.lengthCm, Number(container.lengthCm || 0));
    const ys = pocketCoordinateCandidates(pocketRect.y, pocketRect.widthCm, dims.widthCm, Number(container.widthCm || 0));
    for (const x of xs) {
      for (const y of ys) {
        const placement = { ...dims, x: round3(x), y: round3(y), z: round3(freedPocket.z) };
        const overlap = overlapRect(
          { x: placement.x, y: placement.y, lengthCm: placement.lengthCm, widthCm: placement.widthCm },
          pocketRect
        );
        if (!overlap) continue;
        const validation = validatePlacement(container, placed, unit, placement, supportRatio);
        if (!validation.valid || hasAnyBoxInColumnAbove(placement, placed)) continue;
        const overlapArea = overlap.lengthCm * overlap.widthCm;
        const supportScore = supportCoverageRatio(placement, placed);
        const anchorPenalty = Math.abs(placement.x - pocketRect.x) + Math.abs(placement.y - pocketRect.y);
        const score = supportScore * 100000 + overlapArea * 10 - anchorPenalty - placement.z;
        if (!best || score > best.score + EPS) best = { ...placement, score };
      }
    }
  }

  return best;
}

function bestStackablePlacementForNonStackPocket(container, placed, mover, receiver, strategy) {
  const unit = stripPlacement(mover);
  const supportRatio = supportRatioForUnit(container, mover, strategy);
  const receiverRect = {
    x: Number(receiver.x || 0),
    y: Number(receiver.y || 0),
    lengthCm: Number(receiver.lengthCm || 0),
    widthCm: Number(receiver.widthCm || 0)
  };
  let best = null;

  for (const dims of generateOrientations(unit, { preferVertical: strategy.blueVertical })) {
    if (!fitsContainerDims(container, dims)) continue;
    const xs = pocketCoordinateCandidates(receiverRect.x, receiverRect.lengthCm, dims.lengthCm, Number(container.lengthCm || 0));
    const ys = pocketCoordinateCandidates(receiverRect.y, receiverRect.widthCm, dims.widthCm, Number(container.widthCm || 0));
    for (const x of xs) {
      for (const y of ys) {
        const placement = { ...dims, x: round3(x), y: round3(y), z: round3(receiver.z) };
        const overlap = overlapRect(
          { x: placement.x, y: placement.y, lengthCm: placement.lengthCm, widthCm: placement.widthCm },
          receiverRect
        );
        if (!overlap) continue;
        const validation = validatePlacement(container, placed, unit, placement, supportRatio);
        if (!validation.valid) continue;
        const supportScore = supportCoverageRatio(placement, placed);
        const overlapArea = overlap.lengthCm * overlap.widthCm;
        const centerY = placement.y + placement.widthCm / 2;
        const interiorPenalty = Math.abs(centerY - Number(container.widthCm || 0) / 2);
        const anchorPenalty = Math.abs(placement.x - receiverRect.x) + Math.abs(placement.y - receiverRect.y);
        const score = supportScore * 100000 + overlapArea * 10 - interiorPenalty * 2 - anchorPenalty - placement.z;
        if (!best || score > best.score + EPS) best = { ...placement, score };
      }
    }
  }

  return best;
}

function pocketCoordinateCandidates(start, span, itemSpan, limit) {
  return uniqueFiniteNumbers([
    start,
    start + span - itemSpan,
    start + (span - itemSpan) / 2,
    start - Math.max(0, (itemSpan - span) / 2),
    start + Math.max(0, (span - itemSpan) / 2)
  ]).filter((value) => value >= -EPS && value + itemSpan <= limit + EPS);
}

function uniqueFiniteNumbers(values) {
  const result = [];
  for (const value of values) {
    const rounded = round3(value);
    if (!Number.isFinite(rounded)) continue;
    if (!result.some((item) => Math.abs(item - rounded) < EPS)) result.push(rounded);
  }
  return result;
}

function findTopOnlyPlacement(container, placed, unit, strategy) {
  return findTopExposedPlacement(container, placed, unit, strategy);
}

function findTopExposedPlacement(container, placed, unit, strategy) {
  const layerBottoms = topCandidateLayerBottoms(placed);
  for (const layerBottom of layerBottoms) {
    const placement = packExtremePoint(container, placed, unit, strategy, { layerBottom, denseTop: true, exposedTop: true });
    if (!placement) continue;
    const candidate = applyPlacement(unit, placement);
    if (!hasAnyBoxInColumnAbove(candidate, placed)) return placement;
  }

  const directPlacement = packExtremePoint(container, placed, unit, strategy, { denseTop: true, exposedTop: true });
  if (directPlacement) return directPlacement;
  return null;
}

function topCandidateLayerBottoms(placed) {
  if (!placed.length) return [0];
  return uniqueSorted(placed.map((box) => box.z + box.heightCm), Number.NaN)
    .filter((value) => Number.isFinite(value) && value > EPS)
    .sort((a, b) => b - a)
    .slice(0, NON_STACK_TOP_LAYER_CANDIDATES);
}

function enhanceWithBlockDowngrade(container, attempt, strategy) {
  let current = cloneAttempt(attempt);
  let best = cloneAttempt(attempt);
  let downgradePasses = 0;
  let downgradePlacedCount = 0;
  let singleBackfillPlacedCount = 0;

  const runRound = (maxGroupSize, withSingleBackfill = false) => {
    if (!current.unplaced.length) return;
    const downgraded = downgradeUnits(current.unplaced, maxGroupSize, container);
    if (!downgraded.length) return;
    const beforePlaced = sumUnitQuantity(current.placed);
    let candidate = packLayerLaff(container, orderUnits(downgraded, strategy.unitOrder), strategy, current.placed);
    if (withSingleBackfill) {
      candidate = backfillSingleUnits(container, candidate, strategy);
    }
    const placedGain = sumUnitQuantity(candidate.placed) - beforePlaced;
    if (placedGain <= 0 || !validateAllPlacements(container, candidate.placed)) return;
    downgradePasses += 1;
    downgradePlacedCount += placedGain;
    singleBackfillPlacedCount += Number(candidate.strategySummary?.singleBackfillPlacedCount || 0);
    current = candidate;
    if (comparePackAttempt(container)(candidate, best) < 0) {
      best = cloneAttempt(candidate);
    }
  };

  runRound(2, false);
  runRound(1, true);

  if (downgradePlacedCount <= 0) return attempt;
  return makePackedBox(best.placed.map(copyUnit), best.unplaced.map(stripPlacement), {
    id: best.strategyId,
    name: best.strategyName
  }, {
    ...(best.strategySummary || {}),
    blockDowngradePasses: downgradePasses,
    blockDowngradePlacedCount: downgradePlacedCount,
    singleBackfillPlacedCount
  });
}

function downgradeUnits(units, maxGroupSize, container) {
  const result = [];
  let serial = 0;
  for (const unit of units) {
    const clean = stripPlacement(unit);
    const quantity = unitQuantity(clean);
    if (quantity <= maxGroupSize) {
      result.push(clean);
      continue;
    }
    let remaining = quantity;
    while (remaining > 0) {
      const count = Math.min(maxGroupSize, remaining);
      const derived = makeDerivedGroupUnit(clean, count, container, serial);
      if (derived) {
        result.push(derived);
      } else if (count > 1) {
        for (let i = 0; i < count; i += 1) {
          const single = makeDerivedGroupUnit(clean, 1, container, `${serial}-${i}`);
          if (single) result.push(single);
        }
      }
      remaining -= count;
      serial += 1;
    }
  }
  return markHeavyUnits(result);
}

function makeDerivedGroupUnit(source, count, container, serial) {
  const quantity = Math.max(1, Math.floor(Number(count || 1)));
  const layout = bestDerivedGroupLayout(source, quantity, container);
  if (!layout) return null;
  const serialNumber = Number.parseInt(String(serial), 10);
  const gap = Number(source.gapCm || 0);
  const rawLength = singleRawLengthCm(source);
  const rawWidth = singleRawWidthCm(source);
  const rawHeight = singleRawHeightCm(source);
  const heightCm = rawHeight;
  const lengthCm = (rawLength + gap) * layout.cols;
  const widthCm = (rawWidth + gap) * layout.rows;
  const physicalLengthCm = rawLength * layout.cols + gap * Math.max(0, layout.cols - 1);
  const physicalWidthCm = rawWidth * layout.rows + gap * Math.max(0, layout.rows - 1);
  const unit = {
    ...stripPlacement(source),
    unitKey: `${source.unitKey}-d${quantity}-${serial}`,
    parentUnitKey: source.parentUnitKey || source.unitKey,
    itemIndex: Number(source.itemIndex || 0) * 1000 + (Number.isFinite(serialNumber) ? serialNumber : 0),
    baseLengthCm: rawLength * layout.cols,
    baseWidthCm: rawWidth * layout.rows,
    baseHeightCm: rawHeight,
    lengthCm,
    widthCm,
    heightCm,
    physicalLengthCm,
    physicalWidthCm,
    physicalHeightCm: rawHeight,
    canonicalPhysicalLengthCm: physicalLengthCm,
    canonicalPhysicalWidthCm: physicalWidthCm,
    canonicalPhysicalHeightCm: rawHeight,
    canonicalOccupiedLengthCm: lengthCm,
    canonicalOccupiedWidthCm: widthCm,
    canonicalOccupiedHeightCm: rawHeight,
    packedLengthCm: lengthCm,
    packedWidthCm: widthCm,
    packedHeightCm: heightCm,
    weightKg: singleWeightKg(source) * quantity,
    volumeM3: singleVolumeM3(source) * quantity,
    groupQuantity: quantity,
    groupCols: layout.cols,
    groupRows: layout.rows
  };
  unit.orientations = generateOrientations(unit);
  return unit;
}

function bestDerivedGroupLayout(source, count, container) {
  const quantity = Math.max(1, Math.floor(Number(count || 1)));
  const gap = Number(source.gapCm || 0);
  const itemLength = singleRawLengthCm(source) + gap;
  const itemWidth = singleRawWidthCm(source) + gap;
  const itemHeight = singleRawHeightCm(source);
  if (itemHeight > containerHeightLimit(container) + EPS) return null;
  if (quantity <= 1) {
    return flatBlockFits(container, itemLength, itemWidth, itemHeight, source.rotatable)
      ? { count: 1, cols: 1, rows: 1, score: 0 }
      : null;
  }

  let best = null;
  for (let rows = 1; rows <= quantity; rows += 1) {
    if (quantity % rows !== 0) continue;
    const cols = quantity / rows;
    const lengthCm = itemLength * cols;
    const widthCm = itemWidth * rows;
    if (!flatBlockFits(container, lengthCm, widthCm, itemHeight, source.rotatable)) continue;
    const score = Math.abs(lengthCm - widthCm) + Math.max(lengthCm, widthCm) * 0.02;
    if (!best || score < best.score) best = { count: quantity, cols, rows, score };
  }
  return best;
}

function backfillSingleUnits(container, attempt, strategy) {
  if (!attempt.unplaced.some((unit) => unitQuantity(unit) <= 1)) return attempt;
  const placed = attempt.placed.map(copyUnit);
  const unplaced = [];
  let placedCount = 0;
  const ordered = orderUnits(attempt.unplaced.map(stripPlacement), strategy.unitOrder);
  const stackable = ordered.filter((unit) => !unit.nonStack);
  const nonStack = ordered.filter((unit) => unit.nonStack);
  for (const unit of stackable) {
    if (unitQuantity(unit) > 1) {
      unplaced.push(unit);
      continue;
    }
    const placement = packExtremePoint(container, placed, unit, strategy);
    if (placement) {
      placed.push(applyPlacement(unit, placement));
      placedCount += 1;
    } else {
      unplaced.push(unit);
    }
  }
  for (const unit of nonStack) {
    if (unitQuantity(unit) > 1) {
      unplaced.push(unit);
      continue;
    }
    const placement = findTopOnlyPlacement(container, placed, unit, strategy);
    if (placement) {
      placed.push(applyPlacement(unit, placement));
      placedCount += 1;
    } else {
      unplaced.push(unit);
    }
  }
  if (!placedCount || !validateAllPlacements(container, placed)) return attempt;
  return makePackedBox(placed, unplaced, {
    id: attempt.strategyId,
    name: attempt.strategyName
  }, {
    ...(attempt.strategySummary || {}),
    singleBackfillPlacedCount: Number(attempt.strategySummary?.singleBackfillPlacedCount || 0) + placedCount
  });
}

function packExtremePoint(container, placed, unit, strategy, options = {}) {
  let best = null;
  const orientations = generateOrientations(unit, { preferVertical: strategy.blueVertical });
  const supportRatio = supportRatioForUnit(container, unit, strategy, options);
  for (const dims of orientations) {
    if (!fitsContainerDims(container, dims)) continue;
    for (const point of extremePoints(container, placed, dims, options)) {
      const placement = { ...point, ...dims, floorOnly: Boolean(options.floorOnly) };
      const validation = validatePlacement(container, placed, unit, placement, supportRatio);
      if (!validation.valid) continue;
      if (options.exposedTop && hasAnyBoxInColumnAbove(placement, placed)) continue;
      const score = placementScore(placement, unit, container, strategy, placed);
      if (!best || score < best.score) best = { ...placement, score };
    }
  }
  return best;
}

function repairWithLocalSearch(container, attempt, originalUnits, strategy) {
  let best = cloneAttempt(attempt);
  const movableWindows = [4, 6, 9, 12, 16];

  for (let pass = 0; pass < LOCAL_SEARCH_PASSES && best.unplaced.length; pass += 1) {
    const windowSize = movableWindows[pass] || movableWindows[movableWindows.length - 1];
    const removed = chooseRemovalSet(best.placed, best.unplaced, windowSize, pass);
    const kept = best.placed.filter((unit) => !removed.has(unit.unitKey)).map(copyUnit);
    const retry = [
      ...best.unplaced.map(stripPlacement),
      ...best.placed.filter((unit) => removed.has(unit.unitKey)).map(stripPlacement)
    ];
    const orderedRetry = orderUnits(retry, pass % 2 ? "height" : strategy.unitOrder);
    const placed = kept.map(copyUnit);
    const unplaced = [];

    for (const unit of orderedRetry) {
      const placement = unit.nonStack
        ? findTopOnlyPlacement(container, placed, unit, strategy)
        : packExtremePoint(container, placed, unit, strategy);
      if (placement) placed.push(applyPlacement(unit, placement));
      else unplaced.push(unit);
    }

    const candidate = makePackedBox(placed, unplaced, strategy, {
      localSearchPasses: pass + 1,
      repairedCount: attempt.unplaced.length - unplaced.length,
      layerCount: countLayers(placed)
    });
    if (validateAllPlacements(container, candidate.placed) && comparePackAttempt(container)(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
}

function optimizeLowerGapSwaps(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  const hasEdgeRepack = Number(attempt.strategySummary?.edgeOrientationRepackCount || attempt.strategySummary?.blueSideRowRepackCount || 0) > 0;
  if (hasEdgeRepack && !attempt.unplaced?.length) return attempt;
  const sourceAttempt = expandAttemptPlacementsForFineTuning(container, attempt);
  const placed = sourceAttempt.placed.map(copyUnit);
  const moverCandidates = lowerGapMoverCandidates(container, placed);
  if (!moverCandidates.length) return attempt;

  const lateCandidates = lowerGapLateCandidates(container, placed, moverCandidates);
  const maxMover = Math.min(LOWER_GAP_SWAP_MAX_EDGE_MOVERS, moverCandidates.length);
  const maxLate = Math.min(LOWER_GAP_SWAP_MAX_LATE_MOVERS, lateCandidates.length);
  let best = cloneAttempt(sourceAttempt);

  for (let lateCount = 0; lateCount <= maxLate; lateCount += 1) {
    const moverLimit = Math.min(maxMover, lateCount ? LOWER_GAP_SWAP_MAX_EDGE_MOVERS : 4);
    for (let moverCount = 1; moverCount <= moverLimit; moverCount += 1) {
      const candidate = buildLowerGapSwapAttempt(
        container,
        sourceAttempt,
        strategy,
        moverCandidates.slice(0, moverCount),
        lateCandidates.slice(0, lateCount)
      );
      if (candidate && isLowerGapSwapBetter(container, candidate, best)) {
        best = candidate;
      }
    }
  }

  return Number(best.strategySummary?.lowerGapSwapCount || 0) > Number(attempt.strategySummary?.lowerGapSwapCount || 0)
    ? best
    : attempt;
}

function expandAttemptPlacementsForFineTuning(container, attempt) {
  if (!attempt?.placed?.some((unit) => unitQuantity(unit) > 1)) return attempt;
  const placed = expandGroupedPlacements(attempt.placed).map((unit) => (
    isEdgeRepackCargo(unit)
      ? { ...unit, supportRatioOverride: unit.supportRatioOverride ?? lowerGapSwapSupportRatio(container, unit) }
      : unit
  ));
  return makePackedBox(placed, attempt.unplaced.map(stripPlacement), {
    id: attempt.strategyId,
    name: attempt.strategyName
  }, {
    ...(attempt.strategySummary || {}),
    layerCount: countLayers(attempt.placed)
  });
}

function lowerGapMoverCandidates(container, placed) {
  const top = maxTop(placed);
  const heightLimit = containerHeightLimit(container);
  const minTop = Math.max(top - 90, heightLimit * 0.45);
  return placed
    .filter((unit) =>
      !unit.nonStack
      && isEdgeRepackCargo(unit)
      && unit.z + unit.heightCm >= minTop - EPS
      && !hasAnyBoxInColumnAbove(unit, placed)
    )
    .sort((a, b) => {
      const topDiff = (b.z + b.heightCm) - (a.z + a.heightCm);
      if (Math.abs(topDiff) > EPS) return topDiff;
      return unitVolumeCm3(a) - unitVolumeCm3(b);
    });
}

function lowerGapLateCandidates(container, placed, moverCandidates) {
  const highestMoverBottom = Math.max(...moverCandidates.map((unit) => Number(unit.z || 0)));
  const moverWeights = moverCandidates.map((unit) => Number(unit.weightKg || 0)).filter((weight) => weight > 0);
  const averageMoverWeight = moverWeights.length
    ? moverWeights.reduce((sum, weight) => sum + weight, 0) / moverWeights.length
    : Infinity;

  return placed
    .filter((unit) => {
      if (unit.nonStack || isEdgeRepackCargo(unit)) return false;
      if (hasAnyBoxInColumnAbove(unit, placed)) return false;
      if (Number(unit.z || 0) >= highestMoverBottom - LOWER_GAP_SWAP_MIN_DROP_CM) return false;
      if (unit.isHeavy && Number(unit.weightKg || 0) > averageMoverWeight * 1.5) return false;
      if (unitQuantity(unit) > 2) return false;
      return fitsContainerDims(container, unit);
    })
    .sort((a, b) => {
      const zDiff = Number(b.z || 0) - Number(a.z || 0);
      if (Math.abs(zDiff) > EPS) return zDiff;
      return unitVolumeCm3(a) - unitVolumeCm3(b);
    });
}

function buildLowerGapSwapAttempt(container, attempt, strategy, edgeMovers, lateMovers) {
  if (!edgeMovers.length) return null;
  const originalByKey = new Map(attempt.placed.map((unit) => [unit.unitKey, unit]));
  const lateKeys = new Set(lateMovers.map((unit) => unit.unitKey));
  const removedKeys = new Set([
    ...edgeMovers.map((unit) => unit.unitKey),
    ...lateMovers.map((unit) => unit.unitKey)
  ]);
  const placed = attempt.placed
    .filter((unit) => !removedKeys.has(unit.unitKey))
    .map(copyUnit);
  const delayed = [];
  let movedCount = 0;
  let movedDepthCm = 0;

  for (const unit of orderUnits(edgeMovers.map(stripPlacement), "small-vertical")) {
    const original = originalByKey.get(unit.unitKey);
    const supportRatio = lowerGapSwapSupportRatio(container, unit);
    const placement = packExtremePoint(container, placed, unit, strategy, { supportRatio });
    if (placement && original && placement.z < Number(original.z || 0) - LOWER_GAP_SWAP_MIN_DROP_CM) {
      placed.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
      movedCount += unitQuantity(unit);
      movedDepthCm += (Number(original.z || 0) - placement.z) * unitQuantity(unit);
    } else {
      delayed.push(unit);
    }
  }

  if (!movedCount) return null;

  const unplaced = [];
  const retry = [
    ...orderUnits((attempt.unplaced || []).map(stripPlacement), strategy.unitOrder),
    ...orderUnits(delayed, strategy.unitOrder),
    ...orderUnits(lateMovers.map(stripPlacement), "height")
  ];

  for (const unit of retry) {
    const placement = lateKeys.has(unit.unitKey)
      ? findTopExposedPlacement(container, placed, unit, strategy) || packExtremePoint(container, placed, unit, strategy)
      : packExtremePoint(container, placed, unit, strategy);
    if (placement) {
      placed.push(applyPlacement(unit, placement));
    } else {
      unplaced.push(unit);
    }
  }

  const candidate = makePackedBox(placed, unplaced, {
    id: attempt.strategyId,
    name: attempt.strategyName
  }, {
    ...(attempt.strategySummary || {}),
    lowerGapSwapCount: Number(attempt.strategySummary?.lowerGapSwapCount || 0) + movedCount,
    lowerGapSwapLiftedCount: Number(attempt.strategySummary?.lowerGapSwapLiftedCount || 0) + sumUnitQuantity(lateMovers),
    lowerGapSwapDepthCm: Number(attempt.strategySummary?.lowerGapSwapDepthCm || 0) + movedDepthCm,
    layerCount: countLayers(placed)
  });

  if (!validateAllPlacements(container, candidate.placed)) return null;
  if (sumUnitQuantity(candidate.placed) < sumUnitQuantity(attempt.placed)) return null;
  if (sumUnitQuantity(candidate.unplaced) > sumUnitQuantity(attempt.unplaced || [])) return null;
  return candidate;
}

function isLowerGapSwapBetter(container, candidate, best) {
  const comparison = comparePackAttempt(container)(candidate, best);
  if (comparison < 0) return true;
  if (comparison > 0) return false;
  return Number(candidate.strategySummary?.lowerGapSwapDepthCm || 0) > Number(best.strategySummary?.lowerGapSwapDepthCm || 0) + EPS;
}

function optimizeSparseTailSupport(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  const sourceAttempt = expandAttemptPlacementsForFineTuning(container, attempt);
  let current = cloneAttempt(sourceAttempt);
  let spreadTotal = 0;
  let backfillTotal = 0;
  let supportGainTotal = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    const candidate = buildBestSparseTailSupport(container, current, strategy);
    if (!candidate) break;
    spreadTotal += candidate.spreadCount;
    backfillTotal += candidate.backfillPlacedCount;
    supportGainTotal += candidate.supportGain;
    current = makePackedBox(candidate.placed, candidate.unplaced, {
      id: current.strategyId,
      name: current.strategyName
    }, {
      ...(current.strategySummary || {}),
      sparseTailSpreadCount: Number(current.strategySummary?.sparseTailSpreadCount || 0) + candidate.spreadCount,
      sparseTailBackfillPlacedCount: Number(current.strategySummary?.sparseTailBackfillPlacedCount || 0) + candidate.backfillPlacedCount,
      sparseTailSupportGain: Number(current.strategySummary?.sparseTailSupportGain || 0) + candidate.supportGain,
      layerCount: countLayers(candidate.placed)
    });
  }

  if (!spreadTotal && !backfillTotal && supportGainTotal <= EPS) return attempt;
  return current;
}

function optimizeCurrentLayerSparseTailSupport(container, placed, strategy, layerBottom) {
  let current = {
    placed: placed.map(copyUnit),
    unplaced: [],
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategySummary: {}
  };
  let spreadCount = 0;
  let supportGain = 0;

  for (let pass = 0; pass < 2; pass += 1) {
    const candidate = buildBestSparseTailSupport(container, current, strategy, {
      allowCovered: true,
      layerBottom,
      skipBackfill: true
    });
    if (!candidate) break;
    current = {
      ...current,
      placed: candidate.placed.map(copyUnit),
      unplaced: []
    };
    spreadCount += candidate.spreadCount;
    supportGain += candidate.supportGain;
  }

  if (!spreadCount || supportGain <= EPS) return null;
  return {
    placed: current.placed,
    spreadCount,
    supportGain
  };
}

function buildBestSparseTailSupport(container, attempt, strategy, options = {}) {
  const baseSupportScore = sparseTailSupportScore(attempt.placed, container);
  let best = null;
  for (const row of sparseTailRows(container, attempt.placed, options)) {
    const candidate = buildSparseTailSupportCandidate(container, attempt, strategy, row, baseSupportScore, options);
    if (!candidate) continue;
    if (!best || candidate.score > best.score + EPS) best = candidate;
  }
  return best;
}

function sparseTailRows(container, placed, options = {}) {
  const allowCovered = Boolean(options.allowCovered);
  const layerBottom = Number(options.layerBottom);
  const hasLayerFilter = Number.isFinite(layerBottom);
  const rows = new Map();
  for (const unit of placed) {
    if (unit.nonStack) continue;
    if (!allowCovered && hasAnyBoxInColumnAbove(unit, placed)) continue;
    if (hasLayerFilter && Math.abs(Number(unit.z || 0) - layerBottom) > EPS) continue;
    const key = [
      round3(unit.z),
      round3(unit.y),
      round3(unit.lengthCm),
      round3(unit.widthCm),
      round3(unit.heightCm)
    ].join("/");
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(unit);
  }

  return [...rows.values()]
    .map((units) => {
      const ordered = [...units].sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
      const sample = ordered[0];
      const length = Number(sample.lengthCm || 0);
      const minX = Math.min(...ordered.map((unit) => Number(unit.x || 0)));
      const availableLength = Number(container.lengthCm || 0) - minX;
      const usedLength = ordered.length * length;
      const freeLength = availableLength - usedLength;
      const insertGap = ordered.length > 1 ? freeLength / (ordered.length - 1) : 0;
      return {
        units: ordered,
        z: Number(sample.z || 0),
        y: Number(sample.y || 0),
        length,
        width: Number(sample.widthCm || 0),
        height: Number(sample.heightCm || 0),
        minX,
        freeLength,
        insertGap
      };
    })
    .filter((row) =>
      row.units.length >= 2
      && row.length > EPS
      && row.freeLength >= SPARSE_TAIL_SPREAD_MIN_FREE_CM
      && row.insertGap > EPS
      && row.insertGap <= Math.max(SPARSE_TAIL_SPREAD_MAX_INSERT_GAP_CM, row.length * 0.75) + EPS
    )
    .sort((a, b) => {
      const zDiff = a.z - b.z;
      if (Math.abs(zDiff) > EPS) return zDiff;
      if (Math.abs(b.freeLength - a.freeLength) > EPS) return b.freeLength - a.freeLength;
      return b.units.length - a.units.length;
    })
    .slice(0, SPARSE_TAIL_SPREAD_MAX_CANDIDATES);
}

function buildSparseTailSupportCandidate(container, attempt, strategy, row, baseSupportScore, options = {}) {
  const rowKeys = new Set(row.units.map((unit) => unit.unitKey));
  const placed = attempt.placed
    .filter((unit) => !rowKeys.has(unit.unitKey))
    .map(copyUnit);
  let changedCount = 0;

  for (let index = 0; index < row.units.length; index += 1) {
    const source = row.units[index];
    const unit = stripPlacement(source);
    const orientation = orientationForDims(unit, row.length, row.width, row.height);
    if (!orientation) return null;
    const placement = {
      ...orientation,
      x: round3(row.minX + index * (row.length + row.insertGap)),
      y: round3(row.y),
      z: round3(row.z)
    };
    const supportRatio = supportRatioForUnit(container, unit, strategy);
    const validation = validatePlacement(container, placed, unit, placement, supportRatio);
    if (!validation.valid) return null;
    if (placementChanged(source, placement)) changedCount += unitQuantity(source);
    placed.push({ ...applyPlacement(unit, placement), supportRatioOverride: unit.supportRatioOverride });
  }

  if (!changedCount) return null;
  let unplaced = attempt.unplaced.map(stripPlacement);
  let backfillPlacedCount = 0;
  if (!options.skipBackfill) {
    const retry = orderUnits(unplaced, strategy.unitOrder);
    unplaced = [];
    for (const unit of retry) {
      const placement = unit.nonStack
        ? findTopExposedPlacement(container, placed, unit, strategy)
        : packExtremePoint(container, placed, unit, strategy);
      if (placement) {
        placed.push(applyPlacement(unit, placement));
        backfillPlacedCount += unitQuantity(unit);
      } else {
        unplaced.push(unit);
      }
    }
  }

  const finalValidation = validateAllPlacementsDetailed(container, placed);
  if (!finalValidation.valid) return null;
  const supportGain = sparseTailSupportScore(placed, container) - baseSupportScore;
  const placedGain = sumUnitQuantity(placed) - sumUnitQuantity(attempt.placed);
  const unplacedReduction = sumUnitQuantity(attempt.unplaced || []) - sumUnitQuantity(unplaced);
  if (placedGain <= 0 && unplacedReduction <= 0 && supportGain < row.freeLength * row.width * 0.5) return null;

  return {
    placed,
    unplaced,
    spreadCount: changedCount,
    backfillPlacedCount,
    supportGain,
    score: placedGain * 2_000_000
      + unplacedReduction * 1_000_000
      + backfillPlacedCount * 400_000
      + supportGain * 20
      + row.freeLength * 100
      - row.z
  };
}

function sparseTailSupportScore(placed, container) {
  return placed
    .filter((unit) => !unit.nonStack)
    .reduce((score, unit) => {
      const top = Number(unit.z || 0) + Number(unit.heightCm || 0);
      const heightWeight = container.heightCm > 0 ? Math.max(0.2, 1 - top / container.heightCm) : 1;
      const xReach = Number(unit.x || 0) + Number(unit.lengthCm || 0);
      return score + xReach * Number(unit.widthCm || 0) * heightWeight;
    }, 0);
}

function isEdgeRepackCargo(unit) {
  if (!unit || unit.nonStack || !unit.rotatable) return false;
  const length = Number(unit.lengthCm || unit.packedLengthCm || 0);
  const width = Number(unit.widthCm || unit.packedWidthCm || 0);
  return length > EPS && width > EPS && Math.abs(length - width) > EPS;
}

function sameRepackCargo(a, b) {
  if (!a || !b) return false;
  return a.cargoId === b.cargoId
    && a.type === b.type
    && Math.abs(singleRawLengthCm(a) - singleRawLengthCm(b)) < EPS
    && Math.abs(singleRawWidthCm(a) - singleRawWidthCm(b)) < EPS
    && Math.abs(singleRawHeightCm(a) - singleRawHeightCm(b)) < EPS
    && Math.abs(Number(a.gapCm || 0) - Number(b.gapCm || 0)) < EPS;
}

function optimizeEdgeOrientationRows(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  const sourceAttempt = expandAttemptPlacementsForFineTuning(container, attempt);
  let current = cloneAttempt(sourceAttempt);
  let movedTotal = 0;

  for (let pass = 0; pass < 4; pass += 1) {
    const candidate = buildBestEdgeOrientationRepack(container, current, strategy);
    if (!candidate) break;
    movedTotal += candidate.changedCount;
    current = makePackedBox(candidate.placed, current.unplaced.map(stripPlacement), {
      id: current.strategyId,
      name: current.strategyName
    }, {
      ...(current.strategySummary || {}),
      edgeOrientationRepackCount: Number(current.strategySummary?.edgeOrientationRepackCount || current.strategySummary?.blueSideRowRepackCount || 0) + candidate.changedCount,
      layerCount: countLayers(candidate.placed)
    });
  }

  return movedTotal ? current : attempt;
}

function optimizeVerticalTailFills(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  const sourceAttempt = expandAttemptPlacementsForFineTuning(container, attempt);
  let current = cloneAttempt(sourceAttempt);
  let movedTotal = 0;
  let supportGainTotal = 0;

  for (let pass = 0; pass < VERTICAL_TAIL_FILL_MAX_PASSES; pass += 1) {
    const candidate = buildBestVerticalTailFill(container, current, strategy);
    if (!candidate) break;
    movedTotal += candidate.movedCount;
    supportGainTotal += candidate.supportGain;
    current = makePackedBox(candidate.placed, current.unplaced.map(stripPlacement), {
      id: current.strategyId,
      name: current.strategyName
    }, {
      ...(current.strategySummary || {}),
      verticalTailFillCount: Number(current.strategySummary?.verticalTailFillCount || 0) + candidate.movedCount,
      verticalTailSupportGain: round(Number(current.strategySummary?.verticalTailSupportGain || 0) + candidate.supportGain),
      layerCount: countLayers(candidate.placed)
    });
  }

  if (!movedTotal && supportGainTotal <= EPS) return attempt;
  return current;
}

function buildBestVerticalTailFill(container, attempt, strategy) {
  let best = null;
  for (const slot of verticalTailFillSlots(container, attempt.placed)) {
    const candidate = buildVerticalTailFillCandidate(container, attempt.placed, slot, strategy);
    if (!candidate) continue;
    if (!best || candidate.score > best.score + EPS) best = candidate;
  }
  return best;
}

function verticalTailFillSlots(container, placed) {
  const slots = new Map();
  const addSlot = (slot) => {
    const key = [
      slot.sample.cargoId || "",
      slot.sample.type || "",
      round3(slot.x),
      round3(slot.y),
      round3(slot.z),
      round3(slot.dims.lengthCm),
      round3(slot.dims.widthCm),
      round3(slot.dims.heightCm)
    ].join("/");
    if (!slots.has(key)) slots.set(key, slot);
  };

  for (const row of collectEdgeOrientationRows(placed)) {
    if (row.units.length < 2) continue;
    if (row.length <= row.width + EPS) continue;
    const maxX = Math.max(...row.units.map((unit) => Number(unit.x || 0) + Number(unit.lengthCm || 0)));
    const freeLength = Number(container.lengthCm || 0) - maxX;
    if (freeLength <= EPS) continue;

    const baseUnit = stripPlacement(row.sample);
    const orientations = generateOrientations(baseUnit, { preferVertical: true })
      .filter((dims) =>
        dims.lengthCm <= freeLength + EPS
        && dims.lengthCm < row.length - EPS
        && dims.widthCm >= row.width - EPS
        && dims.heightCm <= row.length + EPS
      );

    for (const dims of orientations) {
      addSlot({
        sample: row.sample,
        rowKeys: new Set(row.units.map((unit) => unit.unitKey)),
        x: round3(maxX),
        y: round3(row.y),
        z: round3(row.z),
        dims,
        freeLength
      });
    }
  }

  for (const unit of placed) {
    if (!isVerticalTailFillBase(container, unit)) continue;
    const baseUnit = stripPlacement(unit);
    const dims = orientationForDims(baseUnit, Number(unit.lengthCm || 0), Number(unit.widthCm || 0), Number(unit.heightCm || 0));
    if (!dims) continue;
    const z = Number(unit.z || 0) + Number(unit.heightCm || 0);
    if (z + dims.heightCm > containerHeightLimit(container) + EPS) continue;
    addSlot({
      sample: unit,
      rowKeys: new Set([unit.unitKey]),
      x: round3(unit.x),
      y: round3(unit.y),
      z: round3(z),
      dims,
      freeLength: Number(container.lengthCm || 0) - (Number(unit.x || 0) + Number(unit.lengthCm || 0))
    });
  }

  return [...slots.values()]
    .sort((a, b) => {
      if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
      if (Math.abs(a.y - b.y) > EPS) return a.y - b.y;
      return b.freeLength - a.freeLength;
    })
    .slice(0, VERTICAL_TAIL_FILL_MAX_CANDIDATES);
}

function isVerticalTailFillBase(container, unit) {
  if (!isEdgeRepackCargo(unit) || unitQuantity(unit) > 1) return false;
  const length = Number(unit.lengthCm || 0);
  const width = Number(unit.widthCm || 0);
  const height = Number(unit.heightCm || 0);
  if (length <= EPS || width <= EPS || height <= EPS) return false;
  if (length >= width - EPS || length >= height - EPS) return false;
  const freeLength = Number(container.lengthCm || 0) - (Number(unit.x || 0) + length);
  if (freeLength < -EPS || freeLength > Math.max(12, length * 0.5) + EPS) return false;
  const baseUnit = stripPlacement(unit);
  return Boolean(orientationForDims(baseUnit, length, width, height));
}

function buildVerticalTailFillCandidate(container, placed, slot, strategy) {
  const movers = placed
    .filter((unit) =>
      isEdgeRepackCargo(unit)
      && sameRepackCargo(unit, slot.sample)
      && !slot.rowKeys.has(unit.unitKey)
      && unitQuantity(unit) <= 1
      && !hasAnyBoxInColumnAbove(unit, placed)
      && Number(unit.z || 0) > slot.z + LOWER_GAP_SWAP_MIN_DROP_CM
      && orientationForDims(stripPlacement(unit), slot.dims.lengthCm, slot.dims.widthCm, slot.dims.heightCm)
    )
    .sort((a, b) => {
      const topDiff = (Number(b.z || 0) + Number(b.heightCm || 0)) - (Number(a.z || 0) + Number(a.heightCm || 0));
      if (Math.abs(topDiff) > EPS) return topDiff;
      const zDiff = Number(b.z || 0) - Number(a.z || 0);
      if (Math.abs(zDiff) > EPS) return zDiff;
      return centerDistancePenalty(container, b) - centerDistancePenalty(container, a);
    })
    .slice(0, VERTICAL_TAIL_FILL_MAX_CANDIDATES);

  let best = null;
  const baseSupportScore = sparseTailSupportScore(placed, container);
  const baseMaxTop = maxTop(placed);
  for (const source of movers) {
    const unit = stripPlacement(source);
    const orientation = orientationForDims(unit, slot.dims.lengthCm, slot.dims.widthCm, slot.dims.heightCm);
    if (!orientation) continue;
    const nextPlaced = placed
      .filter((item) => item.unitKey !== source.unitKey)
      .map(copyUnit);
    const placement = {
      ...orientation,
      x: slot.x,
      y: slot.y,
      z: slot.z
    };
    const supportRatio = supportRatioForUnit(container, unit, strategy);
    const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
    if (!validation.valid) continue;
    nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
    const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
    if (!finalValidation.valid) continue;
    const movedDepth = (Number(source.z || 0) - slot.z) * unitQuantity(source);
    const supportGain = sparseTailSupportScore(nextPlaced, container) - baseSupportScore;
    const topReduction = baseMaxTop - maxTop(nextPlaced);
    const narrowTallBonus = Math.max(0, Number(placement.heightCm || 0) - Number(placement.widthCm || 0)) * 260000
      + Math.max(0, Number(placement.widthCm || 0) - Number(placement.lengthCm || 0)) * 80000;
    const score = movedDepth * 120000
      + supportGain * 50
      + Math.max(0, topReduction) * 300000
      + narrowTallBonus
      + slot.freeLength * 1000
      - slot.z;
    if (!best || score > best.score + EPS) {
      best = {
        placed: nextPlaced,
        movedCount: unitQuantity(source),
        supportGain,
        score
      };
    }
  }
  return best;
}

function buildBestEdgeOrientationRepack(container, attempt, strategy) {
  let bestStack = null;
  for (const stack of mixedEdgeOrientationStacks(container, attempt.placed)) {
    const candidate = buildMixedEdgeOrientationStackCandidate(container, attempt.placed, stack, strategy);
    if (!candidate) continue;
    if (!bestStack || candidate.score > bestStack.score + EPS) bestStack = candidate;
  }
  if (bestStack) return bestStack;

  let bestLayer = null;
  for (const layer of mixedEdgeOrientationLayers(container, attempt.placed)) {
    const candidate = buildMixedEdgeOrientationLayerCandidate(container, attempt.placed, layer, strategy);
    if (!candidate) continue;
    if (!bestLayer || candidate.score > bestLayer.score + EPS) bestLayer = candidate;
  }
  if (bestLayer) return bestLayer;

  let bestMixed = null;
  for (const band of mixedEdgeOrientationBands(container, attempt.placed)) {
    const candidate = buildMixedEdgeOrientationBandCandidate(container, attempt.placed, band, strategy);
    if (!candidate) continue;
    if (!bestMixed || candidate.score > bestMixed.score + EPS) bestMixed = candidate;
  }
  if (bestMixed) return bestMixed;

  let best = null;
  for (const row of edgeOrientationRows(container, attempt.placed)) {
    const candidate = buildEdgeOrientationRowCandidate(container, attempt.placed, row, strategy);
    if (!candidate) continue;
    if (!best || candidate.score > best.score + EPS) best = candidate;
  }
  for (const band of edgeOrientationBands(container, attempt.placed)) {
    const candidate = buildEdgeOrientationBandCandidate(container, attempt.placed, band, strategy);
    if (!candidate) continue;
    if (!best || candidate.score > best.score + EPS) best = candidate;
  }
  return best;
}

function collectEdgeOrientationRows(placed) {
  const groups = new Map();
  for (const unit of placed) {
    if (!isEdgeRepackCargo(unit)) continue;
    if (Number(unit.lengthCm || 0) <= Number(unit.widthCm || 0) + EPS) continue;
    const key = [
      unit.cargoId || "",
      unit.type || "",
      round3(unit.z),
      round3(unit.y),
      round3(unit.lengthCm),
      round3(unit.widthCm),
      round3(unit.heightCm)
    ].join("/");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }

  return [...groups.values()]
    .map((units) => {
      const sample = units[0];
      return {
        units: [...units].sort((a, b) => Number(a.x || 0) - Number(b.x || 0)),
        sample,
        z: Number(sample.z || 0),
        y: Number(sample.y || 0),
        width: Number(sample.widthCm || 0),
        length: Number(sample.lengthCm || 0),
        height: Number(sample.heightCm || 0),
        normalLength: Number(sample.lengthCm || 0),
        normalWidth: Number(sample.widthCm || 0),
        rotatedLength: Number(sample.widthCm || 0),
        rotatedWidth: Number(sample.lengthCm || 0),
        minX: Math.min(...units.map((unit) => Number(unit.x || 0)))
      };
    });
}

function edgeOrientationRows(container, placed) {
  return collectEdgeOrientationRows(placed)
    .map((row) => {
      const capacity = Math.floor((Number(container.lengthCm || 0) - row.minX + EPS) / Math.max(1, row.rotatedLength));
      return {
        ...row,
        targetLength: row.rotatedLength,
        targetWidth: row.rotatedWidth,
        capacity,
        extraSlots: capacity - row.units.length
      };
    })
    .filter((row) =>
      row.units.length >= 3
      && row.extraSlots > 0
      && row.y + row.targetWidth <= Number(container.widthCm || 0) + EPS
      && isTrailingWidthEdge(container, row.y, row.targetWidth)
      && !hasEdgeRowOverlapAfterRotate(row, placed)
    )
    .sort((a, b) => {
      if (b.extraSlots !== a.extraSlots) return b.extraSlots - a.extraSlots;
      if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
      return b.y - a.y;
    })
    .slice(0, EDGE_ORIENTATION_REPACK_MAX_CANDIDATES);
}

function hasEdgeRowOverlapAfterRotate(row, placed) {
  return placed.some((unit) => {
    if (!isEdgeRepackCargo(unit)) return false;
    if (row.units.some((rowUnit) => rowUnit.unitKey === unit.unitKey)) return false;
    if (Math.abs(Number(unit.z || 0) - row.z) > EPS) return false;
    if (Number(unit.y || 0) >= row.y + row.targetWidth - EPS) return false;
    if (Number(unit.y || 0) + Number(unit.widthCm || 0) <= row.y + EPS) return false;
    return true;
  });
}

function isTrailingWidthEdge(container, y, width) {
  const outerGap = Number(container.widthCm || 0) - (Number(y || 0) + Number(width || 0));
  return outerGap <= Math.max(12, Number(width || 0) * 0.25) + EPS;
}

function edgeOrientationBands(container, placed) {
  const rows = collectEdgeOrientationRows(placed)
    .filter((row) => row.units.length >= 3 && row.y + row.rotatedWidth <= Number(container.widthCm || 0) + EPS)
    .sort((a, b) => {
      const zDiff = a.z - b.z;
      if (Math.abs(zDiff) > EPS) return zDiff;
      return a.y - b.y;
    });

  const bands = [];
  for (let start = 0; start < rows.length; start += 1) {
    const bandRows = [rows[start]];
    for (let end = start + 1; end < rows.length; end += 1) {
      if (end - start + 1 > EDGE_ORIENTATION_REPACK_MAX_BAND_ROWS) break;
      const previous = bandRows[bandRows.length - 1];
      const next = rows[end];
      if (!sameEdgeBandShape(previous, next)) break;
      if (Math.abs(next.y - (previous.y + previous.width)) > EPS) break;
      bandRows.push(next);
      const minX = Math.min(...bandRows.map((row) => row.minX));
      const capacity = Math.floor((Number(container.lengthCm || 0) - minX + EPS) / Math.max(1, rows[start].rotatedLength));
      if (capacity <= 0) continue;
      const units = bandRows.flatMap((row) => row.units);
      const targetRows = Math.ceil(units.length / capacity);
      const extraSlots = targetRows * capacity - units.length;
      const originalWidth = bandRows.reduce((sum, row) => sum + row.width, 0);
      const targetWidth = targetRows * rows[start].rotatedWidth;
      if (targetRows >= bandRows.length && targetWidth >= originalWidth - EPS && extraSlots <= 0) continue;
      if (rows[start].y + targetWidth > Number(container.widthCm || 0) + EPS) continue;
      if (!isTrailingWidthEdge(container, rows[start].y, targetWidth)) continue;
      bands.push({
        rows: bandRows.map((row) => ({ ...row, units: [...row.units] })),
        units: [...units].sort((a, b) => {
          const yDiff = Number(a.y || 0) - Number(b.y || 0);
          if (Math.abs(yDiff) > EPS) return yDiff;
          return Number(a.x || 0) - Number(b.x || 0);
        }),
        z: rows[start].z,
        y: rows[start].y,
        height: rows[start].height,
        targetLength: rows[start].rotatedLength,
        targetWidth: rows[start].rotatedWidth,
        minX,
        capacity,
        targetRows,
        extraSlots,
        savedRows: bandRows.length - targetRows
      });
    }
  }

  return bands.sort((a, b) => {
    if (b.savedRows !== a.savedRows) return b.savedRows - a.savedRows;
    if (b.extraSlots !== a.extraSlots) return b.extraSlots - a.extraSlots;
    if (Math.abs(b.z - a.z) > EPS) return b.z - a.z;
    return b.y - a.y;
  }).slice(0, EDGE_ORIENTATION_REPACK_MAX_CANDIDATES);
}

function mixedEdgeOrientationBands(container, placed) {
  const rows = collectEdgeOrientationRows(placed)
    .filter((row) => row.units.length >= 3)
    .sort((a, b) => {
      const zDiff = a.z - b.z;
      if (Math.abs(zDiff) > EPS) return zDiff;
      return a.y - b.y;
    });

  const bands = [];
  for (let start = 0; start < rows.length; start += 1) {
    const bandRows = [rows[start]];
    for (let end = start + 1; end < rows.length; end += 1) {
      if (end - start + 1 > EDGE_ORIENTATION_REPACK_MAX_BAND_ROWS) break;
      const previous = bandRows[bandRows.length - 1];
      const next = rows[end];
      if (!sameEdgeBandShape(previous, next)) break;
      if (Math.abs(next.y - (previous.y + previous.width)) > EPS) break;
      bandRows.push(next);
      const minX = Math.min(...bandRows.map((row) => row.minX));
      const pattern = bestMixedEdgePattern(container, bandRows, minX);
      if (!pattern) continue;
      const units = bandRows.flatMap((row) => row.units);
      bands.push({
        rows: bandRows.map((row) => ({ ...row, units: [...row.units] })),
        units: [...units].sort((a, b) => {
          const yDiff = Number(a.y || 0) - Number(b.y || 0);
          if (Math.abs(yDiff) > EPS) return yDiff;
          return Number(a.x || 0) - Number(b.x || 0);
        }),
        z: rows[start].z,
        y: rows[start].y,
        height: rows[start].height,
        normalLength: rows[start].normalLength,
        normalWidth: rows[start].normalWidth,
        rotatedLength: rows[start].rotatedLength,
        rotatedWidth: rows[start].rotatedWidth,
        minX,
        ...pattern
      });
    }
  }

  return bands.sort((a, b) => {
    if (b.extraSlots !== a.extraSlots) return b.extraSlots - a.extraSlots;
    if (b.capacity !== a.capacity) return b.capacity - a.capacity;
    if (Math.abs(b.z - a.z) > EPS) return b.z - a.z;
    return b.y - a.y;
  }).slice(0, EDGE_ORIENTATION_REPACK_MAX_CANDIDATES);
}

function mixedEdgeOrientationStacks(container, placed) {
  const layers = mixedEdgeOrientationLayers(container, placed)
    .sort((a, b) => {
      if (!sameRepackCargo(a.sample, b.sample)) return String(a.sample?.cargoId || "").localeCompare(String(b.sample?.cargoId || ""));
      if (Math.abs(a.minX - b.minX) > EPS) return a.minX - b.minX;
      if (Math.abs(a.y - b.y) > EPS) return a.y - b.y;
      return a.z - b.z;
    });
  const stacks = [];

  for (let start = 0; start < layers.length; start += 1) {
    const stackLayers = [layers[start]];
    for (let end = start + 1; end < layers.length; end += 1) {
      const previous = stackLayers[stackLayers.length - 1];
      const next = layers[end];
      if (!sameMixedEdgeLayerShape(stackLayers[0], next)) continue;
      if (Math.abs(next.z - (previous.z + previous.height)) > EPS) continue;
      stackLayers.push(next);
    }
    if (stackLayers.length < 2) continue;
    const stack = buildMixedEdgeOrientationStack(container, placed, stackLayers);
    if (stack) stacks.push(stack);
  }

  return stacks.sort((a, b) => {
    if (b.units.length !== a.units.length) return b.units.length - a.units.length;
    if (b.layerBottoms.length !== a.layerBottoms.length) return b.layerBottoms.length - a.layerBottoms.length;
    return a.layerBottoms[0] - b.layerBottoms[0];
  }).slice(0, EDGE_ORIENTATION_REPACK_MAX_CANDIDATES);
}

function sameMixedEdgeLayerShape(a, b) {
  return sameRepackCargo(a.sample, b.sample)
    && Math.abs(a.minX - b.minX) < EPS
    && Math.abs(a.y - b.y) < EPS
    && Math.abs(a.normalLength - b.normalLength) < EPS
    && Math.abs(a.normalWidth - b.normalWidth) < EPS
    && Math.abs(a.rotatedLength - b.rotatedLength) < EPS
    && Math.abs(a.rotatedWidth - b.rotatedWidth) < EPS
    && Math.abs(a.height - b.height) < EPS
    && a.normalRows === b.normalRows
    && a.normalCapacity === b.normalCapacity
    && a.rotatedCapacity === b.rotatedCapacity;
}

function buildMixedEdgeOrientationStack(container, placed, layers) {
  const first = layers[0];
  const layerBottoms = layers.map((layer) => layer.z).sort((a, b) => a - b);
  const stackTop = layerBottoms[layerBottoms.length - 1] + first.height;
  const moving = placed
    .filter((unit) =>
      isEdgeRepackCargo(unit)
      && sameRepackCargo(unit, first.sample)
      && unitIntersectsStackPrism(container, unit, first, layerBottoms[0], stackTop)
      && orientationForDims(unit, first.normalLength, first.normalWidth, first.height)
      && orientationForDims(unit, first.rotatedLength, first.rotatedWidth, first.height)
    )
    .sort((a, b) => {
      const zDiff = Number(a.z || 0) - Number(b.z || 0);
      if (Math.abs(zDiff) > EPS) return zDiff;
      const yDiff = Number(a.y || 0) - Number(b.y || 0);
      if (Math.abs(yDiff) > EPS) return yDiff;
      return Number(a.x || 0) - Number(b.x || 0);
    });
  const layerCapacity = first.capacity;
  const normalSlots = first.normalRows * first.normalCapacity;
  if (moving.length <= normalSlots * layerBottoms.length) return null;
  if (moving.length > layerCapacity * layerBottoms.length) return null;

  return {
    sample: first.sample,
    units: moving,
    layerBottoms,
    y: first.y,
    minX: first.minX,
    height: first.height,
    normalLength: first.normalLength,
    normalWidth: first.normalWidth,
    rotatedLength: first.rotatedLength,
    rotatedWidth: first.rotatedWidth,
    normalRows: first.normalRows,
    normalCapacity: first.normalCapacity,
    rotatedCapacity: first.rotatedCapacity,
    layerCapacity
  };
}

function unitIntersectsStackPrism(container, unit, layer, zBottom, zTop) {
  const minX = Number(layer.minX || 0);
  const minY = Number(layer.y || 0);
  const maxY = Number(container.widthCm || 0);
  return Number(unit.x || 0) + Number(unit.lengthCm || 0) > minX + EPS
    && Number(unit.y || 0) + Number(unit.widthCm || 0) > minY + EPS
    && Number(unit.y || 0) < maxY - EPS
    && Number(unit.z || 0) + Number(unit.heightCm || 0) > zBottom + EPS
    && Number(unit.z || 0) < zTop - EPS;
}

function mixedEdgeOrientationLayers(container, placed) {
  const groups = new Map();
  for (const unit of placed) {
    if (!isEdgeRepackCargo(unit)) continue;
    const rawLength = singleRawLengthCm(unit);
    const rawWidth = singleRawWidthCm(unit);
    const rawHeight = singleRawHeightCm(unit);
    const gap = Number(unit.gapCm || 0);
    const normalLength = rawLength + gap;
    const normalWidth = rawWidth + gap;
    const height = rawHeight;
    const rotatedLength = normalWidth;
    const rotatedWidth = normalLength;
    if (Math.abs(normalLength - normalWidth) < EPS) continue;
    if (!orientationForDims(unit, normalLength, normalWidth, height)) continue;
    if (!orientationForDims(unit, rotatedLength, rotatedWidth, height)) continue;
    const key = [
      unit.cargoId || "",
      unit.type || "",
      round3(rawLength),
      round3(rawWidth),
      round3(rawHeight),
      round3(gap),
      round3(unit.z)
    ].join("/");
    if (!groups.has(key)) {
      groups.set(key, {
        sample: unit,
        units: [],
        z: Number(unit.z || 0),
        normalLength,
        normalWidth,
        rotatedLength,
        rotatedWidth,
        height
      });
    }
    groups.get(key).units.push(unit);
  }

  const layers = [];
  for (const group of groups.values()) {
    const units = [...group.units].sort((a, b) => {
      const yDiff = Number(a.y || 0) - Number(b.y || 0);
      if (Math.abs(yDiff) > EPS) return yDiff;
      return Number(a.x || 0) - Number(b.x || 0);
    });
    if (units.length < 8) continue;
    const minX = Math.min(...units.map((unit) => Number(unit.x || 0)));
    const minY = Math.min(...units.map((unit) => Number(unit.y || 0)));
    const maxRows = Math.floor((Number(container.widthCm || 0) - minY + EPS) / Math.max(1, Math.min(group.normalWidth, group.rotatedWidth)));
    const pattern = bestMixedPatternForCount(container, {
      y: minY,
      minX,
      unitCount: units.length,
      normalLength: group.normalLength,
      normalWidth: group.normalWidth,
      rotatedLength: group.rotatedLength,
      rotatedWidth: group.rotatedWidth,
      maxRows,
      allowExact: true
    });
    if (!pattern) continue;
    layers.push({
      ...group,
      units,
      y: minY,
      minX,
      ...pattern
    });
  }

  return layers.sort((a, b) => {
    if (b.units.length !== a.units.length) return b.units.length - a.units.length;
    if (b.extraSlots !== a.extraSlots) return b.extraSlots - a.extraSlots;
    if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
    return a.y - b.y;
  }).slice(0, EDGE_ORIENTATION_REPACK_MAX_CANDIDATES);
}

function bestMixedEdgePattern(container, rows, minX) {
  const sample = rows[0];
  return bestMixedPatternForCount(container, {
    y: sample.y,
    minX,
    unitCount: rows.reduce((sum, row) => sum + row.units.length, 0),
    normalLength: sample.normalLength,
    normalWidth: sample.normalWidth,
    rotatedLength: sample.rotatedLength,
    rotatedWidth: sample.rotatedWidth,
    maxRows: rows.length
  });
}

function bestMixedPatternForCount(container, options) {
  const availableWidth = Number(container.widthCm || 0) - Number(options.y || 0);
  const normalCapacity = Math.floor((Number(container.lengthCm || 0) - options.minX + EPS) / Math.max(1, options.normalLength));
  const rotatedCapacity = Math.floor((Number(container.lengthCm || 0) - options.minX + EPS) / Math.max(1, options.rotatedLength));
  if (normalCapacity <= 0 || rotatedCapacity <= 0) return null;

  const unitCount = Number(options.unitCount || 0);
  let best = null;
  for (let normalRows = 1; normalRows <= Number(options.maxRows || 0); normalRows += 1) {
    const rotatedRows = 1;
    if (normalRows + rotatedRows > Number(options.maxRows || 0)) continue;
    {
      const usedWidth = normalRows * options.normalWidth + rotatedRows * options.rotatedWidth;
      if (usedWidth > availableWidth + EPS) continue;
      if (!isTightTrailingWidthEdge(container, options.y, usedWidth, Math.min(options.normalWidth, options.rotatedWidth))) continue;
      const capacity = normalRows * normalCapacity + rotatedRows * rotatedCapacity;
      const extraSlots = capacity - unitCount;
      const normalSlots = normalRows * normalCapacity;
      if (unitCount <= normalSlots) continue;
      if (extraSlots < 0 || (!options.allowExact && extraSlots <= 0)) continue;
      const score = (extraSlots + (options.allowExact ? 1 : 0)) * 100000 + capacity * 1000 - usedWidth;
      if (!best || score > best.score + EPS) {
        best = {
          normalRows,
          rotatedRows,
          normalCapacity,
          rotatedCapacity,
          capacity,
          extraSlots,
          usedWidth,
          score
        };
      }
    }
  }
  return best;
}

function isTightTrailingWidthEdge(container, y, width, unitWidth) {
  const outerGap = Number(container.widthCm || 0) - (Number(y || 0) + Number(width || 0));
  const tolerance = Math.max(8, Number(unitWidth || 0) * 0.25);
  return outerGap >= -EPS && outerGap <= tolerance + EPS;
}

function sameEdgeBandShape(a, b) {
  return Math.abs(a.z - b.z) < EPS
    && Math.abs(a.length - b.length) < EPS
    && Math.abs(a.width - b.width) < EPS
    && Math.abs(a.height - b.height) < EPS
    && sameRepackCargo(a.sample, b.sample);
}

function buildEdgeOrientationRowCandidate(container, placed, row, strategy) {
  const rowKeys = new Set(row.units.map((unit) => unit.unitKey));
  const extras = placed
    .filter((unit) =>
      isEdgeRepackCargo(unit)
      && sameRepackCargo(unit, row.sample)
      && !rowKeys.has(unit.unitKey)
      && !hasAnyBoxInColumnAbove(unit, placed)
      && Number(unit.z || 0) > row.z + LOWER_GAP_SWAP_MIN_DROP_CM
      && orientationForDims(unit, row.targetLength, row.targetWidth, row.height)
    )
    .sort((a, b) => {
      const topDiff = (b.z + b.heightCm) - (a.z + a.heightCm);
      if (Math.abs(topDiff) > EPS) return topDiff;
      return Number(a.x || 0) - Number(b.x || 0);
    });
  const extraCandidates = extras.slice(0, row.extraSlots);
  const moving = [...row.units, ...extraCandidates];
  const movingKeys = new Set(moving.map((unit) => unit.unitKey));
  const nextPlaced = placed
    .filter((unit) => !movingKeys.has(unit.unitKey))
    .map(copyUnit);
  const supportRatio = lowerGapSwapSupportRatio(container, row.units[0]);
  const moved = [];

  for (let index = 0; index < moving.length; index += 1) {
    const source = moving[index];
    const unit = stripPlacement(source);
    const orientation = orientationForDims(unit, row.targetLength, row.targetWidth, row.height);
    if (!orientation) return null;
    const placement = {
      ...orientation,
      x: round3(row.minX + index * row.targetLength),
      y: round3(row.y),
      z: round3(row.z)
    };
    const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
    if (!validation.valid) {
      if (index >= row.units.length) {
        nextPlaced.push(...moving.slice(index).map(copyUnit));
        break;
      }
      return null;
    }
    nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
    if (index >= row.units.length) moved.push(source);
  }

  const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
  if (!finalValidation.valid) return null;
  const movedDepth = moved.reduce((sum, unit) => sum + (Number(unit.z || 0) - row.z) * unitQuantity(unit), 0);
  const compactedCount = sumUnitQuantity(row.units);
  return {
    placed: nextPlaced,
    movedCount: sumUnitQuantity(moved),
    changedCount: compactedCount + sumUnitQuantity(moved),
    score: sumUnitQuantity(moved) * 100000 + row.extraSlots * 20000 + movedDepth + row.z
  };
}

function buildEdgeOrientationBandCandidate(container, placed, band, strategy) {
  const bandKeys = new Set(band.units.map((unit) => unit.unitKey));
  const extras = placed
    .filter((unit) =>
      isEdgeRepackCargo(unit)
      && sameRepackCargo(unit, band.units[0])
      && !bandKeys.has(unit.unitKey)
      && !hasAnyBoxInColumnAbove(unit, placed)
      && Number(unit.z || 0) > band.z + LOWER_GAP_SWAP_MIN_DROP_CM
      && orientationForDims(unit, band.targetLength, band.targetWidth, band.height)
    )
    .sort((a, b) => {
      const topDiff = (b.z + b.heightCm) - (a.z + a.heightCm);
      if (Math.abs(topDiff) > EPS) return topDiff;
      return Number(a.x || 0) - Number(b.x || 0);
    });
  const extraCandidates = extras.slice(0, Math.max(0, band.extraSlots));
  const moving = [...band.units, ...extraCandidates];
  const movingKeys = new Set(moving.map((unit) => unit.unitKey));
  const nextPlaced = placed
    .filter((unit) => !movingKeys.has(unit.unitKey))
    .map(copyUnit);
  const supportRatio = lowerGapSwapSupportRatio(container, band.units[0]);
  const moved = [];

  for (let index = 0; index < moving.length; index += 1) {
    const source = moving[index];
    const unit = stripPlacement(source);
    const orientation = orientationForDims(unit, band.targetLength, band.targetWidth, band.height);
    if (!orientation) return null;
    const rowIndex = Math.floor(index / band.capacity);
    const columnIndex = index % band.capacity;
    const placement = {
      ...orientation,
      x: round3(band.minX + columnIndex * band.targetLength),
      y: round3(band.y + rowIndex * band.targetWidth),
      z: round3(band.z)
    };
    const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
    if (!validation.valid) {
      if (index >= band.units.length) {
        nextPlaced.push(...moving.slice(index).map(copyUnit));
        break;
      }
      return null;
    }
    nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
    if (index >= band.units.length) moved.push(source);
  }

  const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
  if (!finalValidation.valid) return null;
  const movedDepth = moved.reduce((sum, unit) => sum + (Number(unit.z || 0) - band.z) * unitQuantity(unit), 0);
  const compactedCount = sumUnitQuantity(band.units);
  return {
    placed: nextPlaced,
    movedCount: sumUnitQuantity(moved),
    changedCount: compactedCount + sumUnitQuantity(moved),
    score: sumUnitQuantity(moved) * 120000 + band.savedRows * 50000 + band.extraSlots * 15000 + movedDepth + band.z
  };
}

function buildMixedEdgeOrientationBandCandidate(container, placed, band, strategy) {
  const bandKeys = new Set(band.units.map((unit) => unit.unitKey));
  const extras = placed
    .filter((unit) =>
      isEdgeRepackCargo(unit)
      && sameRepackCargo(unit, band.units[0])
      && !bandKeys.has(unit.unitKey)
      && !hasAnyBoxInColumnAbove(unit, placed)
      && Number(unit.z || 0) > band.z + LOWER_GAP_SWAP_MIN_DROP_CM
      && orientationForDims(unit, band.rotatedLength, band.rotatedWidth, band.height)
    )
    .sort((a, b) => {
      const topDiff = (b.z + b.heightCm) - (a.z + a.heightCm);
      if (Math.abs(topDiff) > EPS) return topDiff;
      return Number(a.x || 0) - Number(b.x || 0);
    });
  const extraCandidates = extras.slice(0, Math.max(0, band.extraSlots));
  const moving = [...band.units, ...extraCandidates];
  const movingKeys = new Set(moving.map((unit) => unit.unitKey));
  const nextPlaced = placed
    .filter((unit) => !movingKeys.has(unit.unitKey))
    .map(copyUnit);
  const supportRatio = lowerGapSwapSupportRatio(container, band.units[0]);
  const moved = [];
  const normalSlots = band.normalRows * band.normalCapacity;

  for (let index = 0; index < moving.length; index += 1) {
    const source = moving[index];
    const unit = stripPlacement(source);
    const inNormalRows = index < normalSlots;
    const lengthCm = inNormalRows ? band.normalLength : band.rotatedLength;
    const widthCm = inNormalRows ? band.normalWidth : band.rotatedWidth;
    const orientation = orientationForDims(unit, lengthCm, widthCm, band.height);
    if (!orientation) return null;
    const localIndex = inNormalRows ? index : index - normalSlots;
    const rowCapacity = inNormalRows ? band.normalCapacity : band.rotatedCapacity;
    const rowIndex = Math.floor(localIndex / rowCapacity);
    const columnIndex = localIndex % rowCapacity;
    const rowY = inNormalRows
      ? band.y + rowIndex * band.normalWidth
      : band.y + band.normalRows * band.normalWidth + rowIndex * band.rotatedWidth;
    const placement = {
      ...orientation,
      x: round3(band.minX + columnIndex * lengthCm),
      y: round3(rowY),
      z: round3(band.z)
    };
    const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
    if (!validation.valid) {
      if (index >= band.units.length) {
        nextPlaced.push(...moving.slice(index).map(copyUnit));
        break;
      }
      return null;
    }
    nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
    if (index >= band.units.length) moved.push(source);
  }

  const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
  if (!finalValidation.valid) return null;
  const movedDepth = moved.reduce((sum, unit) => sum + (Number(unit.z || 0) - band.z) * unitQuantity(unit), 0);
  const compactedCount = sumUnitQuantity(band.units);
  return {
    placed: nextPlaced,
    movedCount: sumUnitQuantity(moved),
    changedCount: compactedCount + sumUnitQuantity(moved),
    score: sumUnitQuantity(moved) * 150000 + band.extraSlots * 60000 + band.capacity * 1000 + movedDepth + band.z
  };
}

function buildMixedEdgeOrientationStackCandidate(container, placed, stack, strategy) {
  const stackKeys = new Set(stack.units.map((unit) => unit.unitKey));
  const nextPlaced = placed
    .filter((unit) => !stackKeys.has(unit.unitKey))
    .map(copyUnit);
  const supportRatio = lowerGapSwapSupportRatio(container, stack.units[0]);
  const normalSlots = stack.normalRows * stack.normalCapacity;
  let sourceIndex = 0;
  let changedCount = 0;

  for (const z of stack.layerBottoms) {
    const layerCount = Math.min(stack.layerCapacity, stack.units.length - sourceIndex);
    for (let index = 0; index < layerCount; index += 1) {
      const source = stack.units[sourceIndex];
      const unit = stripPlacement(source);
      const inNormalRows = index < normalSlots;
      const lengthCm = inNormalRows ? stack.normalLength : stack.rotatedLength;
      const widthCm = inNormalRows ? stack.normalWidth : stack.rotatedWidth;
      const orientation = orientationForDims(unit, lengthCm, widthCm, stack.height);
      if (!orientation) return null;
      const localIndex = inNormalRows ? index : index - normalSlots;
      const rowCapacity = inNormalRows ? stack.normalCapacity : stack.rotatedCapacity;
      const rowIndex = Math.floor(localIndex / rowCapacity);
      const columnIndex = localIndex % rowCapacity;
      const rowY = inNormalRows
        ? stack.y + rowIndex * stack.normalWidth
        : stack.y + stack.normalRows * stack.normalWidth + rowIndex * stack.rotatedWidth;
      const placement = {
        ...orientation,
        x: round3(stack.minX + columnIndex * lengthCm),
        y: round3(rowY),
        z: round3(z)
      };
      const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
      if (!validation.valid) return null;
      if (placementChanged(source, placement)) changedCount += unitQuantity(source);
      nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
      sourceIndex += 1;
    }
  }

  if (sourceIndex < stack.units.length || !changedCount) return null;
  const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
  if (!finalValidation.valid) return null;
  return {
    placed: nextPlaced,
    movedCount: 0,
    changedCount,
    score: changedCount * 260000 + stack.units.length * 1200 + stack.layerBottoms.length * 50000 - stack.layerBottoms[0]
  };
}

function buildMixedEdgeOrientationLayerCandidate(container, placed, layer, strategy) {
  const layerKeys = new Set(layer.units.map((unit) => unit.unitKey));
  const nextPlaced = placed
    .filter((unit) => !layerKeys.has(unit.unitKey))
    .map(copyUnit);
  const supportRatio = lowerGapSwapSupportRatio(container, layer.units[0]);
  const normalSlots = layer.normalRows * layer.normalCapacity;
  let changedCount = 0;

  for (let index = 0; index < layer.units.length; index += 1) {
    const source = layer.units[index];
    const unit = stripPlacement(source);
    const inNormalRows = index < normalSlots;
    const lengthCm = inNormalRows ? layer.normalLength : layer.rotatedLength;
    const widthCm = inNormalRows ? layer.normalWidth : layer.rotatedWidth;
    const orientation = orientationForDims(unit, lengthCm, widthCm, layer.height);
    if (!orientation) return null;
    const localIndex = inNormalRows ? index : index - normalSlots;
    const rowCapacity = inNormalRows ? layer.normalCapacity : layer.rotatedCapacity;
    const rowIndex = Math.floor(localIndex / rowCapacity);
    const columnIndex = localIndex % rowCapacity;
    const rowY = inNormalRows
      ? layer.y + rowIndex * layer.normalWidth
      : layer.y + layer.normalRows * layer.normalWidth + rowIndex * layer.rotatedWidth;
    const placement = {
      ...orientation,
      x: round3(layer.minX + columnIndex * lengthCm),
      y: round3(rowY),
      z: round3(layer.z)
    };
    const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
    if (!validation.valid) return null;
    if (placementChanged(source, placement)) changedCount += unitQuantity(source);
    nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
  }

  if (!changedCount) return null;
  const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
  if (!finalValidation.valid) return null;
  const tailCount = Math.max(0, layer.units.length - normalSlots);
  return {
    placed: nextPlaced,
    movedCount: 0,
    changedCount,
    score: changedCount * 180000 + tailCount * 50000 + layer.units.length * 1000 - layer.z
  };
}

function placementChanged(source, placement) {
  return Math.abs(Number(source.x || 0) - Number(placement.x || 0)) > EPS
    || Math.abs(Number(source.y || 0) - Number(placement.y || 0)) > EPS
    || Math.abs(Number(source.z || 0) - Number(placement.z || 0)) > EPS
    || Math.abs(Number(source.lengthCm || 0) - Number(placement.lengthCm || 0)) > EPS
    || Math.abs(Number(source.widthCm || 0) - Number(placement.widthCm || 0)) > EPS
    || Math.abs(Number(source.heightCm || 0) - Number(placement.heightCm || 0)) > EPS;
}

function orientationForDims(unit, lengthCm, widthCm, heightCm) {
  return generateOrientations(unit).find((dims) =>
    Math.abs(Number(dims.lengthCm || 0) - lengthCm) < EPS
    && Math.abs(Number(dims.widthCm || 0) - widthCm) < EPS
    && Math.abs(Number(dims.heightCm || 0) - heightCm) < EPS
  );
}

function lowerGapSwapSupportRatio(container, unit) {
  return supportRatioForUnit(container, unit);
}

function validatePlacement(container, placed, unit, placement, supportRatio = DEFAULT_SUPPORT_RATIO) {
  if (Number(container?.payloadKg || 0) > 0
    && placedWeightKg(placed) + Math.max(0, Number(unit?.weightKg || 0)) > Number(container.payloadKg) + EPS) {
    return { valid: false, reason: "payload-exceeded" };
  }
  if (!fitsContainerDims(container, placement)) return { valid: false, reason: "out-of-bounds" };
  if (placed.some((box) => intersects(placement, box))) return { valid: false, reason: "intersects" };
  if (!hasSupport(placement, placed, supportRatio)) return { valid: false, reason: "unsupported" };
  if (unit.nonStack && hasAnyBoxInColumnAbove(placement, placed)) return { valid: false, reason: "nonstack-under-load" };
  return { valid: true, reason: "" };
}

function validateAllPlacements(container, placed) {
  return validateAllPlacementsDetailed(container, placed).valid;
}

function validateAllPlacementsDetailed(container, placed) {
  if (Number(container?.payloadKg || 0) > 0 && placedWeightKg(placed) > Number(container.payloadKg) + EPS) {
    return { valid: false, reason: "payload-exceeded" };
  }
  for (let i = 0; i < placed.length; i += 1) {
    const current = placed[i];
    if (!fitsContainerDims(container, current)) return { valid: false, reason: "out-of-bounds", unit: current.unitKey };
    for (let j = i + 1; j < placed.length; j += 1) {
      if (intersects(current, placed[j])) return { valid: false, reason: "intersects", unit: current.unitKey, other: placed[j].unitKey };
    }
    const below = placed.filter((_, index) => index !== i);
    if (!hasSupport(current, below, supportRatioForUnit(container, current))) {
      return { valid: false, reason: "unsupported", unit: current.unitKey, z: current.z, x: current.x, y: current.y };
    }
    if (current.nonStack && hasAnyBoxInColumnAbove(current, below)) return { valid: false, reason: "nonstack-under-load", unit: current.unitKey };
  }
  return { valid: true };
}

function centerPackedLayout(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  if (isBalanceExempt(container, attempt.placed)) return attempt;
  const balance = calculateWeightBalance(container, attempt.placed);
  if (!balance.valid) return attempt;
  const bounds = placementBounds(attempt.placed);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const shiftX = clamp(centerX - balance.center.xCm, -bounds.minX, Number(container.lengthCm || 0) - bounds.maxX);
  const shiftY = clamp(centerY - balance.center.yCm, -bounds.minY, Number(container.widthCm || 0) - bounds.maxY);
  if (Math.abs(shiftX) < EPS && Math.abs(shiftY) < EPS) return attempt;

  const shifted = attempt.placed.map((unit) => ({
    ...unit,
    x: round3(Number(unit.x || 0) + shiftX),
    y: round3(Number(unit.y || 0) + shiftY)
  }));
  if (!validateAllPlacements(container, shifted)) return attempt;

  return makePackedBox(shifted, attempt.unplaced.map(copyUnit), {
    id: attempt.strategyId || strategy.id,
    name: attempt.strategyName || strategy.name
  }, {
    ...(attempt.strategySummary || {}),
    centeredShiftX: shiftX,
    centeredShiftY: shiftY
  });
}

function placementBounds(placed) {
  return placed.reduce((bounds, unit) => ({
    minX: Math.min(bounds.minX, Number(unit.x || 0)),
    minY: Math.min(bounds.minY, Number(unit.y || 0)),
    maxX: Math.max(bounds.maxX, Number(unit.x || 0) + Number(unit.lengthCm || 0)),
    maxY: Math.max(bounds.maxY, Number(unit.y || 0) + Number(unit.widthCm || 0))
  }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickLayerSeedIndex(units, container, placed, strategy, options = {}) {
  let bestStackable = -1;
  let bestStackableScore = null;
  let bestNonStack = -1;
  let bestNonStackScore = null;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const placement = packExtremePoint(container, placed, unit, strategy, options);
    if (!placement) continue;
    const score = layerSeedScore(units, unit, placement, container, strategy);
    if (unit.nonStack) {
      if (!bestNonStackScore || compareLayerSeedScore(score, bestNonStackScore, strategy) < 0) {
        bestNonStack = i;
        bestNonStackScore = score;
      }
    } else if (!bestStackableScore || compareLayerSeedScore(score, bestStackableScore, strategy) < 0) {
      bestStackable = i;
      bestStackableScore = score;
    }
  }
  return bestStackable >= 0 ? bestStackable : bestNonStack;
}

function layerSeedScore(units, unit, placement, container, strategy) {
  const area = placement.lengthCm * placement.widthCm;
  const score = {
    z: Number(placement.z || 0),
    area,
    heightCm: Number(placement.heightCm || 0),
    rowArea: area,
    rowCount: unitQuantity(unit),
    xFill: Number(placement.lengthCm || 0) / Math.max(1, Number(container.lengthCm || 0)),
    yFill: Number(placement.widthCm || 0) / Math.max(1, Number(container.widthCm || 0))
  };
  if (!usesLayerRowFill(strategy)) return score;

  const availableBlocks = units.filter((candidate) => sameLayerRowUnit(candidate, unit)).length;
  const rowCapacity = Math.max(1, Math.floor((Number(container.lengthCm || 0) + EPS) / Math.max(EPS, Number(placement.lengthCm || 0))));
  const rowBlocks = Math.min(availableBlocks, rowCapacity);
  score.rowArea = rowBlocks * area;
  score.rowCount = rowBlocks * unitQuantity(unit);
  score.xFill = rowBlocks * Number(placement.lengthCm || 0) / Math.max(1, Number(container.lengthCm || 0));
  return score;
}

function compareLayerSeedScore(a, b, strategy) {
  if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
  if (usesLayerRowFill(strategy)) {
    if (Math.abs(a.rowArea - b.rowArea) > EPS) return b.rowArea - a.rowArea;
    if (a.rowCount !== b.rowCount) return b.rowCount - a.rowCount;
    if (Math.abs(a.xFill - b.xFill) > EPS) return b.xFill - a.xFill;
    if (Math.abs(a.yFill - b.yFill) > EPS) return b.yFill - a.yFill;
  }
  if (Math.abs(a.area - b.area) > EPS) return b.area - a.area;
  return b.heightCm - a.heightCm;
}

function orderLayerCandidates(units, layerBottom, layerTop, strategy, layerSeed = null) {
  return [...units].sort((a, b) => {
    if (a.nonStack !== b.nonStack) return a.nonStack ? 1 : -1;
    if (usesLayerRowFill(strategy) && layerSeed) {
      const aMatchesSeed = sameLayerRowUnit(a, layerSeed);
      const bMatchesSeed = sameLayerRowUnit(b, layerSeed);
      if (aMatchesSeed !== bMatchesSeed) return aMatchesSeed ? -1 : 1;
    }
    if (layerTop == null || !Number.isFinite(Number(layerTop))) {
      return orderUnits([a, b], strategy.unitOrder)[0].unitKey === a.unitKey ? -1 : 1;
    }
    const aCanShare = a.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS);
    const bCanShare = b.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS);
    if (aCanShare !== bCanShare) return aCanShare ? -1 : 1;
    return orderUnits([a, b], strategy.unitOrder)[0].unitKey === a.unitKey ? -1 : 1;
  });
}

function usesLayerRowFill(strategy) {
  return strategy?.id === LAYER_ROW_FILL_STRATEGY_ID;
}

function sameLayerRowUnit(a, b) {
  return sameRepackCargo(a, b)
    && unitQuantity(a) === unitQuantity(b)
    && Number(a.groupCols || 1) === Number(b.groupCols || 1)
    && Number(a.groupRows || 1) === Number(b.groupRows || 1)
    && Math.abs(Number(a.packedLengthCm || a.lengthCm || 0) - Number(b.packedLengthCm || b.lengthCm || 0)) < EPS
    && Math.abs(Number(a.packedWidthCm || a.widthCm || 0) - Number(b.packedWidthCm || b.widthCm || 0)) < EPS
    && Math.abs(Number(a.packedHeightCm || a.heightCm || 0) - Number(b.packedHeightCm || b.heightCm || 0)) < EPS;
}

function extremePoints(container, placed, dims, options = {}) {
  const points = new Map();
  const heightLimit = containerHeightLimit(container);
  const layerBottom = Number(options.layerBottom);
  const hasLayerBottom = Number.isFinite(layerBottom);
  const layerTop = Number(options.layerTop);
  const hasLayerTop = Number.isFinite(layerTop);
  const floorOnly = Boolean(options.floorOnly);
  const baseZOnly = Boolean(options.baseZOnly);
  const baseZ = hasLayerBottom ? layerBottom : 0;
  const add = (x, y, z) => {
    const point = { x: round3(x), y: round3(y), z: round3(z) };
    if (point.x < -EPS || point.y < -EPS || point.z < -EPS) return;
    if (floorOnly && Math.abs(point.z) > EPS) return;
    if (baseZOnly && Math.abs(point.z - baseZ) > EPS) return;
    if (point.x + dims.lengthCm > container.lengthCm + EPS) return;
    if (point.y + dims.widthCm > container.widthCm + EPS) return;
    if (point.z + dims.heightCm > heightLimit + EPS) return;
    if (hasLayerBottom && point.z < layerBottom - EPS) return;
    if (hasLayerTop && point.z + dims.heightCm > layerTop + EPS) return;
    points.set(`${point.x}/${point.y}/${point.z}`, point);
  };

  add(0, 0, 0);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const xAnchors = [0, centerX - dims.lengthCm, centerX - dims.lengthCm / 2, centerX, container.lengthCm - dims.lengthCm];
  const yAnchors = [0, centerY - dims.widthCm, centerY - dims.widthCm / 2, centerY, container.widthCm - dims.widthCm];
  const zAnchors = floorOnly ? [0] : baseZOnly ? [baseZ] : uniqueSorted(placed.map((box) => box.z + box.heightCm), 0);
  for (const z of zAnchors) {
    for (const x of xAnchors) {
      for (const y of yAnchors) add(x, y, z);
    }
  }
  for (const box of placed) {
    add(box.x - dims.lengthCm, box.y, box.z);
    add(box.x, box.y - dims.widthCm, box.z);
    add(box.x + box.lengthCm, box.y, box.z);
    add(box.x, box.y + box.widthCm, box.z);
    if (!floorOnly) add(box.x, box.y, box.z + box.heightCm);
    add(box.x + box.lengthCm, box.y + box.widthCm, box.z);
    if (!floorOnly) {
      add(box.x + box.lengthCm, box.y, box.z + box.heightCm);
      add(box.x, box.y + box.widthCm, box.z + box.heightCm);
      add(box.x + box.lengthCm, box.y + box.widthCm, box.z + box.heightCm);
    }
  }

  const zs = floorOnly ? [0] : baseZOnly ? [baseZ] : uniqueSorted(placed.map((box) => box.z + box.heightCm), 0);
  const xs = uniqueSorted(placed.flatMap((box) => [box.x, box.x + box.lengthCm]), 0);
  const ys = uniqueSorted(placed.flatMap((box) => [box.y, box.y + box.widthCm]), 0);
  for (const z of zs) {
    for (const x of xs) add(x, 0, z);
    for (const y of ys) add(0, y, z);
  }
  addDenseEdgeIntersections(container, placed, dims, zs, add);
  if (options.denseTop) {
    for (const z of zs) {
      const supportsAtLevel = placed.filter((box) => Math.abs(box.z + box.heightCm - z) < EPS);
      for (const box of supportsAtLevel) {
        const localXs = [
          0,
          box.x - dims.lengthCm,
          box.x,
          box.x + box.lengthCm - dims.lengthCm,
          box.x + box.lengthCm,
          container.lengthCm - dims.lengthCm
        ];
        const localYs = [
          0,
          box.y - dims.widthCm,
          box.y,
          box.y + box.widthCm - dims.widthCm,
          box.y + box.widthCm,
          container.widthCm - dims.widthCm
        ];
        for (const x of localXs) {
          for (const y of localYs) add(x, y, z);
        }
      }
    }
  }

  return [...points.values()].sort((a, b) => {
    if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
    if (Math.abs(a.y - b.y) > EPS) return a.y - b.y;
    return a.x - b.x;
  });
}

function addDenseEdgeIntersections(container, placed, dims, zs, add) {
  if (!placed?.length || !zs?.length) return;
  const maxEdgeCombinations = 900;
  const lengthLimit = Number(container.lengthCm || 0);
  const widthLimit = Number(container.widthCm || 0);
  const xs = uniqueSorted(placed.flatMap((box) => [
    0,
    lengthLimit - dims.lengthCm,
    box.x,
    box.x + box.lengthCm,
    box.x - dims.lengthCm,
    box.x + box.lengthCm - dims.lengthCm
  ]));
  const ys = uniqueSorted(placed.flatMap((box) => [
    0,
    widthLimit - dims.widthCm,
    box.y,
    box.y + box.widthCm,
    box.y - dims.widthCm,
    box.y + box.widthCm - dims.widthCm
  ]));
  const usableXs = xs.filter((x) => x >= -EPS && x + dims.lengthCm <= lengthLimit + EPS);
  const usableYs = ys.filter((y) => y >= -EPS && y + dims.widthCm <= widthLimit + EPS);
  if (!usableXs.length || !usableYs.length || usableXs.length * usableYs.length > maxEdgeCombinations) return;
  for (const z of zs) {
    for (const x of usableXs) {
      for (const y of usableYs) add(x, y, z);
    }
  }
}

function hasSupport(placement, placed, supportRatio = DEFAULT_SUPPORT_RATIO) {
  const physicalPlacement = physicalPlacementBox(placement);
  if (physicalPlacement.z <= EPS) return true;
  const requiredRatio = clampNumber(supportRatio, 0.1, 1, DEFAULT_SUPPORT_RATIO);
  const targets = physicalFootprintRects(placement);
  const supportRects = placed
    .filter((box) => {
      if (box.nonStack) return false;
      const physicalBox = physicalPlacementBox(box);
      return Math.abs(physicalBox.z + physicalBox.heightCm - physicalPlacement.z) < EPS;
    })
    .flatMap((box) => physicalFootprintRects(box));
  if (!supportRects.length) return false;
  return targets.every((target) => {
    const overlaps = supportRects.map((support) => overlapRect(target, support)).filter(Boolean);
    const footprint = target.lengthCm * target.widthCm;
    if (unionArea(overlaps) + EPS < footprint * requiredRatio) return false;
    return hasDistributedSupport(target, overlaps, requiredRatio);
  });
}

function supportCoverageRatio(placement, placed) {
  const physicalPlacement = physicalPlacementBox(placement);
  if (physicalPlacement.z <= EPS) return 1;
  const targets = physicalFootprintRects(placement);
  const supportRects = placed
    .filter((box) => {
      if (box.nonStack) return false;
      const physicalBox = physicalPlacementBox(box);
      return Math.abs(physicalBox.z + physicalBox.heightCm - physicalPlacement.z) < EPS;
    })
    .flatMap((box) => physicalFootprintRects(box));
  const footprint = targets.reduce((sum, target) => sum + target.lengthCm * target.widthCm, 0);
  if (!supportRects.length || footprint <= EPS) return 0;
  const supportedArea = targets.reduce((sum, target) => {
    const overlaps = supportRects.map((support) => overlapRect(target, support)).filter(Boolean);
    return sum + unionArea(overlaps);
  }, 0);
  return clampNumber(supportedArea / footprint, 0, 1, 0);
}

function hasDistributedSupport(target, supports, requiredRatio) {
  if (!supportSamplePoints(target).every((point) => supports.some((support) => pointInRect(point, support)))) {
    return false;
  }
  const minQuadrantRatio = clampNumber(requiredRatio - 0.35, 0.25, 0.7, 0.4);
  return supportQuadrants(target).every((quadrant) => {
    const overlaps = supports.map((support) => overlapRect(quadrant, support)).filter(Boolean);
    if (!overlaps.length) return false;
    const area = quadrant.lengthCm * quadrant.widthCm;
    return unionArea(overlaps) + EPS >= area * minQuadrantRatio;
  });
}

function supportSamplePoints(target) {
  const insetX = supportInset(target.lengthCm);
  const insetY = supportInset(target.widthCm);
  const x1 = target.x + insetX;
  const x2 = target.x + target.lengthCm - insetX;
  const y1 = target.y + insetY;
  const y2 = target.y + target.widthCm - insetY;
  const cx = target.x + target.lengthCm / 2;
  const cy = target.y + target.widthCm / 2;
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x1, y: y2 },
    { x: x2, y: y2 },
    { x: cx, y: cy }
  ];
}

function supportInset(size) {
  const numeric = Math.max(0, Number(size || 0));
  return Math.min(numeric / 2, 15, Math.max(3, numeric * 0.12));
}

function supportQuadrants(target) {
  const halfLength = target.lengthCm / 2;
  const halfWidth = target.widthCm / 2;
  return [
    { x: target.x, y: target.y, lengthCm: halfLength, widthCm: halfWidth },
    { x: target.x + halfLength, y: target.y, lengthCm: halfLength, widthCm: halfWidth },
    { x: target.x, y: target.y + halfWidth, lengthCm: halfLength, widthCm: halfWidth },
    { x: target.x + halfLength, y: target.y + halfWidth, lengthCm: halfLength, widthCm: halfWidth }
  ];
}

function pointInRect(point, rect) {
  return point.x >= rect.x - EPS
    && point.x <= rect.x + rect.lengthCm + EPS
    && point.y >= rect.y - EPS
    && point.y <= rect.y + rect.widthCm + EPS;
}

function hasAnyBoxAbove(unit, placed) {
  const top = unit.z + unit.heightCm;
  return placed.some((box) =>
    Math.abs(box.z - top) < EPS
    && overlapRect(
      { x: unit.x, y: unit.y, lengthCm: unit.lengthCm, widthCm: unit.widthCm },
      { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }
    )
  );
}

function hasAnyBoxInColumnAbove(unit, placed) {
  const top = unit.z + unit.heightCm;
  return placed.some((box) =>
    box.z >= top - EPS
    && overlapRect(
      { x: unit.x, y: unit.y, lengthCm: unit.lengthCm, widthCm: unit.widthCm },
      { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }
    )
  );
}

function makePackedBox(placed, unplaced, strategy, stats) {
  return {
    placed,
    unplaced,
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategySummary: {
      placedCount: sumUnitQuantity(placed),
      unplacedCount: sumUnitQuantity(unplaced),
      solverPlacedCount: placed.length,
      solverUnplacedCount: unplaced.length,
      occupiedVolumeM3: round(sumOccupiedVolumeM3(placed)),
      maxTopCm: round(maxTop(placed)),
      refillPlacedCount: Number(stats.repairedCount || 0),
      refillPasses: Number(stats.localSearchPasses || 0),
      blockDowngradePasses: Number(stats.blockDowngradePasses || 0),
      blockDowngradePlacedCount: Number(stats.blockDowngradePlacedCount || 0),
      singleBackfillPlacedCount: Number(stats.singleBackfillPlacedCount || 0),
      nonStackTopPlacedCount: Number(stats.nonStackTopPlacedCount || 0),
      nonStackDisplacementSwapCount: Number(stats.nonStackDisplacementSwapCount || 0),
      nonStackDisplacementPlacedCount: Number(stats.nonStackDisplacementPlacedCount || 0),
      edgeOrientationRepackCount: Number(stats.edgeOrientationRepackCount || stats.blueSideRowRepackCount || 0),
      blueSideRowRepackCount: Number(stats.edgeOrientationRepackCount || stats.blueSideRowRepackCount || 0),
      lowerGapSwapCount: Number(stats.lowerGapSwapCount || 0),
      lowerGapSwapLiftedCount: Number(stats.lowerGapSwapLiftedCount || 0),
      lowerGapSwapDepthCm: round(stats.lowerGapSwapDepthCm || 0),
      verticalTailFillCount: Number(stats.verticalTailFillCount || 0),
      verticalTailSupportGain: round(stats.verticalTailSupportGain || 0),
      sparseTailSpreadCount: Number(stats.sparseTailSpreadCount || 0),
      sparseTailBackfillPlacedCount: Number(stats.sparseTailBackfillPlacedCount || 0),
      sparseTailSupportGain: round(stats.sparseTailSupportGain || 0),
      deckFloorPlacedCount: Number(stats.deckFloorPlacedCount || 0),
      layerCount: Number(stats.layerCount || countLayers(placed)),
      balanceSeverity: stats.balanceValidation?.severity || "",
      balanceScore: round(stats.balanceValidation?.score || 0),
      balanceRejectedCount: Number(stats.balanceRejectedCount || 0)
    }
  };
}

function chooseRemovalSet(placed, unplaced, size, pass) {
  const unplacedCargoIds = new Set(unplaced.map((unit) => unit.cargoId));
  const ordered = [...placed].sort((a, b) => {
    const aRelated = unplacedCargoIds.has(a.cargoId) ? 0 : 1;
    const bRelated = unplacedCargoIds.has(b.cargoId) ? 0 : 1;
    if (aRelated !== bRelated) return aRelated - bRelated;
    if (pass % 2 === 0) return (b.z + b.heightCm) - (a.z + a.heightCm);
    return a.x - b.x || a.y - b.y || b.z - a.z;
  });
  return new Set(ordered.slice(0, size).map((unit) => unit.unitKey));
}

function orderUnits(units, strategyId) {
  return [...units].sort((a, b) => {
    if (a.nonStack !== b.nonStack) return a.nonStack ? 1 : -1;
    if (strategyId === "small-vertical") {
      const smallDiff = smallItemRank(a) - smallItemRank(b);
      if (smallDiff) return smallDiff;
    }
    if (strategyId === "height") {
      const heightDiff = tallestOrientation(b) - tallestOrientation(a);
      if (Math.abs(heightDiff) > EPS) return heightDiff;
    }
    if (strategyId === "footprint") {
      const areaDiff = maxFootprint(b) - maxFootprint(a);
      if (Math.abs(areaDiff) > EPS) return areaDiff;
      const volumeDiff = unitVolumeCm3(b) - unitVolumeCm3(a);
      if (Math.abs(volumeDiff) > EPS) return volumeDiff;
      const weightDiff = Number(b.weightKg || 0) - Number(a.weightKg || 0);
      if (Math.abs(weightDiff) > EPS) return weightDiff;
      if (a.cargoIndex !== b.cargoIndex) return a.cargoIndex - b.cargoIndex;
      return a.itemIndex - b.itemIndex;
    }
    const weightDiff = Number(b.weightKg || 0) - Number(a.weightKg || 0);
    if (Math.abs(weightDiff) > EPS) return weightDiff;
    const areaDiff = maxFootprint(b) - maxFootprint(a);
    if (Math.abs(areaDiff) > EPS) return areaDiff;
    const volumeDiff = unitVolumeCm3(b) - unitVolumeCm3(a);
    if (Math.abs(volumeDiff) > EPS) return volumeDiff;
    if (a.cargoIndex !== b.cargoIndex) return a.cargoIndex - b.cargoIndex;
    return a.itemIndex - b.itemIndex;
  });
}

function comparePackAttempt(container) {
  return (a, b) => {
    const balanceRankDiff = balanceSeverityRank(a.balanceValidation) - balanceSeverityRank(b.balanceValidation);
    if (balanceRankDiff) return balanceRankDiff;
    if (isFlatRackUsage(container)) {
      const aPlacedCount = sumUnitQuantity(a.placed);
      const bPlacedCount = sumUnitQuantity(b.placed);
      if (aPlacedCount !== bPlacedCount) return bPlacedCount - aPlacedCount;
      const deckDiff = placementDeckAreaM2(b.placed) - placementDeckAreaM2(a.placed);
      if (Math.abs(deckDiff) > EPS) return deckDiff;
      const topDiff = maxTop(a.placed) - maxTop(b.placed);
      if (Math.abs(topDiff) > EPS) return topDiff;
      const lengthDiff = lengthUtilizationPercent(container, b.placed) - lengthUtilizationPercent(container, a.placed);
      if (Math.abs(lengthDiff) > EPS) return lengthDiff;
    }
    const occupiedDiff = sumOccupiedVolumeM3(b.placed) - sumOccupiedVolumeM3(a.placed);
    if (Math.abs(occupiedDiff) > EPS) return occupiedDiff;
    const rawVolumeDiff = sumCargoVolumeM3(b.placed) - sumCargoVolumeM3(a.placed);
    if (Math.abs(rawVolumeDiff) > EPS) return rawVolumeDiff;
    const aPlacedCount = sumUnitQuantity(a.placed);
    const bPlacedCount = sumUnitQuantity(b.placed);
    if (aPlacedCount !== bPlacedCount) return bPlacedCount - aPlacedCount;
    const supportDiff = supportSurfaceScore(b.placed, container) - supportSurfaceScore(a.placed, container);
    if (Math.abs(supportDiff) > EPS) return supportDiff;
    const topDiff = maxTop(a.placed) - maxTop(b.placed);
    if (Math.abs(topDiff) > EPS) return topDiff;
    return a.unplaced.length - b.unplaced.length;
  };
}

function withBalanceValidation(container, attempt, rejectedByBalance = 0) {
  const validation = validateWeightBalance(container, attempt.placed);
  attempt.balanceValidation = validation;
  attempt.strategySummary = {
    ...attempt.strategySummary,
    balanceSeverity: validation.severity,
    balanceScore: round(validation.score),
    balanceRejected: validation.severity === "red",
    balanceRejectedCount: rejectedByBalance
  };
  return attempt;
}

function projectedBalancePenalty(container, placed, unit, placement) {
  if (isProjectedBalanceExempt(container, placed, unit)) return 0;
  const candidate = applyPlacement(unit, placement);
  const validation = validateWeightBalance(container, [...placed, candidate]);
  const rules = balanceRuleSettings(container);
  const isEarlySpread = placed.length < Math.min(3, BALANCE_ZONE_ORDER.length - 1);
  const severityPenalty = isEarlySpread ? 0 : validation.severity === "red" ? 3 : validation.severity === "yellow" ? 1 : 0;
  const weight = isEarlySpread ? EARLY_BALANCE_SCORE_WEIGHT : BALANCE_SCORE_WEIGHT;
  return (validation.score + severityPenalty * rules.redLimitPercent) * weight;
}

function validateWeightBalance(container, placed) {
  const balance = calculateWeightBalance(container, placed);
  if (!balance.valid) return balance;
  const rules = balanceRuleSettings(container);
  const lightLoadSearchMode = balance.totalWeightKg <= rules.skipBelowWeightKg + EPS;
  if (lightLoadSearchMode) {
    return {
      ...balance,
      severity: "exempt",
      score: 0,
      balanceExempt: true,
      message: `单箱总重 ${round(balance.totalWeightKg / 1000)}t 低于轻载不拦截阈值 ${round(rules.skipBelowWeightKg / 1000)}t，按业务设置跳过偏载拦截，优先装满。`,
      limits: {
        greenPercent: rules.greenLimitPercent,
        redPercent: rules.redLimitPercent,
        frontMaxPercent: rules.frontMaxPercent,
        rearMinPercent40FR: null,
        lateralOffsetLimitCm: rules.lateralOffsetLimitCm,
        skipBelowWeightKg: rules.skipBelowWeightKg
      },
      checks: {
        frontPercent: round(balance.loads.frontPercent),
        rearPercent: round(balance.loads.rearPercent),
        frontRearDiffPercent: round(Math.abs(balance.loads.frontPercent - balance.loads.rearPercent)),
        leftRightDiffPercent: round(Math.abs(balance.loads.leftPercent - balance.loads.rightPercent)),
        longitudinalOffsetPercent: round(Math.abs(balance.offset.longitudinalPercent)),
        lateralOffsetPercent: round(Math.abs(balance.offset.lateralPercent)),
        lateralOffsetCm: round(Math.abs(balance.offset.lateralCm)),
        requiresRearMinimum: false,
        lightLoadSearchMode: true
      }
    };
  }

  const frontRearDiffPercent = Math.abs(balance.loads.frontPercent - balance.loads.rearPercent);
  const leftRightDiffPercent = Math.abs(balance.loads.leftPercent - balance.loads.rightPercent);
  const longitudinalOffsetPercent = Math.abs(balance.offset.longitudinalPercent);
  const lateralOffsetPercent = Math.abs(balance.offset.lateralPercent);
  const lateralOffsetCm = Math.abs(balance.offset.lateralCm);
  const requiresRearMinimum = isFortyFootFlatRack(container);
  const frontMaxExcess = Math.max(0, balance.loads.frontPercent - rules.frontMaxPercent);
  const rearMinExcess = requiresRearMinimum ? Math.max(0, rules.rearMinPercent40FR - balance.loads.rearPercent) : 0;
  const frontRearExcess = Math.max(0, frontRearDiffPercent - rules.redLimitPercent);
  const leftRightExcess = Math.max(0, leftRightDiffPercent - rules.redLimitPercent);
  const longitudinalExcess = Math.max(0, longitudinalOffsetPercent - rules.redLimitPercent);
  const lateralPercentExcess = Math.max(0, lateralOffsetPercent - rules.redLimitPercent);
  const lateralCmExcess = Math.max(0, lateralOffsetCm - rules.lateralOffsetLimitCm);
  const red = frontMaxExcess > EPS
    || rearMinExcess > EPS
    || frontRearExcess > EPS
    || leftRightExcess > EPS
    || longitudinalExcess > EPS
    || lateralPercentExcess > EPS
    || lateralCmExcess > EPS;
  const warningScore = Math.max(
    frontRearDiffPercent,
    leftRightDiffPercent,
    longitudinalOffsetPercent,
    lateralOffsetPercent,
    lateralOffsetCm / rules.lateralOffsetLimitCm * rules.redLimitPercent
  );
  const yellow = !red && (
    warningScore > rules.greenLimitPercent + EPS
    || balance.loads.frontPercent > rules.frontMaxPercent - rules.greenLimitPercent
    || (requiresRearMinimum && balance.loads.rearPercent < rules.rearMinPercent40FR + rules.greenLimitPercent)
  );
  const hardExcessScore = frontMaxExcess + rearMinExcess + frontRearExcess + leftRightExcess
    + longitudinalExcess + lateralPercentExcess + lateralCmExcess / rules.lateralOffsetLimitCm * rules.redLimitPercent;

  return {
    ...balance,
    severity: red ? "red" : yellow ? "yellow" : "green",
    score: warningScore + hardExcessScore * 20,
    limits: {
      greenPercent: rules.greenLimitPercent,
      redPercent: rules.redLimitPercent,
      frontMaxPercent: rules.frontMaxPercent,
      rearMinPercent40FR: requiresRearMinimum ? rules.rearMinPercent40FR : null,
      lateralOffsetLimitCm: rules.lateralOffsetLimitCm,
      skipBelowWeightKg: rules.skipBelowWeightKg
    },
    checks: {
      frontPercent: round(balance.loads.frontPercent),
      rearPercent: round(balance.loads.rearPercent),
      frontRearDiffPercent: round(frontRearDiffPercent),
      leftRightDiffPercent: round(leftRightDiffPercent),
      longitudinalOffsetPercent: round(longitudinalOffsetPercent),
      lateralOffsetPercent: round(lateralOffsetPercent),
      lateralOffsetCm: round(lateralOffsetCm),
      requiresRearMinimum,
      lightLoadSearchMode
    }
  };
}

function calculateWeightBalance(container, placed) {
  const lengthCm = Number(container?.lengthCm || 0);
  const widthCm = Number(container?.widthCm || 0);
  const heightCm = containerHeightLimit(container);
  const centerX = lengthCm / 2;
  const centerY = widthCm / 2;
  const centerZ = heightCm / 2;
  let totalWeightKg = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  const loads = {
    frontLeftKg: 0,
    frontRightKg: 0,
    rearLeftKg: 0,
    rearRightKg: 0
  };

  for (const item of placed || []) {
    const weightKg = Math.max(0, Number(item.weightKg || 0));
    if (!weightKg) continue;
    const x = Number(item.x || 0);
    const y = Number(item.y || 0);
    const z = Number(item.z || 0);
    const itemLength = Math.max(0, Number(item.lengthCm || 0));
    const itemWidth = Math.max(0, Number(item.widthCm || 0));
    const itemHeight = Math.max(0, Number(item.heightCm || 0));
    totalWeightKg += weightKg;
    weightedX += (x + itemLength / 2) * weightKg;
    weightedY += (y + itemWidth / 2) * weightKg;
    weightedZ += (z + itemHeight / 2) * weightKg;
    addSplitLoads(loads, weightKg, x, y, itemLength, itemWidth, centerX, centerY);
  }

  if (!totalWeightKg) return emptyWeightBalance(container);

  const xCm = weightedX / totalWeightKg;
  const yCm = weightedY / totalWeightKg;
  const zCm = weightedZ / totalWeightKg;
  const frontKg = loads.frontLeftKg + loads.frontRightKg;
  const rearKg = loads.rearLeftKg + loads.rearRightKg;
  const leftKg = loads.frontLeftKg + loads.rearLeftKg;
  const rightKg = loads.frontRightKg + loads.rearRightKg;
  const offsetXCm = xCm - centerX;
  const offsetYCm = yCm - centerY;
  const offsetZCm = zCm - centerZ;

  return {
    valid: true,
    totalWeightKg,
    center: { xCm, yCm, zCm },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: offsetXCm,
      yCm: offsetYCm,
      zCm: offsetZCm,
      longitudinalCm: offsetXCm,
      lateralCm: offsetYCm,
      horizontalCm: Math.hypot(offsetXCm, offsetYCm),
      horizontalPercent: Math.hypot(
        centerX ? offsetXCm / centerX : 0,
        centerY ? offsetYCm / centerY : 0
      ) * 100,
      xPercent: centerX ? offsetXCm / centerX * 100 : 0,
      yPercent: centerY ? offsetYCm / centerY * 100 : 0,
      zPercent: centerZ ? offsetZCm / centerZ * 100 : 0,
      longitudinalPercent: centerX ? offsetXCm / centerX * 100 : 0,
      lateralPercent: centerY ? offsetYCm / centerY * 100 : 0
    },
    loads: {
      frontKg,
      rearKg,
      leftKg,
      rightKg,
      frontPercent: frontKg / totalWeightKg * 100,
      rearPercent: rearKg / totalWeightKg * 100,
      leftPercent: leftKg / totalWeightKg * 100,
      rightPercent: rightKg / totalWeightKg * 100,
      ...loads,
      frontLeftPercent: loads.frontLeftKg / totalWeightKg * 100,
      frontRightPercent: loads.frontRightKg / totalWeightKg * 100,
      rearLeftPercent: loads.rearLeftKg / totalWeightKg * 100,
      rearRightPercent: loads.rearRightKg / totalWeightKg * 100
    }
  };
}

function addSplitLoads(loads, weightKg, x, y, lengthCm, widthCm, centerX, centerY) {
  const area = Math.max(EPS, lengthCm * widthCm);
  const frontLength = overlapLength(x, x + lengthCm, 0, centerX);
  const rearLength = overlapLength(x, x + lengthCm, centerX, centerX * 2);
  const leftWidth = overlapLength(y, y + widthCm, 0, centerY);
  const rightWidth = overlapLength(y, y + widthCm, centerY, centerY * 2);
  const portions = [
    ["frontLeftKg", frontLength * leftWidth],
    ["frontRightKg", frontLength * rightWidth],
    ["rearLeftKg", rearLength * leftWidth],
    ["rearRightKg", rearLength * rightWidth]
  ];
  const covered = portions.reduce((sum, [, value]) => sum + value, 0);
  if (covered <= EPS) {
    const front = x + lengthCm / 2 <= centerX ? "front" : "rear";
    const side = y + widthCm / 2 <= centerY ? "LeftKg" : "RightKg";
    loads[`${front}${side}`] += weightKg;
    return;
  }
  portions.forEach(([key, value]) => {
    loads[key] += weightKg * value / area;
  });
}

function overlapLength(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function emptyWeightBalance(container) {
  const centerX = Number(container?.lengthCm || 0) / 2;
  const centerY = Number(container?.widthCm || 0) / 2;
  const centerZ = containerHeightLimit(container) / 2;
  return {
    valid: false,
    severity: "green",
    score: 0,
    totalWeightKg: 0,
    center: { xCm: centerX, yCm: centerY, zCm: centerZ },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: 0,
      yCm: 0,
      zCm: 0,
      longitudinalCm: 0,
      lateralCm: 0,
      horizontalCm: 0,
      horizontalPercent: 0,
      xPercent: 0,
      yPercent: 0,
      zPercent: 0,
      longitudinalPercent: 0,
      lateralPercent: 0
    },
    loads: {
      frontKg: 0,
      rearKg: 0,
      leftKg: 0,
      rightKg: 0,
      frontPercent: 0,
      rearPercent: 0,
      leftPercent: 0,
      rightPercent: 0,
      frontLeftKg: 0,
      frontRightKg: 0,
      rearLeftKg: 0,
      rearRightKg: 0,
      frontLeftPercent: 0,
      frontRightPercent: 0,
      rearLeftPercent: 0,
      rearRightPercent: 0
    }
  };
}

function balanceSeverityRank(validation) {
  if (!validation?.valid) return 0;
  return validation.severity === "red" ? 1 : 0;
}

function isFortyFootFlatRack(container) {
  const text = `${container?.name || ""} ${container?.id || ""}`.toLowerCase();
  return /40\s*fr|40fr/.test(text) || (/40/.test(text) && isFlatRackLike(container));
}

function isHeightUnlimited(container) {
  return container?.ignoreHeightLimit === true;
}

function isFlatRackLike(container) {
  const text = `${container?.id || ""} ${container?.name || ""} ${container?.visualKind || ""} ${container?.equipmentClass || ""}`.toLowerCase();
  return /fr|flat\s*rack|flatrack|flat|\u5e73\u677f/.test(text);
}

function containerHeightLimit(container) {
  const explicitLimit = Number(container?.heightLimitCm ?? container?.oogHeightLimitCm);
  if (isHeightUnlimited(container) || isFlatRackLike(container)) {
    if (Number.isFinite(explicitLimit) && explicitLimit > 0) return explicitLimit;
    return Math.max(1, Number(container?.heightCm || 0));
  }
  return Math.max(1, Number(container?.heightCm || 0));
}

function placedWeightKg(placed = []) {
  return placed.reduce((sum, unit) => sum + Math.max(0, Number(unit.weightKg || 0)), 0);
}

function isProjectedBalanceExempt(container, placed = [], unit = null) {
  const rules = balanceRuleSettings(container);
  const projectedWeight = placedWeightKg(placed) + Math.max(0, Number(unit?.weightKg || 0));
  return projectedWeight <= rules.skipBelowWeightKg + EPS;
}

function isBalanceExempt(container, placed = []) {
  const rules = balanceRuleSettings(container);
  return placedWeightKg(placed) <= rules.skipBelowWeightKg + EPS;
}

function zoneSpreadPenalty(container, placed, placement, unit = null) {
  if (!placed.length || (unit?.isHeavy && placed.length < 3)) {
    return centerDistancePenalty(container, placement);
  }
  const zone = weakestBalanceZone(container, placed);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const targetX = zone.startsWith("front")
    ? centerX - placement.lengthCm / 2
    : centerX + placement.lengthCm / 2;
  const targetY = zone.endsWith("Left")
    ? centerY - placement.widthCm / 2
    : centerY + placement.widthCm / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  return Math.abs(unitCenterX - targetX) + Math.abs(unitCenterY - targetY);
}

function centerDistancePenalty(container, placement) {
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  return Math.abs(unitCenterX - centerX) + Math.abs(unitCenterY - centerY);
}

function weakestBalanceZone(container, placed) {
  const balance = calculateWeightBalance(container, placed);
  if (!balance.valid) return BALANCE_ZONE_ORDER[0];
  const loads = {
    frontLeft: balance.loads.frontLeftKg,
    frontRight: balance.loads.frontRightKg,
    rearLeft: balance.loads.rearLeftKg,
    rearRight: balance.loads.rearRightKg
  };
  return BALANCE_ZONE_ORDER.reduce((best, zone) => (loads[zone] < loads[best] - EPS ? zone : best), BALANCE_ZONE_ORDER[0]);
}

function placementScore(placement, unit, container, strategy, placed = []) {
  const top = placement.z + placement.heightCm;
  const front = placement.x + placement.lengthCm;
  const right = placement.y + placement.widthCm;
  const area = placement.lengthCm * placement.widthCm;
  if (isFlatRackUsage(container)) {
    const deckGain = deckAreaGainCm2(placed, placement);
    const stackPenalty = placement.z > EPS ? 80_000_000 + placement.z * 1_200_000 : 0;
    const balanceExempt = isProjectedBalanceExempt(container, placed, unit);
    const balancePenalty = balanceExempt ? 0 : projectedBalancePenalty(container, placed, unit, placement);
    const centerPenalty = placement.floorOnly ? 0 : centerDistancePenalty(container, placement) * (unit.isHeavy ? 1800 : 40);
    const spreadPenalty = balanceExempt ? 0 : zoneSpreadPenalty(container, placed, placement, unit) * (unit.isHeavy ? HEAVY_ZONE_WEIGHT : LIGHT_ZONE_WEIGHT);
    return stackPenalty + top * 12_000 + balancePenalty + spreadPenalty + centerPenalty + front * 30 + right - deckGain * 450;
  }
  const supportBonus = unit.nonStack ? 0 : area * Math.max(0, 1 - top / Math.max(1, containerHeightLimit(container)));
  const supportCoveragePenalty = unit.nonStack ? 0 : (1 - supportCoverageRatio(placement, placed)) * 1000;
  const verticalPenalty = strategy.blueVertical && shouldPreferVertical(unit) ? -placement.heightCm * 100 : 0;
  const balanceExempt = isProjectedBalanceExempt(container, placed, unit);
  const balancePenalty = balanceExempt ? 0 : projectedBalancePenalty(container, placed, unit, placement);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  const centerDistance = Math.abs(unitCenterX - centerX) + Math.abs(unitCenterY - centerY);
  const heavyCenterPenalty = balanceExempt ? 0 : unit.isHeavy ? centerDistance * HEAVY_CENTER_WEIGHT : centerDistance * 12;
  const spreadPenalty = balanceExempt ? 0 : zoneSpreadPenalty(container, placed, placement, unit) * (unit.isHeavy ? HEAVY_ZONE_WEIGHT : LIGHT_ZONE_WEIGHT);
  return top * 1_000_000 + supportCoveragePenalty + balancePenalty + spreadPenalty + front * 1_000 + right + heavyCenterPenalty - supportBonus + verticalPenalty;
}

function deckAreaGainCm2(placed, placement) {
  const rect = {
    x: Number(placement.x || 0),
    y: Number(placement.y || 0),
    lengthCm: Number(placement.lengthCm || 0),
    widthCm: Number(placement.widthCm || 0)
  };
  if (rect.lengthCm <= EPS || rect.widthCm <= EPS) return 0;
  const before = deckUnionAreaCm2(placed);
  const after = deckUnionAreaCm2([...placed, rect]);
  return Math.max(0, after - before);
}

function deckUnionAreaCm2(items) {
  return unionArea((items || []).map((unit) => ({
    x: Number(unit.x || 0),
    y: Number(unit.y || 0),
    lengthCm: Number(unit.lengthCm || 0),
    widthCm: Number(unit.widthCm || 0)
  })).filter((rect) => rect.lengthCm > EPS && rect.widthCm > EPS));
}

function supportSurfaceScore(placed, container) {
  const heightLimit = containerHeightLimit(container);
  return placed
    .filter((unit) => !unit.nonStack)
    .reduce((score, unit) => {
      const top = unit.z + unit.heightCm;
      const normalizedHeight = heightLimit > 0 && Number.isFinite(heightLimit) ? 1 - top / heightLimit : 0;
      return score + unit.lengthCm * unit.widthCm * Math.max(0, normalizedHeight);
    }, 0);
}

function applyPlacement(unit, placement) {
  return {
    ...stripPlacement(unit),
    x: placement.x,
    y: placement.y,
    z: placement.z,
    lengthCm: placement.lengthCm,
    widthCm: placement.widthCm,
    heightCm: placement.heightCm,
    physicalLengthCm: placement.physicalLengthCm,
    physicalWidthCm: placement.physicalWidthCm,
    physicalHeightCm: placement.physicalHeightCm,
    lengthAxis: placement.lengthAxis,
    widthAxis: placement.widthAxis,
    heightAxis: placement.heightAxis,
    orientationKey: placement.orientationKey,
    groupRotated: Boolean(placement.groupRotated)
  };
}

function stripPlacement(unit) {
  const copy = { ...unit, x: 0, y: 0, z: 0 };
  const orientations = generateOrientations(copy);
  const base = orientations.find((item) =>
    item.lengthAxis === AXIS_LENGTH
    && item.widthAxis === AXIS_WIDTH
    && item.heightAxis === AXIS_HEIGHT
  ) || orientations[0];
  if (base) Object.assign(copy, base);
  copy.orientations = orientations;
  return copy;
}

function cloneAttempt(attempt) {
  return makePackedBox(
    attempt.placed.map(copyUnit),
    attempt.unplaced.map(copyUnit),
    { id: attempt.strategyId, name: attempt.strategyName },
    attempt.strategySummary || {}
  );
}

function fitsContainerDims(container, dims) {
  const heightLimit = containerHeightLimit(container);
  return dims.lengthCm <= container.lengthCm + EPS
    && dims.widthCm <= container.widthCm + EPS
    && dims.heightCm <= heightLimit + EPS
    && Number(dims.x || 0) >= -EPS
    && Number(dims.y || 0) >= -EPS
    && Number(dims.z || 0) >= -EPS
    && Number(dims.x || 0) + dims.lengthCm <= container.lengthCm + EPS
    && Number(dims.y || 0) + dims.widthCm <= container.widthCm + EPS
    && Number(dims.z || 0) + dims.heightCm <= heightLimit + EPS;
}

function intersects(a, b) {
  return a.x < b.x + b.lengthCm - EPS && a.x + a.lengthCm > b.x + EPS
    && a.y < b.y + b.widthCm - EPS && a.y + a.widthCm > b.y + EPS
    && a.z < b.z + b.heightCm - EPS && a.z + a.heightCm > b.z + EPS;
}

function physicalPlacementBox(unit = {}) {
  const occupiedLengthCm = Math.max(0, Number(unit.lengthCm || 0));
  const occupiedWidthCm = Math.max(0, Number(unit.widthCm || 0));
  const occupiedHeightCm = Math.max(0, Number(unit.heightCm || 0));
  const lengthCm = Math.min(
    occupiedLengthCm || Number.MAX_SAFE_INTEGER,
    Math.max(0, Number(unit.physicalLengthCm || axisBaseCm(unit, unit.lengthAxis) || occupiedLengthCm))
  );
  const widthCm = Math.min(
    occupiedWidthCm || Number.MAX_SAFE_INTEGER,
    Math.max(0, Number(unit.physicalWidthCm || axisBaseCm(unit, unit.widthAxis) || occupiedWidthCm))
  );
  const heightCm = Math.min(
    occupiedHeightCm || Number.MAX_SAFE_INTEGER,
    Math.max(0, Number(unit.physicalHeightCm || axisBaseCm(unit, unit.heightAxis) || occupiedHeightCm))
  );
  return {
    x: Number(unit.x || 0) + Math.max(0, occupiedLengthCm - lengthCm) / 2,
    y: Number(unit.y || 0) + Math.max(0, occupiedWidthCm - widthCm) / 2,
    z: Number(unit.z || 0),
    lengthCm,
    widthCm,
    heightCm
  };
}

function physicalFootprintRects(unit = {}) {
  const quantity = unitQuantity(unit);
  if (quantity <= 1) {
    const physical = physicalPlacementBox(unit);
    return [{ x: physical.x, y: physical.y, lengthCm: physical.lengthCm, widthCm: physical.widthCm }];
  }

  const cols = Math.max(1, Math.floor(Number(unit.groupCols || quantity)));
  const rows = Math.max(1, Math.floor(Number(unit.groupRows || Math.ceil(quantity / cols))));
  const rawLength = singleRawLengthCm(unit);
  const rawWidth = singleRawWidthCm(unit);
  const gap = Number(unit.gapCm || 0);
  const stepLength = rawLength + gap;
  const stepWidth = rawWidth + gap;
  const rotated = Boolean(unit.groupRotated);
  const rects = [];
  for (let i = 0; i < quantity; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = Number(unit.x || 0) + (rotated ? row * stepWidth : col * stepLength);
    const cellY = Number(unit.y || 0) + (rotated ? col * stepLength : row * stepWidth);
    rects.push({
      x: cellX + gap / 2,
      y: cellY + gap / 2,
      lengthCm: rotated ? rawWidth : rawLength,
      widthCm: rotated ? rawLength : rawWidth
    });
  }
  return rects;
}

function overlapRect(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.lengthCm, b.x + b.lengthCm);
  const y2 = Math.min(a.y + a.widthCm, b.y + b.widthCm);
  if (x2 <= x1 + EPS || y2 <= y1 + EPS) return null;
  return { x: x1, y: y1, lengthCm: x2 - x1, widthCm: y2 - y1 };
}

function unionArea(rects) {
  const xs = uniqueSorted(rects.flatMap((rect) => [rect.x, rect.x + rect.lengthCm]), Number.NaN)
    .filter((value) => !Number.isNaN(value));
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const width = x2 - x1;
    if (width <= EPS) continue;
    const spans = rects
      .filter((rect) => rect.x < x2 - EPS && rect.x + rect.lengthCm > x1 + EPS)
      .map((rect) => [rect.y, rect.y + rect.widthCm])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let start = null;
    let end = 0;
    for (const span of spans) {
      if (start === null) {
        start = span[0];
        end = span[1];
      } else if (span[0] <= end + EPS) {
        end = Math.max(end, span[1]);
      } else {
        covered += end - start;
        start = span[0];
        end = span[1];
      }
    }
    if (start !== null) covered += end - start;
    area += width * covered;
  }
  return area;
}

function countLayers(placed) {
  return uniqueSorted(placed.map((unit) => unit.z), Number.NaN).filter((value) => !Number.isNaN(value)).length;
}

function maxFootprint(unit) {
  return Math.max(...generateOrientations(unit).map((dims) => dims.lengthCm * dims.widthCm));
}

function tallestOrientation(unit) {
  return Math.max(...generateOrientations(unit).map((dims) => dims.heightCm));
}

function smallItemRank(unit) {
  const isBlue = String(unit.color || "").toLowerCase() === "#3b82f6" || /蓝|blue/i.test(String(unit.name || ""));
  const volume = unitVolumeCm3(unit);
  return (isBlue ? 0 : 1000000000) + volume;
}

function shouldPreferVertical(unit) {
  const isBlue = String(unit.color || "").toLowerCase() === "#3b82f6" || /蓝|blue/i.test(String(unit.name || ""));
  const longest = Math.max(unit.lengthCm, unit.widthCm, unit.heightCm);
  const shortest = Math.min(unit.lengthCm, unit.widthCm, unit.heightCm);
  return isBlue || longest / Math.max(1, shortest) >= 1.8 || unitVolumeCm3(unit) < 120000;
}

function unitVolumeCm3(unit) {
  return Number(unit.lengthCm || 0) * Number(unit.widthCm || 0) * Number(unit.heightCm || 0);
}

function sumOccupiedVolumeM3(units) {
  return units.reduce((sum, unit) => sum + occupiedVolumeM3(unit), 0);
}

function sumCargoVolumeM3(units) {
  return units.reduce((sum, unit) => sum + cargoVolumeM3(unit), 0);
}

function cargoVolumeM3(unit) {
  const explicit = Number(unit?.volumeM3);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const quantity = unitQuantity(unit);
  const length = Number(unit?.baseLengthCm || unit?.lengthCm || 0);
  const width = Number(unit?.baseWidthCm || unit?.widthCm || 0);
  const height = Number(unit?.baseHeightCm || unit?.heightCm || 0);
  return length * width * height * quantity / 1_000_000;
}

function singleRawLengthCm(unit) {
  const cols = Math.max(1, Math.floor(Number(unit?.groupCols || 1)));
  const value = Number(unit?.baseLengthCm || 0) / cols;
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0, Number(unit?.packedLengthCm || unit?.lengthCm || 0) / cols - Number(unit?.gapCm || 0));
}

function singleRawWidthCm(unit) {
  const rows = Math.max(1, Math.floor(Number(unit?.groupRows || 1)));
  const value = Number(unit?.baseWidthCm || 0) / rows;
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0, Number(unit?.packedWidthCm || unit?.widthCm || 0) / rows - Number(unit?.gapCm || 0));
}

function singleRawHeightCm(unit) {
  const value = Number(unit?.baseHeightCm || 0);
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0, Number(unit?.packedHeightCm || unit?.heightCm || 0));
}

function singleWeightKg(unit) {
  return Number(unit?.weightKg || 0) / unitQuantity(unit);
}

function singleVolumeM3(unit) {
  return cargoVolumeM3(unit) / unitQuantity(unit);
}

function usageMetricsForPackedBoxes(container, packedBoxes, utilizationPercent) {
  const boxes = Array.isArray(packedBoxes) ? packedBoxes : [];
  const firstBox = boxes[0] || { placed: [], container };
  const firstContainer = firstBox.container || container;
  const modes = new Set(boxes.map((box) => usageMode(box.container || container)));
  const mode = modes.size === 1 ? [...modes][0] : "mixed";
  const firstUsed = usageUsedCapacity(firstContainer, firstBox.placed || []);
  const firstCapacity = usageCapacity(firstContainer, utilizationPercent);
  const totals = boxes.reduce((acc, box) => {
    const boxContainer = box.container || container;
    acc.used += usageUsedCapacity(boxContainer, box.placed || []);
    acc.capacity += usageCapacity(boxContainer, utilizationPercent);
    if (usageMode(boxContainer) === "deck") {
      acc.deckUsed += placementDeckAreaM2(box.placed || []);
      acc.deckCapacity += deckAreaM2(boxContainer);
    }
    return acc;
  }, { used: 0, capacity: 0, deckUsed: 0, deckCapacity: 0 });

  return {
    mode,
    firstFillPercent: firstCapacity > 0 ? firstUsed / firstCapacity * 100 : 0,
    averageFillPercent: totals.capacity > 0 ? totals.used / totals.capacity * 100 : 0,
    firstDeckAreaPercent: deckAreaPercent(firstContainer, firstBox.placed || []),
    firstLengthPercent: lengthUtilizationPercent(firstContainer, firstBox.placed || []),
    averageDeckAreaPercent: totals.deckCapacity > 0 ? totals.deckUsed / totals.deckCapacity * 100 : 0
  };
}

function averageUsagePercentForBoxCount(container, packedBoxes, utilizationPercent, boxes, total) {
  const boxCount = Math.max(1, Number(boxes || 1));
  if (usageMode(container) === "volume") {
    const capacity = usageCapacity(container, utilizationPercent) * boxCount;
    return capacity > 0 ? Number(total?.totalRawVolumeM3 || 0) / capacity * 100 : 0;
  }
  const detailedUsed = (packedBoxes || []).reduce((sum, box) => sum + usageUsedCapacity(box.container || container, box.placed || []), 0);
  const detailedCapacity = (packedBoxes || []).reduce((sum, box) => sum + usageCapacity(box.container || container, utilizationPercent), 0);
  return detailedCapacity > 0 ? detailedUsed / detailedCapacity * 100 : 0;
}

function usageMode(container) {
  return isFlatRackUsage(container) ? "deck" : "volume";
}

function isFlatRackUsage(container = {}) {
  return isHeightUnlimited(container) || equipmentMeta(container).equipmentClass === "FR";
}

function usageCapacity(container, utilizationPercent) {
  if (isFlatRackUsage(container)) return deckAreaM2(container) * utilizationPercent / 100;
  return volumeM3(container) * utilizationPercent / 100;
}

function usageUsedCapacity(container, placed) {
  if (isFlatRackUsage(container)) return placementDeckAreaM2(placed);
  return sumCargoVolumeM3(placed);
}

function deckAreaM2(container) {
  return Number(container?.lengthCm || 0) * Number(container?.widthCm || 0) / 10_000;
}

function placementDeckAreaM2(placed) {
  const rects = (placed || []).map((unit) => ({
    x: Number(unit.x || 0),
    y: Number(unit.y || 0),
    lengthCm: Number(unit.lengthCm || 0),
    widthCm: Number(unit.widthCm || 0)
  })).filter((rect) => rect.lengthCm > EPS && rect.widthCm > EPS);
  return unionArea(rects) / 10_000;
}

function deckAreaPercent(container, placed) {
  const capacity = deckAreaM2(container);
  return capacity > 0 ? placementDeckAreaM2(placed) / capacity * 100 : 0;
}

function lengthUtilizationPercent(container, placed) {
  if (!isFlatRackUsage(container) || !placed?.length || Number(container?.lengthCm || 0) <= 0) return 0;
  const minX = Math.min(...placed.map((unit) => Number(unit.x || 0)));
  const maxX = Math.max(...placed.map((unit) => Number(unit.x || 0) + Number(unit.lengthCm || 0)));
  return Math.max(0, maxX - minX) / Number(container.lengthCm) * 100;
}

function maxTop(units) {
  return units.length ? Math.max(...units.map((unit) => Number(unit.z || 0) + Number(unit.heightCm || 0))) : 0;
}

function totals(cargos) {
  return cargos.reduce((acc, cargo) => {
    acc.totalQuantity += Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    acc.totalRawVolumeM3 += Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) * Number(cargo.quantity || 0) / 1_000_000;
    acc.totalWeightKg += Number(cargo.weightKg || 0) * Number(cargo.quantity || 0);
    return acc;
  }, { totalQuantity: 0, totalRawVolumeM3: 0, totalWeightKg: 0 });
}

function cargoDisplayName(cargo) {
  const name = String(cargo.name || "").trim() || "未命名货物";
  const model = String(cargo.model || "").trim();
  return model ? `${name} ${model}` : name;
}

function compareEvaluation(a, b) {
  const statusDiff = fitStatusRank(a.fitStatus) - fitStatusRank(b.fitStatus);
  if (statusDiff) return statusDiff;
  const priceStatusA = evaluationPriceStatus(a);
  const priceStatusB = evaluationPriceStatus(b);
  const priceComparableDiff = (priceStatusA.comparable ? 0 : 1) - (priceStatusB.comparable ? 0 : 1);
  if (priceComparableDiff) return priceComparableDiff;
  const priceAvailabilityDiff = (priceStatusA.configured ? 0 : 1) - (priceStatusB.configured ? 0 : 1);
  if (priceAvailabilityDiff) return priceAvailabilityDiff;
  if (priceStatusA.comparable && priceStatusB.comparable && priceStatusA.currency === priceStatusB.currency) {
    const costDiff = estimatedFreightCost(a) - estimatedFreightCost(b);
    if (Math.abs(costDiff) > EPS) return costDiff;
  }
  const boxDiff = normalizedBoxCount(a) - normalizedBoxCount(b);
  if (boxDiff) return boxDiff;
  const fillDiff = recommendationFillPercent(b) - recommendationFillPercent(a);
  if (Math.abs(fillDiff) > EPS) return fillDiff;
  const scoreDiff = recommendationScoreValue(a) - recommendationScoreValue(b);
  if (Math.abs(scoreDiff) > EPS) return scoreDiff;
  return volumeM3(a.container) - volumeM3(b.container);
}

function buildRecommendation(evaluation) {
  const meta = equipmentMeta(evaluation.container);
  const statusRank = fitStatusRank(evaluation.fitStatus);
  const boxes = normalizedBoxCount(evaluation);
  const cost = evaluation.isMixedPlan || evaluation.container?.mixedPlan
    ? Number(evaluation.container?.costFactor || 9999)
    : boxes >= 9999 ? 9999 : boxes * meta.costFactor;
  const priceStatus = evaluationPriceStatus(evaluation);
  const priceAvailable = priceStatus.configured;
  const freightCost = !priceAvailable || boxes >= 9999
    ? Number.POSITIVE_INFINITY
    : evaluation.isMixedPlan || evaluation.container?.mixedPlan
      ? mixedPlanFreightCost(evaluation.packedBoxes || [])
      : boxes * meta.referencePrice;
  const fill = recommendationFillPercent(evaluation);
  const underusePenalty = Math.max(0, UTILIZATION_LOW_WARN_PERCENT - fill) * 42;
  const severeUnderusePenalty = Math.pow(Math.max(0, 45 - fill), 2) * 4;
  const tightPenalty = Math.max(0, fill - UTILIZATION_HIGH_WARN_PERCENT) * 8;
  const balancePenalty = evaluation.fitStatus === FIT_STATUS.BALANCE_BLOCKED ? 50000 : 0;
  const oversizePenalty = evaluation.fitStatus === FIT_STATUS.OVERSIZE ? 1000000 : 0;
  const statusPenalty = statusRank * 1000;
  const volumePenalty = volumeM3(evaluation.container) * 1.5;
  const score = oversizePenalty
    + balancePenalty
    + statusPenalty
    + boxes * RECOMMENDATION_BOX_WEIGHT
    + underusePenalty
    + severeUnderusePenalty
    + tightPenalty
    + volumePenalty;

  return {
    score: round(score),
    costFactor: round(meta.costFactor),
    estimatedCost: round(cost),
    referencePrice: meta.priceAvailable ? round(meta.referencePrice) : null,
    estimatedFreight: priceAvailable && Number.isFinite(freightCost) ? round(freightCost) : null,
    priceAvailable,
    priceComparisonEligible: priceStatus.comparable,
    priceExclusionReason: priceStatus.reason,
    referenceCurrency: priceStatus.currency,
    priceTier: meta.priceTier,
    equipmentClass: meta.equipmentClass,
    utilizationBand: utilizationBand(fill),
    averageFillPercent: round(fill),
    statusRank
  };
}

function recommendationScoreValue(evaluation) {
  const score = Number(evaluation?.recommendation?.score);
  return Number.isFinite(score) ? score : buildRecommendation(evaluation).score;
}

function recommendationFillPercent(evaluation) {
  const average = Number(evaluation?.averageFillPercent);
  if (Number.isFinite(average) && average > 0) return average;
  const first = Number(evaluation?.firstBoxFillPercent);
  return Number.isFinite(first) ? first : 0;
}

function fitStatusRank(status) {
  if (status === FIT_STATUS.FIT) return 0;
  if (status === FIT_STATUS.ESTIMATED) return 1;
  if (status === FIT_STATUS.BALANCE_BLOCKED) return 2;
  return 3;
}

function normalizedBoxCount(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  return boxes > 0 ? boxes : 9999;
}

function estimatedFreightCost(evaluation) {
  const recommendation = evaluation?.recommendation;
  if (recommendation?.priceAvailable === false) return Number.POSITIVE_INFINITY;
  if (Number.isFinite(Number(recommendation?.estimatedFreight)) && Number(recommendation.estimatedFreight) > 0) return Number(recommendation.estimatedFreight);
  if (evaluation?.isMixedPlan || evaluation?.container?.mixedPlan) {
    const mixedFreight = mixedPlanFreightCost(evaluation?.packedBoxes || []);
    if (Number.isFinite(mixedFreight) && mixedFreight > 0) return mixedFreight;
  }
  const meta = equipmentMeta(evaluation?.container);
  if (!meta.priceAvailable) return Number.POSITIVE_INFINITY;
  return normalizedBoxCount(evaluation) * meta.referencePrice;
}

function evaluationPriceStatus(evaluation) {
  if (!evaluation) return { configured: false, comparable: false, reason: "missing-price", currency: "" };
  if (evaluation.isMixedPlan || evaluation.container?.mixedPlan) {
    const packedBoxes = evaluation.packedBoxes || [];
    if (!packedBoxes.length) return { configured: false, comparable: false, reason: "missing-price", currency: "" };
    const metas = packedBoxes.map((box) => equipmentMeta(box.container));
    if (metas.some((meta) => !meta.priceAvailable)) {
      return { configured: false, comparable: false, reason: "missing-price", currency: "" };
    }
    const currencies = [...new Set(metas.map((meta) => meta.referenceCurrency))];
    if (currencies.length !== 1) {
      return { configured: true, comparable: false, reason: "mixed-currency", currency: "" };
    }
    const status = evaluation.estimatedBoxes
      ? { configured: true, comparable: false, reason: "estimated-boxes", currency: currencies[0] }
      : { configured: true, comparable: true, reason: "", currency: currencies[0] };
    return applyRecommendationPriceOverride(evaluation, status);
  }
  const meta = equipmentMeta(evaluation.container);
  if (!meta.priceAvailable) return { configured: false, comparable: false, reason: "missing-price", currency: meta.referenceCurrency };
  const status = evaluation.estimatedBoxes
    ? { configured: true, comparable: false, reason: "estimated-boxes", currency: meta.referenceCurrency }
    : { configured: true, comparable: true, reason: "", currency: meta.referenceCurrency };
  return applyRecommendationPriceOverride(evaluation, status);
}

function applyRecommendationPriceOverride(evaluation, status) {
  const recommendation = evaluation?.recommendation;
  if (recommendation && recommendation.priceComparisonEligible === false && status.comparable) {
    return {
      ...status,
      comparable: false,
      reason: String(recommendation.priceExclusionReason || "comparison-disabled")
    };
  }
  return status;
}

function applyGlobalPriceComparability(evaluations = []) {
  const comparableRows = evaluations.filter((evaluation) => {
    const recommendation = evaluation?.recommendation;
    return evaluation?.fitStatus === FIT_STATUS.FIT
      && recommendation?.priceAvailable
      && !evaluation?.estimatedBoxes
      && !["missing-price", "mixed-currency"].includes(String(recommendation.priceExclusionReason || ""));
  });
  const currencies = new Set(comparableRows.map((evaluation) => String(evaluation.recommendation?.referenceCurrency || "")).filter(Boolean));
  if (currencies.size <= 1) return;
  comparableRows.forEach((evaluation) => {
    evaluation.recommendation.priceComparisonEligible = false;
    evaluation.recommendation.priceExclusionReason = "currency-set-mismatch";
  });
}

function freightConclusionText(evaluation) {
  const recommendation = evaluation?.recommendation || {};
  if (!recommendation.priceAvailable) return "未设置箱型价格，仅形成可装性结果";
  if (recommendation.priceExclusionReason === "estimated-boxes") {
    return `综合参考运价估算 ${formatFreightCost(estimatedFreightCost(evaluation), recommendation.referenceCurrency)}，未完成全部逐箱验证`;
  }
  if (["mixed-currency", "currency-set-mismatch"].includes(String(recommendation.priceExclusionReason || ""))) {
    return "参与方案币种不一致，未形成最低运价比较结论";
  }
  return `当前搜索最低综合参考运价 ${formatFreightCost(estimatedFreightCost(evaluation), recommendation.referenceCurrency)}`;
}

function formatFreightCost(value, currency = "USD") {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return `${String(currency || "USD").toUpperCase()} ${round(numeric)}`;
}

function equipmentMeta(container = {}) {
  const id = String(container.id || "").toLowerCase();
  const name = String(container.name || "").toLowerCase();
  const text = `${id} ${name}`;
  const explicitCost = Number(container.costFactor);
  const explicitReferencePrice = Number(container.referencePrice ?? container.price ?? container.freightPrice);
  const referenceCurrency = String(container.referenceCurrency || container.currency || "USD").trim().toUpperCase() || "USD";
  let equipmentClass = String(container.equipmentClass || "").toUpperCase();
  if (!["GP", "HQ", "45HQ", "RF", "FR", "MIX"].includes(equipmentClass)) {
    equipmentClass = "GP";
    if (/fr|flat/.test(text) || /平板/.test(name)) equipmentClass = "FR";
    else if (/rf|reefer/.test(text) || /冷藏/.test(name)) equipmentClass = "RF";
    else if (/45/.test(text)) equipmentClass = "45HQ";
    else if (/hq|high/.test(text) || /高/.test(name)) equipmentClass = "HQ";
  }

  const inferredCosts = {
    "20gp": 1,
    "20hq": 1.08,
    "40gp": 1.55,
    "40hq": 1.68,
    "45hq": 2.05,
    "20rf": 1.65,
    "40rf": 2.45,
    "20fr": 2.15,
    "40fr": 3.2
  };
  const inferredByClass = equipmentClass === "MIX" ? 1 : equipmentClass === "FR" ? 2.6 : equipmentClass === "RF" ? 2 : equipmentClass === "45HQ" ? 2.05 : equipmentClass === "HQ" ? 1.45 : 1.25;
  const costFactor = Number.isFinite(explicitCost) && explicitCost > 0
    ? explicitCost
    : inferredCosts[id] || inferredByClass;
  const referencePrice = Number.isFinite(explicitReferencePrice) && explicitReferencePrice > 0
    ? explicitReferencePrice
    : 0;
  const priceAvailable = referencePrice > 0;
  const explicitTier = String(container.priceTier || "").trim();
  const priceTier = explicitTier || (
    costFactor <= 1.15
      ? "economy"
      : costFactor <= 1.75
        ? "standard"
        : costFactor <= 2.35
          ? "high"
          : "special"
  );

  return { costFactor, referencePrice, priceAvailable, referenceCurrency, priceTier, equipmentClass };
}

function utilizationBand(fillPercent) {
  if (fillPercent <= 0) return "none";
  if (fillPercent < 45) return "low";
  if (fillPercent < 70) return "moderate";
  if (fillPercent <= UTILIZATION_HIGH_WARN_PERCENT) return "balanced";
  return "tight";
}

function buildTrace(container, units, total, multi, metrics) {
  const firstBox = multi.firstBox || { placed: [], unplaced: [] };
  const containerVolume = volumeM3(container);
  const rules = balanceRuleSettings(container);
  const supportRules = supportRuleSettings(container);
  const effectiveNonStackSupport = effectiveNonStackSupportRatio(container);
  return {
    worker: "frontend/src/workers/packingWorker.js",
    mode: "Browser WebWorker 本机计算",
    solver: "LAFF + Extreme Point + Local Search",
    pipeline: [
      "主线程把货物、箱型、计划可用率、货物间隙复制给 Web Worker",
      "Worker 对大批量同规格货物先按当前箱型组合成若干块，少量和余数仍保留单件 DTO 字段",
      "每个箱型独立运行多轮 LAFF 搜索，分别尝试大底面积、高度、承重优先、不可重压最后和蓝色/小件竖放策略",
      "每个 LAFF 层内使用 Extreme Point 候选点回填底部、顶部和侧边空隙",
      "候选落位必须满足边界、不相交、底面支撑和不可重压货物不承载上层货物",
      "首轮失败时执行局部搜索，移出一小组已摆货物与剩余货物重排，而不是立刻开启第二箱",
      "同一箱型选择已摆数量更多、占用体积更高、承重支撑面更好的方案",
      "所有最终候选同时通过尺寸、支撑、载重和偏载门槛后，再按综合参考运价、箱数和利用率辅助条件排序；未设置价格的箱型不参与最低运价比较"
    ],
    strategies: SEARCH_STRATEGIES.map((strategy) => strategy.name),
    selectedStrategy: firstBox.strategyName || "",
    supportRatioPercent: round(supportRules.supportRatio * 100),
    nonStackSupportRatioPercent: round(effectiveNonStackSupport * 100),
    balanceRules: {
      frontRearAxis: "container length / X",
      leftRightAxis: "container width / Y",
      greenLimitPercent: rules.greenLimitPercent,
      redLimitPercent: rules.redLimitPercent,
      frontMaxPercent: rules.frontMaxPercent,
      rearMinPercent40FR: rules.rearMinPercent40FR,
      lateralOffsetLimitCm: rules.lateralOffsetLimitCm,
      skipBelowWeightKg: rules.skipBelowWeightKg,
      heightLimitIgnored: isHeightUnlimited(container),
      redAction: "reject current layout and retry another strategy"
    },
    parameters: {
      utilizationPercent: metrics.utilizationPercent,
      globalGapCm: metrics.globalGapCm,
      physicalUnitCount: total.totalQuantity,
      solverUnitCount: units.length,
      groupedBlockCount: units.filter((unit) => unit.groupQuantity > 1).length,
      groupedPhysicalUnits: units.reduce((sum, unit) => sum + Math.max(0, unitQuantity(unit) - 1), 0),
      cargoTypeCounts: countBy(units, "type")
    },
    formulas: [
      "单件原始体积(m3) = 长 x 宽 x 高 / 1,000,000",
      "\u5360\u4f4d\u957f/\u5bbd(cm) = \u65cb\u8f6c\u540e\u7684\u5b9e\u9645 X/Y + \u5168\u5c40\u8d27\u7269\u95f4\u9699",
      "\u5360\u4f4d\u9ad8\u5ea6(cm) = \u65cb\u8f6c\u540e\u7684\u5b9e\u9645 Z\uff1b\u6c34\u5e73\u95f4\u9699\u4e0d\u8ba1\u5165\u9ad8\u5ea6",
      `Stackable support rule = lower stackable overlap area / current footprint >= ${round(supportRules.supportRatio * 100)}%, plus center/corner sample points and quadrant distribution`,
      `Non-stack support rule = lower stackable overlap area / current footprint >= ${round(effectiveNonStackSupport * 100)}%, plus center/corner sample points and quadrant distribution`,
      "不可重压货物可以放在可承重货物上方，但不能作为上层货物的支撑面"
    ],
    current: {
      containerName: container.name,
      containerVolumeM3: round(containerVolume),
      usableVolumeM3: round(metrics.usableVolume),
      totalRawVolumeM3: round(total.totalRawVolumeM3),
      totalWeightKg: round(total.totalWeightKg),
      firstBoxRawVolumeM3: round(metrics.firstPackedRawVolume),
      firstBoxOccupiedVolumeM3: round(metrics.firstPackedOccupiedVolume),
      firstBoxRemainingVolumeM3: round(Math.max(0, metrics.remainingVolume)),
      firstBoxFillPercent: round(metrics.fillPercent),
      firstBoxRawFillPercent: round(metrics.rawFillPercent),
      averageFillPercent: round(metrics.averageFillPercent || metrics.usage?.averageFillPercent || metrics.fillPercent),
      usageMode: metrics.usage?.mode || "volume",
      firstBoxDeckAreaPercent: round(metrics.usage?.firstDeckAreaPercent || 0),
      firstBoxLengthPercent: round(metrics.usage?.firstLengthPercent || 0),
      geometryBoxes: multi.boxes,
      weightBoxes: metrics.weightBoxes,
      finalBoxes: metrics.boxes,
      detailedBoxes: multi.packedBoxes.length,
      detailedBoxLimit: multi.detailedBoxLimit || MAX_DETAILED_BOXES,
      remainingUnitCountAfterDetailed: multi.remainingUnitCountAfterDetailed || 0
    },
    firstBox: {
      placedCount: sumUnitQuantity(firstBox.placed),
      unplacedCount: sumUnitQuantity(firstBox.unplaced),
      solverPlacedCount: firstBox.placed.length,
      solverUnplacedCount: firstBox.unplaced.length,
      maxTopCm: round(maxTop(firstBox.placed)),
      strategyId: firstBox.strategyId || "",
      strategyName: firstBox.strategyName || "",
      balanceValidation: firstBox.balanceValidation || validateWeightBalance(container, firstBox.placed)
    },
    boxStrategies: multi.packedBoxes.map((box, index) => ({
      boxIndex: index + 1,
      strategyName: box.strategyName || "",
      placedCount: sumUnitQuantity(box.placed),
      unplacedCount: sumUnitQuantity(box.unplaced),
      solverPlacedCount: box.placed.length,
      solverUnplacedCount: box.unplaced.length,
      occupiedVolumeM3: round(sumOccupiedVolumeM3(box.placed)),
      maxTopCm: round(maxTop(box.placed)),
      balanceSeverity: box.balanceValidation?.severity || "",
      balanceScore: round(box.balanceValidation?.score || 0),
      balanceChecks: box.balanceValidation?.checks || {}
    }))
  };
}

function expandGroupedPlacements(placed) {
  return placed.flatMap((unit) => expandGroupedPlacement(unit));
}

function expandGroupedPlacement(unit) {
  const quantity = unitQuantity(unit);
  if (quantity <= 1) return [copyUnit(unit)];

  const cols = Math.max(1, Math.floor(Number(unit.groupCols || quantity)));
  const rows = Math.max(1, Math.floor(Number(unit.groupRows || Math.ceil(quantity / cols))));
  const rawLength = singleRawLengthCm(unit);
  const rawWidth = singleRawWidthCm(unit);
  const rawHeight = singleRawHeightCm(unit);
  const gap = Number(unit.gapCm || 0);
  const stepLength = rawLength + gap;
  const stepWidth = rawWidth + gap;
  const pieceHeight = rawHeight;
  const rotated = Boolean(unit.groupRotated);
  const pieces = [];

  for (let i = 0; i < quantity; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lengthCm = rotated ? stepWidth : stepLength;
    const widthCm = rotated ? stepLength : stepWidth;
    const x = Number(unit.x || 0) + (rotated ? row * stepWidth : col * stepLength);
    const y = Number(unit.y || 0) + (rotated ? col * stepLength : row * stepWidth);
    const piece = {
      ...copyUnit(unit),
      unitKey: `${unit.unitKey}-p${i + 1}`,
      parentUnitKey: unit.unitKey,
      itemIndex: Number(unit.itemIndex || 0) * 1000 + i,
      x: round3(x),
      y: round3(y),
      z: Number(unit.z || 0),
      baseLengthCm: rawLength,
      baseWidthCm: rawWidth,
      baseHeightCm: rawHeight,
      lengthCm,
      widthCm,
      heightCm: pieceHeight,
      physicalLengthCm: rotated ? rawWidth : rawLength,
      physicalWidthCm: rotated ? rawLength : rawWidth,
      physicalHeightCm: rawHeight,
      canonicalPhysicalLengthCm: rawLength,
      canonicalPhysicalWidthCm: rawWidth,
      canonicalPhysicalHeightCm: rawHeight,
      canonicalOccupiedLengthCm: stepLength,
      canonicalOccupiedWidthCm: stepWidth,
      canonicalOccupiedHeightCm: rawHeight,
      packedLengthCm: lengthCm,
      packedWidthCm: widthCm,
      packedHeightCm: pieceHeight,
      weightKg: singleWeightKg(unit),
      volumeM3: singleVolumeM3(unit),
      groupQuantity: 1,
      groupCols: 1,
      groupRows: 1,
      lengthAxis: rotated ? AXIS_WIDTH : AXIS_LENGTH,
      widthAxis: rotated ? AXIS_LENGTH : AXIS_WIDTH,
      heightAxis: AXIS_HEIGHT,
      orientationKey: rotated ? "WLH" : "LWH",
      groupRotated: rotated
    };
    piece.orientations = generateOrientations(piece);
    pieces.push(piece);
  }

  return pieces;
}

function toPlacementDto(unit) {
  const axisInfo = placementAxisInfo(unit);
  const { xAxis, yAxis, zAxis, xAxisBaseCm, yAxisBaseCm, zAxisBaseCm } = axisInfo;
  const physical = physicalPlacementBox(unit);
  return {
    unitKey: unit.unitKey,
    parentUnitKey: unit.parentUnitKey || "",
    cargoId: unit.cargoId,
    name: unit.name,
    baseName: unit.baseName || unit.name,
    model: unit.model || "",
    color: unit.color,
    type: unit.type,
    baseLengthCm: round(unit.baseLengthCm),
    baseWidthCm: round(unit.baseWidthCm),
    baseHeightCm: round(unit.baseHeightCm),
    lengthCm: round(unit.lengthCm),
    widthCm: round(unit.widthCm),
    heightCm: round(unit.heightCm),
    occupiedLengthCm: round(unit.lengthCm),
    occupiedWidthCm: round(unit.widthCm),
    occupiedHeightCm: round(unit.heightCm),
    physicalLengthCm: round(physical.lengthCm),
    physicalWidthCm: round(physical.widthCm),
    physicalHeightCm: round(physical.heightCm),
    xAxis,
    yAxis,
    zAxis,
    xAxisBaseCm: round(xAxisBaseCm),
    yAxisBaseCm: round(yAxisBaseCm),
    zAxisBaseCm: round(zAxisBaseCm),
    bottomFace: `${xAxis}×${yAxis}`,
    heightAxis: zAxis,
    bottomFaceDetail: `X\u5411=${xAxis}${round(xAxisBaseCm)}cm / Y\u5411=${yAxis}${round(yAxisBaseCm)}cm`,
    orientationLabel: `\u5e95\u9762 X\u5411${xAxis}${round(xAxisBaseCm)}cm \u00d7 Y\u5411${yAxis}${round(yAxisBaseCm)}cm / \u9ad8\u5ea6Z\u5411${zAxis}${round(zAxisBaseCm)}cm`,
    xCm: round(unit.x),
    yCm: round(unit.y),
    zCm: round(unit.z),
    physicalXCm: round(physical.x),
    physicalYCm: round(physical.y),
    physicalZCm: round(physical.z),
    globalGapCm: round(unit.globalGapCm),
    typeExtraGapCm: round(unit.extraGapCm),
    horizontalGapCm: round(unit.gapCm),
    clearancePerSideCm: round(Number(unit.gapCm || 0) / 2),
    weightKg: round(unit.weightKg),
    volumeM3: round(cargoVolumeM3(unit)),
    geometryVolumeM3: round(occupiedVolumeM3(unit)),
    groupQuantity: unitQuantity(unit),
    groupCols: Number(unit.groupCols || 1),
    groupRows: Number(unit.groupRows || 1),
    orientationKey: unit.orientationKey || `${axisOrientationCode(xAxis)}${axisOrientationCode(yAxis)}${axisOrientationCode(zAxis)}`,
    groupRotated: Boolean(unit.groupRotated),
    nonStack: unit.nonStack,
    keepUpright: Boolean(unit.keepUpright)
  };
}

function placementAxisInfo(unit) {
  const xAxis = unit.lengthAxis || AXIS_LENGTH;
  const yAxis = unit.widthAxis || AXIS_WIDTH;
  const zAxis = unit.heightAxis || AXIS_HEIGHT;
  return {
    xAxis,
    yAxis,
    zAxis,
    xAxisBaseCm: Number(unit.physicalLengthCm || axisBaseCm(unit, xAxis)),
    yAxisBaseCm: Number(unit.physicalWidthCm || axisBaseCm(unit, yAxis)),
    zAxisBaseCm: Number(unit.physicalHeightCm || axisBaseCm(unit, zAxis))
  };
}

function axisBaseCm(unit, axis) {
  if (axis === "长") return unit.baseLengthCm;
  if (axis === "宽") return unit.baseWidthCm;
  if (axis === "高") return unit.baseHeightCm;
  return 0;
}

function volumeM3(container) {
  return Number(container.lengthCm) * Number(container.widthCm) * Number(container.heightCm) / 1_000_000;
}

function occupiedVolumeM3(unit) {
  return Number(unit.lengthCm) * Number(unit.widthCm) * Number(unit.heightCm) / 1_000_000;
}

function safeUtilizationPercent(value) {
  return Math.max(1, Math.min(100, Number(value || 90)));
}

function safeGlobalGapCm(value) {
  return Math.max(0, Number(value || 0));
}

function normalizeBalanceSettings(settings = {}) {
  const redLimitPercent = clampNumber(settings.redLimitPercent, 3, 12, BALANCE_RED_LIMIT_PERCENT);
  return {
    greenLimitPercent: Math.min(redLimitPercent, clampNumber(settings.greenLimitPercent, 1, 5, BALANCE_GREEN_LIMIT_PERCENT)),
    redLimitPercent,
    frontMaxPercent: clampNumber(settings.frontMaxPercent, 55, 70, FRONT_MAX_PERCENT),
    rearMinPercent40FR: clampNumber(settings.rearMinPercent40FR, 20, 45, REAR_MIN_PERCENT_40FR),
    lateralOffsetLimitCm: clampNumber(settings.lateralOffsetLimitCm, 4, 20, LATERAL_OFFSET_LIMIT_CM),
    skipBelowWeightKg: clampNumber(settings.skipBelowWeightKg, 0, 30000, BALANCE_SKIP_BELOW_WEIGHT_KG)
  };
}

function balanceRuleSettings(container = {}) {
  return normalizeBalanceSettings(container.balanceSettings || {});
}

function normalizeSupportSettings(settings = {}) {
  const raw = settings.supportSettings || settings || {};
  return {
    supportRatio: normalizeSupportRatioValue(
      raw.supportRatio,
      raw.supportRatioPercent ?? raw.supportPercent,
      0.5,
      1,
      DEFAULT_SUPPORT_RATIO
    ),
    nonStackSupportRatio: normalizeSupportRatioValue(
      raw.nonStackSupportRatio,
      raw.nonStackSupportRatioPercent ?? raw.nonStackSupportPercent,
      0.8,
      1,
      DEFAULT_NONSTACK_SUPPORT_RATIO
    )
  };
}

function normalizeSupportRatioValue(ratioValue, percentValue, min, max, fallback) {
  const percentNumber = Number(percentValue);
  if (Number.isFinite(percentNumber)) return clampNumber(percentNumber / 100, min, max, fallback);
  return clampNumber(ratioValue, min, max, fallback);
}

function supportRuleSettings(container = {}) {
  return normalizeSupportSettings(container.supportSettings || {});
}

function effectiveNonStackSupportRatio(container = {}) {
  const rules = supportRuleSettings(container);
  return Math.min(rules.nonStackSupportRatio, rules.supportRatio);
}

function supportRatioForUnit(container = {}, unit = {}, strategy = {}, options = {}) {
  if (Number.isFinite(Number(unit?.supportRatioOverride))) {
    return clampNumber(unit.supportRatioOverride, 0.1, 1, DEFAULT_SUPPORT_RATIO);
  }
  const optionRatio = unit?.nonStack
    ? options.nonStackSupportRatio ?? strategy.nonStackSupportRatio
    : options.supportRatio ?? strategy.supportRatio;
  if (Number.isFinite(Number(optionRatio))) {
    return unit?.nonStack
      ? clampNumber(optionRatio, 0.8, 1, DEFAULT_NONSTACK_SUPPORT_RATIO)
      : clampNumber(optionRatio, 0.5, 1, DEFAULT_SUPPORT_RATIO);
  }
  const rules = supportRuleSettings(container);
  return unit?.nonStack ? effectiveNonStackSupportRatio(container) : rules.supportRatio;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function uniqueSorted(values, first) {
  const set = new Set([round3(first), ...values.map(round3)]);
  return [...set].sort((a, b) => a - b);
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function decisionUnitName(unit) {
  const quantity = unitQuantity(unit);
  const group = quantity > 1 ? `组合${quantity}件` : "单件";
  return `[${unit?.name || "未命名货物"} · ${group} · ${round(unit?.weightKg || 0)}kg]`;
}

function decisionDims(item) {
  return `${round(item?.lengthCm)}×${round(item?.widthCm)}×${round(item?.heightCm)}cm`;
}

function decisionPoint(point) {
  return `(${round(point?.x)}, ${round(point?.y)}, ${round(point?.z)})`;
}

function balanceDecisionText(validation) {
  if (!validation?.valid) return "无重量数据";
  if (validation.balanceExempt || validation.severity === "exempt") return "轻载豁免";
  if (validation.severity === "green") return "绿色合规";
  if (validation.severity === "yellow") return "黄色预警";
  if (validation.severity === "red") return "红色拦截";
  return validation.severity || "未知";
}

export function __testGroupedOrientationRoundTrip(config = {}) {
  const lengthCm = Number(config.lengthCm || 70);
  const widthCm = Number(config.widthCm || 40);
  const heightCm = Number(config.heightCm || 10);
  const cols = Math.max(1, Math.floor(Number(config.cols || 2)));
  const rows = Math.max(1, Math.floor(Number(config.rows || 2)));
  const gapCm = Math.max(0, Number(config.gapCm || 0));
  const rounds = Math.max(1, Math.floor(Number(config.rounds || 2)));
  const useRotated = config.rotated !== false;
  const quantity = cols * rows;
  let current = makeCargoUnit(
    { name: "group-test", lengthCm, widthCm, heightCm, quantity, weightKg: 1, type: "normal" },
    0,
    "group-test",
    0,
    quantity,
    { rotatable: true, nonStack: false, keepUpright: false, extraGapCm: 0 },
    gapCm,
    gapCm,
    { count: quantity, cols, rows }
  );
  const states = [];
  const snapshot = (orientation) => orientation ? {
    lengthCm: orientation.lengthCm,
    widthCm: orientation.widthCm,
    heightCm: orientation.heightCm,
    physicalLengthCm: orientation.physicalLengthCm,
    physicalWidthCm: orientation.physicalWidthCm,
    physicalHeightCm: orientation.physicalHeightCm,
    orientationKey: orientation.orientationKey,
    groupRotated: Boolean(orientation.groupRotated)
  } : null;

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const normalized = stripPlacement(current);
    const orientations = generateOrientations(normalized);
    const base = orientations.find((orientation) => !orientation.groupRotated) || null;
    const rotated = orientations.find((orientation) => orientation.groupRotated) || null;
    const selected = useRotated ? rotated : base;
    if (!selected) throw new Error("Requested grouped orientation is unavailable");
    current = applyPlacement(normalized, { ...selected, x: 0, y: 0, z: 0 });
    states.push({
      round: roundIndex + 1,
      canonicalPhysicalLengthCm: current.canonicalPhysicalLengthCm,
      canonicalPhysicalWidthCm: current.canonicalPhysicalWidthCm,
      canonicalOccupiedLengthCm: current.canonicalOccupiedLengthCm,
      canonicalOccupiedWidthCm: current.canonicalOccupiedWidthCm,
      base: snapshot(base),
      rotated: snapshot(rotated),
      selected: snapshot(current),
      footprints: physicalFootprintRects(current).map((rect) => ({ ...rect }))
    });
  }
  return states;
}

function unitQuantity(unit) {
  return Math.max(1, Math.floor(Number(unit?.groupQuantity || 1)));
}

function sumUnitQuantity(units) {
  return units.reduce((sum, unit) => sum + unitQuantity(unit), 0);
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round3(value) {
  return Number.isNaN(value) ? value : Math.round(Number(value || 0) * 1000) / 1000;
}

function copyUnit(unit) {
  return { ...unit, orientations: unit.orientations ? unit.orientations.map((item) => ({ ...item })) : undefined };
}
