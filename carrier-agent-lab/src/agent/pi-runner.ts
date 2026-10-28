import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { BrowserSession, filterCarrierBrowserState, type CarrierBrowserState } from "../browser/browser-session.js";
import { CARRIERS } from "../carriers.js";
import type { LabConfig } from "../config.js";
import {
  normalizeReference,
  type AgentSubmission,
  type CarrierResolution,
  type TrackingRequest,
} from "../contracts.js";
import type { RunEventSink } from "../run-events.js";
import { retainFinalRunScreenshot } from "./final-screenshot.js";
import { buildAgentPrompt, SYSTEM_PROMPT } from "./prompt.js";
import {
  classifyAgentTerminalFailure,
  emitPiTraceEvent,
  shouldAbortAfterSubmissionValidation,
  stopModelProgressHeartbeat,
  type PiTraceState,
} from "./pi-trace.js";
import { createRuntimeAgentDir } from "./runtime-agent-dir.js";
import { createBrowserTools } from "./tools.js";

const TRACKING_MAX_MODEL_TOKENS = 16_384;
const TRACKING_THINKING_LEVEL = "off" as const;

export interface PiRunOptions {
  runId: string;
  request: TrackingRequest;
  resolution: CarrierResolution;
  config: LabConfig;
  signal: AbortSignal;
  onEvent: RunEventSink;
  testAllowLocalhost?: boolean;
  debugAgentText?: boolean;
}

