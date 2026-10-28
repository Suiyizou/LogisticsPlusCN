import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeAgentDir } from "../src/agent/runtime-agent-dir.js";

test("runtime agent dir shadows read-only auth inputs and removes credentials on cleanup", async (t) => {
  const sourceDir = await mkdtemp(join(tmpdir(), "carrier-agent-source-"));
  t.after(() => rm(sourceDir, { recursive: true, force: true }));
  const auth = JSON.stringify({ provider: { token: "test-secret" } });
  const models = JSON.stringify({ providers: { provider: { models: [] } } });
  await writeFile(join(sourceDir, "auth.json"), auth, { mode: 0o400 });
  await writeFile(join(sourceDir, "models.json"), models, { mode: 0o400 });

  const runtime = await createRuntimeAgentDir(sourceDir);
  assert.notEqual(runtime.path, sourceDir);
  assert.equal(await readFile(join(runtime.path, "auth.json"), "utf8"), auth);
  assert.equal(await readFile(join(runtime.path, "models.json"), "utf8"), models);

  // pi uses a directory lock next to auth.json. This is the operation that
  // fails with EROFS when the host credential directory itself is mounted ro.
  await mkdir(join(runtime.path, "auth.json.lock"));
  if (process.platform !== "win32") {
    assert.equal((await stat(runtime.path)).mode & 0o777, 0o700);
    assert.equal((await stat(join(runtime.path, "auth.json"))).mode & 0o777, 0o600);
  }

  await runtime.cleanup();
  await assert.rejects(access(runtime.path), { code: "ENOENT" });
  assert.equal(await readFile(join(sourceDir, "auth.json"), "utf8"), auth);
});

test("runtime agent dir also supports provider environment auth without source files", async (t) => {
  const sourceDir = await mkdtemp(join(tmpdir(), "carrier-agent-empty-source-"));
  t.after(() => rm(sourceDir, { recursive: true, force: true }));
  const runtime = await createRuntimeAgentDir(sourceDir);
  await writeFile(join(runtime.path, "auth.json"), "{}");
  await runtime.cleanup();
  await assert.rejects(access(runtime.path), { code: "ENOENT" });
});
