const NON_STACK_PATTERN = /\u4e0d\u53ef\u91cd\u538b|\u4e0d\u80fd\u91cd\u538b|\u7981\u6b62\u91cd\u538b|\u52ff\u538b|\u6613\u788e|fragile|non[\s-]?stack(?:able)?|no\s+stack/i;
const KEEP_UPRIGHT_PATTERN = /\u4fdd\u6301\u671d\u4e0a|\u671d\u4e0a|\u5411\u4e0a|\u4e0d\u53ef\u5012\u7f6e|\u8bf7\u52ff\u5012\u7f6e|upright|this\s+side\s+up|keep\s+upright/i;
const NON_STACK_NEGATION_PATTERNS = [
  /(?:\u65e0\u9700|\u65e0\u987b|\u4e0d\u9700\u8981|\u4e0d\u8981\u6c42|\u4e0d\u5fc5)(?:\u8bbe\u7f6e|\u6807\u8bb0|\u8003\u8651)?[\s\u201c\u201d"']*(?:\u4e0d\u53ef\u91cd\u538b|\u4e0d\u80fd\u91cd\u538b|\u7981\u6b62\u91cd\u538b|\u52ff\u538b|\u6613\u788e)/gi,
  /(?:\u4e0d\u53ef\u91cd\u538b|\u4e0d\u80fd\u91cd\u538b|\u7981\u6b62\u91cd\u538b|\u52ff\u538b|\u6613\u788e)\s*[:\uff1a=]\s*(?:\u5426|\u65e0|false|no|0)/gi,
  /(?:\u975e\u6613\u788e|\u4e0d\u662f\u6613\u788e|\u5141\u8bb8\u91cd\u538b|\u53ef\u4ee5\u91cd\u538b|(?<!\u4e0d)\u53ef\u91cd\u538b|\u53ef\u5806\u53e0)/gi,
  /\b(?:not|without)\s+non[\s-]?stack(?:able)?\b/gi,
  /\bno\s+non[\s-]?stack(?:able)?\s+(?:requirement|restriction)\b/gi,
  /\bnon[\s-]?stack(?:able)?\s*[:=]\s*(?:false|no|0)\b/gi,
  /(?:^|[\s,;])stackable\b/gi
];
const KEEP_UPRIGHT_NEGATION_PATTERNS = [
  /(?:\u65e0\u9700|\u65e0\u987b|\u4e0d\u9700\u8981|\u4e0d\u8981\u6c42|\u4e0d\u5fc5)(?:\u8bbe\u7f6e|\u6807\u8bb0|\u8003\u8651)?[\s\u201c\u201d"']*(?:\u4fdd\u6301\u671d\u4e0a|\u671d\u4e0a|\u5411\u4e0a|\u4e0d\u53ef\u5012\u7f6e)/gi,
  /(?:\u4fdd\u6301\u671d\u4e0a|\u671d\u4e0a|\u5411\u4e0a|\u4e0d\u53ef\u5012\u7f6e)\s*[:\uff1a=]\s*(?:\u5426|\u65e0|false|no|0)/gi,
  /(?:\u53ef\u4ee5\u5012\u7f6e|\u5141\u8bb8\u5012\u7f6e|(?<!\u4e0d)\u53ef\u5012\u7f6e)/gi,
  /\b(?:not|without)\s+(?:keep\s+)?upright\b/gi,
  /\bno\s+upright\s+(?:requirement|restriction)\b/gi,
  /\b(?:keep\s+)?upright\s*[:=]\s*(?:false|no|0)\b/gi,
  /\bupright\s+not\s+required\b/gi
];

export function cargoConstraintFlags(cargo = {}) {
  const type = String(cargo?.type || "").trim().toLowerCase();
  const searchable = cargoConstraintSearchText(cargo);
  const explicitNonStack = firstConstraintBoolean(
    cargo?.nonStack,
    cargo?.nonStackable,
    cargo?.constraints?.nonStack,
    cargo?.constraints?.nonStackable
  );
  const explicitKeepUpright = firstConstraintBoolean(
    cargo?.keepUpright,
    cargo?.upright,
    cargo?.constraints?.keepUpright
  );
  return {
    nonStack: explicitNonStack ?? Boolean(
      type === "nonstack"
      || constraintTextMatches(searchable, NON_STACK_PATTERN, NON_STACK_NEGATION_PATTERNS)
    ),
    keepUpright: explicitKeepUpright ?? Boolean(
      type === "upright"
      || constraintTextMatches(searchable, KEEP_UPRIGHT_PATTERN, KEEP_UPRIGHT_NEGATION_PATTERNS)
    )
  };
}

export function normalizeCargoConstraints(cargo = {}) {
  const flags = cargoConstraintFlags(cargo);
  return {
    ...cargo,
    nonStack: flags.nonStack,
    keepUpright: flags.keepUpright
  };
}

export function cargoConstraintKeys(cargo = {}) {
  const flags = cargoConstraintFlags(cargo);
  return [
    flags.nonStack ? "nonStack" : "",
    flags.keepUpright ? "keepUpright" : ""
  ].filter(Boolean);
}

export function cargoHandlingUnitType(cargo = {}) {
  const handlingUnit = String(
    cargo?.packageInfo?.handlingUnitType
    || cargo?.packageInfo?.packageUnit
    || ""
  ).trim().toLowerCase();
  if (["pallet", "skid", "crate", "wooden", "wooden-case"].includes(handlingUnit)) return "pallet";
  return String(cargo?.type || "").trim().toLowerCase() === "pallet" ? "pallet" : "normal";
}

function cargoConstraintSearchText(cargo) {
  return [
    cargo?.type,
    cargo?.remark,
    cargo?.handlingRequirements,
    cargo?.constraintText,
    cargo?.nonStack,
    cargo?.nonStackable,
    cargo?.keepUpright,
    cargo?.upright,
    cargo?.packageInfo?.remark,
    cargo?.packageInfo?.notes,
    cargo?.packageInfo?.handlingRequirements
  ].filter(Boolean).join(" ");
}

function firstConstraintBoolean(...values) {
  for (const value of values) {
    const parsed = constraintBoolean(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function constraintTextMatches(value, positivePattern, negationPatterns) {
  const searchable = negationPatterns.reduce(
    (text, pattern) => text.replace(pattern, " "),
    String(value || "")
  );
  return positivePattern.test(searchable);
}

function constraintBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (["1", "true", "yes", "y", "\u662f", "\u6709", "\u9700\u8981", "\u5fc5\u9700", "\u221a", "\u2713"].includes(text)) return true;
  if (["0", "false", "no", "n", "\u5426", "\u65e0", "\u4e0d\u9700\u8981", "\u00d7", "\u2715"].includes(text)) return false;
  return null;
}
