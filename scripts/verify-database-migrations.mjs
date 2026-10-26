#!/usr/bin/env node
/** Real MySQL migration matrix. Owns disposable labelled containers; MySQL is published on loopback only. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { assertSchemaEquivalent } from "./lib/schema-equivalence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = Object.fromEntries(
  process.argv.slice(2).reduce((entries, option, index, all) => {
    if (index % 2 === 0) {
      if (
        !["--jar", "--legacy-sql", "--report", "--java-runtime", "--java-image"].includes(option) ||
        all[index + 1] === undefined
      )
        throw new Error(
          "Usage: --jar path [--legacy-sql readonly.sql] [--report report.json] [--java-runtime host|docker]"
        );
      entries.push([option, all[index + 1]]);
    }
    return entries;
  }, [])
);
const jar = path.resolve(
  root,
  options["--jar"] ?? "backend/target/cargo-planner-backend-0.1.0.jar"
);
assert.ok(
  existsSync(jar),
  "Build the current executable backend JAR first: mvn -f backend/pom.xml package"
);
const name = `cargo-migration-test-${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const javaRuntime = options["--java-runtime"] ?? "host";
assert.ok(["host", "docker"].includes(javaRuntime), "--java-runtime must be host or docker");
const javaContainer = `${name}-java`;
const javaNetwork = `${name}-network`;
const work = path.join(root, ".tmp", name);
mkdirSync(work, { recursive: true });
const reportPath = path.resolve(
  root,
  options["--report"] ?? path.join(".tmp", name, "report.json")
);
const checks = [];
let created = false;
let javaCreated = false;
let networkCreated = false;
let port;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const legacyPath = options["--legacy-sql"] ? path.resolve(options["--legacy-sql"]) : null;
const originalHash = legacyPath ? digest(readFileSync(legacyPath)) : null;
function run(program, arguments_, extra = {}) {
  const result = spawnSync(program, arguments_, {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    ...extra
  });
  if (result.error) throw result.error;
  return result;
}
function success(result, label) {
  if (result.status !== 0)
    throw new Error(`${label} failed: ${(result.stderr || result.stdout).slice(-7000)}`);
  return result.stdout;
}
function sql(database, statement) {
  return success(
    run(
      "docker",
      [
        "exec",
        "-i",
        "-e",
        `MYSQL_PWD=${password}`,
        name,
        "mysql",
        "-uroot",
        "--batch",
        "--skip-column-names",
        "--default-character-set=utf8mb4",
        ...(database ? [database] : [])
      ],
      { input: statement }
    ),
    "isolated MySQL query"
  ).trim();
}
function cli(database, arguments_) {
  if (javaRuntime === "docker") {
    const actual = [...arguments_];
    const manifestIndex = actual.indexOf("--backup-manifest");
    if (manifestIndex !== -1) {
      const relative = path.relative(work, actual[manifestIndex + 1]);
      assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative));
      success(
        run("docker", ["exec", javaContainer, "mkdir", "-p", "/verification-backups"]),
        "runtime backup directory"
      );
      success(
        run("docker", ["cp", `${work}${path.sep}.`, `${javaContainer}:/verification-backups/`]),
        "runtime verified backup fixture copy"
      );
      actual[manifestIndex + 1] = `/verification-backups/${relative.split(path.sep).join("/")}`;
    }
    return run("docker", [
      "exec",
      "-e",
      `SPRING_DATASOURCE_URL=jdbc:mysql://${name}:3306/${database}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true`,
      javaContainer,
      "java",
      "-Dloader.main=com.cargoplanner.backend.database.DatabaseMigrationCli",
      "-cp",
      "/verification.jar",
      "org.springframework.boot.loader.launch.PropertiesLauncher",
      ...actual
    ]);
  }
  return run(
    "java",
    [
      "-Dloader.main=com.cargoplanner.backend.database.DatabaseMigrationCli",
      "-cp",
      jar,
      "org.springframework.boot.loader.launch.PropertiesLauncher",
      ...arguments_
    ],
    {
      env: {
        ...process.env,
        SPRING_DATASOURCE_URL: `jdbc:mysql://127.0.0.1:${port}/${database}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true`,
        SPRING_DATASOURCE_USERNAME: "root",
        SPRING_DATASOURCE_PASSWORD: password
      }
    }
  );
}
function inspect(database) {
  const result = JSON.parse(success(cli(database, ["--inspect"]), "schema inspection"));
  writeFileSync(path.join(work, `schema-${database}.json`), JSON.stringify(result, null, 2) + "\n");
  return result;
}
function check(label, test) {
  test();
  checks.push({ label, passed: true });
  console.log(`PASS ${label}`);
}
function backupFixture(database) {
  const directory = path.join(work, database);
  mkdirSync(directory);
  // Synthetic fixtures exercise checksum gating; real legacy input is backed up using mysqldump.
  const dump = success(
    run("docker", [
      "exec",
      "-e",
      `MYSQL_PWD=${password}`,
      name,
      "mysqldump",
      "-uroot",
      "--single-transaction",
      "--routines",
      "--triggers",
      database
    ]),
    "isolated pre-migration backup"
  );
  const files = {
    "db.sql": dump,
    "secrets.tgz": "synthetic isolated migration fixture; no production keys",
    "workspace-files.tgz": "synthetic isolated migration fixture; no production files"
  };
  for (const [filename, contents] of Object.entries(files))
    writeFileSync(path.join(directory, filename), contents);
  const manifest = path.join(directory, "checksums.sha256");
  writeFileSync(
    manifest,
    Object.entries(files)
      .map(([filename, contents]) => `${digest(contents)}  ${filename}`)
      .join("\n") + "\n"
  );
  return manifest;
}

async function bootApplicationTwice(database) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const logPath = path.join(work, `application-start-${attempt}.log`);
    let output = "";
    const common = {
      SERVER_PORT: "0",
      SERVER_ADDRESS: "127.0.0.1",
      SPRING_FLYWAY_ENABLED: "true",
      APP_BOOTSTRAP_ADMIN_ENABLED: "false",
      APP_TRACKING_AUTO_REFRESH_ENABLED: "false",
      APP_TRACKING_SUPPLEMENTAL_RETRY_ENABLED: "false",
      SPRING_AI_CHAT_MODEL: "none",
      SPRING_AI_OPENAI_API_KEY: "",
      SPRING_DATASOURCE_USERNAME: "root",
      SPRING_DATASOURCE_PASSWORD: password
    };
    let child;
    if (javaRuntime === "docker") {
      const environment = {
        ...common,
        SPRING_DATASOURCE_URL: `jdbc:mysql://${name}:3306/${database}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true`,
        APP_WORKSPACE_FILE_ROOT: "/tmp/verification-workspace-files",
        APP_SHIPMENT_FILE_ROOT: "/tmp/verification-shipment-files",
        APP_ANNOUNCEMENT_IMAGE_ROOT: "/tmp/verification-announcement-images",
        APP_TRACKING_SECRET_KEY_FILE: "/tmp/verification-secrets/tracking.key"
      };
      child = spawn(
        "docker",
        [
          "exec",
          ...Object.entries(environment).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
          javaContainer,
          "sh",
          "-c",
          "echo $$ > /tmp/verification-application.pid; exec java -jar /verification.jar"
        ],
        { cwd: root, windowsHide: true }
      );
    } else {
      child = spawn("java", ["-jar", jar], {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          ...common,
          SPRING_DATASOURCE_URL: `jdbc:mysql://127.0.0.1:${port}/${database}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true`,
          APP_WORKSPACE_FILE_ROOT: path.join(work, "workspace-files"),
          APP_SHIPMENT_FILE_ROOT: path.join(work, "shipment-files"),
          APP_ANNOUNCEMENT_IMAGE_ROOT: path.join(work, "announcement-images"),
          APP_TRACKING_SECRET_KEY_FILE: path.join(work, "secrets/tracking.key")
        }
      });
    }
    let startError;
    child.on("error", (error) => {
      startError = error;
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        output += chunk.toString();
        appendFileSync(logPath, chunk);
      });
    try {
      const deadline = Date.now() + 120000;
      while (
        !/Started CargoPlannerBackendApplication|Started CargoPlannerApplication|Started BackendApplication/.test(
          output
        )
      ) {
        if (startError) throw startError;
        if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline)
          throw new Error(`Application startup ${attempt} failed: ${output.slice(-5000)}`);
        // Spring's default startup log includes the actual application class; accept its normal generic form too.
        if (/Started [A-Za-z0-9_$]+ in [\d.]+ seconds/.test(output)) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      checks.push({
        label: `real application startup ${attempt} on migrated legacy database`,
        passed: true
      });
      console.log(`PASS real application startup ${attempt} on migrated legacy database`);
    } finally {
      if (javaRuntime === "docker") {
        run("docker", [
          "exec",
          javaContainer,
          "sh",
          "-c",
          'test ! -f /tmp/verification-application.pid || kill -TERM "$(cat /tmp/verification-application.pid)"'
        ]);
      } else child.kill("SIGTERM");
      const exitDeadline = Date.now() + 10000;
      while (child.exitCode === null && child.signalCode === null && Date.now() < exitDeadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }
}

try {
  success(run("docker", ["info", "--format", "{{.ServerVersion}}"]), "Docker Engine");
  if (javaRuntime === "docker") {
    success(
      run("docker", [
        "network",
        "create",
        "--internal",
        "--label",
        "cargo.migration-test=true",
        javaNetwork
      ]),
      "isolated migration network"
    );
    networkCreated = true;
  }
  success(
    run("docker", [
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      "cargo.migration-test=true",
      ...(javaRuntime === "docker" ? ["--network", javaNetwork] : []),
      ...(javaRuntime === "host" ? ["--publish", "127.0.0.1::3306"] : []),
      "--env",
      `MYSQL_ROOT_PASSWORD=${password}`,
      "--env",
      "MYSQL_ROOT_HOST=%",
      "mysql:8.4",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci"
    ]),
    "isolated MySQL container creation"
  );
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    const probe = run("docker", [
      "exec",
      "-e",
      `MYSQL_PWD=${password}`,
      name,
      "mysql",
      "-uroot",
      "--protocol=TCP",
      "-h127.0.0.1",
      "--execute=SELECT 1"
    ]);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "isolated MySQL did not become healthy");
  if (javaRuntime === "host") {
    port = Number(
      success(run("docker", ["port", name, "3306/tcp"]), "isolated port lookup")
        .trim()
        .split(":")
        .at(-1)
    );
    assert.ok(Number.isInteger(port) && port > 0);
  }
  if (javaRuntime === "docker") {
    success(
      run("docker", [
        "run",
        "--detach",
        "--name",
        javaContainer,
        "--network",
        javaNetwork,
        "--label",
        "cargo.migration-test=true",
        "--env",
        "SPRING_DATASOURCE_USERNAME=root",
        "--env",
        `SPRING_DATASOURCE_PASSWORD=${password}`,
        "--entrypoint",
        "sh",
        options["--java-image"] ?? "eclipse-temurin:17-jre",
        "-c",
        "while :; do sleep 3600; done"
      ]),
      "isolated Java migration runtime"
    );
    javaCreated = true;
    success(
      run("docker", ["cp", jar, `${javaContainer}:/verification.jar`]),
      "current migration artifact copy"
    );
  }
  sql(
    null,
    "CREATE DATABASE migration_fresh; CREATE DATABASE migration_legacy; CREATE DATABASE migration_unknown;"
  );
  check("empty database migrates using Flyway only", () =>
    success(cli("migration_fresh", ["--migrate"]), "fresh migration")
  );
  const fresh = inspect("migration_fresh");
  check("Java V3 has a persisted non-null checksum", () =>
    assert.equal(
      sql(
        "migration_fresh",
        "SELECT COUNT(*) FROM flyway_schema_history WHERE version='3' AND checksum IS NOT NULL AND success=1"
      ),
      "1"
    )
  );
  const baseline = readFileSync(
    path.join(root, "backend/src/main/resources/db/migration/V1__baseline.sql"),
    "utf8"
  );
  sql(
    "migration_legacy",
    baseline +
      "\n" +
      readFileSync(
        path.join(root, "backend/src/test/resources/fixtures/legacy-migration-data.sql"),
        "utf8"
      )
  );
  const before = inspect("migration_legacy");
  check("unversioned non-empty database is rejected without implicit baseline", () =>
    assert.notEqual(cli("migration_legacy", ["--migrate"]).status, 0)
  );
  check("baseline rejection does not create history", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='flyway_schema_history'"
      ),
      "0"
    )
  );
  const legacyBackup = backupFixture("migration_legacy");
  check("changed schema fingerprint cannot be adopted", () =>
    assert.notEqual(
      cli("migration_legacy", [
        "--adopt-legacy",
        "--expected-fingerprint",
        "0".repeat(64),
        "--backup-manifest",
        legacyBackup
      ]).status,
      0
    )
  );
  writeFileSync(path.join(path.dirname(legacyBackup), "secrets.tgz"), "tampered fixture");
  check("tampered backup cannot be adopted", () =>
    assert.notEqual(
      cli("migration_legacy", [
        "--adopt-legacy",
        "--expected-fingerprint",
        before.fingerprint,
        "--backup-manifest",
        legacyBackup
      ]).status,
      0
    )
  );
  // Recreate a separate verified fixture after proving the negative guard.
  writeFileSync(
    path.join(path.dirname(legacyBackup), "secrets.tgz"),
    "synthetic isolated migration fixture; no production keys"
  );
  check("reviewed legacy database can be explicitly adopted", () =>
    success(
      cli("migration_legacy", [
        "--adopt-legacy",
        "--expected-fingerprint",
        before.fingerprint,
        "--backup-manifest",
        legacyBackup
      ]),
      "reviewed baseline"
    )
  );
  check("known legacy data upgrades to current schema", () =>
    success(cli("migration_legacy", ["--migrate"]), "legacy migration")
  );
  check("fresh and legacy migration paths produce equivalent columns/indexes/constraints", () =>
    assertSchemaEquivalent(inspect("migration_legacy").schema, fresh.schema)
  );
  check("legacy employee role is converted without losing accounts", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT CONCAT(COUNT(*),':',MAX(CASE WHEN id=2 THEN role END)) FROM cp_users"
      ),
      "2:OVERSEA_AGENT"
    )
  );
  check("snapshot owner and business fields are backfilled", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT CONCAT(t.queried_by,':',s.job_number,':',s.client_po_number) FROM cp_shipments s JOIN cp_tracking_snapshots t ON t.id=s.current_snapshot_id WHERE s.id=100"
      ),
      "1:SYNTH-JOB:SYNTH-PO"
    )
  );
  check("legacy customer roles and delegated shipment access are migrated", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT CONCAT(c.party_role,':',(SELECT COUNT(*) FROM cp_oversea_agent_shipment_scopes WHERE shipment_id=100 AND represented_customer_id=10 AND oversea_agent_customer_id=20)) FROM cp_customers c WHERE id=20"
      ),
      "OVERSEA_AGENT:1"
    )
  );
  check("old scoped agent sessions are revoked", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT COUNT(*) FROM cp_customer_sessions WHERE customer_id=20 AND revoked_at IS NOT NULL"
      ),
      "1"
    )
  );
  check("shipper sessions retain their own customer scope", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT scope_customer_id FROM cp_customer_sessions WHERE customer_id=10"
      ),
      "10"
    )
  );
  check("file visibility roles are backfilled", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT visibility_role FROM cp_shipment_file_visibility_roles WHERE shipment_file_id=10000"
      ),
      "SHIPPER"
    )
  );
  check("invalid discovered references are removed and valid references retained", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT CONCAT(COUNT(*),':',MAX(reference_no_normalized)) FROM cp_shipment_references"
      ),
      "1:SYNTHETICBL"
    )
  );
  const historyBefore = sql("migration_legacy", "SELECT COUNT(*) FROM flyway_schema_history");
  sql(
    "migration_legacy",
    "DELETE FROM cp_oversea_agent_shipment_scopes; DELETE FROM cp_shipment_file_visibility_roles;"
  );
  check("second migrate validates and applies no migration", () =>
    success(cli("migration_legacy", ["--migrate"]), "repeat migration")
  );
  await bootApplicationTwice("migration_legacy");
  check("repeated execution does not rerun legacy permission backfills", () =>
    assert.equal(
      sql(
        "migration_legacy",
        "SELECT (SELECT COUNT(*) FROM cp_oversea_agent_shipment_scopes)+(SELECT COUNT(*) FROM cp_shipment_file_visibility_roles)"
      ),
      "0"
    )
  );
  check("repeated execution leaves structure and history unchanged", () => {
    assertSchemaEquivalent(inspect("migration_legacy").schema, fresh.schema);
    assert.equal(
      sql("migration_legacy", "SELECT COUNT(*) FROM flyway_schema_history"),
      historyBefore
    );
  });
  sql("migration_unknown", "CREATE TABLE unrelated_application(id BIGINT PRIMARY KEY)");
  check("unrecognized database cannot be adopted even with its exact fingerprint", () =>
    assert.notEqual(
      cli("migration_unknown", [
        "--adopt-legacy",
        "--expected-fingerprint",
        inspect("migration_unknown").fingerprint,
        "--backup-manifest",
        legacyBackup
      ]).status,
      0
    )
  );
  if (legacyPath) {
    sql(null, "CREATE DATABASE migration_supplied;");
    sql("migration_supplied", readFileSync(legacyPath, "utf8"));
    const countsBefore = sql(
      "migration_supplied",
      "SELECT CONCAT((SELECT COUNT(*) FROM cp_customers),':',(SELECT COUNT(*) FROM cp_shipments))"
    );
    const supplied = inspect("migration_supplied");
    const suppliedManifest = backupFixture("migration_supplied");
    success(
      cli("migration_supplied", [
        "--adopt-legacy",
        "--expected-fingerprint",
        supplied.fingerprint,
        "--backup-manifest",
        suppliedManifest
      ]),
      "supplied legacy adoption"
    );
    check("supplied historical SQL upgrades on an isolated copy", () =>
      success(cli("migration_supplied", ["--migrate"]), "supplied historical upgrade")
    );
    check("supplied legacy customer/shipment counts remain intact", () =>
      assert.equal(
        sql(
          "migration_supplied",
          "SELECT CONCAT((SELECT COUNT(*) FROM cp_customers),':',(SELECT COUNT(*) FROM cp_shipments))"
        ),
        countsBefore
      )
    );
    check("supplied legacy schema equals clean migrated schema", () =>
      assertSchemaEquivalent(inspect("migration_supplied").schema, fresh.schema)
    );
    check("supplied SQL file is unchanged", () =>
      assert.equal(digest(readFileSync(legacyPath)), originalHash)
    );
  }
  checks.push({ label: "all migration checks completed", passed: true });
} catch (error) {
  checks.push({ label: "migration verification", passed: false, error: error.message });
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (javaCreated) {
    const label = run("docker", [
      "inspect",
      "--format",
      '{{index .Config.Labels "cargo.migration-test"}}',
      javaContainer
    ]);
    const owned =
      javaContainer.startsWith("cargo-migration-test-") &&
      label.status === 0 &&
      label.stdout.trim() === "true";
    const removed = owned && run("docker", ["rm", "--force", javaContainer]).status === 0;
    checks.push({ label: "owned Java verification runtime removed", passed: removed });
    if (!removed) process.exitCode = 1;
  }
  if (created) {
    assert.ok(name.startsWith("cargo-migration-test-"));
    const label = run("docker", [
      "inspect",
      "--format",
      '{{index .Config.Labels "cargo.migration-test"}}',
      name
    ]);
    if (label.status === 0 && label.stdout.trim() === "true") {
      const removed = run("docker", ["rm", "--force", "--volumes", name]);
      checks.push({
        label: "only owned test container and its anonymous volume removed",
        passed: removed.status === 0
      });
      if (removed.status !== 0) process.exitCode = 1;
    } else {
      checks.push({ label: "cleanup ownership verification", passed: false });
      process.exitCode = 1;
    }
  }
  if (networkCreated) {
    const label = run("docker", [
      "network",
      "inspect",
      "--format",
      '{{index .Labels "cargo.migration-test"}}',
      javaNetwork
    ]);
    const owned =
      javaNetwork.startsWith("cargo-migration-test-") &&
      label.status === 0 &&
      label.stdout.trim() === "true";
    const removed = owned && run("docker", ["network", "rm", javaNetwork]).status === 0;
    checks.push({ label: "owned isolated verification network removed", passed: removed });
    if (!removed) process.exitCode = 1;
  }
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        jarSha256: digest(readFileSync(jar)),
        suppliedSqlSha256: originalHash,
        checks
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Migration report: ${reportPath}`);
}
