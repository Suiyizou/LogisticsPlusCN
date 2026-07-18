import { calculateMassBalance } from "../utils/massBalance";
import { cargoLabel } from "../utils/format";
import { localizeCanvasContext, translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

const REPORT_COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const PAGE_WIDTH = 1800;
const CARD_RADIUS = 18;

export async function exportPackingReport(options) {
  if (!options?.container) {
    throw new Error("当前货舱没有可导出的摆放结果。");
  }
  if (options.format !== "pdf" && !options?.placements?.length) {
    throw new Error("当前货舱没有可导出的摆放结果。");
  }
  if (document.fonts?.ready) await document.fonts.ready;

  const generatedAt = new Date();
  if (options.format === "pdf") {
    const boxes = collectReportBoxes(options);
    if (!boxes.length) throw new Error("当前方案没有可导出的货舱报告。");
    const canvases = boxes.map((box) => renderReportCanvas({
      ...options,
      container: box.container,
      placements: box.placements,
      boxIndex: box.index,
      generatedAt
    }));
    const pdfBlob = await createPdfFromCanvases(canvases);
    downloadBlob(pdfBlob, `${multiReportFileBase(options, generatedAt)}.pdf`);
    return;
  }
  const canvas = renderReportCanvas({ ...options, generatedAt });
  const fileBase = reportFileBase({ ...options, generatedAt });
  const imageBlob = await canvasToBlob(canvas, "image/png", 1);
  downloadBlob(imageBlob, `${fileBase}.png`);
}

function collectReportBoxes(options) {
  const boxes = [...(options?.evaluation?.packedBoxes || [])]
    .filter((box) => box?.placed?.length)
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((box, index) => ({
      index: Number(box.index || index + 1),
      container: box.container || options.container,
      placements: box.placed || []
    }));
  if (boxes.length) return boxes;
  return options?.placements?.length
    ? [{
      index: Number(options.boxIndex || 1),
      container: options.container,
      placements: options.placements
    }]
    : [];
}

export async function exportPackingReportsZip(options) {
  const boxes = options?.evaluation?.packedBoxes || [];
  if (!options?.container || !boxes.length) {
    throw new Error("当前方案没有可导出的货舱报告。");
  }
  if (document.fonts?.ready) await document.fonts.ready;
  const generatedAt = new Date();
  const files = [];
  for (const box of boxes) {
    if (!box.placed?.length) continue;
    const boxContainer = box.container || options.container;
    const canvas = renderReportCanvas({
      ...options,
      container: boxContainer,
      placements: box.placed,
      boxIndex: box.index,
      generatedAt
    });
    const blob = await canvasToBlob(canvas, "image/png", 1);
    files.push({
      name: `${reportFileBase({ ...options, container: boxContainer, boxIndex: box.index, generatedAt })}.png`,
      blob
    });
  }
  if (!files.length) {
    throw new Error("没有可导出的货舱图片。");
  }
  const zipBlob = await createZipBlob(files);
  downloadBlob(zipBlob, `${reportFileStem(options, generatedAt)}-Reports.zip`);
}

export function renderReportCanvas(options) {
  const container = options.container;
  const catalog = buildCargoCatalog(options.cargos || [], options.placements || []);
  const placements = enrichPlacements(options.placements || [], catalog);
  const layers = buildLayers(placements);
  const massBalance = options.showMassBalance === false ? null : calculateMassBalance(container, placements);
  const legendHeight = Math.max(86, 54 + Math.ceil(catalog.length / 4) * 46);
  const balanceHeight = massBalance?.valid ? 360 : 0;
  const layerCardHeight = 600;
  const height = 150 + 112 + balanceHeight + (balanceHeight ? 24 : 0) + legendHeight + layers.length * (layerCardHeight + 24) + 70;
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = height;
  const ctx = localizeCanvasContext(canvas.getContext("2d"), options.locale);

  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 0;
  drawHeader(ctx, options, catalog, layers);
  y += 150;
  drawSummary(ctx, 48, y, PAGE_WIDTH - 96, 88, options, placements, layers);
  y += 112;
  if (massBalance?.valid) {
    drawMassBalance(ctx, 48, y, PAGE_WIDTH - 96, balanceHeight, container, placements, massBalance);
    y += balanceHeight + 24;
  }
  drawLegend(ctx, 48, y, PAGE_WIDTH - 96, legendHeight, catalog);
  y += legendHeight + 24;

  layers.forEach((layer, index) => {
    drawLayerBreakdown(ctx, 48, y, PAGE_WIDTH - 96, layerCardHeight, container, layer, index, layers.length);
    y += layerCardHeight + 24;
  });

  drawFooter(ctx, height - 38);
  return canvas;
}

function drawHeader(ctx, options, catalog, layers) {
  const gradient = ctx.createLinearGradient(0, 0, PAGE_WIDTH, 0);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#eaf4ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PAGE_WIDTH, 150);

  ctx.fillStyle = "#1f6fbe";
  roundRect(ctx, 48, 42, 62, 62, 15);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 26px Microsoft YaHei, Arial";
  ctx.fillText("CP", 64, 82);

  ctx.fillStyle = "#122033";
  ctx.font = "800 40px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.title"), 132, 68, 720, 28);
  ctx.fillStyle = "#52657b";
  ctx.font = "400 18px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.subtitle"), 134, 104, 900, 13);

  const rightX = 1240;
  const holdText = reportText(ctx, "report.holdNo", { index: options.boxIndex || 1 });
  const containerName = translateLegacyText(options.container?.name || "-", ctx?.__cargoPlannerLocale || "zh-CN");
  ctx.fillStyle = "#174a7f";
  ctx.font = "800 22px Microsoft YaHei, Arial";
  fillFittedText(ctx, `${containerName} · ${holdText}`, rightX, 58, PAGE_WIDTH - rightX - 48, 14);
  ctx.fillStyle = "#52657b";
  ctx.font = "400 17px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.generatedAt", { value: (options.generatedAt || new Date()).toLocaleString(reportLocale(options.locale)) }), rightX, 92, PAGE_WIDTH - rightX - 48, 12);
  fillFittedText(ctx, reportText(ctx, "report.cargoLayerCounts", { cargoTypes: catalog.length, layers: layers.length }), rightX, 122, PAGE_WIDTH - rightX - 48, 12);
}

