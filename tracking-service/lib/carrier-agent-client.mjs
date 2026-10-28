import { setTimeout as delay } from "node:timers/promises";
import { trackingFailure } from "./multi-carrier-catalog.mjs";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reuse the existing bounded Agent queue, never start a second browser/model stack. */
export function createCarrierAgentClient({
  baseUrl = process.env.CARRIER_AGENT_BASE_URL || "http://127.0.0.1:4317",
  timeoutMs = Number(process.env.CARRIER_AGENT_TIMEOUT_MS || 450000),
  pollIntervalMs = 1000,
  fetchImpl = fetch,
  sleep = delay
} = {}) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash)
    throw new Error("Invalid internal carrier Agent URL");
  const root = base.href.replace(/\/$/, "");
  const budget = Math.min(480000, Math.max(1000, timeoutMs || 450000));

  async function request(path, { signal, method = "GET", body } = {}) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method, signal, redirect: "error",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw trackingFailure(503, "TRACKING_AGENT_UNAVAILABLE", "货踪 Agent 服务不可用，请检查内部服务连接");
    }
    // Do not propagate raw Agent transport/model errors or credential-bearing bodies.
    if (!response.ok) {
      throw trackingFailure(response.status === 429 ? 429 : 503,
        response.status === 429 ? "TRACKING_AGENT_BUSY" : "TRACKING_AGENT_UNAVAILABLE",
        response.status === 429 ? "货踪 Agent 队列已满，请稍后重试" : "货踪 Agent 请求失败");
    }
    const text = await boundedText(response, 4 * 1024 * 1024);
    try { return JSON.parse(text); }
    catch { throw trackingFailure(502, "TRACKING_AGENT_INVALID_RESULT", "货踪 Agent 返回了无效数据"); }
  }

  return {
    async track(carrier, tracking, { signal } = {}) {
      const deadline = AbortSignal.timeout(budget);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let id;
      let completed = false;
      try {
        combined.throwIfAborted();
        let run = await request("/api/runs", {
          method: "POST", signal: combined,
          body: {
            carrier, reference: tracking.number,
            referenceType: tracking.type === "BILLOFLADING" ? "BILL_OF_LADING" : tracking.type,
            headed: false
          }
        });
        id = run.id;
        if (!RUN_ID.test(id ?? ""))
          throw trackingFailure(502, "TRACKING_AGENT_INVALID_RESULT", "货踪 Agent 未返回有效任务编号");
        for (;;) {
          combined.throwIfAborted();
          if (run.id !== id)
            throw trackingFailure(502, "TRACKING_AGENT_INVALID_RESULT", "货踪 Agent 任务编号不匹配");
          if (run.state === "COMPLETED") {
            completed = true;
            if (run.result?.status !== "FOUND") {
              const pageFailure = observedPageFailure(run, carrier);
              if (pageFailure) throw pageFailure;
            }
            return run.result;
          }
          if (["FAILED", "CANCELLED"].includes(run.state))
            throw observedPageFailure(run, carrier) ?? trackingFailure(502, "TRACKING_AGENT_FAILED", "货踪 Agent 未能完成本次查询，请稍后重试或到船司官网核验");
          if (!["QUEUED", "RUNNING"].includes(run.state))
            throw trackingFailure(502, "TRACKING_AGENT_INVALID_RESULT", "货踪 Agent 返回未知任务状态");
          await sleep(pollIntervalMs, undefined, { signal: combined });
          combined.throwIfAborted();
          run = await request(`/api/runs/${id}`, { signal: combined });
        }
      } catch (error) {
        if (signal?.aborted) throw trackingFailure(409, "BATCH_CANCELLED", "货踪查询已取消");
        if (deadline.aborted) throw trackingFailure(504, "TRACKING_AGENT_TIMEOUT", "货踪 Agent 查询超时，任务已取消，可稍后重试");
        throw error;
      } finally {
        if (id && RUN_ID.test(id) && !completed) {
          try { await request(`/api/runs/${id}`, { method: "DELETE", signal: AbortSignal.timeout(3000) }); }
          catch { /* bounded best-effort cancellation, never hide the original outcome */ }
        }
      }
    }
  };
}

/** Use deterministic browser-tool observations, never model prose, to classify blockers. */
function observedPageFailure(run, carrier) {
  const observation = [...(Array.isArray(run.events) ? run.events : [])].reverse().find(
    (event) => ["browser_open", "browser_snapshot"].includes(event.toolName)
      && event.outcome === "SUCCESS" && event.toolOutput?.success === true
  )?.toolOutput;
  if (["SECURITY_CHECK", "ACCESS_DENIED"].includes(observation?.blockingReason))
    return trackingFailure(409, "TRACKING_HUMAN_REQUIRED", "船司页面要求人工验证，未将其误记为无货", { carrier, pageState: observation.blockingReason });
  if (["REQUEST_REJECTED", "EMPTY_PAGE"].includes(observation?.blockingReason))
    return trackingFailure(503, "TRACKING_PAGE_UNAVAILABLE", "船司查询页未正常加载，原票单快照保持不变", { carrier, pageState: observation.blockingReason });
  return null;
}

export async function boundedText(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) throw trackingFailure(502, "UPSTREAM_TOO_LARGE", "货踪响应超过大小限制");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw trackingFailure(502, "UPSTREAM_TOO_LARGE", "货踪响应超过大小限制");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
