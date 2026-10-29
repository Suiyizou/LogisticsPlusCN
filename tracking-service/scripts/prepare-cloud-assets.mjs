import { cp, copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] || "cloud-assets");
const modules = join(root, "node_modules");

// Require a fresh destination so removed/forbidden assets cannot survive a rebuild.
await mkdir(output);
await cp(join(root, "public"), output, { recursive: true });

async function copyAsset(source, relativeTarget) {
  const target = join(output, relativeTarget);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function copyMatching(source, relativeTarget, pattern) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isFile() && pattern.test(entry.name)) {
      await copyAsset(join(source, entry.name), join(relativeTarget, entry.name));
    }
  }
}

await copyAsset(join(modules, "element-plus", "dist", "index.css"), "vendor/element-plus.css");
await copyAsset(join(modules, "xlsx", "xlsx.mjs"), "vendor/xlsx.mjs");
for (const ratio of ["1x1", "4x3"]) {
  await copyMatching(join(modules, "flag-icons", "flags", ratio),
    `vendor/flags/${ratio}`, /^[a-z]{2}\.svg$/);
}

const pdfRoot = join(modules, "pdfjs-dist");
const pdfTarget = "vendor/pdfjs/6.4.299";
const pdfAssets = [
  "legacy/build/pdf.mjs",
  "legacy/build/pdf.worker.mjs",
  "wasm/openjpeg_nowasm_fallback.js",
  "wasm/jbig2_nowasm_fallback.js",
  "wasm/openjpeg.wasm",
  "wasm/jbig2.wasm",
  "wasm/qcms_bg.wasm",
  "iccs/CGATS001Compat-v2-micro.icc"
];
for (const asset of pdfAssets) await copyAsset(join(pdfRoot, asset), `${pdfTarget}/${asset}`);
await copyMatching(join(pdfRoot, "cmaps"), `${pdfTarget}/cmaps`, /^[A-Za-z0-9_-]+\.bcmap$/);
await copyMatching(join(pdfRoot, "standard_fonts"), `${pdfTarget}/standard_fonts`,
  /^(?:Foxit[A-Za-z]+\.pfb|LiberationSans-(?:Bold|BoldItalic|Italic|Regular)\.ttf)$/);

// Keep licenses in a separate tree, outside the executable PDF.js allowlist.
for (const name of ["element-plus", "xlsx", "flag-icons", "pdfjs-dist"]) {
  await copyAsset(join(modules, name, "LICENSE"), `licenses/${name}/LICENSE`);
}
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await copyMatching(join(pdfRoot, directory), `licenses/pdfjs-dist/${directory}`, /^LICENSE(?:_|$)/);
}

console.log("Cloud workspace assets prepared; browser execution and Node dependencies are not published.");
