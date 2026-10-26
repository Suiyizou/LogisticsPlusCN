import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateModule } from "./module-kit.mjs";
import { generateContracts } from "./generate-api-contracts.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const args = process.argv.slice(2),
    sources = args.filter((arg) => !arg.startsWith("--"));
  if (sources.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--dry-run"))
    throw Error("Usage: npm run module:create -- module-specs/name.json [--dry-run]");
  const spec = JSON.parse(readFileSync(resolve(root, sources[0]), "utf8"));
  const changes = generateModule(root, spec, { dryRun: args.includes("--dry-run") });
  console.log(JSON.stringify({ module: spec.id, changes }, null, 2));
  if (!args.includes("--dry-run"))
    console.log(JSON.stringify({ contracts: await generateContracts() }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
