import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoutingLegs,
  decodeCoscoPayload,
  listCarrierAdapters,
  listCoscoQueryChannels,
  normalizeCarrierCode,
  normalizeCoscoContainerSnapshot,
  normalizeQueryChannel,
  runCoscoChannelChecks,
  runChannelCHealthCheck,
  normalizeCoscoSnapshot,
  normalizeTrackingRequest
} from "../server.mjs";

function encodeFixture(value) {
  const key = Buffer.from("b3Ay6#9f1a@%&2^6", "utf8");
  const input = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.alloc(input.length);

  for (let index = 0; index < input.length; index += 1) {
    encrypted[index] = input[index] ^ key[index % key.length];
  }

  return JSON.stringify(encrypted.toString("base64"));
}

test("decodes COSCO Base64 + XOR payloads", () => {
  const fixture = { code: "200", success: true, result: { value: 42 } };
  assert.deepEqual(decodeCoscoPayload(encodeFixture(fixture)), fixture);
});

test("passes through plain JSON upstream errors", () => {
  const fixture = { code: "429", success: false, message: "limited" };
  assert.deepEqual(decodeCoscoPayload(JSON.stringify(fixture)), fixture);
});

test("normalizes and validates tracking input", () => {
  assert.deepEqual(normalizeTrackingRequest({ type: "billoflading", number: " 6502 077380 " }), {
    type: "BILLOFLADING",
    number: "6502077380",
    label: "提单号",
    businessNumberType: "blNumber"
  });
  assert.throws(() => normalizeTrackingRequest({ type: "BILLOFLADING", number: "@@" }));
});

test("exposes a multi-carrier adapter registry", () => {
  assert.equal(normalizeCarrierCode("cosco"), "COSCO");
  assert.equal(normalizeCarrierCode("cma"), "CMA");
  assert.throws(() => normalizeCarrierCode("unknown"));

  const carriers = listCarrierAdapters();
  assert.deepEqual(
    carriers.map(({ code, enabled }) => ({ code, enabled })),
    [
      { code: "COSCO", enabled: true },
      { code: "CMA", enabled: false }
    ]
  );
});

test("exposes network and Playwright query channels", () => {
  assert.equal(normalizeQueryChannel().code, "NETWORK");
  assert.equal(normalizeQueryChannel("auto").code, "AUTO");
  assert.equal(normalizeQueryChannel("playwright").number, 2);
  assert.throws(() => normalizeQueryChannel("unknown"));
  assert.deepEqual(
    listCoscoQueryChannels().map(({ code, number }) => ({ code, number })),
    [
      { code: "NETWORK", number: 1 },
      { code: "PLAYWRIGHT", number: 2 }
    ]
  );
});

test("uses the dedicated container payload without leaking other shipment records", () => {
  const request = normalizeTrackingRequest({ type: "CONTAINER", number: "TEMU6003424" });
  const snapshot = normalizeCoscoContainerSnapshot(
    [
      {
        containerNumber: "TEMU600342",
        containerNumberWithCheckDigit: "TEMU6003424",
        containerType: "40HQ",
        ataAtLastPod: "2026-07-08T14:33:41",
        milestones: [
          {
            eventName: "Gate Out from Final Hub",
            actualEventDateTime: "2026-07-14T20:21:00",
            eventLocationName: "CSX TRANSPORTATION",
            transportMode: "Truck"
          }
        ]
      },
      {
        containerNumberWithCheckDigit: "OTHER0000000",
        containerType: "20GP",
        milestones: []
      }
    ],
    request,
    "2026-07-15T00:00:00.000Z"
  );

  assert.equal(snapshot.viewMode, "CONTAINER");
  assert.equal(snapshot.containers.length, 1);
  assert.equal(snapshot.containers[0].number, "TEMU6003424");
  assert.equal(snapshot.summary.latestEvent.name, "Gate Out from Final Hub");
  assert.deepEqual(snapshot.route, []);
});

test("checks the primary network and fallback DOM channels independently", async () => {
  const result = await runCoscoChannelChecks(
    { type: "BILLOFLADING", number: "6502077380" },
    {
      networkProbe: async () => {},
      playwrightProbe: async () => {
        throw new Error("browser unavailable");
      }
    }
  );

  assert.equal(result.strategy.preferred, "NETWORK");
  assert.equal(result.channels.NETWORK.available, true);
  assert.equal(result.channels.PLAYWRIGHT.available, false);
  assert.equal(result.channels.PLAYWRIGHT.error, "browser unavailable");
});

