export const PACKING_WORKER_TEXT = {
  nonStackFoundationStrategyName: "LAFF 不可重压基础优先",
  coordinateReuseStrategyName: "复用完整箱坐标",
  strategyPipeline: "每个箱型独立运行固定高度带 LAFF 搜索，分别尝试大底面积、同层行填充、高度、承重、不可重压基础优先和不可重压最后策略",
  layerPipeline: "每个 LAFF 层固定目标层顶，按 P0 扩展层底、P1 补齐目标顶面、P2 层内补高的硬顺序穷尽 Extreme Point 候选后才开启下一层"
};

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
