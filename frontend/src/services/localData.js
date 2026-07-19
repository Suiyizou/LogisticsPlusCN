import { createRouteQuote, QUOTE_CHARGE_CATEGORIES, QUOTE_SOURCE_TYPES } from "./freightQuote.js";

const customerContainerReferenceSource = "客户提供《集装箱尺寸(1).xlsx》";
const actualLoadingNote = "算法采用客户文件内尺寸；实际装柜仍受具体柜号公差、门框净开口、角柱、波纹板、地板载荷和绑扎方案影响，作业前须按船司放箱设备复核。";

export const defaultContainers = [
  {
    id: "20gp",
    name: "20GP 普柜",
    lengthCm: 590,
    widthCm: 235.2,
    heightCm: 239.5,
    payloadKg: 18000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `保守配货载重 18,000kg。${actualLoadingNote}`,
    usagePriority: "common",
    visualKind: "dry",
    ignoreHeightLimit: false,
    heightLimitCm: 239.5
  },
  {
    id: "20hq",
    name: "20HQ 高柜",
    lengthCm: 589.8,
    widthCm: 235.2,
    heightCm: 268.9,
    payloadKg: 28340,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `客户文件未提供保守配货载重，暂保留既有 28,340kg 参考值，必须按实际设备确认。原文件另有“参考高 238、门高 255”的矛盾记录，仅保留为勘误提示，未用于算法。${actualLoadingNote}`,
    usagePriority: "common",
    visualKind: "high-cube",
    ignoreHeightLimit: false,
    heightLimitCm: 268.9
  },
  {
    id: "20fr",
    name: "20FR 平板柜",
    lengthCm: 563.8,
    widthCm: 243.8,
    heightCm: 300,
    payloadKg: 22000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列平台尺寸 / 用户装载高限",
    dimensionNote: "保守配货载重 22,000kg。客户文件同时列出脚架 565×203×207.3cm、板框 563.9×222.8×223.3cm，结构差异不另建算法箱型；当前以 563.8×243.8cm 平台和 300cm 用户装载高限计算，实际 OOG、端墙、门框、绑扎和吊装边界必须逐柜复核。",
    usagePriority: "special",
    visualKind: "flat-rack",
    ignoreHeightLimit: true,
    heightLimitCm: 300
  },
  {
    id: "40gp",
    name: "40GP 普柜",
    lengthCm: 1203.2,
    widthCm: 235.2,
    heightCm: 239.5,
    payloadKg: 26000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `保守配货载重 26,000kg。${actualLoadingNote}`,
    usagePriority: "common",
    visualKind: "dry",
    ignoreHeightLimit: false,
    heightLimitCm: 239.5
  },
  {
    id: "40hq",
    name: "40HQ 高柜",
    lengthCm: 1203.2,
    widthCm: 235,
    heightCm: 270,
    payloadKg: 26000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `保守配货载重 26,000kg。原文件“门高 2525”按明显单位/小数点笔误仅作勘误提示，未用于算法。${actualLoadingNote}`,
    usagePriority: "common",
    visualKind: "high-cube",
    ignoreHeightLimit: false,
    heightLimitCm: 270
  },
  {
    id: "40fr",
    name: "40FR 平板柜",
    lengthCm: 1165.2,
    widthCm: 234.7,
    heightCm: 300,
    payloadKg: 36000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列平台尺寸 / 用户装载高限",
    dimensionNote: "保守配货载重 36,000kg。客户文件同时列出脚架 1178.4×203×194.3cm、板架 1177.6×222.8×195.5cm，结构差异不另建算法箱型；当前以 1165.2×234.7cm 平台和 300cm 用户装载高限计算，实际 OOG、端墙、门框、绑扎和吊装边界必须逐柜复核。",
    usagePriority: "special",
    visualKind: "flat-rack",
    ignoreHeightLimit: true,
    heightLimitCm: 300
  },
  {
    id: "20rf",
    name: "20RF 冷藏柜",
    lengthCm: 545,
    widthCm: 228,
    heightCm: 215.9,
    payloadKg: 17000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `保守配货载重 17,000kg。冷机、风道和回风空间不可占用，仅适用于温控运输；${actualLoadingNote}`,
    usagePriority: "special",
    visualKind: "reefer",
    ignoreHeightLimit: false,
    heightLimitCm: 215.9
  },
  {
    id: "40rf",
    name: "40RF 冷藏高柜",
    lengthCm: 1159.9,
    widthCm: 229,
    heightCm: 242.5,
    payloadKg: 22000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `保守配货载重 22,000kg。冷机、风道和回风空间不可占用，仅适用于温控运输；${actualLoadingNote}`,
    usagePriority: "special",
    visualKind: "reefer",
    ignoreHeightLimit: false,
    heightLimitCm: 242.5
  },
  {
    id: "45hq",
    name: "45HQ 高柜",
    lengthCm: 1355.6,
    widthCm: 235.2,
    heightCm: 269.8,
    payloadKg: 29000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: `保守配货载重 29,000kg。${actualLoadingNote}`,
    usagePriority: "limited",
    visualKind: "high-cube",
    equipmentClass: "HQ",
    ignoreHeightLimit: false,
    heightLimitCm: 269.8
  },
  {
    id: "20ot",
    name: "20OT 开顶柜",
    lengthCm: 589.8,
    widthCm: 235.2,
    heightCm: 234.2,
    payloadKg: 20000,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: "保守配货载重 20,000kg。开顶不等于无边界，门框、顶梁、篷布、吊装净空及超高 OOG 条件须按实际设备和订舱方案复核。",
    usagePriority: "special",
    visualKind: "open-top",
    equipmentClass: "OT",
    ignoreHeightLimit: false,
    heightLimitCm: 234.2
  },
  {
    id: "40ot",
    name: "40OT 开顶柜",
    lengthCm: 1203.4,
    widthCm: 235.2,
    heightCm: 233,
    payloadKg: 30500,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件 B 列内尺寸（装箱算法）",
    dimensionNote: "保守配货载重 30,500kg。开顶不等于无边界，门框、顶梁、篷布、吊装净空及超高 OOG 条件须按实际设备和订舱方案复核。",
    usagePriority: "special",
    visualKind: "open-top",
    equipmentClass: "OT",
    ignoreHeightLimit: false,
    heightLimitCm: 233
  }
];

