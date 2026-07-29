import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const mainSource = read("../src/main.js");
const adminDashboardSource = read("../src/components/AdminDashboard.vue");
const frontendStyles = read("../src/design-system.css");
const legacyFrontendStyles = read("../src/styles.css");
const trackingIndex = read("../../tracking-service/public/index.html");
const trackingStyles = read("../../tracking-service/public/design-system.css");
const master = read("../../design-system/drewes-logistics-operations/MASTER.md");

assert.match(mainSource, /await import\("\.\/design-system\.css"\)/);
assert.match(
  adminDashboardSource,
  /import "element-plus\/es\/components\/message-box\/style\/css";/
);
assert.match(adminDashboardSource, /customClass:\s*"admin-destructive-message-box"/);
assert.match(legacyFrontendStyles, /\.admin-destructive-message-box\s*\{/);
assert.match(
  legacyFrontendStyles,
  /\.admin-destructive-message-box__confirm/
);
assert.ok(
  trackingIndex.indexOf("./design-system.css") > trackingIndex.indexOf("./styles.css"),
  "tracking design-system.css must load after the legacy stylesheet"
);

for (const source of [frontendStyles, trackingStyles]) {
  assert.match(source, /--color-primary:\s*#0f172a/);
  assert.match(source, /--color-accent:\s*#0369a1/);
  assert.match(source, /--color-background:\s*#f8fafc/);
  assert.match(source, /--color-border:\s*#e2e8f0/);
  assert.match(source, /:focus-visible/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /@import\s+url\(["']?https:/);
}

assert.match(trackingIndex, /class="nav-icon"[^>]*aria-hidden="true">\s*<svg/g);
assert.doesNotMatch(trackingIndex, /class="nav-icon"[^>]*>[◫▤⌁◎]/);
assert.match(master, /\*\*Style:\*\* Operational Minimalism/);

console.log("unified design system checks passed");
