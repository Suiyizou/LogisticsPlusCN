import { calculateMassBalance } from "../utils/massBalance.js";

export const reportNumber = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
const positive = (value) => {
  const number = reportNumber(value);
  return number > 0 ? number : null;
};
const sumKnown = (values) =>
  values.every((value) => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;

// This model describes the returned placements; it never changes packing or supplies a missing measurement.
export function buildPackingReportModel(options, boxes) {
  const cargos = options.cargos || [];
  const modelBoxes = boxes.map((box) => {
    const container = box.container || options.container;
    const rows = (box.placements || box.placed || []).map((item, index) => {
      const cargoIndex = reportNumber(item.cargoIndex);
      const source =
        (Number.isInteger(cargoIndex) && cargoIndex >= 0 ? cargos[cargoIndex] : null) ||
        cargos.find((cargo) => item.cargoId && cargo.id === item.cargoId) ||
        cargos.find(
          (cargo) =>
            item.name &&
            [cargo.name, [cargo.name, cargo.model].filter(Boolean).join(" ")].includes(item.name)
        );
      const sourceIndex = source ? cargos.indexOf(source) : -1;
      const quantity = Math.max(1, Math.floor(positive(item.groupQuantity) || 1));
      const sourceDimensions = [source?.lengthCm, source?.widthCm, source?.heightCm].map(positive);
      const volumeM3 = sourceDimensions.every((value) => value !== null)
        ? sourceDimensions.reduce((product, value) => product * value, quantity) / 1_000_000
        : reportNumber(item.volumeM3);
      const axes = [item.xAxis, item.yAxis, item.zAxis || item.heightAxis];
      const face = axes.slice(0, 2).every(Boolean)
        ? axes.slice(0, 2).includes("\u957f") && axes.slice(0, 2).includes("\u5bbd")
          ? "A"
          : axes.slice(0, 2).includes("\u5bbd") && axes.slice(0, 2).includes("\u9ad8")
            ? "B"
            : axes.slice(0, 2).includes("\u957f") && axes.slice(0, 2).includes("\u9ad8")
              ? "C"
              : null
        : null;
      return {
        ...item,
        reference: `P${String(index + 1).padStart(3, "0")}`,
        cargoNo: sourceIndex >= 0 ? sourceIndex + 1 : null,
        name: item.name || [source?.name, source?.model].filter(Boolean).join(" ") || null,
        quantity,
        weightKg: positive(item.weightKg),
        volumeM3,
        sourceDimensions,
        placedDimensions: [item.lengthCm, item.widthCm, item.heightCm].map(positive),
        physicalDimensions: [
          item.physicalLengthCm,
          item.physicalWidthCm,
          item.physicalHeightCm
        ].map(positive),
        coordinates: [item.xCm, item.yCm, item.zCm].map(reportNumber),
        axes,
        face,
        // Only explicit upstream loading data is a loading order. Array position is a report reference.
        loadingOrder: positive(item.loadingOrder) || positive(item.loadOrder) || null,
        catalogKey:
          sourceIndex >= 0
            ? `cargo-${sourceIndex}`
            : `unmatched-${item.cargoId || item.name || index}`
      };
    });
    const grouped = new Map();
    rows.forEach((row) => {
      if (!grouped.has(row.catalogKey)) grouped.set(row.catalogKey, []);
      grouped.get(row.catalogKey).push(row);
    });
    const inventory = [...grouped.values()].map((items) => ({
      ...items[0],
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      weightKg: sumKnown(items.map((item) => item.weightKg)),
      volumeM3: sumKnown(items.map((item) => item.volumeM3)),
      placementCount: items.length
    }));
    const dimensions = [container.lengthCm, container.widthCm, container.heightCm].map(positive);
    const containerVolumeM3 = dimensions.every((value) => value !== null)
      ? dimensions.reduce((product, value) => product * value, 1) / 1_000_000
      : null;
    const weightKg = sumKnown(rows.map((item) => item.weightKg));
    const volumeM3 = sumKnown(rows.map((item) => item.volumeM3));
    const payloadKg = positive(container.payloadKg);
    const allWeightsKnown = rows.every((item) => item.weightKg !== null && item.weightKg > 0);
    return {
      ...box,
      container,
      rows,
      inventory,
      dimensions,
      containerVolumeM3,
      volumeM3,
      weightKg,
      payloadKg,
      quantity: rows.reduce((sum, item) => sum + item.quantity, 0),
      fillPercent:
        containerVolumeM3 > 0 && volumeM3 !== null ? (volumeM3 / containerVolumeM3) * 100 : null,
      weightPercent: payloadKg > 0 && weightKg !== null ? (weightKg / payloadKg) * 100 : null,
      remainingPayloadKg: payloadKg !== null && weightKg !== null ? payloadKg - weightKg : null,
      balance: allWeightsKnown ? calculateMassBalance(container, rows) : null,
      balanceValidation: box.balanceValidation || null,
      hasMissingWeight: !allWeightsKnown
    };
  });
  return {
    boxes: modelBoxes,
    quantity: modelBoxes.reduce((sum, box) => sum + box.quantity, 0),
    weightKg: sumKnown(modelBoxes.map((box) => box.weightKg)),
    volumeM3: sumKnown(modelBoxes.map((box) => box.volumeM3)),
    requestedQuantity: cargos.length
      ? sumKnown(cargos.map((cargo) => reportNumber(cargo.quantity)))
      : null
  };
}
