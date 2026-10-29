import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const image = process.env.TRACKING_STATIC_TEST_IMAGE;

// Opt in with a previously built image. Normal source/release tests need no Docker daemon.
test("cloud tracking image serves its real UI assets without a browser runtime", {
  skip: !image,
  timeout: 120_000
}, async () => {
  function docker(args) {
    const result = spawnSync("docker", args, {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout || `docker ${args[0]} failed`);
    return result.stdout.trim();
  }

  const container = docker([
    "run", "--detach", "--rm", "--publish", "127.0.0.1::3000", image
  ]);
  assert.match(container, /^[a-f0-9]{64}$/);
  try {
    docker(["exec", container, "nginx", "-t"]);
    docker(["exec", container, "sh", "-ec", `
      for executable in node npm npx chromium chromium-browser google-chrome playwright; do
        if command -v "$executable" >/dev/null 2>&1; then
          echo "Unexpected runtime executable: $executable" >&2
          exit 1
        fi
      done
      for directory in /app/node_modules /assets/node_modules /ms-playwright /root/.cache/ms-playwright /home/pwuser/.cache/ms-playwright /usr/share/nginx/html/node_modules; do
        test ! -e "$directory"
      done
    `]);
    const binding = docker(["port", container, "3000/tcp"]);
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    const origin = `http://${binding}`;

    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2_000) });
        const health = await response.json();
        if (response.status === 200 && health.browserRuntime === false) {
          healthy = true;
          break;
        }
      } catch {
        // Nginx may still be starting immediately after docker run returns.
      }
      await delay(200);
    }
    assert.equal(healthy, true, "Static service health never became ready");

    const html = await fetch(`${origin}/index.html`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /^text\/html\b/);
    assert.equal(html.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(html.headers.get("content-security-policy"), /frame-ancestors 'self'/);
    assert.doesNotMatch(html.headers.get("content-security-policy"), /unsafe-eval|unsafe-inline/);
    assert.equal(html.headers.get("x-content-type-options"), "nosniff");
    assert.match(html.headers.get("cache-control"), /no-store/);
    assert.ok((await html.text()).length > 100, "The actual tracking document must be served");

    for (const path of ["/app.js", "/styles.css", "/tracking-v1-adapter.mjs"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("cache-control"), /no-cache/, path);
      assert.doesNotMatch(response.headers.get("cache-control"), /immutable/, path);
      if (path.endsWith(".mjs")) {
        assert.match(response.headers.get("content-type"), /^(?:application|text)\/javascript\b/, path);
      }
      const content = await response.arrayBuffer();
      assert.ok(content.byteLength > 0, path);
      const etag = response.headers.get("etag");
      assert.ok(etag, path);
      const unchanged = await fetch(origin + path, { headers: { "If-None-Match": etag } });
      assert.equal(unchanged.status, 304, path);
      assert.equal((await unchanged.arrayBuffer()).byteLength, 0, path);
      const head = await fetch(origin + path, { method: "HEAD" });
      assert.equal(head.status, 200, path);
      assert.equal((await head.arrayBuffer()).byteLength, 0, path);
    }

    const pdf = "/vendor/pdfjs/6.4.299/";
    for (const [path, mime] of [
      ["/vendor/element-plus.css", /^text\/css\b/],
      ["/vendor/xlsx.mjs", /^(?:application|text)\/javascript\b/],
      ["/api/flags/4x3/cn", /^image\/svg\+xml\b/],
      ["/vendor/flags/1x1/cn.svg", /^image\/svg\+xml\b/],
      [pdf + "legacy/build/pdf.mjs", /^(?:application|text)\/javascript\b/],
      [pdf + "legacy/build/pdf.worker.mjs", /^(?:application|text)\/javascript\b/],
      [pdf + "wasm/openjpeg.wasm", /^application\/wasm\b/],
      [pdf + "wasm/jbig2_nowasm_fallback.js", /^(?:application|text)\/javascript\b/],
      [pdf + "cmaps/Adobe-GB1-UCS2.bcmap", /^application\/octet-stream\b/],
      [pdf + "standard_fonts/LiberationSans-Regular.ttf", /^font\/ttf\b/],
      [pdf + "iccs/CGATS001Compat-v2-micro.icc", /^application\/vnd\.iccprofile\b/]
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type"), mime, path);
      assert.ok((await response.arrayBuffer()).byteLength > 0, path);
      if (path.startsWith(pdf)) {
        assert.match(response.headers.get("cache-control"), /max-age=31536000.*immutable/, path);
      }
    }

    for (const [path, mime] of [
      ["/icon-192.png", /^image\/png\b/],
      ["/carriers/cosco-shipping-lines.png", /^image\/png\b/],
      ["/fonts/inter/files/inter-latin-wght-normal.woff2", /^(?:font\/woff2|application\/font-woff2)\b/]
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type"), mime, path);
      const source = await readFile(new URL(`../../tracking-service/public${path}`, import.meta.url));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), source, path);
    }

    for (const path of ["/api/track", "/api/channels/check"]) {
      const response = await fetch(origin + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier: "COSCO", number: "SHOULD-NOT-RUN" })
      });
      assert.equal(response.status, 410, path);
      const result = await response.json();
      assert.equal(result.error?.details?.code, "TRACKING_CLOUD_ADAPTER_REMOVED", path);
    }
    const channel = await fetch(`${origin}/api/channels/network/status`);
    assert.equal(channel.status, 200);
    assert.equal((await channel.json()).status, "unknown");

    for (const path of [
      "/vendor/nonexistent.js",
      pdf + "package.json",
      pdf + "types/src/pdf.d.ts",
      pdf + "web/pdf_viewer.mjs",
      pdf + "wasm/quickjs-eval.js",
      pdf + "wasm/quickjs-eval.wasm",
      pdf + "legacy/build/pdf.sandbox.mjs"
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 404, path);
      await response.arrayBuffer();
    }
  } finally {
    // Only remove the isolated container created by this test, never a shared preview service.
    const cleanup = spawnSync("docker", ["rm", "--force", container], {
      encoding: "utf8", timeout: 30_000, windowsHide: true
    });
    assert.equal(cleanup.error, undefined, cleanup.error?.message);
    if (cleanup.status !== 0 && !/No such container/i.test(cleanup.stderr || "")) {
      assert.fail(cleanup.stderr || "Could not remove the isolated tracking test container");
    }
  }
});
