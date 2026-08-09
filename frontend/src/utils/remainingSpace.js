const DEFAULT_EPSILON_CM = 1e-6;
const DEFAULT_TOP_BLOCK_LIMIT = 12;
const DEFAULT_MERGE_EVERY = 12;
const DEFAULT_MAX_FRAGMENTS = 100_000;

/**
 * Partition the geometric space left in a container into non-overlapping,
 * axis-aligned cuboids. Placement clearance is intentionally treated as used
 * space: occupied* dimensions take precedence over the physical dimensions.
 *
 * The returned blocks are an exact disjoint partition, not a list of
 * overlapping "maximal empty boxes". Consequently their volumes can be added.
 */
export function analyzeRemainingSpace(container, placements = [], options = {}) {
  return computeRemainingSpaces(container, placements, {
    ...options,
    topBlockLimit: options.topBlockLimit ?? options.maxDisplayBlocks
  });
}

export function computeRemainingSpaces(container, placements = [], options = {}) {
  const epsilonCm = positiveNumber(options.epsilonCm, DEFAULT_EPSILON_CM);
  const normalizedContainer = normalizeContainer(container, epsilonCm);
  const containerCuboid = {
    x1: 0,
    x2: normalizedContainer.lengthCm,
    y1: 0,
    y2: normalizedContainer.widthCm,
    z1: 0,
    z2: normalizedContainer.heightCm
  };
  const containerVolumeCm3 = cuboidVolume(containerCuboid);
  const normalized = normalizeObstacles(placements, containerCuboid, epsilonCm, "occupied");
  const obstacles = normalized.obstacles.sort(compareObstacleOrder);
  const mergeEvery = Math.max(1, Math.floor(positiveNumber(options.mergeEvery, DEFAULT_MERGE_EVERY)));
  const maxFragments = Math.max(1, Math.floor(positiveNumber(options.maxFragments, DEFAULT_MAX_FRAGMENTS)));

  const partition = partitionContainer(containerCuboid, obstacles, {
    epsilonCm,
    mergeEvery,
    maxFragments
  });
  const freeCuboids = partition.freeCuboids;
  const occupiedUnionVolumeCm3 = partition.occupiedUnionVolumeCm3;
  const intersectionChecks = partition.intersectionChecks;
  const mergePasses = partition.mergePasses;

  const physicalNormalized = normalizeObstacles(placements, containerCuboid, epsilonCm, "physical");
  const physicalPartition = partitionContainer(
    containerCuboid,
    physicalNormalized.obstacles.sort(compareObstacleOrder),
    { epsilonCm, mergeEvery, maxFragments }
  );
  const physicalOccupiedUnionVolumeCm3 = physicalPartition.occupiedUnionVolumeCm3;
  const theoryFreeVolumeCm3 = containerVolumeCm3 - physicalOccupiedUnionVolumeCm3;
  const clearanceReservedVolumeCm3 = Math.max(0, theoryFreeVolumeCm3 - sumCuboidVolumes(freeCuboids));

  const freeVolumeCm3 = sumCuboidVolumes(freeCuboids);
  const conservationErrorCm3 = containerVolumeCm3 - occupiedUnionVolumeCm3 - freeVolumeCm3;
  const conservationToleranceCm3 = positiveNumber(
    options.conservationToleranceCm3,
    Math.max(1e-3, containerVolumeCm3 * 1e-9)
  );
  const conservationOk = Math.abs(conservationErrorCm3) <= conservationToleranceCm3;
  if (!conservationOk && options.strict !== false) {
    throw new Error(
      `Remaining-space volume conservation failed by ${conservationErrorCm3} cm3 `
      + `(tolerance ${conservationToleranceCm3} cm3).`
    );
  }

  const blocks = freeCuboids
    .map((cuboid) => toOutputBlock(cuboid, containerVolumeCm3, freeVolumeCm3))
    .sort(compareOutputBlocks)
    .map((block, index) => ({ ...block, id: `S${String(index + 1).padStart(2, "0")}` }));
  const topBlockLimit = Math.max(0, Math.floor(finiteNumber(
    options.topBlockLimit ?? options.maxDisplayBlocks,
    DEFAULT_TOP_BLOCK_LIMIT
  )));
  const topBlocks = blocks.slice(0, topBlockLimit);
  const fragmentedBlocks = blocks.slice(topBlockLimit);
  const topBlocksVolumeCm3 = sumBlockVolumes(topBlocks);
  const fragmentedVolumeCm3 = sumBlockVolumes(fragmentedBlocks);

  return {
    algorithm: "disjoint-cuboid-subtraction",
    geometryMode: "occupied-envelope",
    container: normalizedContainer,
    blocks,
    topBlocks,
    displayBlocks: topBlocks,
    fragmentCount: blocks.length,
    fragmentedBlockCount: fragmentedBlocks.length,
    containerVolumeCm3,
    containerVolumeM3: containerVolumeCm3 / 1_000_000,
    occupiedUnionVolumeCm3,
    occupiedUnionVolumeM3: occupiedUnionVolumeCm3 / 1_000_000,
    occupiedEnvelopeVolumeCm3: occupiedUnionVolumeCm3,
    occupiedEnvelopeVolumeM3: occupiedUnionVolumeCm3 / 1_000_000,
    physicalOccupiedUnionVolumeCm3,
    physicalOccupiedUnionVolumeM3: physicalOccupiedUnionVolumeCm3 / 1_000_000,
    freeVolumeCm3,
    freeVolumeM3: freeVolumeCm3 / 1_000_000,
    theoryFreeVolumeCm3,
    theoryFreeVolumeM3: theoryFreeVolumeCm3 / 1_000_000,
    usableFreeVolumeCm3: freeVolumeCm3,
    usableFreeVolumeM3: freeVolumeCm3 / 1_000_000,
    // Clearance volume inside occupied envelopes, excluding the physical cargo.
    reservedEnvelopeVolumeCm3: clearanceReservedVolumeCm3,
    reservedEnvelopeVolumeM3: clearanceReservedVolumeCm3 / 1_000_000,
    freeRatio: containerVolumeCm3 > 0 ? freeVolumeCm3 / containerVolumeCm3 : 0,
    topBlocksVolumeCm3,
    topBlocksVolumeM3: topBlocksVolumeCm3 / 1_000_000,
    // Space outside topBlocks. It remains part of freeVolume and is never lost.
    fragmentedVolumeCm3,
    fragmentedVolumeM3: fragmentedVolumeCm3 / 1_000_000,
    conservationErrorCm3,
    volumeConservationErrorM3: conservationErrorCm3 / 1_000_000,
    conservationToleranceCm3,
    conservationOk,
    inputPlacementCount: Array.isArray(placements) ? placements.length : 0,
    usedPlacementCount: obstacles.length,
    ignoredPlacementCount: normalized.ignoredCount,
    clippedPlacementCount: normalized.clippedCount,
    intersectionChecks,
    physicalIntersectionChecks: physicalPartition.intersectionChecks,
    mergePasses
  };
}