export const referenceOnlyContainers = [
  {
    id: "20iso-tank",
    name: "20ISO TANK 罐箱",
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    payloadKg: 26000,
    packingEligible: false,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "罐式设备，内部装箱尺寸不适用",
    dimensionNote: "客户文件配货毛重参考 26,000kg；只读资料项，仍不进入普通货物自动装箱。罐体容积、介质兼容性、额定总重、残液和危险品条件须按具体罐箱铭牌及承运要求核定。",
    usagePriority: "special",
    visualKind: "tank",
    equipmentClass: "TANK"
  },
  {
    id: "40garment",
    name: "40 挂衣柜",
    lengthCm: 1203,
    widthCm: 235,
    heightCm: 269,
    payloadKg: null,
    packingEligible: false,
    dimensionSource: customerContainerReferenceSource,
    dimensionBasis: "客户文件内尺寸（只读资料）",
    dimensionNote: "客户文件未提供配货载重，暂不进入自动装箱；挂衣杆、内衬和实际门框会减少可用空间，须取得具体设备载重与内部配置后再启用算法。",
    usagePriority: "special",
    visualKind: "garment",
    equipmentClass: "GARMENT"
  }
];

export function cloneReferenceOnlyContainers() {
  return referenceOnlyContainers.map((item) => ({ ...item }));
}

const referenceFreightSource = "Freightos FBX01 China/East Asia to North America West Coast";
const referenceFreightSourceUrl = "https://www.freightos.com/enterprise/terminal/fbx-01-china-to-north-america-west-coast/";
const referenceFreightBasis = "USD per container, based on Freightos FBX01 40ft spot index; 20ft and special-equipment prices are planning estimates derived by equipment multipliers. Cross-check with Drewry WCI Shanghai-Los Angeles before booking.";
const PLANNING_REFERENCE_QUOTE_ID = "planning-reference-fbx01";

