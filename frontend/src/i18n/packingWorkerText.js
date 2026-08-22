export const PACKING_WORKER_TEXT = {
  nonStackFoundationStrategyName: "LAFF 不可重压基础优先",
  coordinateReuseStrategyName: "复用完整箱坐标",
  minimumBoxRescueStrategyName: "最少箱数柱式联合救援",
  recommendationPipeline: "所有最终候选同时通过尺寸、支撑、载重和偏载门槛后，先按箱数最少排序；箱数相同时再比较综合参考运价和利用率。",
  strategyPipeline: "每个箱型先保留含不可重压基础回填的高利用率基线，再尝试跨柜后放方案；后放方案只有在不增加货柜数时才采用",
  layerPipeline: "每个 LAFF 层固定目标层顶，按 P0 扩展层底、P1 补齐目标顶面、P2 层内补高的硬顺序穷尽 Extreme Point 候选后才开启下一层"
};

export function currentPlanFreightText(freight) {
  return `当前方案综合参考运价 ${freight}`;
}

export function fixedLayerTierName(tier) {
  if (tier === 0) return "P0 扩展层底覆盖";
  if (tier === 1) return "P1 补齐目标顶面";
  return "P2 层内补高";
}

export function fixedLayerSeedText(values) {
  return `${values.containerName} · ${values.strategyName} · 第 ${values.layerNo} 层选种子：${values.unitName} ${values.dimensions}，底面积 ${values.areaCm2}cm²，放置 ${values.point}，固定高度带 z=${values.layerBottomCm}–${values.targetLayerTopCm}cm。`;
}

export function fixedLayerPlacementText(values) {
  return `${values.containerName} · 第 ${values.layerNo} 层 ${fixedLayerTierName(values.tier)}：${values.unitName} ${values.dimensions} → ${values.point}，固定层顶 z=${values.targetLayerTopCm}cm。`;
}

export function fixedLayerSkippedText(values) {
  return `${values.containerName} · 第 ${values.layerNo} 层跳过 ${values.skippedCount} 个较高搜索单元：高度超过固定高度带 ${values.layerHeightCm}cm，保留到下一层继续作为候选。`;
}

export function fixedLayerFoundationText(values) {
  return `${values.containerName} · 第 ${values.layerNo} 层基础预留：在 z=${values.targetLayerTopCm}cm 连续承重面优先放入 ${values.placedCount} 件不可重压货物。`;
}

export function fixedLayerCompleteText(values) {
  return `${values.containerName} · 第 ${values.layerNo} 层完成：本层装入 ${values.layerPlacedQuantity} 件，累计 ${values.totalPlacedQuantity} 件，剩余 ${values.remainingQuantity} 件；P0–P2 已穷尽，下一层从 z=${values.targetLayerTopCm}cm 开始。`;
}

export function lowerDeckRevisitText(values) {
  return `${values.containerName} · 第 ${values.layerNo} 层启用低台阶重访：最高带 z=${values.highWaterCm}cm 无可行落位，回到外露承重面 z=${values.layerBottomCm}cm 继续装载。`;
}
