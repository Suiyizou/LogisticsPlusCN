import assert from "node:assert/strict";
import test from "node:test";
import {
  carrierReferenceForDisplay,
  reportedRouteTime,
  snapshotContainerCounts
} from "../public/tracking-snapshot-presentation.mjs";

test("explicit route display dates remain distinct from history and typed actual or estimated dates", () => {
  const snapshot = {
    summary: { origin: { name: "Shanghai" }, destination: { name: "Los Angeles" } },
    sourceDetails: {
      fields: [
        { key: "milestone_departure", source: "shipment.fields", value: "2026-10-02 06:00" },
        { key: "origin_departure", source: "shipment.fields_extra", value: "2026-10-01 07:20" },
        {
          key: "destination_arrival",
          source: "shipment.fields_extra",
          value: "Nov 11, page footer"
        }
      ],
      additionalEvents: [{ name: "Vessel Departure from POL", reportedTime: "2026-10-12 07:00" }]
    }
  };
  assert.deepEqual(reportedRouteTime(snapshot, "departure"), {
    time: "2026-10-01 07:20",
    location: "Shanghai"
  });
  assert.equal(reportedRouteTime(snapshot, "arrival"), null);
  snapshot.sourceDetails.fields = [];
  assert.equal(reportedRouteTime(snapshot, "departure"), null);
  snapshot.sourceDetails.extraFields = { destination_arrival: "2026-11-11 20:00" };
  assert.deepEqual(reportedRouteTime(snapshot, "arrival"), {
    time: "2026-11-11 20:00",
    location: "Los Angeles"
  });
  snapshot.sourceDetails.noBusinessData = true;
  assert.equal(reportedRouteTime(snapshot, "arrival"), null);
});

test("container metrics distinguish carrier-declared quantity from returned detail rows", () => {
  const containers = [{ number: "TEST0000000" }];
  const count = (declared, rows = containers) =>
    snapshotContainerCounts({
      summary: { containerCount: { declared, extracted: 8 } },
      containers: rows
    });
  assert.deepEqual(count("8", []), { declared: 8, returned: 0 });
  assert.deepEqual(count(null), { declared: null, returned: 1 });
  assert.deepEqual(count(0, []), { declared: 0, returned: 0 });
  assert.deepEqual(count("unknown"), { declared: null, returned: 1 });
});

test("unverified identifier fields keep HMM bill numbers and suppress carrier page labels", () => {
  const unverified = { sourceDetails: { businessVerified: false } };
  assert.equal(carrierReferenceForDisplay(unverified, "Booking Confirmed"), "");
  assert.equal(carrierReferenceForDisplay(unverified, "搜 索"), "");
  assert.equal(carrierReferenceForDisplay(unverified, "SHAM54160100"), "SHAM54160100");
  assert.equal(carrierReferenceForDisplay(unverified, "AB-104/2"), "AB-104/2");
  assert.equal(carrierReferenceForDisplay({}, "CUSTOM-REF"), "CUSTOM-REF");
});
