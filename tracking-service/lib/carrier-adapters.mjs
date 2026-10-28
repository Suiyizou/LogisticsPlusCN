import { HttpError } from "./http-utils.mjs";
import { MULTI_CARRIER_CATALOG } from "./multi-carrier-catalog.mjs";

/** 船司/查询类型/通道的注册与归一化。从 server.mjs 下沉，入口只组装。 */

export const TRACKING_TYPES = Object.freeze({
  BILLOFLADING: {
    label: "提单号",
    businessNumberType: "blNumber"
  },
  BOOKING: {
    label: "订舱号",
    businessNumberType: "bookingNumber"
  },
  CONTAINER: {
    label: "箱号",
    businessNumberType: "containerNumber"
  }
});

export const COSCO_QUERY_CHANNELS = Object.freeze({
  NETWORK: {
    code: "NETWORK",
    number: 1,
    label: "网络接口",
    source: "COSCO_INTERNAL_WEB_API"
  },
  PLAYWRIGHT: {
    code: "PLAYWRIGHT",
    number: 2,
    label: "Playwright 浏览器",
    source: "COSCO_WEB_UI_PLAYWRIGHT"
  },
  PROXY: {
    code: "PROXY",
    number: 3,
    label: "SOCKS5 proxy",
    source: "COSCO_INTERNAL_WEB_API_PROXY"
  }
});

export const COSCO_AUTO_QUERY_STRATEGY = Object.freeze({
  code: "AUTO",
  number: 0,
  label: "直连接口 · 代理接口 · 浏览器容灾",
  source: "COSCO_NETWORK_PROXY_WITH_DEDICATED_PLAYWRIGHT_FALLBACK"
});

export const CARRIER_ADAPTERS = Object.freeze({
  COSCO: {
    code: "COSCO",
    name: "COSCO SHIPPING Lines",
    channel: "AUTO",
    channels: ["NETWORK", "PLAYWRIGHT", "PROXY"],
    defaultChannel: "AUTO",
    enabled: true,
    source: "COSCO_INTERNAL_WEB_API"
  },
  CMA: {
    code: "CMA",
    name: "CMA CGM",
    channel: "PLAYWRIGHT",
    channels: ["PLAYWRIGHT"],
    defaultChannel: "PLAYWRIGHT",
    enabled: true,
    source: "CMA_SERVER_RENDERED_HTML"
  },
  ...Object.fromEntries(Object.values(MULTI_CARRIER_CATALOG).map((carrier) => [carrier.code, {
    code: carrier.code, name: carrier.name, channel: "AUTO",
    channels: ["AUTO", "NETWORK", "AGENT"], defaultChannel: "AUTO",
    enabled: true, source: "CARRIER_BROWSER_AGENT"
  }]))
});

export function normalizeTrackingRequest(input) {
  const requestedType = String(input?.type ?? "BOOKING").toUpperCase();
  const carrier = String(input?.carrier ?? "COSCO").trim().toUpperCase();
  const type = requestedType === "BILLOFLADING" && !MULTI_CARRIER_CATALOG[carrier]
    ? "BOOKING" : requestedType;
  const typeConfig = TRACKING_TYPES[type];

  if (!typeConfig) {
    throw new HttpError(400, "不支持的查询类型");
  }

  const normalizedNumber = String(input?.number ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  const number =
    carrier === "COSCO" && type === "BOOKING" && /^COSU[0-9]{6,20}$/.test(normalizedNumber)
      ? normalizedNumber.slice(4)
      : normalizedNumber;

  if (!/^[A-Z0-9-]{4,35}$/.test(number)) {
    throw new HttpError(400, `${typeConfig.label}格式不正确`);
  }

  return { type, number, ...typeConfig };
}

export function normalizeCarrierCode(value = "COSCO") {
  const code = String(value).trim().toUpperCase();

  if (!CARRIER_ADAPTERS[code]) {
    throw new HttpError(400, "不支持的船司");
  }

  return code;
}

export function listCarrierAdapters() {
  return Object.values(CARRIER_ADAPTERS).map((carrier) => ({ ...carrier }));
}

export function normalizeQueryChannel(value = "NETWORK") {
  const code = String(value).trim().toUpperCase();
  if (code === COSCO_AUTO_QUERY_STRATEGY.code) {
    return COSCO_AUTO_QUERY_STRATEGY;
  }
  const channel = COSCO_QUERY_CHANNELS[code];

  if (!channel) {
    throw new HttpError(400, "不支持的查询通道");
  }

  return channel;
}

export function listCoscoQueryChannels() {
  return Object.values(COSCO_QUERY_CHANNELS).map((channel) => ({ ...channel }));
}
