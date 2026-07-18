import test from "node:test";
import assert from "node:assert/strict";
import {
  collectBatchItems,
  findBatchColumns,
  normalizeShipmentCandidate
} from "../public/batch-import-rules.mjs";

test("splits COSU from the query number and keeps business columns as text", () => {
  const rows = [
    ["JOB NUMBER", "VESSEL /VOY", "M/B/L NO.", "POL", "POD", "PO NO.", "ETD", "ETA", "", "Client Code"],
    ["JSH2606018", "CZ5221 22059.74-100", "784-84422343 空运", "SHA", "IAH", "HW202600059", "6-Jun-26", "11-Jun-26", "VOLUME", "Hayden US"],
    ["JSH2606003", "COSCO EUROPE 113E-44", "COSU6502406170", "SHA", "LONG BEACH", "HW202600057-2", "7-Jun-26", "22-Jun-26", "4*40HC", "Hayden US"]
  ];
  const header = findBatchColumns(rows);
  const [item] = [...collectBatchItems(rows, header).values()];

  assert.equal(item.carrier, "COSCO");
  assert.equal(item.number, "6502406170");
  assert.equal(item.displayNumber, "COSU6502406170");
  assert.deepEqual(item.importedDetails, {
    forwarderJobNumber: "JSH2606003",
    vesselVoyage: "COSCO EUROPE 113E-44",
    portOfLoading: "SHA",
    portOfDischarge: "LONG BEACH",
    clientPoNumber: "HW202600057-2",
    estimatedDeparture: "7-Jun-26",
    estimatedArrival: "22-Jun-26",
    volume: "4*40HC",
    clientNameCode: "Hayden US",
    carrierPrefix: "COSU",
    originalBillOfLading: "COSU6502406170"
  });
});

test("keeps an unknown carrier prefix but does not send it to COSCO", () => {
  const candidate = normalizeShipmentCandidate("BILLOFLADING", "SMLMSHZY5B667700");
  assert.equal(candidate.carrier, null);
  assert.equal(candidate.carrierPrefix, "SMLM");
  assert.equal(candidate.number, "SHZY5B667700");
  assert.equal(candidate.unsupportedCarrierPrefix, true);
});

test("does not treat annotated air waybills as ocean bills", () => {
  assert.equal(normalizeShipmentCandidate("BILLOFLADING", "784-84422343 空运"), null);
  assert.equal(normalizeShipmentCandidate("BILLOFLADING", "784-84594366 BY AIR"), null);
});
