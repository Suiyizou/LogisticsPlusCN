import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  buildPreview,
  detectFinalHandlingUnitCandidates,
  formatWorkbookForRecognition,
  readWorkbook
} from "../src/services/excelImport.js";

const EPSILON = 1e-6;

function assertNear(actual, expected, label, epsilon = EPSILON) {
  assert.ok(
    Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) <= epsilon,
    label + ": expected " + expected + ", received " + actual
  );
}

function setFormula(worksheet, address, formula, value) {
  worksheet[address] = { t: "n", f: formula, v: value };
}

function mergeRanges(ranges) {
  return ranges.map((range) => XLSX.utils.decode_range(range));
}

function workbookBytes(workbook) {
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

function fileLike(name, bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    name,
    arrayBuffer: async () => view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
  };
}

async function fileLikeFromPath(filePath) {
  const bytes = await fs.readFile(filePath);
  return fileLike(path.basename(filePath), bytes);
}

function createSharedAndMixedPalletFixture() {
  const rows = [
    ["装箱清单"],
    [
      "序号", "产品图片", "", "品名", "数量", "装箱数量", "件数", "外箱尺寸",
      "总方数(m³）", "毛重", "总重量（KG）", "备注", "免熏蒸木托盘体积",
      "免熏蒸木托盘重量KG", "数量", "总体积m³", "重量\nKG", ""
    ],
    [1, "", "", "明装筒灯", 1000, "50只/箱", 20, "37*37*38cm", 1.04044, "14.8KG", 296, "", "116*116*168CM", 438, 1, 2.27, 438, ""],
    ["", "", "", "线条灯", 200, "16条/箱", 13, "101*21*21cm", 0.579033, "8.6KG", 111.8, "", "", "", "", "", "", ""],
    ["", "", "", "圆形吊灯", 100, "4只/箱", 25, "81*35*81cm", 5.740875, "16.4KG", 410, "", "116*116*91CM", 293, 6, 7.35, 1758, ""],
    ["", "", "", "圆形吊灯", 100, "4只/箱", 25, "121*35*121cm", 12.810875, "47KG", 1175, "", "121*116*131CM", 171, 8, 14.8, 1368, ""],
    ["", "", "", "圆形吊灯", 100, "2只/箱", 50, "161*19*161cm", 24.62495, "49.8KG", 2480, "", "161*116*171CM", 330, 8, 25.6, 2640, ""],
    ["合计", "合计：", "", "", "", "", 133, "", 44.796173, "", 4472.8, "", "161*116*171CM", 194, 1, 3.2, 194, "这个托盘拼装（直径1.6米2件/直径1.2米1件/直径0.8米1件）"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", 53.22, 6398, ""]
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = mergeRanges([
    "A1:L1", "B2:C2", "B8:E8",
    "M3:M4", "N3:N4", "O3:O4", "P3:P4", "Q3:Q4"
  ]);
  setFormula(worksheet, "Q5", "O5*N5", 1758);
  setFormula(worksheet, "Q6", "O6*N6", 1368);
  setFormula(worksheet, "Q7", "O7*N7", 2640);
  setFormula(worksheet, "G8", "SUM(G3:G7)", 133);
  setFormula(worksheet, "I8", "SUM(I3:I7)", 44.796173);
  setFormula(worksheet, "K8", "SUM(K3:K7)", 4472.8);
  setFormula(worksheet, "Q8", "O8*N8", 194);
  setFormula(worksheet, "P9", "SUM(P3:P8)", 53.22);
  setFormula(worksheet, "Q9", "SUM(Q3:Q8)", 6398);
  worksheet["!ref"] = "A1:XFD9";

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return fileLike("fixture-装箱清单(2).xlsx", workbookBytes(workbook));
}

function createMultiRowPalletHeaderFixture() {
  const rows = [
    ["PL", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Size", "T.CTNS", "QTY", "", "N.W（KGS)", "G.W（KGS)", "T N.W（KGS)", "T G.W（KGS)", "CARTON SIZE(CM)", "", "", "PALLET SIZE(M)", "", "", "T.CBM", "G.W（KGS)"],
    ["", "", "PCS/CTN", "Order Qty", "", "", "", "", "L", "W", "H", "L", "W", "H", "", ""],
    ["尺寸", "总箱数", "数量", "", "单箱净重量（KGS)", "单箱毛重量（KGS)", "总箱净重量（KGS)", "总箱毛重量（KGS)", "单纸箱尺寸(CM)", "", "", "托盘尺寸(M)", "", "", "12个托盘总方数", "12个托盘总重量"],
    ["", "", "个/箱", "总数量", "", "", "", "", "长", "宽", "高", "长", "宽", "高", "", ""],
    [6012, 250, 4, 1000, 13.6, 15, 3400, 3750, 126.5, 17, 65, 1.3, 1.2, 2.1, 39.312, 3930],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", 250, "", 1000, "", "", 3400, 3750, "", "", "", "", "", "", 39.312, 3930],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = mergeRanges([
    "A1:P1",
    "A2:A3", "B2:B3", "C2:D2", "E2:E3", "F2:F3", "G2:G3", "H2:H3",
    "I2:K2", "L2:N2", "O2:O3", "P2:P3",
    "A4:A5", "B4:B5", "C4:D4", "E4:E5", "F4:F5", "G4:G5", "H4:H5",
    "I4:K4", "L4:N4", "O4:O5", "P4:P5"
  ]);
  setFormula(worksheet, "D6", "B6*C6", 1000);
  setFormula(worksheet, "G6", "B6*E6", 3400);
  setFormula(worksheet, "H6", "B6*F6", 3750);
  setFormula(worksheet, "O6", "1.3*1.2*2.1*12", 39.312);
  setFormula(worksheet, "P6", "250*15+12*15", 3930);
  setFormula(worksheet, "B8", "B6", 250);
  setFormula(worksheet, "D8", "SUM(D6:D7)", 1000);
  setFormula(worksheet, "G8", "SUM(G6:G7)", 3400);
  setFormula(worksheet, "H8", "SUM(H6:H7)", 3750);
  setFormula(worksheet, "O8", "SUM(O6:O6)", 39.312);
  setFormula(worksheet, "P8", "SUM(P6:P7)", 3930);
  worksheet["!ref"] = "A1:P9";

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "Sheet2");
  return fileLike("fixture-装箱清单(4).xlsx", workbookBytes(workbook));
}

