import { Type, type Static } from "typebox";

export const CarrierCodeSchema = Type.Union([
  Type.Literal("MAERSK"),
  Type.Literal("OOCL"),
  Type.Literal("CMA"),
  Type.Literal("COSCO"),
  Type.Literal("HAPAG_LLOYD"),
  Type.Literal("MSC"),
  Type.Literal("MATSON"),
  Type.Literal("ONE"),
  Type.Literal("HMM"),
  Type.Literal("EVERGREEN"),
  Type.Literal("YANG_MING"),
  Type.Literal("WAN_HAI"),
  Type.Literal("ZIM"),
]);

export type CarrierCode = Static<typeof CarrierCodeSchema>;

export const CarrierSelectionSchema = Type.Union([
  Type.Literal("AUTO"),
  CarrierCodeSchema,
  Type.Literal("OTHER"),
]);

export const ReferenceTypeSchema = Type.Union([
  Type.Literal("AUTO"),
  Type.Literal("BOOKING"),
  Type.Literal("BILL_OF_LADING"),
  Type.Literal("CONTAINER"),
]);

export type ReferenceType = Static<typeof ReferenceTypeSchema>;

export const TrackingRequestSchema = Type.Object(
  {
    reference: Type.String({
      minLength: 4,
      maxLength: 40,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._/-]{3,39}$",
    }),
    carrier: Type.Optional(CarrierSelectionSchema),
    referenceType: Type.Optional(ReferenceTypeSchema),
    carrierName: Type.Optional(Type.String({ minLength: 2, maxLength: 160 })),
    customUrl: Type.Optional(Type.String({ minLength: 8, maxLength: 2048 })),
    headed: Type.Optional(Type.Boolean()),
    demo: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export type TrackingRequest = Static<typeof TrackingRequestSchema>;

const MaybeString = Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()]));
const NullableString = Type.Union([Type.String({ maxLength: 500 }), Type.Null()]);

export const TrackingEventSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 240 }),
    occurredAt: MaybeString,
    estimatedAt: MaybeString,
    location: MaybeString,
    vessel: MaybeString,
    voyage: MaybeString,
    transportMode: MaybeString,
    actual: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const ContainerSchema = Type.Object(
  {
    number: Type.String({ minLength: 4, maxLength: 32 }),
    type: MaybeString,
    status: MaybeString,
    currentLocation: MaybeString,
    latestEvent: MaybeString,
    events: Type.Optional(Type.Array(TrackingEventSchema, { maxItems: 300 })),
  },
  { additionalProperties: false },
);

export const ShipmentSchema = Type.Object(
  {
    bookingNumber: NullableString,
    billOfLading: NullableString,
    status: NullableString,
    origin: MaybeString,
    destination: MaybeString,
    etd: MaybeString,
    eta: MaybeString,
    actualDeparture: MaybeString,
    actualArrival: MaybeString,
    vessel: MaybeString,
    voyage: MaybeString,
  },
  { additionalProperties: false },
);

export const EvidenceSchema = Type.Object(
  {
    field: Type.String({ minLength: 1, maxLength: 120 }),
    value: Type.String({ minLength: 1, maxLength: 2000 }),
    sourceUrl: Type.String({ minLength: 8, maxLength: 2048 }),
    method: Type.Union([Type.Literal("DOM"), Type.Literal("VISION"), Type.Literal("HYBRID")]),
  },
  { additionalProperties: false },
);

export const AgentSubmissionSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("FOUND"),
      Type.Literal("NOT_FOUND"),
      Type.Literal("HUMAN_REQUIRED"),
      Type.Literal("ERROR"),
    ]),
    shipment: ShipmentSchema,
    containers: Type.Array(ContainerSchema, { maxItems: 500 }),
    evidence: Type.Array(EvidenceSchema, { minItems: 1, maxItems: 100 }),
    warnings: Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 50 }),
    note: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export type AgentSubmission = Static<typeof AgentSubmissionSchema>;

export interface CarrierResolution {
  kind: "TRACK" | "AMBIGUOUS" | "DELEGATE_EXISTING";
  carrier: CarrierCode | "OTHER" | null;
  carrierName: string | null;
  trackingUrl: string | null;
  detectedBy: "EXPLICIT" | "PREFIX" | "CUSTOM_URL" | "AGENT_DISCOVERY" | "NONE";
  confidence: number;
  referenceType: ReferenceType;
  warnings: string[];
  candidates: CarrierCode[];
}

export interface TrackingResult {
  schemaVersion: "1.0";
  runId: string;
  status:
    | AgentSubmission["status"]
    | "AMBIGUOUS"
    | "DELEGATED_TO_EXISTING";
  carrier: {
    code: CarrierCode | "OTHER" | null;
    name: string | null;
    trackingUrl: string | null;
    detectedBy: CarrierResolution["detectedBy"];
    confidence: number;
  };
  query: {
    reference: string;
    referenceType: ReferenceType;
  };
  fetchedAt: string;
  shipment: Static<typeof ShipmentSchema> | null;
  containers: Static<typeof ContainerSchema>[];
  evidence: Static<typeof EvidenceSchema>[];
  warnings: string[];
  note: string | null;
}

export function buildTrackingResult(
  runId: string,
  request: TrackingRequest,
  resolution: CarrierResolution,
  submission: AgentSubmission,
): TrackingResult {
  const discoveredUrl = resolution.detectedBy === "AGENT_DISCOVERY"
    ? submission.evidence.find((evidence) => !isSearchUrl(evidence.sourceUrl))?.sourceUrl ?? resolution.trackingUrl
    : resolution.trackingUrl;
  return {
    schemaVersion: "1.0",
    runId,
    status: submission.status,
    carrier: {
      code: resolution.carrier,
      name: resolution.carrierName,
      trackingUrl: discoveredUrl,
      detectedBy: resolution.detectedBy,
      confidence: resolution.confidence,
    },
    query: {
      reference: normalizeReference(request.reference),
      referenceType: resolution.referenceType,
    },
    fetchedAt: new Date().toISOString(),
    shipment: submission.shipment,
    containers: submission.containers,
    evidence: submission.evidence,
    warnings: [...resolution.warnings, ...submission.warnings],
    note: submission.note,
  };
}

export function normalizeReference(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

function isSearchUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "www.bing.com" || host.endsWith(".bing.com");
  } catch {
    return false;
  }
}
