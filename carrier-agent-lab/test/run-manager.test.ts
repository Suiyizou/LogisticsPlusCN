import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import type { TrackingResult } from "../src/contracts.js";
import { RunManager, RunQueueFullError } from "../src/run-manager.js";

test("run manager enforces one active browser and a finite FIFO queue", async () => {
  const config = loadConfig({ TRACKING_MAX_CONCURRENCY: "1", TRACKING_QUEUE_LIMIT: "2" });
  const releases: Array<() => void> = [];
  const started: string[] = [];
  const manager = new RunManager(config, async ({ runId, request }) => {
    started.push(runId);
    await new Promise<void>((resolve) => releases.push(resolve));
    return resultFor(runId, request.reference);
  });
  const request = { carrier: "OOCL" as const, referenceType: "BOOKING" as const, reference: "OOLU1234567890" };

  const first = manager.create(request);
  const second = manager.create(request);
  const third = manager.create(request);
  assert.equal(manager.get(first.id)?.state, "RUNNING");
  assert.equal(manager.get(second.id)?.state, "QUEUED");
  assert.equal(manager.get(third.id)?.state, "QUEUED");
  assert.deepEqual(manager.stats(), { active: 1, queued: 2, maxConcurrency: 1, queueLimit: 2 });
  assert.throws(() => manager.create(request), RunQueueFullError);

  releases.shift()?.();
  await waitUntil(() => manager.get(second.id)?.state === "RUNNING");
  assert.deepEqual(started, [first.id, second.id]);
  releases.shift()?.();
  await waitUntil(() => manager.get(third.id)?.state === "RUNNING");
  releases.shift()?.();
  await waitUntil(() => manager.get(third.id)?.state === "COMPLETED");
  assert.deepEqual(started, [first.id, second.id, third.id]);
  assert.deepEqual(manager.stats(), { active: 0, queued: 0, maxConcurrency: 1, queueLimit: 2 });
});

test("run manager marks a deadline and releases its slot only after executor cleanup", async () => {
  const config = loadConfig({ TRACKING_RUN_TIMEOUT_MS: "20" });
  const manager = new RunManager(config, async ({ signal, runId, request, onEvent }) => {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => setTimeout(resolve, 20), { once: true }));
    onEvent({
      type: "TOOL_RESULT",
      message: "浏览器最终页面截图已留存",
      toolName: "browser_screenshot",
      toolCallId: "run-final-screenshot",
      attachments: [{
        type: "SCREENSHOT",
        artifactId: "123e4567-e89b-42d3-a456-426614174000.jpg",
        label: "最终浏览器页面截图",
        mimeType: "image/jpeg",
      }],
    });
    return resultFor(runId, request.reference);
  });
  const run = manager.create({
    carrier: "OOCL",
    referenceType: "BILL_OF_LADING",
    reference: "OOLU1234567890",
  });
  await waitUntil(() => manager.get(run.id)?.state === "FAILED");
  assert.match(manager.get(run.id)?.error ?? "", /deadline/);
  assert.equal(manager.stats().active, 1);
  await waitUntil(() => manager.stats().active === 0);
  assert.equal(manager.stats().active, 0);
  assert.equal(
    manager.get(run.id)?.events.some((event) => event.toolCallId === "run-final-screenshot"),
    true,
  );
});

test("event retention removes screenshot bytes whose declaring event was truncated", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "carrier-agent-retention-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const config = { ...loadConfig(), rootDir };
  let artifactPath = "";
  const manager = new RunManager(config, async ({ runId, request, onEvent }) => {
    const artifactId = "ebc1cf8a-46bc-4e03-b361-12a8e80fc188.jpg";
    artifactPath = join(rootDir, "artifacts", runId, artifactId);
    await mkdir(join(rootDir, "artifacts", runId), { recursive: true });
    await writeFile(artifactPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    onEvent({
      type: "TOOL_RESULT",
      message: "截图完成",
      attachments: [{ type: "SCREENSHOT", artifactId, label: "page", mimeType: "image/jpeg" }],
    });
    for (let index = 0; index < 105; index += 1) onEvent({ type: "SYSTEM", message: `event-${index}` });
    return resultFor(runId, request.reference);
  });
  const run = manager.create({
    carrier: "OOCL",
    referenceType: "BOOKING",
    reference: "OOLU1234567890",
  });
  await waitUntil(() => manager.get(run.id)?.state === "COMPLETED");
  assert.equal(manager.get(run.id)?.events.length, 100);
  assert.equal(manager.get(run.id)?.events.some((event) => event.attachments?.length), false);
  await waitUntilAsync(async () => {
    try {
      await access(artifactPath);
      return false;
    } catch {
      return true;
    }
  });
});

