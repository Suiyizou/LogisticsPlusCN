import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TRACKING_BUILD_METADATA_FILE, verifyTrackingBuild } from "./tracking-build-metadata.mjs";

const [directory, expectedMode] = process.argv.slice(2);
if (!directory) throw new Error("Usage: verify-tracking-build.mjs <build directory> LOCAL_QUEUE|LEGACY");
const metadata = JSON.parse(await readFile(resolve(directory, TRACKING_BUILD_METADATA_FILE), "utf8"));
verifyTrackingBuild(metadata, expectedMode);
console.log(`Verified tracking build: ${metadata.adapterMode}, ${metadata.carriers.length} carriers.`);
