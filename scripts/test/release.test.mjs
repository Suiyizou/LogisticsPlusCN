import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bash =
  process.env.BASH_PATH ||
  (process.platform === "win32"
    ? ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe"].find(
        existsSync
      )
    : "bash");
assert.ok(bash, "Release tests require Bash (Git Bash on Windows); set BASH_PATH if needed.");

// Run the real release scripts in disposable repositories. Only external Docker/Git/HTTP
// commands are substituted; checksum generation and archive creation/restoration are real.
const docker = `#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >> "$TEST_LOG"
if [[ "$1" == image ]]; then
  [[ "\${MISSING_IMAGE_NAME:-}" != "$3" ]]
  exit
fi
if [[ "$1" == inspect ]]; then
  container="\${!#}"
  service="\${container%-container}"
  case "$service" in
    backend) image=cargo-planner-backend ;;
    tracking) image=cargo-platform-tracking ;;
    frontend) image=cargo-planner-frontend ;;
    *) exit 96 ;;
  esac
  tag="\${RUNNING_IMAGE_TAG:-$(cat "$TEST_FIXTURE/running-tag")}"
  [[ "$service" != frontend || -z "\${FRONTEND_IMAGE_TAG:-}" ]] || tag="$FRONTEND_IMAGE_TAG"
  if [[ "$3" == '{{.Config.Image}}' ]]; then echo "$image:$tag"
  elif [[ "$3" == '{{.Image}}' ]]; then echo "sha256:$service-$tag"
  else exit 97; fi
  exit
fi
[[ "$1" == compose ]] || exit 90
shift
while [[ "$1" == --project-directory || "$1" == -f ]]; do shift 2; done
action="$1"
shift
case "$action" in
  exec)
    [[ "$1" == -T ]] && shift
    service="$1"
    shift
    if [[ "$service" == mysql ]]; then
      if [[ "$*" == *mysqldump* ]]; then
        echo 'CREATE TABLE example (id INT); INSERT INTO example VALUES (7);'
      elif [[ "$*" == *'SELECT 1'* ]]; then
        echo 1
      else
        cat > "$TEST_FIXTURE/restored/db.sql"
        [[ "\${FAIL_DB_RESTORE:-0}" == 0 ]] || exit 42
      fi
    elif [[ "$*" == *'/app/secrets'* ]]; then
      tar czf - -C "$TEST_FIXTURE/payload/secrets" .
    elif [[ "$*" == *'/app/uploads'* ]]; then
      tar czf - -C "$TEST_FIXTURE/payload/uploads" .
    else
      exit 91
    fi
    ;;
  run)
    # Model the backend's Java ENTRYPOINT: passing sh as CMD does not run a shell.
    [[ "$*" == *'--entrypoint sh backend -c '* ]] || exit 95
    if [[ "$*" == *'/app/secrets'* ]]; then
      tar xzf - -C "$TEST_FIXTURE/restored/secrets"
    elif [[ "$*" == *'/app/uploads'* ]]; then
      tar xzf - -C "$TEST_FIXTURE/restored/uploads"
    else
      exit 92
    fi
    ;;
  ps) echo "\${!#}-container" ;;
  stop) [[ "\${FAIL_STOP:-0}" == 0 ]] || exit 43 ;;
  up) [[ -z "\${IMAGE_TAG:-}" ]] || echo "$IMAGE_TAG" > "$TEST_FIXTURE/running-tag" ;;
  build|start|restart) : ;;
  *) exit 93 ;;
esac
`;
const git = `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\n' "$*" >> "$TEST_LOG"
[[ "$1" == -C ]] && shift 2
case "$1" in
  rev-parse)
    if [[ "$*" == *--abbrev-ref* ]]; then echo test-branch
    else cat "$TEST_FIXTURE/head"; fi
    ;;
  describe) cat "$TEST_FIXTURE/head" ;;
  checkout) echo "$2" > "$TEST_FIXTURE/head" ;;
  fetch) : ;;
  *) exit 94 ;;
esac
`;

