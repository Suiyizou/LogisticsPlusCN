export const QUOTE_SOURCE_TYPES = Object.freeze({
  MANUAL: "MANUAL",
  EXCEL: "EXCEL",
  OFFICIAL_API: "OFFICIAL_API",
  BROWSER_ASSISTED: "BROWSER_ASSISTED",
  INDEX_REFERENCE: "INDEX_REFERENCE"
});

export const QUOTE_CHARGE_CATEGORIES = Object.freeze([
  "OOG",
  "REEFER",
  "LASHING",
  "LIFTING",
  "TERMINAL",
  "OTHER"
]);

export const QUOTE_CHARGE_BASES = Object.freeze([
  "PER_CONTAINER",
  "PER_SHIPMENT",
  "PER_BILL",
  "PER_CBM",
  "PER_TON"
]);

/**
 * 航线报价与箱型物理参数分离。rates[].containerId 只引用箱型；同一箱型可以在
 * 不同航线、船司、有效期和来源中拥有多条报价。
 */
export function createRouteQuote(input = {}) {
  const id = String(input.id || "").trim();
  const currency = normalizeCurrency(input.currency);
  const origin = normalizePort(input.origin);
  const destination = normalizePort(input.destination);
  const source = normalizeSource(input.source);
  const rawValidFrom = String(input.validFrom || "").trim();
  const rawValidTo = String(input.validTo || "").trim();
  const validFrom = normalizeDate(rawValidFrom);
  const validTo = normalizeDate(rawValidTo);
  const validationErrors = [];
  if (!id) validationErrors.push("MISSING_QUOTE_ID");
  if (!currency) validationErrors.push("INVALID_OR_MISSING_CURRENCY");
  if (!origin.unLocode) validationErrors.push("MISSING_ORIGIN_UNLOCODE");
  if (!destination.unLocode) validationErrors.push("MISSING_DESTINATION_UNLOCODE");
  if (!source.provider) validationErrors.push("MISSING_SOURCE_PROVIDER");
  if (!source.capturedAt) validationErrors.push("MISSING_SOURCE_CAPTURED_AT");
  if (!rawValidFrom) validationErrors.push("MISSING_VALID_FROM");
  if (!rawValidTo) validationErrors.push("MISSING_VALID_TO");
  if (rawValidFrom && !validFrom) validationErrors.push("INVALID_VALID_FROM");
  if (rawValidTo && !validTo) validationErrors.push("INVALID_VALID_TO");
  if (validFrom && validTo && validFrom > validTo) validationErrors.push("INVALID_VALIDITY_RANGE");
  return {
    schemaVersion: 1,
    id,
    currency,
    origin,
    destination,
    carrier: normalizeCarrier(input.carrier),
    validFrom,
    validTo,
    source,
    rates: Array.isArray(input.rates)
      ? input.rates.map((rate) => normalizeRouteRate(rate, currency)).filter((rate) => rate.containerId)
      : [],
    validationErrors
  };
}

export function normalizeRouteRate(rate = {}, quoteCurrency = "") {
  const currency = normalizeCurrency(rate.currency, quoteCurrency);
  const charges = Array.isArray(rate.charges) ? rate.charges.map((charge) => normalizeQuoteCharge(charge, currency)) : [];
  const validationErrors = [];
  if (!currency) validationErrors.push("INVALID_OR_MISSING_CURRENCY");
  return {
    containerId: String(rate.containerId || "").trim(),
    equipmentCode: String(rate.equipmentCode || rate.containerId || "").trim().toUpperCase(),
    baseFreight: positiveNumberOrNull(rate.baseFreight),
    currency,
    charges,
    availability: {
      status: normalizeEnum(rate.availability?.status, ["AVAILABLE", "LIMITED", "UNAVAILABLE", "UNKNOWN"], "UNKNOWN"),
      maxUnits: positiveIntegerOrNull(rate.availability?.maxUnits),
      checkedAt: normalizeDateTime(rate.availability?.checkedAt)
    },
    completeness: normalizeEnum(rate.completeness, ["COMPLETE", "PARTIAL", "BASE_ONLY"], "BASE_ONLY"),
    validationErrors
  };
}

export function routeRateTotal(rate = {}, context = {}) {
  const quantity = Math.max(1, Math.floor(Number(context.quantity || 1)));
  const baseFreight = positiveNumberOrNull(rate.baseFreight);
  if (baseFreight === null) return { total: null, complete: false, missing: ["BASE_FREIGHT"] };
  const rateCurrency = normalizeCurrency(rate.currency);

  let total = baseFreight * quantity;
  const missing = rateCurrency ? [] : ["CURRENCY"];
  for (const charge of rate.charges || []) {
    if (charge.applicability === "NOT_APPLICABLE") continue;
    if (charge.applicability === "UNKNOWN" || charge.amount === null) {
      missing.push(charge.category || "OTHER");
      continue;
    }
    const chargeCurrency = normalizeCurrency(charge.currency, rateCurrency);
    if (!chargeCurrency || chargeCurrency !== rateCurrency) {
      missing.push(`${charge.category || "OTHER"}:CURRENCY`);
      continue;
    }
    if (charge.basis === "PER_CONTAINER") total += charge.amount * quantity;
    else if (charge.basis === "PER_SHIPMENT" || charge.basis === "PER_BILL") total += charge.amount;
    else if (charge.basis === "PER_CBM") {
      const cbm = Number(context.cbm);
      if (Number.isFinite(cbm) && cbm >= 0) total += charge.amount * cbm;
      else missing.push(`${charge.category}:CBM`);
    } else if (charge.basis === "PER_TON") {
      const tons = Number(context.tons);
      if (Number.isFinite(tons) && tons >= 0) total += charge.amount * tons;
      else missing.push(`${charge.category}:TON`);
    }
  }

  const declaredComplete = rate.completeness === "COMPLETE";
  return {
    total: roundMoney(total),
    complete: declaredComplete && missing.length === 0,
    missing: [...new Set(missing)],
    currency: rateCurrency
  };
}

