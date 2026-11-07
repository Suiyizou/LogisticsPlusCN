import {
  normalizeTrackingAdapterMode,
  supportsShipmentReference,
  trackingCarriersForMode
} from "../src/services/trackingCarriers.js";

export const TRACKING_BUILD_METADATA_FILE = "tracking-build.json";

export function trackingBuildMetadata(value) {
  const adapterMode = normalizeTrackingAdapterMode(value);
  return {
    schema: "tracking-build.v1",
    adapterMode,
    carriers: trackingCarriersForMode(adapterMode).map(({ code }) => ({
      code,
      referenceTypes: ["BILLOFLADING", "BOOKING", "CONTAINER"].filter(type =>
        supportsShipmentReference(code, type, adapterMode)
      )
    }))
  };
}

export function verifyTrackingBuild(metadata, expectedMode) {
  if (!["LOCAL_QUEUE", "LEGACY"].includes(expectedMode)) {
    throw new Error("Specify the backend's tracking mode: LOCAL_QUEUE or LEGACY");
  }
  const expected = trackingBuildMetadata(expectedMode);
  if (JSON.stringify(metadata) !== JSON.stringify(expected)) {
    throw new Error(`Tracking build does not match backend mode ${expectedMode}; rebuild with build:local-queue or build:legacy`);
  }
  return expected;
}

// Read Vite's resolved environment, which is the same value substituted into
// import.meta.env in the application, including .env files and CLI overrides.
export function trackingBuildMetadataPlugin() {
  let metadata;
  return {
    name: "tracking-build-metadata",
    apply: "build",
    configResolved(config) {
      metadata = trackingBuildMetadata(config.env.VITE_TRACKING_ADAPTER_MODE);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: TRACKING_BUILD_METADATA_FILE,
        source: `${JSON.stringify(metadata, null, 2)}\n`
      });
    }
  };
}
