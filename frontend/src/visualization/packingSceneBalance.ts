import { calculateMassBalance } from "../utils/massBalance";
import type { BalanceSeverity, BalanceState, ContainerLike, PlacementLike } from "./packingSceneTypes";

const SEVERITY_META = {
  green: {
    label: "绿色合规",
    tagType: "success",
    color: "#16a34a",
    sphereColor: "#16a34a",
    description: "重心与前后/左右分布处于合规区间。"
  },
  exempt: {
    label: "轻载豁免",
    tagType: "info",
    color: "#2563eb",
    sphereColor: "#3b82f6",
    description: "单箱总重低于用户设置阈值，不参与偏载拦截，优先装满。"
  },
  yellow: {
    label: "黄色预警",
    tagType: "warning",
    color: "#d97706",
    sphereColor: "#f59e0b",
    description: "偏载接近阈值，建议保留微调空间。"
  },
  red: {
    label: "红色拦截",
    tagType: "danger",
    color: "#dc2626",
    sphereColor: "#e11d48",
    description: "偏载超过强制阈值，该方案不应输出。"
  }
} as const;

export function resolveBalanceState(options: {
  container: ContainerLike | null;
  placements: PlacementLike[];
  validation?: any;
}): BalanceState {
  const fallback = calculateMassBalance(options.container, options.placements);
  const source = options.validation?.valid ? options.validation : fallback;
  if (!source?.valid) {
    return {
      valid: false,
      severity: "green",
      tagType: "info",
      label: "暂无偏载数据",
      description: "当前货舱没有可用于重心分析的重量数据。",
      color: "#64748b",
      sphereColor: "#64748b",
      totalWeightKg: 0,
      center: source?.center || fallback.center,
      geometricCenter: source?.geometricCenter || fallback.geometricCenter,
      offset: source?.offset || {},
      loads: source?.loads || {},
      checks: {},
      limits: {},
      hotZones: []
    };
  }

  const severity = normalizeSeverity(source.severity || deriveSeverity(source));
  const meta = SEVERITY_META[severity];
  return {
    valid: true,
    severity,
    tagType: meta.tagType,
    label: meta.label,
    description: buildDescription(source, severity, meta.description),
    color: meta.color,
    sphereColor: meta.sphereColor,
    totalWeightKg: Number(source.totalWeightKg || 0),
    center: source.center,
    geometricCenter: source.geometricCenter,
    offset: source.offset || {},
    loads: source.loads || {},
    checks: source.checks || buildChecks(source),
    limits: source.limits || { greenPercent: 2.5, redPercent: 5, lateralOffsetLimitCm: 80 },
    hotZones: severity === "green" || severity === "exempt" ? [] : findHotZones(source)
  };
}

export function balanceSeverityRank(severity: BalanceSeverity) {
  return { exempt: 0, green: 0, yellow: 1, red: 2 }[severity] || 0;
}

function normalizeSeverity(value: string): BalanceSeverity {
  if (value === "red" || value === "yellow" || value === "green" || value === "exempt") return value;
  return "green";
}

function deriveSeverity(balance: any): BalanceSeverity {
  const checks = buildChecks(balance);
  const maxPercent = Math.max(
    Math.abs(Number(checks.frontRearDiffPercent || 0)),
    Math.abs(Number(checks.leftRightDiffPercent || 0)),
    Math.abs(Number(checks.longitudinalOffsetPercent || 0)),
    Math.abs(Number(checks.lateralOffsetPercent || 0))
  );
  const lateralCm = Math.abs(Number(checks.lateralOffsetCm || 0));
  if (maxPercent > 5 || lateralCm > 80) return "red";
  if (maxPercent > 2.5 || lateralCm > 40) return "yellow";
  return "green";
}

function buildChecks(balance: any) {
  const loads = balance.loads || {};
  const offset = balance.offset || {};
  return {
    frontPercent: round(loads.frontPercent),
    rearPercent: round(loads.rearPercent),
    frontRearDiffPercent: round(Math.abs(Number(loads.frontPercent || 0) - Number(loads.rearPercent || 0))),
    leftRightDiffPercent: round(Math.abs(Number(loads.leftPercent || 0) - Number(loads.rightPercent || 0))),
    longitudinalOffsetPercent: round(Math.abs(Number(offset.longitudinalPercent ?? offset.xPercent ?? 0))),
    lateralOffsetPercent: round(Math.abs(Number(offset.lateralPercent ?? offset.yPercent ?? 0))),
    lateralOffsetCm: round(Math.abs(Number(offset.lateralCm ?? offset.yCm ?? 0)))
  };
}

function buildDescription(balance: any, severity: BalanceSeverity, fallback: string) {
  if (severity === "exempt") return balance.message || fallback;
  const checks = balance.checks || buildChecks(balance);
  if (severity === "green") return fallback;
  const parts = [
    `前后差 ${round(checks.frontRearDiffPercent)}%`,
    `左右差 ${round(checks.leftRightDiffPercent)}%`,
    `X偏移 ${round(checks.longitudinalOffsetPercent)}%`,
    `Y偏移 ${round(checks.lateralOffsetPercent)}%`
  ];
  return `${fallback} ${parts.join("，")}。`;
}

function findHotZones(balance: any) {
  const loads = balance.loads || {};
  const zones = [
    ["frontLeft", Number(loads.frontLeftKg || 0)],
    ["frontRight", Number(loads.frontRightKg || 0)],
    ["rearLeft", Number(loads.rearLeftKg || 0)],
    ["rearRight", Number(loads.rearRightKg || 0)]
  ] as const;
  const max = Math.max(...zones.map(([, weight]) => weight), 0);
  const hot = zones.filter(([, weight]) => max > 0 && weight >= max * 0.96).map(([key]) => key);
  if (Number(loads.frontPercent || 0) > Number(loads.rearPercent || 0) + 5) hot.push("front");
  if (Number(loads.rearPercent || 0) > Number(loads.frontPercent || 0) + 5) hot.push("rear");
  if (Number(loads.leftPercent || 0) > Number(loads.rightPercent || 0) + 5) hot.push("left");
  if (Number(loads.rightPercent || 0) > Number(loads.leftPercent || 0) + 5) hot.push("right");
  return [...new Set(hot)];
}

function round(value: any, digits = 1) {
  const number = Number(value || 0);
  const pow = 10 ** digits;
  return Math.round(number * pow) / pow;
}
