import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { LabConfig } from "./config.js";
import type { TrackingRequest, TrackingResult } from "./contracts.js";
import {
  sanitizeRunAttachment,
  sanitizeTraceDataWithRedactions,
  sanitizeTraceText,
  redactSensitiveText,
  type RunEventAttachment,
  type RunEventInput,
  type RunEventOutcome,
  type RunEventRetry,
  type RunEventStage,
  type RunEventType,
  type RunEventUpdate,
  type SafeTraceValue,
} from "./run-events.js";
import { executeTracking, type ExecuteOptions } from "./workflow.js";

export type RunState = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface RunEvent {
  at: string;
  message: string;
  type: RunEventType;
  sequence: number;
  turn?: number;
  decisionSummary?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: SafeTraceValue;
  toolOutput?: SafeTraceValue;
  durationMs?: number;
  outcome?: RunEventOutcome;
  stage?: RunEventStage;
  rationale?: string;
  action?: string;
  observation?: string;
  nextStep?: string;
  retry?: RunEventRetry;
  attachments?: RunEventAttachment[];
  status?: string;
  data?: SafeTraceValue;
}

export interface RunRecord {
  id: string;
  state: RunState;
  request: TrackingRequest;
  createdAt: string;
  updatedAt: string;
  events: RunEvent[];
  result: TrackingResult | null;
  error: string | null;
}

export type TrackingExecutor = (options: ExecuteOptions) => Promise<TrackingResult>;

export class RunQueueFullError extends Error {
  constructor(readonly queueLimit: number) {
    super(`Carrier Agent queue is full (maximum ${queueLimit} waiting tasks)`);
    this.name = "RunQueueFullError";
  }
}

const SAFE_EXECUTOR_FAILURE_CODES = [
  "AGENT_TURN_LIMIT",
  "TOOL_FAILURE",
  "MODEL_TRANSPORT_ERROR",
  "MODEL_NO_FINAL_TOOL_CALL",
  "MODEL_OUTPUT_LIMIT",
  "MODEL_ABORTED",
] as const;

type PublicExecutorFailureCode = typeof SAFE_EXECUTOR_FAILURE_CODES[number] | "EXECUTION_FAILED";

export class RunManager {
  private readonly runs = new Map<string, RunRecord>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly pendingIds: string[] = [];
  private activeCount = 0;

  constructor(
    private readonly config: LabConfig,
    private readonly executor: TrackingExecutor = executeTracking,
  ) {}

  create(request: TrackingRequest): RunRecord {
    if (this.activeCount >= this.config.execution.maxConcurrency
      && this.pendingIds.length >= this.config.execution.queueLimit) {
      throw new RunQueueFullError(this.config.execution.queueLimit);
    }
    const now = new Date().toISOString();
    const record: RunRecord = {
      id: randomUUID(),
      state: "QUEUED",
      request,
      createdAt: now,
      updatedAt: now,
      events: [{
        at: now,
        message: "任务已进入船司 Agent 队列",
        type: "SYSTEM",
        sequence: 1,
        stage: "QUEUE",
        rationale: "任务已通过请求结构校验，调度器已接受该查询。",
        action: "将任务加入受容量限制的先进先出队列。",
        observation: "任务当前处于等待或即将执行状态。",
        nextStep: "获得浏览器执行槽位后开始船司路由和模型准备。",
      }],
      result: null,
      error: null,
    };
    this.runs.set(record.id, record);
    this.pendingIds.push(record.id);
    this.trim();
    this.drain();
    return structuredClone(record);
  }

  get(id: string): RunRecord | null {
    const record = this.runs.get(id);
    return record ? structuredClone(record) : null;
  }

  cancel(id: string): RunRecord | null {
    const record = this.runs.get(id);
    if (!record) return null;
    if (["QUEUED", "RUNNING"].includes(record.state)) {
      this.abortControllers.get(id)?.abort();
      const pendingIndex = this.pendingIds.indexOf(id);
      if (pendingIndex >= 0) this.pendingIds.splice(pendingIndex, 1);
      record.state = "CANCELLED";
      record.updatedAt = new Date().toISOString();
      this.appendEvent(record, {
        type: "SYSTEM",
        message: "任务已取消",
        status: "CANCELLED",
        stage: "COMPLETION",
        rationale: "任务在排队或执行期间收到取消请求。",
        action: "中止模型与浏览器执行并移出等待队列。",
        observation: "任务状态已变更为 CANCELLED。",
        nextStep: "不再执行自动重试；如需查询，应由业务员重新发起任务。",
        retry: { willRetry: false, mode: "NONE" },
      });
    }
    return structuredClone(record);
  }

  stats(): {
    active: number;
    queued: number;
    maxConcurrency: number;
    queueLimit: number;
  } {
    return {
      active: this.activeCount,
      queued: this.pendingIds.length,
      maxConcurrency: this.config.execution.maxConcurrency,
      queueLimit: this.config.execution.queueLimit,
    };
  }