function shellPath(path) {
  return process.platform === "win32"
    ? path
        .replace(/^([A-Za-z]):[\\/]/, (_match, drive) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/")
    : path;
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "shipment-release-test-"));
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("shipment-release-test-"));
    rmSync(directory, { recursive: true, force: true });
  });
  for (const path of [
    "bin",
    "scripts/lib",
    "restored/secrets",
    "restored/uploads",
    "payload/secrets",
    "payload/uploads/announcement-images",
    "data/shipment-files"
  ]) {
    mkdirSync(join(directory, path), { recursive: true });
  }
  for (const path of [
    "scripts/backup.sh",
    "scripts/deploy.sh",
    "scripts/rollback.sh",
    "scripts/lib/common.sh"
  ]) {
    cpSync(join(root, path), join(directory, path));
    writeFileSync(
      join(directory, path),
      readFileSync(join(directory, path), "utf8").replace(/\r\n/g, "\n"),
      { mode: 0o755 }
    );
  }
  for (const [name, content] of Object.entries({
    docker,
    git,
    curl: '#!/usr/bin/env bash\nprintf "curl %s\\n" "$*" >> "$TEST_LOG"\n[[ "${FAIL_SMOKE:-0}" == 0 ]]\n',
    sleep: "#!/usr/bin/env bash\nexit 0\n"
  })) {
    writeFileSync(join(directory, "bin", name), content, { mode: 0o755 });
  }
  writeFileSync(
    join(directory, ".env"),
    "IMAGE_TAG=old-tag\nSHIPMENT_FILE_HOST_PATH=./data/shipment-files\n"
  );
  writeFileSync(join(directory, "head"), "old-commit\n");
  writeFileSync(join(directory, "running-tag"), "old-tag\n");
  writeFileSync(join(directory, "commands.log"), "");
  writeFileSync(join(directory, "payload/secrets/key.demo"), "backup-key");
  writeFileSync(join(directory, "payload/uploads/customer-file.txt"), "customer attachment");
  writeFileSync(
    join(directory, "payload/uploads/announcement-images/banner.txt"),
    "announcement image"
  );
  writeFileSync(join(directory, "data/shipment-files/invoice.txt"), "old invoice");
  const environment = {
    ...process.env,
    PATH: `${join(directory, "bin")}${delimiter}${process.env.PATH || ""}`,
    MSYS_NO_PATHCONV: "1",
    TEST_FIXTURE: shellPath(directory),
    TEST_LOG: shellPath(join(directory, "commands.log"))
  };
  function run(args, extraEnvironment = {}) {
    const launcher =
      'export PATH="$TEST_FIXTURE/bin:$PATH"; for tool in docker git curl; do [[ "$(command -v "$tool")" == "$TEST_FIXTURE/bin/$tool" ]] || exit 95; done; exec bash "$@"';
    return spawnSync(bash, ["-c", launcher, "release-test", ...args.map(shellPath)], {
      cwd: directory,
      env: { ...environment, ...extraEnvironment },
      encoding: "utf8",
      timeout: 60000
    });
  }
  function succeeded(result) {
    assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  }
  function backup() {
    const path = join(directory, "backups/fixture");
    succeeded(run(["scripts/backup.sh", path]));
    writeFileSync(join(directory, "commands.log"), "");
    return path;
  }
  function verify(path) {
    succeeded(run(["-c", '. scripts/lib/common.sh; verify_checksums "$1"', "verify", path]));
  }
  const log = () => readFileSync(join(directory, "commands.log"), "utf8");
  return { directory, run, succeeded, backup, verify, log };
}