export async function runPiTrackingAgent(options: PiRunOptions): Promise<AgentSubmission> {
  const { config, runId, request, resolution, signal, onEvent } = options;
  if (!resolution.trackingUrl) throw new Error("Tracking route has no browser URL");
  const skillPath = join(config.rootDir, ".pi", "skills", "shipment-web-tracker", "SKILL.md");
  const skillContents = await readFile(skillPath, "utf8");
  const carrier = resolution.carrier && resolution.carrier !== "OTHER" ? CARRIERS[resolution.carrier] : null;
  const startingHost = new URL(resolution.trackingUrl).hostname;
  let storageState: CarrierBrowserState | undefined;
  if (config.browser.storageStateDir && carrier && !options.testAllowLocalhost) {
    try {
      const state = JSON.parse(await readFile(join(config.browser.storageStateDir, `${carrier.code}.json`), "utf8"));
      storageState = filterCarrierBrowserState(state, carrier.officialHosts);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Carrier browser session is unreadable");
    }
  }
  const browser = new BrowserSession({
    ...(storageState ? { storageState } : {}),
    headless: config.browser.allowHeaded && request.headed !== undefined
      ? !request.headed
      : config.browser.headless,
    channel: config.browser.channel,
    timeoutMs: config.browser.timeoutMs,
    artifactDir: join(config.rootDir, "artifacts", runId),
    // Screenshot bytes are kept only as run-scoped artifacts. Public events
    // expose an opaque artifactId; the authenticated upper layer proxies bytes.
    preserveArtifacts: true,
    navigation: {
      mode: "official-only",
      allowLocalhost: options.testAllowLocalhost === true,
      allowedHosts: carrier?.officialHosts ?? [startingHost],
    },
  });
  const runtimeAgentDir = await createRuntimeAgentDir(config.agentDir);
  let browserLaunched = false;
  let finalScreenshotTurn = 0;
  try {
  await browser.launch();
  browserLaunched = true;
  const browserTools = createBrowserTools(browser, onEvent, {
    reference: request.reference,
    referenceType: resolution.referenceType,
    evidenceReferenceCandidates: evidenceReferenceCandidates(
      request.reference,
      carrier?.removableReferencePrefixes ?? [],
    ),
  });
  const modelRuntime = await ModelRuntime.create({
    authPath: join(runtimeAgentDir.path, "auth.json"),
    modelsPath: join(runtimeAgentDir.path, "models.json"),
    allowModelNetwork: false,
  });
  const selectedModel = await selectModel(modelRuntime, config);
  const model: Model<any> = {
    ...selectedModel,
    maxTokens: Math.min(selectedModel.maxTokens, TRACKING_MAX_MODEL_TOKENS),
  };
  if (config.model.requireVision && !model.input.includes("image")) {
    throw new Error(`Configured model does not support image input: ${model.provider}/${model.id}`);
  }
  onEvent({
    type: "MODEL",
    message: `使用模型：${model.provider}/${model.id}${model.input.includes("image") ? "（视觉）" : ""}`,
    status: "MODEL_READY",
    data: {
      provider: model.provider,
      model: model.id,
      vision: model.input.includes("image"),
      maxTokens: model.maxTokens,
      thinkingLevel: TRACKING_THINKING_LEVEL,
    },
    stage: "MODEL_SETUP",
    rationale: `配置要求${config.model.requireVision ? "支持视觉输入" : "可用模型"}，运行时已完成认证可用性检查。`,
    action: "选择本次运行使用的受限工具调用模型。",
    observation: `模型 ${model.provider}/${model.id} 已就绪；视觉输入 ${model.input.includes("image") ? "可用" : "不可用"}；单轮输出上限 ${model.maxTokens}，推理强度 ${TRACKING_THINKING_LEVEL}。`,
    nextStep: "加载固定货踪 skill，并开始第一轮公开决策评估。",
  });
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });
  const loader = new DefaultResourceLoader({
    cwd: config.rootDir,
    agentDir: runtimeAgentDir.path,
    settingsManager,
    additionalSkillPaths: [skillPath],
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
    skillsOverride: (current) => ({
      skills: current.skills.filter((skill) => skill.filePath === skillPath),
      diagnostics: current.diagnostics.filter((diagnostic) => diagnostic.path === skillPath),
    }),
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: config.rootDir,
    agentDir: runtimeAgentDir.path,
    modelRuntime,
    model,
    thinkingLevel: TRACKING_THINKING_LEVEL,
    tools: browserTools.tools.map((tool) => tool.name),
    customTools: browserTools.tools,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(config.rootDir),
    settingsManager,
  });
  const abort = () => void session.abort();
  signal.addEventListener("abort", abort, { once: true });
  const traceState: PiTraceState = {
    turnNumber: 0,
    toolStartedAt: new Map<string, number>(),
    sensitiveValues: [request.reference],
    autoRetryEnabled: true,
  };
  let submissionAbortRequested = false;
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    emitPiTraceEvent(event, traceState, onEvent);
    finalScreenshotTurn = traceState.turnNumber;
    if (!submissionAbortRequested && shouldAbortAfterSubmissionValidation(traceState)) {
      submissionAbortRequested = true;
      onEvent({
        type: "ERROR",
        message: "结构化结果第二次校验失败，正在立即终止本票",
        status: "SUBMISSION_VALIDATION_EXHAUSTED",
        outcome: "ERROR",
        turn: traceState.turnNumber,
        stage: "ERROR",
        rationale: "首次提交被拒后仅允许一次对症修正；修正后的第二次提交仍未通过。",
        action: "中止当前 Agent 会话，不再重复 submit_tracking_result。",
        observation: "两次提交均被结构化契约拒绝；公开错误类别保持 VALIDATION。",
        nextStep: "将本票按 ERROR 结束，并继续队列中的下一票。",
        retry: {
          willRetry: false,
          mode: "NONE",
          attempt: 2,
          maxAttempts: 2,
          reason: "结构化结果校验失败：修正机会已用尽",
        },
        data: { errorCategory: "VALIDATION", attempts: 2 },
      });
      void session.abort();
      return;
    }
    if (event.type === "turn_start" && traceState.turnNumber > config.execution.maxAgentTurns) {
      traceState.turnLimitExceeded = true;
      onEvent({
        type: "ERROR",
        message: `Agent 超过最大轮数 ${config.execution.maxAgentTurns}，正在终止`,
        status: "TURN_LIMIT",
        stage: "ERROR",
        rationale: `Agent 已超过 ${config.execution.maxAgentTurns} 轮安全上限。`,
        action: "中止继续推理和工具调用。",
        observation: "轮数限制已触发；没有继续尝试页面操作。",
        nextStep: "结束本次任务并向业务员展示轮数限制原因。",
        retry: { willRetry: false, mode: "NONE", reason: "达到 Agent 轮数上限" },
      });
      void session.abort();
    }
  });
  try {
    const prompt = options.testAllowLocalhost
      ? `${buildAgentPrompt(request, resolution, skillContents)}

This run uses an isolated local fixture for integration testing; treat its visible data exactly like a public test page.
After the result becomes visible, keep the demo submission deliberately minimal so every fact has an exact DOM citation:
- shipment.bookingNumber: the visible Booking value; shipment.billOfLading: null; shipment.status: the visible Status value.
- Omit all optional shipment fields, return containers: [], warnings: [], and note: null.
- Include exactly two DOM evidence items, with fields shipment.bookingNumber and shipment.status, using the exact visible values and the current fixture URL.
Do not add origin, destination, ETA, container, or event fields to this isolated demo result.`
      : buildAgentPrompt(request, resolution, skillContents);
    await session.prompt(prompt);
    const submission = browserTools.getSubmission();
    if (!submission) {
      const terminal = classifyAgentTerminalFailure(traceState);
      const description = terminalFailureDescription(terminal.code);
      const toolContext = terminal.toolName
        ? `，最后工具=${terminal.toolName}，工具错误类别=${terminal.toolErrorCategory ?? "BROWSER"}`
        : "";
      onEvent({
        type: "ERROR",
        message: description.message,
        status: terminal.code,
        outcome: "ERROR",
        stage: "ERROR",
        rationale: `会话结束时没有可验证的 submit_tracking_result；终止类别=${terminal.code}，最后 stopReason=${terminal.stopReason ?? "NONE"}，公开错误类别=${terminal.errorCategory}${toolContext}。`,
        action: "拒绝根据普通模型文本拼装业务结果，并按终止类别结束运行。",
        observation: description.observation,
        nextStep: description.nextStep,
        retry: {
          willRetry: false,
          mode: "NONE",
          reason: terminal.toolErrorCategory
            ? `${description.reason}（${terminal.toolErrorCategory}）`
            : description.reason,
        },
        data: {
          code: terminal.code,
          stopReason: terminal.stopReason,
          errorCategory: terminal.errorCategory,
          toolName: terminal.toolName,
          toolErrorCategory: terminal.toolErrorCategory,
        },
      });
      throw new Error(terminal.code);
    }
    return submission;
  } finally {
    stopModelProgressHeartbeat(traceState);
    signal.removeEventListener("abort", abort);
    unsubscribe();
    session.dispose();
  }
  } finally {
    try {
      if (browserLaunched) {
        await retainFinalRunScreenshot(browser, onEvent, finalScreenshotTurn);
      }
    } finally {
      try {
        await browser.close();
      } finally {
        await runtimeAgentDir.cleanup();
      }
    }
  }
}

