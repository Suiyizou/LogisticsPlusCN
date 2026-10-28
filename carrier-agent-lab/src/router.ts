import { CARRIERS } from "./carriers.js";
import {
  normalizeReference,
  type CarrierCode,
  type CarrierResolution,
  type ReferenceType,
  type TrackingRequest,
} from "./contracts.js";

const CONTAINER_PATTERN = /^[A-Z]{4}\d{7}$/;

export function resolveCarrier(request: TrackingRequest): CarrierResolution {
  const selection = request.carrier ?? "AUTO";
  const reference = normalizeReference(request.reference);
  const referenceType = inferReferenceType(request.referenceType ?? "AUTO", reference);

  if (selection === "OTHER") {
    if (!request.customUrl && !request.carrierName?.trim()) {
      return ambiguous(referenceType, [], "其他船司必须提供船司名称，建议同时提供公开货踪网址。", "NONE");
    }
    const carrierName = request.carrierName?.trim() || "Other carrier";
    if (!request.customUrl) {
      return {
        kind: "AMBIGUOUS",
        carrier: "OTHER",
        carrierName,
        trackingUrl: null,
        detectedBy: "NONE",
        confidence: 0,
        referenceType,
        warnings: ["为防止票号被发送到错误站点，请先提供并确认该船司的官方公开货踪网址。"],
        candidates: [],
      };
    }
    return {
      kind: "TRACK",
      carrier: "OTHER",
      carrierName,
      trackingUrl: request.customUrl,
      detectedBy: "CUSTOM_URL",
      confidence: 1,
      referenceType,
      warnings: ["自定义船司网址由调用方提供；本次浏览会锁定到该主机，结果必须依靠页面证据校验。"],
      candidates: [],
    };
  }

  if (selection !== "AUTO") {
    return fromExplicitCarrier(selection, referenceType, reference);
  }

  const candidates = prefixCandidates(reference);

  if (candidates.length !== 1) {
    const reason = /^\d+$/.test(reference)
      ? "纯数字订舱号在多家船司之间会重叠，不能可靠自动判定，请显式选择船司。"
      : "票号前缀无法唯一映射到已配置船司，请显式选择船司或提供其他船司网址。";
    return ambiguous(referenceType, candidates, reason, "NONE");
  }

  const carrier = CARRIERS[candidates[0]!];
  const ownershipWarning = referenceType === "CONTAINER"
    ? "箱号前缀只代表箱主，不保证当前承运船司；建议由业务数据确认船司。"
    : "船司由票号前缀推断，建议在结果页再次核对船司名称。";
  return {
    kind: carrier.mode === "EXISTING_SYSTEM" ? "DELEGATE_EXISTING" : "TRACK",
    carrier: carrier.code,
    carrierName: carrier.name,
    trackingUrl: carrier.trackingUrl,
    detectedBy: "PREFIX",
    confidence: referenceType === "CONTAINER" ? 0.65 : 0.85,
    referenceType,
    warnings: [ownershipWarning],
    candidates,
  };
}

function fromExplicitCarrier(
  carrierCode: CarrierCode,
  referenceType: ReferenceType,
  reference: string,
): CarrierResolution {
  const carrier = CARRIERS[carrierCode];
  const conflicting = prefixCandidates(reference).filter((candidate) => candidate !== carrierCode);
  const existingSystemConflict = conflicting.find(
    (candidate) => CARRIERS[candidate].mode === "EXISTING_SYSTEM",
  );
  if (existingSystemConflict) {
    const routedCarrier = CARRIERS[existingSystemConflict];
    return {
      kind: "DELEGATE_EXISTING",
      carrier: routedCarrier.code,
      carrierName: routedCarrier.name,
      trackingUrl: routedCarrier.trackingUrl,
      detectedBy: "PREFIX",
      confidence: 1,
      referenceType,
      warnings: [
        `票号前缀属于 ${routedCarrier.name}，与人工选择的 ${carrier.name} 冲突；为避免把票号提交到错误官网，已改交现有准确查询通道。`,
      ],
      candidates: [routedCarrier.code],
    };
  }
  return {
    kind: carrier.mode === "EXISTING_SYSTEM" ? "DELEGATE_EXISTING" : "TRACK",
    carrier: carrier.code,
    carrierName: carrier.name,
    trackingUrl: carrier.trackingUrl,
    detectedBy: "EXPLICIT",
    confidence: 1,
    referenceType,
    warnings: conflicting.length === 1
      ? [`票号前缀更像 ${CARRIERS[conflicting[0]!].name}，当前仍按人工选择的 ${carrier.name} 查询，请先核对船司。`]
      : [],
    candidates: [carrier.code],
  };
}

function prefixCandidates(reference: string): CarrierCode[] {
  return (Object.keys(CARRIERS) as CarrierCode[]).filter((code) =>
    CARRIERS[code].strongPrefixes.some((prefix) => reference.startsWith(prefix)),
  );
}

function inferReferenceType(selected: ReferenceType, reference: string): ReferenceType {
  if (selected !== "AUTO") return selected;
  if (CONTAINER_PATTERN.test(reference)) return "CONTAINER";
  return "AUTO";
}

function ambiguous(
  referenceType: ReferenceType,
  candidates: CarrierCode[],
  warning: string,
  detectedBy: CarrierResolution["detectedBy"],
): CarrierResolution {
  return {
    kind: "AMBIGUOUS",
    carrier: null,
    carrierName: null,
    trackingUrl: null,
    detectedBy,
    confidence: 0,
    referenceType,
    warnings: [warning],
    candidates,
  };
}
