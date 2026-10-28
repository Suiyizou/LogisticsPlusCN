import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BrowserSession } from "../browser/browser-session.js";
import {
  AgentSubmissionSchema,
  normalizeReference,
  type AgentSubmission,
  type ReferenceType,
} from "../contracts.js";

export interface BrowserToolSet {
  tools: ToolDefinition[];
  getSubmission(): AgentSubmission | null;
}

interface ExpectedQuery {
  reference: string;
  referenceType: ReferenceType;
  evidenceReferenceCandidates?: string[];
}

export function createBrowserTools(
  browser: BrowserSession,
  _onEvent: (message: string) => void,
  expectedQuery: ExpectedQuery,
): BrowserToolSet {
  let submission: AgentSubmission | null = null;

  const tools: ToolDefinition[] = [
    defineTool({
      name: "browser_open",
      label: "Open browser page",
      description: "Navigate the real browser to a public HTTPS page.",
      promptSnippet: "Open a public tracking page in the real browser",
      parameters: Type.Object({ url: Type.String({ minLength: 8, maxLength: 2048 }) }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        const page = await browser.open(params.url);
        return {
          content: [{ type: "text", text: JSON.stringify(page) }],
          details: page,
        };
      },
    }),
    defineTool({
      name: "browser_snapshot",
      label: "Inspect browser DOM",
      description: "Return visible page text and stable references for interactive DOM elements across frames.",
      promptSnippet: "Inspect visible text and interactive DOM elements",
      parameters: Type.Object({}),
      executionMode: "sequential",
      async execute(_toolCallId, _params, signal) {
        signal?.throwIfAborted();
        const snapshot = await browser.snapshot();
        return {
          content: [{ type: "text", text: JSON.stringify(snapshot) }],
          details: {
            url: snapshot.url,
            elementCount: snapshot.elements.length,
            challengeDetected: snapshot.challengeDetected,
            blockingReason: snapshot.blockingReason,
          },
        };
      },
    }),
    defineTool({
      name: "browser_screenshot",
      label: "View browser screenshot",
      description: "Capture the current browser viewport and return it to the vision model.",
      promptSnippet: "Capture the current page for visual inspection",
      parameters: Type.Object({ label: Type.Optional(Type.String({ maxLength: 60 })) }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        const shot = await browser.screenshotForAgent(params.label ?? "page");
        return {
          content: [
            { type: "text", text: JSON.stringify({ url: shot.url }) },
            { type: "image", data: shot.data, mimeType: shot.mimeType },
          ],
          details: {
            url: shot.url,
            artifactId: shot.artifactId,
            label: shot.label,
            mimeType: shot.mimeType,
          },
        };
      },
    }),
    defineTool({
      name: "browser_fill",
      label: "Fill browser field",
      description: "Fill a visible input referenced by the latest DOM snapshot.",
      parameters: Type.Object({
        ref: Type.String({ pattern: "^e[0-9]+$" }),
        value: Type.String({ maxLength: 2000 }),
      }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        await browser.fill(params.ref, params.value);
        return { content: [{ type: "text", text: "Field filled" }], details: { ref: params.ref } };
      },
    }),
    defineTool({
      name: "browser_click",
      label: "Click browser element",
      description: "Click a visible element referenced by the latest DOM snapshot.",
      parameters: Type.Object({ ref: Type.String({ pattern: "^e[0-9]+$" }) }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        await browser.click(params.ref);
        return { content: [{ type: "text", text: "Element clicked" }], details: { ref: params.ref } };
      },
    }),
    defineTool({
      name: "browser_select",
      label: "Select browser option",
      description: "Select an option value in a native select element from the latest DOM snapshot.",
      parameters: Type.Object({
        ref: Type.String({ pattern: "^e[0-9]+$" }),
        value: Type.String({ maxLength: 500 }),
      }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        await browser.selectOption(params.ref, params.value);
        return { content: [{ type: "text", text: "Option selected" }], details: { ref: params.ref } };
      },
    }),
    defineTool({
      name: "browser_press",
      label: "Press browser key",
      description: "Press a keyboard key globally or on an element from the latest snapshot.",
      parameters: Type.Object({
        key: Type.String({ minLength: 1, maxLength: 80 }),
        ref: Type.Optional(Type.String({ pattern: "^e[0-9]+$" })),
      }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        await browser.press(params.key, params.ref);
        return { content: [{ type: "text", text: "Key pressed" }], details: { key: params.key, ref: params.ref } };
      },
    }),
    defineTool({
      name: "browser_scroll",
      label: "Scroll browser page",
      description: "Scroll the real browser viewport using a mouse-wheel event.",
      parameters: Type.Object({ deltaY: Type.Number({ minimum: -5000, maximum: 5000 }) }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        await browser.scroll(params.deltaY);
        return { content: [{ type: "text", text: "Page scrolled" }], details: { deltaY: params.deltaY } };
      },
    }),
    defineTool({
      name: "browser_wait",
      label: "Wait for browser page",
      description: "Wait briefly for a page transition or dynamic content, then take another snapshot.",
      parameters: Type.Object({ milliseconds: Type.Integer({ minimum: 0, maximum: 10000 }) }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        await browser.wait(params.milliseconds);
        return { content: [{ type: "text", text: "Wait complete" }], details: { milliseconds: params.milliseconds } };
      },
    }),
    defineTool({
      name: "submit_tracking_result",
      label: "Submit shipment result",
      description: "Validate and submit the final evidence-backed shipment tracking result. This must be the final action.",
      promptSnippet: "Submit the final structured shipment result",
      promptGuidelines: [
        "Call submit_tracking_result exactly once as the final action.",
        "Never infer a shipment fact without visible DOM or screenshot evidence.",
        "Declare DOM only for text returned by browser_snapshot. Declare screenshot-read facts as VISION and use the exact URL returned by browser_screenshot.",
        "For a blocked page, submit immediately with field blockingNotice and the exact visible blocker text (for example Access Denied or 403 Forbidden) as DOM evidence; never use the URL as the evidence value.",
        "For each non-empty shipment field, use the exact evidence field name such as shipment.status, shipment.eta, shipment.origin, shipment.destination, shipment.vessel, or shipment.voyage.",
        "For NOT_FOUND, keep every shipment field null and containers empty. Cite the exact visible business-negative sentence as DOM or HYBRID evidence (for example field notFoundNotice); never use the literal NOT_FOUND as an evidence value.",
        "If the trusted carrier rule removes a prefix, keep the full original identifier in shipment, but use the exact visible suffix (not a constructed full value) in the matching identity evidence item.",
        "Prefer a minimal fully cited result. Omit optional fields and event arrays unless every returned value is exact visible text with matching field evidence.",
        "For container facts, use evidence fields like containers.<NUMBER>.number, containers.<NUMBER>.status, and containers.<NUMBER>.currentLocation.",
        "For container event facts, use containers.<NUMBER>.events.<INDEX>.<FIELD>, with zero-based event indexes.",
      ],
      parameters: AgentSubmissionSchema,
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        signal?.throwIfAborted();
        if (submission) throw new Error("A tracking result was already submitted");
        const candidate = structuredClone(params) as AgentSubmission;
        for (const evidence of candidate.evidence) {
          const resolvedSource = browser.resolveObservedEvidenceSource?.(
            evidence.sourceUrl,
            evidence.method,
            evidence.value,
          );
          if (resolvedSource) evidence.sourceUrl = resolvedSource;
          normalizeConfiguredPrefixEvidence(evidence, expectedQuery, browser);
        }
        if (candidate.status === "NOT_FOUND") normalizeNotFoundCandidate(candidate, browser);
        if (candidate.status === "FOUND") {
          normalizeStructuredIdentity(candidate, expectedQuery);
          pruneUnobservedOptionalFoundEvidence(candidate, browser);
        }
        try {
          validateSubmissionForQuery(
            candidate,
            expectedQuery,
            (sourceUrl) => browser.wasVisited(sourceUrl),
            (sourceUrl, method, value) => browser.evidenceWasObserved(sourceUrl, method, value),
            (sourceUrl) => browser.blockingReasonFor(sourceUrl),
          );
        } catch (error) {
          throw error;
        }
        submission = candidate;
        return {
          content: [{ type: "text", text: `Tracking result accepted: ${candidate.status}` }],
          details: candidate,
          terminate: true,
        };
      },
    }),
  ];

  return { tools, getSubmission: () => submission };
}

