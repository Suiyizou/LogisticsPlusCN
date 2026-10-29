const cargoViewKey = "cargo-planner-cargo-view-v1";
const sceneKey = "cargo-planner-scene-view-v1";

export type CargoView = "list" | "overview";
export type ScenePreferences = {
  showLabels: boolean;
  showAxes: boolean;
  showGrid: boolean;
  showCenter: boolean;
  showShell: boolean;
  showClearanceEnvelope: boolean;
  showRemainingLabels: boolean;
  translucentCargo: boolean;
  showHeatmap: boolean;
  showRemaining: boolean;
  showMassBalance: boolean;
  analysisOpen: boolean;
};

export const defaultScenePreferences: ScenePreferences = {
  showLabels: false,
  showAxes: false,
  showGrid: false,
  showCenter: false,
  showShell: true,
  showClearanceEnvelope: false,
  showRemainingLabels: false,
  translucentCargo: false,
  showHeatmap: false,
  showRemaining: false,
  showMassBalance: false,
  analysisOpen: false
};

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable; the active view still works for this session.
  }
}

export function readCargoView(): CargoView {
  return read(cargoViewKey) === "overview" ? "overview" : "list";
}

export function saveCargoView(value: CargoView) {
  write(cargoViewKey, value);
}

export function readScenePreferences(): ScenePreferences {
  const stored = read(sceneKey);
  const result = { ...defaultScenePreferences };
  if (stored && typeof stored === "object") {
    const values = stored as Record<string, unknown>;
    for (const key of Object.keys(result) as (keyof ScenePreferences)[]) {
      if (typeof values[key] === "boolean") result[key] = values[key];
    }
  }
  return result;
}

export function saveScenePreferences(value: ScenePreferences) {
  write(sceneKey, value);
}
