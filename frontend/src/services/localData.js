import { createRouteQuote, QUOTE_CHARGE_CATEGORIES, QUOTE_SOURCE_TYPES } from "./freightQuote.js";

export const defaultContainers = [
  {
    id: "20gp",
    name: "20GP 普柜",
    lengthCm: 590,
    widthCm: 235.2,
    heightCm: 239.5,
    payloadKg: 28130,
    dimensionSource: "Hapag-Lloyd 20' Standard",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-standard.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "公开规格为名义内尺寸，实际柜号可能因制造批次存在公差。",
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
    dimensionSource: "Triton 20ft High Cube Dry",
    dimensionSourceUrl: "https://www.tritoncontainer.com/products/20ft-high-cube-dry-containers",
    dimensionBasis: "Internal Dimensions",
    dimensionNote: "20HQ 不是最常见海运标配，订舱前请按实际设备确认。",
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
    payloadKg: 42100,
    dimensionSource: "Hapag-Lloyd 20' Flatrack",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-flatrack.html",
    dimensionBasis: "Deck Length / Min. Width / User Load Height Limit",
    dimensionNote: "\u5e73\u677f\u67dc\u4e3a\u5f00\u653e\u8bbe\u5907\uff1b\u7cfb\u7edf\u9ed8\u8ba4\u6309 300cm \u88c5\u8f7d\u9ad8\u5ea6\u4e0a\u9650\u53c2\u4e0e\u8ba1\u7b97\uff0c\u7528\u6237\u53ef\u6309 OOG\u3001\u573a\u7ad9\u3001\u7ed1\u624e\u548c\u8fd0\u8f93\u65b9\u6848\u81ea\u5b9a\u4e49\u3002",
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
    payloadKg: 28750,
    dimensionSource: "Hapag-Lloyd 40' Standard",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-standard.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "公开规格为名义内尺寸，实际柜号可能因制造批次存在公差。",
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
    payloadKg: 28600,
    dimensionSource: "Hapag-Lloyd 40' Standard High Cube",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-standard-high-cube.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "公开规格为名义内尺寸，实际柜号可能因制造批次存在公差。",
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
    payloadKg: 49100,
    dimensionSource: "Hapag-Lloyd 40' Flatrack High Cube",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-flatrack-high-cube.html",
    dimensionBasis: "Deck Length / Min. Width / User Load Height Limit",
    dimensionNote: "\u5e73\u677f\u67dc\u4e3a\u5f00\u653e\u8bbe\u5907\uff1b\u7cfb\u7edf\u9ed8\u8ba4\u6309 300cm \u88c5\u8f7d\u9ad8\u5ea6\u4e0a\u9650\u53c2\u4e0e\u8ba1\u7b97\uff0c\u7528\u6237\u53ef\u6309 OOG\u3001\u573a\u7ad9\u3001\u7ed1\u624e\u548c\u8fd0\u8f93\u65b9\u6848\u81ea\u5b9a\u4e49\u3002",
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
    payloadKg: 29140,
    dimensionSource: "Hapag-Lloyd 20' Reefer",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-reefer.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "冷藏柜属于特殊设备；普通货和冷藏设备类货物优先尝试普柜/高柜，只有温控运输才建议选 RF。",
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
    payloadKg: 29580,
    dimensionSource: "Hapag-Lloyd 40' Reefer High Cube",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-reefer-high-cube.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "冷藏柜属于特殊设备；普通货和冷藏设备类货物优先尝试普柜/高柜，只有温控运输才建议选 RF。",
    usagePriority: "special",
    visualKind: "reefer",
    ignoreHeightLimit: false,
    heightLimitCm: 242.5
  }
];

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
const removedDefaultContainerIds = new Set(["45hq"]);
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
