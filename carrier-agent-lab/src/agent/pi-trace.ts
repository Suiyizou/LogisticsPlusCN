import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  sanitizeTraceText,
  summarizeToolCall,
  summarizeToolResult,
  toolResultAttachments,
  type PublicToolErrorCategory as SanitizedToolErrorCategory,
  type RunEventSink,
  type RunEventStage,
  type SafeTraceValue,
} from "../run-events.js";

export type PublicAssistantStopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";
export type PublicModelErrorCategory = "NONE" | "RATE_LIMIT" | "TIMEOUT" | "AUTH" | "NETWORK" | "ABORTED" | "OUTPUT_LIMIT" | "TRANSPORT";
export type PublicToolErrorCategory = SanitizedToolErrorCategory;
export type AgentTerminalFailureCode =
  | "AGENT_TURN_LIMIT"
  | "TOOL_FAILURE"
  | "MODEL_TRANSPORT_ERROR"
  | "MODEL_NO_FINAL_TOOL_CALL"
  | "MODEL_OUTPUT_LIMIT"
  | "MODEL_ABORTED";

const MODEL_PROGRESS_INTERVAL_MS = 12_000;

export interface PiTraceState {
  turnNumber: number;
  toolStartedAt?: Map<string, number>;
  sensitiveValues?: readonly string[];
  now?: () => number;
  modelProgressTimer?: ReturnType<typeof setInterval>;
  scheduleModelProgress?: (
    callback: () => void,
    intervalMs: number,
  ) => ReturnType<typeof setInterval>;
  cancelModelProgress?: (timer: ReturnType<typeof setInterval>) => void;
  lastObservation?: string;
  autoRetryEnabled?: boolean;
  lastAssistantStopReason?: PublicAssistantStopReason;
  lastAssistantErrorCategory?: PublicModelErrorCategory;
  lastAutoRetryFailed?: boolean;
  turnLimitExceeded?: boolean;
  submissionValidationFailures?: number;
  submissionValidationExhausted?: boolean;
  lastToolFailure?: {
    toolName: string;
    errorCategory: PublicToolErrorCategory;
  };
}

