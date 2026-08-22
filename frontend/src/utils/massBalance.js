export function calculateMassBalance(container, placements = []) {
  if (!container || !placements.length) return emptyBalance(container);

  let totalWeightKg = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  const quadrants = {
    frontLeftKg: 0,
    frontRightKg: 0,
    rearLeftKg: 0,
    rearRightKg: 0
  };
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const centerZ = Number(container.heightCm || 0) / 2;

  placements.forEach((item) => {
    const weightKg = Math.max(0, Number(item.weightKg || 0));
    if (!weightKg) return;
    const itemX = Number(item.xCm || 0) + Number(item.lengthCm || 0) / 2;
    const itemY = Number(item.yCm || 0) + Number(item.widthCm || 0) / 2;
    const itemZ = Number(item.zCm || 0) + Number(item.heightCm || 0) / 2;
    totalWeightKg += weightKg;
    weightedX += itemX * weightKg;
    weightedY += itemY * weightKg;
    weightedZ += itemZ * weightKg;

    addSplitLoads(
      quadrants,
      weightKg,
      Number(item.xCm || 0),
      Number(item.yCm || 0),
      Number(item.lengthCm || 0),
      Number(item.widthCm || 0),
      centerX,
      centerY
    );
  });

  if (!totalWeightKg) return emptyBalance(container);

  const xCm = weightedX / totalWeightKg;
  const yCm = weightedY / totalWeightKg;
  const zCm = weightedZ / totalWeightKg;
  const offsetXCm = xCm - centerX;
  const offsetYCm = yCm - centerY;
  const offsetZCm = zCm - centerZ;
  const frontKg = quadrants.frontLeftKg + quadrants.frontRightKg;
  const rearKg = quadrants.rearLeftKg + quadrants.rearRightKg;
  const leftKg = quadrants.frontLeftKg + quadrants.rearLeftKg;
  const rightKg = quadrants.frontRightKg + quadrants.rearRightKg;
  const horizontalOffsetCm = Math.hypot(offsetXCm, offsetYCm);
  const normalizedX = Math.abs(offsetXCm) / Math.max(1, centerX);
  const normalizedY = Math.abs(offsetYCm) / Math.max(1, centerY);
  const horizontalOffsetPercent = Math.min(999, Math.hypot(normalizedX, normalizedY) * 100);

  return {
    valid: true,
    totalWeightKg,
    center: { xCm, yCm, zCm },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: offsetXCm,
      yCm: offsetYCm,
      zCm: offsetZCm,
      horizontalCm: horizontalOffsetCm,
      horizontalPercent: horizontalOffsetPercent,
      xPercent: centerX ? offsetXCm / centerX * 100 : 0,
      yPercent: centerY ? offsetYCm / centerY * 100 : 0,
      zPercent: centerZ ? offsetZCm / centerZ * 100 : 0,
      longitudinalCm: offsetXCm,
      lateralCm: offsetYCm,
      longitudinalPercent: centerX ? offsetXCm / centerX * 100 : 0,
      lateralPercent: centerY ? offsetYCm / centerY * 100 : 0
    },
    loads: {
      leftKg,
      rightKg,
      frontKg,
      rearKg,
      leftPercent: leftKg / totalWeightKg * 100,
      rightPercent: rightKg / totalWeightKg * 100,
      frontPercent: frontKg / totalWeightKg * 100,
      rearPercent: rearKg / totalWeightKg * 100,
      ...quadrants,
      frontLeftPercent: quadrants.frontLeftKg / totalWeightKg * 100,
      frontRightPercent: quadrants.frontRightKg / totalWeightKg * 100,
      rearLeftPercent: quadrants.rearLeftKg / totalWeightKg * 100,
      rearRightPercent: quadrants.rearRightKg / totalWeightKg * 100
    }
  };
}

function addSplitLoads(loads, weightKg, x, y, lengthCm, widthCm, centerX, centerY) {
  const safeLength = Math.max(0, Number(lengthCm || 0));
  const safeWidth = Math.max(0, Number(widthCm || 0));
  const area = safeLength * safeWidth;
  if (area <= 0) {
    const front = x <= centerX ? "front" : "rear";
    const side = y <= centerY ? "LeftKg" : "RightKg";
    loads[`${front}${side}`] += weightKg;
    return;
  }

  const frontLength = overlapLength(x, x + safeLength, 0, centerX);
  const rearLength = overlapLength(x, x + safeLength, centerX, centerX * 2);
  const leftWidth = overlapLength(y, y + safeWidth, 0, centerY);
  const rightWidth = overlapLength(y, y + safeWidth, centerY, centerY * 2);
  const portions = [
    ["frontLeftKg", frontLength * leftWidth],
    ["frontRightKg", frontLength * rightWidth],
    ["rearLeftKg", rearLength * leftWidth],
    ["rearRightKg", rearLength * rightWidth]
  ];
  const covered = portions.reduce((sum, [, value]) => sum + value, 0);
  if (covered <= 0) {
    const front = x + safeLength / 2 <= centerX ? "front" : "rear";
    const side = y + safeWidth / 2 <= centerY ? "LeftKg" : "RightKg";
    loads[`${front}${side}`] += weightKg;
    return;
  }
  portions.forEach(([key, value]) => {
    loads[key] += weightKg * value / area;
  });
}

function overlapLength(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function emptyBalance(container) {
  const centerX = Number(container?.lengthCm || 0) / 2;
  const centerY = Number(container?.widthCm || 0) / 2;
  const centerZ = Number(container?.heightCm || 0) / 2;
  return {
    valid: false,
    totalWeightKg: 0,
    center: { xCm: centerX, yCm: centerY, zCm: centerZ },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: 0,
      yCm: 0,
      zCm: 0,
      horizontalCm: 0,
      horizontalPercent: 0,
      xPercent: 0,
      yPercent: 0,
      zPercent: 0,
      longitudinalCm: 0,
      lateralCm: 0,
      longitudinalPercent: 0,
      lateralPercent: 0
    },
    loads: {
      leftKg: 0,
      rightKg: 0,
      frontKg: 0,
      rearKg: 0,
      leftPercent: 0,
      rightPercent: 0,
      frontPercent: 0,
      rearPercent: 0,
      frontLeftKg: 0,
      frontRightKg: 0,
      rearLeftKg: 0,
      rearRightKg: 0,
      frontLeftPercent: 0,
      frontRightPercent: 0,
      rearLeftPercent: 0,
      rearRightPercent: 0
    }
  };
}
