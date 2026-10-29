import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

// Offline canvas verification only. This script does not control a browser or change application data.
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(frontend, "../output/pdf/packing-report-example");
await mkdir(output, { recursive: true });
for (const font of ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhbd.ttc"])
  GlobalFonts.registerFromPath(font, "Microsoft YaHei");
globalThis.document = {
  createElement: (tag) => {
    if (tag !== "canvas") throw new Error(`Unexpected offline element: ${tag}`);
    return createCanvas(1, 1);
  }
};
const bundle = path.join(output, ".packing-report-verification.mjs");
await build({
  entryPoints: [path.join(frontend, "src/services/exportReport.js")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
  plugins: [
    {
      name: "offline-locale",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/index$/ }, (args) =>
          args.importer.replaceAll("\\", "/").endsWith("/i18n/legacyText.js")
            ? { path: "offline-locale", namespace: "offline" }
            : undefined
        );
        builder.onLoad({ filter: /.*/, namespace: "offline" }, () => ({
          contents: 'export const getCurrentLocale = () => "zh-CN";'
        }));
      }
    }
  ]
});
try {
  const { createPackingReportPdf } = await import(pathToFileURL(bundle).href);
  const container = {
    id: "20GP-example",
    name: "20GP",
    lengthCm: 589.8,
    widthCm: 235.2,
    heightCm: 239.3,
    payloadKg: 28000
  };
  const sourceUnits = [{ length: "0.7 m", width: "500 mm", height: "60 cm", weight: "0.12 t" }];
  const cargos = Array.from({ length: 56 }, (_, index) => ({
    id: `example-${index + 1}`,
    name:
      index === 0
        ? `EXAMPLE / ${"Long precision machinery spare parts description / ".repeat(12)}END-OF-LONG-NAME`
        : `EXAMPLE cargo ${index + 1}`,
    model: `M${index + 1}`,
    quantity: 1,
    lengthCm: 70,
    widthCm: 50,
    heightCm: 60,
    weightKg: 120
  }));
  const boxes = [1, 2].map((index) => ({
    index,
    container,
    placed: cargos.slice((index - 1) * 28, index * 28).map((cargo, position) => ({
      cargoId: cargo.id,
      cargoIndex: (index - 1) * 28 + position,
      name: `${cargo.name} ${cargo.model}`,
      unitKey: cargo.id,
      xCm: (position % 7) * 80,
      yCm: Math.floor(position / 7) * 55,
      zCm: 0,
      lengthCm: 72,
      widthCm: 52,
      heightCm: 60,
      physicalLengthCm: 70,
      physicalWidthCm: 50,
      physicalHeightCm: 60,
      xAxis: "\u957f",
      yAxis: "\u5bbd",
      zAxis: "\u9ad8",
      xAxisBaseCm: 70,
      yAxisBaseCm: 50,
      zAxisBaseCm: 60,
      weightKg: 120,
      volumeM3: 0.21,
      groupQuantity: 1,
      nonStack: position === 0,
      keepUpright: position % 3 === 0
    }))
  }));
  const options = {
    container,
    cargos,
    evaluation: { packedBoxes: boxes },
    placements: boxes[0].placed,
    taskId: "EXAMPLE-2BOX-56CARGO",
    generatedAt: new Date("2026-10-29T04:00:00Z"),
    includeRemainingSpace: true,
    globalGapCm: 2,
    example: true,
    notes:
      "EXAMPLE ONLY. Synthetic non-overlapping placements; no shipment or customer information. 56 pieces / 6,720 kg / 11.76 m³ across 2 boxes. Original units: 0.7 m × 500 mm × 60 cm, 0.12 t per piece, normalized to 70 × 50 × 60 cm, 120 kg. Loading order and balance-validation approval are intentionally absent and must display as not provided."
  };
  await writeFile(
    path.join(output, "example-input.json"),
    JSON.stringify({ ...options, sourceUnits }, null, 2)
  );
  for (const [locale, suffix] of [
    ["zh-CN", "zh"],
    ["en-US", "en"]
  ]) {
    const pdf = await createPackingReportPdf({ ...options, locale });
    await writeFile(
      path.join(output, `packing-plan-example-${suffix}.pdf`),
      new Uint8Array(await pdf.arrayBuffer())
    );
    console.log(`${suffix}: ${pdf.size} bytes`);
  }
  await writeFile(
    path.join(output, "README.txt"),
    "EXAMPLE ONLY. Offline verification output from the production report exporter. Synthetic 2-box, 56-cargo plan; not a real shipment or transport approval. Each unit is 70 x 50 x 60 cm / 120 kg, with a 72 x 52 x 60 cm packing envelope. Expected totals: 56 pieces, 6720 kg, 11.76 m3. Source mixed units and normalized values are in example-input.json.\n"
  );
} finally {
  await rm(bundle, { force: true });
}
