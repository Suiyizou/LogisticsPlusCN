import assert from "node:assert/strict";
import { defaultContainers } from "../src/services/localData.js";
import {
  estimatePackingWorkload,
  packingTimeoutPolicyFromEstimate
} from "../src/services/packingClient.js";
import { calculate } from "../src/workers/packingWorker.js";

const cargos = Array.from({ length: 6 }, (_, index) => ({
  id: `bulk-${index}`,
  name: `Bulk cargo ${index + 1}`,
  lengthCm: 40 + index * 2,
  widthCm: 30 + index,
  heightCm: 25 + index,
  quantity: 18,
  weightKg: 20 + index,
  type: "normal"
}));
const containers = defaultContainers.filter((container) =>
  ["20gp", "40gp"].includes(String(container.id).toLowerCase())
);

assert.equal(containers.length, 2, "large-workload regression needs 20GP and 40GP fixtures");

const workload = estimatePackingWorkload({ cargos, containers });
assert.equal(workload.rawUnitCount, 108);
assert.equal(workload.solverUnitCount, 30, "six repeated cargo types should be grouped before search");
assert.equal(workload.hasGrouping, true);

const rescueEligibilityWorkload = estimatePackingWorkload({
  cargos: [
    ...Array.from({ length: 12 }, (_, index) => ({ id: `active-${index}`, quantity: 1 })),
    { id: "inactive-row", quantity: 0 }
  ],
  containers: [{ ...containers[0], id: "rack-name-but-gp", name: "Rack-name GP", equipmentClass: "GP", ignoreHeightLimit: false }]
});
assert.equal(rescueEligibilityWorkload.activeTypeCount, 12);
assert.equal(rescueEligibilityWorkload.minimumBoxRescueCandidateCount, 1, "zero-quantity rows and a valid GP class must match worker rescue eligibility");
assert.equal(
  estimatePackingWorkload({ cargos, containers: [{ ...containers[0], equipmentClass: "FR" }] }).minimumBoxRescueCandidateCount,
  0,
  "flat-rack containers must not receive a minimum-box column-rescue budget"
);

const timeoutPolicy = packingTimeoutPolicyFromEstimate(workload);
assert.equal(timeoutPolicy.expectedMs, 30 * 1000);
assert.equal(timeoutPolicy.idleTimeoutMs, 3 * 60 * 1000);
assert.equal(timeoutPolicy.hardTimeoutMs, 90 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "medium", seconds: 60 }).expectedMs, 90 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "medium", seconds: 60 }).hardTimeoutMs, 4 * 60 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "heavy", seconds: 180 }).expectedMs, 3 * 60 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "heavy", seconds: 180 }).hardTimeoutMs, 5 * 60 * 1000);

const firstStage = calculate({
  cargos,
  containers: containers.slice(0, 1),
  utilizationPercent: 90,
  globalGapCm: 1
});
assert.equal(firstStage.evaluations.length, 1);
assert.equal(firstStage.evaluations[0].solverUnits, 30, "worker grouping must match the workload estimate");
assert.equal(firstStage.evaluations[0].totalUnits, 108);

const resumed = calculate({
  cargos,
  containers,
  resumeEvaluations: firstStage.evaluations,
  utilizationPercent: 90,
  globalGapCm: 1
});
const resumedBaseIds = resumed.evaluations
  .map((evaluation) => String(evaluation?.container?.id || ""))
  .filter((id) => id !== "mixed-plan");
assert.deepEqual(new Set(resumedBaseIds), new Set(["20gp", "40gp"]));
assert.deepEqual(new Set(resumed.completedContainerIds), new Set(["20gp", "40gp"]));
assert.deepEqual(resumed.pendingContainerIds, []);
assert.equal(
  resumed.evaluations.find((evaluation) => evaluation.container.id === "20gp"),
  firstStage.evaluations[0],
  "resume must reuse the completed evaluation instead of recalculating it"
);

const resumedWorkload = estimatePackingWorkload({
  cargos,
  containers,
  resumeEvaluations: firstStage.evaluations,
  utilizationPercent: 90,
  globalGapCm: 1
});
assert.equal(resumedWorkload.containerCount, 1, "resume workload should count only pending containers");
assert.equal(resumedWorkload.completedContainerCount, 1);

