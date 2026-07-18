import * as XLSX from "xlsx";
import { normalizeCargoConstraints } from "../utils/cargoConstraints.js";
import { assignCargoModels } from "../utils/cargoModels.js";

export { assignCargoModels } from "../utils/cargoModels.js";

const STANDARD_FIELDS = [
  { key: "name", label: "货物名称", required: true },
  { key: "model", label: "型号/规格", required: false },
  { key: "lengthCm", label: "长度 cm", required: true },
  { key: "widthCm", label: "宽度 cm", required: true },
  { key: "heightCm", label: "高度 cm", required: true },
  { key: "quantity", label: "数量", required: true },
  { key: "weightKg", label: "单件重量 kg", required: true },
  { key: "totalWeightKg", label: "总重量 kg", required: false },
  { key: "type", label: "货物类型", required: false },
  { key: "nonStack", label: "\u4e0d\u53ef\u91cd\u538b", required: false },
  { key: "keepUpright", label: "\u4fdd\u6301\u671d\u4e0a", required: false },
  { key: "color", label: "颜色", required: false },
  { key: "id", label: "货物 ID/SKU", required: false },
  { key: "remark", label: "备注", required: false },
  { key: "dimensionText", label: "合并尺寸", required: false }
];

const FIELD_ALIASES = {
  name: ["name", "cargo", "cargoName", "goods", "goodsName", "product", "货物", "货物名称", "货名", "名称", "品名", "产品名称", "箱名", "物品名称"],
  model: ["model", "specModel", "variant", "型号", "规格型号", "产品型号", "货物型号", "型号规格"],
  lengthCm: ["lengthCm", "length", "l", "长", "长度", "外长", "长cm", "长度cm", "长厘米", "长mm", "长度mm", "长毫米", "长m", "长度m"],
  widthCm: ["widthCm", "width", "w", "宽", "宽度", "外宽", "宽cm", "宽度cm", "宽厘米", "宽mm", "宽度mm", "宽毫米", "宽m", "宽度m"],
  heightCm: ["heightCm", "height", "h", "高", "高度", "外高", "高cm", "高度cm", "高厘米", "高mm", "高度mm", "高毫米", "高m", "高度m"],
  quantity: ["quantity", "qty", "count", "num", "pcs", "palletqty", "pallets", "skids", "数量", "件数", "箱数", "个数", "数量pcs", "总件数", "托盘数", "托数", "栈板数"],
  weightKg: ["weightKg", "unitWeight", "unitWeightKg", "weight", "单重", "单件重量", "每件重量", "重量kg", "单重kg", "单件重量kg", "毛重kg", "净重kg"],
  totalWeightKg: ["totalWeight", "totalWeightKg", "grossWeight", "总重", "总重量", "总毛重", "毛重", "总净重", "总重量kg"],
  type: ["type", "cargoType", "rule", "货物类型", "类型", "规则", "摆放规则", "堆叠规则", "属性"],
  nonStack: ["nonStack", "nonStackable", "\u4e0d\u53ef\u91cd\u538b", "\u4e0d\u80fd\u91cd\u538b", "\u7981\u6b62\u91cd\u538b", "\u6613\u788e", "\u627f\u538b\u9650\u5236", "\u5806\u53e0\u9650\u5236", "\u5806\u7801\u9650\u5236"],
  keepUpright: ["keepUpright", "upright", "\u4fdd\u6301\u671d\u4e0a", "\u671d\u4e0a", "\u4e0d\u53ef\u5012\u7f6e", "\u65b9\u5411\u9650\u5236", "\u671d\u5411\u8981\u6c42", "\u65b9\u5411\u8981\u6c42", "\u6446\u653e\u65b9\u5411"],
  color: ["color", "颜色", "色值", "显示颜色"],
  id: ["id", "sku", "code", "cargoId", "goodsId", "productId", "货物ID", "货物编号", "货号", "编号", "物料编码", "产品编号", "条码"],
  remark: ["remark", "remarks", "note", "notes", "备注", "说明", "特殊要求", "装箱要求"],
  dimensionText: ["dimension", "dimensions", "size", "palletsize", "skidsize", "packagesize", "规格", "尺寸", "外尺寸", "长宽高", "尺寸cm", "尺寸mm", "规格尺寸", "托盘尺寸", "托盘尺寸cm", "栈板尺寸", "包装尺寸"]
};

const TYPE_ALIASES = [
  { type: "nonstack", words: ["不可重压", "不能重压", "勿压", "易碎", "fragile", "nonstack", "non-stack", "no stack"] },
  { type: "pallet", words: ["托盘", "木箱", "栈板", "pallet", "wooden", "wood"] },
  { type: "upright", words: ["向上", "朝上", "不可倒置", "保持朝上", "upright", "this side up"] },
  { type: "normal", words: ["普通", "可堆叠", "normal", "standard"] }
];

export const importFields = STANDARD_FIELDS;

export function downloadTemplateWorkbook(rows) {
  const headers = ["name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "nonStack", "keepUpright", "color", "remark"];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "cargo-template");
  XLSX.writeFile(workbook, "cargo-import-template.xlsx");
}

export async function readWorkbook(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: true
    }).map((row) => trimTrailingEmptyCells((row || []).map(cleanCell)));
    const mergeCells = buildMergeCellMetadata(worksheet?.["!merges"] || [], rawRows);
    const formulaCells = buildFormulaCellMetadata(worksheet);
    const { headerRowIndex, headers, bodyRows } = extractTable(rawRows);
    return {
      name,
      headerRowIndex,
      headers,
      rows: bodyRows,
      mapping: guessMapping(headers),
      rawRows,
      merges: mergeCells.map((merge) => merge.range),
      mergeCells,
      formulaCells
    };
  });
  return { fileName: file.name, sheets };
}

export function formatWorkbookForRecognition(workbook, options = {}) {
  const maxRows = Math.max(20, Number(options.maxRows || 240));
  const maxColumns = Math.max(12, Number(options.maxColumns || 80));
  const maxMergeRanges = Math.max(20, Number(options.maxMergeRanges || 200));
  const maxCellChars = Math.max(200, Number(options.maxCellChars || 1_000));
  const lines = [
    "EXCEL_FORMATTED_TABLE_FOR_AGENT",
    `FILE: ${cleanCell(workbook?.fileName || options.fileName || "")}`,
    "TASK: Extract final handled shipping units for container packing. Prefer final pallet/carton/crate package units over loose product rows.",
    "HIERARCHY_RULE: Infer product -> carton -> pallet/crate relationships semantically from any headers, values, sheet/file names, notes, merged cells, and neighboring rows; customer header names are not fixed.",
    "PALLET_RULE: When the source describes loaded pallets, algorithm quantity means pallet count. Carton count, carton dimensions, cartons per pallet, layers, and cartons per layer are innerCargo only.",
    "PALLET_DIMENSION_RULE: Use pallet L/W/H only when the loaded-pallet outer dimensions are explicitly present. If absent, never substitute carton dimensions or infer dimensions from volume/layers; return a pallet candidate with zero dimensions and mark palletDimensionsMissing for user input.",
    "WEIGHT_RULE: If a final pallet/wooden package has pallet tare/wood-package weight and contains product rows, calculate unit weight as (pallet tare total + contained product gross total) / pallet quantity. If a final gross-weight column clearly already includes pallet plus cargo, do not double count; explain the basis in remark/packageInfo.",
    "STRUCTURE_RULE: In sheets with left product/carton details and right pallet/final-package columns, output the right-side final pallet/package rows as algorithm cargo. Store left-side loose/carton details only in packageInfo.innerCargo or remark."
  ];
  let emittedWorkbookRows = 0;

  (workbook?.sheets || []).forEach((sheet, sheetIndex) => {
    lines.push("");
    lines.push(`SHEET ${sheetIndex + 1}: ${cleanCell(sheet.name) || "Sheet" + (sheetIndex + 1)}`);
    lines.push(`DETECTED_HEADER_ROW: ${Number(sheet.headerRowIndex || 0) + 1}`);
    if (Array.isArray(sheet.merges) && sheet.merges.length) {
      lines.push(`MERGED_RANGES: ${sheet.merges.slice(0, maxMergeRanges).join(", ")}`);
      if (sheet.merges.length > maxMergeRanges) {
        lines.push(`MERGED_RANGES_TRUNCATED: emitted ${maxMergeRanges} of ${sheet.merges.length}.`);
      }
    }
    const mergeValueLines = formatMergedCellValueLines(sheet, maxMergeRanges, maxCellChars);
    mergeValueLines.forEach((line) => lines.push(line));
    if (Array.isArray(sheet.formulaCells) && sheet.formulaCells.length) {
      lines.push(`FORMULA_CELLS: ${sheet.formulaCells.slice(0, maxMergeRanges).map((cell) => `${cell.address}=${quoteForRecognition(`=${cell.formula}`, maxCellChars)} -> ${quoteForRecognition(cell.value, maxCellChars)}`).join(" | ")}`);
      if (sheet.formulaCells.length > maxMergeRanges) {
        lines.push(`FORMULA_CELLS_TRUNCATED: emitted ${maxMergeRanges} of ${sheet.formulaCells.length}.`);
      }
    }
    const finalHandlingUnitCandidates = detectFinalHandlingUnitCandidates(sheet);
    if (finalHandlingUnitCandidates.length) {
      lines.push("FINAL_HANDLING_UNIT_CANDIDATES: High-confidence source-derived outer packages. These final pallets/crates override aligned loose-product or inner-carton rows.");
      finalHandlingUnitCandidates.forEach((candidate, candidateIndex) => {
        lines.push(`FINAL_PACKAGE_CANDIDATE ${candidateIndex + 1}: ${JSON.stringify(candidateForRecognition(candidate))}`);
      });
    }
    lines.push("ROWS_WITH_EXCEL_COORDINATES:");
    const rows = Array.isArray(sheet.rawRows) && sheet.rawRows.length
      ? sheet.rawRows
      : [[...(sheet.headers || [])], ...(sheet.rows || [])];
    let emitted = 0;
    let truncatedCellCount = 0;
    let truncatedColumnRowCount = 0;
    rows.forEach((row, rowIndex) => {
      if (emittedWorkbookRows >= maxRows) return;
      if ((row || []).slice(maxColumns).some((value) => cleanCell(value) !== "")) {
        truncatedColumnRowCount += 1;
      }
      const cells = (row || [])
        .slice(0, maxColumns)
        .map((value, columnIndex) => {
          const cleaned = cleanCell(value);
          if (cleaned.length > maxCellChars) truncatedCellCount += 1;
          return { value: cleaned, columnIndex };
        })
        .filter((cell) => cell.value !== "");
      if (!cells.length) return;
      emitted += 1;
      emittedWorkbookRows += 1;
      lines.push(`R${rowIndex + 1}: ${cells.map((cell) => `${columnName(cell.columnIndex)}=${quoteForRecognition(cell.value, maxCellChars)}`).join(" | ")}`);
    });
    const nonEmptyRows = rows.filter((row) => (row || []).some((cell) => cleanCell(cell) !== "")).length;
    if (nonEmptyRows > emitted) {
      lines.push(`TRUNCATED: emitted ${emitted} non-empty rows of ${nonEmptyRows}.`);
    }
    if (truncatedColumnRowCount > 0) {
      lines.push(`COLUMNS_TRUNCATED: ${truncatedColumnRowCount} emitted row(s) contained non-empty cells after column ${columnName(maxColumns - 1)}.`);
    }
    if (truncatedCellCount > 0) {
      lines.push(`CELL_VALUES_TRUNCATED: shortened ${truncatedCellCount} cell value(s) longer than ${maxCellChars} characters.`);
    }
  });

  return lines.join("\n");
}