function drawSummary(ctx, x, y, width, height, options, placements, layers) {
  drawCard(ctx, x, y, width, height);
  const evaluation = options.evaluation || {};
  const values = [
    ["箱型尺寸", `${options.container.lengthCm} × ${options.container.widthCm} × ${options.container.heightCm} cm`],
    ["预计箱数", `${evaluation.estimatedBoxes ? "约 " : ""}${evaluation.boxes || "-"} 箱`],
    ["首箱空间占用", `${formatNum(evaluation.firstBoxFillPercent)}%`],
    ["货物总体积", `${formatNum(evaluation.totalRawVolumeM3, 2)} m³`],
    ["货物总重量", `${formatNum((evaluation.totalWeightKg || 0) / 1000, 2)} t`],
    ["当前货舱", `${sumPlacementQuantity(placements)} 件 / ${layers.length} 层`]
  ];
  values.forEach((item, index) => {
    const cellWidth = width / values.length;
    const cx = x + index * cellWidth + 24;
    ctx.fillStyle = "#64748b";
    ctx.font = "400 16px Microsoft YaHei, Arial";
    fillFittedText(ctx, item[0], cx, y + 30, cellWidth - 36, 11);
    ctx.fillStyle = "#132033";
    ctx.font = "800 23px Microsoft YaHei, Arial";
    fillFittedText(ctx, item[1], cx, y + 62, cellWidth - 36, 13);
  });
}

function drawMassBalance(ctx, x, y, width, height, container, placements, balance) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = "800 27px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.massBalanceTitle"), x + 24, y + 38, width - 48, 18);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 15px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.massBalanceText"), x + 24, y + 66, width - 48, 11);

  const plot = { x: x + 24, y: y + 92, width: 690, height: height - 120 };
  drawBalanceTopMap(ctx, plot, container, placements, balance);

  const metricsX = plot.x + plot.width + 34;
  const metricWidth = width - (metricsX - x) - 24;
  const metrics = [
    { label: "总重", value: formatWeight(balance.totalWeightKg) },
    { label: "重心坐标", value: `X ${formatNum(balance.center.xCm)} / Y ${formatNum(balance.center.yCm)} / Z ${formatNum(balance.center.zCm)} cm` },
    { label: "X 偏移", value: `${formatSigned(balance.offset.xCm)} cm (${formatSigned(balance.offset.xPercent)}%)` },
    { label: "Y 偏移", value: `${formatSigned(balance.offset.yCm)} cm (${formatSigned(balance.offset.yPercent)}%)` },
    { label: "水平偏载", value: `${formatNum(balance.offset.horizontalCm)} cm / ${formatNum(balance.offset.horizontalPercent)}%`, danger: true }
  ];

  metrics.forEach((item, index) => {
    const cellX = metricsX + (index % 2) * (metricWidth / 2);
    const cellY = y + 98 + Math.floor(index / 2) * 58;
    ctx.fillStyle = "#64748b";
    ctx.font = "400 14px Microsoft YaHei, Arial";
    fillFittedText(ctx, item.label, cellX, cellY, metricWidth / 2 - 24, 10);
    ctx.fillStyle = item.danger ? "#be123c" : "#132033";
    ctx.font = "800 21px Microsoft YaHei, Arial";
    fillFittedText(ctx, item.value, cellX, cellY + 28, metricWidth / 2 - 24, 12);
  });

  drawSplitBar(ctx, metricsX, y + 270, metricWidth, 24, balance.loads.leftPercent, "#2a9d8f", "#3b82f6", `左 ${formatNum(balance.loads.leftPercent)}%`, `右 ${formatNum(balance.loads.rightPercent)}%`);
  drawSplitBar(ctx, metricsX, y + 314, metricWidth, 24, balance.loads.frontPercent, "#f59e0b", "#8b5cf6", `前 ${formatNum(balance.loads.frontPercent)}%`, `后 ${formatNum(balance.loads.rearPercent)}%`);
}

function drawBalanceTopMap(ctx, plot, container, placements, balance) {
  ctx.fillStyle = "#f8fbff";
  roundRect(ctx, plot.x, plot.y, plot.width, plot.height, 12);
  ctx.fill();
  ctx.strokeStyle = "#d3deea";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.fillStyle = "#132033";
  ctx.font = "800 17px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.massTopTitle"), plot.x + 18, plot.y + 28, 124, 12);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 13px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.massTopText"), plot.x + 150, plot.y + 28, plot.width - 168, 10);

  const inner = inset(plot, 36, 48, 36, 36);
  const scale = Math.min(inner.width / container.lengthCm, inner.height / container.widthCm);
  const w = container.lengthCm * scale;
  const h = container.widthCm * scale;
  const ox = inner.x + (inner.width - w) / 2;
  const oy = inner.y + (inner.height - h) / 2;

  drawBalanceZones(ctx, ox, oy, w, h, balance);
  drawGrid(ctx, ox, oy, w, h);
  placements.forEach((item) => {
    const rx = ox + Number(item.xCm || 0) * scale;
    const ry = oy + Number(item.yCm || 0) * scale;
    const rw = Math.max(2, Number(item.lengthCm || 0) * scale);
    const rh = Math.max(2, Number(item.widthCm || 0) * scale);
    ctx.fillStyle = hexToRgba(item.color || "#4e8fd0", 0.42);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = hexToRgba("#0f172a", 0.32);
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, rw, rh);
  });

  const gx = ox + container.lengthCm * scale / 2;
  const gy = oy + container.widthCm * scale / 2;
  const cx = ox + balance.center.xCm * scale;
  const cy = oy + balance.center.yCm * scale;

  ctx.strokeStyle = "rgba(15, 23, 42, 0.44)";
  ctx.lineWidth = 2;
  drawLine(ctx, { x: gx - 24, y: gy }, { x: gx + 24, y: gy });
  drawLine(ctx, { x: gx, y: gy - 24 }, { x: gx, y: gy + 24 });
  ctx.setLineDash([8, 6]);
  drawLine(ctx, { x: gx, y: oy }, { x: gx, y: oy + h });
  drawLine(ctx, { x: ox, y: gy }, { x: ox + w, y: gy });
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(225, 29, 72, 0.58)";
  ctx.lineWidth = 3;
  drawLine(ctx, { x: gx, y: gy }, { x: cx, y: cy });

  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(225, 29, 72, 0.24)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 21, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#1f6fbe";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, w, h);
  ctx.fillStyle = "#2d5f93";
  ctx.font = "700 13px Microsoft YaHei, Arial";
  centerText(ctx, `X ${container.lengthCm} cm`, ox + w / 2, oy - 8);
  ctx.save();
  ctx.translate(ox - 12, oy + h / 2);
  ctx.rotate(-Math.PI / 2);
  centerText(ctx, `Y ${container.widthCm} cm`, 0, 0);
  ctx.restore();
}

