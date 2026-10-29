import { buildPackingReportModel, reportNumber } from "./packingReportModel.js";
import { packingReportText } from "../i18n/packingReportDetails.js";

const WIDTH = 1800;
const HEIGHT = 2480;
const MARGIN = 78;
const CONTENT = WIDTH - MARGIN * 2;
const FALLBACK_COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48"];
const chunks = (items, count) =>
  Array.from({ length: Math.ceil(items.length / count) }, (_, index) =>
    items.slice(index * count, (index + 1) * count)
  );
const value = (number, digits = 1, suffix = "") =>
  reportNumber(number) === null
    ? "—"
    : `${Number(number).toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`;
const dimensions = (numbers) => numbers.map((number) => value(number)).join(" × ");
const coordinates = (numbers) => numbers.map((number) => value(number)).join(" / ");

export function renderDetailedPackingPages(options, boxes, drawIso) {
  const text = packingReportText(options.locale);
  const model = buildPackingReportModel(options, boxes);
  const pages = [];
  const overviewGroups = chunks(model.boxes, 13);
  overviewGroups.forEach((group, index) => {
    const { canvas, ctx } = page(
      text.overview,
      options,
      text,
      index > 0 ? text.continuation : text.subtitle
    );
    metricGrid(ctx, 250, [
      [text.boxes, value(model.boxes.length, 0)],
      [text.pieces, value(model.quantity, 0)],
      [text.volume, value(model.volumeM3, 3, " m³")],
      [text.weight, value(model.weightKg, 1, " kg")],
      [
        text.remaining,
        model.requestedQuantity === null
          ? "—"
          : value(Math.max(0, model.requestedQuantity - model.quantity), 0)
      ]
    ]);
    table(
      ctx,
      452,
      [100, 610, 150, 210, 210, 264],
      [text.hold, text.equipment, text.qty, text.netVolume, text.totalWeight, text.utilization],
      group.map((box) => [
        value(box.index, 0),
        `${box.container.name || "—"}\n${dimensions(box.dimensions)}`,
        value(box.quantity, 0),
        value(box.volumeM3, 3),
        value(box.weightKg, 1),
        `${value(box.fillPercent, 1, "%")} / ${value(box.weightPercent, 1, "%")}`
      ]),
      112
    );
    paragraph(ctx, text.orderNote, MARGIN, 2180, CONTENT, 30, "#52657b");
    paragraph(ctx, text.inspect, MARGIN, 2280, CONTENT, 30, "#52657b");
    pages.push(canvas);
  });

  for (const box of model.boxes) {
    const subtitle = `${text.hold} ${box.index} · ${box.container.name || "—"} · ${dimensions(box.dimensions)} cm`;
    const { canvas, ctx } = page(text.details, options, text, subtitle);
    metricGrid(ctx, 245, [
      [text.pieces, value(box.quantity, 0)],
      [text.volume, value(box.volumeM3, 3, " m³")],
      [text.weight, value(box.weightKg, 1, " kg")],
      [text.payload, value(box.payloadKg, 0, " kg")],
      [text.allowance, value(box.remainingPayloadKg, 1, " kg")]
    ]);
    drawIso(
      ctx,
      { x: MARGIN, y: 435, width: CONTENT, height: 1010 },
      box.container,
      box.rows.map((row) => ({
        ...row,
        color: row.color || FALLBACK_COLORS[((row.cargoNo || 1) - 1) % FALLBACK_COLORS.length]
      })),
      text.visualization,
      text.visualNote
    );
    const center = box.balance?.valid ? box.balance.center : null;
    const balance = box.balance;
    const validation = box.balanceValidation;
    section(ctx, text.balanceCheck, 1495);
    metricGrid(ctx, 1550, [
      [text.center, center ? `${coordinates([center.xCm, center.yCm, center.zCm])} cm` : "—"],
      [text.balanceCheck, text[validation?.severity] || text.unknown],
      [
        text.frontRear,
        balance?.valid
          ? `${value(balance.loads.frontPercent)} / ${value(balance.loads.rearPercent)} %`
          : "—"
      ],
      [
        text.leftRight,
        balance?.valid
          ? `${value(balance.loads.leftPercent)} / ${value(balance.loads.rightPercent)} %`
          : "—"
      ]
    ]);
    const limits = validation?.limits;
    paragraph(
      ctx,
      `${text.limits}: ${text.frontMax} ${value(limits?.frontMaxPercent, 1, "%")} · ${text.imbalanceMax} ${value(limits?.redPercent, 1, "%")} · ${text.lateralMax} ${value(limits?.lateralOffsetLimitCm, 1, " cm")}`,
      MARGIN,
      1775,
      CONTENT,
      31
    );
    let nextY = 1880;
    if (box.hasMissingWeight)
      nextY = paragraph(ctx, text.weightMissing, MARGIN, nextY, CONTENT, 32, "#a16207") + 28;
    if (validation?.message)
      nextY = paragraph(ctx, validation.message, MARGIN, nextY, CONTENT, 31, "#52657b") + 28;
    paragraph(ctx, text.inspect, MARGIN, nextY, CONTENT, 31, "#52657b");
    paragraph(
      ctx,
      `${text.strategy}: ${box.strategyName || box.strategyId || "—"}`,
      MARGIN,
      2250,
      CONTENT,
      30,
      "#52657b"
    );
    paragraph(ctx, text.extra, MARGIN, 2330, CONTENT, 30, "#52657b");
    pages.push(canvas);

    const inventoryWidths = [100, 465, 330, 140, 205, 204, 100];
    const inventoryRows = box.inventory.map((row) => [
      row.cargoNo ? `#${row.cargoNo}` : "—",
      row.name || "—",
      dimensions(row.sourceDimensions),
      value(row.quantity, 0),
      value(row.weightKg, 1),
      value(row.volumeM3, 3),
      value(row.placementCount, 0)
    ]);
    paginateTableRows(inventoryWidths, inventoryRows, 1940).forEach((items, index) => {
      const result = page(
        text.inventory,
        options,
        text,
        `${subtitle}${index ? ` · ${text.continuation}` : ""}`
      );
      table(
        result.ctx,
        280,
        inventoryWidths,
        ["#", text.cargo, text.sourceSize, text.qty, text.totalWeight, text.netVolume, "P"],
        items,
        112
      );
      paragraph(result.ctx, text.volumeNote, MARGIN, 2310, CONTENT, 30, "#52657b");
      pages.push(result.canvas);
    });
    const placementWidths = [135, 305, 90, 150, 260, 245, 174, 105, 180];
    const placementRows = box.rows.map((row) => [
      row.reference,
      `${row.cargoNo ? `#${row.cargoNo}${row.face || ""} ` : ""}${row.name || "—"}`,
      value(row.quantity, 0),
      value(row.weightKg, 1),
      dimensions(row.placedDimensions),
      coordinates(row.coordinates),
      row.axes.map((axis) => axis || "—").join(" / "),
      value(row.loadingOrder, 0),
      [row.keepUpright ? text.upright : "", row.nonStack ? text.nonstack : ""]
        .filter(Boolean)
        .join("\n") || "—"
    ]);
    const placementPages = paginateTableRows(placementWidths, placementRows, 1795);
    placementPages.forEach((items, index) => {
      const result = page(
        text.placements,
        options,
        text,
        `${subtitle} · ${index + 1}/${placementPages.length}`
      );
      paragraph(result.ctx, text.manifestNote, MARGIN, 244, CONTENT, 29, "#52657b");
      table(
        result.ctx,
        350,
        placementWidths,
        [
          text.reference,
          text.cargo,
          text.qty,
          text.totalWeight,
          text.placedSize,
          text.coordinates,
          text.orientation,
          text.order,
          text.restrictions
        ],
        items,
        112
      );
      paragraph(result.ctx, text.faceLegend, MARGIN, 2270, CONTENT, 29, "#52657b");
      paragraph(result.ctx, text.orderNote, MARGIN, 2340, CONTENT, 29, "#52657b");
      pages.push(result.canvas);
    });
  }
  const result = page(text.notes, options, text, text.subtitle);
  let y = 285;
  for (const note of [
    text.axisNote,
    text.orderNote,
    text.volumeNote,
    text.envelopeNote,
    text.weightNote,
    text.emptyNote,
    text.inspect
  ]) {
    result.ctx.fillStyle = "#2a9d8f";
    result.ctx.fillRect(MARGIN, y - 20, 7, 29);
    y = paragraph(result.ctx, note, MARGIN + 30, y, CONTENT - 30, 42) + 75;
  }
  if (
    model.boxes.some(
      (box) =>
        box.container.ignoreHeightLimit ||
        /flat|\bfr\b/i.test(`${box.container.id} ${box.container.name}`)
    )
  ) {
    y = paragraph(result.ctx, text.flatNote, MARGIN + 30, y, CONTENT - 30, 42, "#a16207") + 65;
  }
  const notes = String(options.notes || "").trim();
  if (notes) {
    // User notes can span pages and must not be silently truncated.
    const noteLines = wrapLines(result.ctx, notes, CONTENT);
    const firstCount = Math.max(0, Math.floor((2280 - y - 60) / 38));
    section(result.ctx, text.notesLabel, y);
    noteLines
      .slice(0, firstCount)
      .forEach((line, index) => textLine(result.ctx, line, MARGIN, y + 60 + index * 38, 27));
    pages.push(result.canvas);
    chunks(noteLines.slice(firstCount), 50).forEach((lines) => {
      const continuation = page(text.notesLabel, options, text, text.continuation);
      lines.forEach((line, index) =>
        textLine(continuation.ctx, line, MARGIN, 290 + index * 38, 27)
      );
      pages.push(continuation.canvas);
    });
  } else pages.push(result.canvas);
  return pages;
}