  private drain(): void {
    while (this.activeCount < this.config.execution.maxConcurrency && this.pendingIds.length > 0) {
      const id = this.pendingIds.shift()!;
      const record = this.runs.get(id);
      if (!record || record.state !== "QUEUED") continue;
      this.activeCount += 1;
      void this.start(id).finally(() => {
        this.activeCount -= 1;
        this.drain();
      });
    }
  }

  private async start(id: string): Promise<void> {
    const record = this.runs.get(id);
    if (!record || record.state !== "QUEUED") return;
    const controller = new AbortController();
    this.abortControllers.set(id, controller);
    this.update(id, (current) => {
      current.state = "RUNNING";
      this.appendEvent(current, {
        type: "SYSTEM",
        message: "Agent 开始执行",
        status: "RUNNING",
        stage: "MODEL_SETUP",
        rationale: "调度器已分配一个受限浏览器执行槽位。",
        action: "准备船司路由、视觉模型和真实浏览器会话。",
        observation: "任务状态已变更为 RUNNING。",
        nextStep: "解析船司路由并加载唯一允许的货踪 skill。",
      });
    });
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      const current = this.runs.get(id);
      if (!current || current.state !== "RUNNING") return;
      timedOut = true;
      controller.abort();
      this.update(id, (timedOutRecord) => {
        timedOutRecord.state = "FAILED";
        timedOutRecord.error = `Agent run exceeded ${this.config.execution.runTimeoutMs}ms deadline`;
        this.appendEvent(timedOutRecord, {
          type: "ERROR",
          message: "任务超过最长执行时间，正在安全关闭浏览器",
          status: "TIMEOUT",
          stage: "ERROR",
          rationale: `运行达到 ${this.config.execution.runTimeoutMs} 毫秒安全时限。`,
          action: "中止模型请求并关闭受限浏览器会话。",
          observation: "任务因执行超时失败；未产生新的业务结果。",
          nextStep: "不自动重试整个任务；业务员可检查站点状态后重新发起。",
          retry: { willRetry: false, mode: "NONE", reason: "运行超过安全时限" },
        });
      });
    }, this.config.execution.runTimeoutMs);
    try {
      const result = await this.executor({
        runId: id,
        request: record.request,
        config: this.config,
        signal: controller.signal,
        onEvent: (event) => this.update(id, (current) => {
          if (current.state === "RUNNING" || isTerminalScreenshotEvent(event)) {
            this.appendEvent(current, event);
          }
        }),
      });
      if (controller.signal.aborted || timedOut) return;
      this.update(id, (current) => {
        current.state = "COMPLETED";
        current.result = result;
        this.appendEvent(current, {
          type: "RESULT",
          message: `任务完成：${result.status}`,
          status: result.status,
          data: { containerCount: result.containers.length, evidenceCount: result.evidence.length },
          stage: "COMPLETION",
          rationale: `结构化结果已生成，并包含 ${result.evidence.length} 条证据。`,
          action: "完成标准结果封装并结束浏览器运行。",
          observation: `任务状态为 ${result.status}；箱数量 ${result.containers.length}。`,
          nextStep: "由业务界面展示结构化结果和可审计事件。",
          retry: { willRetry: false, mode: "NONE" },
        });
      });
    } catch (error) {
      const current = this.runs.get(id);
      if (current?.state === "CANCELLED" || timedOut) return;
      this.update(id, (current) => {
        const failure = publicExecutorFailure(error);
        current.state = "FAILED";
        current.error = failure.code;
        this.appendEvent(current, {
          type: "ERROR",
          message: `任务失败：${failure.summary}`,
          status: failure.code,
          stage: "ERROR",
          rationale: `执行器以公开终止类别 ${failure.code} 结束；原始异常文本未进入运行记录。`,
          action: "结束本次模型与浏览器运行。",
          observation: failure.summary,
          nextStep: "本任务不再自动重试；业务员可依据公开错误摘要重新发起。",
          retry: { willRetry: false, mode: "NONE", reason: `终止类别 ${failure.code}` },
        });
      });
    } finally {
      clearTimeout(timeoutHandle);
      this.abortControllers.delete(id);
    }
  }

  private update(id: string, callback: (record: RunRecord) => void): void {
    const record = this.runs.get(id);
    if (!record) return;
    record.updatedAt = new Date().toISOString();
    callback(record);
    if (record.events.length > 100) {
      const removed = record.events.splice(0, record.events.length - 100);
      for (const attachment of removed.flatMap((event) => event.attachments ?? [])) {
        void rm(join(this.config.rootDir, "artifacts", record.id, attachment.artifactId), { force: true })
          .catch(() => undefined);
      }
    }
  }

  private appendEvent(record: RunRecord, update: RunEventUpdate): void {
    const input: RunEventInput = typeof update === "string" ? { message: update } : update;
    const sensitiveValues = [record.request.reference];
    const event: RunEvent = {
      at: record.updatedAt,
      message: redactSensitiveText(input.message, sensitiveValues, 1200),
      type: input.type ?? "SYSTEM",
      sequence: (record.events.at(-1)?.sequence ?? 0) + 1,
    };
    const turn = input.turn;
    if (typeof turn === "number" && Number.isInteger(turn) && turn > 0) event.turn = turn;
    if (input.decisionSummary) {
      event.decisionSummary = redactSensitiveText(input.decisionSummary, sensitiveValues, 360);
    }
    if (input.toolName) event.toolName = sanitizeTraceText(input.toolName, 100);
    if (input.toolCallId) event.toolCallId = sanitizeTraceText(input.toolCallId, 160);
    if (input.toolInput !== undefined) {
      event.toolInput = sanitizeTraceDataWithRedactions(input.toolInput, sensitiveValues);
    }
    if (input.toolOutput !== undefined) {
      event.toolOutput = sanitizeTraceDataWithRedactions(input.toolOutput, sensitiveValues);
    }
    if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
      event.durationMs = Math.min(Math.round(input.durationMs), 24 * 60 * 60 * 1000);
    }
    const outcome = input.outcome;
    if (outcome === "RUNNING" || outcome === "SUCCESS" || outcome === "ERROR") event.outcome = outcome;
    const stage = input.stage;
    if (isRunEventStage(stage)) event.stage = stage;
    if (input.rationale) event.rationale = redactSensitiveText(input.rationale, sensitiveValues, 420);
    if (input.action) event.action = redactSensitiveText(input.action, sensitiveValues, 320);
    if (input.observation) event.observation = redactSensitiveText(input.observation, sensitiveValues, 420);
    if (input.nextStep) event.nextStep = redactSensitiveText(input.nextStep, sensitiveValues, 360);
    if (input.retry) {
      const mode = input.retry.mode;
      if (mode === "NONE" || mode === "AGENT_REASSESS" || mode === "AUTOMATIC") {
        const retry: RunEventRetry = { willRetry: mode !== "NONE" && input.retry.willRetry === true, mode };
        if (Number.isInteger(input.retry.attempt) && input.retry.attempt! > 0) {
          retry.attempt = Math.min(input.retry.attempt!, 100);
        }
        if (Number.isInteger(input.retry.maxAttempts) && input.retry.maxAttempts! > 0) {
          retry.maxAttempts = Math.min(input.retry.maxAttempts!, 100);
        }
        if (input.retry.reason) retry.reason = redactSensitiveText(input.retry.reason, sensitiveValues, 240);
        event.retry = retry;
      }
    }
    if (input.attachments) {
      const attachments = input.attachments
        .slice(0, 8)
        .map((attachment) => sanitizeRunAttachment(attachment))
        .filter((attachment): attachment is RunEventAttachment => attachment !== null);
      if (attachments.length > 0) event.attachments = attachments;
    }
    if (input.status) event.status = sanitizeTraceText(input.status, 80);
    if (input.data !== undefined) event.data = sanitizeTraceDataWithRedactions(input.data, sensitiveValues);
    record.events.push(event);
  }

  private trim(): void {
    if (this.runs.size <= 100) return;
    const removable = [...this.runs.values()]
      .filter((record) => !["QUEUED", "RUNNING"].includes(record.state))
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    for (const record of removable.slice(0, this.runs.size - 100)) {
      this.runs.delete(record.id);
      void rm(join(this.config.rootDir, "artifacts", record.id), { recursive: true, force: true })
        .catch(() => undefined);
    }
  }
}

