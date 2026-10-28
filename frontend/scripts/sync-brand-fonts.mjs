import { readdirSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../public/fonts/", import.meta.url));
const target = fileURLToPath(new URL("../../tracking-service/public/fonts/", import.meta.url));
const check = process.argv.includes("--check");
let valid = true;
function sync(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const from = resolve(directory, item.name);
    if (item.isDirectory()) {
      sync(from);
      continue;
    }
    const to = resolve(target, relative(source, from));
    if (check) {
      let actual;
      try {
        actual = readFileSync(to);
      } catch {}
      if (!actual || !readFileSync(from).equals(actual)) {
        console.error("Font asset out of sync: " + to);
        valid = false;
      }
    } else {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}
sync(source);
if (!valid) process.exitCode = 1;
else
  console.log(
    check
      ? "Self-hosted font assets are synchronized."
      : "Tracking font assets generated from frontend/public/fonts."
  );
