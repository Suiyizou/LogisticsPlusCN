// Source package identities are authoritative: product quantities describe contents,
// never the number of handling units passed to the packing algorithm.
const aliases = {
  item: ["item", "itemno", "itemnumber", "caseno", "boxno", "cartonno"],
  marks: ["marks", "mark", "shippingmarks", "marking"],
  name: ["product", "description", "goods", "goodsdescription", "productname", "name"],
  model: ["size", "model", "specification", "spec", "productsize"],
  quantity: ["qty", "quantity", "pcs", "pieces", "productquantity"],
  netUnit: ["singlenwkg", "singlenw", "unitnetweightkg", "unitnetweight"],
  net: ["nwkg", "nw", "netweightkg", "netweight"],
  gross: ["gwkg", "gwkgs", "gw", "grossweightkg", "grossweightkgs", "grossweight"]
};
const text = (value) => (value == null ? "" : String(value).trim());
const normalized = (value) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
const round = (value, precision = 6) => Math.round(value * 10 ** precision) / 10 ** precision;

export function detectExplicitPackageCandidates(sheet) {
  const rows = sourceRows(sheet);
  const layout = findLayout(rows);
  if (!layout) return [];
  const merges = mergeRanges(sheet, rows);
  const groups = [];
  const footerRows = [];
  let current = null;
  let inFooter = false;
  for (let index = layout.headerRow + 1; index < rows.length; index++) {
    const row = rows[index] || [];
    if (!row.some((value) => text(value))) continue;
    if (inFooter || isFooter(row)) {
      inFooter = true;
      footerRows.push({ index, row });
      continue;
    }
    if (isRepeatedHeader(row, layout)) continue;
    const item = directIdentity(rows, merges, index, layout.item);
    const marks = directIdentity(rows, merges, index, layout.marks);
    const hasContents = [layout.name, layout.model, layout.quantity].some(
      (column) => column != null && text(row[column])
    );
    if (item || marks) {
      current = { item, marks, anchor: index, indices: [index], issues: [] };
      groups.push(current);
      if (!item || !marks)
        issue(
          current,
          "PACKAGE_IDENTITY_MISSING",
          "A package item and its shipping mark are required.",
          index
        );
      if (!singleItem(item) || !singleMark(marks))
        issue(
          current,
          "PACKAGE_IDENTITY_AMBIGUOUS",
          "A numeric or ranged shipping mark cannot identify one physical package.",
          index
        );
    } else if (
      current &&
      (hasContents ||
        [layout.gross, layout.net, ...layout.dimensionColumns].some(
          (column) => column != null && text(row[column])
        ))
    ) {
      current.indices.push(index);
    } else if (hasContents) {
      // Preserve the orphan as a blocked source record instead of silently dropping goods.
      current = { item: "", marks: "", anchor: index, indices: [index], issues: [] };
      groups.push(current);
      issue(
        current,
        "PACKAGE_ORPHAN_CONTENT",
        "Product contents appear before an identifiable package.",
        index
      );
    }
  }
  const candidates = groups.map((group) => makeCandidate(group, layout, rows, merges, sheet));
  const identities = new Map();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.cargo.sourceSheet, candidate.cargo.marks]);
    const prior = identities.get(key);
    if (prior && candidate.cargo.marks) {
      const duplicate = {
        code: "PACKAGE_IDENTITY_AMBIGUOUS",
        message: "A shipping mark occurs on more than one package anchor.",
        sourceRowNumber: candidate.sourceRowNumber
      };
      candidate.cargo.packageInfo.sourceIssues.push(duplicate);
      prior.cargo.packageInfo.sourceIssues.push({
        ...duplicate,
        sourceRowNumber: prior.sourceRowNumber
      });
    }
    identities.set(key, candidate);
  }
  const declared = declaredTotals(footerRows, layout);
  for (const candidate of candidates) candidate.cargo.packageInfo.declaredSourceTotals = declared;
  const reconciliation = reconcileExplicitPackages(candidates);
  if (candidates.length) {
    for (const [field, expected] of [
      ["packageCount", declared.packageCount],
      ["innerQuantity", declared.innerQuantity],
      ["grossWeightKg", declared.grossWeightKg]
    ]) {
      if (expected == null || Math.abs(reconciliation[field] - expected) <= 0.01) continue;
      candidates[0].cargo.packageInfo.sourceIssues.push({
        code: "PACKAGE_SOURCE_TOTAL_MISMATCH",
        message: `Source ${field} ${expected} differs from extracted ${reconciliation[field]}.`,
        sourceRowNumber: declared.sourceRowNumber
      });
    }
  }
  return candidates;
}

