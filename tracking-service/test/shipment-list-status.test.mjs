import test from "node:test";
import assert from "node:assert/strict";
import { isEmptyReturnStatus, isShipmentEmptyReturned, shipmentListIndicators } from "../public/shipment-list-status.mjs";

test("completed empty returns recognize carrier wording without confusing planned returns", () => {
  for (const name of ["还空箱", "空箱返还", "空箱已退回", "EMPTY_RETURNED", "EMPTY_RETURN", "Return of empty container", "Empty container returned to depot", "MTY returned", "Empty container return"]) {
    assert.equal(isEmptyReturnStatus(name), true, name);
  }
  for (const name of ["未还空箱", "待还空箱", "预计还空箱", "EMPTY RETURN REQUIRED", "EMPTY PICKUP", "NOT RETURNED EMPTY", "Expected empty returned", "Delivered", "Gate in", "", null]) {
    assert.equal(isEmptyReturnStatus(name), false, String(name));
  }
});

test("all boxes must have current empty-return evidence; old history and missing boxes cannot complete a shipment", () => {
  const returned = { latestEvent: { name: "还空箱" } };
  const delivered = { latestEvent: { name: "Delivered" }, milestones: [{ name: "还空箱" }] };
  const shipment = containers => ({ snapshot: { summary: { latestEvent: { name: "还空箱" } }, containers } });
  assert.equal(isShipmentEmptyReturned(shipment([returned, returned])), true);
  assert.equal(isShipmentEmptyReturned(shipment([returned, delivered])), false);
  assert.equal(isShipmentEmptyReturned(shipment([returned, {}])), false);
  assert.equal(isShipmentEmptyReturned(shipment([returned, null])), false);
  assert.equal(isShipmentEmptyReturned(shipment([])), true);
});

test("explicitly estimated events never mark an empty return complete", () => {
  const event = { name: "Empty returned", actual: false, occurredAt: "2099-01-01T12:00:00Z" };
  assert.equal(isEmptyReturnStatus(event), false);
  assert.equal(isEmptyReturnStatus({ ...event, actual: true }), true);
  for (const container of [{ latestEvent: event }, { currentMilestone: event }, { milestones: [event] }]) {
    assert.equal(isShipmentEmptyReturned({ snapshot: { containers: [container] } }), false);
  }
  assert.equal(isShipmentEmptyReturned({ snapshot: { summary: { latestEvent: event } } }), false);
  assert.equal(isShipmentEmptyReturned({ trackingStatus: "Empty returned", snapshot: { summary: { latestEvent: event } } }), false);
});

test("declared box totals require complete matching details before shipment completion", () => {
  const returned = number => ({ number, latestEvent: "Empty returned" });
  const snapshot = { summary: { containerCount: { declared: 2 }, latestEvent: { name: "Empty returned" } }, containers: [returned("TSTU0000001")] };
  assert.equal(isShipmentEmptyReturned({ snapshot }), false);
  snapshot.containers.push(returned("TSTU0000002"));
  assert.equal(isShipmentEmptyReturned({ snapshot }), true);
  snapshot.summary.containerCount.declared = "2";
  assert.equal(isShipmentEmptyReturned({ snapshot }), true);
  snapshot.containers = [];
  assert.equal(isShipmentEmptyReturned({ snapshot }), false);
  snapshot.summary.containerCount.declared = 0;
  assert.equal(isShipmentEmptyReturned({ snapshot }), false);
  snapshot.summary.containerCount.declared = null;
  assert.equal(isShipmentEmptyReturned({ snapshot }), true);
});

test("green completion and red freshness can coexist and use the business update instead of event dates", () => {
  const entry = {
    businessUpdatedAt: "2026-11-05T10:00:00+08:00",
    snapshot: { summary: { latestEvent: { name: "还空箱", occurredAt: "2026-08-26T10:00:00+08:00" } } }
  };
  assert.deepEqual(shipmentListIndicators(entry, new Date("2026-11-05T12:00:00+08:00")), { emptyReturned: true, createdToday: false, updatedToday: true });
  assert.deepEqual(shipmentListIndicators(entry, new Date("2026-11-06T00:00:00+08:00")), { emptyReturned: true, createdToday: false, updatedToday: false });
  assert.equal(shipmentListIndicators({ snapshot: { summary: { latestEvent: { occurredAt: "2026-11-05T12:00:00+08:00" } } } }, new Date("2026-11-05")).updatedToday, false);
});

test("freshness handles Shanghai midnight and unknown server dates without fabricating updates", () => {
  const now = new Date("2026-11-04T16:10:00Z");
  for (const businessUpdatedAt of ["2026-11-05T00:05:00", "2026-11-04T16:05:00Z"])
    assert.equal(shipmentListIndicators({ businessUpdatedAt }, now).updatedToday, true);
  for (const businessUpdatedAt of [null, "not-a-date", "2026-11-04T23:59:00"])
    assert.equal(shipmentListIndicators({ businessUpdatedAt, snapshot: { fetchedAt: now.toISOString() } }, now).updatedToday, false);
});

test("creation and refresh use separate business timestamps in Shanghai",()=>{
 const now=new Date("2026-11-10T15:59:00Z");
 assert.equal(shipmentListIndicators({businessCreatedAt:"2026-11-10T16:01:00Z"},now).createdToday,false);
 assert.equal(shipmentListIndicators({businessCreatedAt:"2026-11-10T10:00:00",businessUpdatedAt:null},now).createdToday,true);
 assert.equal(shipmentListIndicators({snapshot:{fetchedAt:now.toISOString()}},now).createdToday,false);
 assert.equal(isEmptyReturnStatus({name:"Empty container return",timeType:"ESTIMATED"}),false);
});
