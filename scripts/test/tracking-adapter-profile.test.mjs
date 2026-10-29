import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hasCompose =
  spawnSync("docker", ["compose", "version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000
  }).status === 0;

function render(t, overlay, mode) {
  const directory = mkdtempSync(join(tmpdir(), "tracking-profile-config-"));
  t.after(() => {
    assert.ok(basename(directory).startsWith("tracking-profile-config-"));
    assert.equal(realpathSync(dirname(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const envFile = join(directory, "fixture.env");
  writeFileSync(
    envFile,
    [
      "PREVIEW_MYSQL_ROOT_PASSWORD=config-test-only",
      "PREVIEW_MYSQL_PASSWORD=config-test-only",
      ...(mode ? [`APP_TRACKING_ADAPTER_MODE=${mode}`] : [])
    ].join("\n") + "\n"
  );
  const env = { ...process.env };
  for (const key of [
    "APP_TRACKING_ADAPTER_MODE",
    "VITE_TRACKING_ADAPTER_MODE",
    "COMPOSE_FILE",
    "COMPOSE_PROJECT_NAME",
    "COMPOSE_ENV_FILES"
  ])
    delete env[key];
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      "tracking-profile-regression",
      "--env-file",
      envFile,
      "-f",
      "docker-compose.yml",
      ...(overlay ? ["-f", overlay] : []),
      "config",
      "--format",
      "json"
    ],
    { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 30000 }
  );
  assert.equal(result.status, 0, result.stderr || "Compose config did not render");
  return JSON.parse(result.stdout).services;
}

for (const [name, overlay] of [
  ["production", ""],
  ["staging", "docker-compose.staging.yml"]
]) {
  for (const mode of [undefined, "LEGACY", "LOCAL_QUEUE"]) {
    test(
      `${name} pairs its frontend build and backend mode (${mode || "default"})`,
      { skip: !hasCompose },
      (t) => {
        const services = render(t, overlay, mode);
        const expected = mode || "LOCAL_QUEUE";
        assert.equal(services.backend.environment.APP_TRACKING_ADAPTER_MODE, expected);
        assert.equal(services.frontend.build.args.VITE_TRACKING_ADAPTER_MODE, expected);
      }
    );
  }
}

test(
  "preview pins the preserved legacy pair even when the parent env selects local queue",
  { skip: !hasCompose },
  (t) => {
    const services = render(t, "docker-compose.dev-preview.yml", "LOCAL_QUEUE");
    assert.equal(services.backend.environment.APP_TRACKING_ADAPTER_MODE, "LEGACY");
    assert.equal(services.frontend.build.args.VITE_TRACKING_ADAPTER_MODE, "LEGACY");
    assert.equal(services.mysql.container_name, "cargo-ui-preview-mysql");
    assert.equal(services.backend.container_name, "cargo-ui-preview-backend");
  }
);

test("the frontend Docker build exports the selected mode before Vite compiles", () => {
  const dockerfile = readFileSync(
    new URL("../../docker/frontend.Dockerfile", import.meta.url),
    "utf8"
  );
  const build = dockerfile.split(/\nFROM /)[0];
  assert.match(build, /^ARG VITE_TRACKING_ADAPTER_MODE=LOCAL_QUEUE$/m);
  assert.match(build, /^ENV VITE_TRACKING_ADAPTER_MODE=\$VITE_TRACKING_ADAPTER_MODE$/m);
  assert.ok(build.indexOf("ENV VITE_TRACKING_ADAPTER_MODE=") < build.indexOf("RUN npm run build"));
});
