import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const baselinePath = path.join(srcDir, "i18n", "hardcodedZhBaseline.json");
const writeBaseline = process.argv.includes("--write-baseline");
const sourceExtensions = new Set([".vue", ".js", ".ts"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n") continue;
      walk(fullPath, files);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeLine(line) {
  return line.trim().replace(/\s+/g, " ");
}

function collectChineseLines() {
  const items = [];
  for (const file of walk(srcDir)) {
    const relativePath = path.relative(root, file).replace(/\\/g, "/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/[\u3400-\u9fff]/.test(line)) return;
      const text = normalizeLine(line);
      if (!text || text.startsWith("// i18n-ignore")) return;
      items.push({ file: relativePath, line: index + 1, text });
    });
  }
  return items;
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return new Set();
  const json = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  return new Set(Array.isArray(json.entries) ? json.entries : []);
}

const items = collectChineseLines();
const entries = [...new Set(items.map((item) => item.text))].sort((a, b) => a.localeCompare(b, "zh-CN"));

if (writeBaseline) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({
      description: "Baseline for existing hardcoded Chinese outside src/i18n. New user-facing text should go through i18n instead of being added here by default.",
      entries
    }, null, 2)}\n`,
    "utf8"
  );
  console.log(`i18n baseline updated: ${entries.length} entries`);
  process.exit(0);
}

const baseline = readBaseline();
const unknown = items.filter((item) => !baseline.has(item.text));

if (unknown.length) {
  console.error("Found new hardcoded Chinese text outside src/i18n. Add it to i18n messages or intentionally update the baseline.");
  unknown.slice(0, 80).forEach((item) => {
    console.error(`- ${item.file}:${item.line} ${item.text}`);
  });
  if (unknown.length > 80) console.error(`...and ${unknown.length - 80} more`);
  process.exit(1);
}

console.log(`i18n hardcoded Chinese scan passed (${entries.length} baseline entries checked).`);