const OPTIONAL_SHIPMENT_FIELDS = new Set([
  "shipment.status",
  "shipment.origin",
  "shipment.destination",
  "shipment.etd",
  "shipment.eta",
  "shipment.actualdeparture",
  "shipment.actualarrival",
  "shipment.vessel",
  "shipment.voyage",
]);

function pruneUnobservedOptionalFoundEvidence(
  submission: AgentSubmission,
  browser: BrowserSession,
): void {
  const rejectedFields = new Set<string>();
  submission.evidence = submission.evidence.filter((evidence) => {
    const field = evidence.field.toLowerCase();
    if (!OPTIONAL_SHIPMENT_FIELDS.has(field)) return true;
    const observed = browser.wasVisited(evidence.sourceUrl)
      && browser.evidenceWasObserved(evidence.sourceUrl, evidence.method, evidence.value);
    if (!observed) rejectedFields.add(field);
    return observed;
  });
  if (rejectedFields.size === 0) return;

  const fieldToProperty: Record<string, keyof AgentSubmission["shipment"]> = {
    "shipment.status": "status",
    "shipment.origin": "origin",
    "shipment.destination": "destination",
    "shipment.etd": "etd",
    "shipment.eta": "eta",
    "shipment.actualdeparture": "actualDeparture",
    "shipment.actualarrival": "actualArrival",
    "shipment.vessel": "vessel",
    "shipment.voyage": "voyage",
  };
  for (const field of rejectedFields) {
    const stillSupported = submission.evidence.some((evidence) => evidence.field.toLowerCase() === field);
    if (!stillSupported) submission.shipment[fieldToProperty[field]!] = null;
  }
  submission.warnings.push(
    "Optional shipment fields with evidence unobserved by the declared method were omitted.",
  );
}