export function emitPiTraceEvent(
  event: AgentSessionEvent,
  state: PiTraceState,
  onEvent: RunEventSink,
): void {
  switch (event.type) {
    case "turn_start":
      state.turnNumber += 1;
      onEvent({
        type: "MODEL",
        message: `Agent 第 ${state.turnNumber} 轮 · 正在评估下一项操作`,
        status: "ANALYZING",
        outcome: "RUNNING",
        turn: state.turnNumber,
        decisionSummary: "正在依据当前可见页面证据选择下一项受限操作。",
        stage: "MODEL_ANALYSIS",
        rationale: state.lastObservation ?? "船司路由已完成，Agent 已进入受限浏览器执行阶段。",
        action: "评估上一项公开观察，并选择下一项已注册工具操作。",
        observation: "本轮分析正在进行；模型原始推理不会进入公开事件。",
        nextStep: "发布一条模板化决策摘要，随后执行所选工具。",
        data: { turn: state.turnNumber },
      });
      startModelProgressHeartbeat(state, onEvent);
      return;
    case "message_update":
      // Deltas can contain private reasoning, tool arguments, DOM, or image
      // payloads. Liveness comes from the independent timer; never inspect the
      // streaming event itself.
      return;
    case "message_end": {
      stopModelProgressHeartbeat(state);
      const assistant = assistantMetadata(event.message);
      if (!assistant) return;
      state.lastAssistantStopReason = assistant.stopReason;
      state.lastAssistantErrorCategory = assistant.errorCategory;
      const failed = assistant.stopReason === "error"
        || assistant.stopReason === "aborted"
        || assistant.stopReason === "length";
      if (failed) {
        const willRetry = assistant.stopReason === "error" && state.autoRetryEnabled === true;
        const reason = publicModelErrorLabel(assistant.errorCategory);
        state.lastObservation = `模型本轮未产生可用输出：${reason}。`;
        onEvent({
          type: "ERROR",
          message: `Agent 第 ${state.turnNumber} 轮 · 模型输出${assistant.stopReason === "aborted" ? "已中止" : "未完成"}`,
          status: assistant.stopReason === "length"
            ? "MODEL_OUTPUT_LIMIT"
            : assistant.stopReason === "aborted"
              ? "MODEL_ABORTED"
              : "MODEL_TRANSPORT_ERROR",
          outcome: "ERROR",
          turn: state.turnNumber,
          stage: "ERROR",
          rationale: `Assistant stopReason=${assistant.stopReason}；公开错误类别 ${assistant.errorCategory}。`,
          action: "停止处理本轮模型输出；不复制原始消息或错误文本。",
          observation: `本轮模型调用未产生可执行结果：${reason}。`,
          nextStep: willRetry
            ? "SDK 将按受限自动重试策略再次请求模型。"
            : "本轮不再自动重试；运行将按终止类别安全结束。",
          retry: willRetry
            ? { willRetry: true, mode: "AUTOMATIC", reason }
            : { willRetry: false, mode: "NONE", reason },
          data: { stopReason: assistant.stopReason, errorCategory: assistant.errorCategory },
        });
        return;
      }
      // Even assistant text blocks can contain verbose hidden-work narration or
      // shipment identifiers. Publish a stable summary, never model-authored
      // chain-of-thought. Detailed auditable intent is attached to tool calls.
      onEvent({
        type: "ASSISTANT",
        message: `Agent 第 ${state.turnNumber} 轮 · 已完成公开决策评估`,
        status: "DECISION_READY",
        outcome: "SUCCESS",
        turn: state.turnNumber,
        decisionSummary: "本轮页面证据评估已结束；私有推理内容不会展示。",
        stage: "MODEL_ANALYSIS",
        rationale: state.lastObservation ?? "本轮仅使用已公开的路由状态与受限工具结果。",
        action: "完成本轮受限决策。",
        observation: `Assistant 已结束本轮（stopReason=${assistant.stopReason}）；原始文本与私有推理未复制到轨迹。`,
        nextStep: "等待已注册工具调用；若没有结构化提交，运行将明确报错。",
      });
      return;
    }
    case "agent_end":
    case "agent_settled":
      stopModelProgressHeartbeat(state);
      return;
    case "tool_execution_start": {
      toolStartTimes(state).set(event.toolCallId, now(state));
      const input = summarizeToolCall(event.toolName, event.args);
      const action = actionForTool(event.toolName);
      onEvent({
        type: "TOOL_CALL",
        message: `第 ${state.turnNumber} 轮 · 准备${displayToolName(event.toolName)}`,
        status: "RUNNING",
        outcome: "RUNNING",
        turn: state.turnNumber,
        decisionSummary: decisionSummaryForTool(event.toolName),
        stage: stageForTool(event.toolName),
        rationale: rationaleForToolCall(event.toolName, input, state.lastObservation),
        action,
        observation: "工具尚未返回结果。",
        nextStep: `等待“${displayToolName(event.toolName)}”完成，再依据公开结果决定后续动作。`,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        toolInput: input,
        data: input,
      });
      return;
    }
    case "tool_execution_end": {
      const startedAt = toolStartTimes(state).get(event.toolCallId);
      toolStartTimes(state).delete(event.toolCallId);
      const output = summarizeToolResult(
        event.toolName,
        event.result,
        event.isError,
        state.sensitiveValues ?? [],
      );
      const attachments = toolResultAttachments(event.toolName, event.result);
      const observation = observationForToolResult(event.toolName, output, event.isError);
      const publicFailureCategory = event.isError ? failureCategory(output) : null;
      const isSubmissionValidationFailure = event.isError
        && event.toolName === "submit_tracking_result"
        && publicFailureCategory === "VALIDATION";
      if (isSubmissionValidationFailure) {
        state.submissionValidationFailures = (state.submissionValidationFailures ?? 0) + 1;
        state.submissionValidationExhausted = state.submissionValidationFailures >= 2;
      }
      const submissionFailureCount = state.submissionValidationFailures ?? 0;
      state.lastObservation = observation;
      if (event.isError) {
        state.lastToolFailure = {
          toolName: safePublicToolName(event.toolName),
          errorCategory: publicFailureCategory ?? "BROWSER",
        };
      } else {
        delete state.lastToolFailure;
      }
      onEvent({
        type: "TOOL_RESULT",
        message: `第 ${state.turnNumber} 轮 · ${displayToolName(event.toolName)}${event.isError ? "失败" : "完成"}`,
        status: event.isError ? "ERROR" : "SUCCESS",
        outcome: event.isError ? "ERROR" : "SUCCESS",
        turn: state.turnNumber,
        stage: event.isError ? "ERROR" : stageForTool(event.toolName),
        rationale: isSubmissionValidationFailure
          ? `结构化提交第 ${submissionFailureCount}/2 次未通过校验；只允许一次对症修正。`
          : `工具调用 ${event.toolCallId} 已返回可公开的${event.isError ? "失败" : "成功"}状态。`,
        action: actionForTool(event.toolName),
        observation,
        nextStep: nextStepAfterTool(event.toolName, event.isError, submissionFailureCount),
        retry: event.isError ? {
          willRetry: !isSubmissionValidationFailure || submissionFailureCount === 1,
          mode: isSubmissionValidationFailure && submissionFailureCount >= 2 ? "NONE" : "AGENT_REASSESS",
          ...(isSubmissionValidationFailure ? { attempt: submissionFailureCount, maxAttempts: 2 } : {}),
          reason: isSubmissionValidationFailure
            ? submissionFailureCount === 1
              ? "结构化结果校验失败：允许一次对症修正"
              : "结构化结果校验失败：修正机会已用尽"
            : `工具错误类别 ${publicFailureCategory ?? "BROWSER"}`,
        } : {
          willRetry: false,
          mode: "NONE",
        },
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        toolOutput: output,
        ...(startedAt === undefined ? {} : { durationMs: Math.max(0, Math.round(now(state) - startedAt)) }),
        ...(attachments.length > 0 ? { attachments } : {}),
        data: output,
      });
      return;
    }
    case "auto_retry_start":
      delete state.lastAutoRetryFailed;
      state.lastAssistantErrorCategory = modelErrorCategory(event.errorMessage, "error");
      state.lastObservation = `模型请求未成功：${publicRetryReason(event.errorMessage)}。`;
      onEvent({
        type: "RETRY",
        message: `模型请求重试 ${event.attempt}/${event.maxAttempts}`,
        status: "RETRYING",
        outcome: "RUNNING",
        turn: state.turnNumber,
        decisionSummary: "上一次模型请求未成功，系统将按受限重试策略再次请求。",
        stage: "RETRY",
        rationale: `模型请求返回可公开错误类别：${publicRetryReason(event.errorMessage)}。`,
        action: `执行第 ${event.attempt}/${event.maxAttempts} 次自动模型请求重试。`,
        observation: "上一次模型请求未产生可用响应；原始错误与请求内容已隐藏。",
        nextStep: "等待重试响应；若仍失败，将继续受限重试或结束运行。",
        retry: {
          willRetry: true,
          mode: "AUTOMATIC",
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          reason: publicRetryReason(event.errorMessage),
        },
        data: {
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          reason: publicRetryReason(event.errorMessage),
        },
      });
      return;
    case "auto_retry_end": {
      const errorCategory = event.success ? "NONE" : modelErrorCategory(event.finalError, "error");
      state.lastAutoRetryFailed = !event.success;
      if (!event.success) state.lastAssistantErrorCategory = errorCategory;
      const reason = event.success ? "自动模型重试已成功" : publicModelErrorLabel(errorCategory);
      state.lastObservation = event.success
        ? "自动模型重试已成功，等待后续工具决策。"
        : `自动模型重试已结束且仍失败：${reason}。`;
      onEvent({
        type: event.success ? "RETRY" : "ERROR",
        message: `模型自动重试第 ${event.attempt} 次 · ${event.success ? "成功" : "失败"}`,
        status: event.success ? "RETRY_SUCCESS" : "RETRY_EXHAUSTED",
        outcome: event.success ? "SUCCESS" : "ERROR",
        turn: state.turnNumber,
        stage: event.success ? "RETRY" : "ERROR",
        rationale: `SDK 已返回第 ${event.attempt} 次自动重试的最终状态。`,
        action: "结束本次自动模型重试。",
        observation: event.success
          ? "重试请求已产生可用模型响应；没有公开响应原文。"
          : `重试请求仍未产生可用响应：${reason}。`,
        nextStep: event.success
          ? "继续处理模型选择的受限工具动作。"
          : "不再自动重试；运行将以模型传输错误安全结束。",
        retry: {
          willRetry: false,
          mode: "NONE",
          attempt: event.attempt,
          reason,
        },
        data: { success: event.success, attempt: event.attempt, errorCategory },
      });
      return;
    }
    default:
      // Unhandled events can contain full DOM, screenshot payloads, or private
      // model content and therefore never cross the public trace boundary.
      return;
  }
}