export function reconcileExplicitPackages(candidates) {
  const explicit = candidates.filter(
    (candidate) => candidate.cargo?.packageInfo?.algorithmBasis === "source-explicit-package"
  );
  if (!explicit.length) return null;
  const declared = explicit[0].cargo.packageInfo.declaredSourceTotals || {};
  const blockedItems = explicit.flatMap((candidate) =>
    (candidate.cargo.packageInfo.sourceIssues || []).map((entry) => ({
      ...entry,
      packageNo: candidate.cargo.packageNo,
      marks: candidate.cargo.marks,
      sourceSheet: candidate.cargo.sourceSheet
    }))
  );
  return {
    basis: "explicit-package",
    packageCount: explicit.length,
    innerQuantity: explicit.reduce(
      (sum, candidate) => sum + candidate.cargo.packageInfo.innerCargo.totalQuantity,
      0
    ),
    grossWeightKg: round(explicit.reduce((sum, candidate) => sum + candidate.cargo.weightKg, 0)),
    calculatedVolumeM3: round(
      explicit.reduce((sum, candidate) => {
        const cargo = candidate.cargo;
        return sum + (cargo.lengthCm * cargo.widthCm * cargo.heightCm) / 1e6;
      }, 0)
    ),
    declaredPackageCount: declared.packageCount ?? null,
    declaredInnerQuantity: declared.innerQuantity ?? null,
    declaredGrossWeightKg: declared.grossWeightKg ?? null,
    declaredVolumeM3: declared.volumeM3 ?? null,
    blockedItems,
    complete: blockedItems.length === 0
  };
}

export function hasExplicitPackageIdentity(cargo = {}) {
  return Boolean(
    text(cargo.packageNo || cargo.packageInfo?.packageNo) ||
    text(cargo.marks || cargo.packageInfo?.marks)
  );
}

export function restorePackageMetadata(raw, headers = {}) {
  let packageInfo = null;
  const field = (name, alternatives = []) =>
    [headers[name], name, ...alternatives]
      .filter(Boolean)
      .map((key) => raw[key])
      .find((value) => value != null && value !== "");
  const serialized = field("packageInfo", ["packageInfoJson"]);
  if (serialized && typeof serialized === "object" && !Array.isArray(serialized)) {
    packageInfo = structuredClone(serialized);
  } else if (text(serialized)) {
    try {
      const parsed = JSON.parse(String(serialized));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Invalid package metadata");
      packageInfo = parsed;
    } catch {
      packageInfo = {
        sourceIssues: [
          {
            code: "PACKAGE_METADATA_INVALID",
            message: "Exported package metadata is not valid JSON."
          }
        ]
      };
    }
  }
  const result = {};
  for (const field of ["packageNo", "marks", "sourceSheet"]) {
    const value = text(raw[headers[field] || field]) || text(packageInfo?.[field]);
    if (value) result[field] = value;
  }
  const innerJson = field("innerCargoJson");
  if (!packageInfo?.innerCargo && text(innerJson)) {
    try {
      const parsed = typeof innerJson === "object" ? innerJson : JSON.parse(String(innerJson));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Invalid inner cargo");
      packageInfo = { ...(packageInfo || {}), innerCargo: parsed };
    } catch {
      packageInfo = {
        ...(packageInfo || {}),
        sourceIssues: [
          { code: "PACKAGE_METADATA_INVALID", message: "Exported inner cargo is not valid JSON." }
        ]
      };
    }
  }
  const sourceRows = field("sourceRows");
  if (!packageInfo?.sourceRows && sourceRows) {
    try {
      const parsed = Array.isArray(sourceRows) ? sourceRows : JSON.parse(String(sourceRows));
      if (!Array.isArray(parsed) || !parsed.every((entry) => Number.isInteger(entry) && entry > 0))
        throw new Error("Invalid source rows");
      packageInfo = { ...(packageInfo || {}), sourceRows: parsed };
    } catch {
      packageInfo = {
        ...(packageInfo || {}),
        sourceIssues: [
          {
            code: "PACKAGE_METADATA_INVALID",
            message: "Exported source rows are not a valid positive-integer array."
          }
        ]
      };
    }
  }
  const innerQuantity = numeric(field("innerQuantity"));
  if (innerQuantity != null && !packageInfo?.innerCargo) {
    packageInfo = { ...(packageInfo || {}), innerCargo: { totalQuantity: innerQuantity } };
  }
  if (packageInfo || Object.keys(result).length)
    result.packageInfo = { ...(packageInfo || {}), ...result };
  return result;
}