/**
 * Expensive diagnostic validation intended for regression tests and debug UI.
 * It verifies bounds, disjointness, obstacle exclusion and volume conservation.
 */
export function validateRemainingSpacePartition(container, placements, result, options = {}) {
  const epsilonCm = positiveNumber(options.epsilonCm, DEFAULT_EPSILON_CM);
  const normalizedContainer = normalizeContainer(container, epsilonCm);
  const containerCuboid = {
    x1: 0,
    x2: normalizedContainer.lengthCm,
    y1: 0,
    y2: normalizedContainer.widthCm,
    z1: 0,
    z2: normalizedContainer.heightCm
  };
  const { obstacles } = normalizeObstacles(placements, containerCuboid, epsilonCm, "occupied");
  const blocks = (result?.blocks || []).map(fromOutputBlock);
  const errors = [];

  blocks.forEach((block, index) => {
    if (!positiveCuboid(block, epsilonCm)) errors.push(`block ${index} has a non-positive dimension`);
    if (!containsCuboid(containerCuboid, block, epsilonCm)) errors.push(`block ${index} is outside the container`);
    obstacles.forEach((obstacle, obstacleIndex) => {
      if (intersectCuboids(block, obstacle, epsilonCm)) {
        errors.push(`block ${index} intersects obstacle ${obstacleIndex}`);
      }
    });
  });

  for (let first = 0; first < blocks.length; first += 1) {
    for (let second = first + 1; second < blocks.length; second += 1) {
      if (intersectCuboids(blocks[first], blocks[second], epsilonCm)) {
        errors.push(`blocks ${first} and ${second} overlap`);
      }
    }
  }

  const freeVolumeCm3 = sumCuboidVolumes(blocks);
  const expectedFreeVolumeCm3 = Number(result?.freeVolumeCm3);
  const toleranceCm3 = positiveNumber(
    options.conservationToleranceCm3,
    Math.max(1e-3, cuboidVolume(containerCuboid) * 1e-9)
  );
  if (!Number.isFinite(expectedFreeVolumeCm3) || Math.abs(freeVolumeCm3 - expectedFreeVolumeCm3) > toleranceCm3) {
    errors.push("block volumes do not equal the reported free volume");
  }
  if (!result?.conservationOk) errors.push("result reports failed volume conservation");

  return { valid: errors.length === 0, errors, freeVolumeCm3, toleranceCm3 };
}

