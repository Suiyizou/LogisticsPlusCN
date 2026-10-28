export type RunEventType =
  | "SYSTEM"
  | "MODEL"
  | "ASSISTANT"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "RETRY"
  | "RESULT"
  | "ERROR";

export type SafeTraceValue = string | number | boolean | null | SafeTraceValue[] | {
  [key: string]: SafeTraceValue;
};

export type RunEventOutcome = "RUNNING" | "SUCCESS" | "ERROR";

export type PublicToolErrorCategory =
  | "TIMEOUT"
  | "STALE_ELEMENT"
  | "NAVIGATION_BLOCKED"
  | "VALIDATION"
  | "SCREENSHOT_LIMIT"
  | "BROWSER";

export type RunEventStage =
  | "QUEUE"
  | "ROUTING"
  | "MODEL_SETUP"
  | "MODEL_ANALYSIS"
  | "NAVIGATION"
  | "PAGE_INSPECTION"
  | "VISUAL_INSPECTION"
  | "FORM_INTERACTION"
  | "RESULT_VALIDATION"
  | "RETRY"
  | "COMPLETION"
  | "ERROR";

export interface RunEventRetry {
  willRetry: boolean;
  mode: "NONE" | "AGENT_REASSESS" | "AUTOMATIC";
  attempt?: number;
  maxAttempts?: number;
  reason?: string;
}

export interface RunEventAttachment {
  type: "SCREENSHOT";
  artifactId: string;
  label: string;
  mimeType: "image/jpeg";
}

export interface RunEventInput {
  message: string;
  type?: RunEventType;
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

export type RunEventUpdate = string | RunEventInput;
export type RunEventSink = (event: RunEventUpdate) => void;

const SECRET_KEY = /(?:password|passwd|secret|token|authorization|cookie|credential|api[-_]?key)/i;
const RAW_PAGE_KEY = /^(?:content|data|image|html|innerHTML|outerHTML|rawDOM|dom|visibleText|elements|frames|snapshot)$/i;
const BASE64_LIKE = /(?:data:image\/[a-z0-9.+-]+;base64,)?[A-Za-z0-9+/]{96,}={0,2}/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/gi;
const NAMED_SECRET = /\b(password|passwd|secret|token|authorization|cookie|credential|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi;
const SAFE_ARTIFACT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;

export function sanitizeTraceText(value: unknown, maxLength = 800): string {
  let text = typeof value === "string" ? value : value instanceof Error ? value.message : String(value);
  if (/<!doctype\s+html|<html\b|<\/?[a-z][^>]*>|"visibleText"\s*:|"elements"\s*:/i.test(text)) {
    return "[页面原始内容已隐藏]";
  }
  text = text
    .replace(BASE64_LIKE, "[二进制数据已隐藏]")
    .replace(BEARER_TOKEN, "Bearer [密钥已隐藏]")
    .replace(NAMED_SECRET, (_match, name: string) => `${name}=[密钥已隐藏]`)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (text.length > maxLength) return `${text.slice(0, maxLength)}…`;
  return text;
}

export function sanitizeTraceData(value: unknown, depth = 0): SafeTraceValue {
  return sanitizeTraceDataInternal(value, depth, []);
}

function sanitizeTraceDataInternal(
  value: unknown,
  depth: number,
  sensitiveValues: readonly string[],
): SafeTraceValue {
  if (depth > 4) return "[内容已截断]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return redactSensitiveText(value, sensitiveValues, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeTraceDataInternal(entry, depth + 1, sensitiveValues));
  }
  if (typeof value !== "object") return redactSensitiveText(value, sensitiveValues, 200);
  const output: Record<string, SafeTraceValue> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    if (SECRET_KEY.test(key)) {
      output[key] = "[密钥已隐藏]";
    } else if (RAW_PAGE_KEY.test(key)) {
      output[key] = "[页面/媒体原始内容已隐藏]";
    } else {
      output[key] = sanitizeTraceDataInternal(entry, depth + 1, sensitiveValues);
    }
  }
  return output;
}

