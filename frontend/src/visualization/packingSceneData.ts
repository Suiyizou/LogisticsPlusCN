import type { ContainerLike, PlacementLike, SceneCargo, SceneData, SceneLegendItem, SceneStats } from "./packingSceneTypes";
import { effectiveContainerHeight } from "../services/localData";

const FALLBACK_COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];

export function buildPackingSceneData(options: {
  container: ContainerLike | null;
  placements?: PlacementLike[];
  evaluation?: any;
}): SceneData {
  const container = normalizeContainer(options.container);
  const colorMap = new Map<string, string>();
  const cargos = (options.placements || []).map((placement, index) => normalizeCargo(placement, index, colorMap));
  const legend = buildLegend(cargos);
  const stats = buildStats(container, cargos, options.evaluation);
  const scale = container
    ? 12 / Math.max(1, Number(container.lengthCm || 0), Number(container.widthCm || 0), Number(container.heightCm || 0))
    : 1;

  return { container, cargos, legend, stats, scale };
}

export function formatWeight(value = 0) {
  const weight = Number(value || 0);
  if (weight >= 1000) return `${(weight / 1000).toFixed(2)} t`;
  return `${Math.round(weight)} kg`;
}

export function formatSigned(value = 0, digits = 1) {
  const rounded = Number(value || 0);
  const text = rounded.toFixed(digits);
  return rounded > 0 ? `+${text}` : text;
}

export function formatDimension(value = 0) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? `${number}` : number.toFixed(1);
}

function normalizeContainer(container: ContainerLike | null): ContainerLike | null {
  if (!container) return null;
  const heightCm = effectiveContainerHeight(container);
  return {
    ...container,
    lengthCm: Number(container.lengthCm || 0),
    widthCm: Number(container.widthCm || 0),
    heightCm,
    heightLimitCm: Number(container.heightLimitCm || heightCm),
    payloadKg: Number(container.payloadKg || 0)
  };
}

function normalizeCargo(placement: PlacementLike, index: number, colorMap: Map<string, string>): SceneCargo {
  const skuKey = stableCargoKey(placement, index);
  if (!colorMap.has(skuKey)) {
    colorMap.set(skuKey, placement.color || FALLBACK_COLORS[colorMap.size % FALLBACK_COLORS.length]);
  }
  const lengthCm = Number(placement.lengthCm || 0);
  const widthCm = Number(placement.widthCm || 0);
  const heightCm = Number(placement.heightCm || 0);
  const xCm = Number(placement.xCm || 0);
  const yCm = Number(placement.yCm || 0);
  const zCm = Number(placement.zCm || 0);
  const physicalLengthCm = Math.min(lengthCm, Number(placement.physicalLengthCm ?? placement.xAxisBaseCm ?? lengthCm));
  const physicalWidthCm = Math.min(widthCm, Number(placement.physicalWidthCm ?? placement.yAxisBaseCm ?? widthCm));
  const physicalHeightCm = Math.min(heightCm, Number(placement.physicalHeightCm ?? placement.zAxisBaseCm ?? heightCm));
  const physicalXCm = Number(placement.physicalXCm ?? (xCm + Math.max(0, lengthCm - physicalLengthCm) / 2));
  const physicalYCm = Number(placement.physicalYCm ?? (yCm + Math.max(0, widthCm - physicalWidthCm) / 2));
  const physicalZCm = Number(placement.physicalZCm ?? zCm);
  const horizontalGapCm = Number(placement.horizontalGapCm ?? Math.max(0, lengthCm - physicalLengthCm));
  const clearancePerSideCm = Number(placement.clearancePerSideCm ?? horizontalGapCm / 2);
  const hasClearance = Math.abs(lengthCm - physicalLengthCm) > 0.01
    || Math.abs(widthCm - physicalWidthCm) > 0.01
    || Math.abs(heightCm - physicalHeightCm) > 0.01;
  const quantity = Math.max(1, Number(placement.groupQuantity || 1));
  const legacyType = String(placement.type || "").trim().toLowerCase();
  const nonStack = Boolean(placement.nonStack ?? placement.nonStackable ?? (legacyType === "nonstack"));
  const keepUpright = Boolean(placement.keepUpright ?? placement.upright ?? (legacyType === "upright"));
  const displayNo = placement.unitKey
    ? String(placement.unitKey).replace(/^unit-?/i, "")
    : String(index + 1).padStart(3, "0");

  return {
    ...placement,
    key: placement.unitKey || placement.id || `${skuKey}-${index}`,
    skuKey,
    skuLabel: cargoDisplayLabel(placement, skuKey),
    displayNo,
    color: colorMap.get(skuKey) || placement.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    quantity,
    xCm,
    yCm,
    zCm,
    lengthCm,
    widthCm,
    heightCm,
    physicalLengthCm,
    physicalWidthCm,
    physicalHeightCm,
    physicalXCm,
    physicalYCm,
    physicalZCm,
    horizontalGapCm,
    clearancePerSideCm,
    hasClearance,
    weightKg: Number(placement.weightKg || 0),
    nonStack,
    keepUpright,
    center: {
      xCm: physicalXCm + physicalLengthCm / 2,
      yCm: physicalYCm + physicalWidthCm / 2,
      zCm: physicalZCm + physicalHeightCm / 2
    },
    volumeM3: Number.isFinite(Number(placement.volumeM3))
      ? Number(placement.volumeM3)
      : physicalLengthCm * physicalWidthCm * physicalHeightCm / 1_000_000
  };
}

