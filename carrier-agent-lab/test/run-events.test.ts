import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  classifyAgentTerminalFailure,
  emitPiTraceEvent,
  shouldAbortAfterSubmissionValidation,
  stopModelProgressHeartbeat,
  type PiTraceState,
} from "../src/agent/pi-trace.js";
import {
  redactSensitiveText,
  sanitizeRunAttachment,
  sanitizeTraceData,
  summarizeToolCall,
  summarizeToolResult,
  toolResultAttachments,
  type RunEventInput,
} from "../src/run-events.js";

test("public model trace emits only a bounded decision summary and never model-authored reasoning", () => {
  const message = {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "private chain of thought" },
      { type: "text", text: "I will inspect TOP-SECRET-BOOKING-VALUE and here is my verbose reasoning." },
    ],
  };

  const emitted: RunEventInput[] = [];
  const state = { turnNumber: 3, sensitiveValues: ["TOP-SECRET-BOOKING-VALUE"] };
  emitPiTraceEvent({ type: "message_end", message } as AgentSessionEvent, state, (event) => {
    if (typeof event !== "string") emitted.push(event);
  });
  emitPiTraceEvent({ type: "message_end", message: { role: "user", content: "must not duplicate" } } as AgentSessionEvent, state, () => {
    assert.fail("user message_end must not emit an assistant audit event");
  });
  emitPiTraceEvent({ type: "message_end", message: { role: "toolResult", content: [] } } as unknown as AgentSessionEvent, state, () => {
    assert.fail("tool result message_end must not emit an assistant audit event");
  });
  emitPiTraceEvent({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "never emit this" },
  } as AgentSessionEvent, state, () => assert.fail("thinking delta must not emit a trace event"));
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.type, "ASSISTANT");
  assert.equal(emitted[0]?.turn, 3);
  assert.match(emitted[0]?.decisionSummary ?? "", /私有推理内容不会展示/);
  assert.equal(emitted[0]?.stage, "MODEL_ANALYSIS");
  assert.match(emitted[0]?.rationale ?? "", /受限工具结果|公开的路由状态/);
  assert.match(emitted[0]?.action ?? "", /完成本轮/);
  assert.match(emitted[0]?.observation ?? "", /原始文本与私有推理未复制/);
  assert.match(emitted[0]?.nextStep ?? "", /等待已注册工具/);
  assert.doesNotMatch(
    JSON.stringify(emitted),
    /private chain of thought|never emit this|TOP-SECRET-BOOKING-VALUE|verbose reasoning/,
  );
});

test("model progress timer covers silent requests, cleans up, and never copies stream content", () => {
  const emitted: RunEventInput[] = [];
  let tick: (() => void) | undefined;
  let scheduledInterval = 0;
  let cancelCount = 0;
  const fakeTimer = { unref() {} } as unknown as ReturnType<typeof setInterval>;
  const state: PiTraceState = {
    turnNumber: 0,
    sensitiveValues: ["ONEYMEXG20090500"],
    scheduleModelProgress: (callback, intervalMs) => {
      tick = callback;
      scheduledInterval = intervalMs;
      return fakeTimer;
    },
    cancelModelProgress: (timer) => {
      assert.equal(timer, fakeTimer);
      cancelCount += 1;
    },
  };
  const emit = (event: string | RunEventInput) => {
    if (typeof event !== "string") emitted.push(event);
  };
  const update = (delta: string) => emitPiTraceEvent({
    type: "message_update",
    assistantMessageEvent: {
      type: "thinking_delta",
      delta,
      partial: {
        role: "assistant",
        content: [{ type: "thinking", thinking: delta }],
      },
    },
  } as unknown as AgentSessionEvent, state, emit);

  emitPiTraceEvent({ type: "turn_start" } as AgentSessionEvent, state, emit);
  assert.equal(scheduledInterval, 12_000);
  assert.equal(emitted.filter((event) => event.status === "MODEL_PROGRESS").length, 0);

  // A content-bearing update must remain ignored; the independent timer is the
  // only source of public liveness events.
  update("private reasoning with ONEYMEXG20090500 and <html>secret DOM</html>");
  assert.equal(emitted.filter((event) => event.status === "MODEL_PROGRESS").length, 0);
  assert(tick);
  tick();
  tick();

  const progress = emitted.filter((event) => event.status === "MODEL_PROGRESS");
  assert.equal(progress.length, 2);
  for (const event of progress) {
    assert.equal(event.type, "MODEL");
    assert.equal(event.turn, 1);
    assert.equal(event.outcome, "RUNNING");
    assert.equal(event.stage, "MODEL_ANALYSIS");
    assert.deepEqual(event.data, { turn: 1, active: true });
    assert.match(event.observation ?? "", /均未读取或复制/);
  }
  assert.doesNotMatch(
    JSON.stringify(progress),
    /ONEYMEXG20090500|secret DOM|private reasoning|thinking_delta/,
  );

  emitPiTraceEvent({
    type: "message_end",
    message: { role: "assistant", stopReason: "toolUse", content: [] },
  } as unknown as AgentSessionEvent, state, emit);
  assert.equal(cancelCount, 1);
  assert.equal(state.modelProgressTimer, undefined);
  tick();
  assert.equal(emitted.filter((event) => event.status === "MODEL_PROGRESS").length, 2);

  // The explicit lifecycle cleanup used by pi-runner is idempotent and covers
  // prompt/dispose exceptions that occur without a final model event.
  emitPiTraceEvent({ type: "turn_start" } as AgentSessionEvent, state, emit);
  stopModelProgressHeartbeat(state);
  stopModelProgressHeartbeat(state);
  assert.equal(cancelCount, 2);
});

