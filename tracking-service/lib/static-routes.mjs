import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { HttpError } from "./http-utils.mjs";
import { MIME_TYPES, sendStaticContent, staticCacheControl } from "./static-assets.mjs";

const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const PDFJS_PREFIX = "/vendor/pdfjs/6.4.299/";
const PDFJS_FIXED_ASSETS = new Set([
  "legacy/build/pdf.mjs",
  "legacy/build/pdf.worker.mjs",
  "wasm/openjpeg_nowasm_fallback.js",
  "wasm/jbig2_nowasm_fallback.js",
  "wasm/openjpeg.wasm",
  "wasm/jbig2.wasm",
  "wasm/qcms_bg.wasm",
  "iccs/CGATS001Compat-v2-micro.icc"
]);
const PDFJS_DATA_ASSET =
  /^(?:cmaps\/[A-Za-z0-9_-]+\.bcmap|standard_fonts\/(?:Foxit[A-Za-z]+\.pfb|LiberationSans-(?:Bold|BoldItalic|Italic|Regular)\.ttf))$/;

/** 静态资源路由（public、vendor、国旗）。从 server.mjs 下沉为工厂，路径由入口注入。 */
export function createStaticRouter({ publicDir, elementPlusCss, xlsxModule, flagIconsDir }) {
  async function serveFlag(request, response, ratio, countryCode) {
    try {
      const content = await readFile(join(flagIconsDir, ratio, `${countryCode}.svg`));
      await sendStaticContent(request, response, content, {
        extension: ".svg",
        contentType: MIME_TYPES[".svg"],
        cacheControl: "public, max-age=604800"
      });
    } catch (error) {
      if (error?.code === "ENOENT") throw new HttpError(404, "国旗资源不存在");
      throw error;
    }
  }

  async function serveStatic(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/vendor/pdfjs/")) {
      const asset = url.pathname.startsWith(PDFJS_PREFIX)
        ? url.pathname.slice(PDFJS_PREFIX.length)
        : "";
      if (!PDFJS_FIXED_ASSETS.has(asset) && !PDFJS_DATA_ASSET.test(asset)) {
        throw new HttpError(404, "PDF预览资源不存在");
      }
      try {
        const content = await readFile(join(PDFJS_ROOT, asset));
        const extension = extname(asset);
        await sendStaticContent(request, response, content, {
          extension,
          contentType: MIME_TYPES[extension] ?? "application/octet-stream",
          cacheControl: "public, max-age=31536000, immutable"
        });
      } catch (error) {
        if (error?.code === "ENOENT") throw new HttpError(404, "PDF预览资源不存在");
        throw error;
      }
      return;
    }
    if (url.pathname === "/vendor/element-plus.css") {
      const content = await readFile(elementPlusCss);
      await sendStaticContent(request, response, content, {
        extension: ".css",
        contentType: MIME_TYPES[".css"],
        cacheControl: "no-cache, must-revalidate"
      });
      return;
    }

    if (url.pathname === "/vendor/xlsx.mjs") {
      const content = await readFile(xlsxModule);
      await sendStaticContent(request, response, content, {
        extension: ".mjs",
        contentType: MIME_TYPES[".mjs"],
        cacheControl: "public, max-age=604800"
      });
      return;
    }

    const flagMatch = url.pathname.match(/^\/vendor\/flags\/(1x1|4x3)\/([a-z]{2})\.svg$/);
    if (flagMatch) {
      const [, ratio, countryCode] = flagMatch;
      await serveFlag(request, response, ratio, countryCode);
      return;
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(publicDir, safePath);

    if (!filePath.startsWith(publicDir)) {
      throw new HttpError(404, "页面不存在");
    }

    try {
      const content = await readFile(filePath);
      const extension = extname(filePath);
      await sendStaticContent(request, response, content, {
        extension,
        contentType: MIME_TYPES[extension] ?? "application/octet-stream",
        cacheControl: staticCacheControl(url.pathname)
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new HttpError(404, "页面不存在");
      }
      throw error;
    }
  }
  return { serveFlag, serveStatic };
}
