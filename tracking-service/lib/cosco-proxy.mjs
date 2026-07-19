import { ProxyAgent } from "undici";

const SUPPORTED_PROXY_PROTOCOLS = new Set(["http:", "https:"]);

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
    throw new Error("COSCO proxy must use http:// or https:// so both query channels share it");
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
  const token = config.username || config.password
    ? `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`
    : undefined;
  return new ProxyAgent({
    uri: config.server,
    ...(token ? { token } : {})
  });
}

export function toPlaywrightProxy(config) {
  if (!config) return null;
  return {
    server: config.server,
    ...(config.username ? { username: config.username } : {}),
    ...(config.password ? { password: config.password } : {})
  };
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