export function detectFinalHandlingUnitCandidates(sheet) {
  const rows = finalUnitSourceRows(sheet);
  if (!rows.length) return [];
  const mergeCells = normalizedMergeCells(sheet, rows);
  const columnCount = rows.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  if (!columnCount) return [];
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
    const headerParts = headerPartsForColumn(rows, mergeCells, columnIndex);
    return {
      columnIndex,
      headerParts,
      headerText: headerParts.join(" | ")
    };
  });
  const dimensionSpecs = palletDimensionSpecs(columns, rows, mergeCells);
  if (!dimensionSpecs.length) return [];

  const candidates = [];
  for (const spec of dimensionSpecs) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const dimensions = dimensionsAt(rows, mergeCells, spec, rowIndex);
      if (!dimensions || dimensions.ownerRow !== rowIndex) continue;
      const rowSpan = dimensionRowSpan(mergeCells, spec, rowIndex);
      const palletStartColumn = Math.min(...spec.columns);
      const quantityEvidence = finalPackageQuantity(rows, columns, mergeCells, rowIndex, palletStartColumn);
      const quantity = quantityEvidence.quantity || 1;
      const nameEvidence = finalPackageName(rows, columns, mergeCells, rowSpan, palletStartColumn);
      const remark = finalPackageRemark(rows, columns, mergeCells, rowSpan, palletStartColumn);
      const innerCargo = innerCargoForCandidate(rows, columns, mergeCells, rowSpan, palletStartColumn);
      const weights = finalPackageWeights(rows, columns, mergeCells, rowIndex, palletStartColumn, quantity);
      candidates.push({
        sourceRowNumber: rowIndex + 1,
        sourceRowNumbers: integerRange(rowSpan.startRow + 1, rowSpan.endRow + 1),
        sourceRange: `R${rowSpan.startRow + 1}:R${rowSpan.endRow + 1}`,
        dimensionColumns: spec.columns.map(columnName),
        quantityEvidence,
        weightEvidence: weights,
        sharedMergedRows: rowSpan.endRow > rowSpan.startRow,
        name: nameEvidence.name,
        sourceNames: nameEvidence.names,
        lengthCm: dimensions.values[0],
        widthCm: dimensions.values[1],
        heightCm: dimensions.values[2],
        quantity,
        rawRemark: remark,
        innerCargo,
        palletStartColumn
      });
    }
  }

  const uniqueCandidates = [...new Map(candidates.map((candidate) => [
    [candidate.sourceRowNumber, candidate.lengthCm, candidate.widthCm, candidate.heightCm].join("|"),
    candidate
  ])).values()].sort((left, right) => left.sourceRowNumber - right.sourceRowNumber);
  if (!uniqueCandidates.length) return [];
  return finalizeHandlingUnitCandidates(uniqueCandidates);
}

function buildFinalHandlingUnitPreview(candidates) {
  const validRows = [];
  const invalidRows = [];
  candidates.forEach((candidate) => {
    const cargo = candidate.cargo;
    const errors = validateCargo(cargo);
    const row = {
      rowNumber: candidate.sourceRowNumber,
      raw: {
        sourceRange: candidate.sourceRange,
        sourceNames: candidate.sourceNames.join(" + "),
        remark: candidate.rawRemark
      },
      cargo,
      errors,
      notes: candidate.notes,
      suggestion: buildRowSuggestion({}, cargo, errors, candidate.sourceRowNumber)
    };
    if (errors.length) invalidRows.push(row);
    else validRows.push(row);
  });
  const aggregated = aggregateCargos(validRows.map((row) => row.cargo));
  return {
    totalRows: candidates.length,
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0),
    skippedRows: invalidRows.length
  };
}

function finalUnitSourceRows(sheet) {
  if (Array.isArray(sheet?.rawRows) && sheet.rawRows.length) {
    return sheet.rawRows.map((row) => trimTrailingEmptyCells((row || []).map(cleanCell)));
  }
  const rows = [];
  const headerRowIndex = Math.max(0, Number(sheet?.headerRowIndex || 0));
  while (rows.length < headerRowIndex) rows.push([]);
  rows.push([...(sheet?.headers || [])].map(cleanCell));
  (sheet?.rows || []).forEach((row) => rows.push((row || []).map(cleanCell)));
  return rows;
}

function normalizedMergeCells(sheet, rows) {
  if (Array.isArray(sheet?.mergeCells) && sheet.mergeCells.length) {
    return sheet.mergeCells.map((merge) => ({ ...merge }));
  }
  return (sheet?.merges || []).map((range) => mergeCellFromRange(range, rows)).filter(Boolean);
}

function mergeCellFromRange(range, rows) {
  const match = String(range || "").match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const startColumn = columnIndex(match[1]);
  const endColumn = columnIndex(match[3]);
  const startRow = Number(match[2]) - 1;
  const endRow = Number(match[4]) - 1;
  return {
    range: `${match[1].toUpperCase()}${startRow + 1}:${match[3].toUpperCase()}${endRow + 1}`,
    startRow,
    endRow,
    startColumn,
    endColumn,
    value: cleanCell(rows[startRow]?.[startColumn])
  };
}

function headerPartsForColumn(rows, mergeCells, columnIndex) {
  const parts = [];
  const scanRowCount = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < scanRowCount; rowIndex += 1) {
    const value = mergeAwareCellValue(rows, mergeCells, rowIndex, columnIndex);
    if (!isLikelyHeaderValue(value) || parts.includes(value)) continue;
    parts.push(value);
  }
  return parts;
}

function isLikelyHeaderValue(value) {
  const text = cleanCell(value);
  if (!text || parseDimensionText(text, "auto")) return false;
  if (containsAnyText(text, [
    "名称", "品名", "尺寸", "规格", "数量", "件数", "箱数", "重量", "毛重", "净重", "体积", "方数", "备注",
    "托盘", "木托", "栈板", "合计", "总", "长", "宽", "高", "size", "qty", "quantity", "ctn", "carton", "pallet", "skid",
    "weight", "n.w", "g.w", "cbm", "volume", "remark", "order"
  ])) return true;
  return !/^[\s\d.,+\-*/()（）]+$/.test(text) && !/^\d/.test(text);
}

function palletDimensionSpecs(columns, rows, mergeCells) {
  const specs = [];
  columns.forEach((column) => {
    if (!isPalletDimensionGroupHeader(column.headerText)) return;
    const hasCombinedValue = rows.some((row, rowIndex) => {
      const value = cleanCell(row?.[column.columnIndex]);
      if (!value || !parseDimensionText(value, "auto")) return false;
      const owner = mergeOwnerAt(mergeCells, rowIndex, column.columnIndex);
      return !owner || owner.startRow === rowIndex;
    });
    if (hasCombinedValue) specs.push({ kind: "combined", columns: [column.columnIndex] });
  });

  const axisColumns = { length: [], width: [], height: [] };
  columns.forEach((column) => {
    if (!hasPalletSignal(column.headerText)) return;
    const axis = dimensionAxisFromHeaderParts(column.headerParts);
    if (axis) axisColumns[axis].push(column.columnIndex);
  });
  if (axisColumns.length.length && axisColumns.width.length && axisColumns.height.length) {
    for (const lengthColumn of axisColumns.length) {
      const widthColumn = axisColumns.width.find((value) => value > lengthColumn && value - lengthColumn <= 4);
      const heightColumn = axisColumns.height.find((value) => value > (widthColumn ?? lengthColumn) && value - lengthColumn <= 5);
      if (widthColumn != null && heightColumn != null) {
        specs.push({ kind: "axes", columns: [lengthColumn, widthColumn, heightColumn] });
        break;
      }
    }
  }
  return [...new Map(specs.map((spec) => [`${spec.kind}:${spec.columns.join(",")}`, spec])).values()];
}

function isPalletDimensionGroupHeader(value) {
  const text = normalizeHeader(value);
  return hasPalletSignal(text)
    && containsAnyText(text, ["尺寸", "规格", "外廓", "体积", "size", "dimension", "volume"]);
}

function hasPalletSignal(value) {
  return containsAnyText(normalizeHeader(value), ["托盘", "木托", "栈板", "免熏蒸", "pallet", "skid"]);
}

function dimensionAxisFromHeaderParts(parts) {
  const normalized = parts.map((part) => normalizeHeader(part));
  if (normalized.some((part) => ["l", "长", "长度"].includes(part) || part.endsWith("长"))) return "length";
  if (normalized.some((part) => ["w", "宽", "宽度"].includes(part) || part.endsWith("宽"))) return "width";
  if (normalized.some((part) => ["h", "高", "高度"].includes(part) || part.endsWith("高"))) return "height";
  return "";
}

function dimensionsAt(rows, mergeCells, spec, rowIndex) {
  if (spec.kind === "combined") {
    const column = spec.columns[0];
    const owner = mergeOwnerAt(mergeCells, rowIndex, column);
    const ownerRow = owner?.startRow ?? rowIndex;
    const value = cleanCell(rows[ownerRow]?.[column]);
    const parsed = parseDimensionText(value, "auto");
    return parsed ? { ownerRow, values: parsed.map(round2) } : null;
  }
  const values = spec.columns.map((column) => {
    const owner = mergeOwnerAt(mergeCells, rowIndex, column);
    const ownerRow = owner?.startRow ?? rowIndex;
    const header = headerPartsForColumn(rows, mergeCells, column).join(" ");
    return positiveNumber(rows[ownerRow]?.[column], unitFromHeader(header, "auto"), null);
  });
  if (!values.every((value) => value > 0)) return null;
  const ownerRows = spec.columns.map((column) => mergeOwnerAt(mergeCells, rowIndex, column)?.startRow ?? rowIndex);
  return { ownerRow: Math.min(...ownerRows), values: values.map(round2) };
}

function dimensionRowSpan(mergeCells, spec, rowIndex) {
  const owners = spec.columns.map((column) => mergeOwnerAt(mergeCells, rowIndex, column)).filter(Boolean);
  if (!owners.length) return { startRow: rowIndex, endRow: rowIndex };
  return {
    startRow: Math.min(rowIndex, ...owners.map((merge) => merge.startRow)),
    endRow: Math.max(rowIndex, ...owners.map((merge) => merge.endRow))
  };
}

