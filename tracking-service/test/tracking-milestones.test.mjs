import test from "node:test";
import assert from "node:assert/strict";
import {
  milestoneTiming,
  uniqueMilestones,
  currentMilestoneIndex,
  containerMilestoneTiming
} from "../public/tracking-milestones.mjs";

test("destination highlights and an elapsed estimate never establish completion", () => {
  const node = { locationType: "FND", active: true, estimatedTime: "2020-01-01T00:00:00Z" };
  assert.equal(milestoneTiming(node).state, "estimated");
  assert.equal(milestoneTiming(node).actual, "");
  assert.equal(currentMilestoneIndex([node]), -1);
  assert.equal(currentMilestoneIndex([{ actualTime: "2026-10-01" }, node]), 0);
  assert.equal(milestoneTiming({ locationType: "POD", active: true }).state, "unknown");
});

test("container milestones retain actual and forecast evidence separately", () => {
  assert.equal(
    containerMilestoneTiming({ occurredAt: "2026-10-01", actual: true }).state,
    "actual"
  );
  assert.equal(
    containerMilestoneTiming({ estimatedAt: "2026-10-01", actual: false }).state,
    "estimated"
  );
  assert.equal(
    containerMilestoneTiming({ occurredAt: "2026-10-01", actual: false }).state,
    "unknown"
  );
  assert.equal(containerMilestoneTiming({ occurredAt: "2026-10-01" }).state, "actual");
});

test("actual evidence keeps both the reported and planned timestamp", () => {
  const result = milestoneTiming({
    actualTime: "2026-10-28T09:00:00",
    estimatedTime: "2026-10-27T12:00:00"
  });
  assert.equal(result.state, "actual");
  assert.equal(result.actual, "2026-10-28T09:00:00");
  assert.equal(result.estimated, "2026-10-27T12:00:00");
});

test("missing milestones and partial routes have no invented current event", () => {
  assert.equal(currentMilestoneIndex([]), -1);
  assert.equal(currentMilestoneIndex([{ estimatedTime: "2030-01-01" }]), -1);
  assert.equal(milestoneTiming({ actualTime: "  ", estimatedTime: "" }).state, "unknown");
  assert.equal(currentMilestoneIndex([{ actualTime: "2026-01-01" }, {}, {}]), 0);
});

test("deduplication retains distinct actual, estimated and timezone source evidence", () => {
  const base = { city: "Shanghai", locationType: "POL", event: "Loaded", actualTime: "2026-10-01" };
  assert.equal(uniqueMilestones([null, base, { ...base }]).length, 1);
  assert.equal(uniqueMilestones([base, { ...base, estimatedTime: "2026-09-30" }]).length, 2);
  assert.equal(uniqueMilestones([base, { ...base, timezone: "UTC+8" }]).length, 2);
});
