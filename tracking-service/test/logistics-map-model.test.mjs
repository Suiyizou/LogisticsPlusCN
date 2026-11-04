import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLogisticsMapModel,
  splitLogisticsMapSegment
} from "../public/logistics-map-model.mjs";

const summary = (origin, destination) => ({
  origin: { name: origin },
  destination: { name: destination }
});
const routePairs = (model) => model.edges.map(({ from, to }) => [from, to]);

test("uses persisted history and normalized snapshot shapes and consolidates aliases", () => {
  const model = buildLogisticsMapModel([
    {
      shipmentId: 125,
      query: { carrier: "COSCO", number: "SYNTHETIC-125" },
      snapshot: {
        summary: summary("Shanghai, CN", "LONG BEACH (CA)"),
        routingLegs: [{ sequence: 1, loadPort: "Shanghai", dischargePort: "Long Beach" }]
      }
    },
    {
      provider: { code: "COSCO" },
      tracking: { number: "SYNTHETIC-126" },
      summary: summary("上海港", "US LGB"),
      route: [
        { sequence: 2, city: "Long Beach, US", locationType: "POD", active: true },
        { sequence: 1, city: "上海", locationType: "POL" }
      ]
    }
  ]);
  assert.deepEqual(
    model.shipments.map(({ id, label }) => [id, label]),
    [
      ["125", "SYNTHETIC-125"],
      ["COSCO:SYNTHETIC-126", "SYNTHETIC-126"]
    ]
  );
  assert.deepEqual(
    model.nodes.map(({ id }) => id),
    ["CNSHA", "USLGB"]
  );
  assert.deepEqual(routePairs(model), [["CNSHA", "USLGB"]]);
  assert.deepEqual(model.edges[0].shipmentIds, ["125", "COSCO:SYNTHETIC-126"]);
  assert.deepEqual(model.nodes[1].shipmentIds, ["125", "COSCO:SYNTHETIC-126"]);
  assert.ok(!("currentPosition" in model.shipments[1]));
  assert.deepEqual(model.unresolved, []);
});

test("uses explicit ordered legs and keeps unrelated legs disconnected", () => {
  const model = buildLogisticsMapModel([
    {
      tracking: { number: "SYNTHETIC-LEG" },
      summary: summary("Shanghai", "Rotterdam"),
      route: [
        { city: "Shanghai", locationType: "POL" },
        { city: "Rotterdam", locationType: "POD" }
      ],
      routingLegs: [
        { sequence: 3, loadPort: "Felixstowe", dischargePort: "Rotterdam" },
        { sequence: 1, loadPort: "Shanghai", dischargePort: "Singapore" },
        { sequence: 2, loadPort: "Singapore", dischargePort: "Colombo" }
      ]
    }
  ]);
  assert.deepEqual(routePairs(model), [
    ["CNSHA", "SGSIN"],
    ["SGSIN", "LKCMB"],
    ["GBFXT", "NLRTM"]
  ]);
});

test("preserves unknown route stops and never connects across that gap", () => {
  const model = buildLogisticsMapModel([
    {
      tracking: { number: "SYNTHETIC-GAP" },
      summary: summary("CNSHA", "Rotterdam"),
      route: [
        { sequence: 1, city: "Shanghai", locationType: "POL" },
        { sequence: 2, city: "Unlisted transshipment terminal" },
        { sequence: 3, city: "Rotterdam", locationType: "POD", active: true }
      ],
      events: [{ location: "New York", actual: true }]
    }
  ]);
  assert.deepEqual(
    model.nodes.map(({ id }) => id),
    ["CNSHA", "NLRTM"]
  );
  assert.deepEqual(model.edges, []);
  assert.deepEqual(model.unresolved, [
    {
      shipmentId: "SYNTHETIC-GAP",
      label: "Unlisted transshipment terminal",
      role: "transshipment"
    }
  ]);
});

