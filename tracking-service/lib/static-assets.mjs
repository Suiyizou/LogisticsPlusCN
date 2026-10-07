import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { setCommonHeaders } from "./http-utils.mjs";

/**
 * 静态资源响应管线：MIME、缓存策略、ETag、条件请求、Brotli/Gzip 压缩与压缩结果缓存。
 * 从 server.mjs 下沉；serveStatic 仍留在入口负责路径解析。
 */
export const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
});
const COMPRESSIBLE_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs", ".json", ".svg"]);
const HASHED_ASSET_PATTERN = /[.-][a-z0-9_-]{8,}\.(?:css|gif|ico|jpe?g|js|json|png|svg|woff2?)$/i;
const STATIC_COMPRESSION_CACHE_LIMIT = 64;
const compressWithBrotli = promisify(brotliCompress);
const compressWithGzip = promisify(gzip);
const staticCompressionCache = new Map();

export function staticCacheControl(pathname) {
  if (pathname.endsWith(".html") || pathname === "/") {
    return "no-cache, no-store, must-revalidate";
  }
  if (HASHED_ASSET_PATTERN.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache, must-revalidate";
}

function staticEtag(content) {
  const digest = createHash("sha256").update(content).digest("base64url").slice(0, 16);
  return `W/"${content.length.toString(16)}-${digest}"`;
}

function acceptsEncoding(request, encoding) {
  const value = String(request.headers["accept-encoding"] || "").toLowerCase();
  const entries = value.split(",").map((entry) => {
    const [name, ...parameters] = entry.trim().split(";");
    return {
      name,
      allowed: !parameters.some((parameter) => /^q=0(?:\.0*)?$/.test(parameter.trim()))
    };
  });
  const explicit = entries.find((entry) => entry.name === encoding);
  if (explicit) return explicit.allowed;
  return entries.some((entry) => entry.name === "*" && entry.allowed);
}

function rememberCompressedStatic(key, content) {
  if (staticCompressionCache.has(key)) staticCompressionCache.delete(key);
  staticCompressionCache.set(key, content);
  while (staticCompressionCache.size > STATIC_COMPRESSION_CACHE_LIMIT) {
    staticCompressionCache.delete(staticCompressionCache.keys().next().value);
  }
}

async function cachedCompressedStatic(key, compress) {
  let pending = staticCompressionCache.get(key);
  if (!pending) {
    pending = Promise.resolve().then(compress);
    rememberCompressedStatic(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    if (staticCompressionCache.get(key) === pending) staticCompressionCache.delete(key);
    throw error;
  }
}

async function compressStaticContent(request, content, extension, etag) {
  if (content.length < 1024 || !COMPRESSIBLE_EXTENSIONS.has(extension)) {
    return { content, encoding: null };
  }
  if (acceptsEncoding(request, "br")) {
    const key = `${etag}:br`;
    const compressed = await cachedCompressedStatic(key, () =>
      compressWithBrotli(content, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 5
        }
      })
    );
    return { content: compressed, encoding: "br" };
  }
  if (acceptsEncoding(request, "gzip")) {
    const key = `${etag}:gzip`;
    const compressed = await cachedCompressedStatic(key, () =>
      compressWithGzip(content, { level: 6 })
    );
    return { content: compressed, encoding: "gzip" };
  }
  return { content, encoding: null };
}

export async function sendStaticContent(request, response, content, options) {
  const extension = options.extension || "";
  const etag = staticEtag(content);
  const headers = {
    "Content-Type": options.contentType,
    "Cache-Control": options.cacheControl,
    ETag: etag
  };

  if (COMPRESSIBLE_EXTENSIONS.has(extension)) headers.Vary = "Accept-Encoding";

  if (request.headers["if-none-match"] === etag) {
    setCommonHeaders(response);
    response.writeHead(304, headers);
    response.end();
    return;
  }

  const representation = await compressStaticContent(request, content, extension, etag);
  if (representation.encoding) headers["Content-Encoding"] = representation.encoding;
  headers["Content-Length"] = representation.content.length;
  setCommonHeaders(response);
  response.writeHead(200, headers);
  response.end(request.method === "HEAD" ? undefined : representation.content);
}