function makeCandidate(group, layout, rows, merges, sheet) {
  const sourceSheet = text(sheet.name) || "Sheet1";
  const contentLines = [];
  for (const index of group.indices) {
    const row = rows[index];
    const name = cell(rows, merges, index, layout.name);
    const model = cell(rows, merges, index, layout.model);
    const rawQuantity = layout.quantity == null ? "" : row[layout.quantity];
    const quantity = numeric(rawQuantity);
    if (!name && !model && !text(rawQuantity)) continue;
    if (!(Number.isInteger(quantity) && quantity > 0))
      issue(
        group,
        "PACKAGE_CONTENT_QUANTITY_INVALID",
        "A product continuation has no valid positive integer quantity.",
        index
      );
    const unitNetWeightKg = numeric(cell(rows, merges, index, layout.netUnit));
    contentLines.push({
      name,
      model,
      quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 0,
      sourceRowNumber: index + 1,
      ...(unitNetWeightKg == null
        ? {}
        : { unitNetWeightKg: weightKg(unitNetWeightKg, layout.headers[layout.netUnit]) })
    });
  }
  const weights = [
    ...new Set(
      group.indices
        .map((index) => numeric(cell(rows, merges, index, layout.gross)))
        .filter((value) => value != null)
    )
  ];
  const grossWeightKg =
    weights.length === 1 && weights[0] > 0 ? weightKg(weights[0], layout.headers[layout.gross]) : 0;
  if (!grossWeightKg)
    issue(
      group,
      weights.length > 1 ? "PACKAGE_GROSS_WEIGHT_CONFLICT" : "PACKAGE_GROSS_WEIGHT_MISSING",
      "A package requires one unambiguous positive gross weight.",
      group.anchor
    );
  const dimensions = packageDimensions(group, layout, rows, merges);
  if (!dimensions)
    issue(
      group,
      "PACKAGE_DIMENSIONS_MISSING",
      "Explicit outer package dimensions and their unit are required; volume cannot replace dimensions.",
      group.anchor
    );
  const axes = dimensions || [0, 0, 0];
  const packageNo = group.item;
  const marks = group.marks;
  const names = [...new Set(contentLines.map((entry) => entry.name).filter(Boolean))];
  const models = [...new Set(contentLines.map((entry) => entry.model).filter(Boolean))];
  const sourceRowNumbers = group.indices.map((index) => index + 1);
  const sourceRange = `R${sourceRowNumbers[0]}:R${sourceRowNumbers.at(-1)}`;
  const net = numeric(cell(rows, merges, group.anchor, layout.net));
  const packageInfo = {
    algorithmBasis: "source-explicit-package",
    handlingUnitType: "package",
    packageUnit: "package",
    packageNo,
    marks,
    sourceSheet,
    sourceRows: sourceRowNumbers,
    sourceRange,
    packageQuantity: 1,
    quantityBasis: "physical-package",
    weightBasis: "per-package",
    packageGrossWeightKg: grossWeightKg,
    packageTotalGrossWeightKg: grossWeightKg,
    ...(net == null ? {} : { packageNetWeightKg: weightKg(net, layout.headers[layout.net]) }),
    packageDimensionsCm: { lengthCm: axes[0], widthCm: axes[1], heightCm: axes[2] },
    handlingUnitDimensionsExplicit: Boolean(dimensions),
    packageDimensionsMissing: !dimensions,
    grossWeightMissing: !grossWeightKg,
    innerCargo: {
      quantityUnit: "pcs",
      totalQuantity: contentLines.reduce((sum, entry) => sum + entry.quantity, 0),
      lines: contentLines
    },
    sourceIssues: group.issues
  };
  return {
    sourceRowNumber: group.anchor + 1,
    sourceRowNumbers,
    sourceRange,
    sourceSheet,
    packageNo,
    marks,
    sourceNames: names,
    rawRemark: "",
    notes: [],
    sharedMergedRows: group.indices.length > 1,
    dimensionColumns: layout.dimensionColumns.map(columnName),
    quantityEvidence: {
      quantity: 1,
      source: columnName(layout.item),
      basis: "one explicit package identity"
    },
    weightEvidence: { finalTotalGrossWeightKg: grossWeightKg },
    cargo: {
      packageNo,
      marks,
      sourceSheet,
      name: names.join(" + ") || `Package ${packageNo || marks || group.anchor + 1}`,
      model: models.join(" / "),
      lengthCm: axes[0],
      widthCm: axes[1],
      heightCm: axes[2],
      quantity: 1,
      weightKg: grossWeightKg,
      type: "normal",
      nonStack: false,
      keepUpright: false,
      sku: "",
      color: "",
      remark: `Physical package ${marks || packageNo}; source ${sourceSheet} ${sourceRange}.`,
      packageInfo
    }
  };
}

