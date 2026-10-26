import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticRouter } from "./lib/static-routes.mjs";
import { createTrackingCache } from "./lib/tracking-cache.mjs";
import { createBatchTaskRegistry } from "./lib/batch-task-registry.mjs";
import { createCoscoRuntime } from "./services/cosco-runtime.mjs";
import { createTrackingController } from "./http/tracking-controller.mjs";
import { createTrackingServer } from "./http/create-tracking-server.mjs";
export {
  isIndependentCoscoPlaywrightProxy,
  parseRetryAfter,
  shouldRotateCoscoProxy,
  shouldFallbackCoscoAutoToProxy
} from "./services/cosco-policy.mjs";
export { decodeCoscoPayload } from "./lib/cosco-payload.mjs";
export { normalizeCmaSnapshot, parseCmaLocalDateTime } from "./lib/cma-tracking.mjs";

export {
  listCarrierAdapters,
  listCoscoQueryChannels,
  normalizeCarrierCode,
  normalizeQueryChannel,
  normalizeTrackingRequest
} from "./lib/carrier-adapters.mjs";

export {
  buildRoutingLegs,
  enrichCoscoShipmentContainers,
  normalizeCoscoContainerList,
  normalizeCoscoContainerSnapshot,
  normalizeCoscoSnapshot,
  normalizeCoscoSupplementalDetails
} from "./lib/cosco-normalize.mjs";

export {
  decorateProxySuccess,
  proxyPoolExhaustedError,
  safeSupplementalWarnings
} from "./lib/cosco-diagnostics.mjs";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const staticRouter = createStaticRouter({
  publicDir: join(ROOT_DIR, "public"),
  elementPlusCss: join(ROOT_DIR, "node_modules", "element-plus", "dist", "index.css"),
  xlsxModule: join(ROOT_DIR, "node_modules", "xlsx", "xlsx.mjs"),
  flagIconsDir: join(ROOT_DIR, "node_modules", "flag-icons", "flags")
});
const cosco = createCoscoRuntime();
export const {
  getChannelCHealthStatus,
  runChannelCHealthCheck,
  runCoscoChannelChecks,
  startChannelCMonitor,
  stopChannelCMonitor
} = cosco;
const controller = createTrackingController({
  cosco,
  trackingCache: createTrackingCache({ ttlMs: 5 * 60_000 }),
  batchTaskRegistry: createBatchTaskRegistry({
    minIntervalMs: process.env.BATCH_QUERY_MIN_INTERVAL_MS,
    maxIntervalMs: process.env.BATCH_QUERY_MAX_INTERVAL_MS
  }),
  adapterKey: process.env.TRACKING_ADAPTER_KEY
});
export const server = createTrackingServer({
  controller,
  cosco,
  staticRouter,
  onClose: () => {
    void controller.adapters
      .dispose()
      .catch((error) => console.error("Carrier cleanup failed:", error.message));
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`Dual-channel COSCO tracker running at http://${host}:${port}`);
    cosco.startChannelCMonitor();
  });
}
