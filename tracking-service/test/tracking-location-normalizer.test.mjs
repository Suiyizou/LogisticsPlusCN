import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTrackingSnapshotLocations,
  normalizeTrackingLocation,
  resolveTrackingCountry
} from "../public/tracking-location-normalizer.mjs";
import { adaptTrackingV1 } from "../public/tracking-v1-adapter.mjs";

test("resolves explicit countries and qualified catalog locations without interpreting a city abbreviation as a country", () => {
  for (const [value, expected] of [
    ["CHN", "CN"],
    ["USA", "US"],
    ["DEU", "DE"],
    ["GBR", "GB"],
    ["KOR", "KR"],
    ["UK", "GB"],
    ["德国", "DE"],
    ["United States", "US"],
    ["CNSHA", "CN"],
    [{ name: "Los Angeles, CA" }, "US"],
    [{ name: "SAVANNAH, GA (US)" }, "US"],
    [{ name: "SHANGHAI, SH" }, "CN"],
    [{ name: "SHANGHAI (SH), CHINA. PEOPLE'S REPUBLIC" }, "CN"],
    [{ name: "LOS ANGELES (CA), U.S.A." }, "US"],
    [{ name: "LA" }, ""],
    [{ name: "Unknown City, CA" }, ""],
    [{ name: "Vancouver, CA" }, "CA"],
    [{ name: "Cartagena" }, ""],
    [{ name: "Cartagena, Colombia" }, "CO"],
    [{ city: "Shanghai", countryCode: "CHN", country_code: "USA" }, "CN"]
  ])
    assert.equal(resolveTrackingCountry(value), expected, JSON.stringify(value));
});

test("air and inland aliases resolve country flags without fabricating seaport locations", () => {
  for (const [name, country] of [["SHA", "CN"], ["IAH", "US"], ["TULSA", "US"], ["Tulsa, OK", "US"]]) {
    const normalized = normalizeTrackingLocation({ name });
    assert.equal(normalized.name, name);
    assert.equal(normalized.countryCode, country);
    assert.equal(normalized.unLocationCode, undefined);
    assert.equal(normalizeTrackingLocation(normalized), normalized);
  }
  assert.equal(resolveTrackingCountry({ airport_code: "IAH" }), "US");
  assert.equal(resolveTrackingCountry({ locationCode: "SHA" }), "CN");
  assert.equal(resolveTrackingCountry({ name: "IAH", countryCode: "USA" }), "US");
  assert.equal(resolveTrackingCountry({ name: "IAH", countryCode: "CA" }), "CA");
  assert.equal(resolveTrackingCountry({ name: "SHA", locationCode: "IAH" }), "");
  assert.equal(resolveTrackingCountry({ name: "Shanghai", airport_code: "IAH" }), "");
  assert.equal(resolveTrackingCountry({ name: "LA" }), "");
  assert.equal(resolveTrackingCountry({ name: "Unknown Airport", locationCode: "XYZ" }), "");
  // A declared country field is not an airport code field.
  assert.equal(resolveTrackingCountry({ countryCode: "SHA" }), "");
});

test("normalizes nested location aliases without mutating source or replacing reported names", () => {
  const original = {
    summary: {
      origin: { location_name: "洛杉矶", country_code: "USA" },
      destination_name: "Ningbo",
      destination_country_code: "CHN"
    },
    route: [{ city: "Shanghai, CN", countryCode: "CHN" }],
    routingLegs: [
      {
        load_port: "Hamburg",
        load_country_code: "DEU",
        discharge_port: { name: "Busan", country: "KOR" }
      }
    ],
    events: [{ location_name: "Felixstowe", country_name: "United Kingdom" }]
  };
  const snapshot = normalizeTrackingSnapshotLocations(original);
  assert.equal(snapshot.summary.origin.name, "洛杉矶");
  assert.equal(snapshot.summary.origin.country_code, "USA");
  assert.equal(snapshot.summary.origin.countryCode, "US");
  assert.equal(snapshot.summary.origin.unLocationCode, "USLAX");
  assert.equal(snapshot.summary.destination.countryCode, "CN");
  assert.equal(snapshot.route[0].reportedCountryCode, "CHN");
  assert.equal(snapshot.route[0].city, "Shanghai, CN");
  assert.equal(snapshot.routingLegs[0].loadCountryCode, "DE");
  assert.equal(snapshot.routingLegs[0].dischargeCountryCode, "KR");
  assert.equal(snapshot.events[0].countryCode, "GB");
  assert.equal(original.summary.origin.name, undefined);
  assert.equal(original.route[0].countryCode, "CHN");
  assert.equal(normalizeTrackingSnapshotLocations(snapshot), snapshot);
});

test("adapter gives declared location priority and preserves supplementary values with their source", () => {
  const { snapshot } = adaptTrackingV1({
    schema: "tracking.v1",
    carrier: { code: "COSCO" },
    query: { reference_input: "SYNTHETIC01" },
    shipment: {
      route: {
        origin: { name: "上海", countryCode: "CHN", country_code: "USA" },
        destination: "Long Beach (CA)"
      },
      fields: { origin: "Houston" },
      fields_extra: { applicable: false, count: 0, note: { missing: false } },
      terminal_flags: { reliable: false },
      containers: [{ number: "TEST1234567", terminalEquipment: { height: 0 } }]
    }
  });
  assert.equal(snapshot.summary.origin.name, "上海");
  assert.equal(snapshot.summary.origin.countryCode, "CN");
  assert.equal(snapshot.summary.destination.countryCode, "US");
  for (const [key, rawText] of [
    ["applicable", "false"],
    ["count", "0"]
  ]) {
    assert.equal(snapshot.sourceDetails.fields.find((field) => field.key === key).rawText, rawText);
  }
  assert.deepEqual(
    JSON.parse(
      snapshot.sourceDetails.fields.find((field) => field.key === "terminal_flags").rawText
    ),
    { reliable: false }
  );
  assert.deepEqual(
    JSON.parse(
      snapshot.sourceDetails.fields.find((field) => field.source === "shipment.containers").rawText
    ),
    { terminalEquipment: { height: 0 } }
  );
  assert.deepEqual(snapshot.keyTimes, {});
  assert.deepEqual(snapshot.route, []);
});
