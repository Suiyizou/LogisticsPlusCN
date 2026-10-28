import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import type { TrackingResult } from "../src/contracts.js";
import { RunManager } from "../src/run-manager.js";
import { createLabServer } from "../src/server.js";

interface ApiRun {
  state: string;
  result?: { status: string } | null;
}

test("integrated preview page, health, and router-only API work without an LLM", async (t) => {
  const server = createLabServer(loadConfig({ TRACKING_BROWSER_HEADLESS: "true" }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const pageText = await page.text();
  assert.match(pageText, /船司货踪 Agent 预览/);
  assert.match(pageText, /href="\.\/styles\.css"/);
  assert.match(pageText, /src="\.\/app\.js"/);
  assert.doesNotMatch(pageText, /id="headed"/);
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json() as {
    ok: boolean;
    status: string;
    service: string;
    queue: { maxConcurrency: number; queueLimit: number };
    demo: { enabled: boolean };
    artifacts: { ttlMs: number };
  };
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.status, "UP");
  assert.equal(healthBody.service, "carrier-agent-lab");
  assert.deepEqual(healthBody.queue, { active: 0, queued: 0, maxConcurrency: 1, queueLimit: 5 });
  assert.deepEqual(healthBody.demo, { enabled: false });
  assert.deepEqual(healthBody.artifacts, { ttlMs: 24 * 60 * 60 * 1000 });
  const carrierResponse = await fetch(`${origin}/api/carriers`);
  assert.equal(carrierResponse.status, 200);
  const carrierBody = await carrierResponse.json() as {
    carriers: Array<{ code: string; mode: string }>;
  };
  assert.equal(carrierBody.carriers.length, 13);
  assert.equal(carrierBody.carriers.find((item) => item.code === "COSCO")?.mode, "EXISTING_SYSTEM");
  assert.equal(carrierBody.carriers.find((item) => item.code === "ONE")?.mode, "BROWSER_AGENT");
  const created = await fetch(`${origin}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ carrier: "AUTO", referenceType: "BOOKING", reference: "123456789" }),
  });
  assert.equal(created.status, 202);
  const run = await created.json() as { id: string };
  let current: ApiRun | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await (await fetch(`${origin}/api/runs/${run.id}`)).json() as ApiRun;
    if (current?.state === "COMPLETED") break;
  }
  assert.equal(current?.state, "COMPLETED");
  assert.equal(current?.result?.status, "AMBIGUOUS");
});

test("HTTP API rejects headed mode when disabled and returns 429 when its finite queue is full", async (t) => {
  const config = loadConfig({
    TRACKING_BROWSER_HEADLESS: "true",
    TRACKING_BROWSER_ALLOW_HEADED: "false",
    TRACKING_MAX_CONCURRENCY: "1",
    TRACKING_QUEUE_LIMIT: "1",
    TRACKING_RUN_TIMEOUT_MS: "200",
  });
  const blockingExecutor = async (): Promise<TrackingResult> => new Promise(() => undefined);
  const manager = new RunManager(config, blockingExecutor);
  const server = createLabServer(config, manager);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = { carrier: "OOCL", referenceType: "BOOKING", reference: "OOLU1234567890" };

  const forbiddenHeaded = await fetch(`${origin}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, headed: true }),
  });
  assert.equal(forbiddenHeaded.status, 400);

  assert.equal((await createRun(origin, request)).status, 202);
  assert.equal((await createRun(origin, request)).status, 202);
  const overflow = await createRun(origin, request);
  assert.equal(overflow.status, 429);
  const overflowBody = await overflow.json() as { code: string };
  assert.equal(overflowBody.code, "QUEUE_FULL");
});