function drawBalanceZones(ctx, ox, oy, width, height, balance) {
  const zones = [
    { label: "前左", kg: balance.loads.frontLeftKg, percent: balance.loads.frontLeftPercent, x: ox, y: oy, color: "rgba(56, 189, 248, 0.13)" },
    { label: "前右", kg: balance.loads.frontRightKg, percent: balance.loads.frontRightPercent, x: ox + width / 2, y: oy, color: "rgba(245, 158, 11, 0.13)" },
    { label: "后左", kg: balance.loads.rearLeftKg, percent: balance.loads.rearLeftPercent, x: ox, y: oy + height / 2, color: "rgba(245, 158, 11, 0.1)" },
    { label: "后右", kg: balance.loads.rearRightKg, percent: balance.loads.rearRightPercent, x: ox + width / 2, y: oy + height / 2, color: "rgba(139, 92, 246, 0.12)" }
  ];
  if (zones[1] && zones[2]) {
    zones[1].x = ox;
    zones[1].y = oy + height / 2;
    zones[2].x = ox + width / 2;
    zones[2].y = oy;
  }
  zones.forEach((zone) => {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, width / 2, height / 2);
    ctx.fillStyle = "#475569";
    ctx.font = "700 12px Microsoft YaHei, Arial";
    ctx.fillText(`${zone.label} ${formatWeight(zone.kg)} / ${formatNum(zone.percent)}%`, zone.x + 8, zone.y + 18);
  });
}

function drawSplitBar(ctx, x, y, width, height, percent, leftColor, rightColor, leftLabel, rightLabel) {
  const leftWidth = Math.max(0, Math.min(100, percent)) / 100 * width;
  ctx.fillStyle = "#e2e8f0";
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, 8);
  ctx.clip();
  ctx.fillStyle = leftColor;
  ctx.fillRect(x, y, leftWidth, height);
  ctx.fillStyle = rightColor;
  ctx.fillRect(x + leftWidth, y, width - leftWidth, height);
  ctx.restore();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 8);
  ctx.stroke();
  ctx.fillStyle = "#132033";
  ctx.font = "800 13px Microsoft YaHei, Arial";
  ctx.fillText(leftLabel, x, y - 8);
  const rightTextWidth = ctx.measureText(rightLabel).width;
  ctx.fillText(rightLabel, x + width - rightTextWidth, y - 8);
}

function drawLegend(ctx, x, y, width, height, catalog) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = "800 23px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.legendTitle"), x + 24, y + 32, 210, 15);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 15px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.legendText"), x + 250, y + 32, width - 274, 10);

  const columns = 4;
  const cellWidth = (width - 48) / columns;
  catalog.forEach((cargo, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = x + 24 + col * cellWidth;
    const cellY = y + 58 + row * 46;
    ctx.fillStyle = cargo.color;
    roundRect(ctx, cellX, cellY - 2, 34, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 14px Microsoft YaHei, Arial";
    centerText(ctx, `#${cargo.no}`, cellX + 17, cellY + 18);
    ctx.fillStyle = "#132033";
    ctx.font = "800 16px Microsoft YaHei, Arial";
    fillFittedText(ctx, `#${cargo.no} ${cargoLabel(cargo)}`, cellX + 46, cellY + 10, cellWidth - 60, 10);
    ctx.fillStyle = "#52657b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    fillFittedText(ctx, reportText(ctx, "report.dimensionsQuantity", {
      dimensions: `${cargo.lengthCm} × ${cargo.widthCm} × ${cargo.heightCm}`,
      quantity: cargo.quantity || 0
    }), cellX + 46, cellY + 30, cellWidth - 60, 9);
  });
}

function drawLayerBreakdown(ctx, x, y, width, height, container, layer, index, totalLayers) {
  const title = `第 ${index + 1} 层 / 共 ${totalLayers} 层：z=${formatNum(layer.z)} cm`;
  const subtitle = `高度范围 ${formatNum(layer.z)}-${formatNum(layer.top)} cm；本层按“魔方切片”单独拉出展示，编号与右侧堆放方式一一对应。`;
  drawSectionCard(ctx, x, y, width, height, title, subtitle);

  const gap = 24;
  const statsWidth = 376;
  const plotY = y + 82;
  const plotHeight = height - 112;
  const topWidth = 560;
  const isoWidth = width - 48 - gap * 2 - statsWidth - topWidth;
  const topPlot = { x: x + 24, y: plotY, width: topWidth, height: plotHeight };
  const isoPlot = { x: topPlot.x + topWidth + gap, y: plotY, width: isoWidth, height: plotHeight };
  drawTopProjection(ctx, topPlot, container, layer.items, {
    title: "本层俯视图：X × Y",
    note: "从货舱顶部看本层底面位置；#编号对应录入货物"
  });
  drawLayerExplodedIso(ctx, isoPlot, container, layer, {
    title: "本层剖析图：单层斜侧立体",
    note: "从 X/Y/Z 三轴观察该层；色块按实际位置绘制并标注编号"
  });
  drawLayerStats(ctx, isoPlot.x + isoWidth + gap, plotY, statsWidth, plotHeight, layer, index);
}

function drawTopProjection(ctx, plot, container, items, config = {}) {
  drawPlotFrame(ctx, plot, config.title, config.note);
  const inner = inset(plot, 36, 52, 26, 34);
  const scale = Math.min(inner.width / container.lengthCm, inner.height / container.widthCm);
  const w = container.lengthCm * scale;
  const h = container.widthCm * scale;
  const ox = inner.x + (inner.width - w) / 2;
  const oy = inner.y + (inner.height - h) / 2;

  drawGrid(ctx, ox, oy, w, h);
  [...items]
    .sort((a, b) => a.zCm - b.zCm || a.yCm - b.yCm || a.xCm - b.xCm)
    .forEach((item) => {
      const rx = ox + item.xCm * scale;
      const ry = oy + item.yCm * scale;
      const rw = Math.max(2, item.lengthCm * scale);
      const rh = Math.max(2, item.widthCm * scale);
      ctx.fillStyle = hexToRgba(item.color, 0.78);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = hexToRgba("#12263f", 0.45);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(rx, ry, rw, rh);
      drawCargoLabel(ctx, item, rx, ry, rw, rh, { compact: rw < 76 || rh < 48 });
    });

  ctx.strokeStyle = "#1f6fbe";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, w, h);
  drawDimensionLabels(ctx, ox, oy, w, h, container);
}