export function stopModelProgressHeartbeat(state: PiTraceState): void {
  const timer = state.modelProgressTimer;
  if (timer === undefined) return;
  delete state.modelProgressTimer;
  const cancel = state.cancelModelProgress ?? clearInterval;
  cancel(timer);
}

function startModelProgressHeartbeat(state: PiTraceState, onEvent: RunEventSink): void {
  stopModelProgressHeartbeat(state);
  const schedule = state.scheduleModelProgress ?? setInterval;
  let timer: ReturnType<typeof setInterval> | undefined;
  const emitProgress = () => {
    if (timer === undefined || state.modelProgressTimer !== timer) return;
    try {
      onEvent({
        type: "MODEL",
        message: `Agent 第 ${state.turnNumber} 轮 · 模型仍在处理`,
        status: "MODEL_PROGRESS",
        outcome: "RUNNING",
        turn: state.turnNumber,
        decisionSummary: "本轮模型仍在处理已公开的页面观察。",
        stage: "MODEL_ANALYSIS",
        rationale: "模型请求尚未结束；定时心跳不会读取任何内容级增量。",
        action: "继续等待本轮模型完成或生成受限工具调用。",
        observation: "定时安全心跳已触发；私有推理、工具参数、DOM 与图片内容均未读取或复制。",
        nextStep: "保持当前任务运行；模型完成后展示模板化决策或工具调用记录。",
        data: { turn: state.turnNumber, active: true },
      });
    } catch {
      // A failed event sink must not leave a background timer alive or surface
      // its error through an unhandled interval callback.
      stopModelProgressHeartbeat(state);
    }
  };
  timer = schedule(emitProgress, MODEL_PROGRESS_INTERVAL_MS);
  state.modelProgressTimer = timer;
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    const unref = (timer as { unref?: () => void }).unref;
    if (typeof unref === "function") unref.call(timer);
  }
}

