#!/usr/bin/env node
/** Disposable real Java/MySQL integration environment; --serve also starts the real Vite UI. */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  copyFileSync
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2),
  serve = args.includes("--serve");
const value = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--serve") continue;
  assert.ok(
    ["--jar", "--before-jar", "--work"].includes(args[i]) && args[i + 1],
    "Unknown E2E argument"
  );
  i++;
}
const sourceJar = resolve(root, value("--jar", "backend/target/cargo-planner-backend-0.1.0.jar"));
const beforeJar = value("--before-jar", null);
assert.ok(existsSync(sourceJar), "Package the current backend first");
const name = `cargo-platform-e2e-${Date.now()}-${randomBytes(3).toString("hex")}`;
const work = resolve(root, value("--work", `.tmp/${name}`));
mkdirSync(work, { recursive: true });
const jar = join(work, "backend-under-test.jar");
copyFileSync(sourceJar, jar);
const jarSha256 = createHash("sha256").update(readFileSync(jar)).digest("hex");
const dbPassword = randomBytes(24).toString("hex"),
  password = "PlatformE2e#2026",
  owner = randomBytes(12).toString("hex");
let created = false,
  backend,
  vite,
  dbPort,
  base;
const checks = [];
const report = () =>
  writeFileSync(
    join(work, "report.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        jarSha256,
        previousBinaryUsed: Boolean(beforeJar),
        mockedApi: false,
        checks
      },
      null,
      2
    ) + "\n"
  );