test("run manager stores only the sanitized rich public event contract", async () => {
  const reference = "OOLU1234567890";
  const manager = new RunManager(loadConfig(), async ({ runId, request, onEvent }) => {
    onEvent({
      type: "TOOL_RESULT",
      message: `Processed ${reference}`,
      turn: 4,
      decisionSummary: `Validate ${reference} before submission`,
      toolName: "browser_screenshot",
      toolCallId: "call-4",
      toolInput: { reference, password: "hunter2" },
      toolOutput: { message: `Found ${reference}`, rawDom: "<html>secret</html>" },
      durationMs: Number.MAX_SAFE_INTEGER,
      outcome: "SUCCESS",
      stage: "VISUAL_INSPECTION",
      rationale: `Visible evidence for ${reference}`,
      action: `Capture ${reference}`,
      observation: `Found ${reference}; token=top-secret`,
      nextStep: `Validate ${reference}`,
      retry: {
        willRetry: false,
        mode: "AUTOMATIC",
        attempt: 101,
        maxAttempts: 200,
        reason: `Retry ${reference}`,
      },
      attachments: [
        {
          type: "SCREENSHOT",
          artifactId: "ebc1cf8a-46bc-4e03-b361-12a8e80fc188.jpg",
          label: reference,
          mimeType: "image/jpeg",
        },
        { type: "SCREENSHOT", artifactId: "../escape.jpg", label: "bad", mimeType: "image/jpeg" },
      ],
    });
    return resultFor(runId, request.reference);
  });
  const run = manager.create({ carrier: "OOCL", referenceType: "BOOKING", reference });
  await waitUntil(() => manager.get(run.id)?.state === "COMPLETED");
  const event = manager.get(run.id)?.events.find((candidate) => candidate.toolCallId === "call-4");
  assert(event);
  assert.equal(event.turn, 4);
  assert.equal(event.durationMs, 24 * 60 * 60 * 1000);
  assert.equal(event.outcome, "SUCCESS");
  assert.equal(event.stage, "VISUAL_INSPECTION");
  assert.deepEqual(event.retry, {
    willRetry: false,
    mode: "AUTOMATIC",
    attempt: 100,
    maxAttempts: 100,
    reason: "Retry [业务标识已隐藏]",
  });
  assert.deepEqual(event.attachments, [{
    type: "SCREENSHOT",
    artifactId: "ebc1cf8a-46bc-4e03-b361-12a8e80fc188.jpg",
    label: "浏览器页面截图",
    mimeType: "image/jpeg",
  }]);
  assert.doesNotMatch(JSON.stringify(event), /OOLU1234567890|hunter2|<html>|\.\.\//);
});

test("run manager never persists an arbitrary executor exception message", async () => {
  const unlabelledSecret = "opaque-provider-value-91c024";
  const manager = new RunManager(loadConfig(), async () => {
    throw new Error(`Provider exploded while holding ${unlabelledSecret}`);
  });
  const run = manager.create({ carrier: "OOCL", referenceType: "BOOKING", reference: "OOLU1234567890" });
  await waitUntil(() => manager.get(run.id)?.state === "FAILED");
  const failed = manager.get(run.id);
  assert.equal(failed?.error, "EXECUTION_FAILED");
  const event = failed?.events.at(-1);
  assert.equal(event?.status, "EXECUTION_FAILED");
  assert.equal(event?.retry?.reason, "终止类别 EXECUTION_FAILED");
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(unlabelledSecret));
  assert.doesNotMatch(JSON.stringify(failed), /Provider exploded/);
});

test("run manager preserves only allowlisted precise terminal failure codes", async () => {
  const manager = new RunManager(loadConfig(), async () => {
    throw new Error("MODEL_OUTPUT_LIMIT");
  });
  const run = manager.create({ carrier: "OOCL", referenceType: "BOOKING", reference: "OOLU1234567890" });
  await waitUntil(() => manager.get(run.id)?.state === "FAILED");
  const failed = manager.get(run.id);
  assert.equal(failed?.error, "MODEL_OUTPUT_LIMIT");
  assert.equal(failed?.events.at(-1)?.status, "MODEL_OUTPUT_LIMIT");
  assert.equal(failed?.events.at(-1)?.observation, "模型输出达到安全长度上限");
});

function resultFor(runId: string, reference: string): TrackingResult {
  return {
    schemaVersion: "1.0",
    runId,
    status: "NOT_FOUND",
    carrier: { code: "OOCL", name: "OOCL", trackingUrl: null, detectedBy: "EXPLICIT", confidence: 1 },
    query: { reference, referenceType: "BOOKING" },
    fetchedAt: new Date().toISOString(),
    shipment: null,
    containers: [],
    evidence: [{ field: "query", value: reference, sourceUrl: "internal://test", method: "DOM" }],
    warnings: [],
    note: null,
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for run state");
}

async function waitUntilAsync(predicate: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for asynchronous state");
}