test("creates a stable channel-one network snapshot", () => {
  const snapshot = normalizeCoscoSnapshot(
    {
      cargoTrackingSummary: {
        blNumber: "ABC123",
        bookingNumber: ["ABC123"],
        containerSummaryInfos: [{ cntrType: "40HQ", quantity: "1" }],
        por: "Shanghai",
        porCountryCode: "CN",
        fnd: "Atlanta",
        fndCountryCode: "US",
        latestMilestone: {
          eventName: "Departed",
          actualEventDateTime: "2026-07-09T11:37:00",
          eventLocation: "Savannah",
          transportMode: "Rail"
        }
      },
      cargoTrackingFullChain: [{ city: "Shanghai", actualTime: "2026-06-05T10:18:35" }],
      cargoTrackingSailingSchedule: []
    },
    normalizeTrackingRequest({ type: "BILLOFLADING", number: "ABC123" }),
    "2026-07-14T00:00:00.000Z",
    {
      containerInfo: [
        {
          containerNumber: "TEMU6003424",
          containerType: "40HQ",
          trafficTerm: "CY | CY",
          currentMilestone: {
            eventName: "Gate Out from Final Hub",
            actualEventDateTime: "2026-07-14T20:21:00",
            eventLocation: "CSX TRANSPORTATION",
            transportMode: "Truck"
          }
        }
      ]
    }
  );

  assert.equal(snapshot.channel, "NETWORK");
  assert.equal(snapshot.channelNumber, 1);
  assert.equal(snapshot.provider.code, "COSCO");
  assert.equal(snapshot.summary.origin.name, "Shanghai");
  assert.equal(snapshot.route[0].sequence, 1);
  assert.equal(snapshot.containers.length, 1);
  assert.equal(snapshot.containers[0].number, "TEMU6003424");
});

test("marks Playwright results as channel two without changing the snapshot shape", () => {
  const snapshot = normalizeCoscoSnapshot(
    {
      cargoTrackingSummary: {
        blNumber: "ABC123",
        por: "Shanghai",
        fnd: "Atlanta"
      }
    },
    normalizeTrackingRequest({ type: "BILLOFLADING", number: "ABC123" }),
    "2026-07-15T00:00:00.000Z",
    { queryChannel: normalizeQueryChannel("PLAYWRIGHT") }
  );

  assert.equal(snapshot.channel, "PLAYWRIGHT");
  assert.equal(snapshot.channelNumber, 2);
  assert.equal(snapshot.provider.channel, "PLAYWRIGHT");
  assert.equal(snapshot.source, "COSCO_WEB_UI_PLAYWRIGHT");
});

test("builds sea and inland routing legs", () => {
  const legs = buildRoutingLegs({
    cargoTrackingSummary: {
      blNumber: "ABC123",
      latestMilestone: {
        eventName: "Rail Departure",
        actualEventDateTime: "2026-07-09T11:37:00",
        transportMode: "Rail"
      }
    },
    cargoTrackingFullChain: [
      { locationType: "LPOD", city: "Savannah" },
      { locationType: "FND", city: "Atlanta", estimatedTime: "2026-07-12T16:00:00" }
    ],
    cargoTrackingSailingSchedule: [
      {
        vesselName: "TOKYO TRIUMPH",
        voyage: "1268E",
        polPort: "Shanghai",
        podPort: "Savannah",
        atd: "2026-06-05T10:18:35",
        ata: "2026-07-08T14:33:41"
      }
    ]
  });

  assert.equal(legs.length, 2);
  assert.equal(legs[0].mode, "SEA");
  assert.equal(legs[0].loadCountryCode, null);
  assert.equal(legs[1].mode, "Rail");
  assert.equal(legs[1].actualDeparture, "2026-07-09T11:37:00");
  assert.equal(legs[1].estimatedArrival, "2026-07-12T16:00:00");
});

test("records channel-one network monitor success and failure", async () => {
  const successTimes = [1_000, 1_125];
  let attempt = 0;
  const success = await runChannelCHealthCheck({
    now: () => successTimes.shift(),
    wait: async () => {},
    fetchDetail: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("temporary failure");
      return { cargoTrackingSummary: { blNumber: "6502077380" } };
    }
  });

  assert.equal(success.status, "available");
  assert.equal(success.available, true);
  assert.equal(success.responseTimeMs, 125);
  assert.equal(success.lastAttemptCount, 2);
  assert.equal(success.consecutiveFailures, 0);
  assert.equal(success.lastError, null);

  const failureTimes = [2_000, 2_080];
  const failure = await runChannelCHealthCheck({
    now: () => failureTimes.shift(),
    maxAttempts: 1,
    fetchDetail: async () => {
      throw new Error("upstream unavailable");
    }
  });

  assert.equal(failure.status, "unavailable");
  assert.equal(failure.available, false);
  assert.equal(failure.responseTimeMs, 80);
  assert.equal(failure.lastError, "upstream unavailable");
  assert.equal(failure.lastSuccessAt, success.lastSuccessAt);
});
