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

console.log("Packing large-workload timeout, grouping, serialized mixed-plan, and resume regression passed.");