const staleResumeContainer = {
  ...containers[0],
  id: "stale-resume",
  name: "Stale resume",
  lengthCm: 400,
  widthCm: 200,
  heightCm: 200,
  heightLimitCm: 200
};
const staleBaseRun = calculate({
  cargos: [{ id: "old-cargo", name: "Old cargo", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 1, weightKg: 10, type: "normal" }],
  containers: [staleResumeContainer],
  utilizationPercent: 100,
  globalGapCm: 0
});
const staleSerializedEvaluations = JSON.parse(JSON.stringify(staleBaseRun.evaluations));
const refreshedRequest = {
  cargos: [{ id: "new-cargo", name: "New cargo", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 2, weightKg: 10, type: "normal" }],
  containers: [staleResumeContainer],
  resumeEvaluations: staleSerializedEvaluations,
  utilizationPercent: 100,
  globalGapCm: 0
};
const staleResumeWorkload = estimatePackingWorkload(refreshedRequest);
assert.equal(staleResumeWorkload.completedContainerCount, 0, "stale stage results must not reduce the client timeout estimate");
assert.equal(staleResumeWorkload.containerCount, 1, "the edited request still has one pending container to calculate");
const refreshedRun = calculate({
  ...refreshedRequest
});
const refreshedEvaluation = refreshedRun.evaluations.find((evaluation) => evaluation.container.id === "stale-resume");
assert.equal(refreshedEvaluation.totalUnits, 2, "changed cargo must invalidate a serialized stage result");
assert.equal(
  refreshedEvaluation.packedBoxes.flatMap((box) => box.placed).filter((placement) => placement.cargoId === "new-cargo").length,
  2,
  "resume fingerprint mismatch must trigger a fresh packing run"
);
assert.equal(
  refreshedEvaluation.packedBoxes.flatMap((box) => box.placed).some((placement) => placement.cargoId === "old-cargo"),
  false,
  "stale placements must never leak into a changed request"
);

const mixedResumeContainers = [
  {
    id: "40gp",
    name: "40GP",
    lengthCm: 1203,
    widthCm: 235.215,
    heightCm: 239.5,
    heightLimitCm: 239.5,
    payloadKg: 28000,
    usagePriority: "common",
    visualKind: "dry",
    equipmentClass: "GP",
    referencePrice: 6687,
    referenceCurrency: "USD"
  },
  {
    id: "40hq",
    name: "40HQ",
    lengthCm: 1203,
    widthCm: 235.215,
    heightCm: 269,
    heightLimitCm: 269,
    payloadKg: 28000,
    usagePriority: "common",
    visualKind: "high-cube",
    equipmentClass: "HQ",
    referencePrice: 6890,
    referenceCurrency: "USD"
  }
];
const mixedResumeCargos = [
  { id: "mixed-tall", name: "Mixed tall", lengthCm: 1180, widthCm: 220, heightCm: 250, quantity: 1, weightKg: 100, type: "normal" },
  { id: "mixed-cube", name: "Mixed cube", lengthCm: 100, widthCm: 78.405, heightCm: 100, quantity: 61, weightKg: 10, type: "upright" }
];
const completeMixedRun = calculate({
  cargos: mixedResumeCargos,
  containers: mixedResumeContainers,
  utilizationPercent: 100,
  globalGapCm: 0
});
const completeMixedEvaluation = completeMixedRun.evaluations
  .find((evaluation) => evaluation.container.id === "mixed-plan");
assert.ok(completeMixedEvaluation, "full 40HQ/40GP calculation must produce a mixed plan");

const serializedBaseEvaluations = JSON.parse(JSON.stringify(
  completeMixedRun.evaluations.filter((evaluation) => evaluation.container.id !== "mixed-plan")
));
assert.ok(
  serializedBaseEvaluations.every((evaluation) => !("_sourcePackedBoxes" in evaluation)),
  "resume fixture must cross a real JSON boundary without private worker state"
);
assert.ok(
  serializedBaseEvaluations.every((evaluation) => Array.isArray(evaluation.resumePackedBoxes)),
  "serialized stage results must retain full-precision solver coordinates"
);
const resumedMixedRun = calculate({
  cargos: mixedResumeCargos,
  containers: mixedResumeContainers,
  resumeEvaluations: serializedBaseEvaluations,
  utilizationPercent: 100,
  globalGapCm: 0
});
const resumedMixedEvaluation = resumedMixedRun.evaluations
  .find((evaluation) => evaluation.container.id === "mixed-plan");
