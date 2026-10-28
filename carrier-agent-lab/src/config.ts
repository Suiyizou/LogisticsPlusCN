import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface LabConfig {
  rootDir: string;
  agentDir: string;
  host: string;
  port: number;
  execution: {
    maxConcurrency: number;
    queueLimit: number;
    runTimeoutMs: number;
    maxAgentTurns: number;
  };
  artifacts: {
    ttlMs: number;
  };
  browser: {
    headless: boolean;
    allowHeaded: boolean;
    channel: string | null;
    timeoutMs: number;
    storageStateDir?: string | null;
    navigationPolicy: "official-only" | "public-https";
  };
  model: {
    provider: string | null;
    id: string | null;
    requireVision: boolean;
  };
  demo: {
    enabled: boolean;
  };
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolvePackageRoot(MODULE_DIR);
let localEnvLoaded = false;

export function resolvePackageRoot(moduleDir: string): string {
  return basename(dirname(moduleDir)) === "dist"
    ? resolve(moduleDir, "..", "..")
    : resolve(moduleDir, "..");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LabConfig {
  if (env === process.env && !localEnvLoaded) {
    localEnvLoaded = true;
    try {
      process.loadEnvFile(join(ROOT_DIR, ".env"));
    } catch {
      // .env is optional; pi's normal auth store and process environment still apply.
    }
  }
  const navigation = env.TRACKING_NAVIGATION_POLICY === "official-only"
    ? "official-only"
    : "public-https";
  return {
    rootDir: ROOT_DIR,
    agentDir: env.PI_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent"),
    host: env.TRACKING_HOST?.trim() || "127.0.0.1",
    port: positiveInteger(env.TRACKING_PORT, 4317),
    execution: {
      maxConcurrency: positiveInteger(env.TRACKING_MAX_CONCURRENCY, 1),
      queueLimit: positiveInteger(env.TRACKING_QUEUE_LIMIT, 5),
      runTimeoutMs: positiveInteger(env.TRACKING_RUN_TIMEOUT_MS, 300_000),
      maxAgentTurns: positiveInteger(env.TRACKING_MAX_AGENT_TURNS, 12),
    },
    artifacts: {
      ttlMs: boundedInteger(env.TRACKING_ARTIFACT_TTL_HOURS, 24, 1, 7 * 24) * 60 * 60 * 1000,
    },
    browser: {
      headless: booleanValue(env.TRACKING_BROWSER_HEADLESS, false),
      allowHeaded: booleanValue(env.TRACKING_BROWSER_ALLOW_HEADED, true),
      channel: nullableText(env.TRACKING_BROWSER_CHANNEL) ?? "chrome",
      timeoutMs: positiveInteger(env.TRACKING_BROWSER_TIMEOUT_MS, 45_000),
      storageStateDir: nullableText(env.CARRIER_BROWSER_STATE_DIR),
      navigationPolicy: navigation,
    },
    model: {
      provider: nullableText(env.PI_PROVIDER),
      id: nullableText(env.PI_MODEL),
      requireVision: booleanValue(env.TRACKING_REQUIRE_VISION, true),
    },
    demo: {
      enabled: booleanValue(env.TRACKING_ENABLE_DEMO, false),
    },
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function nullableText(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
