import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../src/workers/packingWorker.js";
import { packingResumeFingerprint } from "../src/utils/packingResumeFingerprint.js";

function container(length) {
  return {
    id: "bin-" + length,
    name: "bin-" + length,
    lengthCm: length,
    widthCm: 10,
    heightCm: 10,
    payloadKg: 100,
    usagePriority: "common",
    equipmentClass: "GP"
  };
}

function cargo(length, quantity = 1) {
  return {
    id: "cargo-" + length,
    name: "Cargo " + length,
    type: "normal",
    lengthCm: length,
    widthCm: 10,
    heightCm: 10,
    weightKg: 5,
    quantity
  };
}

test("overall and peak volume goals choose different complete loads from the same manifest", () => {
  const request = {
    cargos: [cargo(10, 4)],
    containers: [container(30), container(41)],
    globalGapCm: 0,
    utilizationPercent: 90
  };
  const overall = calculate({ ...request, optimizationGoal: "overall" });
  const partials = [];
  const peak = calculate(
    { ...request, optimizationGoal: "peak", resumeEvaluations: overall.evaluations },
    { onStageResult: (stage) => partials.push(stage) }
  );
  assert.equal(overall.bestContainerId, "bin-41");
  assert.equal(peak.bestContainerId, "bin-30");
  assert.deepEqual(
    partials.map((stage) => stage.optimizationGoal),
    ["peak", "peak"]
  );
  const whole = overall.evaluations[0];
  const fullest = peak.evaluations[0];
  assert.equal(whole.boxes, 1);
  assert.ok(Math.abs(whole.volumeUtilization.overallPercent - (40 / 41) * 100) < 1e-8);
  assert.equal(fullest.boxes, 2);
  assert.equal(fullest.volumeUtilization.peakPercent, 100);
  assert.ok(Math.abs(fullest.volumeUtilization.overallPercent - (40 / 60) * 100) < 1e-8);
  for (const plan of [whole, fullest]) {
    const placed = plan.packedBoxes.flatMap((box) => box.placed);
    assert.equal(placed.length, 4);
    assert.equal(new Set(placed.map((unit) => unit.unitKey)).size, 4);
    for (const box of plan.packedBoxes) {
      assert.ok(
        box.placed.reduce((total, unit) => total + unit.weightKg, 0) <= plan.container.payloadKg
      );
    }
  }
  assert.notEqual(
    packingResumeFingerprint(request.containers[0], { ...request, optimizationGoal: "peak" }),
    packingResumeFingerprint(request.containers[0], { ...request, optimizationGoal: "overall" })
  );
});

test("mixed types are compared by physical box volume even without comparable freight prices", () => {
  const result = calculate({
    containers: [container(10), container(25)],
    cargos: [cargo(10), cargo(24)],
    optimizationGoal: "overall",
    globalGapCm: 0,
    utilizationPercent: 85
  });
  assert.equal(result.bestContainerId, "mixed-plan");
  const best = result.evaluations[0];
  assert.equal(best.packedBoxes.length, 2);
  assert.ok(Math.abs(best.volumeUtilization.overallPercent - (100 * (10 + 24)) / (10 + 25)) < 1e-8);
  assert.equal(best.volumeUtilization.peakPercent, 100);
  assert.equal(best.packedBoxes[best.volumeUtilization.peakBoxIndex - 1].container.id, "bin-10");
  const incomplete = result.evaluations.find((plan) => plan.container.id === "bin-10");
  assert.notEqual(incomplete.fitStatus, "fit");
  assert.equal(incomplete.volumeUtilization, null);
});

test("a smaller box may never win by ignoring its weight limit or an oversized item", () => {
  for (const optimizationGoal of ["overall", "peak"]) {
    const result = calculate({
      cargos: [cargo(10), cargo(12)],
      containers: [{ ...container(12), payloadKg: 4 }, container(25)],
      globalGapCm: 0,
      optimizationGoal
    });
    assert.equal(result.bestContainerId, "bin-25");
    assert.equal(result.evaluations[0].packedBoxes[0].placed.length, 2);
    assert.equal(
      result.evaluations.find((plan) => plan.container.id === "bin-12").volumeUtilization,
      null
    );
  }
});

test("flat racks use the configured loading height and never add area to closed-container volume", () => {
  const rack = {
    ...container(10),
    equipmentClass: "FR",
    heightCm: 200,
    heightLimitCm: 10,
    usagePriority: "special"
  };
  const request = {
    containers: [container(25), rack],
    cargos: [cargo(24), cargo(10)],
    globalGapCm: 0,
    utilizationPercent: 90,
    optimizationGoal: "overall"
  };
  const best = calculate(request).evaluations[0];
  assert.equal(best.container.id, "mixed-plan");
  assert.equal(best.usageMode, "mixed");
  assert.equal(best.averageFillPercent, 97.14);
  assert.ok(Math.abs(best.volumeUtilization.overallPercent - (3400 / 3500) * 100) < 1e-8);
  assert.equal(best.volumeUtilization.peakPercent, 100);

  const missingHeight = calculate({
    ...request,
    containers: [{ ...rack, heightCm: 0, heightLimitCm: 0 }],
    cargos: [{ ...cargo(10), heightCm: 0.5 }]
  });
  assert.equal(missingHeight.bestContainerId, null);
  assert.equal(missingHeight.evaluations[0].volumeUtilization, null);
  assert.equal(missingHeight.evaluations[0].missingBoxDimensions, true);
});

test("custom equipment never rounds a positive sub-centimeter height up for feasibility", () => {
  const result = calculate({
    containers: [{ ...container(10), heightCm: 0.5 }],
    cargos: [{ ...cargo(10), heightCm: 0.8 }],
    globalGapCm: 0,
    optimizationGoal: "overall"
  });
  assert.equal(result.bestContainerId, null);
  assert.equal(result.evaluations[0].volumeUtilization, null);
});