export function classifyAgentTerminalFailure(state: PiTraceState): {
  code: AgentTerminalFailureCode;
  stopReason: PublicAssistantStopReason | null;
  errorCategory: PublicModelErrorCategory;
  toolName: string | null;
  toolErrorCategory: PublicToolErrorCategory | null;
} {
  const stopReason = state.lastAssistantStopReason ?? null;
  const errorCategory = state.lastAssistantErrorCategory ?? "NONE";
  const noTool = { toolName: null, toolErrorCategory: null };
  if (state.submissionValidationExhausted === true && state.lastToolFailure) {
    return {
      code: "TOOL_FAILURE",
      stopReason,
      errorCategory,
      toolName: state.lastToolFailure.toolName,
      toolErrorCategory: state.lastToolFailure.errorCategory,
    };
  }
  if (state.turnLimitExceeded === true) return { code: "AGENT_TURN_LIMIT", stopReason, errorCategory, ...noTool };
  if (state.lastToolFailure) {
    return {
      code: "TOOL_FAILURE",
      stopReason,
      errorCategory,
      toolName: state.lastToolFailure.toolName,
      toolErrorCategory: state.lastToolFailure.errorCategory,
    };
  }
  if (stopReason === "aborted") return { code: "MODEL_ABORTED", stopReason, errorCategory: "ABORTED", ...noTool };
  if (stopReason === "length") return { code: "MODEL_OUTPUT_LIMIT", stopReason, errorCategory: "OUTPUT_LIMIT", ...noTool };
  if (stopReason === "error" || state.lastAutoRetryFailed === true) {
    return {
      code: "MODEL_TRANSPORT_ERROR",
      stopReason,
      errorCategory: errorCategory === "NONE" ? "TRANSPORT" : errorCategory,
      ...noTool,
    };
  }
  return { code: "MODEL_NO_FINAL_TOOL_CALL", stopReason, errorCategory, ...noTool };
}

