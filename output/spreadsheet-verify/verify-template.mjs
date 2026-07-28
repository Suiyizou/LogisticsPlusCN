import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = path.resolve(import.meta.dirname, "..", "..");
const inputPath = path.join(root, "output", "playwright", "shipment-import-template.xlsx");
const outputPath = path.join(root, "output", "verified-shipment-import-template.xlsx");
const previewDir = path.join(root, "output", "spreadsheet-verify", "previews");

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheetSummary = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 5000
});
console.log(sheetSummary.ndjson);

const checks = [
  ["填写说明", "A1:A8"],
  ["票单主表", "A1:AZ2"],
  ["中转港", "A1:I2"],
  ["分段运输", "A1:O2"],
  ["箱型数量", "A1:C2"],
  ["箱级详情", "A1:H2"]
];
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of checks) {
  const inspected = await workbook.inspect({
    kind: "table",
    sheetId: sheetName,
    range,
    include: "values,formulas",
    tableMaxRows: 8,
    tableMaxCols: 60,
    maxChars: 12000
  });
  console.log(inspected.ndjson);
  const preview = await workbook.render({
    sheetName,
    range,
    scale: 1,
    format: "png"
  });
  await fs.writeFile(
    path.join(previewDir, `${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer())
  );
}

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "template formula error scan"
});
console.log(formulaErrors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath }));
