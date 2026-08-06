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
assert.equal(timeoutPolicy.expectedMs, 5 * 60 * 1000);
assert.equal(timeoutPolicy.idleTimeoutMs, 3 * 60 * 1000);
assert.equal(timeoutPolicy.hardTimeoutMs, 10 * 60 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "medium", seconds: 60 }).expectedMs, 12 * 60 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "medium", seconds: 60 }).hardTimeoutMs, 20 * 60 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "heavy", seconds: 180 }).expectedMs, 25 * 60 * 1000);
assert.equal(packingTimeoutPolicyFromEstimate({ level: "heavy", seconds: 180 }).hardTimeoutMs, 30 * 60 * 1000);

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
  resumeEvaluations: firstStage.evaluations
});
assert.equal(resumedWorkload.containerCount, 1, "resume workload should count only pending containers");
assert.equal(resumedWorkload.completedContainerCount, 1);

console.log("Packing large-workload timeout, grouping, and resume regression passed.");
