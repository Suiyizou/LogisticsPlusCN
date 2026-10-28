import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const work = path.join(root, ".tmp", "dev-preview");
const envFile = path.join(work, "preview.env");
const backup = path.join(work, "backup");
const composeArgs = [
  "compose",
  "--project-name",
  "cargo-ui-preview",
  "--env-file",
  envFile,
  "-f",
  path.join(root, "docker-compose.yml"),
  "-f",
  path.join(root, "docker-compose.dev-preview.yml")
];
const action = process.argv[2] || "status";
const sqlPath = path.resolve(
  process.argv.find((arg) => arg.startsWith("--sql="))?.slice(6) ||
    "C:/Users/ASUS/Desktop/cargo_planner.sql"
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
async function exists(file) {
  return stat(file).then(
    () => true,
    () => false
  );
}
async function run(args, { capture = false, log } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
      if (!capture) process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
      output += data;
      if (!capture) process.stderr.write(data);
    });
    child.on("error", reject);
    child.on("close", async (code) => {
      if (log) await writeFile(path.join(work, log), output);
      if (code !== 0)
        reject(
          new Error(
            `Docker operation failed (${code}); inspect the preview logs. ${capture ? output.slice(-1500) : ""}`
          )
        );
      else resolve(output);
    });
  });
}
const compose = (args, options) => run([...composeArgs, ...args], options);
const mysql = (query) =>
  run(
    [
      "exec",
      "cargo-ui-preview-mysql",
      "sh",
      "-c",
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --skip-column-names cargo_preview -e "$1"',
      "preview-query",
      query
    ],
    { capture: true }
  );
