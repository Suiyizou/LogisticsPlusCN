import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const work = path.join(root, ".tmp", "dev-preview");
const accountsPath = path.join(work, "fixture-accounts.json");
const manifestPath = path.join(work, "fixture-manifest.json");
const base = "http://127.0.0.1:18089/api";
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false
  );
function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "",
      err = "";
    child.stdout.on("data", (data) => {
      out += data;
    });
    child.stderr.on("data", (data) => {
      err += data;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`Local preview command failed (${code}): ${err.slice(-600)}`))
    );
  });
}
const docker = (args) => command("docker", args);
const sql = (query) =>
  docker([
    "exec",
    "cargo-ui-preview-mysql",
    "sh",
    "-c",
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --skip-column-names cargo_preview -e "$1"',
    "fixture-sql",
    query
  ]);
const literal = (value) =>
  `CONVERT(0x${Buffer.from(String(value), "utf8").toString("hex")} USING utf8mb4)`;
async function assertIsolated() {
  for (const service of ["mysql", "backend", "gateway"]) {
    const inspected = JSON.parse(await docker(["inspect", `cargo-ui-preview-${service}`]))[0];
    if (
      inspected.Config.Labels["com.docker.compose.project"] !== "cargo-ui-preview" ||
      inspected.Config.Labels["com.docker.compose.service"] !== service ||
      inspected.State.Status !== "running"
    )
      throw new Error("Refusing fixtures: wrong project/service/runtime.");
    if (service === "backend") {
      const env = inspected.Config.Env;
      if (
        !env.some((value) =>
          value.startsWith("SPRING_DATASOURCE_URL=jdbc:mysql://mysql:3306/cargo_preview?")
        )
      )
        throw new Error("Refusing fixtures: wrong backend schema.");
      for (const key of [
        "APP_TRACKING_AUTO_REFRESH_ENABLED",
        "APP_TRACKING_SUPPLEMENTAL_RETRY_ENABLED"
      ])
        if (!env.includes(`${key}=false`)) throw new Error("Refusing fixtures: scheduler enabled.");
    }
    if (service === "gateway") {
      const bindings = inspected.HostConfig.PortBindings;
      for (const [port, host] of [
        ["8080/tcp", "18088"],
        ["8081/tcp", "18089"],
        ["3306/tcp", "13316"]
      ]) {
        if (
          !bindings[port]?.some(
            (binding) => binding.HostIp === "127.0.0.1" && binding.HostPort === host
          )
        )
          throw new Error("Refusing fixtures: wrong preview host/port.");
      }
    } else {
      for (const name of Object.keys(inspected.NetworkSettings.Networks))
        if (!JSON.parse(await docker(["network", "inspect", name]))[0].Internal)
          throw new Error("Refusing fixtures: business container has outbound network.");
    }
  }
  if ((await sql("SELECT DATABASE();")).trim() !== "cargo_preview")
    throw new Error("Refusing fixtures: wrong database.");
  const state = JSON.parse(await readFile(path.join(work, "state.json"), "utf8"));
  if (state.project !== "cargo-ui-preview" || state.schema !== "cargo_preview" || !state.migrated)
    throw new Error("Refusing fixtures: missing verified preview state.");
}
function hashPassword(password) {
  const salt = randomBytes(16);
  return {
    salt: salt.toString("base64"),
    hash: pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("base64"),
    iterations: 120000
  };
}
async function api(
  route,
  { token, customerToken, method = "GET", body, form, binary = false } = {}
) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { "X-Auth-Token": token } : {}),
      ...(customerToken ? { "X-Customer-Token": customerToken } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: form || (body ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(
      `${method} ${route} returned ${response.status}: ${details.message || details.error || "request rejected"}`
    );
  }
  if (binary) return Buffer.from(await response.arrayBuffer());
  return response.json();
}
let accounts, manifest;
async function save() {
  await writeFile(accountsPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
async function initialize() {
  if (await exists(accountsPath)) accounts = JSON.parse(await readFile(accountsPath, "utf8"));
  else {
    const account = (username, displayName, role, extra = {}) => ({
      username,
      displayName,
      role,
      password: `UiPreview1!${randomBytes(12).toString("hex")}`,
      baseUrl: "http://127.0.0.1:18088",
      ...extra
    });
    accounts = {
      project: "cargo-ui-preview",
      schema: "cargo_preview",
      source: "explicit local acceptance fixtures, separate from supplied SQL",
      admin: account("ui-preview-admin", "ui-preview 本地验收管理员", "ADMIN"),
      internalAgent: account(
        "ui-preview-internal-agent",
        "ui-preview 本地内部海外代理",
        "OVERSEA_AGENT"
      ),
      shipper: account("ui-preview-shipper", "ui-preview 本地发货人样本", "CUSTOMER", {
        partyRole: "SHIPPER",
        customerCode: "UIPVSHIP01"
      }),
      legacyAgent: account("ui-preview-legacy-agent", "ui-preview 本地兼容验收样本", "CUSTOMER", {
        partyRole: "OVERSEA_AGENT",
        customerCode: "UIPVAGT01"
      }),
      business: {
        username: "e2e-owner",
        role: "BUSINESS",
        baseUrl: "http://127.0.0.1:51221",
        source: "existing standard E2E fixture; not SQL history",
        credentialsSource: ".tmp/ui-a-real-e2e/browser-environment.json"
      }
    };
  }
  const e2ePath = path.join(root, ".tmp", "ui-a-real-e2e", "browser-environment.json");
  if (await exists(e2ePath)) {
    const e2e = JSON.parse(await readFile(e2ePath, "utf8"));
    if (
      e2e.businessUsername === "e2e-owner" &&
      String(e2e.ui).includes("51221") &&
      typeof e2e.password === "string"
    )
      accounts.business.password = e2e.password;
  }
  manifest = (await exists(manifestPath))
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : {
        project: "cargo-ui-preview",
        schema: "cargo_preview",
        createdAt: new Date().toISOString(),
        accounts: {},
        shipments: {},
        files: {},
        verification: {}
      };
  if (
    accounts.project !== "cargo-ui-preview" ||
    manifest.project !== "cargo-ui-preview" ||
    accounts.schema !== "cargo_preview" ||
    manifest.schema !== "cargo_preview"
  )
    throw new Error("Fixture files target a different environment.");
  for (const key of ["admin", "internalAgent", "shipper", "legacyAgent"])
    if (!accounts[key].username.startsWith("ui-preview-"))
      throw new Error("Invalid fixture username prefix.");
  await save();
}
async function ensureAdmin() {
  const account = accounts.admin;
  let row = (
    await sql(`SELECT id,role FROM cp_users WHERE username=${literal(account.username)};`)
  ).trim();
  if (!row) {
    const hash = hashPassword(account.password);
    // Explicit local-only bootstrap. Original users are never updated.
    await sql(
      `START TRANSACTION; INSERT INTO cp_users(username,display_name,role,party_role,status,password_salt,password_hash,password_iterations) VALUES(${literal(account.username)},${literal(account.displayName)},'ADMIN','AGENT','ACTIVE',${literal(hash.salt)},${literal(hash.hash)},${hash.iterations}); COMMIT;`
    );
    row = (
      await sql(`SELECT id,role FROM cp_users WHERE username=${literal(account.username)};`)
    ).trim();
  }
  const [id, role] = row.split("\t");
  if (role !== "ADMIN") throw new Error("Fixture administrator username collision.");
  manifest.accounts.admin = { id: Number(id), username: account.username, role };
  await save();
  return (
    await api("/auth/login", {
      method: "POST",
      body: {
        username: account.username,
        password: account.password,
        deviceId: "ui-preview-fixture-seeder",
        deviceName: "Local acceptance fixture setup"
      }
    })
  ).token;
}
async function ensureEmployee(token) {
  const account = accounts.internalAgent;
  const listing = await api("/admin/employees?page=0&size=200", { token });
  let row = listing.items.find((item) => item.username === account.username);
  if (!row)
    row = await api("/business/customers/oversea-agents", {
      token,
      method: "POST",
      body: {
        username: account.username,
        password: account.password,
        displayName: account.displayName
      }
    });
  if (row.role !== "OVERSEA_AGENT") throw new Error("Fixture internal-agent username collision.");
  manifest.accounts.internalAgent = {
    id: Number(row.id),
    username: account.username,
    role: row.role
  };
  await save();
}
async function ensureCustomer(token, key) {
  const account = accounts[key];
  const publicId = (
    await sql(
      `SELECT public_id FROM cp_customers WHERE username=${literal(account.username)} AND status='ACTIVE';`
    )
  ).trim();
  let row = publicId ? await api(`/business/customers/${publicId}`, { token }) : null;
  if (!row)
    row = await api("/business/customers", {
      token,
      method: "POST",
      body: {
        username: account.username,
        password: account.password,
        displayName: account.displayName,
        partyRole: account.partyRole,
        clientCode: account.customerCode,
        remark: "ui-preview: explicitly generated local acceptance fixture; no carrier request",
        contactEmail: `${account.username}@example.invalid`
      }
    });
  if (row.partyRole !== account.partyRole) throw new Error("Fixture customer username collision.");
  manifest.accounts[key] = {
    id: row.id,
    username: account.username,
    role: "CUSTOMER",
    partyRole: row.partyRole
  };
  await save();
}
async function ensureShipment(token) {
  const reference = "UI-PREVIEW-BOOKING-001";
  let row = null;
  if (manifest.shipments.primary?.id) {
    const listing = await api(`/business/customers/${manifest.accounts.shipper.id}/shipments`, {
      token
    });
    row = listing.items?.find((item) => item.shipmentId === manifest.shipments.primary.id);
  }
  if (!row) {
    const existing = (
      await sql(
        `SELECT s.public_id FROM cp_shipments s JOIN cp_shipment_references r ON r.shipment_id=s.id WHERE r.reference_no_normalized=${literal(reference)};`
      )
    ).trim();
    if (existing) row = { shipmentId: existing };
  }
  if (!row)
    row = await api("/business/customers/shipments", {
      token,
      method: "POST",
      body: {
        customerId: manifest.accounts.shipper.id,
        publishToCustomer: true,
        shipment: {
          carrier: "COSCO",
          referenceType: "BOOKING",
          referenceNo: reference,
          trackingStatus: "ui-preview local sample - in transit",
          note: "ui-preview: local acceptance fixture, not an actual shipment or carrier response.",
          forwarderJobNumber: "ui-preview-job-001",
          clientPoNumber: "ui-preview-po-001",
          clientNameCode: "UIPVSHIP01",
          vesselVoyage: "UI PREVIEW / 001",
          portOfLoading: "Shanghai (local sample)",
          portOfDischarge: "Hamburg (local sample)",
          estimatedDeparture: "2026-10-26T08:00:00Z",
          actualDeparture: "2026-10-26T09:00:00Z",
          estimatedArrival: "2026-11-18T12:00:00Z",
          currentLocation: "Local acceptance sample",
          volume: "12.5 CBM",
          bookingNumber: reference,
          trafficTerm: "CY-CY",
          serviceScopes: ["OCEAN"],
          latestEventName: "ui-preview manual event",
          latestEventTime: "2026-10-27T08:00:00Z",
          latestEventLocation: "Local preview",
          routeNodes: [
            {
              locationType: "POR",
              city: "Shanghai - sample",
              countryCode: "CN",
              event: "ui-preview receipt",
              actualTime: "2026-10-25T08:00:00Z",
              timezone: "Asia/Shanghai"
            },
            {
              locationType: "FPOL",
              city: "Shanghai - sample",
              countryCode: "CN",
              event: "ui-preview departure",
              actualTime: "2026-10-26T09:00:00Z",
              timezone: "Asia/Shanghai"
            },
            {
              locationType: "LPOD",
              city: "Hamburg - sample",
              countryCode: "DE",
              event: "ui-preview estimated arrival",
              estimatedTime: "2026-11-18T12:00:00Z",
              timezone: "Europe/Berlin"
            },
            {
              locationType: "FND",
              city: "Hamburg - sample",
              countryCode: "DE",
              event: "ui-preview destination",
              estimatedTime: "2026-11-19T12:00:00Z",
              timezone: "Europe/Berlin"
            }
          ],
          containerTypes: [{ type: "40HC", quantity: 1 }],
          containers: [
            {
              number: "UIPU0000001",
              type: "40HC",
              currentLocation: "ui-preview sample",
              latestEvent: "ui-preview manual event",
              latestEventTime: "2026-10-27T08:00:00Z"
            }
          ]
        }
      }
    });
  manifest.shipments.primary = {
    id: row.shipmentId,
    reference,
    carrier: "COSCO",
    source: "manual local acceptance fixture; no upstream request"
  };
  await save();
  const customerId = manifest.accounts.shipper.id;
  const employeeId = String(manifest.accounts.internalAgent.id);
  const details = await api(`/business/customers/${customerId}`, { token });
  if (String(details.overseaAgentUserId) !== employeeId)
    await api("/business/customers/transfer", {
      token,
      method: "POST",
      body: { customerIds: [customerId], targetAgentId: employeeId }
    });
  const links = await api(
    `/business/customers/${manifest.accounts.legacyAgent.id}/linked-customers`,
    { token }
  );
  if (!links.items.some((item) => item.id === customerId))
    await api(`/business/customers/${manifest.accounts.legacyAgent.id}/linked-customers`, {
      token,
      method: "PUT",
      body: { customerIds: [customerId] }
    });
}
async function ensureFiles(token, readerOnly = false) {
  const samples = path.join(work, "samples");
  const samplePdf = path.join(samples, "ui-preview-sample.pdf");
  if (!(await exists(samplePdf))) {
    const bundled = path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe"
    );
    const python = process.env.PREVIEW_PYTHON || ((await exists(bundled)) ? bundled : "python");
    await command(python, [path.join(root, "scripts", "dev-preview-sample.py"), samples]);
  }
  const shipmentId = manifest.shipments.primary.id;
  let listing = await api(`/shipments/${shipmentId}/files`, { token });
  const candidates = readerOnly
    ? [["pdfReaderEmbedded", "ui-preview-chinese-embedded.pdf", "application/pdf"]]
    : [
        ["pdf", "ui-preview-sample.pdf", "application/pdf"],
        ["text", "ui-preview-notes.txt", "text/plain"]
      ];
  for (const [key, name, mime] of candidates) {
    let row = listing.items.find(
      (item) =>
        item.originalFileName === name ||
        item.originalName === name ||
        item.fileName === name ||
        item.name === name
    );
    if (!row) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([await readFile(path.join(samples, name))], { type: mime }),
        name
      );
      form.append("category", "RELATED");
      for (const role of ["SHIPPER", "OVERSEA_AGENT"]) form.append("visibilityRoles", role);
      const result = await api(`/shipments/${shipmentId}/files`, { token, method: "POST", form });
      row = result.items[0];
    }
    const id = row.id || row.fileId;
    if (!id) throw new Error("File API did not return a public file identifier.");
    const bytes = await api(`/shipment-files/${id}/preview`, { token, binary: true });
    if (key.startsWith("pdf") && bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("PDF preview is not a real PDF.");
    manifest.files[key] = {
      id,
      name,
      bytes: bytes.length,
      previewUrl: `http://127.0.0.1:18088/api/shipment-files/${id}/preview`,
      downloadUrl: `http://127.0.0.1:18088/api/shipment-files/${id}/download`,
      requires: "authenticated employee with shipment scope"
    };
    await save();
    listing = await api(`/shipments/${shipmentId}/files`, { token });
  }
}
async function verify() {
  for (const key of ["internalAgent", "shipper", "legacyAgent"]) {
    const account = accounts[key];
    const customer = account.role === "CUSTOMER";
    const session = await api(customer ? "/public/customers/login" : "/auth/login", {
      method: "POST",
      body: {
        username: account.username,
        password: account.password,
        ...(customer
          ? { customerCode: account.customerCode }
          : { deviceId: "ui-preview-fixture-check", deviceName: "Local acceptance verification" })
      }
    });
    const credential = customer ? { customerToken: session.token } : { token: session.token };
    const listing = await api(
      customer
        ? "/customer/shipments?page=1&pageSize=100"
        : "/business/shipments?page=1&pageSize=100",
      credential
    );
    const serialized = JSON.stringify(listing);
    if (Number(listing.total) !== 1) throw new Error(`Unexpected shipment scope for ${key}.`);
    if (!serialized.includes(manifest.shipments.primary.id))
      throw new Error(`Published fixture shipment is not visible to ${key}.`);
    const fileId = manifest.files.pdf.id;
    const pdf = await api(`${customer ? "/customer" : ""}/shipment-files/${fileId}/preview`, {
      ...credential,
      binary: true
    });
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new Error(`Safe PDF preview failed for ${key}.`);
    manifest.verification[key] = {
      login: true,
      authorizedShipmentVisible: true,
      authorizedShipmentCount: Number(listing.total),
      safePdfPreview: true,
      checkedAt: new Date().toISOString()
    };
    await save();
    await api(customer ? "/customer/logout" : "/auth/logout", { ...credential, method: "POST" });
  }
}
try {
  await assertIsolated();
  await mkdir(work, { recursive: true });
  if (process.argv.includes("--pdf-reader-only")) {
    accounts = JSON.parse(await readFile(accountsPath, "utf8"));
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      accounts.project !== "cargo-ui-preview" ||
      manifest.schema !== "cargo_preview" ||
      !accounts.admin.username.startsWith("ui-preview-")
    )
      throw Error("Refusing PDF fixture: wrong local fixture identity.");
    const session = await api("/auth/login", {
      method: "POST",
      body: {
        username: accounts.admin.username,
        password: accounts.admin.password,
        deviceId: "ui-preview-pdf-reader",
        deviceName: "Local PDF acceptance"
      }
    });
    try {
      await ensureFiles(session.token, true);
    } finally {
      await api("/auth/logout", { token: session.token, method: "POST" });
    }
    console.log("Isolated Chinese/multipage PDF fixture ready; original files unchanged.");
  } else {
    await initialize();
    const token = await ensureAdmin();
    await ensureEmployee(token);
    await ensureCustomer(token, "shipper");
    await ensureCustomer(token, "legacyAgent");
    await ensureShipment(token);
    await ensureFiles(token);
    await verify();
    await api("/auth/logout", { token, method: "POST" });
    manifest.updatedAt = new Date().toISOString();
    await save();
    console.log(
      "Isolated acceptance fixtures ready; no original accounts changed and no carrier request was sent."
    );
    console.log("Credentials: .tmp/dev-preview/fixture-accounts.json (local only)");
    console.log("Manifest: .tmp/dev-preview/fixture-manifest.json");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
