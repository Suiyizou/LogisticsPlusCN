import assert from "node:assert/strict";
import { calculate } from "../src/workers/packingWorker.js";

const EPSILON = 1e-6;

const container = {
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

const palletPackageInfo = {
  handlingUnitType: "pallet",
  packageUnit: "pallet"
};

const cargos = [
  {
    id: "large-orange-pallet",
    name: "Large orange pallet",
    lengthCm: 161,
    widthCm: 116,
    heightCm: 171,
    quantity: 4,
    weightKg: 627.6,
    type: "pallet",
    packageInfo: palletPackageInfo,
    color: "#f97316"
  },
  {
    id: "6012",
    name: "6012",
    lengthCm: 130,
    widthCm: 120,
    heightCm: 210,
    quantity: 9,
    weightKg: 327.5,
    type: "pallet",
    packageInfo: palletPackageInfo,
    color: "#2a9d8f"
  },
  {
    id: "round-lamp-a",
    name: "Round lamp A",
    lengthCm: 116,
    widthCm: 116,
    heightCm: 91,
    quantity: 2,
    weightKg: 358.6,
    type: "pallet",
    packageInfo: palletPackageInfo,
    color: "#3b82f6"
  }
];

function calculateFixture(inputCargos) {
  return calculate({
    cargos: inputCargos,
    containers: [container],
    utilizationPercent: 100,
    globalGapCm: 0,
    supportRatioPercent: 80,
    nonStackSupportRatioPercent: 98.5
  }).evaluations[0];
}

function assertSingleLayerRowFill(evaluation, label) {
  assert.equal(evaluation.fitStatus, "fit", label);
  assert.equal(evaluation.boxes, 1, label);
  assert.equal(evaluation.packedBoxes.length, 1, label);

  const packedBox = evaluation.packedBoxes[0];
  assert.equal(packedBox.placed.length, 15, label);
  assert.deepEqual(packedBox.unplacedUnitKeys, [], label);
  assert.equal(packedBox.strategySummary.layerCount, 2, label);
  assert.ok(packedBox.strategySummary.maxTopCm <= 242 + EPSILON, label);

  const green = packedBox.placed.filter((placement) => placement.cargoId === "6012");
  assert.equal(green.length, 9, label);
  assert.ok(green.every((placement) => Math.abs(placement.zCm) <= EPSILON), `${label}: all 6012 pallets should stay in one floor layer`);
  assert.ok(green.every((placement) =>
    Math.abs(placement.lengthCm - 130) <= EPSILON
    && Math.abs(placement.widthCm - 210) <= EPSILON
    && Math.abs(placement.heightCm - 120) <= EPSILON
  ), `${label}: 6012 should use its physical X=130cm, Y=210cm, Z=120cm when cargo gap is zero`);
  assert.ok(green.every((placement) =>
    placement.xAxis === "长"
    && placement.yAxis === "高"
    && placement.zAxis === "宽"
  ), `${label}: 6012 should put its longest edge on container Y and use the remaining edge along X`);

  const greenMinX = Math.min(...green.map((placement) => placement.xCm));
  const greenMaxX = Math.max(...green.map((placement) => placement.xCm + placement.lengthCm));
  const greenMaxY = Math.max(...green.map((placement) => placement.yCm + placement.widthCm));
  assert.ok(Math.abs(greenMinX) <= EPSILON, label);
  assert.ok(greenMaxX <= container.lengthCm + EPSILON, label);
  assert.ok(greenMaxX / container.lengthCm >= 0.97, `${label}: 6012 row should fill at least 97% of container X`);
  assert.ok(greenMaxY / container.widthCm >= 0.89, `${label}: 6012 row should use at least 89% of container Y`);

  const floorCargoIds = [...new Set(
    packedBox.placed
      .filter((placement) => Math.abs(placement.zCm) <= EPSILON)
      .map((placement) => placement.cargoId)
  )];
  assert.deepEqual(floorCargoIds, ["6012"], `${label}: the floor layer should be reserved for the completed 6012 row`);

  const otherPlacements = packedBox.placed.filter((placement) => placement.cargoId !== "6012");
  assert.ok(otherPlacements.every((placement) => placement.zCm >= 120 - EPSILON), `${label}: the remaining cargo should be stacked above the completed 6012 row`);
}

assertSingleLayerRowFill(calculateFixture(cargos), "original cargo order");
assertSingleLayerRowFill(calculateFixture([cargos[2], cargos[1], cargos[0]]), "reversed cargo order");

console.log("Packing single-layer row-fill regression passed.");
