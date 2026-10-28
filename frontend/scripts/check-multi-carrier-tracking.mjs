import assert from "node:assert/strict";
import { buildShipmentBatchItems } from "../src/services/shipmentBatchImport.js";
import { TRACKING_CARRIERS } from "../src/services/trackingCarriers.js";

for (const carrier of TRACKING_CARRIERS) {
  const sheet = { name: "Business", headers: ["BOOKING NO."], rows: [["BOOKING NO."], ["TEST123456"]] };
  const [item] = buildShipmentBatchItems(sheet, 0, carrier.code);
  assert.equal(item.carrier, carrier.code);
  assert.equal(item.manualOnly, false);
}

const sheet = { name: "Bills", headers: ["B/L", "CARRIER"], rows: [["B/L", "CARRIER"], ["HLCUTEST12345", "Hapag-Lloyd"]] };
const [bill] = buildShipmentBatchItems(sheet, 0, "HAPAG_LLOYD", "BILLOFLADING");
assert.equal(bill.carrier, "HAPAG_LLOYD");
assert.equal(bill.type, "BILLOFLADING");
assert.equal(bill.number, "HLCUTEST12345");
assert.equal(bill.manualOnly, false);
console.log("multi-carrier ticket import checks passed");
