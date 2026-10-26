#!/usr/bin/env node
/** CI entry point requiring only Node and Docker; Maven and Java run in isolated containers. */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `cargo-migration-build-${Date.now()}-${randomBytes(3).toString("hex")}`;
const work = path.join(root, ".tmp", name);
const jar = path.join(work, "verification.jar");
mkdirSync(work, { recursive: true });
let created = false;
function run(program, arguments_) {
  const result = spawnSync(program, arguments_, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${program} verification command failed with exit ${result.status}`);
}
try {
  run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  run("docker", [
    "build",
    "--target",
    "build",
    "--file",
    "docker/backend.Dockerfile",
    "--tag",
    name,
    "."
  ]);
  run("docker", ["create", "--name", name, "--label", "cargo.migration-build=true", name]);
  created = true;
  run("docker", ["cp", `${name}:/app/target/cargo-planner-backend-0.1.0.jar`, jar]);
  run(process.execPath, [
    "scripts/verify-database-migrations.mjs",
    "--jar",
    jar,
    "--java-runtime",
    "docker",
    "--report",
    ".tmp/database-migrations-ci.json"
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created && name.startsWith("cargo-migration-build-")) {
    const ownership = spawnSync(
      "docker",
      ["inspect", "--format", '{{index .Config.Labels "cargo.migration-build"}}', name],
      { encoding: "utf8", windowsHide: true }
    );
    if (ownership.status === 0 && ownership.stdout.trim() === "true") {
      const cleanup = spawnSync("docker", ["rm", name], { stdio: "inherit", windowsHide: true });
      if (cleanup.status !== 0) process.exitCode = 1;
    } else process.exitCode = 1;
  }
}