async function waitHealthy(service, seconds = 150) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const state = await run(
      [
        "inspect",
        "--format",
        "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
        `cargo-ui-preview-${service}`
      ],
      { capture: true }
    );
    if (state.trim() === "running|healthy") return;
    if (/exited|dead/.test(state))
      throw new Error(`${service} stopped; inspect docker compose logs.`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${service} did not become healthy within ${seconds}s.`);
}
async function cli(args, log) {
  return compose(
    [
      "run",
      "--rm",
      "--no-deps",
      "--volume",
      `${backup}:/preview-backup:ro`,
      "--entrypoint",
      "java",
      "backend",
      "-Dloader.main=com.cargoplanner.backend.database.DatabaseMigrationCli",
      "-cp",
      "/app/app.jar",
      "org.springframework.boot.loader.launch.PropertiesLauncher",
      ...args
    ],
    { capture: true, log }
  );
}
async function status() {
  let available = true;
  await compose(["ps", "--all"]);
  for (const [name, url] of [
    ["frontend", "http://127.0.0.1:18088/"],
    ["backend", "http://127.0.0.1:18089/actuator/health"],
    ["tracking", "http://127.0.0.1:18088/tracking/api/health"]
  ]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      console.log(`${name}: HTTP ${response.status} ${url}`);
      if (!response.ok) available = false;
    } catch {
      console.log(`${name}: unavailable ${url}`);
      available = false;
    }
  }
  console.log(
    "Preview counts (no credentials or row contents):\n" +
      (await mysql(
        "SELECT 'users',COUNT(*) FROM cp_users UNION ALL SELECT 'customers',COUNT(*) FROM cp_customers UNION ALL SELECT 'shipments',COUNT(*) FROM cp_shipments UNION ALL SELECT 'snapshots',COUNT(*) FROM cp_tracking_snapshots UNION ALL SELECT 'refresh_jobs',COUNT(*) FROM cp_tracking_refresh_jobs;"
      ))
  );
  if (!available) throw new Error("One or more preview endpoints are unavailable.");
}
async function start() {
  await mkdir(backup, { recursive: true });
  if (!(await exists(envFile)))
    await writeFile(
      envFile,
      `PREVIEW_MYSQL_ROOT_PASSWORD=${randomBytes(30).toString("hex")}\nPREVIEW_MYSQL_PASSWORD=${randomBytes(30).toString("hex")}\nPREVIEW_ADAPTER_KEY=${randomBytes(30).toString("hex")}\n`,
      { mode: 0o600 }
    );
  const dump = await readFile(sqlPath);
  const text = dump.toString("utf8");
  if (
    /^\s*(?:CREATE\s+DATABASE|USE\s+[`\w]+\s*;|CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?EVENT\b)/im.test(
      text
    )
  )
    throw new Error("SQL has database-switching/event directives; review before isolated import.");
  const sourceHash = sha(dump);
  const markerPath = path.join(work, "state.json");
  const marker = (await exists(markerPath)) ? JSON.parse(await readFile(markerPath, "utf8")) : null;
  if (marker && marker.sourceSha256 !== sourceHash)
    throw new Error(
      "This preview was initialized from a different SQL file. No data was overwritten."
    );
  await compose(["up", "--detach", "mysql"]);
  await waitHealthy("mysql");
  const tables = Number(
    (
      await mysql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();")
    ).trim()
  );
  if (tables && !marker)
    throw new Error(
      "Preview schema is nonempty without this script's state marker. Refusing re-import."
    );
  if (!marker) {
    await copyFile(sqlPath, path.join(backup, "db.sql"));
    await run(
      ["cp", path.join(backup, "db.sql"), "cargo-ui-preview-mysql:/tmp/cargo-preview-import.sql"],
      { capture: true }
    );
    await run(
      [
        "exec",
        "cargo-ui-preview-mysql",
        "sh",
        "-c",
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4 cargo_preview < /tmp/cargo-preview-import.sql'
      ],
      { capture: true, log: "import.log" }
    );
    await run(["exec", "cargo-ui-preview-mysql", "rm", "/tmp/cargo-preview-import.sql"], {
      capture: true
    });
    await writeFile(
      markerPath,
      JSON.stringify(
        {
          project: "cargo-ui-preview",
          schema: "cargo_preview",
          sourceSha256: sourceHash,
          importedAt: new Date().toISOString(),
          migrated: false
        },
        null,
        2
      )
    );
    console.log("Imported supplied SQL into the isolated cargo_preview schema.");
  }
  if (!process.argv.includes("--no-build"))
    await compose(["build", "backend", "frontend", "tracking"], { log: "build.log" });
  const history = Number(
    (
      await mysql(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='flyway_schema_history';"
      )
    ).trim()
  );
  if (!history) {
    // These are backups of the NEW empty preview volumes; no original upload/secret files were supplied.
    await compose(
      [
        "run",
        "--rm",
        "--no-deps",
        "--volume",
        `${backup}:/preview-backup`,
        "--entrypoint",
        "sh",
        "backend",
        "-c",
        "tar -czf /preview-backup/secrets.tgz -C /app/secrets . && tar -czf /preview-backup/workspace-files.tgz -C /app/uploads ."
      ],
      { capture: true }
    );
    const artifacts = ["db.sql", "secrets.tgz", "workspace-files.tgz"];
    await writeFile(
      path.join(backup, "checksums.sha256"),
      (
        await Promise.all(
          artifacts.map(async (name) => `${sha(await readFile(path.join(backup, name)))}  ${name}`)
        )
      ).join("\n") + "\n"
    );
    const inspected = await cli(["--inspect"], "schema-before.log");
    const fingerprint = /"fingerprint"\s*:\s*"([0-9a-f]{64})"/.exec(inspected)?.[1];
    if (!fingerprint) throw new Error("Migration inspection did not return a schema fingerprint.");
    await cli(
      [
        "--adopt-legacy",
        "--expected-fingerprint",
        fingerprint,
        "--backup-manifest",
        "/preview-backup/checksums.sha256"
      ],
      "adopt.log"
    );
  }
  await cli(["--migrate"], "migrate.log");
  await cli(["--validate"], "validate.log");
  const updated = JSON.parse(await readFile(markerPath, "utf8"));
  updated.migrated = true;
  await writeFile(markerPath, JSON.stringify(updated, null, 2));
  await compose(["up", "--detach", "tracking", "backend", "frontend", "gateway"]);
  await waitHealthy("tracking");
  await waitHealthy("backend", 200);
  await status();
}
try {
  if (action === "start") await start();
  else if (action === "status") {
    if (!(await exists(envFile))) throw new Error("Preview not initialized; run start.");
    await status();
  } else if (action === "stop") await compose(["stop"]);
  else
    throw new Error(
      "Usage: node scripts/dev-preview.mjs start|status|stop [--sql=C:/path/cargo_planner.sql] [--no-build]"
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