function normalizeContainer(container, epsilonCm) {
  const lengthCm = snapPositiveDimension(container?.lengthCm, epsilonCm, "container.lengthCm");
  const widthCm = snapPositiveDimension(container?.widthCm, epsilonCm, "container.widthCm");
  const heightCm = snapPositiveDimension(resolveContainerHeightCm(container), epsilonCm, "container.heightCm");
  return { ...container, lengthCm, widthCm, heightCm };
}

function resolveContainerHeightCm(container = {}) {
  const heightCm = finiteNumber(container?.heightCm, 0);
  const heightLimitCm = finiteNumber(container?.heightLimitCm ?? container?.oogHeightLimitCm, 0);
  const descriptor = `${container?.id || ""} ${container?.name || ""} ${container?.visualKind || ""} ${container?.equipmentClass || ""}`.toLowerCase();
  const isFlatRack = Boolean(container?.ignoreHeightLimit) || /fr|flat\s*rack|flatrack|flat|\u5e73\u677f/.test(descriptor);
  return isFlatRack && heightLimitCm > 0 ? heightLimitCm : heightCm;
}

function normalizeObstacles(placements, containerCuboid, epsilonCm, geometryMode) {
  const list = Array.isArray(placements) ? placements : [];
  const obstacles = [];
  let ignoredCount = 0;
  let clippedCount = 0;

  list.forEach((placement, index) => {
    const geometry = placementGeometry(placement, geometryMode);
    const { x, y, z, length, width, height } = geometry;
    if (![x, y, z, length, width, height].every(Number.isFinite)
      || length <= epsilonCm || width <= epsilonCm || height <= epsilonCm) {
      ignoredCount += 1;
      return;
    }

    const raw = {
      x1: snap(x, epsilonCm),
      x2: snap(x + length, epsilonCm),
      y1: snap(y, epsilonCm),
      y2: snap(y + width, epsilonCm),
      z1: snap(z, epsilonCm),
      z2: snap(z + height, epsilonCm),
      sourceIndex: index
    };
    const clipped = clipCuboid(raw, containerCuboid, epsilonCm);
    if (!clipped) {
      ignoredCount += 1;
      return;
    }
    if (!sameCuboidBounds(raw, clipped, epsilonCm)) clippedCount += 1;
    obstacles.push(clipped);
  });

  return { obstacles, ignoredCount, clippedCount };
}