function finalPackageQuantity(rows, columns, mergeCells, rowIndex, palletStartColumn) {
  const quantityColumns = columns.filter((column) => column.columnIndex >= palletStartColumn
    && isFinalPackageQuantityHeader(column.headerText));
  for (const column of quantityColumns) {
    const value = positiveInteger(mergeAwareCellValue(rows, mergeCells, rowIndex, column.columnIndex));
    if (value) return { quantity: value, source: columnName(column.columnIndex), basis: column.headerText };
  }
  for (const column of columns.filter((item) => item.columnIndex >= palletStartColumn)) {
    const match = cleanCell(column.headerText).match(/(\d+)\s*(?:个|只|件|pcs?)?\s*(?:托盘|木托|栈板|pallets?|skids?)/i);
    if (match) return { quantity: Number(match[1]), source: "header", basis: match[0] };
  }
  return { quantity: 1, source: "row", basis: "one explicit final-package row" };
}

function isFinalPackageQuantityHeader(value) {
  const text = normalizeHeader(value);
  if (containsAnyText(text, ["体积", "方数", "重量", "毛重", "净重", "volume", "weight", "cbm"])) return false;
  return containsAnyText(text, ["托盘数量", "木托数量", "栈板数量", "托数", "palletqty", "palletquantity", "skidqty"])
    || ["数量", "qty", "quantity"].includes(text);
}

function finalPackageName(rows, columns, mergeCells, rowSpan, palletStartColumn) {
  const nameColumns = columns.filter((column) => column.columnIndex < palletStartColumn && isNameHeader(column.headerText));
  const fallbackColumns = columns.filter((column) => column.columnIndex < palletStartColumn
    && containsAnyText(normalizeHeader(column.headerText), ["size", "尺寸"]));
  const column = nameColumns[0] || fallbackColumns[0];
  const names = [];
  if (column) {
    for (let rowIndex = rowSpan.startRow; rowIndex <= rowSpan.endRow; rowIndex += 1) {
      const value = cleanCell(mergeAwareCellValue(rows, mergeCells, rowIndex, column.columnIndex));
      if (!value || isSummaryText(value) || names.includes(value)) continue;
      names.push(value);
    }
  }
  return {
    names,
    name: names.length ? names.join(" + ") : "拼装木托盘"
  };
}

function isNameHeader(value) {
  const text = normalizeHeader(value);
  return containsAnyText(text, ["品名", "货物名称", "产品名称", "物料名称", "cargoname", "goodsname", "productname"])
    || text === "name";
}

function finalPackageRemark(rows, columns, mergeCells, rowSpan, palletStartColumn) {
  const remarkColumns = columns.filter((column) => column.columnIndex >= palletStartColumn
    && containsAnyText(normalizeHeader(column.headerText), ["备注", "说明", "remark", "note"]));
  const values = [];
  for (let rowIndex = rowSpan.startRow; rowIndex <= rowSpan.endRow; rowIndex += 1) {
    for (const column of remarkColumns) {
      const value = cleanCell(mergeAwareCellValue(rows, mergeCells, rowIndex, column.columnIndex));
      if (value && !values.includes(value)) values.push(value);
    }
    for (let columnIndex = palletStartColumn; columnIndex < (rows[rowIndex]?.length || 0); columnIndex += 1) {
      const value = cleanCell(rows[rowIndex]?.[columnIndex]);
      if (containsAnyText(value, ["拼装", "拼托", "混装", "合拼", "mixed", "combined"]) && !values.includes(value)) values.push(value);
    }
  }
  return values.join("；");
}

function innerCargoForCandidate(rows, columns, mergeCells, rowSpan, palletStartColumn) {
  const leftColumns = columns.filter((column) => column.columnIndex < palletStartColumn);
  const nameColumn = leftColumns.find((column) => isNameHeader(column.headerText))
    || leftColumns.find((column) => containsAnyText(normalizeHeader(column.headerText), ["size", "尺寸"]));
  const cartonCountColumn = leftColumns.find((column) => isCartonCountHeader(column.headerText));
  const totalQuantityColumn = leftColumns.find((column) => isLooseTotalQuantityHeader(column.headerText));
  const piecesPerCartonColumn = leftColumns.find((column) => isPiecesPerCartonHeader(column.headerText));
  const cartonDimensionColumn = leftColumns.find((column) => isOuterCartonDimensionHeader(normalizeHeader(column.headerText)));
  const cartonAxes = cartonDimensionAxisColumns(leftColumns);
  const unitGrossColumn = leftColumns.find((column) => isUnitGrossWeightHeader(normalizeHeader(column.headerText)));
  const totalGrossColumn = leftColumns.find((column) => isTotalWeightHeader(normalizeHeader(column.headerText)));
  const lines = [];
  for (let rowIndex = rowSpan.startRow; rowIndex <= rowSpan.endRow; rowIndex += 1) {
    const name = cleanCell(nameColumn ? mergeAwareCellValue(rows, mergeCells, rowIndex, nameColumn.columnIndex) : "");
    if (isSummaryText(name)) continue;
    const cartonCount = positiveInteger(cartonCountColumn ? mergeAwareCellValue(rows, mergeCells, rowIndex, cartonCountColumn.columnIndex) : "");
    const totalQuantity = positiveInteger(totalQuantityColumn ? mergeAwareCellValue(rows, mergeCells, rowIndex, totalQuantityColumn.columnIndex) : "");
    const piecesPerCarton = numberFromCell(piecesPerCartonColumn ? mergeAwareCellValue(rows, mergeCells, rowIndex, piecesPerCartonColumn.columnIndex) : "");
    const cartonDimensions = cartonDimensionsAt(rows, mergeCells, rowIndex, cartonDimensionColumn, cartonAxes);
    const cartonGrossWeightKg = numberFromCell(unitGrossColumn ? mergeAwareCellValue(rows, mergeCells, rowIndex, unitGrossColumn.columnIndex) : "");
    const explicitTotalGrossWeightKg = numberFromCell(totalGrossColumn ? mergeAwareCellValue(rows, mergeCells, rowIndex, totalGrossColumn.columnIndex) : "");
    if (!name && !cartonCount && !totalQuantity && !cartonDimensions) continue;
    const calculatedTotalGrossWeightKg = cartonCount && cartonGrossWeightKg ? cartonCount * cartonGrossWeightKg : null;
    lines.push(compactObject({
      sourceRowNumber: rowIndex + 1,
      name,
      cartonCount,
      totalQuantity,
      piecesPerCarton,
      cartonDimensionsCm: cartonDimensions ? {
        lengthCm: cartonDimensions[0], widthCm: cartonDimensions[1], heightCm: cartonDimensions[2]
      } : null,
      cartonGrossWeightKg,
      explicitTotalGrossWeightKg,
      calculatedTotalGrossWeightKg: calculatedTotalGrossWeightKg == null ? null : round2(calculatedTotalGrossWeightKg)
    }));
  }
  return compactObject({ lines });
}

function isCartonCountHeader(value) {
  const text = normalizeHeader(value);
  return containsAnyText(text, ["总箱数", "箱数", "件数", "tctns", "totalcartons", "totalcarton"])
    && !containsAnyText(text, ["装箱数量", "每箱"]);
}

function isLooseTotalQuantityHeader(value) {
  const text = normalizeHeader(value);
  return containsAnyText(text, ["orderqty", "orderquantity", "总数量", "产品数量"])
    || ["数量", "qty", "quantity"].includes(text);
}

function isPiecesPerCartonHeader(value) {
  return containsAnyText(normalizeHeader(value), ["装箱数量", "每箱数量", "pcsctn", "qtyctn", "个箱", "只箱", "条箱"]);
}

function cartonDimensionAxisColumns(columns) {
  const result = {};
  columns.forEach((column) => {
    const text = normalizeHeader(column.headerText);
    if (!containsAnyText(text, ["纸箱", "外箱", "carton", "box"])) return;
    const axis = dimensionAxisFromHeaderParts(column.headerParts);
    if (axis && result[axis] == null) result[axis] = column.columnIndex;
  });
  return result;
}

function cartonDimensionsAt(rows, mergeCells, rowIndex, combinedColumn, axes) {
  if (combinedColumn) {
    const parsed = parseDimensionText(
      mergeAwareCellValue(rows, mergeCells, rowIndex, combinedColumn.columnIndex),
      "auto"
    );
    if (parsed) return parsed.map(round2);
  }
  if (axes.length == null || axes.width == null || axes.height == null) return null;
  const values = [axes.length, axes.width, axes.height].map((columnIndex) => positiveNumber(
    mergeAwareCellValue(rows, mergeCells, rowIndex, columnIndex),
    unitFromHeader(headerPartsForColumn(rows, mergeCells, columnIndex).join(" "), "auto"),
    null
  ));
  return values.every((value) => value > 0) ? values.map(round2) : null;
}

function finalPackageWeights(rows, columns, mergeCells, rowIndex, palletStartColumn, quantity) {
  const quantityColumns = columns.filter((column) => column.columnIndex >= palletStartColumn
    && isFinalPackageQuantityHeader(column.headerText)).map((column) => column.columnIndex);
  const quantityColumn = quantityColumns.length ? Math.min(...quantityColumns) : null;
  const entries = columns
    .filter((column) => column.columnIndex >= palletStartColumn && isFinalWeightHeader(column.headerText))
    .map((column) => ({
      columnIndex: column.columnIndex,
      header: column.headerText,
      value: numberFromCell(mergeAwareCellValue(rows, mergeCells, rowIndex, column.columnIndex))
    }))
    .filter((entry) => entry.value != null && entry.value >= 0);
  const tareEntries = entries.filter((entry) => isPalletTareWeightHeader(entry.header));
  const finalTotalEntries = entries.filter((entry) => isFinalGrossTotalHeader(entry.header));
  const result = { entries };
  if (tareEntries.length) {
    result.tareUnitWeightKg = round2(tareEntries[0].value);
    const relatedTotal = entries.find((entry) => entry !== tareEntries[0]
      && Math.abs(entry.value - tareEntries[0].value * quantity) <= Math.max(0.1, entry.value * 0.002));
    result.tareTotalWeightKg = round2(relatedTotal?.value ?? tareEntries[0].value * quantity);
  }
  if (finalTotalEntries.length) result.finalTotalGrossWeightKg = round2(finalTotalEntries.at(-1).value);
  if (!result.finalTotalGrossWeightKg && !tareEntries.length && entries.length) {
    const afterQuantity = quantityColumn == null ? null : entries.find((entry) => entry.columnIndex > quantityColumn);
    if (afterQuantity) result.finalTotalGrossWeightKg = round2(afterQuantity.value);
    else result.unitGrossWeightKg = round2(entries[0].value);
  }
  return result;
}

function isFinalWeightHeader(value) {
  const text = normalizeHeader(value);
  return containsAnyText(text, ["重量", "毛重", "weight", "gw", "g.w"])
    && !containsAnyText(text, ["净重", "netweight", "nw", "n.w"]);
}

function isPalletTareWeightHeader(value) {
  const text = normalizeHeader(value);
  return hasPalletSignal(text)
    && containsAnyText(text, ["重量", "weight"])
    && !containsAnyText(text, ["装货后", "含货", "总重量", "合计重量", "总毛重", "totalweight", "gross"]);
}

