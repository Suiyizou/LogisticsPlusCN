import assert from "node:assert/strict";
import { __testGroupedOrientationRoundTrip, calculate } from "../src/workers/packingWorker.js";

const EPS = 1e-6;
const AXIS_LENGTH = "\u957f";
const AXIS_WIDTH = "\u5bbd";
const AXIS_HEIGHT = "\u9ad8";
const palletPackageInfo = { handlingUnitType: "pallet", packageUnit: "pallet" };

const highCube = {
  id: "40hq",
  name: "40HQ High Cube",
  lengthCm: 1203.2,
  widthCm: 235,
  heightCm: 270,
  heightLimitCm: 270,
  payloadKg: 28600,
  usagePriority: "common",
  visualKind: "high-cube"
};

function evaluate(cargos, overrides = {}) {
  const container = overrides.container || highCube;
  return calculate({
    cargos,
    containers: [container],
    utilizationPercent: overrides.utilizationPercent ?? 98,
    globalGapCm: overrides.globalGapCm ?? 2,
    supportRatioPercent: overrides.supportRatioPercent ?? 80,
    nonStackSupportRatioPercent: overrides.nonStackSupportRatioPercent ?? 90,
    balanceSettings: overrides.balanceSettings
  }).evaluations[0];
}

function allPlacements(evaluation) {
  return evaluation.packedBoxes.flatMap((box) => box.placed);
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= EPS, `${message}: expected ${expected}, got ${actual}`);
}

