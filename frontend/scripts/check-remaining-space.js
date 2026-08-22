import assert from "node:assert/strict";
import {
  analyzeRemainingSpace,
  computeRemainingSpaces,
  validateRemainingSpacePartition
} from "../src/utils/remainingSpace.js";

const container = (lengthCm = 10, widthCm = 10, heightCm = 10) => ({ lengthCm, widthCm, heightCm });
const placement = (xCm, yCm, zCm, lengthCm, widthCm, heightCm, extra = {}) => ({
  xCm,
  yCm,
  zCm,
  lengthCm,
  widthCm,
  heightCm,
  ...extra
});

function almostEqual(actual, expected, tolerance = 1e-7, message = "values differ") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function assertValid(box, placements, result, label) {
  const validation = validateRemainingSpacePartition(box, placements, result);
  assert.equal(validation.valid, true, `${label}: ${validation.errors.join("; ")}`);
  almostEqual(
    result.containerVolumeCm3,
    result.occupiedUnionVolumeCm3 + result.freeVolumeCm3,
    result.conservationToleranceCm3,
    `${label} volume conservation`
  );
}

{
  const box = container(10, 8, 6);
  const result = computeRemainingSpaces(box, []);
  assert.equal(result.blocks.length, 1);
  assert.deepEqual(
    pickGeometry(result.blocks[0]),
    { xCm: 0, yCm: 0, zCm: 0, lengthCm: 10, widthCm: 8, heightCm: 6 }
  );
  assert.equal(result.freeVolumeCm3, 480);
  assert.equal(result.occupiedUnionVolumeCm3, 0);
  assertValid(box, [], result, "empty container");
}

{
  const box = container();
  const placements = [placement(0, 0, 0, 10, 10, 10)];
  const result = computeRemainingSpaces(box, placements);
  assert.equal(result.blocks.length, 0);
  assert.equal(result.freeVolumeCm3, 0);
  assert.equal(result.occupiedUnionVolumeCm3, 1000);
  assertValid(box, placements, result, "full container");
}

{
  const box = container();
  const placements = [placement(4, 4, 4, 2, 2, 2)];
  const result = computeRemainingSpaces(box, placements, { topBlockLimit: 2 });
  assert.equal(result.freeVolumeCm3, 992);
  assert.equal(result.fragmentCount, 6);
  assert.equal(result.topBlocks.length, 2);
  assert.equal(result.fragmentedBlockCount, 4);
  almostEqual(
    result.topBlocksVolumeCm3 + result.fragmentedVolumeCm3,
    result.freeVolumeCm3,
    1e-7,
    "top and fragmented volume"
  );
  assertValid(box, placements, result, "center obstacle");

  const publicResult = analyzeRemainingSpace(box, placements, { maxDisplayBlocks: 2 });
  assert.deepEqual(publicResult.displayBlocks, publicResult.blocks.slice(0, 2));
  assert.equal(publicResult.usableFreeVolumeM3, publicResult.freeVolumeM3);
  assert.equal(publicResult.volumeConservationErrorM3, publicResult.conservationErrorCm3 / 1_000_000);
}

{
  const box = container();
  const combined = computeRemainingSpaces(box, [placement(4, 4, 4, 2, 2, 2)]);
  const split = computeRemainingSpaces(box, [
    placement(4, 4, 4, 2, 1, 2),
    placement(4, 5, 4, 2, 1, 2)
  ]);
  assert.deepEqual(
    split.blocks,
    combined.blocks,
    "adjacent occupied pieces must not leave artificial splits in the free-space partition"
  );
}

{
  const box = container();
  const placements = [placement(0, 0, 5, 10, 10, 2)];
  const result = computeRemainingSpaces(box, placements);
  assert.equal(result.freeVolumeCm3, 800);
  assert.ok(
    result.blocks.some((block) => block.xCm === 0 && block.yCm === 0 && block.zCm === 0
      && block.lengthCm === 10 && block.widthCm === 10 && block.heightCm === 5),
    "the void below a bridge/overhang must remain visible"
  );
  assertValid(box, placements, result, "bridge cavity");
}

{
  const box = container();
  const placements = [placement(0, 0, 0, 8, 8, 10, {
    occupiedLengthCm: 10,
    occupiedWidthCm: 10,
    occupiedHeightCm: 10,
    physicalLengthCm: 8,
    physicalWidthCm: 8,
    physicalHeightCm: 10
  })];
  const result = computeRemainingSpaces(box, placements);
  assert.equal(result.freeVolumeCm3, 0, "clearance in the occupied envelope must not be reusable");
  assert.equal(result.geometryMode, "occupied-envelope");
  assert.equal(result.theoryFreeVolumeCm3, 360);
  assert.equal(result.reservedEnvelopeVolumeCm3, 360);
  assert.equal(result.occupiedEnvelopeVolumeCm3, 1000);
  assertValid(box, placements, result, "occupied envelope");
}

