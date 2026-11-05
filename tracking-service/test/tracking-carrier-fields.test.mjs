import test from "node:test";
import assert from "node:assert/strict";
import {
  carrierFactsProvenance,
  carrierKeyFacts,
  carrierLayout,
  carrierSourceField,
  cleanCarrierTime,
  safeCarrierLabel,
  safeCarrierText,
  splitBillReference
} from "../public/tracking-carrier-fields.mjs";

/** Snapshot shapes below are copied from stored carrier snapshots. */
function oneBooking() {
  return {
    provider: { code: "ONE", name: "ONE" },
    summary: {
      billOfLading: null,
      bookingNumbers: ["NBOGG0610700"],
      origin: { name: "NINGBO, ZHEJIANG, CHINA" },
      destination: { name: "OAKLAND, CA, UNITED STATES" },
      vesselVoyage: "MOL EXPERIENCE / 105E",
      status: "RETURNED",
      latestEvent: { name: "Empty Container Returned from Customer", reportedTime: "2026-08-19T13:39" },
      containerCount: { declared: null, extracted: 1 }
    },
    references: { masterBill: null, bookingNumbers: ["NBOGG0610700"] },
    keyTimes: {
      estimatedDeparture: { time: "2026-07-25 12:42", location: "NINGBO, ZHEJIANG, CHINA" },
      estimatedArrival: { time: "2026-08-14 07:26", location: "OAKLAND, CA, UNITED STATES" }
    },
    route: [],
    containers: [{ number: "NYKU3930669" }],
    events: [{ name: "Empty Container Returned from Customer" }],
    sourceDetails: {
      vessel: "MOL EXPERIENCE",
      voyage: "105E",
      queryStatus: "QUERY_COMPLETED",
      confidence: "PAGE_TEXT",
      businessVerified: false,
      fields: [
        { key: "milestone_pickup", value: "2026-07-20 00:26", source: "shipment.fields" },
        { key: "milestone_departure", value: "2026-07-25 12:42", source: "shipment.fields" },
        { key: "milestone_arrival", value: "2026-08-14 07:26", source: "shipment.fields" },
        { key: "milestone_delivery", value: "2026-08-19 13:39", source: "shipment.fields" },
        { key: "state", value: "RETURNED", source: "shipment.fields" }
      ]
    }
  };
}

function coscoShipment() {
  return {
    provider: { code: "COSCO", name: "COSCO" },
    summary: {
      billOfLading: "6508063160",
      bookingNumbers: ["6508063160"],
      origin: { name: "Shanghai", countryCode: "CN" },
      destination: { name: "Los Angeles", countryCode: "US" },
      trafficTerm: "CY | CY",
      containers: [{ cntrType: "40FQ", quantity: "2" }],
      vesselVoyage: "/ 114E",
      status: "IN_TRANSIT"
    },
    references: {
      masterBill: "6508063160 B/L Not Ready",
      bookingNumbers: ["6508063160"],
      business: {
        clientNameCode: "Hayden US",
        clientPoNumber: "HW202600096",
        forwarderJobNumber: "LJSH2607006"
      },
      information: [
        { name: "POL", value: "Shanghai-Shanghai Shengdong (I), Yangshan", sequence: 1 },
        { name: "POD", value: "Long Beach-Pacific Container Terminal", sequence: 2 },
        { name: "Empty Pick Up Facility", value: "Shanghai Coscon Logistics Lin Gang", sequence: 5 }
      ]
    },
    keyTimes: {},
    route: [
      { locationType: "FPOL", estimatedTime: "2026-07-25T08:00:00", actualTime: null },
      { locationType: "LPOD", estimatedTime: "2026-08-09T03:00:00", actualTime: null }
    ],
    containers: [{ number: "FBIU4832780", type: "40FQ" }, { number: "SEGU7674333", type: "40FQ" }],
    events: [],
    sourceDetails: { fields: [] }
  };
}

function labelValues(snapshot, language = "zh") {
  const rows = {};
  for (const group of carrierKeyFacts(snapshot, language)) {
    for (const item of group.items) rows[`${group.id}.${item.key}`] = item.value;
  }
  return rows;
}

test("ONE renders the four milestones it actually returns", () => {
  const rows = labelValues(oneBooking());
  assert.equal(rows["milestones.pickup"], "2026-07-20 00:26");
  assert.equal(rows["milestones.departure"], "2026-07-25 12:42");
  assert.equal(rows["milestones.arrival"], "2026-08-14 07:26");
  assert.equal(rows["milestones.delivery"], "2026-08-19 13:39");
  assert.equal(rows["milestones.status"], "RETURNED");
  assert.equal(rows["route.vessel"], "MOL EXPERIENCE");
  assert.equal(rows["route.voyage"], "105E");
});