assert.ok(resumedMixedEvaluation, "mixed plan must survive JSON-serialized resumeEvaluations");

function physicalPlacements(evaluation) {
  return (evaluation.packedBoxes || []).flatMap((box) => box.placed || []);
}

function assertMixedQuantityConservation(evaluation) {
  const placements = physicalPlacements(evaluation);
  assert.equal(placements.length, 62, "mixed plan must retain all 62 physical cargo items");
  assert.equal(placements.filter((placement) => placement.cargoId === "mixed-tall").length, 1);
  assert.equal(placements.filter((placement) => placement.cargoId === "mixed-cube").length, 61);
  assert.equal(new Set(placements.map((placement) => placement.unitKey)).size, 62, "mixed plan unit keys must stay unique");
  assert.equal(
    (evaluation.mixedPlan?.boxes || []).reduce((sum, box) => sum + Number(box.placedCount || 0), 0),
    62,
    "mixed plan summary counts must match the physical placements"
  );
}

assertMixedQuantityConservation(completeMixedEvaluation);
assertMixedQuantityConservation(resumedMixedEvaluation);
assert.deepEqual(
  (resumedMixedEvaluation.mixedPlan?.boxes || []).map((box) => box.containerId).sort(),
  ["40gp", "40hq"],
  "serialized resume must retain the boundary-fit 40HQ + 40GP partition"
);

const furnitureCargos = [
  { id: "furniture-table", name: "FT-1200", lengthCm: 120, widthCm: 80, heightCm: 40, quantity: 25, weightKg: 25, type: "normal" },
  { id: "furniture-rack", name: "SR-4L", lengthCm: 75, widthCm: 35, heightCm: 60, quantity: 60, weightKg: 6, type: "normal" },
  { id: "furniture-chair", name: "OC-668", lengthCm: 65, widthCm: 65, heightCm: 85, quantity: 20, weightKg: 12, type: "normal" },
  { id: "furniture-mattress", name: "VM-150", lengthCm: 140, widthCm: 70, heightCm: 25, quantity: 30, weightKg: 18, type: "normal" },
  { id: "furniture-sofa", name: "SF-2S", lengthCm: 150, widthCm: 80, heightCm: 60, quantity: 10, weightKg: 35, type: "nonstack" },
  { id: "furniture-bookcase", name: "BK-95", lengthCm: 95, widthCm: 40, heightCm: 35, quantity: 40, weightKg: 10, type: "pallet" }
];
const furniture20Gp = {
  id: "furniture-20gp",
  name: "Furniture 20GP",
  lengthCm: 590,
  widthCm: 235.2,
  heightCm: 239.5,
  heightLimitCm: 239.5,
  payloadKg: 21800,
  usagePriority: "common",
  visualKind: "dry",
  equipmentClass: "GP"
};
const furnitureWorkload = estimatePackingWorkload({
  cargos: furnitureCargos,
  containers: [
    furniture20Gp,
    { ...furniture20Gp, id: "furniture-20hq", name: "Furniture 20HQ", heightCm: 269, heightLimitCm: 269, equipmentClass: "HQ" },
    { ...furniture20Gp, id: "furniture-40gp", name: "Furniture 40GP", lengthCm: 1203 },
    { ...furniture20Gp, id: "furniture-40hq", name: "Furniture 40HQ", lengthCm: 1203, heightCm: 269, heightLimitCm: 269, equipmentClass: "HQ" }
  ],
  utilizationPercent: 98,
  globalGapCm: 2
});
assert.equal(furnitureWorkload.minimumBoxRescueCandidateCount, 4);
assert.equal(furnitureWorkload.minimumBoxRescueBudgetSeconds, 32);
assert.equal(furnitureWorkload.level, "medium", "minimum-box rescue must be included in the client workload tier");
assert.equal(packingTimeoutPolicyFromEstimate(furnitureWorkload).hardTimeoutMs, 3 * 60 * 1000);