function publicExecutorFailure(error: unknown): { code: PublicExecutorFailureCode; summary: string } {
  // pi-runner deliberately throws an allowlisted terminal code. Preserve that
  // precision, but never persist arbitrary Error.message text from providers,
  // browsers, extensions, or custom executors.
  const candidate = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code: PublicExecutorFailureCode = (SAFE_EXECUTOR_FAILURE_CODES as readonly string[]).includes(candidate)
    ? candidate as typeof SAFE_EXECUTOR_FAILURE_CODES[number]
    : "EXECUTION_FAILED";
  const summary = ({
    AGENT_TURN_LIMIT: "Agent 已达到安全轮数上限",
    TOOL_FAILURE: "浏览器工具失败，未生成最终结构化结果",
    MODEL_TRANSPORT_ERROR: "模型请求未成功完成",
    MODEL_NO_FINAL_TOOL_CALL: "Agent 未提交可验证的最终结构化结果",
    MODEL_OUTPUT_LIMIT: "模型输出达到安全长度上限",
    MODEL_ABORTED: "模型运行已安全中止",
    EXECUTION_FAILED: "任务执行失败，原始异常详情已隐藏",
  } as Record<PublicExecutorFailureCode, string>)[code];
  return { code, summary };
}

function isRunEventStage(value: unknown): value is RunEventStage {
  return typeof value === "string" && [
    "QUEUE",
    "ROUTING",
    "MODEL_SETUP",
    "MODEL_ANALYSIS",
    "NAVIGATION",
    "PAGE_INSPECTION",
    "VISUAL_INSPECTION",
    "FORM_INTERACTION",
    "RESULT_VALIDATION",
    "RETRY",
    "COMPLETION",
    "ERROR",
  ].includes(value);
}

function isTerminalScreenshotEvent(event: RunEventUpdate): boolean {
  return typeof event !== "string"
    && event.toolName === "browser_screenshot"
    && event.toolCallId === "run-final-screenshot";
}