function normalizeNotFoundCandidate(
  submission: AgentSubmission,
  browser: BrowserSession,
): void {
  // A business-negative result contains no shipment facts. Models sometimes
  // mirror the enum value into shipment.status and cite it even though the
  // page actually says "No results found". Remove only unobserved structured
  // evidence, then let the strict DOM/HYBRID business-negative validator below
  // prove the NOT_FOUND conclusion from the remaining exact page text.
  submission.shipment = {
    bookingNumber: null,
    billOfLading: null,
    status: null,
  };
  submission.containers = [];
  submission.evidence = submission.evidence.filter((evidence) => {
    const field = evidence.field.toLowerCase();
    const structuredField = field.startsWith("shipment.") || field.startsWith("containers.");
    if (!structuredField) return true;
    return browser.wasVisited(evidence.sourceUrl)
      && browser.evidenceWasObserved(evidence.sourceUrl, evidence.method, evidence.value);
  });
}

function normalizeStructuredIdentity(
  submission: AgentSubmission,
  query: ExpectedQuery,
): void {
  if (query.referenceType !== "BOOKING" && query.referenceType !== "BILL_OF_LADING") return;
  const expected = normalizeReference(query.reference);
  const identityCandidates = normalizedEvidenceReferenceCandidates(query);
  const canonicalField = query.referenceType === "BOOKING"
    ? "shipment.bookingNumber"
    : "shipment.billOfLading";
  if (query.referenceType === "BOOKING") {
    submission.shipment.bookingNumber = expected;
    submission.shipment.billOfLading = null;
  } else {
    submission.shipment.bookingNumber = null;
    submission.shipment.billOfLading = expected;
  }
  for (const evidence of submission.evidence) {
    const field = evidence.field.toLowerCase();
    const identityField = field === "shipment.bookingnumber" || field === "shipment.billoflading";
    if (identityField && evidenceContainsReferenceCandidate(evidence.value, identityCandidates)) {
      evidence.field = canonicalField;
    }
  }
}

function normalizeConfiguredPrefixEvidence(
  evidence: AgentSubmission["evidence"][number],
  query: ExpectedQuery,
  browser: BrowserSession,
): void {
  const expected = normalizeReference(query.reference);
  const field = evidence.field.toLowerCase();
  const matchesIdentityField = query.referenceType !== "CONTAINER"
    && (field === "shipment.bookingnumber" || field === "shipment.billoflading");
  if (!matchesIdentityField) return;

  const suffixes = [...new Set((query.evidenceReferenceCandidates ?? [])
    .map((value) => normalizeReference(value))
    .filter((value) => value && value !== expected))];
  if (!evidenceContainsReferenceCandidate(evidence.value, [expected, ...suffixes])) return;
  for (const suffix of suffixes) {
    const methods = [...new Set([evidence.method, "DOM", "VISION"] as const)];
    for (const method of methods) {
      const sourceUrl = browser.resolveObservedEvidenceSource?.(evidence.sourceUrl, method, suffix)
        ?? evidence.sourceUrl;
      if (!browser.wasVisited(sourceUrl)
        || !browser.evidenceWasObserved(sourceUrl, method, suffix)) continue;
      evidence.value = suffix;
      evidence.sourceUrl = sourceUrl;
      evidence.method = method;
      return;
    }
  }
  if (browser.wasVisited(evidence.sourceUrl)
    && browser.evidenceWasObserved(evidence.sourceUrl, evidence.method, evidence.value)) {
    return;
  }
}

