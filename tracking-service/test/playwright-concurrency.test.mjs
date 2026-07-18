import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPlaywrightConcurrencyGate,
  PlaywrightCapacityError
} from "../channels/cosco-playwright.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for gate state");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test("Playwright gate caps global work and starts queued jobs FIFO", async () => {
  const gate = createPlaywrightConcurrencyGate({
    maxConcurrency: 2,
    queueLimit: 4,
    queueTimeoutMs: 1_000
  });
  const blockers = Array.from({ length: 4 }, () => deferred());
  const started = [];
  let active = 0;
  let peak = 0;

  const jobs = blockers.map((blocker, index) =>
    gate.run(async () => {
      started.push(index);
      active += 1;
      peak = Math.max(peak, active);
      await blocker.promise;
      active -= 1;
      return index;
    })
  );

  await waitFor(() => gate.stats().active === 2 && gate.stats().queued === 2);
  assert.deepEqual(started, [0, 1]);
  assert.equal(peak, 2);

  blockers[0].resolve();
  await waitFor(() => started.length === 3);
  assert.deepEqual(started, [0, 1, 2]);
  blockers[1].resolve();
  await waitFor(() => started.length === 4);
  assert.deepEqual(started, [0, 1, 2, 3]);

  blockers[2].resolve();
  blockers[3].resolve();
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3]);
  assert.equal(gate.stats().active, 0);
  assert.equal(gate.stats().queued, 0);
});

test("Playwright gate rejects full and timed-out queues with HTTP 429", async () => {
  const fullGate = createPlaywrightConcurrencyGate({
    maxConcurrency: 1,
    queueLimit: 1,
    queueTimeoutMs: 1_000
  });
  const firstBlocker = deferred();
  const first = fullGate.run(() => firstBlocker.promise);
  await waitFor(() => fullGate.stats().active === 1);
  const queued = fullGate.run(async () => "queued");
  await waitFor(() => fullGate.stats().queued === 1);

  await assert.rejects(
    fullGate.run(async () => "never"),
    (error) =>
      error instanceof PlaywrightCapacityError &&
      error.httpStatus === 429 &&
      error.code === "PLAYWRIGHT_BUSY" &&
      /queue full/.test(error.message)
  );
  firstBlocker.resolve("first");
  assert.equal(await first, "first");
  assert.equal(await queued, "queued");

  const timeoutGate = createPlaywrightConcurrencyGate({
    maxConcurrency: 1,
    queueLimit: 1,
    queueTimeoutMs: 100
  });
  const timeoutBlocker = deferred();
  const activeJob = timeoutGate.run(() => timeoutBlocker.promise);
  await waitFor(() => timeoutGate.stats().active === 1);
  await assert.rejects(
    timeoutGate.run(async () => "never"),
    (error) =>
      error instanceof PlaywrightCapacityError &&
      error.httpStatus === 429 &&
      /queue timeout/.test(error.message)
  );
  timeoutBlocker.resolve();
  await activeJob;
  assert.equal(timeoutGate.stats().active, 0);
  assert.equal(timeoutGate.stats().queued, 0);
});

test("Playwright browser contexts are closed from a finally block", async () => {
  const source = await readFile(
    new URL("../channels/cosco-playwright.mjs", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /let context = null;[\s\S]*?context = await browser\.newContext[\s\S]*?finally \{\s*if \(context\) await context\.close\(\);\s*\}/
  );
});
