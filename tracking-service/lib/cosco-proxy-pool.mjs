const DEFAULT_GROUP = "TRACKING-POOL";
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_NODE_COOLDOWN_MS = 30 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const EXCLUDED_NODE_PATTERN = /下载专用|免费|流量|套餐|官网|到期/i;

const REGION_PRIORITY = [
  /香港|hong\s*kong|\bhk\b/i,
  /台湾|taiwan|台北|\btw\b/i,
  /日本|japan|东京|大阪|\bjp\b/i,
  /韩国|korea|首尔|\bkr\b/i,
  /新加坡|singapore|\bsg\b/i,
  /美国|united\s*states|洛杉矶|西雅图|圣何塞|\bus\b/i
];

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function controllerUrl(value) {
  const url = new URL(String(value ?? "").trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("COSCO proxy pool controller must use http:// or https://");
  }
  if (url.username || url.password) {
    throw new Error("Put the Mihomo controller secret in COSCO_PROXY_POOL_SECRET, not in the URL");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function readCoscoProxyPoolConfig(environment = process.env) {
  const rawController = String(environment.COSCO_PROXY_POOL_CONTROLLER ?? "").trim();
  if (!rawController) return null;
  return Object.freeze({
    controller: controllerUrl(rawController).toString().replace(/\/$/, ""),
    group: String(environment.COSCO_PROXY_POOL_GROUP ?? DEFAULT_GROUP).trim() || DEFAULT_GROUP,
    secret: String(environment.COSCO_PROXY_POOL_SECRET ?? ""),
    timeoutMs: integer(
      environment.COSCO_PROXY_POOL_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      500,
      30_000
    ),
    nodeCooldownMs: integer(
      environment.COSCO_PROXY_POOL_NODE_COOLDOWN_MS,
      DEFAULT_NODE_COOLDOWN_MS,
      10_000,
      24 * 60 * 60_000
    ),
    maxAttemptsPerShipment: integer(
      environment.COSCO_PROXY_POOL_MAX_ATTEMPTS_PER_SHIPMENT
        ?? environment.COSCO_PROXY_POOL_MAX_ROTATIONS_PER_REQUEST,
      DEFAULT_MAX_ATTEMPTS,
      1,
      6
    )
  });
}

function regionRank(name) {
  const index = REGION_PRIORITY.findIndex((pattern) => pattern.test(name));
  return index < 0 ? REGION_PRIORITY.length : index;
}

export function prioritizeProxyNodes(names = []) {
  return [...new Set(names.map((name) => String(name ?? "").trim()).filter(Boolean))]
    .filter((name) => !EXCLUDED_NODE_PATTERN.test(name))
    .sort((left, right) => {
      const regionDifference = regionRank(left) - regionRank(right);
      return regionDifference || left.localeCompare(right, "zh-CN", { numeric: true });
    });
}

export async function runWithProxyPoolRetries(options, operation) {
  const maximumAttempts = integer(options?.maximumAttempts, 1, 1, 6);
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await operation({ attempt, maximumAttempts });
    } catch (error) {
      if (!options?.shouldRetry?.(error)) throw error;
      if (attempt >= maximumAttempts) {
        throw options?.exhaustedError?.(error, attempt) ?? error;
      }
      const rotation = await options.rotate(error, attempt);
      if (!rotation?.rotated) {
        throw options?.exhaustedError?.(error, attempt) ?? error;
      }
      await options?.onRotated?.(rotation, attempt, maximumAttempts);
    }
  }
  throw new Error("Proxy retry loop ended unexpectedly");
}

export function createCoscoProxyPool(config, options = {}) {
  if (!config) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const blockedUntil = new Map();
  let rotationPromise = null;

  async function controllerRequest(path, requestOptions = {}) {
    const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
    const response = await fetchImpl(`${config.controller}${path}`, {
      ...requestOptions,
      signal: timeoutSignal,
      headers: {
        Accept: "application/json",
        ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
        ...(config.secret ? { Authorization: `Bearer ${config.secret}` } : {}),
        ...(requestOptions.headers ?? {})
      }
    });
    if (!response.ok) {
      throw new Error(`Mihomo controller returned HTTP ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function groupStatus() {
    const value = await controllerRequest(`/proxies/${encodeURIComponent(config.group)}`);
    return {
      current: String(value?.now ?? "").trim(),
      candidates: prioritizeProxyNodes(Array.isArray(value?.all) ? value.all : [])
    };
  }

  async function rotateNow(reason = "upstream-protection") {
    const status = await groupStatus();
    if (status.current) {
      blockedUntil.set(status.current, Date.now() + config.nodeCooldownMs);
    }
    const available = status.candidates.filter((name) => {
      if (name === status.current) return false;
      return (blockedUntil.get(name) ?? 0) <= Date.now();
    });
    const target = available[0];
    if (!target) {
      return Object.freeze({
        rotated: false,
        reason,
        current: status.current || null,
        candidateCount: status.candidates.length
      });
    }
    await controllerRequest(`/proxies/${encodeURIComponent(config.group)}`, {
      method: "PUT",
      body: JSON.stringify({ name: target })
    });
    return Object.freeze({
      rotated: true,
      reason,
      previous: status.current || null,
      current: target,
      candidateCount: status.candidates.length
    });
  }

  return Object.freeze({
    maxAttemptsPerShipment: config.maxAttemptsPerShipment,
    status: () => ({
      enabled: true,
      controller: new URL(config.controller).host,
      group: config.group,
      maxAttemptsPerShipment: config.maxAttemptsPerShipment
    }),
    async rotate(reason) {
      if (!rotationPromise) {
        rotationPromise = rotateNow(reason).finally(() => {
          rotationPromise = null;
        });
      }
      return rotationPromise;
    }
  });
}
