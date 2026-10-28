import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import {
  createCatalog,
  scanModalSources,
  root,
  hubDirectory,
  designDirectory
} from "./catalog.mjs";

const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex === -1 ? 51224 : process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local port");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

async function safeFile(res, base, path) {
  const file = resolve(base, path);
  if (!file.startsWith(resolve(base) + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!(await stat(file)).isFile() || !mime[extname(file)]) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": mime[extname(file)], "Cache-Control": "no-store" });
  res.end(await readFile(file));
}

createServer(async (req, res) => {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(req.headers.host)) {
    res.writeHead(403).end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  function json(data) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(data));
  }
  try {
    if (url.pathname === "/api/catalog") {
      json(await createCatalog());
      return;
    }
    if (url.pathname === "/api/modal-sources") {
      json(await scanModalSources());
      return;
    }
    if (url.pathname === "/api/local-records") {
      let records = {};
      try {
        const input = JSON.parse(
          await readFile(resolve(hubDirectory, ".local-records.json"), "utf8")
        );
        for (const key of [
          "baseUrl",
          "customerId",
          "shipmentId",
          "trackingNumber",
          "trackingCarrier",
          "trackingType"
        ])
          if (typeof input[key] === "string") records[key] = input[key];
      } catch {
        /* Optional local record identifiers, never credentials. */
      }
      json(records);
      return;
    }
    if (url.pathname === "/api/designs") {
      let files = [];
      try {
        files = (await readdir(designDirectory))
          .filter(
            (file) =>
              /\.(png|webp|jpe?g)$/i.test(file) &&
              !/deprecated|弃用|detail-drawer-concept/i.test(file)
          )
          .sort();
      } catch {
        /* Root adds full-page compositions when ready. */
      }
      json(files.map((file) => ({ name: file, url: "/designs/" + encodeURIComponent(file) })));
      return;
    }
    if (url.pathname.startsWith("/designs/")) {
      await safeFile(res, designDirectory, decodeURIComponent(url.pathname.slice(9)));
      return;
    }
    if (url.pathname.startsWith("/fonts/")) {
      await safeFile(
        res,
        resolve(root, "frontend/public/fonts"),
        decodeURIComponent(url.pathname.slice(7))
      );
      return;
    }
    const publicFiles = {
      "/": "index.html",
      "/index.html": "index.html",
      "/hub.css": "hub.css",
      "/hub.js": "hub.js"
    };
    if (!publicFiles[url.pathname]) {
      res.writeHead(404).end();
      return;
    }
    await safeFile(res, hubDirectory, publicFiles[url.pathname]);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end(error.code === "ENOENT" ? "Not found" : "Local review request failed");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Local review hub: http://127.0.0.1:${port}\n`);
});
