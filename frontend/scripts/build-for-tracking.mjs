import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [adapterMode, ...viteArgs] = process.argv.slice(2);
if (!["LOCAL_QUEUE", "LEGACY"].includes(adapterMode)) {
  throw new Error("Usage: build-for-tracking.mjs LOCAL_QUEUE|LEGACY [Vite build options]");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env, VITE_TRACKING_ADAPTER_MODE: adapterMode };
console.log(`Building tracking frontend in ${adapterMode} mode.`);
for (const [script, args] of [
  ["./sync-pdfjs-assets.mjs", []],
  ["./check-i18n-hardcoded.js", []],
  ["../node_modules/vite/bin/vite.js", ["build", ...viteArgs]]
]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    cwd: root,
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