function validateSubmissionForQuery(
  submission: AgentSubmission,
  query: {
    reference: string;
    referenceType: ReferenceType;
    evidenceReferenceCandidates?: string[];
  },
  sourceWasVisited: (sourceUrl: string) => boolean,
  evidenceWasObserved: (sourceUrl: string, method: "DOM" | "VISION" | "HYBRID", value: string) => boolean,
  blockingReasonFor: (sourceUrl: string) => string | null,
): void {
  for (const evidence of submission.evidence) {
    if (!sourceWasVisited(evidence.sourceUrl)) {
      throw new Error(`Evidence source was not visited in this browser run: ${evidence.sourceUrl}`);
    }
    if (!evidenceWasObserved(evidence.sourceUrl, evidence.method, evidence.value)) {
      throw new Error(`Evidence value was not observed by its declared method: ${evidence.field}`);
    }
  }
  if (submission.status === "NOT_FOUND") {
    validateNotFoundSubmission(submission, blockingReasonFor);
  }
  if (submission.status === "HUMAN_REQUIRED") {
    validateHumanRequiredSubmission(submission, blockingReasonFor);
  }
  if (submission.status !== "FOUND") return;
  const expected = normalizeReference(query.reference);
  const evidenceReferenceCandidates = normalizedEvidenceReferenceCandidates(query);
  if (query.referenceType === "BOOKING"
    && normalizeReference(submission.shipment.bookingNumber ?? "") !== expected) {
    throw new Error(`FOUND bookingNumber must echo the queried booking reference: ${expected}`);
  }
  if (query.referenceType === "BILL_OF_LADING"
    && normalizeReference(submission.shipment.billOfLading ?? "") !== expected) {
    throw new Error(`FOUND billOfLading must echo the queried bill reference: ${expected}`);
  }
  if (query.referenceType === "CONTAINER"
    && !submission.containers.some((container) => normalizeReference(container.number) === expected)) {
    throw new Error(`FOUND containers must include the queried container reference: ${expected}`);
  }
  if (query.referenceType === "AUTO") {
    const matchesKnownField = normalizeReference(submission.shipment.bookingNumber ?? "") === expected
      || normalizeReference(submission.shipment.billOfLading ?? "") === expected
      || submission.containers.some((container) => normalizeReference(container.number) === expected);
    if (!matchesKnownField) {
      throw new Error(`FOUND result must echo the AUTO query in bookingNumber, billOfLading, or containers: ${expected}`);
    }
  }
  if (!submission.evidence.some((evidence) => evidenceReferenceCandidates.some(
    (candidate) => normalizeReference(evidence.value).includes(candidate),
  ))) {
    throw new Error(`FOUND evidence must visibly contain the queried reference or an approved carrier-entered suffix: ${expected}`);
  }
  const shipmentFields: Array<[string, string | null | undefined]> = [
    ["shipment.bookingNumber", submission.shipment.bookingNumber],
    ["shipment.billOfLading", submission.shipment.billOfLading],
    ["shipment.status", submission.shipment.status],
    ["shipment.origin", submission.shipment.origin],
    ["shipment.destination", submission.shipment.destination],
    ["shipment.etd", submission.shipment.etd],
    ["shipment.eta", submission.shipment.eta],
    ["shipment.actualDeparture", submission.shipment.actualDeparture],
    ["shipment.actualArrival", submission.shipment.actualArrival],
    ["shipment.vessel", submission.shipment.vessel],
    ["shipment.voyage", submission.shipment.voyage],
  ];
  for (const [field, value] of shipmentFields) {
    const identityAlternates = (field === "shipment.bookingNumber" || field === "shipment.billOfLading")
      && normalizeReference(value ?? "") === expected
      ? evidenceReferenceCandidates.slice(1)
      : [];
    requireFieldEvidence(submission, field, value, identityAlternates);
  }
  for (const container of submission.containers) {
    const prefix = `containers.${normalizeReference(container.number)}`;
    requireFieldEvidence(submission, `${prefix}.number`, container.number);
    requireFieldEvidence(submission, `${prefix}.type`, container.type);
    requireFieldEvidence(submission, `${prefix}.status`, container.status);
    requireFieldEvidence(submission, `${prefix}.currentLocation`, container.currentLocation);
    requireFieldEvidence(submission, `${prefix}.latestEvent`, container.latestEvent);
    for (const [index, event] of (container.events ?? []).entries()) {
      const eventPrefix = `${prefix}.events.${index}`;
      requireFieldEvidence(submission, `${eventPrefix}.name`, event.name);
      requireFieldEvidence(submission, `${eventPrefix}.occurredAt`, event.occurredAt);
      requireFieldEvidence(submission, `${eventPrefix}.estimatedAt`, event.estimatedAt);
      requireFieldEvidence(submission, `${eventPrefix}.location`, event.location);
      requireFieldEvidence(submission, `${eventPrefix}.vessel`, event.vessel);
      requireFieldEvidence(submission, `${eventPrefix}.voyage`, event.voyage);
      requireFieldEvidence(submission, `${eventPrefix}.transportMode`, event.transportMode);
      requireActualEvidence(submission, `${eventPrefix}.actual`, event.actual);
    }
  }
}

