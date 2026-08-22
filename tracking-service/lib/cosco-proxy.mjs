import { ProxyAgent } from "undici";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";

const SUPPORTED_PROXY_PROTOCOLS = new Set(["http:", "https:", "socks5:", "socks5h:"]);

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function readCoscoProxyConfig(environment = process.env) {
  if (!enabled(environment.COSCO_PROXY_ENABLED)) return null;

  const rawServer = String(environment.COSCO_PROXY_SERVER ?? "").trim();
  if (!rawServer) {
    throw new Error("COSCO_PROXY_SERVER is required when COSCO_PROXY_ENABLED=true");
  }

  const serverUrl = new URL(rawServer.includes("://") ? rawServer : `http://${rawServer}`);
  if (!SUPPORTED_PROXY_PROTOCOLS.has(serverUrl.protocol)) {
    throw new Error("COSCO proxy must use http://, https://, socks5:// or socks5h://");
  }
  if (serverUrl.username || serverUrl.password) {
    throw new Error("Put COSCO proxy credentials in COSCO_PROXY_USERNAME/PASSWORD, not in the URL");
  }

  const username = String(environment.COSCO_PROXY_USERNAME ?? "");
  const password = String(environment.COSCO_PROXY_PASSWORD ?? "");
  return Object.freeze({
    server: serverUrl.toString(),
    username,
    password
  });
}

export function createCoscoProxyDispatcher(config) {
  if (!config) return null;
  if (new URL(config.server).protocol.startsWith("socks")) return null;
  const token = config.username || config.password
    ? `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`
    : undefined;
  return new ProxyAgent({
    uri: config.server,
    ...(token ? { token } : {})
  });
}

function socksProxyUrl(config) {
  const value = new URL(config.server);
  value.username = config.username;
  value.password = config.password;
  return value;
}

function fetchWithSocksProxy(agent, url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(target, {
      method: options.method ?? "GET",
      headers: options.headers,
      agent,
      signal: options.signal
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => {
        const rawHeaders = new Map();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          const name = String(response.rawHeaders[index] ?? "").toLowerCase();
          const value = String(response.rawHeaders[index + 1] ?? "");
          const values = rawHeaders.get(name) ?? [];
          values.push(value);
          rawHeaders.set(name, values);
        }
        const headers = {
          get(name) {
            const values = rawHeaders.get(String(name ?? "").toLowerCase());
            return values?.length ? values.join(", ") : null;
          },
          getSetCookie() {
            return [...(rawHeaders.get("set-cookie") ?? [])];
          }
        };
        const body = Buffer.concat(chunks);
        const status = Number(response.statusCode) || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers,
          url: target.toString(),
          async text() {
            return body.toString("utf8");
          }
        });
      });
    });
    request.on("error", reject);
    if (options.body != null) request.write(options.body);
    request.end();
  });
}

export function createCoscoProxyClient(config) {
  if (!config) return null;
  const protocol = new URL(config.server).protocol;
  if (protocol.startsWith("socks")) {
    const agent = new SocksProxyAgent(socksProxyUrl(config));
    return Object.freeze({
      protocol,
      fetch: (url, options) => fetchWithSocksProxy(agent, url, options),
      close: async () => agent.destroy()
    });
  }
  const dispatcher = createCoscoProxyDispatcher(config);
  return Object.freeze({
    protocol,
    fetch: (url, options = {}) => fetch(url, { ...options, dispatcher }),
    close: async () => dispatcher.close()
  });
}

export function proxyStatus(config) {
  if (!config) return { enabled: false, server: null, authenticated: false };
  const url = new URL(config.server);
  return {
    enabled: true,
    server: `${url.protocol}//${url.host}`,
    authenticated: Boolean(config.username || config.password)
  };
}