test("rejects ambiguous, conflicting and unsupported names instead of guessing", () => {
  const model = buildLogisticsMapModel([
    { summary: summary("Cartagena", "Puerto Shanghai X") },
    { summary: summary("Cartagena, Colombia", "Cartagena, ES") },
    {
      summary: {
        origin: { name: "Shanghai", countryCode: "US" },
        destination: { name: "Los Angeles, CA" }
      }
    },
    {
      summary: { origin: { name: "Oakland", countryCode: "NZ" }, destination: { name: "Auckland" } }
    },
    { summary: { origin: { name: "Long Beach", unLocationCode: "CNSHA" } } }
  ]);
  assert.deepEqual(
    model.nodes.map(({ id }) => id),
    ["COCTG", "ESCAR", "USLAX", "NZAKL"]
  );
  assert.deepEqual(
    model.unresolved.map(({ label }) => label),
    ["Cartagena", "Puerto Shanghai X", "Shanghai", "Oakland", "Long Beach"]
  );
});

test("takes only complete explicit coordinate pairs when the catalog cannot locate a name", () => {
  const model = buildLogisticsMapModel([
    {
      summary: {
        origin: { name: "Source terminal", coordinates: { latitude: "24.5", longitude: -82.3 } },
        destination: { name: "Unlocated terminal", latitude: null, longitude: 125 }
      },
      route: [{ city: "Unusable default", latitude: 0, longitude: 0 }]
    }
  ]);
  assert.deepEqual(
    model.nodes.map(({ label, latitude, longitude, coordinateSource }) => ({
      label,
      latitude,
      longitude,
      coordinateSource
    })),
    [{ label: "Source terminal", latitude: 24.5, longitude: -82.3, coordinateSource: "reported" }]
  );
  assert.deepEqual(
    model.unresolved.map(({ label }) => label),
    ["Unusable default", "Unlocated terminal"]
  );
});

test("date line intersections pair identical latitudes without a map-spanning segment", () => {
  const east = { latitude: 20, longitude: 160 };
  const west = { latitude: 40, longitude: -160 };
  assert.deepEqual(splitLogisticsMapSegment(east, west), [
    [east, { latitude: 30, longitude: 180 }],
    [{ latitude: 30, longitude: -180 }, west]
  ]);
  assert.deepEqual(splitLogisticsMapSegment(west, east), [
    [west, { latitude: 30, longitude: -180 }],
    [{ latitude: 30, longitude: 180 }, east]
  ]);
  assert.deepEqual(splitLogisticsMapSegment({ latitude: 20, longitude: 180 }, west), [
    [{ latitude: 20, longitude: -180 }, west]
  ]);
  assert.deepEqual(
    splitLogisticsMapSegment({ latitude: 20, longitude: 180 }, { latitude: 40, longitude: -180 }),
    [
      [
        { latitude: 20, longitude: 180 },
        { latitude: 40, longitude: 180 }
      ]
    ]
  );
});

test("retains reported shipment detail and separates localized port labels from identifiers", () => {
  const model = buildLogisticsMapModel([
    {
      shipmentId: "SYNTHETIC-REPORTED",
      trackingStatus: "IN_TRANSIT",
      lastTrackedAt: "2026-09-01T08:00:00Z",
      snapshot: {
        fetchedAt: "2026-08-31T08:00:00Z",
        summary: {
          ...summary("Ningbo", "LOS ANGELES, CA"),
          status: "REPORTED",
          latestEvent: {
            name: "Departed",
            occurredAt: null,
            reportedTime: "September 1, local",
            location: "Ningbo terminal"
          }
        }
      }
    },
    { shipmentId: "SYNTHETIC-NO-LOCATION", trackingStatus: "PENDING_UPDATE" }
  ]);
  assert.deepEqual(
    model.nodes.map(({ label, labelZh, locode }) => [label, labelZh, locode]),
    [
      ["Ningbo", "宁波", "CNNGB"],
      ["Los Angeles", "洛杉矶", "USLAX"]
    ]
  );
  const [reported, pending] = model.shipments;
  assert.equal(reported.status, "IN_TRANSIT");
  assert.equal(reported.updatedAt, "2026-09-01T08:00:00Z");
  assert.deepEqual(reported.latestEvent, {
    name: "Departed",
    occurredAt: null,
    reportedTime: "September 1, local",
    location: "Ningbo terminal"
  });
  assert.equal(reported.hasLocations, true);
  assert.equal(pending.hasLocations, false);
  assert.equal(pending.latestEvent, null);
  assert.equal(pending.updatedAt, null);
});
