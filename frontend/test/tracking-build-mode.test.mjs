import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { verifyTrackingBuild } from "../scripts/tracking-build-metadata.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("Vite's compiled carrier capabilities match the deployment metadata in both adapter modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracking-build-mode-"));
  const originalMode = process.env.VITE_TRACKING_ADAPTER_MODE;
  try {
    const modulePath = relative(directory, join(root, "src/services/trackingCarriers.js")).replaceAll("\\", "/");
    const entry = join(directory, "entry.mjs");
    await writeFile(entry, `
      import { TRACKING_ADAPTER_MODE, TRACKING_CARRIERS, supportsShipmentReference } from ${JSON.stringify(modulePath)};
      export const mode = TRACKING_ADAPTER_MODE;
      export const carriers = TRACKING_CARRIERS.map(({code}) => ({
        code, referenceTypes: ["BILLOFLADING", "BOOKING", "CONTAINER"].filter(type => supportsShipmentReference(code, type))
      }));
    `);
    for (const [configuredMode, expectedMode, count] of [["", "LEGACY", 6], ["LEGACY", "LEGACY", 6], ["LOCAL_QUEUE", "LOCAL_QUEUE", 15]]) {
      process.env.VITE_TRACKING_ADAPTER_MODE = configuredMode;
      const result = await build({
        root,
        configFile: join(root, "vite.config.js"),
        logLevel: "silent",
        build: {
          write: false,
          minify: false,
          rollupOptions: { input: entry, preserveEntrySignatures: "strict" }
        }
      });
      const chunk = result.output.find(item => item.type === "chunk" && item.isEntry);
      const metadataAsset = result.output.find(item => item.fileName === "tracking-build.json");
      assert.ok(chunk && metadataAsset, "both compiled code and deployment metadata must be emitted");
      const actual = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
      const metadata = JSON.parse(String(metadataAsset.source));
      assert.equal(actual.mode, expectedMode);
      assert.equal(actual.carriers.length, count);
      assert.equal(metadata.adapterMode, actual.mode);
      assert.deepEqual(metadata.carriers, actual.carriers);
      verifyTrackingBuild(metadata, expectedMode);
      if (expectedMode === "LEGACY") {
        assert.throws(() => verifyTrackingBuild(metadata, "LOCAL_QUEUE"), /does not match backend mode/);
      } else {
        for (const code of ["MATSON", "ONE", "HMM", "EVERGREEN"]) {
          assert.ok(actual.carriers.find(item => item.code === code)?.referenceTypes.includes("BILLOFLADING"), code);
        }
        assert.equal(actual.carriers.some(item => item.code === "HEDE"), false);
        assert.equal(actual.carriers.find(item => item.code === "KMTC").referenceTypes.includes("CONTAINER"), false);
      }
    }
  } finally {
    if (originalMode === undefined) delete process.env.VITE_TRACKING_ADAPTER_MODE;
    else process.env.VITE_TRACKING_ADAPTER_MODE = originalMode;
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
