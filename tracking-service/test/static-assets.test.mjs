import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { staticCacheControl } from "../lib/static-assets.mjs";
import { createStaticRouter } from "../lib/static-routes.mjs";

test("mutable public stylesheet and module names never receive immutable caching", () => {
  for (const path of [
    "/tracking-refinement.css",
    "/brand-tokens.css",
    "/design-system.css",
    "/app.js",
    "/tracking-presentation.mjs",
    "/carrier-catalog.mjs",
    "/fonts/brand-fonts.css",
    "/fonts/inter/files/inter-latin-wght-normal.woff2"
  ])
    assert.equal(staticCacheControl(path), "no-cache, must-revalidate", path);
});

test("only digest-suffixed assets get a long immutable cache while HTML always revalidates", () => {
  assert.equal(
    staticCacheControl("/assets/app.9a1b2c3d.css"),
    "public, max-age=31536000, immutable"
  );
  assert.equal(
    staticCacheControl("/assets/icon-3f8a12b9.svg"),
    "public, max-age=31536000, immutable"
  );
  assert.equal(staticCacheControl("/index.html"), "no-cache, no-store, must-revalidate");
  assert.equal(staticCacheControl("/"), "no-cache, no-store, must-revalidate");
});

test("versioned real static CSS and modules revalidate, including their ETag 304 responses", async (context) => {
  const router = createStaticRouter({
    publicDir: fileURLToPath(new URL("../public/", import.meta.url))
  });
  const server = createServer((request, response) => {
    void router.serveStatic(request, response).catch((error) => {
      response.writeHead(error.status || 500);
      response.end(error.message);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    "/tracking-refinement.css",
    "/brand-tokens.css",
    "/tracking-presentation.mjs",
    "/app.js"
  ]) {
    const url = `${origin}${path}?v=maritime-v2-20261028-r3`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache, must-revalidate");
    const etag = response.headers.get("etag");
    assert.ok(etag);
    await response.arrayBuffer();
    const unchanged = await fetch(url, { headers: { "If-None-Match": etag } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get("cache-control"), "no-cache, must-revalidate");
  }
});

test("PDF.js serves only the pinned browser resources with correct MIME and unchanged CSP", async (context) => {
  const router = createStaticRouter({
    publicDir: fileURLToPath(new URL("../public/", import.meta.url))
  });
  const server = createServer((request, response) => {
    void router.serveStatic(request, response).catch((error) => {
      response.writeHead(error.status || 500);
      response.end(error.message);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/vendor/pdfjs/6.4.299/`;
  for (const [path, mime] of [
    ["legacy/build/pdf.mjs", "text/javascript"],
    ["legacy/build/pdf.worker.mjs", "text/javascript"],
    ["cmaps/Adobe-GB1-UCS2.bcmap", "application/octet-stream"],
    ["standard_fonts/LiberationSans-Regular.ttf", "font/ttf"],
    ["wasm/openjpeg_nowasm_fallback.js", "text/javascript"],
    ["wasm/jbig2_nowasm_fallback.js", "text/javascript"],
    ["wasm/openjpeg.wasm", "application/wasm"],
    ["iccs/CGATS001Compat-v2-micro.icc", "application/vnd.iccprofile"]
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get("content-type").startsWith(mime), path);
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.doesNotMatch(
      response.headers.get("content-security-policy"),
      /unsafe-eval|unsafe-inline/
    );
    await response.arrayBuffer();
  }
  for (const path of [
    "../6.4.300/build/pdf.mjs",
    "package.json",
    "types/src/pdf.d.ts",
    "web/pdf_viewer.mjs",
    "wasm/quickjs-eval.js",
    "cmaps/%2fpackage.json",
    "standard_fonts/../../../package.json"
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 404, path);
    await response.arrayBuffer();
  }
});