export function routeRateEligibleForOptimization(rate = {}, context = {}) {
  if (rate.availability?.status === "UNAVAILABLE") return { eligible: false, reason: "equipment-unavailable" };
  if (!rate.availability?.status || rate.availability.status === "UNKNOWN") {
    return { eligible: false, reason: "equipment-availability-unknown" };
  }
  const quantity = Math.max(1, Math.floor(Number(context.quantity || 1)));
  const maxUnits = positiveIntegerOrNull(rate.availability?.maxUnits);
  if (rate.availability?.status === "LIMITED" && maxUnits === null) {
    return { eligible: false, reason: "equipment-limit-unknown" };
  }
  if (rate.availability?.status === "LIMITED" && maxUnits !== null && quantity > maxUnits) {
    return { eligible: false, reason: "equipment-limit-exceeded" };
  }
  const priced = routeRateTotal(rate, context);
  if (priced.total === null) return { eligible: false, reason: "missing-base-freight" };
  if (!priced.complete) return { eligible: false, reason: "incomplete-charges", total: priced.total, missing: priced.missing };
  return { eligible: true, reason: "", total: priced.total };
}

export function routeQuoteRateEligibleForOptimization(quote = {}, rate = {}, context = {}) {
  if (Array.isArray(quote.validationErrors) && quote.validationErrors.length) {
    return { eligible: false, reason: "invalid-quote", errors: quote.validationErrors };
  }
  if (Array.isArray(rate.validationErrors) && rate.validationErrors.length) {
    return { eligible: false, reason: "invalid-rate", errors: rate.validationErrors };
  }
  const quoteCurrency = normalizeCurrency(quote.currency);
  const rateCurrency = normalizeCurrency(rate.currency || quoteCurrency);
  if (!quoteCurrency || !rateCurrency) return { eligible: false, reason: "invalid-currency" };
  if (quoteCurrency !== rateCurrency) return { eligible: false, reason: "currency-mismatch" };

  const validFrom = normalizeDate(quote.validFrom);
  const validTo = normalizeDate(quote.validTo);
  if (validFrom || validTo) {
    const shipmentDate = normalizeDate(context.shipmentDate);
    if (!shipmentDate) return { eligible: false, reason: "missing-shipment-date" };
    if (validFrom && shipmentDate < validFrom) return { eligible: false, reason: "quote-not-yet-valid" };
    if (validTo && shipmentDate > validTo) return { eligible: false, reason: "quote-expired" };
  }

  return routeRateEligibleForOptimization(rate, context);
}

function normalizeQuoteCharge(charge = {}, rateCurrency = "") {
  return {
    code: String(charge.code || "").trim().toUpperCase(),
    category: normalizeEnum(charge.category, QUOTE_CHARGE_CATEGORIES, "OTHER"),
    label: String(charge.label || "").trim(),
    amount: positiveNumberOrNull(charge.amount, true),
    currency: normalizeCurrency(charge.currency, rateCurrency),
    basis: normalizeEnum(charge.basis, QUOTE_CHARGE_BASES, "PER_CONTAINER"),
    applicability: normalizeEnum(charge.applicability, ["APPLIES", "NOT_APPLICABLE", "UNKNOWN"], "UNKNOWN")
  };
}

function normalizePort(port = {}) {
  return {
    unLocode: String(port.unLocode || port.unlocode || "").trim().toUpperCase(),
    name: String(port.name || "").trim(),
    terminalCode: String(port.terminalCode || "").trim()
  };
}

function normalizeCarrier(carrier = {}) {
  return {
    code: String(carrier.code || "").trim().toUpperCase(),
    name: String(carrier.name || "").trim()
  };
}

function normalizeSource(source = {}) {
  return {
    type: normalizeEnum(source.type, Object.values(QUOTE_SOURCE_TYPES), QUOTE_SOURCE_TYPES.MANUAL),
    provider: String(source.provider || "").trim(),
    quoteNo: String(source.quoteNo || "").trim(),
    capturedAt: normalizeDateTime(source.capturedAt),
    sourceUrl: String(source.sourceUrl || "").trim()
  };
}

function normalizeCurrency(value, fallback = "") {
  const currency = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(currency)) return currency;
  const fallbackCurrency = String(fallback || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(fallbackCurrency) ? fallbackCurrency : "";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeDateTime(value) {
  const text = String(value || "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : "";
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function positiveNumberOrNull(value, allowZero = false) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) return null;
  return number;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.floor(number);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
