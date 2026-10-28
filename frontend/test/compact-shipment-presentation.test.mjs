import test from "node:test";
import assert from "node:assert/strict";
import {
  compactShipmentDate,
  compactShipmentId
} from "../src/features/shipments/compactShipmentPresentation.js";
import { readFileSync } from "node:fs";
import { parse } from "@vue/compiler-sfc";
import { transform } from "esbuild";
import vm from "node:vm";

test("compact shipment labels shorten only UUIDs and keep dates meaningful without inventing a time", () => {
  assert.equal(compactShipmentId("a0ed3d27-1281-40d9-8544-792140c7a249"), "a0ed3d27…c7a249");
  assert.equal(compactShipmentId("UI-PREVIEW-BOOKING"), "UI-PREVIEW-BOOKING");
  assert.equal(compactShipmentId("9509345620"), "9509345620");
  assert.equal(compactShipmentDate("2026-10-28T12:45:16"), "2026-10-28 12:45");
  assert.equal(compactShipmentDate("2026-10-28"), "2026-10-28");
  assert.equal(compactShipmentDate("unrecognized source time"), "unrecognized source time");
  assert.equal(compactShipmentDate(null), "—");
});

test("the real row menu dispatches original actions and rechecks current manager/busy state", async () => {
  const source = readFileSync(
    new URL("../src/modules/shipments/pages/ShipmentListPage.vue", import.meta.url),
    "utf8"
  );
  const script = parse(source).descriptor.scriptSetup.content;
  const from = script.indexOf("function onRowCommand(");
  const to = script.indexOf("function clearShipmentFilters", from);
  const { code } = await transform(script.slice(from, to), { loader: "ts" });
  for (const manager of [true, false]) {
    for (const busy of [true, false]) {
      const calls = [];
      const row = { shipmentId: "real-record", carrier: "COSCO" };
      const context = vm.createContext({
        isManager: { value: manager },
        refreshingShipment: { value: busy },
        updateShipmentTracking: (record) => calls.push(["update", record]),
        deleteShipmentRow: (record) => calls.push(["delete", record])
      });
      vm.runInContext(code, context);
      context.onRowCommand("update", row);
      context.onRowCommand("delete", row);
      context.onRowCommand("unsupported", row);
      assert.deepEqual(
        calls.map(([action]) => action),
        manager ? (busy ? ["delete"] : ["update", "delete"]) : []
      );
      assert.ok(
        calls.every(([, record]) => record === row),
        "row identity goes to the original action unchanged"
      );
    }
  }
});