export function shouldAbortAfterSubmissionValidation(state: PiTraceState): boolean {
  return state.submissionValidationExhausted === true;
}

function assistantMetadata(message: unknown): {
  stopReason: PublicAssistantStopReason;
  errorCategory: PublicModelErrorCategory;
} | null {
  if (!message || typeof message !== "object" || (message as { role?: unknown }).role !== "assistant") return null;
  const candidate = message as { stopReason?: unknown; errorMessage?: unknown };
  const stopReason = isAssistantStopReason(candidate.stopReason) ? candidate.stopReason : "stop";
  return { stopReason, errorCategory: modelErrorCategory(candidate.errorMessage, stopReason) };
}

function isAssistantStopReason(value: unknown): value is PublicAssistantStopReason {
  return typeof value === "string" && ["pending", "stop", "length", "toolUse", "error", "aborted", "deferred"].includes(value);
}

function toolStartTimes(state: PiTraceState): Map<string, number> {
  state.toolStartedAt ??= new Map<string, number>();
  return state.toolStartedAt;
}

function now(state: PiTraceState): number {
  return state.now?.() ?? Date.now();
}

function decisionSummaryForTool(toolName: string): string {
  return ({
    browser_open: "已确认船司路由，准备打开对应的公开货踪站点。",
    browser_snapshot: "需要核对当前页面的可见结构，以定位下一步可交互控件。",
    browser_screenshot: "页面结构信息不足或布局依赖视觉呈现，准备读取当前可见区域截图。",
    browser_fill: "已定位查询输入框，准备写入已脱敏的查询条件。",
    browser_click: "页面控件已定位，准备触发一次受限点击操作。",
    browser_select: "已定位查询类型控件，准备选择已脱敏的选项。",
    browser_press: "页面需要键盘交互，准备发送允许范围内的按键。",
    browser_scroll: "当前视口信息不足，准备滚动页面继续查找可见内容。",
    browser_wait: "页面仍在更新，准备短暂等待后重新检查。",
    submit_tracking_result: "可见证据已收集，准备校验并提交结构化货踪结果。",
  } as Record<string, string>)[toolName] ?? "准备调用一个已注册的受限工具；未审核参数不会公开。";
}

function stageForTool(toolName: string): RunEventStage {
  return ({
    browser_open: "NAVIGATION",
    browser_snapshot: "PAGE_INSPECTION",
    browser_screenshot: "VISUAL_INSPECTION",
    browser_fill: "FORM_INTERACTION",
    browser_click: "FORM_INTERACTION",
    browser_select: "FORM_INTERACTION",
    browser_press: "FORM_INTERACTION",
    browser_scroll: "PAGE_INSPECTION",
    browser_wait: "PAGE_INSPECTION",
    submit_tracking_result: "RESULT_VALIDATION",
  } as Record<string, RunEventStage>)[toolName] ?? "MODEL_ANALYSIS";
}

