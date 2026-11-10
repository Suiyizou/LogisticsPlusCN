import test from "node:test";
import assert from "node:assert/strict";
import { prepareSheet, buildShipmentBatchPreview } from "../src/services/shipmentBatchImport.js";

test("an explicit row type takes precedence over a shared bill header in a mixed carrier list", () => {
  const sheet = prepareSheet("Mixed shipments", [
    ["船东简称", "提单号码", "单号类型"],
    ["CMA CGM", "TJN1234567", "订舱号"],
    ["MAERSK", "MAEU123456789", "提单号"],
    ["COSCO", "COSU1234567890", "提单号"],
  ]);
  const preview = buildShipmentBatchPreview(sheet, 1, "", "BILLOFLADING", {
    adapterMode: "LOCAL_QUEUE", queryOnly: true,
  });
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.rows.map(row => [row.carrier, row.type, row.number]), [
    ["CMA", "BOOKING", "TJN1234567"],
    ["MAERSK", "BILLOFLADING", "MAEU123456789"],
    ["COSCO", "BILLOFLADING", "COSU1234567890"],
  ]);
});

test("an unknown declared row type remains blocked even under an explicit bill header", () => {
  const sheet = prepareSheet("Unknown type", [
    ["船司", "提单号码", "单号类型"],
    ["MAERSK", "MAEU123456789", "待确认"],
  ]);
  const preview = buildShipmentBatchPreview(sheet, 1, "", "BILLOFLADING", {
    adapterMode: "LOCAL_QUEUE", queryOnly: true,
  });
  assert.equal(preview.items.length, 0);
  assert.ok(preview.errors.some(error => error.code === "MISSING_TYPE"));
});
