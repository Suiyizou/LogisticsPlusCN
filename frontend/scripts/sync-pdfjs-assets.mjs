import { cp, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
if (metadata.version !== "6.4.299") throw Error("Unexpected PDF.js version");
const destination = new URL(`../public/pdfjs/${metadata.version}/`, import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs", "LICENSE"])
  await cp(new URL(name, source), new URL(name, destination), { recursive: true });
console.log(`Local PDF.js ${metadata.version} assets ready: ${fileURLToPath(destination)}`);
