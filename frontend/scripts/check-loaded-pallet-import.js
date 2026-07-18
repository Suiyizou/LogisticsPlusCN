import assert from "node:assert/strict";
import { buildPreview, guessMapping } from "../src/services/excelImport.js";

const headers = [
  "托盘编号",
  "货物名称",
  "SKU/型号",
  "托盘数量",
  "装货后托盘外廓长(cm)",
  "装货后托盘外廓宽(cm)",
  "装货后托盘外廓高(cm)",
  "每托箱数",
  "单箱毛重(kg)",
  "空托盘重量(kg)",
  "单托货物毛重(kg)",
  "单托总毛重(kg)",
  "装货后托盘体积(m³)",
  "堆叠限制",
  "朝向要求",
  "备注"
];

const rows = [
  ["PLT-001", "LED筒灯", "DL-18W-4000K", 1, 120, 100, 138, 24, 12.6, 22, 302.4, 324.4, 1.656, "可堆叠", "无", "缠绕膜加护角"],
  ["PLT-002", "配电箱组件", "DBX-600", 1, 120, 100, 128, 20, 15.75, 22, 315, 337, 1.536, "不可重压", "保持朝上", "易碎，顶部勿压"]
];

const mapping = guessMapping(headers);
assert.equal(mapping.weightKg, "单托总毛重(kg)");
assert.equal(mapping.totalWeightKg, "");
assert.equal(mapping.nonStack, "堆叠限制");
assert.equal(mapping.keepUpright, "朝向要求");
assert.equal(mapping.__packageUnit, "pallet");

const preview = buildPreview({ headers, rows, headerRowIndex: 3 }, mapping, {
  dimensionUnit: "auto",
  weightUnit: "auto"
});

assert.equal(preview.validRows.length, 2);
assert.equal(preview.invalidRows.length, 0);
assert.equal(preview.importedQuantity, 2);
assert.equal(preview.aggregated.reduce((sum, cargo) => sum + cargo.weightKg * cargo.quantity, 0), 661.4);
assert.equal(preview.aggregated.filter((cargo) => cargo.nonStack).length, 1);
assert.equal(preview.aggregated.filter((cargo) => cargo.keepUpright).length, 1);
assert.ok(preview.aggregated.every((cargo) => cargo.type === "pallet"));
assert.ok(preview.aggregated.every((cargo) => cargo.packageInfo?.handlingUnitDimensionsExplicit));

console.log("Loaded-pallet import regression passed.");
