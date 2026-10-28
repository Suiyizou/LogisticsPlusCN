import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("./sync-brand-tokens.mjs", import.meta.url)), "--check"],
  { stdio: "inherit" }
);
const source = read("../../design-system/logisticspluscn-maritime/tokens.css");
assert.match(source, /html:root\s*\{/);
assert.match(source, /--color-primary:\s*#15384a/i);
assert.match(source, /--color-accent:\s*#ba4b25/i);
assert.match(source, /--color-background:\s*#f2f5f6/i);
assert.match(source, /--radius-control:\s*6px/);
assert.match(source, /--radius-card:\s*6px/);
assert.match(source, /--radius-dialog:\s*12px/);
assert.match(source, /--control-height:\s*44px/);
for (const path of [
  "../src/design-system.css",
  "../../tracking-service/public/design-system.css"
]) {
  const styles = read(path);
  assert.ok(
    /^@import ["']\.\/brand-tokens\.css["'];/.test(styles),
    path + " must import the generated brand tokens first"
  );
  assert.doesNotMatch(styles, /:root\s*\{/, path + " must consume the canonical tokens");
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(styles, /@import\s+url\(["']?https:/);
}
console.log("Maritime brand, shared tokens and accessibility checks passed.");