function previewForSheet(sheet) {
  return buildPreview(sheet, sheet.mapping || {}, {
    dimensionUnit: "auto",
    weightUnit: "auto"
  });
}

function previewCargos(preview) {
  return preview.validRows.map((row) => row.cargo);
}

function sumCargoField(cargos, field) {
  return cargos.reduce((sum, cargo) => sum + Number(cargo.packageInfo?.[field] || 0), 0);
}

function loadedGrossTotal(cargos) {
  return cargos.reduce((sum, cargo) => sum + Number(cargo.quantity || 0) * Number(cargo.weightKg || 0), 0);
}

async function assertSharedAndMixedPalletWorkbook(file) {
  const workbook = await readWorkbook(file);
  assert.equal(workbook.sheets.length, 1, "装箱清单(2) should contain one sheet");
  const sheet = workbook.sheets[0];
  const maxRawColumns = Math.max(0, ...sheet.rawRows.map((row) => row.length));
  assert.equal(maxRawColumns, 18, "style-only columns through XFD must be trimmed to the effective A:R range");
  assert.ok(sheet.rawRows.every((row) => row.length <= 18), "raw rows must not retain the declared XFD tail");
  assert.ok(sheet.mergeCells.some((merge) => merge.range === "M3:M4" && merge.value === "116*116*168CM"), "merge metadata must retain M3:M4 and its anchor value");
  assert.ok(sheet.formulaCells.some((cell) => cell.address === "Q9" && cell.formula === "SUM(Q3:Q8)"), "source formula metadata must be retained");

  const candidates = detectFinalHandlingUnitCandidates(sheet);
  assert.equal(candidates.length, 5, "装箱清单(2) should produce five final pallet candidates");
  assert.equal(candidates.filter((candidate) => candidate.sourceRange === "R3:R4").length, 1, "R3:R4 merged pallet must produce exactly one candidate");
  assert.equal(candidates[0].cargo.packageInfo?.innerCargo?.lines?.[0]?.cartonGrossWeightKg, 14.8);
  assert.equal(candidates[3].cargo.packageInfo?.innerCargo?.lines?.[0]?.sourceTotalMismatch, true, "R7 explicit total and carton-unit weight mismatch must remain visible for review");
  const mixedCandidate = candidates.find((candidate) => candidate.sourceRange === "R8:R8");
  assert.ok(mixedCandidate, "R8 assembled pallet must be retained");
  assert.equal(mixedCandidate.cargo.packageInfo?.mixedPallet, true, "R8 must be marked as a mixed pallet");
  assert.equal(mixedCandidate.cargo.packageInfo?.innerCargo?.cartonCount, 4, "R8 must receive the 1/1/2 leftover cartons");

  const preview = previewForSheet(sheet);
  const cargos = previewCargos(preview);
  assert.equal(preview.validRows.length, 5);
  assert.equal(preview.invalidRows.length, 0);
  assert.equal(preview.aggregated.length, 5);
  assert.equal(preview.importedQuantity, 24, "algorithm quantity must be 24 pallets, not 133 cartons");
  assertNear(sumCargoField(cargos, "palletTotalTareWeightKg"), 6398, "total pallet/wood-package tare");
  assertNear(loadedGrossTotal(cargos), 10870.8, "total loaded gross weight");

  const sharedCargo = cargos.find((cargo) => cargo.packageInfo?.sourceRange === "R3:R4");
  assert.ok(sharedCargo, "preview must retain the shared R3:R4 pallet");
  assert.deepEqual(sharedCargo.packageInfo?.sourceRows, [3, 4]);
  assert.equal(sharedCargo.packageInfo?.sharedMergedRows, true);
  assert.equal(sharedCargo.quantity, 1);

  const mixedCargo = cargos.find((cargo) => cargo.packageInfo?.sourceRange === "R8:R8");
  assert.ok(mixedCargo, "preview must retain the R8 assembled pallet");
  assert.equal(mixedCargo.packageInfo?.mixedPallet, true);
  assert.match(mixedCargo.remark, /拼装|混装/);

  const recognition = formatWorkbookForRecognition(workbook);
  assert.match(recognition, /MERGED_RANGES:/);
  assert.match(recognition, /MERGED_ROW_SPAN R3:R4:/);
  assert.match(recognition, /FINAL_HANDLING_UNIT_CANDIDATES:/);
  assert.match(recognition, /FINAL_PACKAGE_CANDIDATE 5:/);
  assert.match(recognition, /"sharedMergedRows":true/);
  return { workbook, preview };
}