function buildLegend(cargos: SceneCargo[]): SceneLegendItem[] {
  const map = new Map<string, SceneLegendItem>();
  cargos.forEach((cargo) => {
    const current = map.get(cargo.skuKey);
    if (current) {
      current.quantity += cargo.quantity;
      current.weightKg += Number(cargo.weightKg || 0);
      current.nonStack = current.nonStack || Boolean(cargo.nonStack);
      current.keepUpright = current.keepUpright || Boolean(cargo.keepUpright);
      return;
    }
    map.set(cargo.skuKey, {
      key: cargo.skuKey,
      label: cargo.skuLabel,
      name: cargo.name,
      color: cargo.color,
      quantity: cargo.quantity,
      weightKg: Number(cargo.weightKg || 0),
      nonStack: Boolean(cargo.nonStack),
      keepUpright: Boolean(cargo.keepUpright)
    });
  });
  return [...map.values()];
}

function stableCargoKey(placement: PlacementLike, index: number) {
  const direct = placement.cargoId || placement.sku || "";
  if (direct) return String(direct);
  const unitKey = String(placement.unitKey || "");
  const parsed = unitKey.match(/^(.*?)(?:-g\d+-x\d+|-\d+)$/);
  if (parsed?.[1]) return parsed[1];
  const model = String(placement.model || "").trim();
  const name = String(placement.name || "").trim();
  return `${name || "cargo"}|${model}|${placement.lengthCm}x${placement.widthCm}x${placement.heightCm}|${index}`;
}

function cargoDisplayLabel(placement: PlacementLike, fallback: string) {
  const name = String(placement.name || "").trim();
  const model = String(placement.model || "").trim();
  if (name && model && !name.includes(model)) return `${name} ${model}`;
  return name || model || fallback;
}

function buildStats(container: ContainerLike | null, cargos: SceneCargo[], evaluation: any): SceneStats {
  const totalPieces = cargos.reduce((sum, cargo) => sum + cargo.quantity, 0);
  const totalVolumeM3 = cargos.reduce((sum, cargo) => sum + cargo.volumeM3, 0);
  const totalWeightKg = cargos.reduce((sum, cargo) => sum + Number(cargo.weightKg || 0), 0);
  const containerVolumeM3 = container
    ? Number(container.lengthCm || 0) * Number(container.widthCm || 0) * Number(container.heightCm || 0) / 1_000_000
    : 0;
  const plannedUtilizationPercent = clampPercent(Number(evaluation?.trace?.parameters?.utilizationPercent || 100));
  const flatRack = isFlatRack(container, evaluation);
  const deckArea = flatRack ? deckAreaM2(container) : 0;
  const usedDeckArea = flatRack ? cargoDeckAreaM2(cargos) : 0;
  const lengthUtilizationPercent = flatRack ? cargoLengthUtilizationPercent(container, cargos) : undefined;
  const usableDeckArea = deckArea * plannedUtilizationPercent / 100;
  const usableVolumeM3 = containerVolumeM3 * plannedUtilizationPercent / 100;
  const utilizationPercent = flatRack
    ? usableDeckArea > 0 ? usedDeckArea / usableDeckArea * 100 : 0
    : usableVolumeM3 > 0 ? totalVolumeM3 / usableVolumeM3 * 100 : 0;

  return {
    totalPieces,
    totalVolumeM3,
    totalWeightKg,
    utilizationPercent,
    utilizationLabel: flatRack ? "metrics.deckUtilization" : "metrics.spaceUtilization",
    lengthUtilizationPercent,
    cargoCount: cargos.length,
    performanceMode: cargos.length > 100
  };
}

function isFlatRack(container: ContainerLike | null, evaluation: any) {
  const text = `${container?.id || ""} ${container?.name || ""} ${container?.equipmentClass || ""} ${evaluation?.recommendation?.equipmentClass || ""}`.toLowerCase();
  return Boolean(container?.ignoreHeightLimit) || /fr|flat|\u5e73\u677f/.test(text);
}

function deckAreaM2(container: ContainerLike | null) {
  return Number(container?.lengthCm || 0) * Number(container?.widthCm || 0) / 10_000;
}

function cargoDeckAreaM2(cargos: SceneCargo[]) {
  return unionAreaCm2(cargos.map((cargo) => ({
    x: Number(cargo.xCm || 0),
    y: Number(cargo.yCm || 0),
    length: Number(cargo.lengthCm || 0),
    width: Number(cargo.widthCm || 0)
  })).filter((rect) => rect.length > 0 && rect.width > 0)) / 10_000;
}

function cargoLengthUtilizationPercent(container: ContainerLike | null, cargos: SceneCargo[]) {
  if (!container?.lengthCm || !cargos.length) return 0;
  const minX = Math.min(...cargos.map((cargo) => Number(cargo.xCm || 0)));
  const maxX = Math.max(...cargos.map((cargo) => Number(cargo.xCm || 0) + Number(cargo.lengthCm || 0)));
  return Math.max(0, maxX - minX) / Number(container.lengthCm) * 100;
}

function unionAreaCm2(rects: Array<{ x: number; y: number; length: number; width: number }>) {
  const xs = [...new Set(rects.flatMap((rect) => [round3(rect.x), round3(rect.x + rect.length)]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const width = x2 - x1;
    if (width <= 0) continue;
    const spans = rects
      .filter((rect) => rect.x < x2 && rect.x + rect.length > x1)
      .map((rect) => [rect.y, rect.y + rect.width])
      .sort((a, b) => a[0] - b[0]);
    let start: number | null = null;
    let end = 0;
    for (const [spanStart, spanEnd] of spans) {
      if (start === null) {
        start = spanStart;
        end = spanEnd;
      } else if (spanStart <= end) {
        end = Math.max(end, spanEnd);
      } else {
        area += width * (end - start);
        start = spanStart;
        end = spanEnd;
      }
    }
    if (start !== null) area += width * (end - start);
  }
  return area;
}

function round3(value: number) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(100, Math.max(1, value));
}
