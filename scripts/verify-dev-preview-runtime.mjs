import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const work = path.join(root, ".tmp", "dev-preview");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const docker = (args) =>
  execFileSync("docker", args, { cwd: root, encoding: "utf8", windowsHide: true });
async function localTree(directory, prefix = "") {
  const result = {};
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await localTree(directory, name));
    else if (entry.isFile()) result[name] = hash(await readFile(path.join(directory, name)));
  }
  return result;
}
function containerTree(container, directory) {
  const output = docker([
    "exec",
    container,
    "sh",
    "-c",
    'cd "$1" && find . -type f -exec sha256sum {} +',
    "runtime-static-tree",
    directory
  ]);
  return Object.fromEntries(
    output
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const match = /^([a-f0-9]{64})\s+\.?\/(.*)$/.exec(line);
        if (!match) throw Error("Unexpected static checksum output");
        return [match[2], match[1]];
      })
  );
}
async function compareTree(service, source, destination) {
  const expected = await localTree(path.join(root, source));
  const actual = containerTree(`cargo-ui-preview-${service}`, destination);
  const mismatches = Object.keys(expected).filter((file) => expected[file] !== actual[file]);
  if (mismatches.length)
    throw Error(`${service} static mismatch: ${mismatches.slice(0, 8).join(", ")}`);
  return {
    source,
    sourceFileCount: Object.keys(expected).length,
    containerFileCount: Object.keys(actual).length,
    allSourceFilesMatch: true,
    sourceTreeSha256: hash(
      Buffer.from(JSON.stringify(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b))))
    )
  };
}
async function main() {
  const baseline =
    process.argv.find((value) => value.startsWith("--baseline="))?.slice(11) ||
    "comps-runtime-before.json";
  const output =
    process.argv.find((value) => value.startsWith("--output="))?.slice(9) ||
    "comps-runtime-verification.json";
  if (![baseline, output].every((value) => /^[a-zA-Z0-9_.-]+\.json$/.test(value)))
    throw Error("Expected local JSON report filenames");
  const frontendOnly = process.argv.includes("--frontend-only");
  const before = JSON.parse(await readFile(path.join(work, baseline), "utf8"));
  const containers = {};
  for (const name of ["mysql", "backend", "frontend", "tracking", "gateway"]) {
    const value = JSON.parse(docker(["inspect", `cargo-ui-preview-${name}`]))[0];
    if (
      value.Config.Labels["com.docker.compose.project"] !== "cargo-ui-preview" ||
      value.State.Status !== "running"
    )
      throw Error(`Wrong project/runtime for ${name}`);
    if (["mysql", "backend", "tracking"].includes(name) && value.State.Health?.Status !== "healthy")
      throw Error(`${name} is not healthy`);
    containers[name] = {
      id: value.Id,
      image: value.Image,
      startedAt: value.State.StartedAt,
      health: value.State.Health?.Status || "running"
    };
  }
  for (const name of frontendOnly ? ["mysql", "backend", "tracking"] : ["mysql", "backend"])
    if (
      containers[name].id !== before.containers[name].id ||
      containers[name].startedAt !== before.containers[name].startedAt
    )
      throw Error(`${name} was replaced or restarted unexpectedly`);
  const query =
    "SELECT 'users',COUNT(*) FROM cp_users UNION ALL SELECT 'customers',COUNT(*) FROM cp_customers UNION ALL SELECT 'shipments',COUNT(*) FROM cp_shipments UNION ALL SELECT 'snapshots',COUNT(*) FROM cp_tracking_snapshots UNION ALL SELECT 'refresh_jobs',COUNT(*) FROM cp_tracking_refresh_jobs UNION ALL SELECT 'files',COUNT(*) FROM cp_shipment_files;";
  const counts = docker([
    "exec",
    "cargo-ui-preview-mysql",
    "sh",
    "-c",
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --skip-column-names cargo_preview -e "$1"',
    "preview-counts",
    query
  ]).trim();
  if (counts !== before.counts)
    throw Error("Preview business row counts changed during static deployment");
  const credentialsUnchanged =
    hash(await readFile(path.join(work, "fixture-accounts.json"))) ===
    before.fixtureCredentialsSha256;
  if (!credentialsUnchanged) throw Error("Fixture credentials changed during deployment");
  const staticTrees = {
    frontend: await compareTree("frontend", "frontend/dist", "/usr/share/nginx/html"),
    tracking: await compareTree("tracking", "tracking-service/public", "/app/public")
  };
  const http = [];
  const checks = [
    ["/", "frontend/dist/index.html"],
    [
      "/fonts/inter/files/inter-latin-wght-normal.woff2",
      "frontend/dist/fonts/inter/files/inter-latin-wght-normal.woff2"
    ],
    ["/tracking/", "tracking-service/public/index.html"],
    ...[
      "app.js",
      "tracking-composition.css",
      "tracking-refinement.css",
      "tracking-presentation.mjs",
      "brand-tokens.css"
    ].map((name) => ["/tracking/" + name, "tracking-service/public/" + name])
  ];
  const index = await readFile(path.join(root, "frontend/dist/index.html"), "utf8");
  for (const match of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g))
    checks.push([match[1], "frontend/dist" + match[1]]);
  // Lazy PDF worker and local fonts are not referenced by the initial HTML.
  for (const name of await readdir(path.join(root, "frontend/dist/assets")))
    if (/^pdf\.worker.*\.mjs$/.test(name))
      checks.push([`/assets/${name}`, `frontend/dist/assets/${name}`]);
  for (const name of ["cmaps/UniGB-UCS2-H.bcmap", "standard_fonts/FoxitFixed.pfb", "LICENSE"])
    checks.push([`/pdfjs/6.4.299/${name}`, `frontend/dist/pdfjs/6.4.299/${name}`]);
  for (const name of [
    "legacy/build/pdf.mjs",
    "legacy/build/pdf.worker.mjs",
    "cmaps/UniGB-UCS2-H.bcmap"
  ])
    checks.push([
      `/tracking/vendor/pdfjs/6.4.299/${name}`,
      `tracking-service/node_modules/pdfjs-dist/${name}`
    ]);
  for (const [pathname, file] of checks) {
    const response = await fetch("http://127.0.0.1:18088" + pathname, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10000)
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || hash(bytes) !== hash(await readFile(path.join(root, file))))
      throw Error(`HTTP bytes do not match ${file}`);
    if (pathname.endsWith(".mjs") && !/javascript/.test(response.headers.get("content-type") || ""))
      throw Error(`Module worker/library has a non-JavaScript MIME type: ${pathname}`);
    const contentType = response.headers.get("content-type") || "";
    if (
      (pathname.endsWith(".js") && !/javascript/.test(contentType)) ||
      (pathname.endsWith(".css") && !/text\/css/.test(contentType)) ||
      (pathname.endsWith(".woff2") && !/font\/woff2/.test(contentType))
    )
      throw Error(`Static MIME mapping was lost: ${pathname}`);
    if (
      !response.headers
        .get("x-content-type-options")
        ?.split(",")
        .map((value) => value.trim())
        .includes("nosniff")
    )
      throw Error(`Missing nosniff response policy: ${pathname}`);
    http.push({
      pathname,
      status: response.status,
      sha256: hash(bytes),
      cacheControl: response.headers.get("cache-control"),
      contentType,
      nosniff: true
    });
  }
  const report = {
    verifiedAt: new Date().toISOString(),
    method: frontendOnly
      ? "frontend-only normal Docker source build"
      : "normal Docker source builds for frontend and tracking",
    ...(frontendOnly ? { trackingContainerUnchanged: true } : {}),
    databaseAndBackendUnchanged: true,
    businessRowCountsUnchanged: true,
    fixtureCredentialsUnchanged: credentialsUnchanged,
    counts,
    containers,
    staticTrees,
    http
  };
  await writeFile(path.join(work, output), JSON.stringify(report, null, 2));
  console.log(
    `Verified frontend ${staticTrees.frontend.sourceFileCount} files and tracking ${staticTrees.tracking.sourceFileCount} files; ${http.length} HTTP content checks passed. DB/backend and credentials unchanged.`
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
