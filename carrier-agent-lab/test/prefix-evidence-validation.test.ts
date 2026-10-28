import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserTools } from "../src/agent/tools.js";
import type { BrowserSession } from "../src/browser/browser-session.js";
import type { AgentSubmission } from "../src/contracts.js";

const SOURCE_URL = "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=MEXG20090500";
const FULL_REFERENCE = "ONEYMEXG20090500";
const ENTERED_SUFFIX = "MEXG20090500";

function observedBrowser(): BrowserSession {
  return {
    wasVisited: (sourceUrl: string) => sourceUrl === SOURCE_URL,
    evidenceWasObserved: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL && method === "DOM" && value === ENTERED_SUFFIX,
    resolveObservedEvidenceSource: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL && method === "DOM" && value === ENTERED_SUFFIX ? SOURCE_URL : null,
    blockingReasonFor: () => null,
  } as unknown as BrowserSession;
}

function visuallyObservedBrowser(): BrowserSession {
  return {
    wasVisited: (sourceUrl: string) => sourceUrl === SOURCE_URL,
    evidenceWasObserved: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
    ) => sourceUrl === SOURCE_URL && method === "VISION",
    resolveObservedEvidenceSource: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
    ) => sourceUrl === SOURCE_URL && method === "VISION" ? SOURCE_URL : null,
    blockingReasonFor: () => null,
  } as unknown as BrowserSession;
}

function foundSubmission(): AgentSubmission {
  return {
    status: "FOUND" as const,
    shipment: {
      bookingNumber: null,
      billOfLading: FULL_REFERENCE,
      status: null,
    },
    containers: [],
    evidence: [{
      field: "shipment.billOfLading",
      value: ENTERED_SUFFIX,
      sourceUrl: SOURCE_URL,
      method: "DOM" as const,
    }],
    warnings: ["ONE requires the ONEY prefix to be removed before entry."],
    note: null,
  };
}

