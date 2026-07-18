export function fmt(value, digits = 1) {
  const number = Number(value || 0);
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function fmtInt(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function shortType(type) {
  return {
    normal: "普通货物",
    upright: "保持朝上",
    nonstack: "不可重压",
    pallet: "托盘货"
  }[type] || "普通货物";
}

export function cargoLabel(cargo) {
  const name = String(cargo?.name || "").trim() || "未命名货物";
  const model = String(cargo?.model || "").trim();
  return model ? `${name} ${model}` : name;
}

export function volumeM3(item) {
  return (Number(item.lengthCm) * Number(item.widthCm) * Number(item.heightCm) * Number(item.quantity || 1)) / 1000000;
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