function isFinalGrossTotalHeader(value) {
  const text = normalizeHeader(value);
  return containsAnyText(text, ["总重量", "总毛重", "totalweight", "totalgross"])
    || /\d+.*(?:托盘|pallet|skid).*总.*(?:重量|weight)/i.test(cleanCell(value));
}

function finalizeHandlingUnitCandidates(candidates) {
  const mixedCandidate = candidates.find((candidate) => containsAnyText(candidate.rawRemark, [
    "拼装", "拼托", "混装", "合拼", "mixed", "combined"
  ]));
  const leftovers = [];
  candidates.forEach((candidate) => {
    const sourceLines = Array.isArray(candidate.innerCargo?.lines) ? candidate.innerCargo.lines : [];
    const allocatedLines = [];
    sourceLines.forEach((line) => {
      const cartonCount = Number(line.cartonCount || 0);
      let allocatedCartons = cartonCount;
      if (mixedCandidate && candidate !== mixedCandidate && candidate.quantity > 1 && cartonCount > candidate.quantity) {
        const cartonsPerPallet = Math.floor(cartonCount / candidate.quantity);
        allocatedCartons = cartonsPerPallet * candidate.quantity;
        const remainder = cartonCount - allocatedCartons;
        if (remainder > 0) leftovers.push({ ...line, cartonCount: remainder, originalCartonCount: cartonCount });
        if (cartonsPerPallet > 0) candidate.cartonsPerPallet = cartonsPerPallet;
      }
      if (allocatedCartons <= 0) return;
      allocatedLines.push(scaleInnerCargoLine(line, allocatedCartons, cartonCount));
    });
    candidate.innerCargo = summarizeInnerCargo(allocatedLines, candidate.cartonsPerPallet);
  });
  if (mixedCandidate && leftovers.length) {
    mixedCandidate.innerCargo = summarizeInnerCargo(leftovers.map((line) => scaleInnerCargoLine(
      line,
      Number(line.cartonCount || 0),
      Number(line.originalCartonCount || line.cartonCount || 0)
    )));
    mixedCandidate.sourceNames = leftovers.map((line) => line.name).filter(Boolean);
    mixedCandidate.name = mixedCandidate.sourceNames.length
      ? `${[...new Set(mixedCandidate.sourceNames)].join(" + ")}拼装`
      : mixedCandidate.name;
  }

  return candidates.map((candidate) => {
    const quantity = Math.max(1, Math.round(Number(candidate.quantity || 1)));
    const innerCargoTotal = round2(candidate.innerCargo?.totalGrossWeightKg || 0);
    const evidence = candidate.weightEvidence || {};
    let packageTotalGrossWeightKg = Number(evidence.finalTotalGrossWeightKg || 0);
    let palletTotalTareWeightKg = Number(evidence.tareTotalWeightKg || 0);
    let palletTareWeightKg = Number(evidence.tareUnitWeightKg || 0);
    if (packageTotalGrossWeightKg > 0 && !palletTotalTareWeightKg && packageTotalGrossWeightKg >= innerCargoTotal) {
      palletTotalTareWeightKg = round2(packageTotalGrossWeightKg - innerCargoTotal);
      palletTareWeightKg = round2(palletTotalTareWeightKg / quantity);
    } else if (!packageTotalGrossWeightKg && palletTotalTareWeightKg > 0) {
      packageTotalGrossWeightKg = round2(palletTotalTareWeightKg + innerCargoTotal);
    } else if (!packageTotalGrossWeightKg && Number(evidence.unitGrossWeightKg) > 0) {
      packageTotalGrossWeightKg = round2(Number(evidence.unitGrossWeightKg) * quantity);
    }
    const packageGrossWeightKg = round2(packageTotalGrossWeightKg / quantity);
    const mixed = containsAnyText(candidate.rawRemark, ["拼装", "拼托", "混装", "合拼", "mixed", "combined"]);
    const notes = [
      `最终木托盘优先；源表 ${candidate.sourceRange}`,
      candidate.sharedMergedRows ? "合并单元格跨多条产品行，仅生成一个托盘记录" : "",
      mixed ? "复核：拼装/混装托盘已保留为一个最终搬运单元" : "",
      candidate.rawRemark
    ].filter(Boolean);
    const packageInfo = compactObject({
      algorithmBasis: "source-final-package",
      handlingUnitType: "pallet",
      packageUnit: "pallet",
      packageQuantity: quantity,
      dimensionSource: "explicit source pallet columns",
      handlingUnitDimensionsExplicit: true,
      packageDimensionsCm: {
        lengthCm: candidate.lengthCm,
        widthCm: candidate.widthCm,
        heightCm: candidate.heightCm
      },
      packageGrossWeightKg,
      packageTotalGrossWeightKg,
      palletTareWeightKg,
      palletTotalTareWeightKg,
      cargoTotalWeightKg: innerCargoTotal,
      weightFormula: palletTotalTareWeightKg > 0
        ? "(pallet tare total + contained cargo gross total) / pallet quantity"
        : "final package gross total / pallet quantity",
      sourceRows: candidate.sourceRowNumbers,
      sourceRange: candidate.sourceRange,
      sharedMergedRows: candidate.sharedMergedRows,
      mixedPallet: mixed,
      innerCargo: candidate.innerCargo
    });
    const cargo = parsedCargo({
      name: candidate.name,
      model: "",
      lengthCm: candidate.lengthCm,
      widthCm: candidate.widthCm,
      heightCm: candidate.heightCm,
      quantity,
      weightKg: packageGrossWeightKg,
      type: "pallet",
      nonStack: false,
      keepUpright: false,
      color: "",
      sku: "",
      remark: notes.join("；"),
      packageInfo
    });
    return { ...candidate, quantity, notes, cargo };
  });
}

function scaleInnerCargoLine(line, allocatedCartons, originalCartons) {
  const ratio = originalCartons > 0 ? allocatedCartons / originalCartons : 1;
  const explicitTotal = Number(line.explicitTotalGrossWeightKg);
  const calculatedTotal = Number(line.calculatedTotalGrossWeightKg);
  const sourceTotal = Number.isFinite(explicitTotal) && line.explicitTotalGrossWeightKg != null
    ? explicitTotal
    : Number.isFinite(calculatedTotal) && line.calculatedTotalGrossWeightKg != null
      ? calculatedTotal
      : Number(line.cartonGrossWeightKg || 0) * originalCartons;
  return compactObject({
    ...line,
    cartonCount: allocatedCartons,
    totalGrossWeightKg: round2(sourceTotal * ratio),
    sourceTotalGrossWeightKg: round2(sourceTotal),
    sourceTotalMismatch: explicitTotal > 0 && calculatedTotal > 0 && Math.abs(explicitTotal - calculatedTotal) > 0.01
  });
}

function summarizeInnerCargo(lines, cartonsPerPallet) {
  const cartonCount = lines.reduce((sum, line) => sum + Number(line.cartonCount || 0), 0);
  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.totalQuantity || 0), 0);
  const totalGrossWeightKg = round2(lines.reduce((sum, line) => sum + Number(line.totalGrossWeightKg || 0), 0));
  const firstDimensions = lines.find((line) => line.cartonDimensionsCm)?.cartonDimensionsCm;
  const firstGrossWeight = lines.find((line) => Number(line.cartonGrossWeightKg) > 0)?.cartonGrossWeightKg;
  return compactObject({
    cartonCount,
    cartonsPerPallet,
    totalQuantity: totalQuantity || null,
    cartonDimensionsCm: lines.length === 1 ? firstDimensions : null,
    cartonGrossWeightKg: lines.length === 1 ? firstGrossWeight : null,
    totalGrossWeightKg,
    quantityUnit: "cartons",
    lines
  });
}

function formatMergedCellValueLines(sheet, maxMergeRanges, maxCellChars) {
  const rows = finalUnitSourceRows(sheet);
  const mergeCells = normalizedMergeCells(sheet, rows)
    .filter((merge) => cleanCell(merge.value))
    .slice(0, maxMergeRanges);
  if (!mergeCells.length) return [];
  const lines = [
    `MERGED_CELL_VALUES: ${mergeCells.map((merge) => `${merge.range}=${quoteForRecognition(merge.value, maxCellChars)}`).join(" | ")}`
  ];
  const rowSpans = new Map();
  mergeCells.filter((merge) => merge.endRow > merge.startRow).forEach((merge) => {
    const key = `${merge.startRow}:${merge.endRow}`;
    if (!rowSpans.has(key)) rowSpans.set(key, []);
    rowSpans.get(key).push(merge);
  });
  rowSpans.forEach((merges, key) => {
    const [startRow, endRow] = key.split(":").map(Number);
    lines.push(`MERGED_ROW_SPAN R${startRow + 1}:R${endRow + 1}: ${merges.map((merge) => `${merge.range}=${quoteForRecognition(merge.value, maxCellChars)}`).join(" | ")}`);
  });
  return lines;
}

function candidateForRecognition(candidate) {
  return {
    sourceRowNumber: candidate.sourceRowNumber,
    sourceRowNumbers: candidate.sourceRowNumbers,
    sourceRange: candidate.sourceRange,
    name: candidate.cargo.name,
    model: candidate.cargo.model,
    lengthCm: candidate.cargo.lengthCm,
    widthCm: candidate.cargo.widthCm,
    heightCm: candidate.cargo.heightCm,
    quantity: candidate.cargo.quantity,
    weightKg: candidate.cargo.weightKg,
    type: candidate.cargo.type,
    nonStack: candidate.cargo.nonStack,
    keepUpright: candidate.cargo.keepUpright,
    remark: candidate.cargo.remark,
    packageInfo: candidate.cargo.packageInfo
  };
}

function mergeAwareCellValue(rows, mergeCells, rowIndex, columnIndex) {
  const direct = cleanCell(rows[rowIndex]?.[columnIndex]);
  if (direct) return direct;
  const owner = mergeOwnerAt(mergeCells, rowIndex, columnIndex);
  return owner ? cleanCell(owner.value ?? rows[owner.startRow]?.[owner.startColumn]) : "";
}

function mergeOwnerAt(mergeCells, rowIndex, columnIndex) {
  return mergeCells.find((merge) => rowIndex >= merge.startRow && rowIndex <= merge.endRow
    && columnIndex >= merge.startColumn && columnIndex <= merge.endColumn) || null;
}

function trimTrailingEmptyCells(row) {
  let lastIndex = row.length - 1;
  while (lastIndex >= 0 && cleanCell(row[lastIndex]) === "") lastIndex -= 1;
  return row.slice(0, lastIndex + 1);
}

function buildFormulaCellMetadata(worksheet) {
  return Object.entries(worksheet || {})
    .filter(([address, cell]) => /^[A-Z]+\d+$/i.test(address) && cell && typeof cell.f === "string" && cell.f.trim())
    .map(([address, cell]) => ({
      address,
      formula: cell.f.trim(),
      value: cleanCell(cell.w ?? cell.v)
    }));
}

