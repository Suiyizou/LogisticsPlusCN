import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Value } from "typebox/value";
import { cleanupExpiredRunArtifacts } from "./artifact-retention.js";
import { CARRIERS } from "./carriers.js";
import { loadConfig, type LabConfig } from "./config.js";
import { TrackingRequestSchema, type TrackingRequest } from "./contracts.js";
import { RunManager, RunQueueFullError } from "./run-manager.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function createLabServer(
  config: LabConfig = loadConfig(),
  manager: RunManager = new RunManager(config),
) {
  const publicDir = resolve(config.rootDir, "public");
  const startupCleanup: Promise<Error | null> = cleanupExpiredRunArtifacts({
    rootDir: config.rootDir,
    ttlMs: config.artifacts.ttlMs,
    isRetainedRun: (runId) => manager.get(runId) !== null,
  }).then(() => null).catch((error) => error instanceof Error ? error : new Error(String(error)));
  return createServer(async (request, response) => {
    try {
      const cleanupError = await startupCleanup;
      if (cleanupError) throw cleanupError;
      await routeRequest(request, response, manager, publicDir, config);
    } catch (error) {
      if (error instanceof RunQueueFullError) {
        sendJson(response, 429, {
          error: error.message,
          code: "QUEUE_FULL",
          queue: manager.stats(),
        });
        return;
      }
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manager: RunManager,
  publicDir: string,
  config: LabConfig,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      status: "UP",
      service: "carrier-agent-lab",
      queue: manager.stats(),
      browser: {
        headless: config.browser.headless,
        headedAllowed: config.browser.allowHeaded,
      },
      demo: {
        enabled: config.demo.enabled,
      },
      artifacts: {
        ttlMs: config.artifacts.ttlMs,
      },
    });
    return;
  }
  if (method === "GET" && url.pathname === "/api/carriers") {
    sendJson(response, 200, {
      carriers: Object.values(CARRIERS).map(({ strongPrefixes: _prefixes, officialHosts: _hosts, queryHint: _hint, ...carrier }) => carrier),
    });
    return;
  }
  if (method === "POST" && url.pathname === "/api/runs") {
    const body: unknown = await readJson(request);
    if (!Value.Check(TrackingRequestSchema, body)) {
      sendJson(response, 400, { error: "Invalid tracking request" });
      return;
    }
    if ((body as TrackingRequest).headed === true && !config.browser.allowHeaded) {
      sendJson(response, 400, { error: "Headed browser mode is disabled for this deployment" });
      return;
    }
    const run = manager.create(body as TrackingRequest);
    sendJson(response, 202, run);
    return;
  }
  const artifactMatch = /^\/api\/runs\/([0-9a-f-]+)\/artifacts\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg)$/i.exec(url.pathname);
  if (artifactMatch && method === "GET") {
    await serveRunArtifact(artifactMatch[1]!, artifactMatch[2]!, response, manager, config);
    return;
  }
  const runMatch = /^\/api\/runs\/([0-9a-f-]+)$/.exec(url.pathname);
  if (runMatch && method === "GET") {
    const run = manager.get(runMatch[1]!);
    sendJson(response, run ? 200 : 404, run ?? { error: "Run not found" });
    return;
  }
  if (runMatch && method === "DELETE") {
    const run = manager.cancel(runMatch[1]!);
    sendJson(response, run ? 200 : 404, run ?? { error: "Run not found" });
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  await serveStatic(url.pathname, method === "HEAD", response, publicDir);
}

async function serveRunArtifact(
  runId: string,
  artifactId: string,
  response: ServerResponse,
  manager: RunManager,
  config: LabConfig,
): Promise<void> {
  const run = manager.get(runId);
  const attachment = run?.events
    .flatMap((event) => event.attachments ?? [])
    .find((candidate) => candidate.type === "SCREENSHOT" && candidate.artifactId === artifactId);
  if (!run || !attachment) {
    sendJson(response, 404, { error: "Artifact not found" });
    return;
  }
  const runArtifactDir = resolve(join(config.rootDir, "artifacts", runId));
  const filePath = resolve(join(runArtifactDir, artifactId));
  if (!filePath.startsWith(`${runArtifactDir}/`) && !filePath.startsWith(`${runArtifactDir}\\`)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  try {
    // A bounded one-shot read avoids the lstat -> createReadStream race: if a
    // cleanup removes the file concurrently, readFile rejects before headers;
    // otherwise the complete immutable response buffer is already in memory.
    const data = await readFile(filePath);
    if (data.byteLength > 5 * 1024 * 1024) {
      sendJson(response, 413, { error: "Artifact exceeds size limit" });
      return;
    }
    response.writeHead(200, {
      "Content-Type": attachment.mimeType,
      "Content-Length": data.byteLength,
      "Content-Disposition": "inline; filename=\"browser-screenshot.jpg\"",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(data);
  } catch {
    sendJson(response, 404, { error: "Artifact not found" });
  }
}

async function serveStatic(pathname: string, head: boolean, response: ServerResponse, publicDir: string): Promise<void> {
  const relative = pathname === "/" ? "index.html" : normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const filePath = resolve(join(publicDir, relative));
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}\\`) && !filePath.startsWith(`${publicDir}/`)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": "no-store",
    });
    if (head) response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return;
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
  });
  response.end(json);
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const config = loadConfig();
  const server = createLabServer(config);
  server.listen(config.port, config.host, () => {
    process.stdout.write(`Carrier agent preview: http://${config.host}:${config.port}\n`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