function run(command, parameters, extra = {}) {
  const r = spawnSync(command, parameters, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
    ...extra
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(`${command} failed: ${(r.stderr || r.stdout).slice(-1800)}`);
  return r.stdout.trim();
}
function sql(statement) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      `MYSQL_PWD=${dbPassword}`,
      name,
      "mysql",
      "-uroot",
      "--batch",
      "--skip-column-names",
      "--default-character-set=utf8mb4",
      "platform_e2e"
    ],
    { input: statement }
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(5000)]);
  assert.ok(
    child.exitCode !== null || child.signalCode !== null,
    "Owned child process did not exit"
  );
}
async function boot(binary, target) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const log = join(work, target ? "backend-before.log" : "backend-current.log");
  const child = spawn("java", ["-jar", binary], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      SERVER_ADDRESS: "127.0.0.1",
      SERVER_PORT: String(port),
      SPRING_DATASOURCE_URL: `jdbc:mysql://127.0.0.1:${dbPort}/platform_e2e?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true`,
      SPRING_DATASOURCE_USERNAME: "root",
      SPRING_DATASOURCE_PASSWORD: dbPassword,
      APP_BOOTSTRAP_ADMIN_ENABLED: "true",
      APP_BOOTSTRAP_ADMIN_USERNAME: "e2e-admin",
      APP_BOOTSTRAP_ADMIN_PASSWORD: password,
      APP_BOOTSTRAP_ADMIN_DISPLAY_NAME: "E2E Administrator",
      APP_TRACKING_AUTO_REFRESH_ENABLED: "false",
      APP_TRACKING_SUPPLEMENTAL_RETRY_ENABLED: "false",
      SPRING_AI_CHAT_MODEL: "none",
      SPRING_AI_OPENAI_API_KEY: "",
      APP_WORKSPACE_FILE_ROOT: join(work, "workspace"),
      APP_SHIPMENT_FILE_ROOT: join(work, "shipments"),
      APP_ANNOUNCEMENT_IMAGE_ROOT: join(work, "announcements"),
      SPRING_SERVLET_MULTIPART_LOCATION: join(work, "multipart"),
      ...(target ? { SPRING_FLYWAY_TARGET: target } : { SPRING_FLYWAY_TARGET: "latest" })
    }
  });
  child.stdout.on("data", (data) => appendFileSync(log, data));
  child.stderr.on("data", (data) => appendFileSync(log, data));
  backend = child;
  for (let i = 0; i < 900; i++) {
    assert.equal(child.exitCode, null, `Backend exited; inspect ${log}`);
    try {
      if ((await fetch(`${base}/actuator/health`, { signal: AbortSignal.timeout(1000) })).ok)
        return;
    } catch {
      /* boot */
    }
    await sleep(100);
  }
  throw Error(`Backend readiness timeout; inspect ${log}`);
}
async function api(path, { token, customerToken, method = "GET", body, status = 200 } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Auth-Token": token } : {}),
      ...(customerToken ? { "X-Customer-Token": customerToken } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}
const login = async (username) =>
  (
    await api("/auth/login", {
      method: "POST",
      body: { username, password, deviceId: `e2e-${username}`, deviceName: "Disposable E2E" }
    })
  ).token;
function passed(label) {
  checks.push({ label, passed: true });
  console.log(`PASS ${label}`);
  report();
}
try {
  run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  run("docker", [
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    `cargo.platform-e2e=${owner}`,
    "--publish",
    "127.0.0.1::3306",
    "--env",
    `MYSQL_ROOT_PASSWORD=${dbPassword}`,
    "--env",
    "MYSQL_ROOT_HOST=%",
    "--env",
    "MYSQL_DATABASE=platform_e2e",
    "mysql:8.4",
    "--character-set-server=utf8mb4",
    "--collation-server=utf8mb4_0900_ai_ci"
  ]);
  created = true;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      sql("SELECT 1");
      ready = true;
      break;
    } catch {
      await sleep(1000);
    }
  }
  assert.ok(ready, "MySQL readiness timeout");
  dbPort = Number(run("docker", ["port", name, "3306/tcp"]).split(":").at(-1));
  // Target 4 verifies the real previous schema. An optional previous JAR additionally exercises the old API binary.
  await boot(beforeJar ? resolve(root, beforeJar) : jar, "4");
  assert.equal(
    sql(
      "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='cp_customers' AND column_name='contact_email'"
    ),
    "0"
  );
  if (beforeJar) {
    const token = await login("e2e-admin");
    await api("/business/customers", {
      token,
      method: "POST",
      body: {
        username: "pre-v5-client",
        password,
        displayName: "Pre V5 Customer",
        partyRole: "SHIPPER",
        clientCode: "PREV5001",
        remark: "Preserve legacy record"
      }
    });
  } else {
    // Synthetic historical row: intentionally contains no new email field and is never used for login.
    sql(
      "INSERT INTO cp_customers (public_id, username, display_name, party_role, password_salt, password_hash, password_iterations, customer_code_hash, customer_code_prefix, customer_code_mode, provisioning_source, status, remark, created_by, responsible_agent_id) SELECT UUID(), 'pre-v5-client', 'Pre V5 Customer', 'SHIPPER', 'fixture', 'fixture', 120000, 'legacy-test-only', 'PREV', 'RANDOM', 'MANUAL', 'ACTIVE', 'Preserve legacy record', id, id FROM cp_users WHERE username='e2e-admin'"
    );
  }
  const oldRow = sql(
    "SELECT public_id, username, remark FROM cp_customers WHERE username='pre-v5-client'"
  );
  await stop(backend);
  backend = null;
  await boot(jar);
  assert.equal(
    sql("SELECT public_id, username, remark FROM cp_customers WHERE username='pre-v5-client'"),
    oldRow
  );
  assert.equal(
    sql(
      "SELECT IF(contact_email IS NULL, 'NULL', 'unexpected') FROM cp_customers WHERE username='pre-v5-client'"
    ),
    "NULL"
  );
  assert.equal(
    sql("SELECT COUNT(*) FROM flyway_schema_history WHERE version='5' AND success=1"),
    "1"
  );
  passed("V4 to V5 preserves existing customer identity and remark; email is nullable");
  await api("/business/customers", { status: 401 });
  const admin = await login("e2e-admin");
  await api("/admin/employees", {
    token: admin,
    method: "POST",
    body: { username: "e2e-owner", displayName: "E2E Operator", password, role: "BUSINESS" }
  });
  await api("/admin/employees", {
    token: admin,
    method: "POST",
    body: { username: "e2e-other", displayName: "Second Operator", password, role: "BUSINESS" },
    status: 409
  });
  passed("existing single-business-account policy remains enforced");
  const token = await login("e2e-owner");
  const create = (username, clientCode, actor = token) =>
    api("/business/customers", {
      token: actor,
      method: "POST",
      body: {
        username,
        password,
        displayName: username === "customer-a" ? "E2E Customer A" : "E2E Customer B",
        partyRole: "SHIPPER",
        clientCode,
        remark: "Initial remark",
        contactEmail: `${username}@example.com`
      }
    });
  const a = await create("customer-a", "E2EAAA01"),
    b = await create("customer-b", "E2EBBB01", admin);
  assert.ok(a.id && a.customerCode);
  assert.equal(a.contactEmail, "customer-a@example.com");
  for (const key of ["password", "passwordSalt", "passwordHash", "customerCodeHash"])
    assert.equal(Object.hasOwn(a, key), false);
  passed("real login and controlled customer create return an explicit credential-safe profile");
  await api(`/business/customers/${b.id}`, { token, status: 404 });
  await api(`/business/customers/${b.id}`, {
    token,
    method: "PATCH",
    body: { contactEmail: "steal@example.com" },
    status: 404
  });
  assert.deepEqual(
    (await api("/business/customers", { token })).items.map((item) => item.id),
    [a.id]
  );
  passed("business user cannot list, read or modify another user's customer");
  await api(`/business/customers/${a.id}`, {
    token,
    method: "PATCH",
    body: { displayName: "Edited customer A", contactEmail: "invalid" },
    status: 400
  });
  assert.equal((await api(`/business/customers/${a.id}`, { token })).displayName, "E2E Customer A");
  await api(`/business/customers/${a.id}`, {
    token,
    method: "PATCH",
    body: { displayName: "Edited customer A", contactEmail: "edited@example.com" }
  });
  await api(`/business/customers/${a.id}`, {
    token,
    method: "PATCH",
    body: { remark: "Updated remark" }
  });
  assert.equal(
    (await api(`/business/customers/${a.id}`, { token })).contactEmail,
    "edited@example.com"
  );
  await api(`/business/customers/${a.id}`, {
    token,
    method: "PATCH",
    body: { contactEmail: "", remark: "" }
  });
  assert.equal(
    sql(
      "SELECT IF(contact_email IS NULL AND remark IS NULL, 'cleared', 'bad') FROM cp_customers WHERE username='customer-a'"
    ),
    "cleared"
  );
  passed(
    "invalid profile is rejected atomically; omission preserves and empty text clears in MySQL"
  );
  await api("/business/customers", {
    token,
    method: "POST",
    body: { username: "customer-a", password },
    status: 409
  });
  assert.equal(sql("SELECT COUNT(*) FROM cp_customers WHERE username='customer-a'"), "1");
  passed("duplicate customer is a conflict and creates no extra database row");
  const shipment = async (customer, referenceNo, actor = token) =>
    api("/business/customers/shipments", {
      token: actor,
      method: "POST",
      body: {
        customerId: customer.id,
        publishToCustomer: true,
        shipment: {
          carrier: "COSCO",
          referenceType: "BOOKING",
          referenceNo,
          trackingStatus: "IN_TRANSIT",
          portOfLoading: "Shanghai",
          portOfDischarge: "Los Angeles",
          currentLocation: "Pacific Ocean"
        }
      }
    });
  const sa = await shipment(a, "E2EBOOKINGA001"),
    sb = await shipment(b, "E2EBOOKINGB001", admin);
  const customerLogin = (username) =>
    api("/public/customers/login", {
      method: "POST",
      body: {
        username,
        password,
        customerCode: username === "customer-a" ? "E2EAAA01" : "E2EBBB01"
      }
    });
  const ca = await customerLogin("customer-a"),
    cb = await customerLogin("customer-b");
  const own = await api("/customer/shipments?page=1&pageSize=20", { customerToken: ca.token });
  assert.equal(own.items.length, 1);
  assert.ok(JSON.stringify(own).includes("E2EBOOKINGA001"));
  assert.ok(!JSON.stringify(own).includes("E2EBOOKINGB001"));
  await api(`/customer/shipments/${sb.shipmentId}`, { customerToken: ca.token, status: 404 });
  await api("/business/customers", { token: ca.token, status: 401 });
  await api("/customer/shipments?page=1&pageSize=20", { customerToken: token, status: 401 });
  passed(
    "customer sees only own published shipment and cannot use employee credentials or foreign shipment IDs"
  );
  const beforeRestart = sql("SELECT COUNT(*) FROM flyway_schema_history");
  await stop(backend);
  backend = null;
  await boot(jar);
  assert.equal(sql("SELECT COUNT(*) FROM flyway_schema_history"), beforeRestart);
  assert.equal(
    (await api(`/business/customers/${a.id}`, { token })).displayName,
    "Edited customer A"
  );
  assert.equal(
    (await api("/customer/shipments?page=1&pageSize=20", { customerToken: cb.token })).items.length,
    1
  );
  passed(
    "application restart preserves profiles and customer sessions without reapplying migration"
  );
  if (serve) {
    const uiPort = await freePort();
    vite = spawn(
      process.execPath,
      [
        resolve(root, "frontend/node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        String(uiPort),
        "--strictPort"
      ],
      {
        cwd: resolve(root, "frontend"),
        windowsHide: true,
        env: {
          ...process.env,
          VITE_BACKEND_DEV_TARGET: base,
          VITE_CACHE_DIR: join(work, "vite-cache")
        }
      }
    );
    vite.stdout.on("data", (data) => appendFileSync(join(work, "vite.log"), data));
    vite.stderr.on("data", (data) => appendFileSync(join(work, "vite.log"), data));
    for (let i = 0; i < 300; i++) {
      assert.equal(vite.exitCode, null, "Vite exited");
      try {
        if ((await fetch(`http://127.0.0.1:${uiPort}`)).ok) break;
      } catch {
        /* boot */
      }
      await sleep(100);
    }
    writeFileSync(
      join(work, "browser-environment.json"),
      JSON.stringify(
        {
          ui: `http://127.0.0.1:${uiPort}`,
          backend: base,
          adminUsername: "e2e-admin",
          businessUsername: "e2e-owner",
          customerUsername: "customer-a",
          customerCode: "E2EAAA01",
          password,
          customerId: a.id,
          shipmentId: sa.shipmentId,
          ownedContainer: name
        },
        null,
        2
      )
    );
    console.log(
      `READY: ${join(work, "browser-environment.json")}; create ${join(work, "stop")} to clean up`
    );
    while (!existsSync(join(work, "stop"))) await sleep(300);
  }
} catch (error) {
  checks.push({ label: "real platform E2E", passed: false, error: error.message });
  process.exitCode = 1;
  console.error(error.message);
} finally {
  try {
    await stop(vite);
    await stop(backend);
    if (created) {
      const actual = run("docker", [
        "inspect",
        "--format",
        '{{index .Config.Labels "cargo.platform-e2e"}}',
        name
      ]);
      assert.ok(
        name.startsWith("cargo-platform-e2e-") && actual === owner,
        "Refusing cleanup of unowned container"
      );
      run("docker", ["rm", "--force", "--volumes", name]);
      passed("only owned test processes, MySQL container and anonymous volumes removed");
    }
  } catch (error) {
    checks.push({ label: "owned cleanup", passed: false, error: error.message });
    process.exitCode = 1;
  }
  report();
}