function assertGapEnvelope(placement, gap = 2) {
  assertClose(placement.lengthCm, placement.physicalLengthCm + gap, `${placement.unitKey} occupied X`);
  assertClose(placement.widthCm, placement.physicalWidthCm + gap, `${placement.unitKey} occupied Y`);
  assertClose(placement.heightCm, placement.physicalHeightCm, `${placement.unitKey} occupied Z`);
  assertClose(placement.physicalXCm, placement.xCm + gap / 2, `${placement.unitKey} physical X origin`);
  assertClose(placement.physicalYCm, placement.yCm + gap / 2, `${placement.unitKey} physical Y origin`);
  assertClose(placement.physicalZCm, placement.zCm, `${placement.unitKey} physical Z origin`);
  assertClose(placement.horizontalGapCm, gap, `${placement.unitKey} horizontal gap`);
  assertClose(placement.clearancePerSideCm, gap / 2, `${placement.unitKey} per-side gap`);
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
  const xs = [...new Set(rects.flatMap((rect) => [rect.x, rect.x + rect.lengthCm]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const spans = rects
      .filter((rect) => rect.x < x2 - EPS && rect.x + rect.lengthCm > x1 + EPS)
      .map((rect) => [rect.y, rect.y + rect.widthCm])
      .sort((a, b) => a[0] - b[0]);
    if (!spans.length) continue;
    let start = spans[0][0];
    let end = spans[0][1];
    let covered = 0;
    for (let j = 1; j < spans.length; j += 1) {
      if (spans[j][0] <= end + EPS) end = Math.max(end, spans[j][1]);
      else {
        covered += end - start;
        [start, end] = spans[j];
      }
    }
    covered += end - start;
    area += (x2 - x1) * covered;
  }
  return area;
}

function assertPhysicalSupport(evaluation, supportRatio = 0.8, nonStackSupportRatio = 0.9) {
  for (const box of evaluation.packedBoxes) {
    for (const placement of box.placed) {
      if (placement.physicalZCm <= EPS) continue;
      const target = {
        x: placement.physicalXCm,
        y: placement.physicalYCm,
        lengthCm: placement.physicalLengthCm,
        widthCm: placement.physicalWidthCm
      };
      const overlaps = box.placed
        .filter((lower) => !lower.nonStack
          && Math.abs(lower.physicalZCm + lower.physicalHeightCm - placement.physicalZCm) <= EPS)
        .map((lower) => overlapRect(target, {
          x: lower.physicalXCm,
          y: lower.physicalYCm,
          lengthCm: lower.physicalLengthCm,
          widthCm: lower.physicalWidthCm
        }))
        .filter(Boolean);
      const required = placement.nonStack ? nonStackSupportRatio : supportRatio;
      const ratio = unionArea(overlaps) / (target.lengthCm * target.widthCm);
      assert.ok(ratio + EPS >= required, `${placement.unitKey} physical support ${ratio} is below ${required}`);
    }
  }
}

const bCargo = {
  id: "round-b",
  name: "Round lamp B",
  lengthCm: 121,
  widthCm: 116,
  heightCm: 131,
  quantity: 2,
  weightKg: 312,
  type: "pallet",
  packageInfo: palletPackageInfo,
  color: "#8b5cf6"
};

const pairEvaluation = evaluate([bCargo]);
assert.equal(pairEvaluation.boxes, 1);
const pair = allPlacements(pairEvaluation).sort((a, b) => a.xCm - b.xCm);
assert.equal(pair.length, 2);
for (const placement of pair) {
  assert.deepEqual([placement.xAxis, placement.yAxis, placement.zAxis], [AXIS_LENGTH, AXIS_HEIGHT, AXIS_WIDTH]);
  assert.deepEqual(
    [placement.physicalLengthCm, placement.physicalWidthCm, placement.physicalHeightCm],
    [121, 131, 116]
  );
  assert.deepEqual([placement.lengthCm, placement.widthCm, placement.heightCm], [123, 133, 116]);
  assertGapEnvelope(placement);
}
assertClose(pair[1].physicalXCm - (pair[0].physicalXCm + pair[0].physicalLengthCm), 2, "pair net X gap");

const screenshotCargos = [
  { id: "downlight", name: "Surface downlight", lengthCm: 116, widthCm: 116, heightCm: 168, quantity: 1, weightKg: 845.8, type: "pallet", packageInfo: palletPackageInfo, color: "#2a9d8f" },
  { id: "round-a", name: "Round lamp A", lengthCm: 116, widthCm: 116, heightCm: 91, quantity: 6, weightKg: 358.6, type: "pallet", packageInfo: palletPackageInfo, color: "#3b82f6" },
  { id: "round-b", name: "Round lamp B", lengthCm: 121, widthCm: 116, heightCm: 131, quantity: 8, weightKg: 312, type: "pallet", packageInfo: palletPackageInfo, color: "#8b5cf6" },
  { id: "round-c", name: "Round lamp C", lengthCm: 161, widthCm: 116, heightCm: 171, quantity: 8, weightKg: 627.6, type: "pallet", packageInfo: palletPackageInfo, color: "#f97316" },
  { id: "mixed", name: "Mixed round lamps", lengthCm: 161, widthCm: 116, heightCm: 171, quantity: 1, weightKg: 356.6, type: "pallet", packageInfo: palletPackageInfo, color: "#e11d48" },
  { id: "6012", name: "6012", lengthCm: 130, widthCm: 120, heightCm: 210, quantity: 12, weightKg: 327.5, type: "pallet", packageInfo: palletPackageInfo, color: "#2a9d8f" }
];

const screenshotEvaluation = evaluate(screenshotCargos, {
  balanceSettings: {
    greenThresholdPercent: 2.5,
    redBlockPercent: 5,
    lateralOffsetMm: 80,
    ignoreLightLoadsT: 18,
    maxFrontLoadPercent: 60,
    flatRackRearMinimumPercent: 30
  }
});
assert.equal(screenshotEvaluation.fitStatus, "fit");
assert.equal(screenshotEvaluation.boxes, 2);
assertClose(screenshotEvaluation.averageFillPercent, 61.73, "screenshot average fill");
const screenshotPlacements = allPlacements(screenshotEvaluation);
assert.equal(screenshotPlacements.length, 36);
screenshotPlacements.forEach((placement) => assertGapEnvelope(placement));
assertPhysicalSupport(screenshotEvaluation);
const bPlacements = screenshotPlacements.filter((placement) => placement.cargoId === "round-b");
assert.equal(bPlacements.length, 8);
assert.ok(bPlacements.some((placement) => placement.xAxis === AXIS_LENGTH
  && placement.yAxis === AXIS_HEIGHT
  && placement.zAxis === AXIS_WIDTH
  && placement.lengthCm === 123
  && placement.widthCm === 133
  && placement.heightCm === 116));
assert.ok(!bPlacements.some((placement) => placement.lengthCm === 126
  && placement.widthCm === 134
  && placement.heightCm === 121));

const supportTrapContainer = {
  id: "support-trap",
  name: "Support trap",
  lengthCm: 120,
  widthCm: 120,
  heightCm: 70,
  heightLimitCm: 70,
  payloadKg: 10000
};
const supportTrapEvaluation = evaluate([
  { id: "lower", name: "Lower", lengthCm: 40, widthCm: 100, heightCm: 50, quantity: 2, weightKg: 10, type: "upright", keepUpright: true },
  { id: "upper", name: "Upper", lengthCm: 100, widthCm: 100, heightCm: 20, quantity: 1, weightKg: 10, type: "nonstack", keepUpright: true, nonStack: true }
], {
  container: supportTrapContainer,
  utilizationPercent: 100,
  globalGapCm: 20,
  supportRatioPercent: 90,
  nonStackSupportRatioPercent: 90
});
assert.equal(supportTrapEvaluation.boxes, 2, "80% physical support must not pass a 90% threshold");
allPlacements(supportTrapEvaluation).forEach((placement) => assertGapEnvelope(placement, 20));
assertPhysicalSupport(supportTrapEvaluation, 0.9, 0.9);

const roundTripStates = __testGroupedOrientationRoundTrip({
  lengthCm: 70,
  widthCm: 40,
  heightCm: 10,
  cols: 2,
  rows: 2,
  gapCm: 2,
  rounds: 3
});
const expectedGroupedFootprints = [
  { x: 1, y: 1, lengthCm: 40, widthCm: 70 },
  { x: 1, y: 73, lengthCm: 40, widthCm: 70 },
  { x: 43, y: 1, lengthCm: 40, widthCm: 70 },
  { x: 43, y: 73, lengthCm: 40, widthCm: 70 }
];
for (const state of roundTripStates) {
  assert.deepEqual(
    [state.canonicalPhysicalLengthCm, state.canonicalPhysicalWidthCm, state.canonicalOccupiedLengthCm, state.canonicalOccupiedWidthCm],
    [142, 82, 144, 84]
  );
  assert.deepEqual(
    [state.base.lengthCm, state.base.widthCm, state.base.orientationKey, state.base.groupRotated],
    [144, 84, "LWH", false]
  );
  assert.deepEqual(
    [state.rotated.lengthCm, state.rotated.widthCm, state.rotated.orientationKey, state.rotated.groupRotated],
    [84, 144, "WLH", true]
  );
  assert.deepEqual(state.selected, state.rotated);
  assert.deepEqual(state.footprints, expectedGroupedFootprints);
}

const forcedGroupContainer = {
  id: "forced-group-rotation",
  name: "Forced group rotation",
  lengthCm: 84,
  widthCm: 144,
  heightCm: 300,
  heightLimitCm: 300,
  payloadKg: 10000
};
const forcedGroupEvaluation = evaluate([{
  id: "forced-group",
  name: "Forced group",
  lengthCm: 70,
  widthCm: 40,
  heightCm: 10,
  quantity: 120,
  weightKg: 1,
  type: "pallet",
  packageInfo: palletPackageInfo,
  color: "#0f766e"
}], {
  container: forcedGroupContainer,
  utilizationPercent: 100,
  globalGapCm: 2
});
assert.equal(forcedGroupEvaluation.fitStatus, "fit");
const forcedGroupPlacements = allPlacements(forcedGroupEvaluation);
assert.equal(forcedGroupPlacements.length, 120);
forcedGroupPlacements.forEach((placement) => assertGapEnvelope(placement));
assertPhysicalSupport(forcedGroupEvaluation);
const rotatedGroupPieces = forcedGroupPlacements.filter((placement) => placement.parentUnitKey === "forced-group-g0-x4");
assert.equal(rotatedGroupPieces.length, 4);
const fullRotatedGroups = new Map();
for (const placement of forcedGroupPlacements.filter((item) => item.groupRotated && /^forced-group-g\d+-x4$/.test(item.parentUnitKey || ""))) {
  const pieces = fullRotatedGroups.get(placement.parentUnitKey) || [];
  pieces.push(placement);
  fullRotatedGroups.set(placement.parentUnitKey, pieces);
}
assert.ok(fullRotatedGroups.size > 0);
for (const pieces of fullRotatedGroups.values()) {
  assert.equal(pieces.length, 4);
  for (const placement of pieces) {
    assert.deepEqual([placement.physicalLengthCm, placement.physicalWidthCm, placement.physicalHeightCm], [40, 70, 10]);
    assert.deepEqual([placement.lengthCm, placement.widthCm, placement.heightCm], [42, 72, 10]);
    assert.deepEqual([placement.xAxis, placement.yAxis, placement.zAxis], [AXIS_WIDTH, AXIS_LENGTH, AXIS_HEIGHT]);
    assert.equal(placement.orientationKey, "WLH");
    assert.equal(placement.groupRotated, true);
  }
}
assert.deepEqual([...new Set(rotatedGroupPieces.map((placement) => placement.physicalXCm))].sort((a, b) => a - b), [1, 43]);
assert.deepEqual([...new Set(rotatedGroupPieces.map((placement) => placement.physicalYCm))].sort((a, b) => a - b), [1, 73]);

const squareGroupContainer = {
  id: "square-group",
  name: "Square group",
  lengthCm: 24,
  widthCm: 24,
  heightCm: 600,
  heightLimitCm: 600,
  payloadKg: 10000
};
const squareGroupEvaluation = evaluate([{
  id: "square-group-cargo",
  name: "Square group cargo",
  lengthCm: 22,
  widthCm: 10,
  heightCm: 10,
  quantity: 120,
  weightKg: 1,
  type: "pallet",
  packageInfo: palletPackageInfo,
  color: "#1d4ed8"
}], {
  container: squareGroupContainer,
  utilizationPercent: 100,
  globalGapCm: 2
});
assert.equal(squareGroupEvaluation.fitStatus, "fit");
assert.equal(squareGroupEvaluation.boxes, 1);
const squareGroupPlacements = allPlacements(squareGroupEvaluation);
assert.equal(squareGroupPlacements.length, 120);
squareGroupPlacements.forEach((placement) => assertGapEnvelope(placement));
assertPhysicalSupport(squareGroupEvaluation);
const squareBasePieces = squareGroupPlacements.filter((placement) => placement.parentUnitKey === "square-group-cargo-g0-x2");
assert.equal(squareBasePieces.length, 2);
for (const placement of squareBasePieces) {
  assert.deepEqual([placement.physicalLengthCm, placement.physicalWidthCm, placement.physicalHeightCm], [22, 10, 10]);
  assert.deepEqual([placement.lengthCm, placement.widthCm, placement.heightCm], [24, 12, 10]);
  assert.deepEqual([placement.xAxis, placement.yAxis, placement.zAxis], [AXIS_LENGTH, AXIS_WIDTH, AXIS_HEIGHT]);
  assert.equal(placement.orientationKey, "LWH");
  assert.equal(placement.groupRotated, false);
}
assert.deepEqual([...new Set(squareBasePieces.map((placement) => placement.physicalXCm))], [1]);
assert.deepEqual([...new Set(squareBasePieces.map((placement) => placement.physicalYCm))].sort((a, b) => a - b), [1, 13]);

console.log("Packing pallet-gap and physical-support regression passed.");