const defaultContainerProfiles = {
  "20gp": freightProfile(0.62, 4146, "economy", "GP"),
  "20hq": freightProfile(0.65, 4347, "economy", "HQ"),
  "40gp": freightProfile(1, 6687, "standard", "GP"),
  "40hq": freightProfile(1.03, 6890, "standard", "HQ"),
  "20rf": freightProfile(0.95, 6353, "high", "RF", "Reefer equipment estimate from dry-container FBX01 baseline."),
  "40rf": freightProfile(1.45, 9696, "special", "RF", "Reefer equipment estimate from dry-container FBX01 baseline."),
  "20fr": freightProfile(1.25, 8359, "special", "FR", "Flat-rack/OOG equipment estimate from dry-container FBX01 baseline."),
  "40fr": freightProfile(1.9, 12706, "special", "FR", "Flat-rack/OOG equipment estimate from dry-container FBX01 baseline.")
};

export const defaultRouteQuotes = [createRouteQuote({
  id: PLANNING_REFERENCE_QUOTE_ID,
  currency: "USD",
  origin: { name: "China / East Asia index region" },
  destination: { name: "North America West Coast index region" },
  source: {
    type: QUOTE_SOURCE_TYPES.INDEX_REFERENCE,
    provider: referenceFreightSource,
    sourceUrl: referenceFreightSourceUrl
  },
  rates: Object.entries(defaultContainerProfiles).map(([containerId, profile]) => ({
    containerId,
    equipmentCode: containerId.toUpperCase(),
    baseFreight: profile.referencePrice,
    currency: profile.referenceCurrency,
    charges: QUOTE_CHARGE_CATEGORIES.map((category) => ({
      category,
      label: category,
      amount: null,
      basis: "PER_CONTAINER",
      applicability: "UNKNOWN"
    })),
    availability: { status: "UNKNOWN" },
    completeness: "BASE_ONLY"
  }))
})];

const legacyDefaultReferencePrices = {
  "20gp": 1000,
  "20hq": 1080,
  "40gp": 1550,
  "40hq": 1680,
  "20rf": 1650,
  "40rf": 2450,
  "20fr": 2150,
  "40fr": 3200
};

function freightProfile(costFactor, referencePrice, priceTier, equipmentClass, note = "") {
  return {
    costFactor,
    referencePrice,
    referenceCurrency: "USD",
    referencePriceSource: referenceFreightSource,
    referencePriceSourceUrl: referenceFreightSourceUrl,
    referencePriceBasis: note ? `${referenceFreightBasis} ${note}` : referenceFreightBasis,
    routeQuoteId: PLANNING_REFERENCE_QUOTE_ID,
    priceTier,
    equipmentClass
  };
}

const defaultContainerById = new Map(defaultContainers.map((item) => [item.id, item]));
const removedDefaultContainerIds = new Set();
const defaultDimensionFields = [
  "name",
  "lengthCm",
  "widthCm",
  "heightCm",
  "payloadKg",
  "dimensionSource",
  "dimensionSourceUrl",
  "dimensionBasis",
  "dimensionNote",
  "usagePriority",
  "visualKind",
  "ignoreHeightLimit",
  "heightLimitCm"
];