test("successful deployment leaves a verified backup and writes its release manifest beside it", (t) => {
  const f = fixture(t);
  const result = f.run(["scripts/deploy.sh", "--ref", "new-commit", "--image-tag", "release-new"]);
  f.succeeded(result);
  const entry = readdirSync(join(f.directory, "backups"), { withFileTypes: true }).find((item) =>
    item.isDirectory()
  );
  assert.ok(entry);
  const path = join(f.directory, "backups", entry.name);
  f.verify(path);
  const version = readFileSync(join(path, "version.txt"), "utf8");
  assert.match(version, /git_commit=old-commit/);
  assert.doesNotMatch(version, /release_commit/);
  const manifest = readFileSync(`${path}.release.txt`, "utf8");
  assert.match(manifest, /release_commit=new-commit/);
  assert.match(manifest, /release_image_tag=release-new/);
  assert.match(manifest, /previous_commit=old-commit/);
});

test("failed deployment still leaves an intact backup and points rollback at the previous commit", (t) => {
  const f = fixture(t);
  const result = f.run(["scripts/deploy.sh", "--ref", "new-commit"], { FAIL_SMOKE: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--checkout old-commit/);
  const entry = readdirSync(join(f.directory, "backups"), { withFileTypes: true }).find((item) =>
    item.isDirectory()
  );
  f.verify(join(f.directory, "backups", entry.name));
});

test("backup after deployment records the running release even when .env still names the older image", (t) => {
  const f = fixture(t);
  f.succeeded(f.run(["scripts/deploy.sh", "--ref", "new-commit", "--image-tag", "release-new"]));
  assert.match(readFileSync(join(f.directory, ".env"), "utf8"), /IMAGE_TAG=old-tag/);
  const path = f.backup();
  assert.match(readFileSync(join(path, "version.txt"), "utf8"), /image_tag=release-new/);
  assert.match(
    readFileSync(join(path, "images.txt"), "utf8"),
    /cargo-platform-tracking:release-new/
  );
  f.succeeded(f.run(["scripts/rollback.sh", path]));
  assert.match(f.log(), /image inspect cargo-planner-backend:release-new/);
  assert.doesNotMatch(f.log(), /image inspect cargo-planner-backend:old-tag/);
});

test("rollback prefers actual references in an older backup over its stale version tag", (t) => {
  const f = fixture(t);
  const path = f.backup();
  writeFileSync(
    join(path, "images.txt"),
    [
      "container=/backend image_ref=cargo-planner-backend:actual-release image_id=sha256:backend",
      "container=/tracking image_ref=cargo-platform-tracking:actual-release image_id=sha256:tracking",
      "container=/frontend image_ref=cargo-planner-frontend:actual-release image_id=sha256:frontend",
      ""
    ].join("\n")
  );
  f.succeeded(f.run(["-c", '. scripts/lib/common.sh; write_checksums "$1"', "checksums", path]));
  f.succeeded(f.run(["scripts/rollback.sh", path]));
  assert.match(f.log(), /image inspect cargo-planner-frontend:actual-release/);
  assert.doesNotMatch(f.log(), /image inspect cargo-planner-backend:old-tag/);
});

test("backup refuses mixed running releases instead of recording an unsafe rollback tag", (t) => {
  const f = fixture(t);
  const path = join(f.directory, "backups/mixed");
  const result = f.run(["scripts/backup.sh", path], { FRONTEND_IMAGE_TAG: "other-release" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /do not share one release tag/);
  assert.doesNotMatch(f.log(), /mysqldump/);
  assert.equal(existsSync(join(path, "checksums.sha256")), false);
});

test("full rollback restores database, secrets, customer uploads, announcements and shipment files", (t) => {
  const f = fixture(t);
  const path = f.backup();
  writeFileSync(join(f.directory, "data/shipment-files/invoice.txt"), "new invoice");
  writeFileSync(join(f.directory, "head"), "new-commit\n");
  f.succeeded(f.run(["scripts/rollback.sh", path]));
  assert.equal(
    readFileSync(join(f.directory, "restored/db.sql"), "utf8"),
    readFileSync(join(path, "db.sql"), "utf8")
  );
  for (const [file, expected] of [
    ["restored/secrets/key.demo", "backup-key"],
    ["restored/uploads/customer-file.txt", "customer attachment"],
    ["restored/uploads/announcement-images/banner.txt", "announcement image"],
    ["data/shipment-files/invoice.txt", "old invoice"]
  ])
    assert.equal(readFileSync(join(f.directory, file), "utf8"), expected);
  assert.match(f.log(), /stop backend tracking frontend/);
  assert.match(f.log(), /run --rm --no-deps -T --entrypoint sh backend -c/);
  assert.match(f.log(), /image inspect cargo-platform-tracking:old-tag/);
  assert.match(f.log(), /image inspect cargo-planner-frontend:old-tag/);
  assert.match(f.log(), /up -d --wait/);
  assert.match(f.log(), /tracking\/api\/health/);
});

test("database-only restore keeps public services running and starts the existing backend without changing code", (t) => {
  const f = fixture(t);
  const path = f.backup();
  writeFileSync(join(f.directory, "head"), "new-commit\n");
  writeFileSync(join(f.directory, "data/shipment-files/invoice.txt"), "current invoice");
  f.succeeded(f.run(["scripts/rollback.sh", path, "--db-only"]));
  assert.match(f.log(), /stop backend\n/);
  assert.match(f.log(), /start backend\n/);
  assert.doesNotMatch(
    f.log(),
    /stop backend tracking|checkout|image inspect|compose.*run|compose.*build|restart/
  );
  assert.equal(readFileSync(join(f.directory, "head"), "utf8"), "new-commit\n");
  assert.equal(
    readFileSync(join(f.directory, "data/shipment-files/invoice.txt"), "utf8"),
    "current invoice"
  );
  assert.equal(existsSync(join(f.directory, "restored/uploads/customer-file.txt")), false);
});

test("corrupted backups fail before code checkout or container operations", (t) => {
  const f = fixture(t);
  const path = f.backup();
  writeFileSync(join(path, "db.sql"), "corrupted");
  assert.notEqual(f.run(["scripts/rollback.sh", path]).status, 0);
  assert.equal(f.log(), "");
});

test("full rollback rejects a missing required workspace archive before stopping services", (t) => {
  const f = fixture(t);
  const path = f.backup();
  rmSync(join(path, "workspace-files.tgz"));
  f.succeeded(f.run(["-c", '. scripts/lib/common.sh; write_checksums "$1"', "checksums", path]));
  const result = f.run(["scripts/rollback.sh", path]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workspace-files archive/);
  assert.equal(f.log(), "");
});

test("missing tracking or frontend image triggers a rebuild before destructive restore", (t) => {
  const f = fixture(t);
  const path = f.backup();
  f.succeeded(
    f.run(["scripts/rollback.sh", path], { MISSING_IMAGE_NAME: "cargo-planner-frontend:old-tag" })
  );
  const log = f.log();
  assert.ok(log.indexOf("build") < log.indexOf("stop backend"));
  assert.match(log, /image inspect cargo-planner-backend:old-tag/);
  assert.match(log, /image inspect cargo-platform-tracking:old-tag/);
});

test("database restore failure leaves the writer stopped and returns an error", (t) => {
  const f = fixture(t);
  const path = f.backup();
  assert.equal(
    f.run(["scripts/rollback.sh", path, "--db-only"], { FAIL_DB_RESTORE: "1" }).status,
    42
  );
  assert.match(f.log(), /stop backend/);
  assert.doesNotMatch(f.log(), /start backend|restart backend/);
});

test("failure to stop the writer prevents database restore", (t) => {
  const f = fixture(t);
  const path = f.backup();
  assert.equal(f.run(["scripts/rollback.sh", path, "--db-only"], { FAIL_STOP: "1" }).status, 43);
  assert.equal(existsSync(join(f.directory, "restored/db.sql")), false);
});

test("database-only mode rejects code or image switches", (t) => {
  const f = fixture(t);
  const path = f.backup();
  assert.equal(f.run(["scripts/rollback.sh", path, "--db-only", "--checkout", "other"]).status, 2);
  assert.equal(f.run(["scripts/rollback.sh", path, "--db-only", "--image-tag", "other"]).status, 2);
  assert.equal(f.log(), "");
});
