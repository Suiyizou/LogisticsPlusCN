import assert from "node:assert/strict";
import test from "node:test";
import {
  hasRefreshIssue,
  shipmentBusinessState,
  preferredTrackingReference,
  needsManualSupplement,
  shipmentClientLabel,
  shipmentBoundUsers,
  primaryBoundCustomerName
} from "../src/features/shipments/shipmentPresentation.js";

test("business status preserves server decisions and completion outranks refresh errors", () => {
  assert.equal(
    shipmentBusinessState({
      businessState: "today_pending",
      trackingStatus: "EMPTY_RETURNED",
      lastRefreshResult: "FAILED"
    }),
    "TODAY_PENDING"
  );
  assert.equal(
    shipmentBusinessState({
      businessState: "unknown",
      trackingStatus: "EMPTY_RETURNED",
      lastRefreshResult: "FAILED"
    }),
    "COMPLETED"
  );
  assert.equal(
    shipmentBusinessState({ lastRefreshResult: "partial", hasValidTracking: false }),
    "UPDATE_FAILED"
  );
  assert.equal(hasRefreshIssue({ lastRefreshResult: "partial" }), true);
  assert.equal(hasRefreshIssue({ lastRefreshResult: "SUCCESS" }), false);
});

test("manual and daily update classifications use local calendar boundaries", () => {
  const now = new Date(2026, 9, 11, 0, 5);
  assert.equal(
    shipmentBusinessState({ sourceChannel: "imported_manual", lastTrackedAt: now }, now),
    "MANUAL_REQUIRED"
  );
  assert.equal(
    shipmentBusinessState({ hasValidTracking: false, lastTrackedAt: now }, now),
    "MANUAL_REQUIRED"
  );
  assert.equal(shipmentBusinessState({ lastTrackedAt: now }, now), "TODAY_UPDATED");
  assert.equal(
    shipmentBusinessState({ lastTrackedAt: new Date(2026, 9, 10, 23, 59) }, now),
    "TODAY_PENDING"
  );
  assert.equal(shipmentBusinessState({}, now), "MANUAL_REQUIRED");
});

test("tracking reference uses explicit bookings and only converts numeric COSCO bill references", () => {
  const row = Object.freeze({
    carrier: "cosco",
    bookingNumber: " B123 ",
    referenceType: "BILLOFLADING",
    referenceNo: "COSU123456789"
  });
  assert.deepEqual(preferredTrackingReference(row), { type: "BOOKING", number: "B123" });
  assert.deepEqual(preferredTrackingReference({ ...row, bookingNumber: "" }), {
    type: "BOOKING",
    number: "123456789"
  });
  for (const record of [
    { carrier: "MSC", referenceType: "BILLOFLADING", referenceNo: "123456789" },
    { carrier: "COSCO", referenceType: "BILLOFLADING", referenceNo: "COSU1234567" },
    { referenceType: "CONTAINER", referenceNo: "COSU1234567" }
  ]) {
    assert.deepEqual(preferredTrackingReference(record), { type: "BOOKING", number: "" });
  }
  assert.deepEqual(preferredTrackingReference({ referenceNo: " 987654321 " }), {
    type: "BOOKING",
    number: "987654321"
  });
});

test("bound user records retain source priority, roles and identity deduplication", () => {
  const shipment = {
    boundUsers: [
      "A",
      { id: "A", displayName: "duplicate" },
      { displayName: "Same", partyRole: "SHIPPER" },
      { displayName: "Same", relationshipRole: "CONSIGNEE" }
    ],
    participants: [{ id: "ignored" }]
  };
  const snapshot = structuredClone(shipment);
  const users = shipmentBoundUsers(shipment);
  assert.deepEqual(
    users.map((u) => [u.name, u.role]),
    [
      ["A", ""],
      ["Same", "SHIPPER"],
      ["Same", "CONSIGNEE"]
    ]
  );
  assert.deepEqual(shipment, snapshot);
});

test("empty direct users fall back to explicit current directory and retain unknown customer IDs", () => {
  const shipment = { shipmentId: "S", boundUsers: [], participants: [{ id: "ignored" }] };
  const directory = {
    customers: [{ id: "A", displayName: "Original", partyRole: "SHIPPER" }],
    shipmentCustomerMap: { S: ["A", "missing"] }
  };
  assert.deepEqual(
    shipmentBoundUsers(shipment, directory).map((u) => u.name),
    ["Original", "missing"]
  );
  directory.customers = [{ id: "A", displayName: "Updated", partyRole: "SHIPPER" }];
  assert.equal(primaryBoundCustomerName(shipment, directory), "Updated");
  assert.deepEqual(shipmentBoundUsers({ shipmentId: "other" }, directory), []);
});

test("primary customer favors shipper then consignee and excludes an agent-only relationship", () => {
  const agent = { id: "agent", displayName: "Agent", partyRole: "OVERSEA_AGENT" },
    consignee = { id: "C", displayName: "Consignee", partyRole: "CONSIGNEE" },
    shipper = { id: "S", displayName: "Shipper", partyRole: "SHIPPER" };
  assert.equal(primaryBoundCustomerName({ participants: [agent, consignee, shipper] }), "Shipper");
  assert.equal(primaryBoundCustomerName({ participants: [agent, consignee] }), "Consignee");
  assert.equal(primaryBoundCustomerName({ participants: [agent] }), "");
});

test("client labels avoid duplicate codes and resolve bound customer display data", () => {
  assert.equal(shipmentClientLabel({ clientNo: "ABC", clientName: "ABC" }), "ABC");
  assert.equal(
    shipmentClientLabel({ clientNameCode: "ABC", clientName: "Customer" }),
    "ABC / Customer"
  );
  assert.equal(
    shipmentClientLabel({
      boundCustomers: ["Direct", { clientCode: "XYZ", displayName: "Company" }]
    }),
    "Direct / XYZ / Company"
  );
  assert.equal(shipmentClientLabel({}), "—");
});

test("manual supplement flags and blank tracking values remain distinct from normal statuses", () => {
  assert.equal(
    needsManualSupplement({ manualSupplementRequired: true, trackingStatus: "IN_TRANSIT" }),
    true
  );
  assert.equal(needsManualSupplement({ trackingStatus: "  " }), true);
  assert.equal(needsManualSupplement({ trackingStatus: "IN_TRANSIT" }), false);
});