function packageDimensions(group, layout, rows, merges) {
  const found = [];
  for (const index of group.indices) {
    for (const column of layout.dimensionColumns) {
      const parsed = dimensionTriplet(cell(rows, merges, index, column), layout.headers[column]);
      if (parsed) found.push(parsed);
    }
    if (layout.axes.every((column) => column != null)) {
      const parsed = layout.axes.map((column) => {
        const value = numeric(cell(rows, merges, index, column));
        const unit = dimensionUnit(layout.headers[column]);
        return value > 0 && unit ? round(value * unit) : null;
      });
      if (parsed.every((value) => value > 0)) found.push(parsed);
    }
  }
  const unique = [...new Map(found.map((entry) => [JSON.stringify(entry), entry])).values()];
  if (unique.length > 1) {
    issue(
      group,
      "PACKAGE_DIMENSIONS_CONFLICT",
      "Multiple outer dimension values belong to one package.",
      group.anchor
    );
    return null;
  }
  return unique[0] || null;
}

function findLayout(rows) {
  for (let index = 0; index < Math.min(rows.length, 40); index++) {
    const headers = rows[index] || [];
    const columns = Object.fromEntries(
      Object.entries(aliases).map(([name, names]) => [
        name,
        headers.findIndex((header) => names.includes(normalized(header)))
      ])
    );
    if (columns.item < 0 || columns.marks < 0 || columns.name < 0 || columns.quantity < 0) continue;
    for (const name of Object.keys(columns)) if (columns[name] < 0) columns[name] = null;
    // Include a content-derived triplet column only when its header does not claim product specifications.
    const dimensionColumns = headers.flatMap((header, column) => {
      const key = normalized(header);
      if (/dimension|measurement|volume|outersize|packagesize|\u5c3a\u5bf8|\u4f53\u79ef/.test(key))
        return [column];
      if (!key && rows.slice(index + 1).some((row) => /[xX*×]/.test(text(row[column]))))
        return [column];
      return [];
    });
    const axes = ["length", "width", "height"].map((axis) => {
      const column = headers.findIndex((header) =>
        new RegExp(`^(?:${axis}|${axis[0]})(?:cm|mm|m)$`).test(normalized(header))
      );
      return column < 0 ? null : column;
    });
    return { ...columns, headerRow: index, headers, dimensionColumns, axes };
  }
  return null;
}

function declaredTotals(footerRows, layout) {
  const totals = {};
  for (const { index, row } of footerRows) {
    if (isFooter(row)) {
      const innerQuantity = numeric(row[layout.quantity]);
      const gross = numeric(row[layout.gross]);
      if (innerQuantity != null) totals.innerQuantity = innerQuantity;
      if (gross != null) totals.grossWeightKg = weightKg(gross, layout.headers[layout.gross]);
      for (const column of layout.dimensionColumns) {
        const volume = numeric(row[column]);
        if (volume != null && /volume|\u4f53\u79ef/.test(normalized(layout.headers[column])))
          totals.volumeM3 = volume;
      }
      const all = row.map(text).join(" ");
      const count = all.match(/(\d+)\s*(?:pkgs?\b|packages?\b|cartons?\b|ctns?\b|boxes\b|\u7bb1)/i);
      if (count) totals.packageCount = Number(count[1]);
      totals.sourceRowNumber ??= index + 1;
    }
  }
  return totals;
}