function drawSideProjection(ctx, plot, container, items, config = {}) {
  drawPlotFrame(ctx, plot, config.title, config.note);
  const inner = inset(plot, 42, 58, 34, 42);
  const minItemZ = items.length ? Math.min(...items.map((item) => Number(item.zCm || 0))) : 0;
  const zOffset = config.normalizeZ ? Number(config.layerZ ?? minItemZ) : 0;
  const maxItemTop = items.length
    ? Math.max(...items.map((item) => Number(item.zCm || 0) + Number(item.heightCm || 0)))
    : Number(container.heightCm || 0);
  const viewHeight = config.normalizeZ
    ? Math.max(1, maxItemTop - zOffset)
    : Number(container.heightCm || maxItemTop || 1);
  const scale = Math.min(inner.width / container.lengthCm, inner.height / viewHeight);
  const frameW = container.lengthCm * scale;
  const frameH = viewHeight * scale;
  const ox = inner.x + (inner.width - frameW) / 2;
  const oy = inner.y + (inner.height - frameH) / 2;
  const baseY = oy + frameH;

  drawGrid(ctx, ox, oy, frameW, frameH);
  [...items]
    .sort((a, b) => Number(a.yCm || 0) - Number(b.yCm || 0) || Number(a.zCm || 0) - Number(b.zCm || 0) || Number(a.xCm || 0) - Number(b.xCm || 0))
    .forEach((item) => {
      const localZ = Math.max(0, Number(item.zCm || 0) - zOffset);
      const rx = ox + Number(item.xCm || 0) * scale;
      const rw = Math.max(2, Number(item.lengthCm || 0) * scale);
      const rh = Math.max(2, Number(item.heightCm || 0) * scale);
      const ry = baseY - (localZ + Number(item.heightCm || 0)) * scale;
      ctx.fillStyle = hexToRgba(item.color, 0.76);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = hexToRgba("#12263f", 0.48);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(rx, ry, rw, rh);
      drawSideCargoLabel(ctx, item, rx, ry, rw, rh, { compact: rw < 76 || rh < 48 });
    });

  ctx.strokeStyle = "#1f6fbe";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, frameW, frameH);
  drawSideDimensionLabels(ctx, ox, oy, frameW, frameH, container, viewHeight, config);
}

function drawLayerExplodedIso(ctx, plot, container, layer, config = {}) {
  drawPlotFrame(ctx, plot, config.title, config.note);
  const inner = inset(plot, 52, 76, 42, 54);
  const items = layer.items || [];
  const project = createIsoProjector(container, items, layer, inner);

  drawIsoBase(ctx, project, container);
  drawIsoAxes(ctx, inner);

  [...items]
    .sort((a, b) => {
      const az = Number(a.zCm || 0) + Number(a.heightCm || 0);
      const bz = Number(b.zCm || 0) + Number(b.heightCm || 0);
      return (Number(a.xCm || 0) + Number(a.yCm || 0) + az)
        - (Number(b.xCm || 0) + Number(b.yCm || 0) + bz);
    })
    .forEach((item) => drawIsoCargo(ctx, project, item, layer));
}

function createIsoProjector(container, items, layer, inner) {
  const cos = 0.866;
  const sin = 0.5;
  const zScale = 1.12;
  const raw = (x, y, z) => ({
    x: (Number(x || 0) - Number(y || 0)) * cos,
    y: (Number(x || 0) + Number(y || 0)) * sin - Number(z || 0) * zScale
  });
  const layerZ = Number(layer.z || 0);
  const points = [
    raw(0, 0, 0),
    raw(container.lengthCm, 0, 0),
    raw(container.lengthCm, container.widthCm, 0),
    raw(0, container.widthCm, 0)
  ];

  items.forEach((item) => {
    const x = Number(item.xCm || 0);
    const y = Number(item.yCm || 0);
    const z = Math.max(0, Number(item.zCm || 0) - layerZ);
    const l = Number(item.lengthCm || 0);
    const w = Number(item.widthCm || 0);
    const h = Number(item.heightCm || 0);
    [0, l].forEach((dx) => {
      [0, w].forEach((dy) => {
        [0, h].forEach((dz) => points.push(raw(x + dx, y + dy, z + dz)));
      });
    });
  });

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = Math.min(inner.width / Math.max(1, maxX - minX), inner.height / Math.max(1, maxY - minY)) * 0.92;
  const offsetX = inner.x + inner.width / 2 - ((minX + maxX) * scale) / 2;
  const offsetY = inner.y + inner.height / 2 - ((minY + maxY) * scale) / 2 + 10;

  return (x, y, z) => {
    const point = raw(x, y, z);
    return { x: offsetX + point.x * scale, y: offsetY + point.y * scale };
  };
}

function drawIsoBase(ctx, project, container) {
  const corners = [
    project(0, 0, 0),
    project(container.lengthCm, 0, 0),
    project(container.lengthCm, container.widthCm, 0),
    project(0, container.widthCm, 0)
  ];
  ctx.fillStyle = "rgba(232, 246, 251, 0.86)";
  fillPolygon(ctx, corners);
  ctx.strokeStyle = "#2f7cc4";
  ctx.lineWidth = 1.7;
  strokePolygon(ctx, corners);

  ctx.strokeStyle = "rgba(47, 124, 196, 0.22)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i += 1) {
    const x = (container.lengthCm * i) / 10;
    const y = (container.widthCm * i) / 10;
    drawLine(ctx, project(x, 0, 0), project(x, container.widthCm, 0));
    drawLine(ctx, project(0, y, 0), project(container.lengthCm, y, 0));
  }
}