function buildMergeCellMetadata(merges, rows) {
  return (merges || []).map((range) => ({
    range: formatMergeRange(range),
    startRow: range.s.r,
    endRow: range.e.r,
    startColumn: range.s.c,
    endColumn: range.e.c,
    value: cleanCell(rows[range.s.r]?.[range.s.c])
  }));
}

function formatMergeRange(range) {
  const start = `${columnName(range.s.c)}${range.s.r + 1}`;
  const end = `${columnName(range.e.c)}${range.e.r + 1}`;
  return start === end ? start : `${start}:${end}`;
}

function columnIndex(name) {
  return String(name || "").toUpperCase().split("").reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function integerRange(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function containsAnyText(value, needles) {
  const text = cleanCell(value).toLowerCase();
  return needles.some((needle) => text.includes(String(needle).toLowerCase()));
}

export function buildPreview(sheet, mapping, options = {}) {
  const finalHandlingUnitCandidates = detectFinalHandlingUnitCandidates(sheet, options);
  if (finalHandlingUnitCandidates.length) {
    return buildFinalHandlingUnitPreview(finalHandlingUnitCandidates);
  }
  const dimensionUnit = options.dimensionUnit || "auto";
  const weightUnit = options.weightUnit || "auto";
  const validRows = [];
  const invalidRows = [];
  let parsedRowCount = 0;

  sheet.rows.forEach((cells, index) => {
    const raw = rowObject(sheet.headers, cells);
    if (shouldSkipDataRow(raw, mapping, cells)) return;
    parsedRowCount += 1;
    const parsed = parseCargoRow(raw, mapping, {
      rowNumber: sheet.headerRowIndex + index + 2,
      dimensionUnit,
      weightUnit
    });
    if (parsed.errors.length) invalidRows.push(parsed);
    else validRows.push(parsed);
  });

  const aggregated = aggregateCargos(validRows.map((row) => row.cargo));
  return {
    totalRows: parsedRowCount,
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0),
    skippedRows: invalidRows.length
  };
}

export function parseCargoText(text, options = {}) {
  const lines = splitCargoText(text);
  const validRows = [];
  const invalidRows = [];

  lines.forEach((line, index) => {
    const parsed = parseCargoTextLine(line, index + 1, options);
    if (parsed.errors.length) invalidRows.push(parsed);
    else validRows.push(parsed);
  });

  const aggregated = aggregateCargos(validRows.map((row) => row.cargo));
  return {
    totalRows: lines.length,
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0),
    skippedRows: invalidRows.length
  };
}

export function guessMapping(headers) {
  const normalized = headers.map((header) => normalizeHeader(header));
  const mapping = {};
  for (const field of STANDARD_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || [];
    const normalizedAliases = aliases.map(normalizeHeader);
    let matchIndex = normalized.findIndex((header) => normalizedAliases.includes(header));
    if (matchIndex < 0) {
      matchIndex = normalized.findIndex((header) =>
        normalizedAliases.some((alias) => alias && canFuzzyMatchAlias(alias) && header.includes(alias))
      );
    }
    mapping[field.key] = matchIndex >= 0 ? headers[matchIndex] : "";
  }
  if (!mapping.name && mapping.id) mapping.name = mapping.id;
  return refineMapping(headers, mapping);
}

function refineMapping(headers, mapping) {
  const refined = { ...mapping };
  applyLoadedPalletMapping(headers, refined);
  if (refined.__loadedPallet !== "true") applyPackingListMapping(headers, refined);
  return refined;
}

function applyLoadedPalletMapping(headers, mapping) {
  const palletLengthHeader = firstHeader(headers, (header) => isLoadedPalletDimensionHeader(header, "length"));
  const palletWidthHeader = firstHeader(headers, (header) => isLoadedPalletDimensionHeader(header, "width"));
  const palletHeightHeader = firstHeader(headers, (header) => isLoadedPalletDimensionHeader(header, "height"));
  if (!palletLengthHeader || !palletWidthHeader || !palletHeightHeader) return;

  const palletQuantityHeader = firstHeader(headers, isPalletQuantityHeader);
  const palletIdHeader = firstHeader(headers, isPalletIdentifierHeader);
  if (!palletQuantityHeader && !palletIdHeader) return;

  const palletUnitGrossWeightHeader = firstHeader(headers, isLoadedPalletUnitGrossWeightHeader);
  const stackConstraintHeader = firstHeader(headers, isStackConstraintHeader);
  const orientationConstraintHeader = firstHeader(headers, isOrientationConstraintHeader);

  mapping.__loadedPallet = "true";
  mapping.__packageUnit = "pallet";
  mapping.lengthCm = palletLengthHeader;
  mapping.widthCm = palletWidthHeader;
  mapping.heightCm = palletHeightHeader;
  if (palletQuantityHeader) mapping.quantity = palletQuantityHeader;
  if (palletIdHeader) mapping.id = palletIdHeader;
  if (palletUnitGrossWeightHeader) {
    mapping.weightKg = palletUnitGrossWeightHeader;
    mapping.totalWeightKg = "";
  }
  if (stackConstraintHeader) mapping.nonStack = stackConstraintHeader;
  if (orientationConstraintHeader) mapping.keepUpright = orientationConstraintHeader;
}

function isLoadedPalletDimensionHeader(header, axis) {
  const palletSignal = header.includes("\u6258\u76d8")
    || header.includes("\u6808\u677f")
    || header.includes("pallet")
    || header.includes("skid");
  const outerSignal = header.includes("\u88c5\u8d27\u540e")
    || header.includes("\u5916\u5ed3")
    || header.includes("\u5916\u5f62")
    || header.includes("loaded")
    || header.includes("overall");
  const axisSignals = {
    length: ["\u957f", "length"],
    width: ["\u5bbd", "width"],
    height: ["\u9ad8", "height"]
  };
  return palletSignal
    && outerSignal
    && axisSignals[axis].some((signal) => header.includes(signal));
}

function isPalletQuantityHeader(header) {
  return header.includes("\u6258\u76d8\u6570\u91cf")
    || header.includes("\u6258\u76d8\u6570")
    || header.includes("\u6258\u6570")
    || header.includes("\u6808\u677f\u6570\u91cf")
    || header.includes("\u6808\u677f\u6570")
    || header.includes("palletqty")
    || header.includes("palletquantity")
    || header.includes("skidqty");
}

function isPalletIdentifierHeader(header) {
  return header.includes("\u6258\u76d8\u7f16\u53f7")
    || header.includes("\u6258\u76d8id")
    || header.includes("\u6808\u677f\u7f16\u53f7")
    || header.includes("\u6808\u677fid")
    || header.includes("palletno")
    || header.includes("palletid")
    || header.includes("skidno")
    || header.includes("skidid");
}

function isLoadedPalletUnitGrossWeightHeader(header) {
  const unitSignal = header.includes("\u5355\u6258")
    || header.includes("\u6bcf\u6258")
    || header.includes("\u5355\u6808\u677f")
    || header.includes("\u6bcf\u6808\u677f")
    || header.includes("perpallet")
    || header.includes("perskid");
  const finalGrossSignal = header.includes("\u603b\u6bdb\u91cd")
    || header.includes("\u542b\u6258\u6bdb\u91cd")
    || header.includes("\u88c5\u8d27\u540e\u6bdb\u91cd")
    || header.includes("totalgrossweight");
  return unitSignal && finalGrossSignal;
}

function isStackConstraintHeader(header) {
  return header.includes("\u5806\u53e0\u9650\u5236")
    || header.includes("\u5806\u7801\u9650\u5236")
    || header.includes("\u627f\u538b\u9650\u5236")
    || header.includes("stackingrestriction")
    || header.includes("stacklimit");
}

function isOrientationConstraintHeader(header) {
  return header.includes("\u671d\u5411\u8981\u6c42")
    || header.includes("\u65b9\u5411\u8981\u6c42")
    || header.includes("\u6446\u653e\u65b9\u5411")
    || header.includes("orientationrequirement")
    || header.includes("orientation");
}

function applyPackingListMapping(headers, mapping) {
  const productHeaders = headers.slice(0, firstPalletColumnIndex(headers));
  const nameHeader = firstHeader(productHeaders, isCargoNameHeader);
  const outerDimensionHeader = firstHeader(productHeaders, isOuterCartonDimensionHeader);
  const packageCountHeader = firstHeader(productHeaders, isPackageCountHeader);
  const packingQuantityHeader = firstHeader(productHeaders, isPackingQuantityHeader);
  const sourceQuantityHeader = firstHeader(productHeaders, isSourceQuantityHeader);
  const unitGrossWeightHeader = firstHeader(productHeaders, isUnitGrossWeightHeader);
  const totalWeightHeader = firstHeader(productHeaders, isTotalWeightHeader);
  const remarkHeader = firstHeader(productHeaders, isRemarkHeader);

  const looksLikePackingList = nameHeader
    && outerDimensionHeader
    && (packageCountHeader || packingQuantityHeader || unitGrossWeightHeader || totalWeightHeader);
  if (!looksLikePackingList) return;

  mapping.__packingList = "true";
  mapping.__packageUnit = "carton";
  mapping.name = nameHeader;
  mapping.dimensionText = outerDimensionHeader;
  mapping.lengthCm = "";
  mapping.widthCm = "";
  mapping.heightCm = "";
  if (packageCountHeader) mapping.quantity = packageCountHeader;
  else if (sourceQuantityHeader && packingQuantityHeader) mapping.quantity = "";
  if (unitGrossWeightHeader) mapping.weightKg = unitGrossWeightHeader;
  else if (totalWeightHeader) mapping.weightKg = "";
  if (totalWeightHeader) mapping.totalWeightKg = totalWeightHeader;
  if (remarkHeader) mapping.remark = remarkHeader;
  if (sourceQuantityHeader) mapping.__sourceQuantity = sourceQuantityHeader;
  if (packingQuantityHeader) mapping.__packingQuantity = packingQuantityHeader;
}

function firstPalletColumnIndex(headers) {
  const index = headers.findIndex(isPalletHeader);
  return index < 0 ? headers.length : index;
}

function firstHeader(headers, predicate) {
  return headers.find((header) => predicate(normalizeHeader(header))) || "";
}

function isCargoNameHeader(header) {
  return [
    "\u54c1\u540d",
    "\u4ea7\u54c1\u540d\u79f0",
    "\u8d27\u7269\u540d\u79f0",
    "\u8d27\u540d",
    "\u540d\u79f0",
    "size",
    "name",
    "goodsname",
    "productname"
  ].includes(header);
}

function isOuterCartonDimensionHeader(header) {
  return header.includes("\u5916\u7bb1\u5c3a\u5bf8")
    || header.includes("\u5916\u7bb1\u89c4\u683c")
    || header.includes("\u7eb8\u7bb1\u5c3a\u5bf8")
    || header.includes("\u5305\u88c5\u5c3a\u5bf8")
    || header === "\u7bb1\u89c4"
    || header === "\u7bb1\u5c3a\u5bf8"
    || header.includes("cartonsize")
    || header.includes("outersize")
    || header.includes("outercarton");
}