const BUSINESS_NOT_FOUND_PATTERNS = [
  /\b(?:no|zero)\s+(?:matching\s+)?(?:shipments?|bookings?|bills?\s+of\s+lading|b\/?ls?|containers?|tracking\s+records?|records?|results?|data)\s+(?:(?:was|were)\s+)?found\b/i,
  /\b(?:shipments?|bookings?|bills?\s+of\s+lading|b\/?ls?|containers?|tracking\s+records?|records?)\b.{0,80}\b(?:not\s+found|does\s+not\s+exist|no\s+match)\b/i,
  /\b(?:0|zero)\s+(?:matching\s+)?results?\b/i,
  /\bno\s+matching\s+(?:shipments?|bookings?|bills?\s+of\s+lading|b\/?ls?|containers?|records?|results?)\b/i,
  /\bthere\s+(?:is|are)\s+no\s+(?:tracking\s+)?(?:information|records?|results?)\s+(?:for|matching)\b/i,
  /^(?:no\s+results?|no\s+data\s+found)[.!]?$/i,
  /(?:未找到|没有找到|找不到|无匹配|没有匹配).{0,30}(?:货物|货运|提单|订舱|箱号?|集装箱|记录|结果|数据|货踪|跟踪|追踪)/u,
  /(?:货物|货运|提单|订舱|箱号?|集装箱|记录|结果|数据|货踪|跟踪|追踪).{0,30}(?:未找到|没有找到|找不到|无匹配|没有匹配)/u,
  /(?:查询无结果|暂无(?:货踪|跟踪|追踪)(?:信息|数据|记录)|暂无(?:提单|订舱|箱号?|集装箱)(?:信息|数据|记录))/u,
];

const PAGE_FAILURE_PATTERNS = [
  /\bpage\s+request\s+(?:is|was)\s+unrecognized\b/i,
  /\brequest\s+(?:was\s+)?rejected\b/i,
  /\bincident\s*(?:id|number|reference)\b/i,
  /\baccess\s+denied\b|\bpermission\s+to\s+access\b|\bforbidden\b/i,
  /\b(?:gateway|request|connection|operation)\s+timed?\s*out\b|\btimeout\b/i,
  /\b(?:page|service)\s+unavailable\b|\binternal\s+server\s+error\b|\bbad\s+gateway\b/i,
  /\b404\s+not\s+found\b/i,
  /(?:页面请求无法识别|请求被拒绝|拒绝访问|请求超时|服务器错误|(?:页面|网页)(?:未找到|不存在|无法访问)|(?:未找到|找不到).{0,20}(?:页面|网页)|您访问的(?:页面|网页).{0,20}(?:不存在|未找到)|404(?:错误|页面))/u,
];

