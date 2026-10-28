import { once } from "node:events";
import {
  createServer,
  request as forwardHttpRequest,
  type ClientRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { resolveNavigableUrl, type NavigationPolicyOptions } from "./navigation-policy.js";

/**
 * Browser-only proxy that pins each validated DNS answer to the socket it opens.
 * This closes the DNS-rebinding gap between application validation and Chromium.
 */
export class SafeNetworkProxy {
  private server: Server | null = null;
  private port = 0;
  private readonly clients = new Set<Duplex>();
  private readonly upstreams = new Set<Socket>();

  constructor(
    private readonly options: NavigationPolicyOptions,
    private readonly resolveUrl: typeof resolveNavigableUrl = resolveNavigableUrl,
  ) {}

  async listen(): Promise<string> {
    if (this.server) return `http://127.0.0.1:${this.port}`;
    const server = createServer((request, response) => {
      void this.forwardHttp(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
    });
    server.on("connect", (request, client, head) => {
      void this.forwardConnect(request, client, head);
    });
    server.on("connection", (socket) => {
      this.clients.add(socket);
      socket.once("close", () => this.clients.delete(socket));
    });
    server.on("clientError", (_error, socket) => socket.destroy());
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Safe browser proxy failed to bind");
    }
    this.server = server;
    this.port = address.port;
    return `http://127.0.0.1:${this.port}`;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (!server) return;
    for (const socket of this.clients) socket.destroy();
    for (const socket of this.upstreams) socket.destroy();
    this.clients.clear();
    this.upstreams.clear();
    server.closeAllConnections();
    server.close();
    await Promise.race([
      once(server, "close").catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }

  private async forwardConnect(request: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    let upstream: Socket | null = null;
    // A CONNECT socket becomes application-owned as soon as Node emits the
    // event. Chromium may abandon speculative tunnels while DNS validation is
    // still in flight, so install the error/close handlers before the first
    // await. Otherwise an ECONNRESET in that window is an unhandled event and
    // terminates the whole agent process.
    client.on("error", () => {
      upstream?.destroy();
      client.destroy();
    });
    client.once("close", () => upstream?.destroy());
    try {
      const authority = new URL(`https://${request.url ?? ""}`);
      const resolved = await withTimeout(this.resolveUrl(authority.href, {
        ...this.options, mode: "public-https",
      }), 10_000, "Browser proxy DNS validation timed out");
      if (client.destroyed) return;
      upstream = connect({
        host: resolved.address,
        port: Number(authority.port || 443),
        family: resolved.family,
      });
      upstream.on("error", () => client.destroy());
      upstream.once("close", () => {
        this.upstreams.delete(upstream!);
        client.destroy();
      });
      this.upstreams.add(upstream);
      upstream.setTimeout(10_000, () => upstream?.destroy(new Error("Browser proxy connection timed out")));
      await once(upstream, "connect");
      upstream.setTimeout(0);
      if (client.destroyed) {
        upstream.destroy();
        return;
      }
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    } catch {
      upstream?.destroy();
      if (!client.destroyed) {
        client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      }
    }
  }

  private async forwardHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const resolved = await withTimeout(this.resolveUrl(request.url ?? "", {
      ...this.options, mode: "public-https",
    }), 10_000, "Browser proxy DNS validation timed out");
    if (resolved.url.protocol !== "http:") {
      response.writeHead(400);
      response.end();
      return;
    }
    const upstream: ClientRequest = forwardHttpRequest({
      hostname: resolved.address,
      family: resolved.family,
      port: Number(resolved.url.port || 80),
      method: request.method,
      path: `${resolved.url.pathname}${resolved.url.search}`,
      headers: { ...request.headers, host: resolved.url.host },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.setTimeout(10_000, () => upstream.destroy(new Error("Browser proxy request timed out")));
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  }
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (handle) clearTimeout(handle);
  });
}