function drawIsoAxes(ctx, inner) {
  const x = inner.x + 14;
  const y = inner.y + inner.height - 26;
  ctx.font = "800 13px Microsoft YaHei, Arial";
  ctx.strokeStyle = "#2f7cc4";
  ctx.lineWidth = 2;
  drawLine(ctx, { x, y }, { x: x + 70, y });
  drawLine(ctx, { x, y }, { x: x - 34, y: y - 24 });
  drawLine(ctx, { x, y }, { x, y: y - 56 });
  ctx.fillStyle = "#174a7f";
  ctx.fillText("X 长", x + 76, y + 4);
  ctx.fillText("Y 宽", x - 56, y - 26);
  ctx.fillText("Z 高", x + 8, y - 58);
}

function drawIsoCargo(ctx, project, item, layer) {
  const x = Number(item.xCm || 0);
  const y = Number(item.yCm || 0);
  const z = Math.max(0, Number(item.zCm || 0) - Number(layer.z || 0));
  const l = Number(item.lengthCm || 0);
  const w = Number(item.widthCm || 0);
  const h = Number(item.heightCm || 0);
  const p000 = project(x, y, z);
  const p100 = project(x + l, y, z);
  const p010 = project(x, y + w, z);
  const p110 = project(x + l, y + w, z);
  const p001 = project(x, y, z + h);
  const p101 = project(x + l, y, z + h);
  const p011 = project(x, y + w, z + h);
  const p111 = project(x + l, y + w, z + h);

  ctx.fillStyle = hexToRgba(item.color, 0.56);
  fillPolygon(ctx, [p010, p110, p111, p011]);
  ctx.fillStyle = hexToRgba(item.color, 0.72);
  fillPolygon(ctx, [p100, p110, p111, p101]);
  ctx.fillStyle = hexToRgba(item.color, 0.86);
  fillPolygon(ctx, [p001, p101, p111, p011]);

  ctx.strokeStyle = hexToRgba("#0f172a", 0.42);
  ctx.lineWidth = 1.25;
  strokePolygon(ctx, [p010, p110, p111, p011]);
  strokePolygon(ctx, [p100, p110, p111, p101]);
  strokePolygon(ctx, [p001, p101, p111, p011]);

  const topCenter = averagePoint([p001, p101, p111, p011]);
  drawIsoCargoBadge(ctx, item, topCenter);
}

function drawIsoCargoBadge(ctx, item, point) {
  const label = reportCargoLabel(item);
  ctx.font = "800 14px Microsoft YaHei, Arial";
  const width = Math.max(34, ctx.measureText(label).width + 16);
  const height = 24;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, point.x - width / 2, point.y - height / 2, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(item.color, 0.7);
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.fillStyle = "#132033";
  centerText(ctx, label, point.x, point.y + 5);
}

function drawLayerStats(ctx, x, y, width, height, layer, index) {
  drawPlotFrame(ctx, { x, y, width, height }, reportText(ctx, "report.faceStatsTitle"), reportText(ctx, "report.faceStatsNote", { index: index + 1 }));
  const stats = countByCargo(layer.items, ctx);
  let rowY = y + 76;
  stats.forEach((item) => {
    if (rowY > y + height - 74) return;
    ctx.fillStyle = item.color;
    roundRect(ctx, x + 18, rowY - 22, 42, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 13px Microsoft YaHei, Arial";
    centerText(ctx, item.label, x + 39, rowY - 3);

    ctx.fillStyle = "#132033";
    ctx.font = "800 16px Microsoft YaHei, Arial";
    fillFittedText(ctx, `${item.name}`, x + 68, rowY - 8, width - 158, 10);
    ctx.fillStyle = "#52657b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    fillFittedText(ctx, reportText(ctx, "report.itemCount", { count: item.count }), x + width - 74, rowY - 8, 58, 9);

    ctx.font = "700 13px Microsoft YaHei, Arial";
    ctx.fillStyle = "#1f3148";
    wrapText(ctx, item.orientationDetails[0] || "-", x + 18, rowY + 22, width - 36, 17, 4);

    rowY += 118;
  });
}

function drawCargoLabel(ctx, item, x, y, width, height, options = {}) {
  const label = reportCargoLabel(item);
  const size = options.compact ? 13 : Math.max(13, Math.min(20, Math.floor(Math.min(width, height) * 0.32)));
  ctx.font = `800 ${size}px Microsoft YaHei, Arial`;
  const labelWidth = ctx.measureText(label).width + 14;
  const pillWidth = Math.min(Math.max(labelWidth, 34), Math.max(width - 6, 34));
  const pillHeight = Math.min(size + 12, Math.max(height - 6, size + 8));
  const px = x + width / 2 - pillWidth / 2;
  const py = y + height / 2 - pillHeight / 2;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, px, py, pillWidth, pillHeight, Math.min(10, pillHeight / 2));
  ctx.fill();
  ctx.fillStyle = "#132033";
  centerText(ctx, label, x + width / 2, py + pillHeight / 2 + size * 0.36);

  if (!options.compact && width > 92 && height > 60) {
    const lines = [
      `X:${item.xAxis || "长"}${formatNum(item.xAxisBaseCm, 0)}cm`,
      `Y:${item.yAxis || "宽"}${formatNum(item.yAxisBaseCm, 0)}cm`
    ];
    ctx.font = "700 11px Microsoft YaHei, Arial";
    const textY = py + pillHeight + 14;
    if (textY + 16 < y + height - 5) {
      const labelWidth = Math.min(Math.max(...lines.map((line) => ctx.measureText(line).width)) + 12, width - 8);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      roundRect(ctx, x + width / 2 - labelWidth / 2, textY - 12, labelWidth, 34, 7);
      ctx.fill();
      ctx.fillStyle = "#1f3148";
      centerText(ctx, lines[0], x + width / 2, textY);
      centerText(ctx, lines[1], x + width / 2, textY + 15);
    }
  }
}

