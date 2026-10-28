import assert from "node:assert/strict";
import test from "node:test";
import { retainFinalRunScreenshot } from "../src/agent/final-screenshot.js";
import type { RunEventInput } from "../src/run-events.js";

test("terminal screenshot is declared as a protected run attachment", async () => {
  const events: RunEventInput[] = [];
  const captured = await retainFinalRunScreenshot({
    async captureFinalScreenshot() {
      return {
        data: "base64-is-not-emitted",
        mimeType: "image/jpeg" as const,
        artifactId: "123e4567-e89b-42d3-a456-426614174000.jpg",
        label: "最终浏览器页面截图",
        path: "C:/private/run/final.jpg",
        url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/pages/cargotracking.aspx",
      };
    },
  }, (event) => {
    assert.equal(typeof event, "object");
    events.push(event as RunEventInput);
  }, 7);

  assert.equal(captured, true);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.type, "TOOL_CALL");
  assert.equal(events[1]?.type, "TOOL_RESULT");
  assert.equal(events[1]?.outcome, "SUCCESS");
  assert.equal(events[1]?.turn, 7);
  assert.deepEqual(events[1]?.attachments, [{
    type: "SCREENSHOT",
    artifactId: "123e4567-e89b-42d3-a456-426614174000.jpg",
    label: "最终浏览器页面截图",
    mimeType: "image/jpeg",
  }]);
  assert.doesNotMatch(JSON.stringify(events), /base64-is-not-emitted|C:\/private/);
});

test("terminal screenshot failure is explicit and does not leak or replace the run outcome", async () => {
  const events: RunEventInput[] = [];
  const captured = await retainFinalRunScreenshot({
    async captureFinalScreenshot() {
      throw new Error("password=secret booking=OOLU8882568660");
    },
  }, (event) => {
    assert.equal(typeof event, "object");
    events.push(event as RunEventInput);
  });

  assert.equal(captured, false);
  assert.equal(events.at(-1)?.outcome, "ERROR");
  assert.equal(events.at(-1)?.status, "SCREENSHOT_CAPTURE_FAILED");
  assert.equal(events.at(-1)?.attachments, undefined);
  assert.doesNotMatch(JSON.stringify(events), /secret|OOLU8882568660/);
});