function placementGeometry(placement, geometryMode) {
  const occupiedX = finiteNumber(placement?.xCm, NaN);
  const occupiedY = finiteNumber(placement?.yCm, NaN);
  const occupiedZ = finiteNumber(placement?.zCm, NaN);
  const occupiedLength = finiteNumber(placement?.occupiedLengthCm ?? placement?.lengthCm, NaN);
  const occupiedWidth = finiteNumber(placement?.occupiedWidthCm ?? placement?.widthCm, NaN);
  const occupiedHeight = finiteNumber(placement?.occupiedHeightCm ?? placement?.heightCm, NaN);
  if (geometryMode !== "physical") {
    return {
      x: occupiedX,
      y: occupiedY,
      z: occupiedZ,
      length: occupiedLength,
      width: occupiedWidth,
      height: occupiedHeight
    };
  }

  const length = finiteNumber(placement?.physicalLengthCm ?? placement?.xAxisBaseCm ?? occupiedLength, NaN);
  const width = finiteNumber(placement?.physicalWidthCm ?? placement?.yAxisBaseCm ?? occupiedWidth, NaN);
  const height = finiteNumber(placement?.physicalHeightCm ?? placement?.zAxisBaseCm ?? occupiedHeight, NaN);
  return {
    x: finiteNumber(placement?.physicalXCm, occupiedX + Math.max(0, occupiedLength - length) / 2),
    y: finiteNumber(placement?.physicalYCm, occupiedY + Math.max(0, occupiedWidth - width) / 2),
    z: finiteNumber(placement?.physicalZCm, occupiedZ),
    length,
    width,
    height
  };
}

function partitionContainer(containerCuboid, obstacles, { epsilonCm, mergeEvery, maxFragments }) {
  let freeCuboids = [containerCuboid];
  let occupiedUnionVolumeCm3 = 0;
  let intersectionChecks = 0;
  let mergePasses = 0;

  obstacles.forEach((obstacle, obstacleIndex) => {
    const next = [];
    for (const free of freeCuboids) {
      intersectionChecks += 1;
      const subtraction = subtractCuboid(free, obstacle, epsilonCm);
      occupiedUnionVolumeCm3 += subtraction.removedVolumeCm3;
      next.push(...subtraction.remaining);
    }
    freeCuboids = next;

    const shouldMerge = (obstacleIndex + 1) % mergeEvery === 0
      || freeCuboids.length > Math.min(2_000, maxFragments);
    if (shouldMerge && freeCuboids.length > 1) {
      const merged = mergeAdjacentCuboids(freeCuboids, epsilonCm);
      freeCuboids = merged.cuboids;
      mergePasses += merged.passes;
    }
    if (freeCuboids.length > maxFragments) {
      throw new RangeError(`Remaining-space partition exceeded ${maxFragments} fragments.`);
    }
  });

  const merged = mergeAdjacentCuboids(freeCuboids, epsilonCm);
  return {
    freeCuboids: merged.cuboids,
    occupiedUnionVolumeCm3,
    intersectionChecks,
    mergePasses: mergePasses + merged.passes
  };
}

function subtractCuboid(free, obstacle, epsilonCm) {
  const intersection = intersectCuboids(free, obstacle, epsilonCm);
  if (!intersection) return { remaining: [free], removedVolumeCm3: 0 };

  const remaining = [];
  pushCuboid(remaining, free.x1, intersection.x1, free.y1, free.y2, free.z1, free.z2, epsilonCm);
  pushCuboid(remaining, intersection.x2, free.x2, free.y1, free.y2, free.z1, free.z2, epsilonCm);

  pushCuboid(remaining, intersection.x1, intersection.x2, free.y1, intersection.y1, free.z1, free.z2, epsilonCm);
  pushCuboid(remaining, intersection.x1, intersection.x2, intersection.y2, free.y2, free.z1, free.z2, epsilonCm);

  pushCuboid(
    remaining,
    intersection.x1,
    intersection.x2,
    intersection.y1,
    intersection.y2,
    free.z1,
    intersection.z1,
    epsilonCm
  );
  pushCuboid(
    remaining,
    intersection.x1,
    intersection.x2,
    intersection.y1,
    intersection.y2,
    intersection.z2,
    free.z2,
    epsilonCm
  );

  return { remaining, removedVolumeCm3: cuboidVolume(intersection) };
}