{
  const box = container();
  const placements = [
    placement(0, 0, 0, 6, 10, 10),
    placement(4, 0, 0, 6, 10, 10)
  ];
  const result = computeRemainingSpaces(box, placements);
  assert.equal(result.freeVolumeCm3, 0);
  assert.equal(result.occupiedUnionVolumeCm3, 1000, "overlapping obstacles must be counted as a union");
  assertValid(box, placements, result, "overlapping occupied envelopes");
}

{
  const box = container();
  const placements = [placement(-5, 0, 0, 10, 10, 10)];
  const result = computeRemainingSpaces(box, placements);
  assert.equal(result.clippedPlacementCount, 1);
  assert.equal(result.freeVolumeCm3, 500);
  assert.deepEqual(
    pickGeometry(result.blocks[0]),
    { xCm: 5, yCm: 0, zCm: 0, lengthCm: 5, widthCm: 10, heightCm: 10 }
  );
  assertValid(box, placements, result, "clipped envelope");
}

{
  const box = {
    id: "20FR",
    name: "20FR Flat Rack",
    lengthCm: 10,
    widthCm: 10,
    heightCm: 2,
    heightLimitCm: 12,
    ignoreHeightLimit: true
  };
  const result = computeRemainingSpaces(box, []);
  assert.equal(result.container.heightCm, 12, "flat racks must use the configured loading-height boundary");
  assert.equal(result.freeVolumeCm3, 1200);
}

{
  const box = container(12.03, 8.17, 6.29);
  const placements = [placement(1.11, 2.22, 0.37, 3.33, 2.41, 4.18)];
  const result = computeRemainingSpaces(box, placements);
  assertValid(box, placements, result, "decimal coordinates");
  assert.ok(Math.abs(result.volumeConservationErrorM3) < 1e-9);
}

{
  const box = container();
  const placements = [
    placement(1, 1, 0, 3, 4, 5),
    placement(6, 2, 2, 2, 5, 4),
    placement(3, 7, 1, 4, 2, 7)
  ];
  const forward = computeRemainingSpaces(box, placements);
  const reverse = computeRemainingSpaces(box, [...placements].reverse());
  assert.deepEqual(forward.blocks, reverse.blocks, "partition and IDs must be deterministic");
  assertValid(box, placements, forward, "deterministic ordering");
}

for (let seed = 1; seed <= 50; seed += 1) {
  const random = seededRandom(seed);
  const box = container(6, 5, 4);
  const placements = Array.from({ length: 12 }, () => {
    const xCm = randomInt(random, 0, 5);
    const yCm = randomInt(random, 0, 4);
    const zCm = randomInt(random, 0, 3);
    return placement(
      xCm,
      yCm,
      zCm,
      randomInt(random, 1, 6 - xCm),
      randomInt(random, 1, 5 - yCm),
      randomInt(random, 1, 4 - zCm)
    );
  });
  const result = computeRemainingSpaces(box, placements, { topBlockLimit: 3 });
  const oracleFreeVolumeCm3 = integerVoxelFreeVolume(box, placements);
  assert.equal(result.freeVolumeCm3, oracleFreeVolumeCm3, `voxel oracle seed ${seed}`);
  almostEqual(
    result.topBlocksVolumeCm3 + result.fragmentedVolumeCm3,
    result.freeVolumeCm3,
    1e-7,
    `fragment summary seed ${seed}`
  );
  assertValid(box, placements, result, `random seed ${seed}`);
}

console.log("remaining-space regression checks passed (61 deterministic cases)");

function pickGeometry(block) {
  return {
    xCm: block.xCm,
    yCm: block.yCm,
    zCm: block.zCm,
    lengthCm: block.lengthCm,
    widthCm: block.widthCm,
    heightCm: block.heightCm
  };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function integerVoxelFreeVolume(box, placements) {
  let free = 0;
  for (let z = 0; z < box.heightCm; z += 1) {
    for (let y = 0; y < box.widthCm; y += 1) {
      for (let x = 0; x < box.lengthCm; x += 1) {
        const occupied = placements.some((item) => x >= item.xCm && x < item.xCm + item.lengthCm
          && y >= item.yCm && y < item.yCm + item.widthCm
          && z >= item.zCm && z < item.zCm + item.heightCm);
        if (!occupied) free += 1;
      }
    }
  }
  return free;
}
