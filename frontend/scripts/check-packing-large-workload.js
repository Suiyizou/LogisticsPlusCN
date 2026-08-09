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

console.log("Packing large-workload timeout, grouping, two-20GP furniture safety, serialized mixed-plan, and resume regression passed.");