function withDefaultProfile(container, options = {}) {
  const defaultContainer = defaultContainerById.get(container?.id);
  const profile = defaultContainerProfiles[container?.id] || {};
  const legacyPrice = legacyDefaultReferencePrices[container?.id];
  const containerReferencePrice = Number(container?.referencePrice ?? container?.price ?? container?.freightPrice);
  const shouldRefreshDefaultPrice = Boolean(defaultContainer)
    && !container?.priceEdited
    && (!Number.isFinite(containerReferencePrice) || containerReferencePrice <= 0 || containerReferencePrice === legacyPrice);
  const shouldUseDefaultPriceMeta = Boolean(defaultContainer) && !container?.priceEdited;
  const next = {
    ...profile,
    ...container,
    costFactor: container?.costFactor ?? profile.costFactor,
    referencePrice: shouldRefreshDefaultPrice ? profile.referencePrice : container?.referencePrice ?? profile.referencePrice,
    referenceCurrency: shouldUseDefaultPriceMeta ? profile.referenceCurrency : container?.referenceCurrency ?? profile.referenceCurrency,
    referencePriceSource: shouldUseDefaultPriceMeta ? profile.referencePriceSource : container?.referencePriceSource ?? profile.referencePriceSource,
    referencePriceSourceUrl: shouldUseDefaultPriceMeta ? profile.referencePriceSourceUrl : container?.referencePriceSourceUrl ?? profile.referencePriceSourceUrl,
    referencePriceBasis: shouldUseDefaultPriceMeta ? profile.referencePriceBasis : container?.referencePriceBasis ?? profile.referencePriceBasis,
    routeQuoteId: shouldUseDefaultPriceMeta ? profile.routeQuoteId : container?.routeQuoteId ?? "",
    priceTier: container?.priceTier ?? profile.priceTier,
    equipmentClass: container?.equipmentClass ?? profile.equipmentClass
  };
  if (defaultContainer && options.refreshDefaultDimensions && !container?.dimensionEdited) {
    defaultDimensionFields.forEach((field) => {
      next[field] = defaultContainer[field];
    });
  }
  return normalizeContainerHeightFields(next);
}

export function isFlatRackContainer(container = {}) {
  const text = `${container?.id || ""} ${container?.name || ""} ${container?.visualKind || ""} ${container?.equipmentClass || ""}`.toLowerCase();
  return Boolean(container?.ignoreHeightLimit) || /fr|flat\s*rack|flatrack|flat|\u5e73\u677f/.test(text);
}

export function effectiveContainerHeight(container = {}) {
  const height = Number(container?.heightCm || 0);
  const legacyLimit = Number(container?.heightLimitCm ?? container?.oogHeightLimitCm);
  if (isFlatRackContainer(container) && Number.isFinite(legacyLimit) && legacyLimit > 0) return legacyLimit;
  return Number.isFinite(height) && height > 0 ? height : 0;
}

export function normalizeContainerHeightFields(container = {}) {
  const heightCm = Math.max(1, effectiveContainerHeight(container));
  return {
    ...container,
    heightCm,
    heightLimitCm: heightCm,
    ignoreHeightLimit: isFlatRackContainer(container)
  };
}

export function cloneDefaultContainers() {
  return defaultContainers.map((item) => withDefaultProfile(item));
}

export function mergeDefaultContainers(containers = []) {
  const existing = Array.isArray(containers)
    ? containers
        .filter((item) => item && !removedDefaultContainerIds.has(item.id))
        .map((item) => normalizeContainerHeightFields(item))
    : [];
  if (!existing.length) return cloneDefaultContainers();
  const defaultIds = new Set(defaultContainers.map((item) => item.id));
  if (!existing.some((item) => defaultIds.has(item.id))) return existing;
  const existingWithProfiles = existing.map((item) => withDefaultProfile(item, { refreshDefaultDimensions: true }));
  const existingIds = new Set(existingWithProfiles.map((item) => item.id));
  const missingDefaults = defaultContainers
    .filter((item) => !existingIds.has(item.id))
    .map((item) => withDefaultProfile(item));
  return [...existingWithProfiles, ...missingDefaults];
}

export function isDefaultContainerId(id) {
  return defaultContainerById.has(id);
}

export function defaultContainerForId(id) {
  const container = defaultContainerById.get(id);
  return container ? withDefaultProfile(container) : null;
}

export function restoreDefaultContainer(container) {
  const restored = defaultContainerForId(container?.id);
  return restored || container;
}

export function restoreDefaultContainerPrice(container) {
  const restored = defaultContainerForId(container?.id);
  if (!restored) return container;
  return {
    ...container,
    costFactor: restored.costFactor,
    referencePrice: restored.referencePrice,
    referenceCurrency: restored.referenceCurrency,
    referencePriceSource: restored.referencePriceSource,
    referencePriceSourceUrl: restored.referencePriceSourceUrl,
    referencePriceBasis: restored.referencePriceBasis,
    routeQuoteId: restored.routeQuoteId,
    priceTier: restored.priceTier,
    equipmentClass: restored.equipmentClass,
    priceEdited: false
  };
}