function pushCuboid(target, x1, x2, y1, y2, z1, z2, epsilonCm) {
  const cuboid = { x1, x2, y1, y2, z1, z2 };
  if (positiveCuboid(cuboid, epsilonCm)) target.push(cuboid);
}

function intersectCuboids(first, second, epsilonCm) {
  const intersection = {
    x1: Math.max(first.x1, second.x1),
    x2: Math.min(first.x2, second.x2),
    y1: Math.max(first.y1, second.y1),
    y2: Math.min(first.y2, second.y2),
    z1: Math.max(first.z1, second.z1),
    z2: Math.min(first.z2, second.z2)
  };
  return positiveCuboid(intersection, epsilonCm) ? intersection : null;
}

function clipCuboid(cuboid, containerCuboid, epsilonCm) {
  return intersectCuboids(cuboid, containerCuboid, epsilonCm);
}

function mergeAdjacentCuboids(input, epsilonCm) {
  let cuboids = dedupeCuboids(input, epsilonCm);
  let passes = 0;
  let changed = true;
  while (changed && cuboids.length > 1) {
    changed = false;
    for (const axis of ["x", "y", "z"]) {
      const merged = mergeAlongAxis(cuboids, axis, epsilonCm);
      if (merged.length < cuboids.length) changed = true;
      cuboids = merged;
      passes += 1;
    }
  }
  return { cuboids, passes };
}