test("FOUND accepts an observed carrier-entered suffix while preserving the full queried identity", async () => {
  const tools = createBrowserTools(observedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  await submit.execute("one-prefix", foundSubmission(), undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.shipment.billOfLading, FULL_REFERENCE);
});

test("FOUND deterministically replaces a constructed full identity citation with the observed configured suffix", async () => {
  const tools = createBrowserTools(observedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  assert(candidate.evidence[0]);
  candidate.evidence[0].value = FULL_REFERENCE;
  await submit.execute("one-full-prefix-citation", candidate, undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.shipment.billOfLading, FULL_REFERENCE);
  assert.equal(tools.getSubmission()?.evidence[0]?.value, ENTERED_SUFFIX);
  assert.equal(tools.getSubmission()?.evidence[0]?.method, "DOM");
});

test("configured suffix repair also normalizes an extra booking identity on a bill-of-lading query", async () => {
  const tools = createBrowserTools(observedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  candidate.shipment.bookingNumber = FULL_REFERENCE;
  candidate.evidence.push({
    field: "shipment.bookingNumber",
    value: `Booking Ref: ${ENTERED_SUFFIX}`,
    sourceUrl: SOURCE_URL,
    method: "DOM",
  });
  await submit.execute("one-extra-booking-citation", candidate, undefined, undefined, {} as never);
  assert.deepEqual(
    tools.getSubmission()?.evidence.map((evidence) => evidence.value),
    [ENTERED_SUFFIX, ENTERED_SUFFIX],
  );
  assert.equal(tools.getSubmission()?.shipment.bookingNumber, null);
  assert.equal(tools.getSubmission()?.shipment.billOfLading, FULL_REFERENCE);
  assert.deepEqual(
    tools.getSubmission()?.evidence.map((evidence) => evidence.field),
    ["shipment.billOfLading", "shipment.billOfLading"],
  );
});

test("trusted query type deterministically places the echoed identity in its contract field", async () => {
  const tools = createBrowserTools(observedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  candidate.shipment.bookingNumber = FULL_REFERENCE;
  candidate.shipment.billOfLading = null;
  candidate.evidence[0] = {
    field: "shipment.bookingNumber",
    value: `Booking Ref: ${ENTERED_SUFFIX}`,
    sourceUrl: SOURCE_URL,
    method: "DOM",
  };
  await submit.execute("one-query-type-identity", candidate, undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.shipment.bookingNumber, null);
  assert.equal(tools.getSubmission()?.shipment.billOfLading, FULL_REFERENCE);
  assert.equal(tools.getSubmission()?.evidence[0]?.field, "shipment.billOfLading");
  assert.equal(tools.getSubmission()?.evidence[0]?.value, ENTERED_SUFFIX);
});

test("configured suffix evidence can use an explicitly declared official-page screenshot", async () => {
  const tools = createBrowserTools(visuallyObservedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  candidate.evidence[0] = {
    field: "shipment.billOfLading",
    value: ENTERED_SUFFIX,
    sourceUrl: SOURCE_URL,
    method: "VISION",
  };
  await submit.execute("one-visual-prefix-citation", candidate, undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.evidence[0]?.value, ENTERED_SUFFIX);
  assert.equal(tools.getSubmission()?.evidence[0]?.method, "VISION");
});

test("configured identity alone may repair a constructed full value to screenshot-backed suffix", async () => {
  const tools = createBrowserTools(visuallyObservedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  candidate.evidence[0] = {
    field: "shipment.billOfLading",
    value: FULL_REFERENCE,
    sourceUrl: SOURCE_URL,
    method: "DOM",
  };
  await submit.execute("one-visual-prefix-repair", candidate, undefined, undefined, {} as never);
  assert.deepEqual(tools.getSubmission()?.evidence[0], {
    field: "shipment.billOfLading",
    value: ENTERED_SUFFIX,
    sourceUrl: SOURCE_URL,
    method: "VISION",
  });
});

test("FOUND omits an unobserved optional DOM fact instead of upgrading it to VISION", async () => {
  const tools = createBrowserTools(visuallyObservedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  assert(candidate.evidence[0]);
  candidate.evidence[0].method = "VISION";
  candidate.shipment.status = "Vessel Departure from Port of Loading";
  candidate.evidence.push({
    field: "shipment.status",
    value: "Vessel Departure from Port of Loading",
    sourceUrl: SOURCE_URL,
    method: "DOM",
  });
  await submit.execute("one-unobserved-dom-status", candidate, undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.shipment.status, null);
  assert.deepEqual(tools.getSubmission()?.evidence.map((evidence) => evidence.method), ["VISION"]);
  assert.match(tools.getSubmission()?.warnings.at(-1) ?? "", /optional shipment fields/i);
});

test("FOUND retains an optional fact when the model explicitly declares screenshot evidence", async () => {
  const tools = createBrowserTools(visuallyObservedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  candidate.evidence[0]!.method = "VISION";
  candidate.shipment.status = "Vessel Departure from Port of Loading";
  candidate.evidence.push({
    field: "shipment.status",
    value: "Vessel Departure from Port of Loading",
    sourceUrl: SOURCE_URL,
    method: "VISION",
  });
  await submit.execute("one-explicit-visual-status", candidate, undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.shipment.status, "Vessel Departure from Port of Loading");
  assert.deepEqual(tools.getSubmission()?.evidence.map((evidence) => evidence.method), ["VISION", "VISION"]);
});

test("trusted identity normalization leaves unrelated booking evidence unchanged", async () => {
  const unrelatedValue = "Booking Ref: OTHER12345";
  const browser = {
    wasVisited: (sourceUrl: string) => sourceUrl === SOURCE_URL,
    evidenceWasObserved: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL
      && method === "DOM"
      && (value === ENTERED_SUFFIX || value === unrelatedValue),
    resolveObservedEvidenceSource: (
      sourceUrl: string,
      method: "DOM" | "VISION" | "HYBRID",
      value: string,
    ) => sourceUrl === SOURCE_URL
      && method === "DOM"
      && (value === ENTERED_SUFFIX || value === unrelatedValue)
      ? SOURCE_URL
      : null,
    blockingReasonFor: () => null,
  } as unknown as BrowserSession;
  const tools = createBrowserTools(browser, () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
    evidenceReferenceCandidates: [FULL_REFERENCE, ENTERED_SUFFIX],
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  const candidate = foundSubmission();
  candidate.evidence.push({
    field: "shipment.bookingNumber",
    value: unrelatedValue,
    sourceUrl: SOURCE_URL,
    method: "DOM",
  });
  await submit.execute("unrelated-booking-evidence", candidate, undefined, undefined, {} as never);
  assert.equal(tools.getSubmission()?.shipment.bookingNumber, null);
  assert.deepEqual(tools.getSubmission()?.evidence, [
    {
      field: "shipment.billOfLading",
      value: ENTERED_SUFFIX,
      sourceUrl: SOURCE_URL,
      method: "DOM",
    },
    {
      field: "shipment.bookingNumber",
      value: unrelatedValue,
      sourceUrl: SOURCE_URL,
      method: "DOM",
    },
  ]);
});

test("FOUND does not accept an unapproved shortened identity", async () => {
  const tools = createBrowserTools(observedBrowser(), () => undefined, {
    reference: FULL_REFERENCE,
    referenceType: "BILL_OF_LADING",
  });
  const submit = tools.tools.find((tool) => tool.name === "submit_tracking_result");
  assert(submit);
  await assert.rejects(
    submit.execute("one-prefix-rejected", foundSubmission(), undefined, undefined, {} as never),
    /approved carrier-entered suffix/,
  );
});