function rationaleForToolCall(toolName: string, input: SafeTraceValue, lastObservation?: string): string {
  const details = safeRecord(input);
  const current = lastObservation ? `上一项公开观察：${lastObservation} ` : "";
  const rationale = ({
    browser_open: `路由已提供经策略允许的公开站点源 ${safeString(details.url, "[站点已隐藏]")}。`,
    browser_snapshot: "浏览器已有当前页面，需要读取可见结构和可交互元素计数。",
    browser_screenshot: "Agent 选择视觉检查来补充 DOM 无法表达的布局信息。",
    browser_fill: `调用只公开控件引用 ${safeString(details.ref, "未知")}；实际输入内容已隐藏。`,
    browser_click: `调用只操作最新快照中的控件引用 ${safeString(details.ref, "未知")}。`,
    browser_select: `调用只公开控件引用 ${safeString(details.ref, "未知")}；选项值已隐藏。`,
    browser_press: `调用限定在控件引用 ${safeString(details.ref, "全局导航")} 和允许的键盘按键。`,
    browser_scroll: `当前动作只滚动 ${safeNumber(details.deltaY)} 像素，不读取额外敏感数据。`,
    browser_wait: `页面需要最多 ${safeNumber(details.milliseconds)} 毫秒的受限等待。`,
    submit_tracking_result: `候选结果声明 ${safeNumber(details.evidenceCount)} 条证据、${safeNumber(details.containerCount)} 个箱。`,
  } as Record<string, string>)[toolName] ?? "该工具已注册，但未审核参数不会写入公开轨迹。";
  return `${current}${rationale}`.trim();
}

function actionForTool(toolName: string): string {
  return ({
    browser_open: "打开已选船司的公开货踪页面。",
    browser_snapshot: "读取当前页面的可见结构与交互控件。",
    browser_screenshot: "截取当前浏览器可见区域供视觉模型检查。",
    browser_fill: "向已定位输入框写入查询条件；值不进入公开轨迹。",
    browser_click: "点击已定位的页面控件。",
    browser_select: "选择已定位的查询类型选项；值不进入公开轨迹。",
    browser_press: "发送一个受限键盘操作。",
    browser_scroll: "滚动当前页面以继续检查可见内容。",
    browser_wait: "短暂等待页面完成跳转或异步更新。",
    submit_tracking_result: "校验并提交证据支持的结构化货踪结果。",
  } as Record<string, string>)[toolName] ?? "执行一个已注册的受限工具。";
}

function observationForToolResult(toolName: string, output: SafeTraceValue, isError: boolean): string {
  const details = safeRecord(output);
  if (isError) return `${displayToolName(toolName)}未完成；公开安全错误类别：${failureCategory(output)}。`;
  switch (toolName) {
    case "browser_open":
    case "browser_snapshot": {
      const blocker = details.blockingReason == null ? "未发现已知阻断" : `检测到 ${safeString(details.blockingReason, "未知阻断")}`;
      return `页面结构读取成功：公开站点 ${safeString(details.url, "未知")}，可交互元素 ${safeNumber(details.elementCount)} 个，${blocker}。`;
    }
    case "browser_screenshot":
      return "当前浏览器可见区域已截图，并生成受 run 权限保护的附件引用。";
    case "browser_fill":
      return "查询输入框已填写；具体业务值未写入公开轨迹。";
    case "browser_click":
      return "页面控件点击已完成；下一次页面读取将确认变化。";
    case "browser_select":
      return "查询类型选项已选择；具体选项值未写入公开轨迹。";
    case "browser_press":
      return "受限键盘操作已完成；下一次页面读取将确认变化。";
    case "browser_scroll":
      return "页面滚动已完成，新的可见区域可供检查。";
    case "browser_wait":
      return "受限等待已完成，页面可重新读取。";
    case "submit_tracking_result":
      return `结构化候选已通过工具校验：状态 ${safeString(details.status, "UNKNOWN")}，证据 ${safeNumber(details.evidenceCount)} 条，箱 ${safeNumber(details.containerCount)} 个。`;
    default:
      return "工具已成功完成；未审核结果字段未公开。";
  }
}