const furnitureEvaluation = calculate({
  cargos: furnitureCargos,
  containers: [furniture20Gp],
  utilizationPercent: 98,
  globalGapCm: 2,
  supportRatioPercent: 80,
  nonStackSupportRatioPercent: 90
}).evaluations[0];

const furniture20Hq = defaultContainers.find((container) => String(container.id).toLowerCase() === "20hq");
const furniture40Gp = defaultContainers.find((container) => String(container.id).toLowerCase() === "40gp");
assert.ok(furniture20Hq, "the furniture regression needs the production 20HQ profile");
assert.ok(furniture40Gp, "the furniture regression needs the production 40GP profile");

function calculateFurnitureEvaluation(container) {
  const run = calculate({
    cargos: furnitureCargos,
    containers: [container],
    utilizationPercent: 98,
    globalGapCm: 2,
    supportRatioPercent: 80,
    nonStackSupportRatioPercent: 90
  });
  return run.evaluations.find((evaluation) => evaluation.container.id === container.id);
}

const furniture20HqEvaluation = calculateFurnitureEvaluation(furniture20Hq);
const furniture40GpEvaluation = calculateFurnitureEvaluation(furniture40Gp);
assert.ok(furniture20HqEvaluation, "the production 20HQ profile must be evaluated");
assert.ok(furniture40GpEvaluation, "the production 40GP profile must be evaluated");

function furniturePhysicalRect(placement) {
  return {
    x: Number(placement.physicalXCm ?? placement.xCm ?? 0),
    y: Number(placement.physicalYCm ?? placement.yCm ?? 0),
    z: Number(placement.physicalZCm ?? placement.zCm ?? 0),
    length: Number(placement.physicalLengthCm ?? placement.lengthCm ?? 0),
    width: Number(placement.physicalWidthCm ?? placement.widthCm ?? 0),
    height: Number(placement.physicalHeightCm ?? placement.heightCm ?? 0)
  };
}

function furnitureDecksOverlap(a, b) {
  const epsilon = 1e-6;
  return Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > epsilon
    && Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > epsilon;
}

function furnitureNonStackBearingViolations(evaluation) {
  const violations = [];
  for (const box of evaluation.packedBoxes || []) {
    for (const nonStack of box.placed.filter((placement) => placement.nonStack)) {
      const nonStackRect = furniturePhysicalRect(nonStack);
      const nonStackTop = nonStackRect.z + nonStackRect.height;
      for (const other of box.placed) {
        if (other.unitKey === nonStack.unitKey) continue;
        const otherRect = furniturePhysicalRect(other);
        if (otherRect.z < nonStackTop - 1e-6) continue;
        if (furnitureDecksOverlap(nonStackRect, otherRect)) {
          violations.push(`${nonStack.unitKey}->${other.unitKey}`);
        }
      }
    }
  }
  return violations;
}

