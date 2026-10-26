import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { generateModule } from "./module-kit.mjs";
import { generateContracts } from "./generate-api-contracts.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  for (const name of readdirSync(resolve(root, "module-specs")).filter((name) =>
    name.endsWith(".json")
  )) {
    generateModule(root, JSON.parse(readFileSync(resolve(root, "module-specs", name), "utf8")), {
      check: true
    });
  }
  await generateContracts({ check: true });
  const tests = readdirSync(resolve(root, "scripts/test"))
    .filter((name) => /^(module-kit|api-contracts|module-boundaries).*\.test\.mjs$/.test(name))
    .map((name) => `scripts/test/${name}`);
  const result = spawnSync(process.execPath, ["--test", ...tests], { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw result.error || Error(`Module platform tests failed (${result.status})`);
  console.log("Module generation and API contracts are current.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