export function sanitizeRunAttachment(value: unknown): RunEventAttachment | null {
  const input = asRecord(value);
  if (input.type !== "SCREENSHOT"
    || typeof input.artifactId !== "string"
    || !SAFE_ARTIFACT_ID.test(input.artifactId)
    || input.mimeType !== "image/jpeg") {
    return null;
  }
  return {
    type: "SCREENSHOT",
    artifactId: input.artifactId,
    // Labels are deliberately generic. Model-provided labels can contain a
    // shipment reference and must never become public artifact metadata.
    label: "浏览器页面截图",
    mimeType: "image/jpeg",
  };
}

export function summarizeToolCall(toolName: string, args: unknown): SafeTraceValue {
  const input = asRecord(args);
  switch (toolName) {
    case "browser_open":
      return { url: safeUrl(input.url) };
    case "browser_fill":
      return { ref: safeRef(input.ref), input: "[输入内容已隐藏]" };
    case "browser_select":
      return { ref: safeRef(input.ref), option: "[选择内容已隐藏]" };
    case "browser_click":
      return { ref: safeRef(input.ref) };
    case "browser_press":
      return { ref: safeRef(input.ref), key: sanitizeTraceText(input.key, 40) };
    case "browser_screenshot":
      return { capture: "当前浏览器可见区域", media: "[截图内容通过受保护附件提供]" };
    case "browser_scroll":
      return { deltaY: finiteNumber(input.deltaY) };
    case "browser_wait":
      return { milliseconds: finiteNumber(input.milliseconds) };
    case "submit_tracking_result":
      return submissionSummary(input);
    default:
      // Unknown extensions do not get a permissive fallback: their argument
      // schema has not been reviewed for identifiers or credentials.
      return { parameters: "[未审核工具参数已隐藏]" };
  }
}

export function summarizeToolResult(
  toolName: string,
  result: unknown,
  isError: boolean,
  sensitiveValues: readonly string[] = [],
): SafeTraceValue {
  const resultRecord = asRecord(result);
  const details = asRecord(resultRecord.details);
  const base: Record<string, SafeTraceValue> = { success: !isError };
  if (isError) {
    // A rejected terminal submission is a contract-validation failure even
    // when the SDK wraps the exception in an opaque tool-result envelope. Do
    // not let that stable category degrade to the generic BROWSER fallback.
    const errorCategory = toolName === "submit_tracking_result"
      ? "VALIDATION"
      : classifyToolError(resultRecord);
    const validationIssue = toolName === "submit_tracking_result"
      ? publicSubmissionValidationIssue(resultRecord)
      : {};
    return {
      ...base,
      errorCategory,
      errorSummary: publicToolErrorSummary(errorCategory),
      ...validationIssue,
    };
  }
  switch (toolName) {
    case "browser_open":
    case "browser_snapshot":
      return {
        ...base,
        url: safeUrl(details.url),
        title: redactSensitiveText(details.title ?? "", sensitiveValues, 160),
        elementCount: finiteNumber(details.elementCount),
        challengeDetected: Boolean(details.challengeDetected),
        blockingReason: details.blockingReason == null ? null : sanitizeTraceText(details.blockingReason, 120),
      };
    case "browser_screenshot":
      return { ...base, captured: true, media: "[截图内容通过受保护附件提供]" };
    case "submit_tracking_result":
      return { ...base, ...submissionSummary(details) };
    default:
      return base;
  }
}

function publicSubmissionValidationIssue(value: Record<string, unknown>): Record<string, SafeTraceValue> {
  let text = "";
  try {
    text = JSON.stringify(value);
  } catch {
    return {};
  }
  const rules: Array<[RegExp, string]> = [
    [/Evidence source was not visited/i, "EVIDENCE_SOURCE_NOT_VISITED"],
    [/Evidence value was not observed/i, "EVIDENCE_VALUE_NOT_OBSERVED"],
    [/must echo the queried/i, "IDENTITY_ECHO_MISMATCH"],
    [/must visibly contain the queried reference|approved carrier-entered suffix/i, "QUERY_IDENTITY_EVIDENCE_MISSING"],
    [/field requires matching evidence/i, "FIELD_EVIDENCE_MISSING"],
    [/actual flag requires matching/i, "EVENT_ACTUAL_EVIDENCE_MISSING"],
    [/NOT_FOUND requires explicit/i, "NOT_FOUND_BUSINESS_EVIDENCE_MISSING"],
    [/NOT_FOUND cannot be concluded|page\/request failure/i, "NOT_FOUND_FROM_FAILED_PAGE"],
  ];
  const matched = rules.find(([pattern]) => pattern.test(text));
  if (!matched) return {};
  const output: Record<string, SafeTraceValue> = { validationCode: matched[1] };
  const field = text.match(/(?:declared method|matching evidence|actual flag requires matching[^:]*):\s*((?:shipment|containers)\.[A-Za-z0-9_.-]+)/i)?.[1];
  if (field) output.validationField = publicValidationField(field);
  return output;
}

