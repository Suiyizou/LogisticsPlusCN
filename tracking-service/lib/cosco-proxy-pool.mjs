import { createHash } from "node:crypto";

const DEFAULT_GROUP = "TRACKING-POOL";
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_NODE_COOLDOWN_MS = 30 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_REQUESTS_PER_NODE = 12;
const MAX_PUBLIC_NODE_LENGTH = 80;
const EXCLUDED_NODE_PATTERN = /下载专用|免费|流量|套餐|官网|到期/i;

const REGION_PRIORITY = [
  /香港|hong\s*kong|\bhk\b/i,
  /台湾|taiwan|台北|\btw\b/i,
  /日本|japan|东京|大阪|\bjp\b/i,
  /韩国|korea|首尔|\bkr\b/i,
  /新加坡|singapore|\bsg\b/i,
  /美国|united\s*states|洛杉矶|西雅图|圣何塞|\bus\b/i
];

const SENSITIVE_NODE_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/)|(?:[^\s:@/]+:[^\s@/]+@)|(?:password|passwd|secret|token|api[-_]?key)\s*[:=]/i;

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
    ),
    maxRequestsPerNode: integer(
      environment.COSCO_PROXY_POOL_MAX_REQUESTS_PER_NODE
        ?? environment.COSCO_PROXY_POOL_REQUEST_BUDGET,
      DEFAULT_MAX_REQUESTS_PER_NODE,
      1,
      1_000
    )
  });
}

function opaqueNodeAlias(value) {
  const digest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 10);
  return `proxy-${digest}`;
}

export function safeProxyNodeAlias(value) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (SENSITIVE_NODE_PATTERN.test(normalized)) return opaqueNodeAlias(normalized);
  return normalized.slice(0, MAX_PUBLIC_NODE_LENGTH);
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
  const now = options.now ?? Date.now;
  const blockedUntil = new Map();
  const requestsByNode = new Map();
  let rotationPromise = null;
  let preparationTail = Promise.resolve();
  let lastKnownCurrent = null;

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
    const status = {
      current: String(value?.now ?? "").trim(),
      candidates: prioritizeProxyNodes(Array.isArray(value?.all) ? value.all : [])
    };
    lastKnownCurrent = status.current || lastKnownCurrent;
    return status;
  }

  function isCoolingDown(name) {
    const until = blockedUntil.get(name) ?? 0;
    if (until <= now()) {
      if (until > 0) {
        blockedUntil.delete(name);
        requestsByNode.delete(name);
      }
      return false;
    }
    return true;
  }

  function coolDown(name) {
    if (!name) return;
    const existing = blockedUntil.get(name) ?? 0;
    if (existing <= now()) blockedUntil.set(name, now() + config.nodeCooldownMs);
  }

  function availableCandidates(status) {
    return status.candidates.filter((name) => {
      if (name === status.current) return false;
      return !isCoolingDown(name);
    });
  }

  async function selectNode(name) {
    await controllerRequest(`/proxies/${encodeURIComponent(config.group)}`, {
      method: "PUT",
      body: JSON.stringify({ name })
    });
    lastKnownCurrent = name;
  }

  async function rotateNow(reason = "upstream-protection") {
    const status = await groupStatus();
    coolDown(status.current);
    const available = availableCandidates(status);
    const target = available[0];
    if (!target) {
      return Object.freeze({
        rotated: false,
        reason,
        current: safeProxyNodeAlias(status.current),
        candidateCount: status.candidates.length
      });
    }
    await selectNode(target);
    return Object.freeze({
      rotated: true,
      reason,
      previous: safeProxyNodeAlias(status.current),
      current: safeProxyNodeAlias(target),
      candidateCount: status.candidates.length
    });
  }

  async function prepareAttemptNow() {
    const status = await groupStatus();
    let current = status.current;
    let previous = null;
    let rotated = false;
    let budgetDeferred = false;

    if (current) isCoolingDown(current);
    const currentCount = current ? (requestsByNode.get(current) ?? 0) : 0;
    if (current && currentCount >= config.maxRequestsPerNode) {
      coolDown(current);
      const target = availableCandidates(status)[0];
      if (target) {
        previous = current;
        await selectNode(target);
        current = target;
        rotated = true;
      } else {
        budgetDeferred = true;
      }
    }

    const requestCount = current ? (requestsByNode.get(current) ?? 0) + 1 : 0;
    if (current) requestsByNode.set(current, requestCount);
    return Object.freeze({
      rotated,
      reason: rotated ? "REQUEST_BUDGET" : null,
      previous: safeProxyNodeAlias(previous),
      current: safeProxyNodeAlias(current),
      requestCount,
      requestBudget: config.maxRequestsPerNode,
      budgetDeferred,
      candidateCount: status.candidates.length
    });
  }

  function prepareAttempt() {
    const pending = preparationTail.then(prepareAttemptNow, prepareAttemptNow);
    preparationTail = pending.catch(() => undefined);
    return pending;
  }

  return Object.freeze({
    maxAttemptsPerShipment: config.maxAttemptsPerShipment,
    status: () => ({
      enabled: true,
      controller: new URL(config.controller).host,
      group: config.group,
      currentNode: safeProxyNodeAlias(lastKnownCurrent),
      maxAttemptsPerShipment: config.maxAttemptsPerShipment,
      maxRequestsPerNode: config.maxRequestsPerNode
    }),
    prepareAttempt,
    async currentNode() {
      const status = await groupStatus();
      return safeProxyNodeAlias(status.current);
    },
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