function evidenceReferenceCandidates(reference: string, removablePrefixes: string[]): string[] {
  const normalized = normalizeReference(reference);
  return [
    normalized,
    ...removablePrefixes
      .map((prefix) => normalizeReference(prefix))
      .filter((prefix) => normalized.startsWith(prefix) && normalized.length > prefix.length)
      .map((prefix) => normalized.slice(prefix.length)),
  ];
}

function terminalFailureDescription(code: ReturnType<typeof classifyAgentTerminalFailure>["code"]): {
  message: string;
  observation: string;
  nextStep: string;
  reason: string;
} {
  return ({
    AGENT_TURN_LIMIT: {
      message: "Agent 达到最大执行轮数，未生成最终结构化结果",
      observation: "安全轮数上限已触发，后续模型和工具操作已停止。",
      nextStep: "检查页面阻断或工具失败事件后，再决定是否调整流程并重新发起。",
      reason: "达到 Agent 最大执行轮数",
    },
    TOOL_FAILURE: {
      message: "浏览器工具执行失败，Agent 未生成最终结构化结果",
      observation: "最后一项工具调用失败；公开轨迹仅保留工具名和安全错误类别。",
      nextStep: "依据工具失败类别检查页面控件、站点阻断或查询参数后重新发起。",
      reason: "受限浏览器工具执行失败",
    },
    MODEL_TRANSPORT_ERROR: {
      message: "模型服务通信失败，Agent 未生成最终结构化结果",
      observation: "模型请求或受限自动重试未产生可用响应；原始错误未公开。",
      nextStep: "检查模型服务可用性后重新发起任务。",
      reason: "模型服务通信失败",
    },
    MODEL_NO_FINAL_TOOL_CALL: {
      message: "模型会话已结束，但未调用最终结构化提交工具",
      observation: "模型产生了普通响应或工具动作，但没有可验证的最终提交。",
      nextStep: "使用通过工具调用验证的模型配置后重新发起任务。",
      reason: "缺少最终结构化工具调用",
    },
    MODEL_OUTPUT_LIMIT: {
      message: "模型输出达到长度限制，未生成最终结构化结果",
      observation: "最后 Assistant 输出因长度限制结束；没有使用截断文本构造业务结果。",
      nextStep: "缩短上下文或调整合格模型配置后重新发起任务。",
      reason: "模型输出达到长度限制",
    },
    MODEL_ABORTED: {
      message: "模型请求已中止，未生成最终结构化结果",
      observation: "模型运行在完成结构化提交前被安全中止。",
      nextStep: "确认取消或超时原因后再决定是否重新发起。",
      reason: "模型请求已中止",
    },
  } as const)[code];
}

async function selectModel(runtime: ModelRuntime, config: LabConfig): Promise<Model<any>> {
  const available = await runtime.getAvailable();
  if (config.model.provider && config.model.id) {
    const selected = available.find(
      (model) => model.provider === config.model.provider && model.id === config.model.id,
    );
    if (!selected) {
      throw new Error(`Model is not available or authenticated: ${config.model.provider}/${config.model.id}`);
    }
    return selected;
  }
  const selected = available.find((model) => model.input.includes("image")) ?? available[0];
  if (!selected) {
    throw new Error("No authenticated pi model is available. Configure ~/.pi/agent/auth.json or provider API keys.");
  }
  return selected;
}