function isPackageCountHeader(header) {
  return [
    "\u4ef6\u6570",
    "\u7bb1\u6570",
    "\u603b\u4ef6\u6570",
    "\u603b\u7bb1\u6570",
    "ctn",
    "ctns",
    "tctn",
    "tctns",
    "totalctn",
    "totalctns",
    "totalcarton",
    "totalcartons",
    "carton",
    "cartons",
    "boxes"
  ].includes(header) && !header.includes("\u88c5\u7bb1");
}

function isPackingQuantityHeader(header) {
  return header.includes("\u88c5\u7bb1\u6570\u91cf")
    || header.includes("\u6bcf\u7bb1\u6570\u91cf")
    || header.includes("\u5165\u6570")
    || header.includes("pcsctn")
    || header.includes("qtyctn");
}

function isSourceQuantityHeader(header) {
  return [
    "\u6570\u91cf",
    "\u4ea7\u54c1\u6570\u91cf",
    "\u603b\u6570\u91cf",
    "qty",
    "quantity",
    "orderqty",
    "orderquantity",
    "pcs"
  ].includes(header);
}

function isUnitGrossWeightHeader(header) {
  const unitSignals = [
    "\u6bdb\u91cd",
    "\u6bdb\u91cdkg",
    "\u5355\u7bb1\u6bdb\u91cd",
    "\u5355\u7bb1\u6bdb\u91cdkg",
    "\u6bcf\u7bb1\u6bdb\u91cd",
    "\u7bb1\u6bdb\u91cd",
    "\u7bb1\u91cd",
    "gw",
    "gwkg",
    "gwkgs",
    "gweight",
    "gweightkg",
    "gweightkgs",
    "grossweight"
  ];
  const totalSignals = [
    "\u603b\u91cd\u91cf",
    "\u603b\u91cd",
    "\u603b\u6bdb\u91cd",
    "\u603b\u7bb1\u6bdb\u91cd",
    "\u91cd\u91cf\u5408\u8ba1",
    "\u5408\u8ba1\u91cd\u91cf",
    "totalweight",
    "totalgross",
    "grossweighttotal",
    "tgw"
  ];
  return unitSignals.some((signal) => header.includes(signal))
    && !totalSignals.some((signal) => header.includes(signal))
    && !isPalletHeader(header);
}

function isTotalWeightHeader(header) {
  return (header.includes("\u603b\u91cd\u91cf")
    || header.includes("\u603b\u91cd")
    || header.includes("\u603b\u6bdb\u91cd")
    || header.includes("\u91cd\u91cf\u5408\u8ba1")
    || header.includes("\u5408\u8ba1\u91cd\u91cf")
    || header.includes("totalweight")
    || header.includes("tgw")
    || header.includes("tgwkg")
    || header.includes("tgwkgs")
    || header.includes("totalgw")
    || header.includes("grossweighttotal"))
    && !header.includes("\u4f53\u79ef")
    && !isPalletHeader(header);
}

function isRemarkHeader(header) {
  return ["\u5907\u6ce8", "remark", "remarks", "note"].includes(header);
}

function isPalletHeader(header) {
  const normalized = normalizeHeader(header);
  return normalized.includes("\u6258\u76d8")
    || normalized.includes("\u6808\u677f")
    || normalized.includes("\u514d\u718f\u84b8")
    || normalized.includes("pallet");
}

function parseCargoTextLine(line, rowNumber, options = {}) {
  const rawText = cleanCell(line);
  const text = normalizeTextSymbols(rawText);
  const dimension = extractTextDimensions(text, options.dimensionUnit || "auto");
  const quantity = extractTextQuantity(text);
  const weight = extractTextWeight(text, quantity.value, options.weightUnit || "auto");
  const explicitModel = extractTextModel(text);
  const nameModel = extractTextNameModel(text, [dimension, quantity, weight, explicitModel].filter(Boolean));
  const inferredType = normalizeType(text, text);
  const type = inferredType === "pallet" ? "pallet" : "normal";
  const constraints = normalizeCargoConstraints({ type, remark: text, constraintText: text });
  const notes = [];

  if (dimension) notes.push(`识别尺寸：${dimension.values.join(" × ")} cm`);
  if (quantity.raw) notes.push(`识别数量：${quantity.value} 件`);
  if (weight.fromTotal) notes.push("已用总重量 / 数量换算单件重量");
  if (!weight.raws.length) notes.push("未识别单件重量，暂按 0 kg 导入，请确认重心计算是否需要补重");
  if (nameModel.model && !explicitModel) notes.push(`从名称尾部识别型号：${nameModel.model}`);
  if (type !== "normal") notes.push(`识别堆叠规则：${type}`);

  const cargo = parsedCargo({
    name: nameModel.name,
    model: explicitModel?.value || nameModel.model || "",
    lengthCm: dimension?.values[0] || 0,
    widthCm: dimension?.values[1] || 0,
    heightCm: dimension?.values[2] || 0,
    quantity: quantity.value || 0,
    weightKg: weight.value ?? 0,
    type,
    nonStack: constraints.nonStack,
    keepUpright: constraints.keepUpright,
    color: "",
    sku: "",
    remark: notes.join("；")
  });
  const errors = validateCargo(cargo).filter((error) => !error.includes("重量"));
  const confidence = textConfidence({ name: cargo.name, dimension, quantity, weight, errors });

  return {
    rowNumber,
    raw: { text: rawText },
    text: rawText,
    cargo,
    confidence,
    errors,
    notes,
    suggestion: buildTextSuggestion(rawText, cargo, errors, rowNumber)
  };
}

function splitCargoText(text) {
  return cleanCell(text)
    .replace(/\r/g, "\n")
    .split(/\n|；|;/)
    .map((line) => cleanCell(line))
    .filter(Boolean);
}

function normalizeTextSymbols(value) {
  return cleanCell(value)
    .replace(/[＊Ｘｘ]/g, "*")
    .replace(/[×X]/g, "*")
    .replace(/[，、。]/g, " ")
    .replace(/\s+/g, " ");
}

function extractTextDimensions(text, defaultUnit) {
  const number = "(\\d+(?:\\.\\d+)?)";
  const unit = "(mm|毫米|cm|厘米|m|米)?";
  const sizePattern = new RegExp(`${number}\\s*${unit}\\s*[*]\\s*${number}\\s*${unit}\\s*[*]\\s*${number}\\s*${unit}`, "i");
  const sizeMatch = text.match(sizePattern);
  if (sizeMatch) {
    const units = [sizeMatch[2], sizeMatch[4], sizeMatch[6]].filter(Boolean);
    const finalUnit = normalizeDimensionUnit(units[units.length - 1] || defaultUnit || "cm");
    return {
      raw: sizeMatch[0],
      index: sizeMatch.index ?? -1,
      values: [sizeMatch[1], sizeMatch[3], sizeMatch[5]].map((value) => round2(convertDimension(Number(value), finalUnit)))
    };
  }

  const namedPattern = new RegExp(`长(?:度)?\\s*[:：]?\\s*${number}\\s*${unit}\\s*宽(?:度)?\\s*[:：]?\\s*${number}\\s*${unit}\\s*高(?:度)?\\s*[:：]?\\s*${number}\\s*${unit}`, "i");
  const namedMatch = text.match(namedPattern);
  if (namedMatch) {
    const units = [namedMatch[2], namedMatch[4], namedMatch[6]].filter(Boolean);
    const finalUnit = normalizeDimensionUnit(units[units.length - 1] || defaultUnit || "cm");
    return {
      raw: namedMatch[0],
      index: namedMatch.index ?? -1,
      values: [namedMatch[1], namedMatch[3], namedMatch[5]].map((value) => round2(convertDimension(Number(value), finalUnit)))
    };
  }
  return null;
}

function extractTextQuantity(text) {
  const labeled = text.match(/(?:数量|件数|箱数|个数|qty|pcs)\s*[:：]?\s*(\d+)\s*(?:件|箱|个|pcs)?/i);
  const loose = text.match(/(\d+)\s*(?:件|箱|个|pcs)/i);
  const match = labeled || loose;
  return {
    raw: match?.[0] || "",
    index: match?.index ?? -1,
    value: match ? Math.max(1, Math.round(Number(match[1]))) : 1
  };
}

function extractTextWeight(text, quantity, defaultUnit) {
  const total = text.match(/(?:总重|总重量|总毛重|总净重|毛重合计|重量合计|合计重量)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|公斤|千克|g|克|t|吨)/i);
  if (total) {
    const totalKg = convertWeight(Number(total[1]), normalizeWeightUnit(total[2] || defaultUnit || "kg"));
    return {
      raws: [total[0]],
      index: total.index ?? -1,
      value: quantity ? round2(totalKg / quantity) : round2(totalKg),
      fromTotal: Boolean(quantity)
    };
  }

  const labeled = text.match(/(?:单重|单件重量|每件重量|每件|重量|净重|毛重|重)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|公斤|千克|g|克|t|吨)(?:\s*(?:\/|／)\s*(?:件|箱|pcs))?/i);
  const perPiece = text.match(/(\d+(?:\.\d+)?)\s*(kg|公斤|千克|g|克|t|吨)\s*(?:\/|／)?\s*(?:件|箱|pcs|每件)/i);
  const match = labeled || perPiece;
  if (!match) return { raws: [], index: -1, value: 0, fromTotal: false };
  return {
    raws: [match[0]],
    index: match.index ?? -1,
    value: round2(convertWeight(Number(match[1]), normalizeWeightUnit(match[2] || defaultUnit || "kg"))),
    fromTotal: false
  };
}