test("tool trace hides field values, raw DOM, screenshots, base64 and secrets", () => {
  const call = summarizeToolCall("browser_fill", {
    ref: "e17",
    value: "TOP-SECRET-BOOKING-VALUE",
    apiKey: "sk-test-secret",
  });
  assert.deepEqual(call, { ref: "e17", input: "[输入内容已隐藏]" });

  const result = summarizeToolResult("browser_snapshot", {
    content: [{ type: "text", text: "<html>raw DOM</html>" }],
    details: {
      url: "https://carrier.example/track?token=hidden-token",
      title: "Tracking",
      elementCount: 12,
      visibleText: "raw shipment page",
      image: "data:image/png;base64," + "A".repeat(200),
    },
  }, false);
  const json = JSON.stringify(result);
  assert.match(json, /elementCount/);
  assert.doesNotMatch(json, /raw DOM|raw shipment page|AAAA|hidden-token/);

  const sanitized = sanitizeTraceData({
    password: "hunter2",
    cookie: "session=value",
    html: "<html>secret page</html>",
    outerHTML: '<input type="text" value="UNLABELLED-DOM-SECRET">',
    nested: { api_key: "secret-key" },
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /hunter2|session=value|secret page|secret-key|UNLABELLED-DOM-SECRET/);
  assert.equal(
    sanitizeTraceData('<input type="text" value="ANOTHER-UNLABELLED-SECRET">'),
    "[页面原始内容已隐藏]",
  );
});

test("tool errors expose only an allowlisted category and fixed summary", () => {
  const unlabelledSecret = "opaque-value-4f871d2e";
  assert.deepEqual(summarizeToolResult("browser_fill", {
    errorMessage: `Field lookup timed out while holding ${unlabelledSecret}`,
  }, true), {
    success: false,
    errorCategory: "TIMEOUT",
    errorSummary: "工具执行超时",
  });
  const exceptionResult = summarizeToolResult("browser_click", {
    error: new Error(`Unexpected browser failure near ${unlabelledSecret}`),
  }, true);
  assert.deepEqual(exceptionResult, {
    success: false,
    errorCategory: "BROWSER",
    errorSummary: "浏览器工具执行失败",
  });
  assert.doesNotMatch(JSON.stringify(exceptionResult), new RegExp(unlabelledSecret));
  assert.deepEqual(summarizeToolResult("submit_tracking_result", {
    content: [{ type: "text", text: `opaque rejection near ${unlabelledSecret}` }],
  }, true), {
    success: false,
    errorCategory: "VALIDATION",
    errorSummary: "结构化结果校验失败",
  });
  assert.deepEqual(summarizeToolResult("submit_tracking_result", {
    content: [{
      type: "text",
      text: "Evidence value was not observed by its declared method: containers.MSKU1234567.status",
    }],
  }, true), {
    success: false,
    errorCategory: "VALIDATION",
    errorSummary: "结构化结果校验失败",
    validationCode: "EVIDENCE_VALUE_NOT_OBSERVED",
    validationField: "containers.[箱号已隐藏].status",
  });
  const nestedContainerIssue = summarizeToolResult("submit_tracking_result", {
    content: [{
      type: "text",
      text: "FOUND field requires matching evidence: containers.TCLU8367916.events.0.location",
    }],
  }, true);
  assert.equal(
    (nestedContainerIssue as Record<string, unknown>).validationField,
    "containers.[箱号已隐藏].events.0.location",
  );
  assert.doesNotMatch(JSON.stringify(nestedContainerIssue), /TCLU8367916/);
  assert.deepEqual(summarizeToolResult("submit_tracking_result", {
    content: [{ type: "text", text: "FOUND field requires matching evidence: shipment.origin" }],
  }, true), {
    success: false,
    errorCategory: "VALIDATION",
    errorSummary: "结构化结果校验失败",
    validationCode: "FIELD_EVIDENCE_MISSING",
    validationField: "shipment.origin",
  });
});

test("submission validation allows one targeted correction then terminates as VALIDATION", () => {
  const events: RunEventInput[] = [];
  const state: PiTraceState = { turnNumber: 6 };
  const emit = (event: string | RunEventInput) => {
    if (typeof event !== "string") events.push(event);
  };
  const rejection = (toolCallId: string) => emitPiTraceEvent({
    type: "tool_execution_end",
    toolCallId,
    toolName: "submit_tracking_result",
    result: { content: [{ type: "text", text: "opaque validation rejection" }] },
    isError: true,
  } as AgentSessionEvent, state, emit);

  rejection("submit-1");
  assert.equal(state.submissionValidationFailures, 1);
  assert.equal(shouldAbortAfterSubmissionValidation(state), false);
  assert.deepEqual(events[0]?.retry, {
    willRetry: true,
    mode: "AGENT_REASSESS",
    attempt: 1,
    maxAttempts: 2,
    reason: "结构化结果校验失败：允许一次对症修正",
  });
  assert.match(events[0]?.nextStep ?? "", /一次对症修正/);
  assert.equal(events[0]?.toolOutput && (events[0].toolOutput as Record<string, unknown>).errorCategory, "VALIDATION");

  rejection("submit-2");
  assert.equal(state.submissionValidationFailures, 2);
  assert.equal(shouldAbortAfterSubmissionValidation(state), true);
  assert.deepEqual(events[1]?.retry, {
    willRetry: false,
    mode: "NONE",
    attempt: 2,
    maxAttempts: 2,
    reason: "结构化结果校验失败：修正机会已用尽",
  });
  assert.match(events[1]?.nextStep ?? "", /立即终止/);
  assert.deepEqual(classifyAgentTerminalFailure({
    ...state,
    turnLimitExceeded: true,
    lastAssistantStopReason: "aborted",
  }), {
    code: "TOOL_FAILURE",
    stopReason: "aborted",
    errorCategory: "NONE",
    toolName: "submit_tracking_result",
    toolErrorCategory: "VALIDATION",
  });
});

test("assistant stop metadata is categorized without retaining raw model errors", () => {
  const events: RunEventInput[] = [];
  const state: PiTraceState = {
    turnNumber: 2,
    autoRetryEnabled: true,
    sensitiveValues: ["OOLU1234567890"],
  };
  emitPiTraceEvent({
    type: "message_end",
    message: {
      role: "assistant",
      stopReason: "error",
      errorMessage: "fetch timeout for OOLU1234567890 token=private-provider-token",
      content: [{ type: "text", text: "raw model failure" }],
    },
  } as unknown as AgentSessionEvent, state, (event) => {
    if (typeof event !== "string") events.push(event);
  });
  assert.equal(state.lastAssistantStopReason, "error");
  assert.equal(state.lastAssistantErrorCategory, "TIMEOUT");
  assert.equal(events[0]?.type, "ERROR");
  assert.equal(events[0]?.status, "MODEL_TRANSPORT_ERROR");
  assert.deepEqual(events[0]?.retry, {
    willRetry: true,
    mode: "AUTOMATIC",
    reason: "模型请求超时",
  });
  assert.deepEqual(classifyAgentTerminalFailure(state), {
    code: "MODEL_TRANSPORT_ERROR",
    stopReason: "error",
    errorCategory: "TIMEOUT",
    toolName: null,
    toolErrorCategory: null,
  });
  assert.doesNotMatch(JSON.stringify({
    stopReason: state.lastAssistantStopReason,
    errorCategory: state.lastAssistantErrorCategory,
    observation: state.lastObservation,
    events,
  }), /OOLU1234567890|private-provider-token|raw model failure/);
});

test("terminal classifier prioritizes turn limit and last tool failure before model stop reasons", () => {
  assert.equal(classifyAgentTerminalFailure({
    turnNumber: 13,
    turnLimitExceeded: true,
    lastToolFailure: { toolName: "browser_fill", errorCategory: "TIMEOUT" },
    lastAssistantStopReason: "error",
    lastAssistantErrorCategory: "NETWORK",
  }).code, "AGENT_TURN_LIMIT");
  assert.deepEqual(classifyAgentTerminalFailure({
    turnNumber: 4,
    lastToolFailure: { toolName: "browser_fill", errorCategory: "TIMEOUT" },
    lastAssistantStopReason: "error",
    lastAssistantErrorCategory: "NETWORK",
  }), {
    code: "TOOL_FAILURE",
    stopReason: "error",
    errorCategory: "NETWORK",
    toolName: "browser_fill",
    toolErrorCategory: "TIMEOUT",
  });
  assert.equal(classifyAgentTerminalFailure({ turnNumber: 1, lastAssistantStopReason: "length" }).code, "MODEL_OUTPUT_LIMIT");
  assert.equal(classifyAgentTerminalFailure({ turnNumber: 1, lastAssistantStopReason: "aborted" }).code, "MODEL_ABORTED");
  assert.equal(classifyAgentTerminalFailure({ turnNumber: 1, lastAssistantStopReason: "stop" }).code, "MODEL_NO_FINAL_TOOL_CALL");
});

test("pi tool lifecycle produces paired typed events with safe metadata", () => {
  const events: RunEventInput[] = [];
  let clock = 1_000;
  const state = { turnNumber: 2, now: () => clock, sensitiveValues: ["LABBOOKING123"] };
  const emit = (event: string | RunEventInput) => {
    if (typeof event !== "string") events.push(event);
  };
  emitPiTraceEvent({
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "browser_fill",
    args: { ref: "e2", value: "LABBOOKING123" },
  } as AgentSessionEvent, state, emit);
  clock = 1_047;
  emitPiTraceEvent({
    type: "tool_execution_end",
    toolCallId: "call-1",
    toolName: "browser_fill",
    result: { content: [{ type: "text", text: "Field filled" }], details: { ref: "e2" } },
    isError: false,
  } as AgentSessionEvent, state, emit);
  assert.deepEqual(events.map((event) => event.type), ["TOOL_CALL", "TOOL_RESULT"]);
  assert.deepEqual(events.map((event) => event.toolCallId), ["call-1", "call-1"]);
  assert.deepEqual(events.map((event) => event.turn), [2, 2]);
  assert.equal(events[0]?.outcome, "RUNNING");
  assert.equal(events[1]?.outcome, "SUCCESS");
  assert.equal(events[1]?.durationMs, 47);
  assert.deepEqual(events[0]?.toolInput, { ref: "e2", input: "[输入内容已隐藏]" });
  assert.deepEqual(events[1]?.toolOutput, { success: true });
  assert.match(events[0]?.decisionSummary ?? "", /输入框/);
  assert.equal(events[0]?.stage, "FORM_INTERACTION");
  assert.match(events[0]?.rationale ?? "", /控件引用 e2/);
  assert.match(events[0]?.action ?? "", /输入框/);
  assert.equal(events[0]?.observation, "工具尚未返回结果。");
  assert.match(events[0]?.nextStep ?? "", /等待/);
  assert.match(events[1]?.observation ?? "", /已填写/);
  assert.match(events[1]?.nextStep ?? "", /触发查询/);
  assert.deepEqual(events[1]?.retry, { willRetry: false, mode: "NONE" });
  assert.doesNotMatch(JSON.stringify(events), /LABBOOKING123/);
});

test("tool failures expose a safe reason and explicit reassessment while model retries are marked automatic", () => {
  const events: RunEventInput[] = [];
  const state = {
    turnNumber: 5,
    sensitiveValues: ["OOLU1234567890"],
    now: () => 100,
  };
  const emit = (event: string | RunEventInput) => {
    if (typeof event !== "string") events.push(event);
  };
  emitPiTraceEvent({
    type: "tool_execution_start",
    toolCallId: "call-failed",
    toolName: "browser_fill",
    args: { ref: "e9", value: "OOLU1234567890" },
  } as AgentSessionEvent, state, emit);
  emitPiTraceEvent({
    type: "tool_execution_end",
    toolCallId: "call-failed",
    toolName: "browser_fill",
    result: { errorMessage: "Field for OOLU1234567890 timed out; cookie=session-secret" },
    isError: true,
  } as AgentSessionEvent, state, emit);
  emitPiTraceEvent({
    type: "auto_retry_start",
    attempt: 1,
    maxAttempts: 2,
    errorMessage: "429 for OOLU1234567890 token=private",
  } as AgentSessionEvent, state, emit);
  emitPiTraceEvent({
    type: "auto_retry_end",
    success: false,
    attempt: 2,
    finalError: "connection failed for OOLU1234567890 password=hunter2",
  } as AgentSessionEvent, state, emit);

  const failed = events[1];
  assert.equal(failed?.stage, "ERROR");
  assert.match(failed?.observation ?? "", /公开安全错误类别/);
  assert.match(failed?.nextStep ?? "", /不会盲目重复/);
  assert.equal(failed?.retry?.willRetry, true);
  assert.equal(failed?.retry?.mode, "AGENT_REASSESS");
  assert.equal(failed?.retry?.reason, "工具错误类别 TIMEOUT");
  assert.match(failed?.observation ?? "", /TIMEOUT/);
  assert.deepEqual(failed?.toolOutput, {
    success: false,
    errorCategory: "TIMEOUT",
    errorSummary: "工具执行超时",
  });

  const retry = events[2];
  assert.equal(retry?.stage, "RETRY");
  assert.deepEqual(retry?.retry, {
    willRetry: true,
    mode: "AUTOMATIC",
    attempt: 1,
    maxAttempts: 2,
    reason: "模型服务限流",
  });
  assert.match(retry?.rationale ?? "", /模型服务限流/);
  const retryEnd = events[3];
  assert.equal(retryEnd?.type, "ERROR");
  assert.equal(retryEnd?.status, "RETRY_EXHAUSTED");
  assert.equal(retryEnd?.retry?.willRetry, false);
  assert.equal(retryEnd?.retry?.mode, "NONE");
  assert.match(retryEnd?.observation ?? "", /模型网络请求失败/);
  assert.equal(classifyAgentTerminalFailure(state).code, "TOOL_FAILURE");
  assert.equal(classifyAgentTerminalFailure(state).toolErrorCategory, "TIMEOUT");
  assert.doesNotMatch(JSON.stringify(events), /OOLU1234567890|session-secret|token=private|hunter2/);
});

test("screenshot trace exposes only a safe run-scoped artifact identifier", () => {
  const rawResult = {
    content: [{ type: "image", data: "A".repeat(500), mimeType: "image/jpeg" }],
    details: {
      url: "https://carrier.example/track?booking=OOLU1234567890",
      path: "C:\\secret\\artifacts\\OOLU1234567890.jpg",
      artifactId: "ebc1cf8a-46bc-4e03-b361-12a8e80fc188.jpg",
      label: "OOLU1234567890 final result",
      mimeType: "image/jpeg",
    },
  };
  assert.deepEqual(summarizeToolResult("browser_screenshot", rawResult, false), {
    success: true,
    captured: true,
    media: "[截图内容通过受保护附件提供]",
  });
  assert.deepEqual(toolResultAttachments("browser_screenshot", rawResult), [{
    type: "SCREENSHOT",
    artifactId: "ebc1cf8a-46bc-4e03-b361-12a8e80fc188.jpg",
    label: "浏览器页面截图",
    mimeType: "image/jpeg",
  }]);
  assert.equal(sanitizeRunAttachment({
    type: "SCREENSHOT",
    artifactId: "../secret.jpg",
    label: "page",
    mimeType: "image/jpeg",
  }), null);
  assert.doesNotMatch(JSON.stringify(toolResultAttachments("browser_screenshot", rawResult)), /OOLU|C:\\|AAAA/);
});

test("unknown tool parameters and known business identifiers are never copied into public trace", () => {
  assert.deepEqual(summarizeToolCall("extension_unreviewed", {
    reference: "OOLU1234567890",
    rawDom: "secret page",
  }), { parameters: "[未审核工具参数已隐藏]" });
  assert.equal(
    redactSensitiveText("Could not validate OOLU1234567890", ["OOLU1234567890"]),
    "Could not validate [业务标识已隐藏]",
  );
});
