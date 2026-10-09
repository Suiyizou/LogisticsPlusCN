import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { HttpError } from "./http-utils.mjs";
import { MIME_TYPES, sendStaticContent, staticCacheControl } from "./static-assets.mjs";

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