function extractTextModel(text) {
  const match = text.match(/(?:型号|规格|model)\s*[:：]?\s*([A-Za-z0-9#\-_/.一二三四五六七八九十]+)\b/i);
  if (!match || /[*]/.test(match[1])) return null;
  return { raw: match[0], index: match.index ?? -1, value: cleanCell(match[1]) };
}

function extractTextNameModel(text, parts) {
  const indexes = parts.map((part) => part.index).filter((index) => index >= 0);
  const firstIndex = indexes.length ? Math.min(...indexes) : -1;
  let name = firstIndex > 0 ? text.slice(0, firstIndex) : text;
  parts.forEach((part) => {
    if (part.raw) name = name.replace(part.raw, " ");
    if (Array.isArray(part.raws)) {
      part.raws.forEach((raw) => {
        name = name.replace(raw, " ");
      });
    }
  });
  name = name
    .replace(/(?:名称|品名|货物|货名|产品)\s*[:：]/g, " ")
    .replace(/\b(?:cm|mm|kg|pcs|model)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const inferred = name.match(/^(.+?)[\s\-_/]*(\d{2,6}[A-Za-z]?|[A-Za-z]\d{1,4}|#\d{1,6})$/);
  if (inferred && /[\u4e00-\u9fa5A-Za-z]/.test(inferred[1])) {
    return { name: cleanCell(inferred[1]), model: cleanCell(inferred[2].replace(/^#/, "")) };
  }
  return { name, model: "" };
}

function buildTextSuggestion(line, cargo, errors, rowNumber) {
  const fallbackDimensions = parseDimensionText(line, "auto");
  const suggested = {
    name: cargo.name || inferNameFromRow({ text: line }) || `文本第 ${rowNumber} 行货物`,
    model: cargo.model || "",
    lengthCm: cargo.lengthCm || fallbackDimensions?.[0] || "",
    widthCm: cargo.widthCm || fallbackDimensions?.[1] || "",
    heightCm: cargo.heightCm || fallbackDimensions?.[2] || "",
    quantity: cargo.quantity || 1,
    weightKg: cargo.weightKg || 0,
    type: cargo.type || normalizeType("", line),
    nonStack: cargo.nonStack,
    keepUpright: cargo.keepUpright,
    color: "",
    sku: "",
    remark: cargo.remark || ""
  };
  const notes = [];
  if (errors.some((error) => error.includes("名称"))) notes.push("名称未识别，建议从原始文本中截取货物名");
  if (errors.some((error) => error.includes("长度") || error.includes("宽度") || error.includes("高度"))) notes.push("尺寸未识别，建议补充长宽高");
  if (errors.some((error) => error.includes("数量"))) notes.push("数量未识别，建议确认件数");
  return {
    cargo: suggested,
    notes,
    errors: validateCargo(suggested).filter((error) => !error.includes("重量"))
  };
}

function textConfidence({ name, dimension, quantity, weight, errors }) {
  let score = 0;
  if (name) score += 0.25;
  if (dimension) score += 0.35;
  if (quantity.raw) score += 0.2;
  else score += 0.12;
  if (weight.raws.length) score += 0.2;
  else score += 0.08;
  score -= errors.length * 0.18;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function extractTable(rows) {
  const headerRowIndex = findHeaderRow(rows);
  const headers = uniquifyHeaders((rows[headerRowIndex] || []).map(cleanCell));
  const bodyRows = rows
    .slice(headerRowIndex + 1)
    .map((row) => padRow(row, headers.length))
    .filter((row) => row.some((cell) => cleanCell(cell) !== ""));
  return { headerRowIndex, headers, bodyRows };
}

function findHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, index) => {
    const cells = row.map(cleanCell);
    const score = cells.reduce((sum, cell) => {
      const normalized = normalizeHeader(cell);
      if (!normalized) return sum;
      const matched = Object.values(FIELD_ALIASES).some((aliases) =>
        aliases.map(normalizeHeader).some((alias) => alias && (normalized.includes(alias) || alias.includes(normalized)))
      );
      return sum + (matched ? 2 : cell ? 0.25 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function parseCargoRow(raw, mapping, context) {
  const notes = [];
  const errors = [];
  const dimensionText = valueFor(raw, mapping.dimensionText);
  const dimensions = parseDimensionText(dimensionText, context.dimensionUnit);
  let quantity = positiveInteger(valueFor(raw, mapping.quantity));
  if (!quantity && isPackingListMapping(mapping)) {
    quantity = inferPackageQuantity(
      valueFor(raw, mapping.__sourceQuantity),
      valueFor(raw, mapping.__packingQuantity)
    );
    if (quantity) notes.push("\u5df2\u7528\u4ea7\u54c1\u6570\u91cf / \u88c5\u7bb1\u6570\u91cf\u6362\u7b97\u8fd0\u8f93\u4ef6\u6570");
  }
  const lengthCm = positiveNumber(valueFor(raw, mapping.lengthCm), unitFromHeader(mapping.lengthCm, context.dimensionUnit), dimensions?.[0]);
  const widthCm = positiveNumber(valueFor(raw, mapping.widthCm), unitFromHeader(mapping.widthCm, context.dimensionUnit), dimensions?.[1]);
  const heightCm = positiveNumber(valueFor(raw, mapping.heightCm), unitFromHeader(mapping.heightCm, context.dimensionUnit), dimensions?.[2]);
  const totalWeightKg = nonNegativeNumber(valueFor(raw, mapping.totalWeightKg), weightUnitFromHeader(mapping.totalWeightKg, context.weightUnit), null);
  const weightSource = mapping.weightKg && mapping.weightKg !== mapping.totalWeightKg ? valueFor(raw, mapping.weightKg) : "";
  const weightKg = nonNegativeNumber(
    weightSource,
    weightUnitFromHeader(mapping.weightKg, context.weightUnit),
    totalWeightKg != null && quantity ? totalWeightKg / quantity : null
  );
  const name = cleanCell(valueFor(raw, mapping.name) || valueFor(raw, mapping.id));
  const model = cleanCell(valueFor(raw, mapping.model));
  const remark = cleanCell(valueFor(raw, mapping.remark));
  const rawType = cleanCell(valueFor(raw, mapping.type));
  const inferredType = normalizeType(rawType, remark);
  let type = inferredType === "pallet" ? "pallet" : "normal";
  if (packageUnitFromMapping(mapping) === "pallet") type = "pallet";
  const constraints = normalizeCargoConstraints({
    type,
    remark,
    constraintText: rawType,
    nonStack: constraintFieldValue(valueFor(raw, mapping.nonStack)),
    keepUpright: constraintFieldValue(valueFor(raw, mapping.keepUpright))
  });
  const color = normalizeColor(valueFor(raw, mapping.color));
  const sku = cleanCell(valueFor(raw, mapping.id));

  if (!name) errors.push("缺少货物名称");
  if (!lengthCm) errors.push("长度必须大于 0");
  if (!widthCm) errors.push("宽度必须大于 0");
  if (!heightCm) errors.push("高度必须大于 0");
  if (!quantity) errors.push("数量必须是正整数");
  if (weightKg == null) errors.push("单件重量必须大于等于 0");
  if (dimensionText && !dimensions) notes.push("合并尺寸未识别，已尝试使用独立长宽高字段");
  if (totalWeightKg != null && !weightSource) notes.push("已用总重量 / 数量换算单件重量");

  const packageInfo = buildPackageInfo({
    mapping,
    raw,
    quantity,
    lengthCm,
    widthCm,
    heightCm,
    weightKg,
    totalWeightKg
  });
  if (packageInfo && isPackingListMapping(mapping)) {
    notes.push("导入口径：算法货物=外包装箱/托盘，散件数量仅保存为包装明细");
  }

  const cargo = parsedCargo({
    name,
    model,
    lengthCm,
    widthCm,
    heightCm,
    quantity,
    weightKg,
    type,
    nonStack: constraints.nonStack,
    keepUpright: constraints.keepUpright,
    color,
    sku,
    remark,
    packageInfo
  });

  return {
    rowNumber: context.rowNumber,
    raw,
    cargo,
    errors,
    notes,
    suggestion: buildRowSuggestion(raw, cargo, errors, context.rowNumber)
  };
}

export function aggregateCargos(cargos) {
  const map = new Map();
  cargos.forEach((cargo) => {
    const key = [
      cargo.sku || cargo.name,
      cargo.name,
      cargo.model,
      cargo.lengthCm,
      cargo.widthCm,
      cargo.heightCm,
      cargo.weightKg,
      cargo.type,
      Boolean(cargo.nonStack),
      Boolean(cargo.keepUpright),
      cargo.color
    ].join("|");
    const existing = map.get(key);
    if (existing) {
      existing.quantity += cargo.quantity;
      existing.packageInfo = mergePackageInfo(existing.packageInfo, cargo.packageInfo, existing.quantity);
    } else {
      map.set(key, { ...cargo });
    }
  });
  return assignCargoModels([...map.values()]);
}

function mergePackageInfo(left, right, packageQuantity) {
  if (!left && !right) return undefined;
  const base = { ...(right || {}), ...(left || {}) };
  base.packageQuantity = packageQuantity;
  const leftInner = left?.innerCargo || {};
  const rightInner = right?.innerCargo || {};
  const innerCargo = { ...rightInner, ...leftInner };

  ["cartonCount", "totalCartons", "totalQuantity"].forEach((field) => {
    const total = sumNumericField(leftInner, rightInner, field);
    if (total != null) innerCargo[field] = Math.round(total);
  });
  ["cartonTotalGrossWeightKg", "totalGrossWeightKg", "totalWeightKg", "cargoTotalWeightKg"].forEach((field) => {
    const total = sumNumericField(leftInner, rightInner, field);
    if (total != null) innerCargo[field] = round2(total);
  });

  if (Object.keys(innerCargo).length) base.innerCargo = compactObject(innerCargo);
  [
    "packageTotalGrossWeightKg",
    "palletTotalGrossWeightKg",
    "handlingUnitTotalGrossWeightKg",
    "cargoTotalWeightKg",
    "containedCargoTotalGrossWeightKg",
    "totalGrossWeightKg",
    "totalWeightKg"
  ].forEach((field) => {
    const total = sumNumericField(left || {}, right || {}, field);
    if (total != null) base[field] = round2(total);
  });
  return compactObject(base);
}

function sumNumericField(left, right, field) {
  const leftValue = Number(left?.[field]);
  const rightValue = Number(right?.[field]);
  const hasLeft = Number.isFinite(leftValue) && left?.[field] !== "" && left?.[field] != null;
  const hasRight = Number.isFinite(rightValue) && right?.[field] !== "" && right?.[field] != null;
  if (!hasLeft && !hasRight) return null;
  return (hasLeft ? leftValue : 0) + (hasRight ? rightValue : 0);
}

export function validateCargo(cargo) {
  const errors = [];
  if (!cleanCell(cargo.name)) errors.push("缺少货物名称");
  if (!(Number(cargo.lengthCm) > 0)) errors.push("长度必须大于 0");
  if (!(Number(cargo.widthCm) > 0)) errors.push("宽度必须大于 0");
  if (!(Number(cargo.heightCm) > 0)) errors.push("高度必须大于 0");
  if (!(Number(cargo.quantity) > 0 && Number.isInteger(Number(cargo.quantity)))) errors.push("数量必须是正整数");
  if (!(Number(cargo.weightKg) >= 0)) errors.push("单件重量必须大于等于 0");
  return errors;
}

function buildRowSuggestion(raw, cargo, errors, rowNumber) {
  const fallbackDimensions = inferDimensionsFromRow(raw);
  const suggested = {
    name: cargo.name || inferNameFromRow(raw) || `第 ${rowNumber} 行货物`,
    model: cargo.model || "",
    lengthCm: cargo.lengthCm || fallbackDimensions?.[0] || "",
    widthCm: cargo.widthCm || fallbackDimensions?.[1] || "",
    heightCm: cargo.heightCm || fallbackDimensions?.[2] || "",
    quantity: cargo.quantity || 1,
    weightKg: cargo.weightKg || 0,
    type: cargo.type || normalizeType("", cargo.remark),
    nonStack: Boolean(cargo.nonStack),
    keepUpright: Boolean(cargo.keepUpright),
    color: cargo.color || "",
    sku: cargo.sku || "",
    remark: cargo.remark || ""
  };
  const notes = [];
  if (errors.some((error) => error.includes("名称"))) notes.push("名称缺失，已用原始行文本或行号生成临时名称");
  if (errors.some((error) => error.includes("数量"))) notes.push("数量缺失，建议先按 1 件导入，请确认");
  if (errors.some((error) => error.includes("重量"))) notes.push("重量缺失，建议先按 0 kg 导入，请确认");
  if (errors.some((error) => error.includes("长度") || error.includes("宽度") || error.includes("高度"))) {
    notes.push(fallbackDimensions ? "已从整行文本中重新识别长宽高" : "尺寸仍未识别，需要手动补充长宽高");
  }
  return {
    cargo: suggested,
    notes,
    errors: validateCargo(suggested)
  };
}

function inferDimensionsFromRow(raw) {
  for (const value of Object.values(raw)) {
    const dimensions = parseDimensionText(value, "auto");
    if (dimensions) return dimensions.map(round2);
  }
  const numbers = Object.values(raw)
    .map(numberFromCell)
    .filter((value) => value != null && value > 0);
  return numbers.length >= 3 ? numbers.slice(0, 3).map(round2) : null;
}

function inferNameFromRow(raw) {
  return Object.values(raw)
    .map(cleanCell)
    .find((value) => value && /[\u4e00-\u9fa5a-zA-Z]/.test(value) && !/^\d+(?:\.\d+)?$/.test(value));
}

function parsedCargo({
  name,
  model,
  lengthCm,
  widthCm,
  heightCm,
  quantity,
  weightKg,
  type,
  nonStack,
  keepUpright,
  color,
  sku,
  remark,
  packageInfo
}) {
  const cargo = normalizeCargoConstraints({
      name,
      model,
      lengthCm: round2(lengthCm),
      widthCm: round2(widthCm),
      heightCm: round2(heightCm),
      quantity,
      weightKg: round2(weightKg || 0),
      type,
      nonStack,
      keepUpright,
      color,
      sku,
      remark
  });
  if (packageInfo) cargo.packageInfo = packageInfo;
  return cargo;
}

function rowObject(headers, cells) {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
}

function valueFor(raw, header) {
  return header ? raw[header] : "";
}

function columnName(index) {
  let value = Number(index || 0) + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name || "A";
}

function quoteForRecognition(value, maxChars = 1_000) {
  const text = cleanCell(value);
  if (text.length <= maxChars) return JSON.stringify(text);
  const marker = " …[cell truncated]… ";
  const availableChars = Math.max(2, maxChars - marker.length);
  const headLength = Math.max(1, Math.floor(availableChars * 0.75));
  const tailLength = Math.max(1, availableChars - headLength);
  return JSON.stringify(`${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`);
}

function cleanCell(value) {
  if (value == null) return "";
  return String(value).replace(/\uFEFF/g, "").trim();
}

function normalizeHeader(value) {
  return cleanCell(value).toLowerCase().replace(/[\s_()（）\-:：/\\.【】\[\]]/g, "");
}

function canFuzzyMatchAlias(alias) {
  return alias.length > 2 || /[\u4e00-\u9fa5]/.test(alias);
}

function isPackingListMapping(mapping) {
  return mapping?.__packingList === "true";
}

function inferPackageQuantity(sourceQuantity, packingQuantity) {
  const total = numberFromCell(sourceQuantity);
  const perPackage = numberFromCell(packingQuantity);
  if (!(total > 0) || !(perPackage > 0)) return null;
  return Math.max(1, Math.ceil(total / perPackage));
}

function buildPackageInfo({
  mapping,
  raw,
  quantity,
  lengthCm,
  widthCm,
  heightCm,
  weightKg,
  totalWeightKg
}) {
  const packageQuantity = Math.max(0, Math.round(Number(quantity || 0)));
  const packageGrossWeightKg = round2(weightKg || 0);
  const innerTotalQuantity = numberFromCell(valueFor(raw, mapping.__sourceQuantity));
  const innerPiecesPerPackage = numberFromCell(valueFor(raw, mapping.__packingQuantity));
  const unit = packageUnitFromMapping(mapping);
  const hasPackageSignal = isPackingListMapping(mapping)
    || unit !== "carton"
    || normalizeHeader(mapping.dimensionText).includes("pallet")
    || normalizeHeader(mapping.dimensionText).includes("skid")
    || normalizeHeader(mapping.dimensionText).includes("\u6258\u76d8")
    || normalizeHeader(mapping.dimensionText).includes("\u6808\u677f");
  const hasInnerInfo = innerTotalQuantity > 0 || innerPiecesPerPackage > 0;
  if (!hasPackageSignal && !hasInnerInfo) return null;

  const packageTotalGrossWeightKg = totalWeightKg != null
    ? round2(totalWeightKg)
    : round2(packageGrossWeightKg * packageQuantity);
  return compactObject({
    algorithmBasis: "package-unit",
    packageUnit: unit,
    handlingUnitType: unit,
    handlingUnitDimensionsExplicit: true,
    packageQuantity,
    packageDimensionsCm: compactObject({
      lengthCm: round2(lengthCm || 0),
      widthCm: round2(widthCm || 0),
      heightCm: round2(heightCm || 0)
    }),
    packageGrossWeightKg,
    packageTotalGrossWeightKg,
    innerCargo: compactObject({
      totalQuantity: innerTotalQuantity > 0 ? Math.round(innerTotalQuantity) : null,
      piecesPerPackage: innerPiecesPerPackage > 0 ? innerPiecesPerPackage : null,
      quantityUnit: hasInnerInfo ? "pcs" : null
    })
  });
}

function packageUnitFromMapping(mapping = {}) {
  const text = `${mapping.__packageUnit || ""} ${mapping.dimensionText || ""}`.toLowerCase();
  const normalized = normalizeHeader(text);
  if (normalized.includes("pallet") || normalized.includes("skid") || normalized.includes("\u6258\u76d8") || normalized.includes("\u6808\u677f")) return "pallet";
  if (normalized.includes("crate") || normalized.includes("wood") || normalized.includes("\u6728\u7bb1")) return "crate";
  return "carton";
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (value == null || value === "") return false;
    if (typeof value === "number" && !Number.isFinite(value)) return false;
    if (value && typeof value === "object" && !Array.isArray(value)) return Object.keys(value).length > 0;
    return true;
  }));
}

function shouldSkipDataRow(raw, mapping, cells) {
  const name = cleanCell(valueFor(raw, mapping.name));
  if (isSummaryText(name)) return true;
  if (isPackingListMapping(mapping) && !name) return true;
  return !name && cells.map(normalizeHeader).some(isSummaryText);
}

function isSummaryText(value) {
  return ["\u5408\u8ba1", "\u5c0f\u8ba1", "\u603b\u8ba1", "total", "subtotal"].includes(normalizeHeader(value));
}

function uniquifyHeaders(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const fallback = header || `未命名列${index + 1}`;
    const count = seen.get(fallback) || 0;
    seen.set(fallback, count + 1);
    return count ? `${fallback}_${count + 1}` : fallback;
  });
}

function padRow(row, length) {
  return Array.from({ length }, (_, index) => cleanCell(row[index]));
}

function parseDimensionText(value, defaultUnit) {
  const text = cleanCell(value);
  if (!text) return null;
  const numbers = text.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (numbers.length < 3) return null;
  const unit = unitFromHeader(text, defaultUnit);
  return numbers.slice(0, 3).map((number) => convertDimension(number, unit));
}

function positiveNumber(value, unit, fallback) {
  const number = numberFromCell(value);
  if (number == null) return fallback ?? null;
  const converted = convertDimension(number, unit);
  return converted > 0 ? converted : null;
}

function nonNegativeNumber(value, unit, fallback) {
  const number = numberFromCell(value);
  if (number == null) return fallback ?? null;
  const converted = convertWeight(number, unit);
  return converted >= 0 ? converted : null;
}

function positiveInteger(value) {
  const number = numberFromCell(value);
  if (number == null) return null;
  const integer = Math.round(number);
  return integer > 0 ? integer : null;
}

function numberFromCell(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cleanCell(value).replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function unitFromHeader(header, selectedUnit) {
  if (selectedUnit && selectedUnit !== "auto") return selectedUnit;
  const text = cleanCell(header).toLowerCase();
  if (/mm|毫米/.test(text)) return "mm";
  if (/(^|[^c])m([^m]|$)|米/.test(text) && !/cm|厘米/.test(text)) return "m";
  return "cm";
}

function normalizeDimensionUnit(unit) {
  const text = cleanCell(unit).toLowerCase();
  if (/mm|毫米/.test(text)) return "mm";
  if (/^m$|米/.test(text)) return "m";
  return "cm";
}

function weightUnitFromHeader(header, selectedUnit) {
  if (selectedUnit && selectedUnit !== "auto") return selectedUnit;
  const text = cleanCell(header).toLowerCase();
  if (/kg|kgs|公斤|千克/.test(text)) return "kg";
  if (/吨|ton|t\b/.test(text)) return "t";
  if (/克|g\b/.test(text) && !/kg|公斤|千克/.test(text)) return "g";
  return "kg";
}

function normalizeWeightUnit(unit) {
  const text = cleanCell(unit).toLowerCase();
  if (/吨|ton|^t$/.test(text)) return "t";
  if (/克|^g$/.test(text) && !/kg|公斤|千克/.test(text)) return "g";
  return "kg";
}

function convertDimension(value, unit) {
  if (unit === "mm") return value / 10;
  if (unit === "m") return value * 100;
  return value;
}

function convertWeight(value, unit) {
  if (unit === "g") return value / 1000;
  if (unit === "t") return value * 1000;
  return value;
}

function normalizeType(value, remark) {
  const explicit = cleanCell(value).toLowerCase();
  const note = cleanCell(remark).toLowerCase();
  const combined = `${explicit} ${note}`;
  if (typeAliasMatches("pallet", combined)) return "pallet";
  if (typeAliasMatches("normal", explicit)) return "normal";
  if (typeAliasMatches("nonstack", explicit)) return "nonstack";
  if (typeAliasMatches("upright", explicit)) return "upright";
  if (typeAliasMatches("nonstack", note)) return "nonstack";
  if (typeAliasMatches("upright", note)) return "upright";
  return "normal";
}

function typeAliasMatches(type, text) {
  const alias = TYPE_ALIASES.find((item) => item.type === type);
  return Boolean(alias?.words.some((word) => text.includes(word.toLowerCase())));
}

function constraintFieldValue(value) {
  const text = cleanCell(value).toLowerCase();
  if (!text) return undefined;
  if (["1", "true", "yes", "y", "\u662f", "\u6709", "\u9700\u8981", "\u5fc5\u9700", "\u221a", "\u2713"].includes(text)) return true;
  if (["0", "false", "no", "n", "\u5426", "\u65e0", "\u4e0d\u9700\u8981", "\u00d7", "\u2715"].includes(text)) return false;
  return cleanCell(value);
}

function normalizeColor(value) {
  const text = cleanCell(value);
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  return "";
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
