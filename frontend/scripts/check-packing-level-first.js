import assert from "node:assert/strict";
import { calculate } from "../src/workers/packingWorker.js";

const EPSILON = 1e-6;

function makeContainer(id, lengthCm, widthCm, heightCm) {
  return {
    id,
    name: id,
    lengthCm,
    widthCm,
    heightCm,
    heightLimitCm: heightCm,
    payloadKg: 10000,
    usagePriority: "common",
    visualKind: "standard"
  };
}

function calculateOne({ container, cargos, supportRatioPercent = 80, nonStackSupportRatioPercent = 98.5 }) {
  return calculate({
    cargos,
    containers: [container],
    utilizationPercent: 100,
    globalGapCm: 0,
    supportRatioPercent,
    nonStackSupportRatioPercent
  }).evaluations[0];
}

function placementsOf(evaluation) {
  return (evaluation.packedBoxes || []).flatMap((box) => box.placed || []);
}

function assertCargoQuantitiesAndUniqueUnitKeys(evaluation, expectedByName) {
  const placements = placementsOf(evaluation);
  const actualByName = placements.reduce((counts, placement) => {
    counts[placement.name] = (counts[placement.name] || 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(actualByName, expectedByName, "each source cargo row must retain its own quantity");
  assert.equal(
    new Set(placements.map((placement) => placement.unitKey)).size,
    placements.length,
    "every expanded physical item must have a unique unitKey"
  );
}

function physicalRect(placement) {
  return {
    x: Number(placement.physicalXCm ?? placement.xCm ?? 0),
    y: Number(placement.physicalYCm ?? placement.yCm ?? 0),
    z: Number(placement.physicalZCm ?? placement.zCm ?? 0),
    length: Number(placement.physicalLengthCm ?? placement.lengthCm ?? 0),
    width: Number(placement.physicalWidthCm ?? placement.widthCm ?? 0),
    height: Number(placement.physicalHeightCm ?? placement.heightCm ?? 0)
  };
}

function overlapsOnDeck(a, b) {
  return Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > EPSILON
    && Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > EPSILON;
}

function assertNothingLoadedAboveNonStack(evaluation) {
  for (const box of evaluation.packedBoxes || []) {
    const placements = box.placed || [];
    for (const nonStack of placements.filter((placement) => placement.nonStack)) {
      const nonStackRect = physicalRect(nonStack);
      const nonStackTop = nonStackRect.z + nonStackRect.height;
      for (const other of placements) {
        if (other.unitKey === nonStack.unitKey) continue;
        const otherRect = physicalRect(other);
        if (otherRect.z < nonStackTop - EPSILON) continue;
        assert.equal(
          overlapsOnDeck(nonStackRect, otherRect),
          false,
          `non-stack item ${nonStack.unitKey} must not carry ${other.unitKey}`
        );
      }
    }
  }
}

const fixedBandEvaluation = calculateOne({
  container: makeContainer("fixed-80cm-band", 300, 100, 165),
  cargos: [
    { id: "seed-80", name: "seed-80", lengthCm: 120, widthCm: 100, heightCm: 80, quantity: 1, weightKg: 50, type: "upright" },
    { id: "short-40", name: "short-40", lengthCm: 100, widthCm: 100, heightCm: 40, quantity: 2, weightKg: 20, type: "upright" },
    { id: "tall-85", name: "tall-85", lengthCm: 80, widthCm: 100, heightCm: 85, quantity: 1, weightKg: 30, type: "upright" }
  ]
});

assert.equal(fixedBandEvaluation.fitStatus, "fit");
assert.equal(fixedBandEvaluation.boxes, 1);
const fixedBandBox = fixedBandEvaluation.packedBoxes[0];
const shortPlacements = fixedBandBox.placed
  .filter((placement) => placement.cargoId === "short-40")
  .sort((a, b) => a.zCm - b.zCm);
assert.equal(shortPlacements.length, 2);
assert.ok(Math.abs(shortPlacements[0].zCm) <= EPSILON, "first 40cm unit should extend the layer floor");
assert.ok(Math.abs(shortPlacements[1].zCm - 40) <= EPSILON, "second 40cm unit should top up the fixed 80cm band");
const tallPlacement = fixedBandBox.placed.find((placement) => placement.cargoId === "tall-85");
assert.ok(tallPlacement.zCm >= 80 - EPSILON, "85cm unit must wait until the 80cm band is closed");
assert.ok(fixedBandBox.strategySummary.fixedLayerBandCount >= 2);
assert.ok(fixedBandBox.strategySummary.sameLayerTopUpPlacedCount >= 1);
assert.equal(fixedBandBox.strategySummary.maxFixedBandOverflowCm, 0);

const lowerDeckRevisitEvaluation = calculateOne({
  container: makeContainer("lower-deck-revisit", 240, 70, 70),
  cargos: [
    { id: "revisit-short", name: "revisit-short", lengthCm: 140, widthCm: 70, heightCm: 25, quantity: 1, weightKg: 10, type: "upright" },
    { id: "revisit-tall", name: "revisit-tall", lengthCm: 95, widthCm: 40, heightCm: 35, quantity: 2, weightKg: 10, type: "upright" }
  ]
});

assert.equal(lowerDeckRevisitEvaluation.fitStatus, "fit");
assert.equal(lowerDeckRevisitEvaluation.boxes, 1, "a lower free deck must be revisited before opening another box");
assert.equal(lowerDeckRevisitEvaluation.packedBoxes.length, 1);
const lowerDeckRevisitBox = lowerDeckRevisitEvaluation.packedBoxes[0];
assert.equal(lowerDeckRevisitBox.placed.length, 3);
assert.equal(lowerDeckRevisitBox.unplacedUnitKeys.length, 0);
const revisitTallPlacements = lowerDeckRevisitBox.placed.filter((placement) => placement.cargoId === "revisit-tall");
assert.equal(revisitTallPlacements.length, 2);
assert.ok(revisitTallPlacements.some((placement) => Math.abs(placement.zCm) <= EPSILON));
assert.ok(revisitTallPlacements.some((placement) => placement.zCm > EPSILON));
assert.ok(lowerDeckRevisitBox.strategySummary.maxTopCm <= 70 + EPSILON);
assert.equal(lowerDeckRevisitBox.strategySummary.lowerDeckRevisitCount, 1);
assert.ok(lowerDeckRevisitBox.strategySummary.verticalLayerContinuationCount >= 1);

const nonStackLastEvaluation = calculateOne({
  container: makeContainer("nonstack-last-across-boxes", 200, 100, 120),
  cargos: [
    { id: "foundation", name: "foundation", lengthCm: 100, widthCm: 100, heightCm: 60, quantity: 6, weightKg: 30, type: "upright" },
    { id: "nonstack-top", name: "nonstack-top", lengthCm: 100, widthCm: 100, heightCm: 60, quantity: 2, weightKg: 20, type: "nonstack" }
  ]
});

assert.equal(nonStackLastEvaluation.fitStatus, "fit");
assert.equal(nonStackLastEvaluation.boxes, 2);
const firstStackableBox = nonStackLastEvaluation.packedBoxes[0];
const finalStackableBox = nonStackLastEvaluation.packedBoxes[1];
assert.equal(firstStackableBox.placed.filter((placement) => placement.nonStack).length, 0, "non-stack cargo must wait while stackable cargo remains");
assert.equal(firstStackableBox.strategySummary.nonStackDeferredToLaterBoxCount, 2);
assert.equal(finalStackableBox.placed.filter((placement) => placement.cargoId === "nonstack-top").length, 2);
assert.ok(
  finalStackableBox.placed
    .filter((placement) => placement.cargoId === "nonstack-top")
    .every((placement) => placement.zCm >= 60 - EPSILON),
  "non-stack cargo should be loaded on the completed support layer in the final stackable box"
);
assertNothingLoadedAboveNonStack(nonStackLastEvaluation);

const nonStackCapacityFallback = calculateOne({
  container: makeContainer("nonstack-capacity-fallback", 200, 100, 120),
  cargos: [
    { id: "capacity-base", name: "capacity-base", lengthCm: 100, widthCm: 100, heightCm: 60, quantity: 5, weightKg: 30, type: "upright" },
    { id: "capacity-fragile", name: "capacity-fragile", lengthCm: 100, widthCm: 100, heightCm: 60, quantity: 3, weightKg: 20, type: "nonstack" }
  ]
});

assert.equal(nonStackCapacityFallback.fitStatus, "fit");
assert.equal(nonStackCapacityFallback.boxes, 2, "deferring fragile cargo must not add a third box");
const capacityNonStackCounts = nonStackCapacityFallback.packedBoxes.map((box) =>
  box.placed.filter((placement) => placement.nonStack).length
);
assert.equal(capacityNonStackCounts.reduce((sum, count) => sum + count, 0), 3);
assert.ok(capacityNonStackCounts[0] > 0, "the earlier box must accept fragile cargo when the final box cannot hold all of it");
assert.ok(capacityNonStackCounts[0] <= capacityNonStackCounts[1], "boxes should be ordered from fewer to more non-stack placements");
assert.equal(nonStackCapacityFallback.packedBoxes[0].strategySummary.nonStackFallbackRequired, 1);
assertNothingLoadedAboveNonStack(nonStackCapacityFallback);

const estimatedTailEvaluation = calculateOne({
  container: makeContainer("estimated-tail-preservation", 100, 100, 100),
  cargos: [
    { id: "estimated-unit", name: "estimated-unit", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 30, weightKg: 1, type: "upright" }
  ]
});
assert.equal(estimatedTailEvaluation.fitStatus, "estimated");
assert.equal(estimatedTailEvaluation.detailedBoxes, 24);
assert.equal(estimatedTailEvaluation.packedBoxes[0].unplacedUnitKeys.length, 29);
assert.equal(estimatedTailEvaluation.packedBoxes[23].unplacedUnitKeys.length, 6, "estimated tail cargo must survive plan-order normalization");

const supportContainer = makeContainer("nonstack-support-ratio", 100, 100, 140);
const supportCargos = [
  { id: "support-90", name: "support-90", lengthCm: 90, widthCm: 100, heightCm: 40, quantity: 1, weightKg: 30, type: "upright" },
  { id: "nonstack-100", name: "nonstack-100", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 1, weightKg: 20, type: "nonstack" }
];
const support80 = calculateOne({
  container: supportContainer,
  cargos: supportCargos,
  nonStackSupportRatioPercent: 80
});
const support985 = calculateOne({
  container: supportContainer,
  cargos: supportCargos,
  nonStackSupportRatioPercent: 98.5
});
assert.equal(support80.boxes, 1, "90% physical support should pass an 80% non-stack requirement");
assert.equal(support985.boxes, 2, "90% physical support must fail a 98.5% non-stack requirement");
assert.equal(support80.trace.nonStackSupportRatioPercent, 80);
assert.equal(support985.trace.nonStackSupportRatioPercent, 98.5);
assertNothingLoadedAboveNonStack(support80);
assertNothingLoadedAboveNonStack(support985);

const slenderFlatEvaluation = calculateOne({
  container: makeContainer("slender-flat-in-80cm-band", 200, 100, 80),
  cargos: [
    { id: "slender-seed", name: "slender-seed", lengthCm: 120, widthCm: 100, heightCm: 80, quantity: 1, weightKg: 50, type: "upright" },
    { id: "slender-80x20x20", name: "slender-80x20x20", lengthCm: 80, widthCm: 20, heightCm: 20, quantity: 1, weightKg: 10, type: "normal" }
  ]
});
const slenderPlacement = placementsOf(slenderFlatEvaluation)
  .find((placement) => placement.cargoId === "slender-80x20x20");
assert.ok(slenderPlacement, "slender cargo must be placed in the seed layer");
assert.equal(slenderPlacement.heightCm, 20, "80x20x20 cargo should lie flat instead of becoming an 80cm pillar");
assert.equal(slenderPlacement.zAxis, "高", "the original 20cm height axis should remain vertical");
assert.ok(Math.abs(slenderPlacement.zCm) <= EPSILON, "slender cargo should extend the current layer floor");

const controlledLocalSearchEvaluation = calculateOne({
  container: makeContainer("controlled-local-search", 180, 120, 130),
  cargos: [
    { id: "local-c0", name: "local-c0", lengthCm: 39, widthCm: 41, heightCm: 47, quantity: 7, weightKg: 1, type: "normal" },
    { id: "local-c1", name: "local-c1", lengthCm: 28, widthCm: 41, heightCm: 62, quantity: 6, weightKg: 1, type: "normal" },
    { id: "local-c2", name: "local-c2", lengthCm: 25, widthCm: 53, heightCm: 33, quantity: 6, weightKg: 1, type: "normal" },
    { id: "local-c3", name: "local-c3", lengthCm: 60, widthCm: 62, heightCm: 32, quantity: 8, weightKg: 1, type: "normal" }
  ]
});
assert.ok(
  controlledLocalSearchEvaluation.packedBoxes[0].strategySummary.topHeightPlaneCount <= 6,
  "controlled lower-deck recovery may add one plane, but must not restore the fragmented twelve-plane layout"
);
assert.ok(controlledLocalSearchEvaluation.packedBoxes[0].strategySummary.lowerDeckRevisitCount <= 1);
assert.equal(controlledLocalSearchEvaluation.packedBoxes[0].strategySummary.maxFixedBandOverflowCm, 0);

const duplicateIdContainer = makeContainer("duplicate-cargo-id", 1000, 500, 200);
const duplicateOrdinaryEvaluation = calculateOne({
  container: duplicateIdContainer,
  cargos: [
    { id: "same", name: "duplicate-A", lengthCm: 80, widthCm: 80, heightCm: 40, quantity: 2, weightKg: 5, type: "normal" },
    { id: "same", name: "duplicate-B", lengthCm: 60, widthCm: 60, heightCm: 30, quantity: 2, weightKg: 5, type: "normal" }
  ]
});
assertCargoQuantitiesAndUniqueUnitKeys(duplicateOrdinaryEvaluation, {
  "duplicate-A": 2,
  "duplicate-B": 2
});
assert.deepEqual(
  [...new Set(placementsOf(duplicateOrdinaryEvaluation).map((placement) => placement.cargoIndex))].sort(),
  [0, 1],
  "duplicate business IDs must retain their source cargo row for reports"
);

const duplicateNamespaceCollisionEvaluation = calculateOne({
  container: duplicateIdContainer,
  cargos: [
    { id: "same", name: "namespace-A", lengthCm: 80, widthCm: 80, heightCm: 40, quantity: 2, weightKg: 5, type: "normal" },
    { id: "same", name: "namespace-B", lengthCm: 60, widthCm: 60, heightCm: 30, quantity: 2, weightKg: 5, type: "normal" },
    { id: "same~row0", name: "namespace-C", lengthCm: 50, widthCm: 50, heightCm: 20, quantity: 2, weightKg: 5, type: "normal" }
  ]
});
assertCargoQuantitiesAndUniqueUnitKeys(duplicateNamespaceCollisionEvaluation, {
  "namespace-A": 2,
  "namespace-B": 2,
  "namespace-C": 2
});

const duplicateGroupedEvaluation = calculateOne({
  container: duplicateIdContainer,
  cargos: [
    { id: "same", name: "grouped-duplicate-A", lengthCm: 40, widthCm: 40, heightCm: 40, quantity: 40, weightKg: 5, type: "normal" },
    { id: "same", name: "grouped-duplicate-B", lengthCm: 30, widthCm: 30, heightCm: 30, quantity: 40, weightKg: 5, type: "normal" }
  ]
});
assert.equal(duplicateGroupedEvaluation.totalUnits, 80);
assert.ok(duplicateGroupedEvaluation.solverUnits < 80, "80 physical items should enter grouped search");
assertCargoQuantitiesAndUniqueUnitKeys(duplicateGroupedEvaluation, {
  "grouped-duplicate-A": 40,
  "grouped-duplicate-B": 40
});

const colorContainer = makeContainer("color-independent", 180, 100, 100);
const colorBase = [
  { id: "color-a", name: "cargo-a", lengthCm: 90, widthCm: 50, heightCm: 30, quantity: 2, weightKg: 10, type: "normal" },
  { id: "color-b", name: "cargo-b", lengthCm: 50, widthCm: 50, heightCm: 90, quantity: 4, weightKg: 10, type: "normal" }
];
const colorRunA = calculateOne({
  container: colorContainer,
  cargos: [
    { ...colorBase[0], color: "#3b82f6" },
    { ...colorBase[1], color: "#e11d48" }
  ]
});
const colorRunB = calculateOne({
  container: colorContainer,
  cargos: [
    { ...colorBase[0], color: "#e11d48" },
    { ...colorBase[1], color: "#3b82f6" }
  ]
});

function layoutSignature(evaluation) {
  return {
    boxes: evaluation.boxes,
    strategies: evaluation.packedBoxes.map((box) => box.strategyId),
    placements: evaluation.packedBoxes.flatMap((box, boxIndex) => box.placed.map((placement) => ({
      boxIndex,
      cargoId: placement.cargoId,
      xCm: placement.xCm,
      yCm: placement.yCm,
      zCm: placement.zCm,
      lengthCm: placement.lengthCm,
      widthCm: placement.widthCm,
      heightCm: placement.heightCm,
      xAxis: placement.xAxis,
      yAxis: placement.yAxis,
      zAxis: placement.zAxis
    }))).sort((a, b) =>
      a.boxIndex - b.boxIndex
      || a.cargoId.localeCompare(b.cargoId)
      || a.zCm - b.zCm
      || a.yCm - b.yCm
      || a.xCm - b.xCm
    )
  };
}

assert.deepEqual(layoutSignature(colorRunA), layoutSignature(colorRunB), "display colors must not influence packing");

const minimumBoxPriorityResult = calculate({
  cargos: [
    { id: "box-priority-cargo", name: "box-priority-cargo", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 2, weightKg: 10, type: "normal" }
  ],
  containers: [
    {
      ...makeContainer("cheap-two-boxes", 100, 100, 100),
      referencePrice: 1,
      referenceCurrency: "USD",
      equipmentClass: "GP"
    },
    {
      ...makeContainer("expensive-one-box", 200, 100, 100),
      referencePrice: 1000,
      referenceCurrency: "USD",
      equipmentClass: "GP"
    }
  ],
  utilizationPercent: 100,
  globalGapCm: 0,
  supportRatioPercent: 80,
  nonStackSupportRatioPercent: 90
});
const oneBoxIndex = minimumBoxPriorityResult.evaluations.findIndex((evaluation) => evaluation.container.id === "expensive-one-box");
const twoBoxIndex = minimumBoxPriorityResult.evaluations.findIndex((evaluation) => evaluation.container.id === "cheap-two-boxes");
assert.ok(oneBoxIndex >= 0 && twoBoxIndex >= 0);
assert.equal(minimumBoxPriorityResult.evaluations[oneBoxIndex].boxes, 1);
assert.equal(minimumBoxPriorityResult.evaluations[twoBoxIndex].boxes, 2);
assert.ok(oneBoxIndex < twoBoxIndex, "fewer feasible boxes must rank ahead of a cheaper multi-box plan");
assert.equal(minimumBoxPriorityResult.bestContainerId, "expensive-one-box");

const equalBoxPriceResult = calculate({
  cargos: [
    { id: "equal-box-price-cargo", name: "equal-box-price-cargo", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 1, weightKg: 10, type: "normal" }
  ],
  containers: [
    { ...makeContainer("higher-price-one-box", 100, 100, 100), referencePrice: 20, referenceCurrency: "USD", equipmentClass: "GP" },
    { ...makeContainer("lower-price-one-box", 100, 100, 100), referencePrice: 10, referenceCurrency: "USD", equipmentClass: "GP" }
  ],
  utilizationPercent: 100,
  globalGapCm: 0
});
assert.equal(equalBoxPriceResult.bestContainerId, "lower-price-one-box", "price must break ties between equal-count feasible plans");

const mixedMinimumBoxPriorityResult = calculate({
  cargos: [
    { id: "mixed-small", name: "mixed-small", lengthCm: 100, widthCm: 100, heightCm: 100, quantity: 1, weightKg: 10, type: "normal" },
    { id: "mixed-long", name: "mixed-long", lengthCm: 200, widthCm: 100, heightCm: 100, quantity: 1, weightKg: 10, type: "normal" }
  ],
  containers: [
    { ...makeContainer("cheap-small", 100, 100, 100), referencePrice: 1, referenceCurrency: "USD", equipmentClass: "GP" },
    { ...makeContainer("expensive-large", 300, 100, 100), referencePrice: 1000, referenceCurrency: "USD", equipmentClass: "GP" }
  ],
  utilizationPercent: 100,
  globalGapCm: 0
});
assert.equal(mixedMinimumBoxPriorityResult.bestContainerId, "expensive-large");
assert.equal(mixedMinimumBoxPriorityResult.evaluations.find((evaluation) => evaluation.container.id === "expensive-large")?.boxes, 1);
assert.ok(
  !mixedMinimumBoxPriorityResult.evaluations.some((evaluation) => evaluation.container.id === "mixed-plan" && evaluation.boxes > 1),
  "mixed search must not prefer a cheap first box when it increases the projected container count"
);

console.log("Packing fixed-layer, minimum-box priority, cross-box non-stack-last, support-ratio, non-stack safety, duplicate-id, and color-independence regression passed.");