function publicValidationField(field: string): string {
  const withoutContainerIdentity = field.replace(
    /^containers\.[^.]+(?=\.|$)/i,
    "containers.[箱号已隐藏]",
  );
  return sanitizeTraceText(withoutContainerIdentity, 120);
}

export function toolResultAttachments(toolName: string, result: unknown): RunEventAttachment[] {
  if (toolName !== "browser_screenshot") return [];
  const details = asRecord(asRecord(result).details);
  const attachment = sanitizeRunAttachment({
    type: "SCREENSHOT",
    artifactId: details.artifactId,
    label: details.label,
    mimeType: details.mimeType,
  });
  return attachment ? [attachment] : [];
}

export function redactSensitiveText(value: unknown, sensitiveValues: readonly string[], maxLength = 800): string {
  // Sanitize slightly beyond the public boundary so a sensitive value crossing
  // the truncation edge is redacted as a whole instead of leaking a prefix.
  let text = sanitizeTraceText(value, maxLength + 4096);
  for (const candidate of sensitiveValues) {
    const secret = candidate.trim();
    if (secret.length < 4) continue;
    text = text.replace(new RegExp(escapeRegExp(secret), "gi"), "[业务标识已隐藏]");
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function sanitizeTraceDataWithRedactions(
  value: unknown,
  sensitiveValues: readonly string[],
): SafeTraceValue {
  return sanitizeTraceDataInternal(value, 0, sensitiveValues);
}

function submissionSummary(value: Record<string, unknown>): Record<string, SafeTraceValue> {
  return {
    status: sanitizeTraceText(value.status ?? "UNKNOWN", 40),
    containerCount: Array.isArray(value.containers) ? value.containers.length : 0,
    evidenceCount: Array.isArray(value.evidence) ? value.evidence.length : 0,
    warningCount: Array.isArray(value.warnings) ? value.warnings.length : 0,
  };
}

function classifyToolError(value: Record<string, unknown>): PublicToolErrorCategory {
  // Raw exception text is inspected only to choose one allowlisted category.
  // It must never cross the public trace boundary, even after redaction: an
  // exception can contain an otherwise unlabelled credential or DOM value.
  const candidate = value.error ?? value.errorMessage ?? value.message;
  const text = typeof candidate === "string"
    ? candidate.toLowerCase()
    : candidate instanceof Error
      ? candidate.message.toLowerCase()
      : "";
  if (/screenshot limit|artifact limit|5\s*mb|截图.*上限/.test(text)) return "SCREENSHOT_LIMIT";
  if (/timeout|timed out|deadline|超时/.test(text)) return "TIMEOUT";
  if (/unknown or stale|stale element|stale.*reference|过期.*控件/.test(text)) return "STALE_ELEMENT";
  if (/blocked|forbidden|access denied|captcha|security check|navigation|private host|阻断|拒绝|验证码/.test(text)) {
    return "NAVIGATION_BLOCKED";
  }
  if (/evidence|submission|schema|must |validate|validation|结构化|证据|校验/.test(text)) return "VALIDATION";
  return "BROWSER";
}

function publicToolErrorSummary(category: PublicToolErrorCategory): string {
  return ({
    TIMEOUT: "工具执行超时",
    STALE_ELEMENT: "页面控件引用已失效",
    NAVIGATION_BLOCKED: "页面访问被安全策略或站点验证阻断",
    VALIDATION: "结构化结果校验失败",
    SCREENSHOT_LIMIT: "截图资源达到安全上限",
    BROWSER: "浏览器工具执行失败",
  } as Record<PublicToolErrorCategory, string>)[category];
}

function safeRef(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  return /^e\d+$/.test(text) ? text : "";
}

function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    // Paths, query strings and fragments can all carry booking references,
    // session identifiers, or signed state. The origin is enough for an audit
    // trail to identify which public carrier site was used.
    return sanitizeTraceText(`${url.origin}/`, 500);
  } catch {
    return "[无效网址已隐藏]";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