async function assertMultiRowPalletHeaderWorkbook(file) {
  const workbook = await readWorkbook(file);
  assert.equal(workbook.sheets.length, 2, "装箱清单(4) should retain the empty Sheet2");
  const sheet = workbook.sheets[0];
  const emptySheet = workbook.sheets[1];
  assert.equal(Math.max(0, ...sheet.rawRows.map((row) => row.length)), 16);
  assert.ok(sheet.mergeCells.length >= 23, "multi-row bilingual header merge metadata must be retained");

  const preview = previewForSheet(sheet);
  assert.equal(preview.validRows.length, 1);
  assert.equal(preview.invalidRows.length, 0);
  assert.equal(preview.aggregated.length, 1);
  assert.equal(preview.importedQuantity, 12, "algorithm quantity must be 12 pallets");
  const cargo = preview.aggregated[0];
  assert.deepEqual([cargo.lengthCm, cargo.widthCm, cargo.heightCm], [130, 120, 210]);
  assertNear(cargo.weightKg, 327.5, "unit loaded gross weight");
  assertNear(Number(cargo.quantity) * Number(cargo.weightKg), 3930, "total loaded gross weight");
  assert.equal(cargo.packageInfo?.packageTotalGrossWeightKg, 3930);
  assert.equal(cargo.packageInfo?.palletTareWeightKg, 15);
  assert.equal(cargo.packageInfo?.palletTotalTareWeightKg, 180);
  assert.equal(cargo.packageInfo?.innerCargo?.cartonCount, 250);
  assert.equal(cargo.packageInfo?.innerCargo?.totalQuantity, 1000);
  assert.equal(cargo.packageInfo?.innerCargo?.cartonGrossWeightKg, 15);

  const p6Formula = sheet.formulaCells.find((cell) => cell.address === "P6");
  const o6Formula = sheet.formulaCells.find((cell) => cell.address === "O6");
  assert.equal(p6Formula?.formula.replace(/\s+/g, ""), "250*15+12*15");
  assert.equal(o6Formula?.formula.replace(/\s+/g, ""), "1.3*1.2*2.1*12");

  assert.equal(emptySheet.rawRows.length, 0);
  assert.equal(emptySheet.rows.length, 0);
  assert.equal(emptySheet.mergeCells.length, 0);
  assert.equal(emptySheet.formulaCells.length, 0);
  const emptyPreview = previewForSheet(emptySheet);
  assert.equal(emptyPreview.totalRows, 0);
  assert.equal(emptyPreview.validRows.length, 0);
  assert.equal(emptyPreview.aggregated.length, 0);
  assert.equal(emptyPreview.importedQuantity, 0);

  const recognition = formatWorkbookForRecognition(workbook);
  assert.match(recognition, /FORMULA_CELLS:/);
  assert.match(recognition, /O6=/);
  assert.match(recognition, /P6=/);
  assert.match(recognition, /FINAL_HANDLING_UNIT_CANDIDATES:/);
  assert.match(recognition, /"palletTareWeightKg":15/);
  assert.match(recognition, /"packageQuantity":12/);
  return { workbook, preview };
}

async function main() {
  const paths = process.argv.slice(2);
  assert.ok(
    paths.length === 0 || paths.length === 2,
    "Usage: npm run test:irregular-pallet-import -- [装箱清单(2).xlsx] [装箱清单(4).xlsx]"
  );

  const [sharedPalletFile, multiRowHeaderFile] = paths.length === 2
    ? [await fileLikeFromPath(paths[0]), await fileLikeFromPath(paths[1])]
    : [createSharedAndMixedPalletFixture(), createMultiRowPalletHeaderFixture()];

  await assertSharedAndMixedPalletWorkbook(sharedPalletFile);
  await assertMultiRowPalletHeaderWorkbook(multiRowHeaderFile);

  const mode = paths.length === 2 ? "real XLSX files" : "generated merged-cell fixtures";
  console.log("Irregular pallet import regression passed (" + mode + ").");
}

await main();
