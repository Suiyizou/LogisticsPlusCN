import assert from "node:assert/strict";
import test from "node:test";
import {
  groupTaskStates, shouldLoadTaskDetail, stateOf, taskStatusTone, toShipmentTaskNetwork
} from "../src/features/shipments/shipmentTaskNetworkModel.js";

test("one published batch projects every persistent row across carriers without using local jobs as batches", () => {
  const task = {
    taskId: "published_batch",
    sourceFileName: "shipments.xlsx",
    status: "RUNNING",
    sourceRows: [{ id: "b", sourceRow: 7, originalReference: "Original" }],
    items: [
      { id: "a", carrier: "HMM", status: "WAITING", localJobId: "local_a", number: "HMM123" },
      { id: "b", carrier: "CMA", status: "PERSISTING", localJobId: "local_b", number: "CMA123", sourceRow: 7 },
      { id: "c", carrier: "CMA", status: "FAILED", number: "CMA124" },
      { id: "d", carrier: "CMA", status: "MANUAL", shipmentId: "shipment_d", number: "CMA125" },
      { id: "e", carrier: "HMM", status: "SUCCEEDED", payload: { snapshot: {} } },
      { id: "f", status: "SOMETHING_NEW" }
    ]
  };
  const graph = toShipmentTaskNetwork(task);
  assert.equal(graph.id, task.taskId);
  assert.deepEqual(graph.items.map(({ status }) => stateOf(status)), [
    "waiting", "persisting", "failed", "attention", "done", "unknown"
  ]);
  assert.deepEqual(graph.items.map(({ resultReady }) => resultReady), [false, false, false, true, true, false]);
  assert.equal(graph.items[1].source.originalReference, "Original");
  assert.equal(graph.items[1].item.localJobId, "local_b");
  assert.equal(groupTaskStates(graph.items).length, 6);
});

test("drafts preserve unrecognized and excluded source rows without inventing work", () => {
  const graph = toShipmentTaskNetwork({
    taskId: "draft",
    status: "DRAFT",
    sourceRows: [
      { id: "one", sourceRow: 3, originalReference: "Original" },
      { id: "two", sourceRow: 4, disposition: "EXCLUDE", originalReference: { raw: "as in Excel", normalized: "ASEXCEL" } }
    ],
    items: [{ id: "one", sourceRow: 3, carrier: "HMM", number: "HMM123" }]
  });
  assert.equal(graph.draft, true);
  assert.equal(graph.tone, "draft");
  assert.deepEqual(graph.items.map(({ status }) => status), ["DRAFT", "EXCLUDED"]);
  assert.equal(graph.items[0].reference, "HMM123");
  assert.equal(graph.items[1].resultReady, false);
  assert.equal(graph.items[1].carrier, null);
  assert.equal(graph.items[1].reference, "as in Excel");
});

test("completed and draft payloads reload on actual summary change or manual refresh", () => {
  const done = { status: "COMPLETED", total: 2, succeeded: 1, failed: 1, updatedAt: "v1" };
  const draft = { status: "DRAFT", updatedAt: "v1" };
  assert.equal(taskStatusTone(done), "failed");
  assert.equal(shouldLoadTaskDetail(done, done, "v1"), false);
  assert.equal(shouldLoadTaskDetail(done, { ...done, updatedAt: "v2" }, "v1"), true);
  assert.equal(shouldLoadTaskDetail(draft, { ...draft, updatedAt: "v2" }, "v1"), true);
  assert.equal(shouldLoadTaskDetail(done, done, "v1", true), true);
  assert.equal(shouldLoadTaskDetail(draft, null, "v1"), false);
  assert.equal(shouldLoadTaskDetail({ status: "RUNNING" }, null, "v1"), true);
});