test("COSCO renders terminals, client references and bill readiness", () => {
  const rows = labelValues(coscoShipment());
  assert.equal(rows["reference.masterBill"], "6508063160");
  assert.equal(rows["reference.billStatus"], "B/L Not Ready");
  assert.equal(rows["reference.trafficTerm"], "CY | CY");
  assert.equal(rows["business.clientCode"], "Hayden US");
  assert.equal(rows["business.clientPo"], "HW202600096");
  assert.equal(rows["business.forwarderJob"], "LJSH2607006");
  assert.equal(rows["route.pol"], "Shanghai-Shanghai Shengdong (I), Yangshan");
  assert.equal(rows["route.emptyPickup"], "Shanghai Coscon Logistics Lin Gang");
  assert.equal(rows["containers.containerMix"], "40FQ × 2");
  assert.equal(rows["milestones.estimatedDeparture"], "2026-07-25 08:00");
});

test("each carrier gets its own layout and unknown carriers fall back", () => {
  const one = carrierLayout("ONE").map((group) => group.id);
  const cosco = carrierLayout("COSCO").map((group) => group.id);
  assert.deepEqual(one, ["reference", "route", "containers", "milestones"]);
  assert.ok(cosco.includes("business"));
  assert.ok(cosco.includes("route"));
  const fallback = carrierLayout("ZZZZ");
  assert.deepEqual(
    fallback.map((group) => group.id),
    ["reference", "route", "containers", "milestones"]
  );
  assert.notDeepEqual(fallback, carrierLayout("COSCO"));
});

test("empty carrier facts are dropped instead of rendered as placeholders", () => {
  const rows = labelValues({
    provider: { code: "MATSON" },
    summary: { billOfLading: "MATS8807956000", containerCount: {} },
    references: { masterBill: "MATS8807956000", bookingNumbers: [] },
    keyTimes: {},
    route: [],
    containers: [{ number: "USAU3334745" }],
    events: [],
    sourceDetails: { fields: [] }
  });
  assert.equal(Object.values(rows).includes(""), false);
  assert.equal(rows["reference.masterBill"], "MATS8807956000");
  assert.equal(rows["route.origin"], undefined);
});

test("scraped page chrome is never presented as a reference", () => {
  assert.equal(safeCarrierText("Number"), "");
  assert.equal(safeCarrierText("confirmed"), "");
  assert.equal(safeCarrierText(".选(e.g., 012345678900)"), "");
  assert.equal(safeCarrierText("MEDUW8444954"), "MEDUW8444954");
  // Statuses are words: rejecting them for having no digit would hide them.
  assert.equal(safeCarrierLabel("RETURNED"), "RETURNED");
  assert.equal(safeCarrierLabel("confirmed"), "");
  const rows = labelValues({
    provider: { code: "MSC" },
    summary: { billOfLading: "MEDUW8444954", bookingNumbers: ["Number"], status: "ON_BOARD" },
    references: { masterBill: "MEDUW8444954", bookingNumbers: ["Number"] },
    keyTimes: {},
    route: [],
    containers: [],
    events: [],
    sourceDetails: { fields: [] }
  });
  assert.equal(rows["reference.booking"], undefined);
  assert.equal(rows["milestones.status"], "ON_BOARD");
});

test("carrier time formatting keeps carrier wording but normalises ISO stamps", () => {
  assert.equal(cleanCarrierTime("2026-08-12T03:00:00"), "2026-08-12 03:00");
  assert.equal(cleanCarrierTime("08/27/26\t23:05"), "08/27/26 23:05");
  assert.equal(cleanCarrierTime("25/09/2025"), "25/09/2025");
  assert.equal(cleanCarrierTime(""), "");
  assert.equal(carrierSourceField(oneBooking(), "milestone_delivery"), "2026-08-19 13:39");
  assert.equal(carrierSourceField(oneBooking(), "missing"), "");
  assert.deepEqual(splitBillReference("8882861060(B/L Ready)"), {
    number: "8882861060",
    status: "B/L Ready"
  });
  assert.deepEqual(splitBillReference("MATS8807956000"), {
    number: "MATS8807956000",
    status: ""
  });
});

test("provenance line reports query status, confidence and verification", () => {
  assert.equal(
    carrierFactsProvenance(oneBooking(), "zh"),
    "查询状态：QUERY_COMPLETED · 置信度：PAGE_TEXT · 业务未核验"
  );
  assert.equal(carrierFactsProvenance(coscoShipment(), "en"), "");
});