function mergeAlongAxis(cuboids, axis, epsilonCm) {
  const groups = new Map();
  cuboids.forEach((cuboid) => {
    const key = orthogonalBoundsKey(cuboid, axis, epsilonCm);
    const current = groups.get(key) || [];
    current.push(cuboid);
    groups.set(key, current);
  });

  const merged = [];
  groups.forEach((group) => {
    group.sort((first, second) => axisStart(first, axis) - axisStart(second, axis)
      || axisEnd(first, axis) - axisEnd(second, axis));
    let current = { ...group[0] };
    for (let index = 1; index < group.length; index += 1) {
      const next = group[index];
      if (axisStart(next, axis) <= axisEnd(current, axis) + epsilonCm) {
        setAxisEnd(current, axis, Math.max(axisEnd(current, axis), axisEnd(next, axis)));
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  });
  return dedupeCuboids(merged, epsilonCm);
}

function dedupeCuboids(cuboids, epsilonCm) {
  const unique = new Map();
  cuboids.forEach((cuboid) => {
    if (positiveCuboid(cuboid, epsilonCm)) unique.set(cuboidKey(cuboid, epsilonCm), cuboid);
  });
  return [...unique.values()];
}

function orthogonalBoundsKey(cuboid, axis, epsilonCm) {
  if (axis === "x") return keyValues([cuboid.y1, cuboid.y2, cuboid.z1, cuboid.z2], epsilonCm);
  if (axis === "y") return keyValues([cuboid.x1, cuboid.x2, cuboid.z1, cuboid.z2], epsilonCm);
  return keyValues([cuboid.x1, cuboid.x2, cuboid.y1, cuboid.y2], epsilonCm);
}

function cuboidKey(cuboid, epsilonCm) {
  return keyValues([cuboid.x1, cuboid.x2, cuboid.y1, cuboid.y2, cuboid.z1, cuboid.z2], epsilonCm);
}

function keyValues(values, epsilonCm) {
  return values.map((value) => Math.round(value / epsilonCm)).join(":");
}

function axisStart(cuboid, axis) {
  return cuboid[`${axis}1`];
}

function axisEnd(cuboid, axis) {
  return cuboid[`${axis}2`];
}

function setAxisEnd(cuboid, axis, value) {
  cuboid[`${axis}2`] = value;
}

function toOutputBlock(cuboid, containerVolumeCm3, freeVolumeCm3) {
  const volumeCm3 = cuboidVolume(cuboid);
  return {
    xCm: cuboid.x1,
    yCm: cuboid.y1,
    zCm: cuboid.z1,
    x2Cm: cuboid.x2,
    y2Cm: cuboid.y2,
    z2Cm: cuboid.z2,
    lengthCm: cuboid.x2 - cuboid.x1,
    widthCm: cuboid.y2 - cuboid.y1,
    heightCm: cuboid.z2 - cuboid.z1,
    volumeCm3,
    volumeM3: volumeCm3 / 1_000_000,
    percentOfContainer: containerVolumeCm3 > 0 ? volumeCm3 / containerVolumeCm3 * 100 : 0,
    percentOfFree: freeVolumeCm3 > 0 ? volumeCm3 / freeVolumeCm3 * 100 : 0
  };
}

function fromOutputBlock(block) {
  return {
    x1: Number(block.xCm),
    x2: Number(block.x2Cm ?? (Number(block.xCm) + Number(block.lengthCm))),
    y1: Number(block.yCm),
    y2: Number(block.y2Cm ?? (Number(block.yCm) + Number(block.widthCm))),
    z1: Number(block.zCm),
    z2: Number(block.z2Cm ?? (Number(block.zCm) + Number(block.heightCm)))
  };
}

function compareObstacleOrder(first, second) {
  return cuboidVolume(second) - cuboidVolume(first)
    || first.z1 - second.z1
    || first.y1 - second.y1
    || first.x1 - second.x1
    || first.z2 - second.z2
    || first.y2 - second.y2
    || first.x2 - second.x2
    || finiteNumber(first.sourceIndex, 0) - finiteNumber(second.sourceIndex, 0);
}

function compareOutputBlocks(first, second) {
  return second.volumeCm3 - first.volumeCm3
    || first.zCm - second.zCm
    || first.yCm - second.yCm
    || first.xCm - second.xCm
    || second.lengthCm - first.lengthCm
    || second.widthCm - first.widthCm
    || second.heightCm - first.heightCm;
}

function sameCuboidBounds(first, second, epsilonCm) {
  return ["x1", "x2", "y1", "y2", "z1", "z2"]
    .every((key) => Math.abs(first[key] - second[key]) <= epsilonCm);
}

function containsCuboid(outer, inner, epsilonCm) {
  return inner.x1 >= outer.x1 - epsilonCm && inner.x2 <= outer.x2 + epsilonCm
    && inner.y1 >= outer.y1 - epsilonCm && inner.y2 <= outer.y2 + epsilonCm
    && inner.z1 >= outer.z1 - epsilonCm && inner.z2 <= outer.z2 + epsilonCm;
}

function positiveCuboid(cuboid, epsilonCm) {
  return cuboid.x2 - cuboid.x1 > epsilonCm
    && cuboid.y2 - cuboid.y1 > epsilonCm
    && cuboid.z2 - cuboid.z1 > epsilonCm;
}

function cuboidVolume(cuboid) {
  return Math.max(0, cuboid.x2 - cuboid.x1)
    * Math.max(0, cuboid.y2 - cuboid.y1)
    * Math.max(0, cuboid.z2 - cuboid.z1);
}

function sumCuboidVolumes(cuboids) {
  return cuboids.reduce((sum, cuboid) => sum + cuboidVolume(cuboid), 0);
}

function sumBlockVolumes(blocks) {
  return blocks.reduce((sum, block) => sum + Number(block.volumeCm3 || 0), 0);
}

function snapPositiveDimension(value, epsilonCm, label) {
  const number = finiteNumber(value, NaN);
  if (!Number.isFinite(number) || number <= epsilonCm) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return snap(number, epsilonCm);
}

function snap(value, epsilonCm) {
  return Math.round(Number(value) / epsilonCm) * epsilonCm;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
