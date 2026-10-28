import assert from "node:assert/strict";
import test from "node:test";
import { Value } from "typebox/value";
import { loadConfig } from "../src/config.js";
import { TrackingRequestSchema } from "../src/contracts.js";
import {
  DEMO_NOTICE,
  DEMO_REFERENCE,
  demoCarrierResolution,
  demoTrackingRequest,
  startDemoFixture,
} from "../src/demo-fixture.js";
import { executeTracking } from "../src/workflow.js";

test("local success fixture uses one fixed fictitious request and is explicitly labelled", async (t) => {
  const fixture = await startDemoFixture();
  t.after(() => fixture.close());
  const request = demoTrackingRequest(fixture.url);
  const resolution = demoCarrierResolution(fixture.url);
  assert.equal(Value.Check(TrackingRequestSchema, request), true);
  assert.equal(request.reference, DEMO_REFERENCE);
  assert.equal(request.demo, true);
  assert.equal(resolution.trackingUrl, fixture.url);
  assert(resolution.warnings.includes(DEMO_NOTICE));
  const response = await fetch(fixture.url);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /fictitious data/i);
  assert.match(html, new RegExp(DEMO_REFERENCE));
});

test("demo execution is rejected before browser/model startup unless explicitly enabled", async () => {
  const request = {
    demo: true,
    carrier: "OTHER" as const,
    referenceType: "BOOKING" as const,
    reference: DEMO_REFERENCE,
  };
  await assert.rejects(executeTracking({
    runId: "demo-disabled",
    request,
    config: loadConfig({ TRACKING_ENABLE_DEMO: "false" }),
    signal: new AbortController().signal,
    onEvent: () => undefined,
  }), /demo is disabled/i);
});