function sourceRows(sheet) {
  if (sheet.rawRows?.length) return sheet.rawRows;
  return [
    ...Array.from({ length: Math.max(0, Number(sheet.headerRowIndex || 0)) }, () => []),
    sheet.headers || [],
    ...(sheet.rows || [])
  ];
}
function mergeRanges(sheet, rows) {
  if (sheet.mergeCells?.length) return sheet.mergeCells;
  return (sheet.merges || [])
    .map((range) => {
      const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
      if (!match) return null;
      return {
        startRow: Number(match[2]) - 1,
        endRow: Number(match[4]) - 1,
        startColumn: columnIndex(match[1]),
        endColumn: columnIndex(match[3]),
        value: rows[Number(match[2]) - 1]?.[columnIndex(match[1])]
      };
    })
    .filter(Boolean);
}
function owner(merges, row, column) {
  return merges.find(
    (merge) =>
      row >= merge.startRow &&
      row <= merge.endRow &&
      column >= merge.startColumn &&
      column <= merge.endColumn
  );
}
function directIdentity(rows, merges, row, column) {
  const merge = owner(merges, row, column);
  return merge && merge.startRow !== row ? "" : text(rows[row]?.[column]);
}
function cell(rows, merges, row, column) {
  if (column == null) return "";
  const direct = text(rows[row]?.[column]);
  if (direct) return direct;
  const merge = owner(merges, row, column);
  return merge ? text(rows[merge.startRow]?.[merge.startColumn]) : "";
}
function singleItem(value) {
  return Boolean(text(value)) && !/[~～,;/]|\d\s*[-–—]\s*\d/.test(value);
}
function singleMark(value) {
  return singleItem(value) && !/^\d+(?:\.\d+)?$/.test(value);
}
function isFooter(row) {
  return /^(?:grand\s+total|sub\s*total|total|summary|notes?|remarks?|\u5408\u8ba1|\u603b\u8ba1|\u5c0f\u8ba1|\u5907\u6ce8)(?:\b|\s|:|：|$)/i.test(
    text(row.find((value) => text(value)))
  );
}
function isRepeatedHeader(row, layout) {
  return (
    aliases.item.includes(normalized(row[layout.item])) &&
    aliases.marks.includes(normalized(row[layout.marks]))
  );
}
function numeric(value) {
  const cleaned = text(value).replace(/,/g, "");
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(?:kg|kgs|g|t|pcs|pieces)?$/i);
  return match ? Number(match[1]) : null;
}
function weightKg(value, header) {
  return round(
    value *
      (/\b(?:ton|tonne|t)\b|\u5428/i.test(text(header))
        ? 1000
        : /(?:^|[^k])\bg\b|\u514b/.test(text(header))
          ? 0.001
          : 1)
  );
}
function dimensionUnit(value) {
  const cleaned = text(value).toLowerCase();
  if (/mm|\u6beb\u7c73/.test(cleaned)) return 0.1;
  if (/cm|\u5398\u7c73/.test(cleaned)) return 1;
  if (/(^|[^a-z])m(?:\b|[³3²2])|\u7c73/.test(cleaned)) return 100;
  return null;
}
function dimensionTriplet(value, header) {
  const cleaned = text(value);
  const number = "(\\d+(?:\\.\\d+)?)";
  const unit = "(mm|cm|m)?";
  const match = cleaned.match(
    new RegExp(
      `^\\s*${number}\\s*${unit}\\s*[xX*×]\\s*${number}\\s*${unit}\\s*[xX*×]\\s*${number}\\s*${unit}\\s*$`,
      "i"
    )
  );
  if (!match) return null;
  const fallback = dimensionUnit(match[6] || match[4] || match[2] || header);
  if (!fallback) return null;
  const values = [1, 3, 5].map((index) =>
    round(Number(match[index]) * (dimensionUnit(match[index + 1]) || fallback))
  );
  return values.every((entry) => entry > 0) ? values : null;
}
function issue(group, code, message, row) {
  group.issues.push({ code, message, sourceRowNumber: row + 1 });
}
function columnName(index) {
  let n = index + 1,
    value = "";
  while (n > 0) {
    value = String.fromCharCode(65 + ((n - 1) % 26)) + value;
    n = Math.floor((n - 1) / 26);
  }
  return value;
}
function columnIndex(value) {
  return (
    [...value.toUpperCase()].reduce(
      (sum, character) => sum * 26 + character.charCodeAt(0) - 64,
      0
    ) - 1
  );
}