function furnitureUnionRectArea(rects) {
  const epsilon = 1e-6;
  const xs = [...new Set(rects.flatMap((rect) => [rect.x, rect.x + rect.length]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const x1 = xs[index];
    const x2 = xs[index + 1];
    if (x2 - x1 <= epsilon) continue;
    const spans = rects
      .filter((rect) => rect.x < x2 - epsilon && rect.x + rect.length > x1 + epsilon)
      .map((rect) => [rect.y, rect.y + rect.width])
      .sort((a, b) => a[0] - b[0]);
    let spanStart = null;
    let spanEnd = 0;
    let covered = 0;
    for (const [start, end] of spans) {
      if (spanStart === null) {
        spanStart = start;
        spanEnd = end;
      } else if (start <= spanEnd + epsilon) {
        spanEnd = Math.max(spanEnd, end);
      } else {
        covered += spanEnd - spanStart;
        spanStart = start;
        spanEnd = end;
      }
    }
    if (spanStart !== null) covered += spanEnd - spanStart;
    area += (x2 - x1) * covered;
  }
  return area;
}

function furnitureBoxLayoutQuality(container, box, deepColumnDepth = 6) {
  const epsilon = 1e-6;
  const rects = (box.placed || []).map(furniturePhysicalRect);
  const floorRects = rects.filter((rect) => rect.z <= epsilon);
  const floorArea = Number(container.lengthCm) * Number(container.widthCm);
  const columns = new Map();
  for (const rect of rects) {
    const key = [rect.x, rect.y, rect.length, rect.width]
      .map((value) => Math.round(value * 1000) / 1000)
      .join("/");
    columns.set(key, (columns.get(key) || 0) + 1);
  }
  const columnDepths = [...columns.values()];
  const deepColumnPieces = columnDepths
    .filter((depth) => depth > deepColumnDepth)
    .reduce((sum, depth) => sum + depth, 0);

  const xs = [...new Set(rects.flatMap((rect) => [rect.x, rect.x + rect.length]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((rect) => [rect.y, rect.y + rect.width]))].sort((a, b) => a - b);
  let projectedArea = 0;
  let heightMoment = 0;
  let heightSquaredMoment = 0;
  for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
    const x1 = xs[xIndex];
    const x2 = xs[xIndex + 1];
    const sampleX = (x1 + x2) / 2;
    for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
      const y1 = ys[yIndex];
      const y2 = ys[yIndex + 1];
      const sampleY = (y1 + y2) / 2;
      const covering = rects.filter((rect) =>
        sampleX > rect.x - epsilon
        && sampleX < rect.x + rect.length + epsilon
        && sampleY > rect.y - epsilon
        && sampleY < rect.y + rect.width + epsilon
      );
      if (!covering.length) continue;
      const cellArea = (x2 - x1) * (y2 - y1);
      const top = Math.max(...covering.map((rect) => rect.z + rect.height));
      projectedArea += cellArea;
      heightMoment += cellArea * top;
      heightSquaredMoment += cellArea * top * top;
    }
  }
  const meanHeight = projectedArea > epsilon ? heightMoment / projectedArea : 0;
  const skylineVariance = projectedArea > epsilon
    ? Math.max(0, heightSquaredMoment / projectedArea - meanHeight * meanHeight)
    : 0;
  const maxTop = rects.length ? Math.max(...rects.map((rect) => rect.z + rect.height)) : 0;
  const heightLimit = Number(container.heightLimitCm || container.heightCm || 0);
  return {
    floorCoverageRatio: floorArea > epsilon ? furnitureUnionRectArea(floorRects) / floorArea : 0,
    deepColumnPieceRatio: rects.length ? deepColumnPieces / rects.length : 0,
    maxColumnDepth: columnDepths.length ? Math.max(...columnDepths) : 0,
    skylineCv: meanHeight > epsilon ? Math.sqrt(skylineVariance) / meanHeight : 0,
    maxTopRatio: heightLimit > epsilon ? maxTop / heightLimit : 0
  };
}

function assertFurnitureSolution(evaluation, expectedBoxes, label) {
  assert.equal(evaluation.fitStatus, "fit", `${label} must fit all furniture cargo`);
  assert.equal(evaluation.boxes, expectedBoxes, `${label} must use the minimum known container count`);
  assert.equal(evaluation.packedBoxes.length, expectedBoxes, `${label} must retain coordinates for every container`);
  assert.equal(evaluation.estimatedBoxes, false, `${label} must be solved rather than volume-estimated`);
  const placements = physicalPlacements(evaluation);
  assert.equal(placements.length, 185, `${label} must retain all 185 physical cargo items`);
  assert.equal(new Set(placements.map((placement) => placement.unitKey)).size, 185, `${label} unit keys must stay unique`);
  assert.deepEqual(
    Object.fromEntries(furnitureCargos.map((cargo) => [
      cargo.id,
      placements.filter((placement) => placement.cargoId === cargo.id).length
    ])),
    Object.fromEntries(furnitureCargos.map((cargo) => [cargo.id, cargo.quantity])),
    `${label} must preserve every source cargo quantity`
  );
  assert.equal(evaluation.geometryFeasible, true, `${label} geometry must remain feasible`);
  assert.equal(evaluation.complianceFeasible, true, `${label} placement rules must remain feasible`);
  assert.equal(evaluation.placementConstraintsBlocked, false, `${label} must not bypass placement rules`);
  assert.equal(evaluation.balanceBlocked, false, `${label} must not fail balance validation`);
  assert.ok(
    evaluation.packedBoxes.every((box) => box.balanceValidation?.severity !== "red"),
    `${label} must not contain a red balance validation`
  );
  assert.deepEqual(furnitureNonStackBearingViolations(evaluation), [], `${label} must not load above an SF-2S sofa`);
}

assert.equal(furnitureEvaluation.fitStatus, "fit");
assert.equal(furnitureEvaluation.boxes, 2, "the exact 185-piece fixture must not regress from two 20GP containers");
assert.equal(furnitureEvaluation.packedBoxes.length, 2, "both 20GP layouts must include fully detailed safe coordinates");
assert.equal(furnitureEvaluation.estimatedBoxes, false, "the two-container result must be solved rather than volume-estimated");

const furniturePlacements = physicalPlacements(furnitureEvaluation);
assert.equal(furniturePlacements.length, 185);
assert.equal(new Set(furniturePlacements.map((placement) => placement.unitKey)).size, 185);
assert.deepEqual(
  Object.fromEntries(furnitureCargos.map((cargo) => [
    cargo.id,
    furniturePlacements.filter((placement) => placement.cargoId === cargo.id).length
  ])),
  Object.fromEntries(furnitureCargos.map((cargo) => [cargo.id, cargo.quantity])),
  "the two-container rescue must preserve every source cargo quantity"
);

assert.equal(furnitureEvaluation.geometryFeasible, true);
assert.equal(furnitureEvaluation.complianceFeasible, true);
assert.equal(furnitureEvaluation.placementConstraintsBlocked, false);
assert.equal(furnitureEvaluation.balanceBlocked, false);
assert.ok(
  furnitureEvaluation.packedBoxes.every((box) => box.balanceValidation?.severity !== "red"),
  "neither rescued 20GP layout may have a red balance validation"
);
assert.ok(
  furnitureEvaluation.packedBoxes.every((box) => box.strategySummary?.complianceBlocked !== true),
  "neither rescued 20GP layout may bypass placement compliance"
);
assert.deepEqual(
  furnitureNonStackBearingViolations(furnitureEvaluation),
  [],
  "nothing may be loaded above a non-stackable SF-2S sofa"
);
assert.equal(
  furniturePlacements.filter((placement) => placement.nonStack).length,
  10,
  "all ten non-stackable SF-2S sofas must be retained"
);

assertFurnitureSolution(furniture20HqEvaluation, 2, "production 20HQ furniture plan");
assertFurnitureSolution(furniture40GpEvaluation, 1, "production 40GP furniture plan");

const furniture20HqQuality = furniture20HqEvaluation.packedBoxes
  .map((box) => furnitureBoxLayoutQuality(furniture20Hq, box));
assert.equal(furniture20HqQuality.length, 2);
assert.ok(
  furniture20HqQuality.every((quality) => quality.floorCoverageRatio >= 0.64),
  "both 20HQ layouts must keep a useful physical floor deck"
);
assert.ok(
  furniture20HqQuality.every((quality) => quality.maxColumnDepth <= 9),
  "the two-box 20HQ result must not trade its box-count win for an obvious ten-layer cargo forest"
);
assert.ok(
  Math.max(...furniture20HqQuality.map((quality) => quality.deepColumnPieceRatio)) <= 0.5,
  "deep exact-footprint columns must not dominate either 20HQ layout"
);

const furniture40GpQuality = furniture40GpEvaluation.packedBoxes
  .map((box) => furnitureBoxLayoutQuality(furniture40Gp, box));
assert.equal(furniture40GpQuality.length, 1);
assert.ok(furniture40GpQuality[0].floorCoverageRatio >= 0.75, "the one-box 40GP win must retain a broad floor deck");
assert.ok(furniture40GpQuality[0].maxColumnDepth <= 8, "the one-box 40GP win must not collapse into extreme columns");
assert.ok(furniture40GpQuality[0].deepColumnPieceRatio <= 0.2, "deep columns must remain exceptional in the 40GP layout");
assert.ok(furniture40GpQuality[0].skylineCv <= 0.25, "the one-box 40GP skyline must remain reasonably level");
assert.ok(furniture40GpQuality[0].maxTopRatio <= 1, "the one-box 40GP layout must stay below its height limit");

console.log("Packing large-workload timeout, grouping, minimum-box furniture quality, serialized mixed-plan, and resume regression passed.");
