import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  aggregateCargos,
  buildPreview,
  detectFinalHandlingUnitCandidates,
  formatWorkbookForRecognition,
  guessMapping,
  readWorkbook,
  validateCargo
} from "../src/services/excelImport.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../backend/src/test/resources/packing-lists/mixed-package-source.json",
      import.meta.url
    ),
    "utf8"
  )
);
const headers = [
  "Item",
  "Marks",
  "Product",
  "Size",
  "QTY",
  "Single N.W.(kg)",
  "N.W (kg)",
  "G.W (kg)",
  "Volume (m³)"
];
const row = (item, marks, quantity = 20, weight = 810, dimensions = "1.1*1.1*1.15") => [
  item,
  marks,
  "VALVE",
  "DN200",
  quantity,
  36,
  746,
  weight,
  dimensions
];
const sheet = (rows, overrides = {}) => ({
  name: "Packages",
  headers,
  headerRowIndex: 0,
  rows,
  ...overrides
});
const preview = (source) => buildPreview(source, guessMapping(source.headers));
const issues = (result) => result.reconciliation.blockedItems.map((issue) => issue.code);

test("the anonymized mixed packing list yields 75 physical packages and conserves all source totals", () => {
  const result = preview(fixture.sheet);
  assert.equal(result.validRows.length, fixture.expected.packageCount);
  assert.equal(result.invalidRows.length, 0);
  assert.equal(result.aggregated.length, fixture.expected.packageCount);
  assert.equal(result.importedQuantity, 75);
  assert.deepEqual(result.reconciliation, {
    basis: "explicit-package",
    packageCount: 75,
    innerQuantity: 6925,
    grossWeightKg: 74575,
    calculatedVolumeM3: 93.528148,
    declaredPackageCount: 75,
    declaredInnerQuantity: 6925,
    declaredGrossWeightKg: 74575,
    declaredVolumeM3: 96,
    blockedItems: [],
    complete: true
  });
  assert.equal(
    result.aggregated.reduce((sum, cargo) => sum + cargo.quantity * cargo.weightKg, 0),
    74575
  );
  assert.equal(
    result.aggregated.reduce((sum, cargo) => sum + cargo.packageInfo.innerCargo.totalQuantity, 0),
    6925
  );
  assert.ok(result.aggregated.every((cargo) => cargo.quantity === 1));
  const first = result.aggregated[0];
  assert.equal(first.packageNo, "1");
  assert.equal(first.marks, "PACK#1");
  assert.deepEqual(first.packageInfo.sourceRows, [9, 10]);
  assert.equal(first.packageInfo.innerCargo.lines.length, 2);
  assert.deepEqual(
    first.packageInfo.innerCargo.lines.map((line) => [
      line.model,
      line.quantity,
      line.unitNetWeightKg
    ]),
    [
      ["DN200-PN16", 20, 36],
      ["DN100", 2, 13]
    ]
  );
});

test("formatted Agent candidates retain package identity and every mixed content line", () => {
  const formatted = formatWorkbookForRecognition({
    fileName: "mixed-package.xls",
    sheets: [fixture.sheet]
  });
  const lines = formatted.split("\n").filter((line) => line.startsWith("FINAL_PACKAGE_CANDIDATE "));
  assert.equal(lines.length, 75);
  const first = JSON.parse(lines[0].slice(lines[0].indexOf(": ") + 2));
  assert.equal(first.packageNo, "1");
  assert.equal(first.marks, "PACK#1");
  assert.equal(first.sourceSheet, "Packages");
  assert.equal(first.quantity, 1);
  assert.equal(first.packageInfo.innerCargo.totalQuantity, 22);
  assert.equal(first.packageInfo.innerCargo.lines[1].sourceRowNumber, 10);
  assert.match(formatted, /EXPLICIT_PACKAGE_RECONCILIATION:.*"packageCount":75/);
});