function drawSideCargoLabel(ctx, item, x, y, width, height, options = {}) {
  const label = reportCargoLabel(item);
  const size = options.compact ? 13 : Math.max(13, Math.min(18, Math.floor(Math.min(width, height) * 0.3)));
  ctx.font = `800 ${size}px Microsoft YaHei, Arial`;
  const pillWidth = Math.min(Math.max(ctx.measureText(label).width + 14, 34), Math.max(width - 6, 34));
  const pillHeight = Math.min(size + 12, Math.max(height - 6, size + 8));
  const px = x + width / 2 - pillWidth / 2;
  const py = y + height / 2 - pillHeight / 2;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, px, py, pillWidth, pillHeight, Math.min(10, pillHeight / 2));
  ctx.fill();
  ctx.fillStyle = "#132033";
  centerText(ctx, label, x + width / 2, py + pillHeight / 2 + size * 0.36);

  if (!options.compact && width > 96 && height > 56) {
    const lines = [
      `X:${item.xAxis || "长"}${formatNum(item.xAxisBaseCm, 0)}cm`,
      `Z:${item.zAxis || item.heightAxis || "高"}${formatNum(item.zAxisBaseCm, 0)}cm`
    ];
    ctx.font = "700 11px Microsoft YaHei, Arial";
    const textY = py + pillHeight + 14;
    if (textY + 16 < y + height - 5) {
      const labelWidth = Math.min(Math.max(...lines.map((line) => ctx.measureText(line).width)) + 12, width - 8);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      roundRect(ctx, x + width / 2 - labelWidth / 2, textY - 12, labelWidth, 34, 7);
      ctx.fill();
      ctx.fillStyle = "#1f3148";
      centerText(ctx, lines[0], x + width / 2, textY);
      centerText(ctx, lines[1], x + width / 2, textY + 15);
    }
  }
}

function drawSectionCard(ctx, x, y, width, height, title, subtitle) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = "800 25px Microsoft YaHei, Arial";
  fillFittedText(ctx, title, x + 24, y + 38, width - 48, 15);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 15px Microsoft YaHei, Arial";
  fillFittedText(ctx, subtitle, x + 24, y + 66, width - 48, 10);
}

function drawPlotFrame(ctx, plot, title, note) {
  ctx.fillStyle = "#f8fbff";
  roundRect(ctx, plot.x, plot.y, plot.width, plot.height, 12);
  ctx.fill();
  ctx.strokeStyle = "#d3deea";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = "#132033";
  ctx.font = "800 17px Microsoft YaHei, Arial";
  fillFittedText(ctx, title, plot.x + 18, plot.y + 28, plot.width - 36, 11);
  if (note) {
    ctx.fillStyle = "#64748b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    fillFittedText(ctx, note, plot.x + 18, plot.y + 48, plot.width - 36, 9);
  }
}

function drawGrid(ctx, x, y, width, height) {
  ctx.strokeStyle = "#d9e6f3";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const gx = x + (width * i) / 10;
    const gy = y + (height * i) / 10;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + height);
    ctx.moveTo(x, gy);
    ctx.lineTo(x + width, gy);
    ctx.stroke();
  }
}

function drawDimensionLabels(ctx, ox, oy, width, height, container) {
  ctx.fillStyle = "#2d5f93";
  ctx.font = "700 14px Microsoft YaHei, Arial";
  centerText(ctx, `X向=箱体长 ${container.lengthCm} cm`, ox + width / 2, oy - 10);
  ctx.save();
  ctx.translate(ox - 14, oy + height / 2);
  ctx.rotate(-Math.PI / 2);
  centerText(ctx, `Y向=箱体宽 ${container.widthCm} cm`, 0, 0);
  ctx.restore();
}

function drawSideDimensionLabels(ctx, ox, oy, width, height, container, viewHeight, config = {}) {
  ctx.fillStyle = "#2d5f93";
  ctx.font = "700 14px Microsoft YaHei, Arial";
  centerText(ctx, `X向=箱体长 ${container.lengthCm} cm`, ox + width / 2, oy - 10);
  ctx.save();
  ctx.translate(ox - 16, oy + height / 2);
  ctx.rotate(-Math.PI / 2);
  const label = config.normalizeZ ? `Z向=本层高度 ${formatNum(viewHeight)} cm` : `Z向=箱体高 ${container.heightCm} cm`;
  centerText(ctx, label, 0, 0);
  ctx.restore();

  ctx.fillStyle = "#64748b";
  ctx.font = "400 12px Microsoft YaHei, Arial";
  ctx.fillText("侧视沿 Y 向观察，Y 向底面边见右侧统计", ox, oy + height + 22);
}

function drawFooter(ctx, y) {
  ctx.strokeStyle = "#d3deea";
  ctx.beginPath();
  ctx.moveTo(48, y - 22);
  ctx.lineTo(PAGE_WIDTH - 48, y - 22);
  ctx.stroke();
  ctx.fillStyle = "#64748b";
  ctx.font = "400 14px Microsoft YaHei, Arial";
  fillFittedText(ctx, reportText(ctx, "report.footerNote"), 48, y, PAGE_WIDTH - 96, 10);
}

function buildCargoCatalog(cargos, placements) {
  const placementColors = new Map();
  placements.forEach((item) => {
    if (item.cargoId && item.color && !placementColors.has(item.cargoId)) placementColors.set(item.cargoId, item.color);
  });
  return cargos.map((cargo, index) => ({
    ...cargo,
    displayName: cargoLabel(cargo),
    no: index + 1,
    color: cargo.color || placementColors.get(cargo.id) || REPORT_COLORS[index % REPORT_COLORS.length]
  }));
}

function enrichPlacements(placements, catalog) {
  const byId = new Map(catalog.map((cargo) => [cargo.id, cargo]));
  const byName = new Map(catalog.map((cargo) => [cargo.name, cargo]));
  const byDisplayName = new Map(catalog.map((cargo) => [cargo.displayName, cargo]));
  return placements.map((item, index) => {
    const cargo = byId.get(item.cargoId) || byDisplayName.get(item.name) || byName.get(item.name);
    return {
      ...item,
      cargoNo: cargo?.no || index + 1,
      color: item.color || cargo?.color || REPORT_COLORS[index % REPORT_COLORS.length]
    };
  });
}

