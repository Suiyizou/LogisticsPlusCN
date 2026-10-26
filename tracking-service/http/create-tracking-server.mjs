import { createServer } from "node:http";
import { listCarrierAdapters, listCoscoQueryChannels } from "../lib/carrier-adapters.mjs";
import { HttpError, readJsonBody, sendJson } from "../lib/http-utils.mjs";
const TRACK_ROUTES = new Map([
  ["/api/track", []],
  ["/api/track/cosco", ["COSCO", "NETWORK"]],
  ["/api/track/cosco/network", ["COSCO", "NETWORK"]],
  ["/api/track/cosco/playwright", ["COSCO", "PLAYWRIGHT"]],
  ["/api/track/cma", ["CMA", "PLAYWRIGHT"]]
]);
/** A server can be constructed with fake adapters for HTTP tests; importing this module never starts a monitor. */
export function createTrackingServer({ controller, cosco, staticRouter, onClose = () => {} }) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;
      if (request.method === "GET") {
        const adapterHealth = path.match(/^\/api\/carriers\/([A-Za-z0-9_-]+)\/health$/);
        if (adapterHealth && controller.adapters) {
          sendJson(response, 200, await controller.adapters.health(adapterHealth[1]));
          return;
        }
        if (path === "/api/health") {
          sendJson(response, 200, cosco.getHealth());
          return;
        }
        if (["/api/channels/c/status", "/api/channels/network/status"].includes(path)) {
          sendJson(response, 200, cosco.getChannelCHealthStatus());
          return;
        }
        if (path === "/api/channels") {
          sendJson(response, 200, { channels: listCoscoQueryChannels() });
          return;
        }
        if (path === "/api/carriers") {
          sendJson(response, 200, {
            carriers: controller.adapters?.list() || listCarrierAdapters()
          });
          return;
        }
        const flag = path.match(/^\/api\/flags\/(1x1|4x3)\/([a-z]{2})$/);
        if (flag) {
          await staticRouter.serveFlag(request, response, flag[1], flag[2]);
          return;
        }
      }
      if (request.method === "POST") {
        const cancel = path.match(/^\/api\/batch-tasks\/([^/]+)\/cancel$/);
        if (cancel) {
          sendJson(response, 202, controller.cancelBatch(decodeURIComponent(cancel[1])));
          return;
        }
        if (path === "/api/channels/check") {
          sendJson(response, 200, await cosco.runCoscoChannelChecks(await readJsonBody(request)));
          return;
        }
        if (TRACK_ROUTES.has(path)) {
          await controller.handleTrackRequest(request, response, ...TRACK_ROUTES.get(path));
          return;
        }
        if (path === "/api/track/cosco/container-list") {
          await controller.handleCoscoContainerListRequest(request, response);
          return;
        }
        if (path === "/api/track/cosco/supplemental-details") {
          await controller.handleCoscoSupplementalDetailsRequest(request, response);
          return;
        }
      }
      if (request.method === "GET" || request.method === "HEAD") {
        await staticRouter.serveStatic(request, response);
        return;
      }
      throw new HttpError(405, "不支持的请求方法");
    } catch (error) {
      sendTrackingError(response, error);
    }
  });
  server.once("close", onClose);
  return server;
}
function sendTrackingError(response, error) {
  const status =
    error instanceof HttpError
      ? error.status
      : Number.isInteger(error?.httpStatus)
        ? error.httpStatus
        : 500;
  const details =
    error instanceof HttpError
      ? error.details
      : error?.code || error?.retryAfterMs
        ? {
            code: error?.code ?? undefined,
            retryAfterMs: error?.retryAfterMs ?? undefined
          }
        : undefined;
  if ([429, 503].includes(status)) {
    const retryAfterMs = Number(details?.retryAfterMs);
    response.setHeader(
      "Retry-After",
      String(Number.isFinite(retryAfterMs) ? Math.max(1, Math.ceil(retryAfterMs / 1_000)) : 5)
    );
  }
  sendJson(response, status, {
    error: {
      message: error?.message || "服务器内部错误",
      details
    }
  });
}