function page(title, options, text, subtitle) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.__reportPageBreaks = [0, HEIGHT];
  canvas.__reportLocale = String(options.locale || "").startsWith("en") ? "en-US" : "zh-CN";
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#163c55";
  ctx.fillRect(0, 0, WIDTH, 14);
  textLine(ctx, "LOGISTICSPLUSCN · PACKING PLAN", MARGIN, 80, 24, "#2a9d8f", 700);
  textLine(ctx, title, MARGIN, 145, 46, "#132b40", 800);
  textLine(ctx, subtitle, MARGIN, 197, 25, "#52657b");
  textLine(ctx, `${text.task}: ${options.taskId || "—"}`, WIDTH - 650, 68, 23, "#52657b");
  textLine(
    ctx,
    `${text.generated}: ${(options.generatedAt || new Date()).toLocaleString(canvas.__reportLocale)}`,
    WIDTH - 650,
    108,
    22,
    "#52657b"
  );
  if (options.example) textLine(ctx, text.example, MARGIN, 2416, 22, "#a16207", 700);
  else textLine(ctx, text.brand, MARGIN, 2416, 21, "#52657b");
  return { canvas, ctx };
}

function metricGrid(ctx, y, metrics) {
  const gap = 18;
  const width = (CONTENT - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach(([label, number], index) => {
    const x = MARGIN + index * (width + gap);
    ctx.fillStyle = "#f1f6f8";
    ctx.fillRect(x, y, width, 148);
    textLine(ctx, label, x + 18, y + 40, 24, "#52657b");
    fitLine(ctx, number, x + 18, y + 102, width - 36, 32, "#163c55");
  });
}

function table(ctx, y, widths, headings, rows, rowHeight) {
  const scale = CONTENT / widths.reduce((sum, width) => sum + width, 0);
  const columns = widths.map((width) => width * scale);
  const headerHeight = 90;
  ctx.fillStyle = "#163c55";
  ctx.fillRect(MARGIN, y, CONTENT, headerHeight);
  let x = MARGIN;
  headings.forEach((heading, index) => {
    const lines = wrapLines(ctx, heading, columns[index] - 20, 24);
    lines
      .slice(0, 2)
      .forEach((line, lineIndex) =>
        textLine(ctx, line, x + 12, y + 35 + lineIndex * 29, 24, "#ffffff", 700)
      );
    x += columns[index];
  });
  let top = y + headerHeight;
  rows.forEach((row, rowIndex) => {
    const actualHeight = row.height || rowHeight;
    ctx.fillStyle = rowIndex % 2 === 0 ? "#f1f6f8" : "#ffffff";
    ctx.fillRect(MARGIN, top, CONTENT, actualHeight);
    x = MARGIN;
    (row.cells || row).forEach((cell, columnIndex) => {
      const lines = row.cells
        ? cell
        : String(cell)
            .split("\n")
            .flatMap((part) => wrapLines(ctx, part, columns[columnIndex] - 22, 24));
      lines.forEach((line, lineIndex) =>
        textLine(
          ctx,
          line,
          x + 12,
          top + 32 + lineIndex * 29,
          24,
          "#163c55",
          columnIndex === 0 ? 700 : 400
        )
      );
      x += columns[columnIndex];
    });
    top += actualHeight;
  });
}

function paginateTableRows(widths, rows, maxHeight) {
  const ctx = document.createElement("canvas").getContext("2d");
  const scale = CONTENT / widths.reduce((sum, width) => sum + width, 0);
  const maxLines = Math.max(1, Math.floor((maxHeight - 58) / 29) + 1);
  const prepared = rows.flatMap((row) => {
    const cells = row.map((cell, index) =>
      String(cell)
        .split("\n")
        .flatMap((part) => wrapLines(ctx, part, widths[index] * scale - 22, 24))
    );
    const lineCount = Math.max(...cells.map((cell) => cell.length));
    return Array.from({ length: Math.ceil(lineCount / maxLines) }, (_, index) => {
      const part = cells.map((cell, columnIndex) =>
        index && columnIndex === 0 ? cell : cell.slice(index * maxLines, (index + 1) * maxLines)
      );
      return {
        cells: part,
        height: Math.max(112, 58 + (Math.max(...part.map((cell) => cell.length)) - 1) * 29)
      };
    });
  });
  const pages = [];
  let current = [];
  let usedHeight = 0;
  for (const row of prepared) {
    if (current.length && usedHeight + row.height > maxHeight) {
      pages.push(current);
      current = [];
      usedHeight = 0;
    }
    current.push(row);
    usedHeight += row.height;
  }
  if (current.length) pages.push(current);
  return pages;
}

function section(ctx, title, y) {
  textLine(ctx, title, MARGIN, y, 31, "#163c55", 700);
}

function textLine(ctx, content, x, y, size = 28, color = "#163c55", weight = 400) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Microsoft YaHei, Arial`;
  ctx.fillText(String(content), x, y);
}

function fitLine(ctx, content, x, y, maxWidth, size, color) {
  ctx.font = `700 ${size}px Microsoft YaHei, Arial`;
  while (ctx.measureText(String(content)).width > maxWidth && size > 21) {
    size -= 1;
    ctx.font = `700 ${size}px Microsoft YaHei, Arial`;
  }
  textLine(ctx, content, x, y, size, color, 700);
}

function wrapLines(ctx, content, width, fontSize = 27) {
  ctx.font = `400 ${fontSize}px Microsoft YaHei, Arial`;
  const lines = [];
  let current = "";
  for (const char of String(content)) {
    if (char === "\n" || (current && ctx.measureText(current + char).width > width)) {
      lines.push(current);
      current = char === "\n" ? "" : char;
    } else current += char;
  }
  if (current) lines.push(current);
  return lines;
}

function paragraph(ctx, content, x, y, width, lineHeight = 36, color = "#163c55") {
  const lines = wrapLines(ctx, content, width);
  lines.forEach((line, index) => textLine(ctx, line, x, y + index * lineHeight, 27, color));
  return y + lines.length * lineHeight;
}
