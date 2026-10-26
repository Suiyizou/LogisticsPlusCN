import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const bash =
  process.env.BASH_PATH ||
  (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const source = fileURLToPath(new URL("../deploy-staging.sh", import.meta.url));
const shellPath = (path) =>
  process.platform === "win32"
    ? path
        .replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/")
    : path;
const sha = "a".repeat(40);

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "cargo-staging-test-"));
  t.after(() => {
    assert.ok(basename(directory).startsWith("cargo-staging-test-"));
    assert.equal(realpathSync(dirname(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const staging = join(directory, "app-staging");
  const release = join(staging, "releases", sha);
  for (const path of [join(directory, "bin"), release, join(staging, "shared")])
    mkdirSync(path, { recursive: true });
  writeFileSync(join(staging, ".cargo-staging-owner"), "cargo-staging-v1\n");
  writeFileSync(join(staging, "shared", "staging.env"), "MYSQL_DATABASE=test_only\n");
  writeFileSync(join(release, ".release-sha"), sha + "\n");
  writeFileSync(join(release, "docker-compose.staging.yml"), "services: {}\n");
  writeFileSync(
    join(directory, "deploy.sh"),
    readFileSync(source, "utf8").replaceAll("\r\n", "\n")
  );
  writeFileSync(join(directory, "commands.log"), "");
  const tools = {
    docker:
      '#!/usr/bin/env bash\nprintf "docker %s\\n" "$*" >> "$TEST_LOG"\nif [[ "$*" == *" build "* && "${FAIL_BUILD:-0}" == 1 ]]; then exit 7; fi\n',
    curl: '#!/usr/bin/env bash\nprintf "curl %s\\n" "$*" >> "$TEST_LOG"\nif [[ "$*" == *favicon.svg* && "${FAIL_ASSET:-0}" == 1 ]]; then exit 22; fi\n',
    flock: '#!/usr/bin/env bash\n[[ "${FAIL_LOCK:-0}" == 0 ]]\n',
    ln: '#!/usr/bin/env bash\nprintf "publish %s\\n" "$*" >> "$TEST_LOG"\n'
  };
  for (const [name, content] of Object.entries(tools))
    writeFileSync(join(directory, "bin", name), content, { mode: 0o755 });
  const run = (extra = {}) =>
    spawnSync(
      bash,
      [
        "-c",
        'export PATH="$TEST_FIXTURE/bin:$PATH"; for tool in docker curl flock ln; do [[ "$(command -v "$tool")" == "$TEST_FIXTURE/bin/$tool" ]] || exit 95; done; exec bash "$TEST_FIXTURE/deploy.sh" "$TEST_STAGING_ROOT" "$TEST_RELEASE_SHA"'
      ],
      {
        env: {
          ...process.env,
          TEST_FIXTURE: shellPath(directory),
          TEST_STAGING_ROOT: shellPath(staging),
          TEST_RELEASE_SHA: sha,
          TEST_LOG: shellPath(join(directory, "commands.log")),
          MSYS_NO_PATHCONV: "1",
          ...extra
        },
        encoding: "utf8",
        timeout: 15000
      }
    );
  return {
    run,
    staging,
    release,
    log: () => readFileSync(join(directory, "commands.log"), "utf8")
  };
}

test("staging publishes only after sequential builds and public assets pass", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const log = f.log();
  assert.ok(log.indexOf("build backend") < log.indexOf("build tracking"));
  assert.ok(log.indexOf("build tracking") < log.indexOf("build frontend"));
  assert.ok(log.indexOf("site.webmanifest") < log.indexOf("publish -sfn"));
  assert.equal(
    readFileSync(join(f.staging, "current-image-tag"), "utf8").trim(),
    "staging-" + sha.slice(0, 12)
  );
  assert.match(log, /-p cargo-staging/);
});
test("a failed public asset leaves the release unpublished", (t) => {
  const f = fixture(t);
  const result = f.run({ FAIL_ASSET: "1" });
  assert.equal(result.status, 22);
  assert.doesNotMatch(f.log(), /publish/);
  assert.equal(existsSync(join(f.staging, "current-image-tag")), false);
});
test("a failed build never starts containers or publishes a release", (t) => {
  const f = fixture(t);
  const result = f.run({ FAIL_BUILD: "1" });
  assert.equal(result.status, 7);
  assert.doesNotMatch(f.log(), /up -d|publish/);
});
test("ownership, source SHA and concurrent deployment guards fail before Docker", (t) => {
  const f = fixture(t);
  assert.equal(f.run({ FAIL_LOCK: "1" }).status, 3);
  assert.equal(f.run({ TEST_RELEASE_SHA: "invalid" }).status, 2);
  writeFileSync(join(f.staging, ".cargo-staging-owner"), "different-owner\n");
  assert.equal(f.run().status, 2);
  assert.equal(f.log(), "");
});