test("run screenshot artifacts are served only when declared by that run", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "carrier-agent-artifacts-"));
  const baseConfig = loadConfig({ TRACKING_BROWSER_HEADLESS: "true" });
  const config = { ...baseConfig, rootDir };
  const artifactId = "ebc1cf8a-46bc-4e03-b361-12a8e80fc188.jpg";
  const oversizedArtifactId = "bfc1cf8a-46bc-4e03-b361-12a8e80fc199.jpg";
  const raceArtifactId = "cfc1cf8a-46bc-4e03-b361-12a8e80fc177.jpg";
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);
  const raceJpeg = Buffer.alloc(512 * 1024, 0xab);
  const manager = new RunManager(config, async ({ runId, request, onEvent }) => {
    const artifactDir = join(rootDir, "artifacts", runId);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, artifactId), jpeg);
    await writeFile(join(artifactDir, oversizedArtifactId), Buffer.alloc(5 * 1024 * 1024 + 1));
    await writeFile(join(artifactDir, raceArtifactId), raceJpeg);
    await writeFile(join(artifactDir, "undeclared.jpg"), jpeg);
    onEvent({
      type: "TOOL_RESULT",
      message: "截图已留存",
      toolName: "browser_screenshot",
      toolCallId: "call-screenshot",
      status: "SUCCESS",
      outcome: "SUCCESS",
      durationMs: 12,
      attachments: [
        { type: "SCREENSHOT", artifactId, label: "unsafe model label", mimeType: "image/jpeg" },
        { type: "SCREENSHOT", artifactId: oversizedArtifactId, label: "large", mimeType: "image/jpeg" },
        { type: "SCREENSHOT", artifactId: raceArtifactId, label: "race", mimeType: "image/jpeg" },
      ],
    });
    return resultFor(runId, request.reference);
  });
  const server = createLabServer(config, manager);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(rootDir, { recursive: true, force: true });
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const created = await createRun(origin, {
    carrier: "OOCL",
    referenceType: "BOOKING",
    reference: "OOLU1234567890",
  });
  const run = await created.json() as { id: string };
  await waitUntil(async () => (await (await fetch(`${origin}/api/runs/${run.id}`)).json() as ApiRun).state === "COMPLETED");

  const declared = await fetch(`${origin}/api/runs/${run.id}/artifacts/${artifactId}`);
  assert.equal(declared.status, 200);
  assert.equal(declared.headers.get("content-type"), "image/jpeg");
  assert.equal(declared.headers.get("cache-control"), "private, no-store");
  assert.equal(declared.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await declared.arrayBuffer()), jpeg);

  assert.equal((await fetch(`${origin}/api/runs/${run.id}/artifacts/${oversizedArtifactId}`)).status, 413);
  assert.equal((await fetch(`${origin}/api/runs/${run.id}/artifacts/undeclared.jpg`)).status, 404);
  assert.equal((await fetch(`${origin}/api/runs/00000000-0000-0000-0000-000000000000/artifacts/${artifactId}`)).status, 404);
  assert.equal((await fetch(`${origin}/api/runs/${run.id}/artifacts/..%2Fundeclared.jpg`)).status, 404);

  const raceResponsePromise = fetch(`${origin}/api/runs/${run.id}/artifacts/${raceArtifactId}`, {
    signal: AbortSignal.timeout(2_000),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await rm(join(rootDir, "artifacts", run.id, raceArtifactId), { force: true });
  const raceResponse = await raceResponsePromise;
  assert([200, 404].includes(raceResponse.status));
  if (raceResponse.status === 200) assert.equal((await raceResponse.arrayBuffer()).byteLength, raceJpeg.byteLength);

  await rm(join(rootDir, "artifacts", run.id, artifactId), { force: true });
  assert.equal((await fetch(`${origin}/api/runs/${run.id}/artifacts/${artifactId}`)).status, 404);
  assert.equal((await fetch(`${origin}/api/health`)).status, 200);
});

test("server startup removes expired run directories without touching fresh, named, or retained runs", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "carrier-agent-startup-cleanup-"));
  const config = {
    ...loadConfig({ TRACKING_ARTIFACT_TTL_HOURS: "1" }),
    rootDir,
  };
  const manager = new RunManager(config, async ({ runId, request }) => resultFor(runId, request.reference));
  const retained = manager.create({
    carrier: "OOCL",
    referenceType: "BOOKING",
    reference: "OOLU1234567890",
  });
  await waitFor(() => manager.get(retained.id)?.state === "COMPLETED");

  const artifactRoot = join(rootDir, "artifacts");
  const expiredId = "11111111-1111-4111-8111-111111111111";
  const freshId = "22222222-2222-4222-8222-222222222222";
  const namedDirectory = "site-smoke";
  for (const directory of [expiredId, freshId, namedDirectory, retained.id]) {
    await mkdir(join(artifactRoot, directory), { recursive: true });
    await writeFile(join(artifactRoot, directory, "marker.txt"), directory);
  }
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(join(artifactRoot, expiredId), old, old);
  await utimes(join(artifactRoot, namedDirectory), old, old);
  await utimes(join(artifactRoot, retained.id), old, old);

  const server = createLabServer(config, manager);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(rootDir, { recursive: true, force: true });
  });
  const address = server.address();
  assert(address && typeof address === "object");
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/health`)).status, 200);

  assert.equal(await pathExists(join(artifactRoot, expiredId)), false);
  assert.equal(await pathExists(join(artifactRoot, freshId)), true);
  assert.equal(await pathExists(join(artifactRoot, namedDirectory)), true);
  assert.equal(await pathExists(join(artifactRoot, retained.id)), true);
});

function createRun(origin: string, body: object): Promise<Response> {
  return fetch(`${origin}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

async function waitUntil(predicate: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for run state");
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for state");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
