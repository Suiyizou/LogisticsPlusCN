import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeCoscoPayload,
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

test("creates a stable channel C snapshot", () => {
  const snapshot = normalizeCoscoSnapshot(
    {
      cargoTrackingSummary: {
        blNumber: "ABC123",
        bookingNumber: ["ABC123"],
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
    "2026-07-14T00:00:00.000Z"
  );

  assert.equal(snapshot.channel, "C");
  assert.equal(snapshot.summary.origin.name, "Shanghai");
  assert.equal(snapshot.route[0].sequence, 1);
});
