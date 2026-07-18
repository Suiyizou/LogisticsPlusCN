import type * as THREE from "three";

export type BalanceSeverity = "green" | "yellow" | "red" | "exempt";
export type SceneViewPreset = "iso" | "top" | "front" | "side";
export type SceneViewMode = "3d" | "2d";
export type SliceAxis = "none" | "x" | "y" | "z";

export interface ContainerLike {
  id?: string;
  name?: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  heightLimitCm?: number;
  payloadKg?: number;
  ignoreHeightLimit?: boolean;
  equipmentClass?: string;
}

export interface PlacementLike {
  id?: string;
  unitKey?: string;
  parentUnitKey?: string;
  cargoId?: string;
  sku?: string;
  model?: string;
  name: string;
  color?: string;
  type?: string;
  nonStack?: boolean;
  nonStackable?: boolean;
  keepUpright?: boolean;
  upright?: boolean;
  xCm: number;
  yCm: number;
  zCm: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  occupiedLengthCm?: number;
  occupiedWidthCm?: number;
  occupiedHeightCm?: number;
  physicalLengthCm?: number;
  physicalWidthCm?: number;
  physicalHeightCm?: number;
  physicalXCm?: number;
  physicalYCm?: number;
  physicalZCm?: number;
  horizontalGapCm?: number;
  clearancePerSideCm?: number;
  weightKg?: number;
  volumeM3?: number;
  geometryVolumeM3?: number;
  groupQuantity?: number;
  bottomFaceDetail?: string;
  orientationLabel?: string;
  xAxis?: string;
  yAxis?: string;
  zAxis?: string;
  xAxisBaseCm?: number;
  yAxisBaseCm?: number;
  zAxisBaseCm?: number;
  orientationKey?: string;
  groupRotated?: boolean;
}

export interface SceneCargo extends PlacementLike {
  key: string;
  skuKey: string;
  skuLabel: string;
  displayNo: string;
  color: string;
  quantity: number;
  physicalLengthCm: number;
  physicalWidthCm: number;
  physicalHeightCm: number;
  physicalXCm: number;
  physicalYCm: number;
  physicalZCm: number;
  horizontalGapCm: number;
  clearancePerSideCm: number;
  hasClearance: boolean;
  center: { xCm: number; yCm: number; zCm: number };
  volumeM3: number;
}

export interface SceneLegendItem {
  key: string;
  label: string;
  name: string;
  color: string;
  quantity: number;
  weightKg: number;
  nonStack: boolean;
  keepUpright: boolean;
}

export interface SceneStats {
  totalPieces: number;
  totalVolumeM3: number;
  totalWeightKg: number;
  utilizationPercent: number;
  utilizationLabel: string;
  lengthUtilizationPercent?: number;
  cargoCount: number;
  performanceMode: boolean;
}

export interface SceneData {
  container: ContainerLike | null;
  cargos: SceneCargo[];
  legend: SceneLegendItem[];
  stats: SceneStats;
  scale: number;
}

export interface BalanceState {
  valid: boolean;
  severity: BalanceSeverity;
  tagType: "success" | "warning" | "danger" | "info";
  label: string;
  description: string;
  color: string;
  sphereColor: string;
  totalWeightKg: number;
  center: { xCm: number; yCm: number; zCm: number };
  geometricCenter: { xCm: number; yCm: number; zCm: number };
  offset: Record<string, number>;
  loads: Record<string, number>;
  checks: Record<string, number | boolean | null>;
  limits: Record<string, number | null>;
  hotZones: string[];
}

export interface SceneRenderOptions {
  showLabels: boolean;
  showAxes: boolean;
  axisScale: number;
  showGrid: boolean;
  showCenter: boolean;
  showShell: boolean;
  translucentCargo: boolean;
  showClearanceEnvelope: boolean;
  showHeatmap: boolean;
  showRemaining: boolean;
  showMassBalance: boolean;
  sliceAxis: SliceAxis;
  slicePercent: number;
  hiddenSkuKeys: Set<string>;
  viewMode: SceneViewMode;
  locale?: string;
}

export interface SceneHoverPayload {
  item: SceneCargo;
  clientX: number;
  clientY: number;
}

export interface SceneControllerCallbacks {
  onHover?: (payload: SceneHoverPayload | null) => void;
}

export interface RenderContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: unknown;
  root: THREE.Group;
}