function buildLayers(placements) {
  const map = new Map();
  placements.forEach((item) => {
    const z = roundLayer(item.zCm);
    if (!map.has(z)) map.set(z, []);
    map.get(z).push(item);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([z, items]) => ({
      z,
      top: Math.max(...items.map((item) => Number(item.zCm || 0) + Number(item.heightCm || 0))),
      items
    }));
}

function countByCargo(items, ctx = null) {
  const map = new Map();
  items.forEach((item) => {
    const faceCode = bottomFaceCode(item);
    const key = `${item.cargoNo}-${faceCode}`;
    if (!map.has(key)) {
      map.set(key, {
        cargoNo: item.cargoNo,
        faceCode,
        label: reportCargoLabel(item),
        name: item.name,
        color: item.color,
        count: 0,
        nonStack: Boolean(item.nonStack),
        bottomFaces: new Set(),
        orientationDetails: new Set(),
        stackMethods: new Set()
      });
    }
    const current = map.get(key);
    current.count += placementQuantity(item);
    current.nonStack = current.nonStack || Boolean(item.nonStack);
    current.bottomFaces.add(item.bottomFace || "长×宽");
    current.orientationDetails.add(orientationDetail(item, ctx));
    current.stackMethods.add(stackMethod(item));
  });
  return [...map.values()]
    .map((item) => ({
      ...item,
      bottomFaces: [...item.bottomFaces],
      orientationDetails: [...item.orientationDetails],
      stackMethods: [...item.stackMethods]
    }))
    .sort((a, b) => a.cargoNo - b.cargoNo || a.faceCode.localeCompare(b.faceCode));
}

function orientationDetail(item, ctx = null) {
  const faceCode = bottomFaceCode(item);
  const [faceAxisA, faceAxisB] = faceAxisNames(faceCode);
  const details = [
    reportText(ctx, "report.faceBottomLine", { face: faceCode, name: bottomFaceNameLocalized(ctx, faceCode) }),
    reportText(ctx, "report.faceSizeLine", {
      a: faceAxisA,
      aValue: formatNum(axisBaseCm(item, faceAxisA), 0),
      b: faceAxisB,
      bValue: formatNum(axisBaseCm(item, faceAxisB), 0)
    }),
    reportText(ctx, "report.faceAxisLine", {
      xAxis: item.xAxis || AXIS_LENGTH,
      xValue: formatNum(item.xAxisBaseCm, 0),
      yAxis: item.yAxis || AXIS_WIDTH,
      yValue: formatNum(item.yAxisBaseCm, 0),
      zAxis: item.zAxis || item.heightAxis || AXIS_HEIGHT,
      zValue: formatNum(item.zAxisBaseCm, 0)
    })
  ];
  if (placementQuantity(item) > 1) details.push(`组合${placementQuantity(item)}件`);
  return details.join(" / ");
}

function reportCargoLabel(item) {
  return `#${item.cargoNo}${bottomFaceCode(item)}`;
}

function bottomFaceCode(item) {
  const axes = [item.xAxis || "长", item.yAxis || "宽"].join("");
  if (axes.includes("长") && axes.includes("宽")) return "A";
  if (axes.includes("宽") && axes.includes("高")) return "B";
  if (axes.includes("长") && axes.includes("高")) return "C";
  return "A";
}

function bottomFaceName(code) {
  return { A: "长×宽", B: "宽×高", C: "长×高" }[code] || "长×宽";
}

function bottomFaceNameLocalized(ctx, code) {
  const safeCode = ["A", "B", "C"].includes(code) ? code : "A";
  return reportText(ctx, `report.faceName${safeCode}`);
}

const AXIS_LENGTH = "\u957f";
const AXIS_WIDTH = "\u5bbd";
const AXIS_HEIGHT = "\u9ad8";

function faceAxisNames(code) {
  if (code === "B") return [AXIS_WIDTH, AXIS_HEIGHT];
  if (code === "C") return [AXIS_LENGTH, AXIS_HEIGHT];
  return [AXIS_LENGTH, AXIS_WIDTH];
}

function axisBaseCm(item, axis) {
  if (axis === item.xAxis) return item.xAxisBaseCm;
  if (axis === item.yAxis) return item.yAxisBaseCm;
  if (axis === item.zAxis || axis === item.heightAxis) return item.zAxisBaseCm;
  if (axis === AXIS_LENGTH) return item.baseLengthCm || item.rawLengthCm || item.lengthCm;
  if (axis === AXIS_WIDTH) return item.baseWidthCm || item.rawWidthCm || item.widthCm;
  if (axis === AXIS_HEIGHT) return item.baseHeightCm || item.rawHeightCm || item.heightCm;
  return 0;
}

function stackMethod(item) {
  if (item.nonStack && item.keepUpright) {
    return "\u5806\u653e\u65b9\u5f0f\uff1a\u4e0d\u53ef\u91cd\u538b\u4e14\u5fc5\u987b\u4fdd\u6301\u671d\u4e0a\uff1b\u672c\u4ef6\u4e0d\u4f5c\u4e3a\u4e0a\u5c42\u652f\u6491\uff0c\u4e0d\u5141\u8bb8\u4fa7\u653e\u6216\u5012\u7f6e\u3002";
  }
  if (item.nonStack) return "堆放方式：不可重压；可放在箱底或可承重货物顶面，本件不作为上层支撑。";
  if (item.keepUpright) {
    return "\u5806\u653e\u65b9\u5f0f\uff1a\u4fdd\u6301\u671d\u4e0a\uff1b\u53ea\u5141\u8bb8\u5728\u6c34\u5e73\u9762\u5185\u8c03\u6362\u957f\u5bbd\u65b9\u5411\uff0c\u4e0d\u5141\u8bb8\u4fa7\u653e\u6216\u5012\u7f6e\u3002";
  }
  if (Number(item.zCm || 0) <= 0.1) return "堆放方式：箱底铺放；可承重，可作为上层货物支撑面。";
  return "堆放方式：上层堆放；下方可承重重叠面积需达到 98.5%，本件可继续承重。";
}

function placementQuantity(item) {
  return Math.max(1, Math.floor(Number(item?.groupQuantity || 1)));
}

function sumPlacementQuantity(placements) {
  return placements.reduce((sum, item) => sum + placementQuantity(item), 0);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const translated = canvasText(ctx, text);
  const chars = tokenizeWrapText(translated);
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(lines === maxLines - 1 ? `${line}...` : line, x, y + lines * lineHeight);
      lines += 1;
      line = char;
      if (lines >= maxLines) return;
    } else {
      line = testLine;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

async function createPdfFromCanvas(sourceCanvas) {
  return createPdfFromCanvases([sourceCanvas]);
}

async function createPdfFromCanvases(sourceCanvases) {
  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;
  const sourceWidth = sourceCanvases[0]?.width || PAGE_WIDTH;
  const sliceHeight = Math.floor(sourceWidth * (pageHeightPt / pageWidthPt));
  const pages = [];
  for (const sourceCanvas of sourceCanvases) {
    for (let y = 0; y < sourceCanvas.height; y += sliceHeight) {
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = sourceWidth;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      const drawHeight = Math.min(sliceHeight, sourceCanvas.height - y);
      ctx.drawImage(sourceCanvas, 0, y, sourceCanvas.width, drawHeight, 0, 0, sourceWidth, drawHeight);
      pages.push(base64ToBytes(sliceCanvas.toDataURL("image/jpeg", 0.92).split(",")[1]));
    }
  }
  return buildPdf(pages, sourceWidth, sliceHeight, pageWidthPt, pageHeightPt);
}

function buildPdf(images, imageWidth, imageHeight, pageWidthPt, pageHeightPt) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;
  const addText = (text) => addBytes(encoder.encode(text));
  const addBytes = (bytes) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const objectCount = 2 + images.length * 3;
  const pageObjectIds = images.map((_, index) => 3 + index * 3);
  const imageObjectIds = images.map((_, index) => 4 + index * 3);
  const contentObjectIds = images.map((_, index) => 5 + index * 3);

  addText("%PDF-1.4\n");
  writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  writeObject(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`);

  images.forEach((imageBytes, index) => {
    const pageId = pageObjectIds[index];
    const imageId = imageObjectIds[index];
    const contentId = contentObjectIds[index];
    writeObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    writeStreamObject(imageId, `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`, imageBytes);
    const content = `q ${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm /Im${index + 1} Do Q`;
    writeObject(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  const xrefStart = length;
  addText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    addText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });

  function writeObject(id, body) {
    offsets[id] = length;
    addText(`${id} 0 obj\n${body}\nendobj\n`);
  }

  function writeStreamObject(id, dictionary, streamBytes) {
    offsets[id] = length;
    addText(`${id} 0 obj\n${dictionary}\nstream\n`);
    addBytes(streamBytes);
    addText("\nendstream\nendobj\n");
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("导出图片失败。"));
    }, type, quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function reportFileBase(options) {
  const generatedAt = options.generatedAt || new Date();
  const locale = reportLocale(options?.locale);
  const containerName = translateLegacyText(options?.container?.name || "Container", locale);
  return `${reportFileStem(options, generatedAt)}-${safeFileName(containerName)}-Hold-${pad2(options.boxIndex || 1)}`;
}

function multiReportFileBase(options, generatedAt = new Date()) {
  return `${reportFileStem(options, generatedAt)}-All-Holds`;
}

function reportFileStem(options, generatedAt = new Date()) {
  const user = safeFileName(options?.username || options?.userName || "USER") || "USER";
  const taskId = safeFileName(options?.taskId || "task") || "task";
  return `${user}-${timestampForFile(generatedAt)}-${taskId}`;
}

function reportLocale(locale) {
  return String(locale || "").toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
}

function reportText(ctx, key, params) {
  return translateUiText(key, ctx?.__cargoPlannerLocale || "zh-CN", params);
}

async function createZipBlob(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(data);
    const localHeader = zipLocalHeader(nameBytes, crc, data.length);
    localParts.push(localHeader, data);
    centralParts.push(zipCentralHeader(nameBytes, crc, data.length, offset));
    offset += localHeader.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipEndRecord(files.length, centralSize, offset);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function zipLocalHeader(nameBytes, crc, size) {
  const bytes = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  return bytes;
}

function zipCentralHeader(nameBytes, crc, size, offset) {
  const bytes = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, offset, true);
  bytes.set(nameBytes, 46);
  return bytes;
}

function zipEndRecord(fileCount, centralSize, centralOffset) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return bytes;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function drawCard(ctx, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, height, CARD_RADIUS);
  ctx.fill();
  ctx.strokeStyle = "#d3deea";
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function inset(rect, left, top, right, bottom) {
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: rect.width - left - right,
    height: rect.height - top - bottom
  };
}

function centerText(ctx, text, x, y) {
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

function fillFittedText(ctx, text, x, y, maxWidth, minFontSize = 10) {
  const originalFont = ctx.font;
  const originalSize = fontSizeOf(originalFont);
  let size = originalSize;
  while (size > minFontSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = withFontSize(originalFont, size);
  }
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
  } else {
    drawEllipsizedText(ctx, text, x, y, maxWidth);
  }
  ctx.font = originalFont;
}

function drawEllipsizedText(ctx, text, x, y, maxWidth) {
  const source = canvasText(ctx, text);
  const ellipsis = "...";
  let output = source;
  while (output && ctx.measureText(`${output}${ellipsis}`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(output ? `${output}${ellipsis}` : ellipsis, x, y);
}

function fontSizeOf(font) {
  const match = String(font || "").match(/(\d+(?:\.\d+)?)px/);
  return Number(match?.[1] || 14);
}

function withFontSize(font, size) {
  return String(font || "14px Arial").replace(/\d+(?:\.\d+)?px/, `${size}px`);
}

function canvasText(ctx, text) {
  return String(ctx.__cargoPlannerTranslateText ? ctx.__cargoPlannerTranslateText(text) : text || "");
}

function tokenizeWrapText(text) {
  const source = String(text || "");
  if (/[\u3400-\u9fff]/.test(source)) return [...source];
  const tokens = source.split(/(\s+)/).filter(Boolean);
  return tokens.length ? tokens : [...source];
}

function drawLine(ctx, from, to) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function fillPolygon(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fill();
}

function strokePolygon(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
}

function averagePoint(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function hexToRgb(hex) {
  const raw = String(hex || "#4e8fd0").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((x) => x + x).join("") : raw.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function formatNum(value, digits = 1) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSigned(value, digits = 1) {
  const number = Number(value || 0);
  const text = Math.abs(number).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  return `${number >= 0 ? "+" : "-"}${text}`;
}

function formatWeight(value) {
  const weight = Number(value || 0);
  if (weight >= 1000) return `${formatNum(weight / 1000, 2)} t`;
  return `${formatNum(weight, 0)} kg`;
}

function roundLayer(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function safeFileName(value) {
  return String(value || "箱型").replace(/[\\/:*?"<>|]/g, "_");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function timestampForFile(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("") + "-" + [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join("");
}
