import { safeProxyNodeAlias } from "./cosco-proxy-pool.mjs";
import { HttpError } from "./http-utils.mjs";

/** COSCO 代理诊断与结果装饰（纯函数）。从 server.mjs 下沉。 */

export function uniqueSafeProxyNodes(nodes = []) {
  return [...new Set((Array.isArray(nodes) ? nodes : []).map(safeProxyNodeAlias).filter(Boolean))];
}

function safeDiagnosticText(value, maximumLength) {
  const normalized = String(value ?? "")
    // 有意匹配控制字符：诊断文本需要把它们替换为空格。
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maximumLength);
}

export function safeSupplementalWarnings(...warningGroups) {
  const warnings = [];
  const seen = new Set();
  for (const group of warningGroups) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      if (!raw || typeof raw !== "object" || warnings.length >= 10) continue;
      const source = safeDiagnosticText(raw.source, 40);
      const code = safeDiagnosticText(raw.code, 120);
      const message = safeDiagnosticText(raw.message, 500);
      const route = safeDiagnosticText(raw.route, 80);
      const proxyNode = safeProxyNodeAlias(raw.proxyNode);
      const causeCode = safeDiagnosticText(raw.causeCode, 120);
      const attempts = Math.max(0, Number(raw.proxyAttempts ?? raw.attempts) || 0);
      const triedNodes = uniqueSafeProxyNodes(raw.triedNodes);
      const retryAfterMs = Math.max(0, Number(raw.retryAfterMs) || 0) || null;
      const fingerprint = [source, code, message, route, proxyNode].join("|");
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      warnings.push({
        source,
        code,
        message,
        causeCode,
        route,
        proxyNode,
        attempts,
        triedNodes,
        retryAfterMs
      });
    }
  }
  return warnings;
}

export function proxyAttemptDiagnostics(proxyNode, proxyAttempts, triedNodes = []) {
  const attemptedNodes = uniqueSafeProxyNodes(triedNodes);
  const safeNode = safeProxyNodeAlias(proxyNode) ?? attemptedNodes.at(-1) ?? null;
  const nodes = uniqueSafeProxyNodes([...attemptedNodes, safeNode]);
  return {
    proxyNode: safeNode,
    proxyAttempts: Math.max(0, Number(proxyAttempts) || 0),
    triedNodes: nodes
  };
}

export function decorateProxySuccess(result, diagnostics, budget = null) {
  if (!result || typeof result !== "object") return result;
  const existingStrategy =
    result.strategy && typeof result.strategy === "object" ? result.strategy : {};
  const safeDiagnostics = proxyAttemptDiagnostics(
    diagnostics?.proxyNode,
    diagnostics?.proxyAttempts,
    diagnostics?.triedNodes
  );
  return {
    ...result,
    strategy: {
      ...existingStrategy,
      used: existingStrategy.used ?? "PROXY",
      ...safeDiagnostics,
      ...(budget?.budgetDeferred ? { proxyBudgetDeferred: true } : {})
    }
  };
}

export function decorateProxyFailure(error, diagnostics) {
  if (!error || typeof error !== "object") return error;
  const details = error.details && typeof error.details === "object" ? error.details : {};
  error.details = { ...details, ...diagnostics };
  return error;
}

export function proxyPoolExhaustedError(error, attempts, triedNodes = [], proxyNode = null) {
  const upstreamDetails = error?.details && typeof error.details === "object" ? error.details : {};
  const causeCode = upstreamDetails.code ?? error?.code ?? `HTTP_${error?.status ?? 503}`;
  const diagnostics = proxyAttemptDiagnostics(proxyNode ?? upstreamDetails.proxyNode, attempts, [
    ...triedNodes,
    ...(Array.isArray(upstreamDetails.triedNodes) ? upstreamDetails.triedNodes : [])
  ]);
  const nodes = diagnostics.triedNodes;
  const nodeSummary = nodes.length > 0 ? `；节点：${nodes.join(" → ")}` : "";
  return new HttpError(
    Number.isInteger(error?.status) ? error.status : 503,
    `${error?.message ?? "COSCO proxy request failed"}；代理池已尝试 ${attempts} 个出口节点${nodeSummary}；原因代码：${causeCode}`,
    {
      ...upstreamDetails,
      code: "COSCO_PROXY_POOL_EXHAUSTED",
      causeCode,
      attempts,
      ...diagnostics
    }
  );
}
