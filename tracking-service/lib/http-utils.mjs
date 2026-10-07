import { timingSafeEqual } from "node:crypto";

/**
 * 追踪服务的 HTTP 基础工具：错误类型、安全响应头、JSON 读写、常量时间比较。
 * 从 server.mjs 下沉，入口只负责组装。
 */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function secureTextEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function setCommonHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
}

export function sendJson(response, status, payload) {
  setCommonHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

export async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      throw new HttpError(413, "请求内容过大");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "请求内容不是有效的 JSON");
  }
}
