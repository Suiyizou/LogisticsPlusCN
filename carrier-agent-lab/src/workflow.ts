import { Value } from "typebox/value";
import type { LabConfig } from "./config.js";
import {
  buildTrackingResult,
  normalizeReference,
  TrackingRequestSchema,
  type TrackingRequest,
  type TrackingResult,
} from "./contracts.js";
import { runPiTrackingAgent } from "./agent/pi-runner.js";
import {
  DEMO_NOTICE,
  demoCarrierResolution,
  demoTrackingRequest,
  startDemoFixture,
} from "./demo-fixture.js";
import { resolveCarrier } from "./router.js";
import type { RunEventSink } from "./run-events.js";

export interface ExecuteOptions {
  runId: string;
  request: TrackingRequest;
  config: LabConfig;
  signal: AbortSignal;
  onEvent: RunEventSink;
}

export async function executeTracking(options: ExecuteOptions): Promise<TrackingResult> {
  if (!Value.Check(TrackingRequestSchema, options.request)) {
    throw new Error("Invalid tracking request");
  }
  if (options.request.demo === true) return executeDemo(options);
  const resolution = resolveCarrier(options.request);
  options.onEvent({
    type: "SYSTEM",
    message: `船司路由：${resolution.kind} / ${resolution.carrierName ?? "未确定"}`,
    status: "ROUTED",
    stage: "ROUTING",
    rationale: `确定性路由器依据 ${resolution.detectedBy} 选择查询通道；未使用模型猜测船司。`,
    action: "解析显式船司、业务样本前缀和自定义官方网址。",
    observation: `路由结果 ${resolution.kind}，船司 ${resolution.carrierName ?? "未确定"}，置信度 ${resolution.confidence}。`,
    nextStep: resolution.kind === "TRACK"
      ? "启动受限浏览器并只访问该船司批准的公开站点。"
      : resolution.kind === "DELEGATE_EXISTING"
        ? "交由现有 COSCO 准确查询通道处理。"
        : "返回船司不明确结果，等待业务员明确选择。",
  });
  if (resolution.kind === "AMBIGUOUS") {
    return nonAgentResult(options, resolution, "AMBIGUOUS", resolution.warnings[0] ?? "Carrier is ambiguous");
  }
  if (resolution.kind === "DELEGATE_EXISTING") {
    return nonAgentResult(
      options,
      resolution,
      "DELEGATED_TO_EXISTING",
      "COSCO 已交给现有系统的准确查询通道，本独立模块不重复查询。",
    );
  }
  const submission = await runPiTrackingAgent({ ...options, resolution });
  return buildTrackingResult(options.runId, options.request, resolution, submission);
}

async function executeDemo(options: ExecuteOptions): Promise<TrackingResult> {
  if (!options.config.demo.enabled) {
    throw new Error("The isolated Agent success demo is disabled for this deployment");
  }
  options.onEvent({
    type: "SYSTEM",
    message: "启动本地隔离成功演示；将由真实模型操作真实浏览器",
    status: "DEMO",
    data: { businessData: false },
    stage: "ROUTING",
    rationale: "请求显式启用了隔离演示，且部署配置允许演示模式。",
    action: "启动只包含虚构数据的本地货踪页面。",
    observation: "演示环境不使用调用方票号或船司业务数据。",
    nextStep: "让同一模型、工具和浏览器链路操作隔离页面。",
  });
  const fixture = await startDemoFixture();
  try {
    const request = demoTrackingRequest(fixture.url);
    const resolution = demoCarrierResolution(fixture.url);
    options.onEvent({
      type: "SYSTEM",
      message: `演示路由：${resolution.carrierName}`,
      status: "DEMO_READY",
      data: { reference: "[演示业务标识已隐藏]", referenceType: request.referenceType ?? "BOOKING" },
      stage: "ROUTING",
      rationale: "本地演示页面已启动，并已生成固定虚构查询条件。",
      action: "将演示路由锁定到本地隔离页面。",
      observation: `演示船司 ${resolution.carrierName} 已就绪。`,
      nextStep: "启动视觉模型和真实浏览器执行。",
    });
    const submission = await runPiTrackingAgent({
      ...options,
      request,
      resolution,
      testAllowLocalhost: true,
    });
    const result = buildTrackingResult(options.runId, request, resolution, submission);
    result.note = result.note ? `${DEMO_NOTICE} ${result.note}` : DEMO_NOTICE;
    return result;
  } finally {
    await fixture.close();
  }
}

function nonAgentResult(
  options: ExecuteOptions,
  resolution: ReturnType<typeof resolveCarrier>,
  status: "AMBIGUOUS" | "DELEGATED_TO_EXISTING",
  note: string,
): TrackingResult {
  return {
    schemaVersion: "1.0",
    runId: options.runId,
    status,
    carrier: {
      code: resolution.carrier,
      name: resolution.carrierName,
      trackingUrl: resolution.trackingUrl,
      detectedBy: resolution.detectedBy,
      confidence: resolution.confidence,
    },
    query: {
      reference: normalizeReference(options.request.reference),
      referenceType: resolution.referenceType,
    },
    fetchedAt: new Date().toISOString(),
    shipment: null,
    containers: [],
    evidence: [
      {
        field: "routing",
        value: note,
        sourceUrl: "internal://carrier-router",
        method: "DOM",
      },
    ],
    warnings: resolution.warnings,
    note,
  };
}
