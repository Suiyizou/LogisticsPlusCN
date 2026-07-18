export function assignCargoModels(cargos) {
  const byName = new Map();
  cargos.forEach((cargo) => {
    const name = cleanCell(cargo.name);
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(cargo);
  });

  return cargos.map((cargo) => {
    const siblings = byName.get(cleanCell(cargo.name)) || [];
    const dimensionKeys = new Set(siblings.map(dimensionKey));
    if (dimensionKeys.size <= 1 || cleanCell(cargo.model)) return { ...cargo };
    const orderedKeys = [...dimensionKeys].sort(compareDimensionKey);
    const modelIndex = Math.max(0, orderedKeys.indexOf(dimensionKey(cargo)));
    return { ...cargo, model: `型号 ${modelLabel(modelIndex)}` };
  });
}

function cleanCell(value) {
  if (value == null) return "";
  return String(value).replace(/\uFEFF/g, "").trim();
}

function dimensionKey(cargo) {
  return [
    round2(cargo.lengthCm),
    round2(cargo.widthCm),
    round2(cargo.heightCm),
    round2(cargo.weightKg),
    cargo.type || "normal",
    Boolean(cargo.nonStack),
    Boolean(cargo.keepUpright)
  ].join("|");
}

function compareDimensionKey(a, b) {
  const aParts = a.split("|");
  const bParts = b.split("|");
  for (let index = 0; index < 4; index += 1) {
    const difference = Number(aParts[index] || 0) - Number(bParts[index] || 0);
    if (difference) return difference;
  }
  return String(aParts[4] || "").localeCompare(String(bParts[4] || ""));
}

function modelLabel(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length) + 1}`;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