test("same specifications never collapse identified physical packages, including across sheets", () => {
  const first = detectFinalHandlingUnitCandidates(
    sheet([row("1", "CASE#1"), row("2", "CASE#2")])
  ).map((candidate) => candidate.cargo);
  const other = detectFinalHandlingUnitCandidates(
    sheet([row("1", "CASE#1")], { name: "Second" })
  ).map((candidate) => candidate.cargo);
  const result = aggregateCargos([...first, ...other]);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((cargo) => [cargo.sourceSheet, cargo.marks, cargo.quantity]),
    [
      ["Packages", "CASE#1", 1],
      ["Packages", "CASE#2", 1],
      ["Second", "CASE#1", 1]
    ]
  );
  assert.equal(
    result.reduce((sum, cargo) => sum + cargo.quantity * cargo.weightKg, 0),
    2430
  );
});

test("ordinary anonymous cargo retains legacy quantity aggregation and per-unit mass semantics", () => {
  const normal = {
    name: "Plain carton",
    model: "",
    lengthCm: 20,
    widthCm: 30,
    heightCm: 40,
    quantity: 2,
    weightKg: 5,
    type: "normal"
  };
  const result = aggregateCargos([normal, { ...normal, quantity: 3 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, 5);
  assert.equal(result[0].weightKg, 5);
});

test("vertically merged identity and outer dimensions apply once while all product continuations survive", () => {
  const source = sheet([row("1", "CASE#1"), ["", "", "JOINT", "DN100", 2, 13, "", "", ""]], {
    merges: ["A2:A3", "B2:B3", "G2:G3", "H2:H3", "I2:I3"]
  });
  const result = preview(source);
  assert.equal(result.aggregated.length, 1);
  const cargo = result.aggregated[0];
  assert.equal(cargo.quantity, 1);
  assert.equal(cargo.weightKg, 810);
  assert.equal(cargo.packageInfo.innerCargo.totalQuantity, 22);
  assert.equal(cargo.packageInfo.innerCargo.lines[1].name, "JOINT");
  assert.deepEqual(cargo.packageInfo.sourceRows, [2, 3]);
});

test("missing package weight or three-dimensional outer size remains blocked instead of guessed", () => {
  const source = sheet([row("1", "CASE#1", 20, "", "1.2"), row("2", "CASE#2", 10, 500, "")]);
  const result = preview(source);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 2);
  assert.equal(result.reconciliation.packageCount, 2);
  assert.equal(result.reconciliation.complete, false);
  assert.ok(issues(result).includes("PACKAGE_GROSS_WEIGHT_MISSING"));
  assert.ok(issues(result).includes("PACKAGE_DIMENSIONS_MISSING"));
  assert.equal(result.invalidRows[0].cargo.weightKg, 0);
  assert.equal(result.invalidRows[0].cargo.lengthCm, 0);
});

test("ranged, numeric or missing marks are retained as blocked package records", () => {
  for (const marks of ["CASE#1~12", "CASE#1-12", "12345", ""]) {
    const result = preview(sheet([row("1", marks)]));
    assert.equal(result.reconciliation.packageCount, 1);
    assert.equal(result.invalidRows.length, 1);
    assert.equal(result.reconciliation.complete, false);
    assert.ok(issues(result).some((code) => /PACKAGE_IDENTITY_/.test(code)));
  }
});

test("duplicate marks on separate anchors are blocked without silently combining them", () => {
  const result = preview(sheet([row("1", "CASE#1"), row("2", "CASE#1")]));
  assert.equal(result.reconciliation.packageCount, 2);
  assert.equal(result.invalidRows.length, 2);
  assert.ok(issues(result).includes("PACKAGE_IDENTITY_AMBIGUOUS"));
});

test("missing, fractional and orphan continuation quantities block extraction", () => {
  for (const quantity of ["", 1.5, -2]) {
    const result = preview(sheet([row("1", "CASE#1"), ["", "", "JOINT", "DN100", quantity]]));
    assert.ok(issues(result).includes("PACKAGE_CONTENT_QUANTITY_INVALID"));
    assert.equal(result.invalidRows.length, 1);
  }
  const orphan = preview(sheet([["", "", "JOINT", "DN100", 2], row("1", "CASE#1")]));
  assert.ok(issues(orphan).includes("PACKAGE_ORPHAN_CONTENT"));
  assert.equal(orphan.reconciliation.packageCount, 2);
});

test("table footer stops package enumeration and explicit totals must reconcile", () => {
  const rows = [
    row("1", "CASE#1"),
    ["TOTAL", "", "", "", 20, "", 746, 810, 1.5],
    ["TOTAL 1PKGS, 810KG, 1.5CBM"],
    row("2", "NOT-TABLE#2")
  ];
  const result = preview(sheet(rows));
  assert.equal(result.reconciliation.packageCount, 1);
  assert.equal(result.reconciliation.complete, true);
  assert.equal(result.reconciliation.declaredVolumeM3, 1.5);
  const wrong = structuredClone(rows);
  wrong[1][4] = 100;
  assert.ok(issues(preview(sheet(wrong))).includes("PACKAGE_SOURCE_TOTAL_MISMATCH"));
});

test("exported package metadata and contents survive a real XLSX readback", async () => {
  const cargos = detectFinalHandlingUnitCandidates(
    sheet([row("1", "CASE#1"), ["", "", "JOINT", "DN100", 2, 13], row("2", "CASE#2")])
  ).map((candidate) => candidate.cargo);
  const exported = cargos.map((cargo) => ({
    name: cargo.name,
    model: cargo.model,
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    quantity: cargo.quantity,
    weightKg: cargo.weightKg,
    type: cargo.type,
    nonStack: false,
    keepUpright: false,
    color: "",
    sku: "",
    remark: cargo.remark,
    packageNo: cargo.packageNo,
    marks: cargo.marks,
    sourceSheet: cargo.sourceSheet,
    sourceRows: JSON.stringify(cargo.packageInfo.sourceRows),
    innerQuantity: cargo.packageInfo.innerCargo.totalQuantity,
    totalWeightKg: cargo.weightKg,
    innerCargoJson: JSON.stringify(cargo.packageInfo.innerCargo),
    packageInfoJson: JSON.stringify(cargo.packageInfo)
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exported), "roundtrip");
  const file = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "export.xlsx");
  const read = await readWorkbook(file);
  const result = preview(read.sheets[0]);
  assert.equal(result.invalidRows.length, 0);
  assert.equal(result.aggregated.length, 2);
  assert.equal(result.aggregated[0].marks, "CASE#1");
  assert.equal(result.aggregated[0].sourceSheet, "Packages");
  assert.deepEqual(result.aggregated[0].packageInfo.sourceRows, [2, 3]);
  assert.equal(result.aggregated[0].packageInfo.innerCargo.totalQuantity, 22);
  assert.equal(result.aggregated[0].packageInfo.innerCargo.lines[1].model, "DN100");
});

test("an identified package cannot reenter the algorithm with product QTY or corrupt exported JSON", () => {
  const cargo = detectFinalHandlingUnitCandidates(sheet([row("1", "CASE#1")]))[0].cargo;
  assert.ok(
    validateCargo({ ...cargo, quantity: 20 }).some((error) => error.includes("quantity 1"))
  );
  const source = {
    name: "export",
    headerRowIndex: 0,
    headers: [
      "name",
      "lengthCm",
      "widthCm",
      "heightCm",
      "quantity",
      "weightKg",
      "packageNo",
      "marks",
      "packageInfoJson"
    ],
    rows: [["Valve", 110, 110, 115, 1, 810, "1", "CASE#1", "{broken"]]
  };
  const result = preview(source);
  assert.equal(result.validRows.length, 0);
  assert.match(result.invalidRows[0].errors.join(" "), /PACKAGE_METADATA_INVALID/);
});