function nextStepAfterTool(toolName: string, isError: boolean, submissionFailureCount = 0): string {
  if (isError && toolName === "submit_tracking_result") {
    return submissionFailureCount === 1
      ? "根据校验摘要对候选结果作一次对症修正；不得原样重发。"
      : "修正后的提交仍未通过校验，立即终止本票，不再进入下一轮。";
  }
  if (isError) return "不会盲目重复同一操作；Agent 下一轮将根据安全错误摘要重新评估页面或参数。";
  return ({
    browser_open: "读取页面结构，确认输入框、查询按钮和安全阻断状态。",
    browser_snapshot: "根据元素计数和阻断状态选择填写、点击、视觉检查或人工接管。",
    browser_screenshot: "结合视觉附件与 DOM 摘要选择下一项受限页面操作。",
    browser_fill: "触发查询按钮或提交键盘操作，然后重新读取页面。",
    browser_click: "等待页面响应并重新读取可见结构。",
    browser_select: "填写查询条件或触发查询，然后重新读取页面。",
    browser_press: "等待页面响应并重新读取可见结构。",
    browser_scroll: "重新读取当前可见区域的页面结构。",
    browser_wait: "重新读取页面结构，确认异步更新结果。",
    submit_tracking_result: "结束 Agent 浏览器流程并由服务生成最终标准结果。",
  } as Record<string, string>)[toolName] ?? "进入下一轮受限决策评估。";
}

function failureCategory(output: SafeTraceValue): PublicToolErrorCategory {
  const category = safeRecord(output).errorCategory;
  return typeof category === "string" && [
    "TIMEOUT",
    "STALE_ELEMENT",
    "NAVIGATION_BLOCKED",
    "VALIDATION",
    "SCREENSHOT_LIMIT",
    "BROWSER",
  ].includes(category) ? category as PublicToolErrorCategory : "BROWSER";
}

function safePublicToolName(toolName: string): string {
  return [
    "browser_open",
    "browser_snapshot",
    "browser_screenshot",
    "browser_fill",
    "browser_click",
    "browser_select",
    "browser_press",
    "browser_scroll",
    "browser_wait",
    "submit_tracking_result",
  ].includes(toolName) ? toolName : "registered_extension_tool";
}

function safeRecord(value: SafeTraceValue): Record<string, SafeTraceValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, SafeTraceValue>
    : {};
}

function safeString(value: SafeTraceValue | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function safeNumber(value: SafeTraceValue | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "未统计";
}

function publicRetryReason(errorMessage: unknown): string {
  return publicModelErrorLabel(modelErrorCategory(errorMessage, "error"));
}

function modelErrorCategory(
  errorMessage: unknown,
  stopReason: PublicAssistantStopReason,
): PublicModelErrorCategory {
  if (stopReason === "aborted") return "ABORTED";
  if (stopReason === "length") return "OUTPUT_LIMIT";
  if (stopReason !== "error") return "NONE";
  const value = typeof errorMessage === "string" ? errorMessage.toLowerCase() : "";
  if (/rate.?limit|too many requests|\b429\b/.test(value)) return "RATE_LIMIT";
  if (/timeout|timed out|deadline/.test(value)) return "TIMEOUT";
  if (/auth|unauthorized|forbidden|\b401\b|\b403\b/.test(value)) return "AUTH";
  if (/network|fetch|connection|socket|econn/.test(value)) return "NETWORK";
  return "TRANSPORT";
}

function publicModelErrorLabel(category: PublicModelErrorCategory): string {
  return ({
    NONE: "无公开错误",
    RATE_LIMIT: "模型服务限流",
    TIMEOUT: "模型请求超时",
    AUTH: "模型服务鉴权失败",
    NETWORK: "模型网络请求失败",
    ABORTED: "模型请求已中止",
    OUTPUT_LIMIT: "模型输出达到长度限制",
    TRANSPORT: "模型传输失败（原始错误已隐藏）",
  } as Record<PublicModelErrorCategory, string>)[category];
}

function displayToolName(toolName: string): string {
  return ({
    browser_open: "打开网页",
    browser_snapshot: "读取页面结构",
    browser_screenshot: "视觉查看页面",
    browser_fill: "填写查询条件",
    browser_click: "点击页面控件",
    browser_select: "选择查询类型",
    browser_press: "发送键盘操作",
    browser_scroll: "滚动页面",
    browser_wait: "等待页面响应",
    submit_tracking_result: "提交结构化货踪结果",
  } as Record<string, string>)[toolName] ?? sanitizeTraceText(toolName, 100);
}