const HUMAN_REQUIRED_PATTERNS = [
  /\bcaptcha\b|verify\s+(?:that\s+)?you\s+are\s+human|human\s+verification/i,
  /security\s+(?:verification|check)|checking\s+your\s+browser|slider?\s+(?:verification|challenge)/i,
  /\baccess\s+denied\b|\bpermission\s+to\s+access\b|\bforbidden\b|\bimperva\b|\bincapsula\b/i,
  /\b(?:log\s*in|sign\s*in)\b.{0,80}(?:required|continue|track|view)/i,
  /(?:人机验证|安全验证|验证码|滑块验证|拒绝访问|无权访问|请先登录|需要登录|登录后.{0,20}(?:查询|查看))/u,
];

function validateNotFoundSubmission(
  submission: AgentSubmission,
  blockingReasonFor: (sourceUrl: string) => string | null,
): void {
  for (const sourceUrl of new Set(submission.evidence.map((evidence) => evidence.sourceUrl))) {
    const blockingReason = blockingReasonFor(sourceUrl);
    if (blockingReason) {
      throw new Error(
        `NOT_FOUND cannot be concluded from a blocked or failed page (${blockingReason}); submit ERROR or HUMAN_REQUIRED`,
      );
    }
  }

  const visibleBusinessEvidence = submission.evidence.filter(
    (evidence) => evidence.method === "DOM" || evidence.method === "HYBRID",
  );
  if (visibleBusinessEvidence.some((evidence) =>
    PAGE_FAILURE_PATTERNS.some((pattern) => pattern.test(evidence.value)))) {
    throw new Error("NOT_FOUND evidence describes a page/request failure; submit ERROR or HUMAN_REQUIRED");
  }
  if (!visibleBusinessEvidence.some((evidence) =>
    BUSINESS_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(evidence.value.trim())))) {
    throw new Error("NOT_FOUND requires explicit DOM or HYBRID evidence of no matching shipment or zero results");
  }
}

function validateHumanRequiredSubmission(
  submission: AgentSubmission,
  blockingReasonFor: (sourceUrl: string) => string | null,
): void {
  if (Object.values(submission.shipment).some((value) => value !== null && value !== undefined)
    || submission.containers.length > 0) {
    throw new Error("HUMAN_REQUIRED must keep shipment fields null and containers empty");
  }

  const hasRecordedSecurityCheck = submission.evidence.some(
    (evidence) => blockingReasonFor(evidence.sourceUrl) === "SECURITY_CHECK",
  );
  if (hasRecordedSecurityCheck) return;

  const hasVisibleHumanBlocker = submission.evidence.some((evidence) =>
    (evidence.method === "DOM" || evidence.method === "HYBRID")
      && HUMAN_REQUIRED_PATTERNS.some((pattern) => pattern.test(evidence.value.trim())));
  if (!hasVisibleHumanBlocker) {
    throw new Error(
      "HUMAN_REQUIRED requires explicit DOM or HYBRID human-intervention blocker evidence or a recorded SECURITY_CHECK",
    );
  }
}

function normalizedEvidenceReferenceCandidates(query: ExpectedQuery): string[] {
  return [...new Set([
    normalizeReference(query.reference),
    ...(query.evidenceReferenceCandidates ?? [])
      .map((value) => normalizeReference(value))
      .filter(Boolean),
  ])];
}

function evidenceContainsReferenceCandidate(value: string, candidates: string[]): boolean {
  const normalizedValue = normalizeReference(value);
  return candidates.some((candidate) => normalizedValue.includes(candidate));
}

function requireFieldEvidence(
  submission: AgentSubmission,
  field: string,
  value: string | null | undefined,
  alternateValues: string[] = [],
): void {
  if (!value) return;
  const acceptableValues = [value, ...alternateValues]
    .map((candidate) => normalizeEvidenceValue(candidate))
    .filter(Boolean);
  const matched = submission.evidence.some((evidence) =>
    evidence.field.toLowerCase() === field.toLowerCase()
      && acceptableValues.some((candidate) => normalizeEvidenceValue(evidence.value).includes(candidate)),
  );
  if (!matched) throw new Error(`FOUND field requires matching evidence: ${field}`);
}

function normalizeEvidenceValue(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function requireActualEvidence(
  submission: AgentSubmission,
  field: string,
  actual: boolean | undefined,
): void {
  if (actual === undefined) return;
  const expectedWord = actual ? "actual" : "estimated";
  const matched = submission.evidence.some((evidence) =>
    evidence.field.toLowerCase() === field.toLowerCase()
      && normalizeEvidenceValue(evidence.value).includes(expectedWord),
  );
  if (!matched) throw new Error(`FOUND event actual flag requires matching ${expectedWord} evidence: ${field}`);
}
