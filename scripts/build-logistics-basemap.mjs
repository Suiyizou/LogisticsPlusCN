import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Natural Earth public-domain land polygons, no political borders.
const source =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const localInput = process.argv[2];
const response = localInput ? null : await fetch(source);
if (response && !response.ok) throw new Error(`Basemap download failed: ${response.status}`);
const raw = localInput ? await readFile(localInput, "utf8") : await response.text();
const geography = JSON.parse(raw);
const project = ([lon, lat]) =>
  `${(((lon + 180) / 360) * 1000).toFixed(2)},${(((90 - lat) / 180) * 500).toFixed(2)}`;
const paths = geography.features.flatMap(({ geometry }) => {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polygons.map((polygon) =>
    polygon.map((ring) => `M${ring.map(project).join("L")}Z`).join("")
  );
});
const directory = new URL("../tracking-service/public/geo/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("world-land.svg", directory),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><g fill="#c8ddec" stroke="#eff7fc" stroke-width=".65" stroke-linejoin="round" fill-rule="evenodd">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>\n`
);
await writeFile(
  new URL("SOURCES.md", directory),
  `# World land base map\n\nSource: ${localInput ? "https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip (Natural Earth 4.1.0, converted from the official land shapefile; archive SHA-256 1926c621afd6ac67c3f36639bb1236134a48d82226dc675d3e3df53d02d2a3de)" : source}\n\nNatural Earth 1:110m land, public domain. [Terms](https://www.naturalearthdata.com/about/terms-of-use/). No administrative borders.\n\nSHA-256 of source GeoJSON: \`${createHash("sha256").update(raw).digest("hex")}\`\n\nBuilt with \`node scripts/build-logistics-basemap.mjs${localInput ? " " + localInput : ""}\`. Equirectangular coordinates: x=(longitude+180)/360*1000, y=(90-latitude)/180*500. These exact equations also project the logistics nodes and connecting lines.\n`
);
console.log(`Generated world-land.svg with ${paths.length} land polygons.`);
