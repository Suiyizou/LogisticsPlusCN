import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
// Node 24.9 lacks a few browser built-ins; upstream recommends its same-version legacy build for Node.
import { getDocument, AnnotationMode } from "pdfjs-dist/legacy/build/pdf.mjs";

// Isolated two-page PDF: real text operators on page 1 and an embedded RGB scan on page 2.
function samplePdf() {
  const stream = (value, dictionary = "") => {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return Buffer.concat([
      Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
      data,
      Buffer.from("\nendstream")
    ]);
  };
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream("BT /F1 20 Tf 20 140 Td (LOCAL PDF PREVIEW) Tj ET"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /XObject << /Scan 7 0 R >> >> /Contents 8 0 R >>",
    stream(
      Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]),
      "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8"
    ),
    stream("q 160 0 0 120 30 40 cm /Scan Do Q")
  ];
  return pdfFromObjects(objects);
}

function pdfFromObjects(objects) {
  const parts = [Buffer.from("%PDF-1.7\n")],
    offsets = [0];
  let position = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(position);
    const part = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      Buffer.isBuffer(object) ? object : Buffer.from(object),
      Buffer.from("\nendobj\n")
    ]);
    parts.push(part);
    position += part.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      ""
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([...parts, Buffer.from(xref)]));
}

test("pinned PDF.js actually paints readable text and embedded image pixels on both pages", async () => {
  const task = getDocument({
    data: samplePdf(),
    useWasm: false,
    stopAtErrors: true,
    enableXfa: false,
    standardFontDataUrl: fileURLToPath(
      new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)
    ).replaceAll("\\", "/")
  });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 2);
    for (let number = 1; number <= 2; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height),
        context = canvas.getContext("2d");
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: AnnotationMode.ENABLE
      }).promise;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0,
        colored = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 120 && pixels[i + 1] < 120 && pixels[i + 2] < 120) dark++;
        if (
          Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
            Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
          100
        )
          colored++;
      }
      if (number === 1) {
        const content = await page.getTextContent();
        assert.match(content.items.map((item) => item.str || "").join(""), /LOCAL PDF PREVIEW/);
        assert.ok(dark > 300, `text must produce dark glyph pixels, got ${dark}`);
      } else
        assert.ok(colored > 20_000, `embedded scan must produce colored pixels, got ${colored}`);
    }
  } finally {
    await task.destroy();
  }
});

test("canvas-only ENABLE preserves existing stamp and filled-field appearance pixels", async () => {
  const appearance = (content, width, height) =>
    `<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${width} ${height}] /Resources << /Font << /F1 9 0 R >> >> /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  const data = pdfFromObjects([
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] /NeedAppearances false /DA (/F1 12 Tf 0 g) /DR << /Font << /F1 9 0 R >> >> >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R 7 0 R] >>",
    "<< /Length 3 >>\nstream\nq Q\nendstream",
    "<< /Type /Annot /Subtype /Stamp /Rect [20 110 120 170] /F 4 /AP << /N 6 0 R >> >>",
    appearance(
      "q 1 0 0 rg 0 0 100 60 re f Q BT /F1 12 Tf 0 0 0 rg 10 25 Td (STAMP) Tj ET",
      100,
      60
    ),
    "<< /Type /Annot /Subtype /Widget /FT /Tx /T (accepted-field) /V (FILLED) /DA (/F1 12 Tf 0 g) /Rect [140 40 260 80] /F 4 /AP << /N 8 0 R >> >>",
    appearance(
      "q 0 0.8 0 rg 0 0 120 40 re f Q BT /F1 12 Tf 0 0 0 rg 10 15 Td (FILLED) Tj ET",
      120,
      40
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ]);
  const task = getDocument({
    data,
    useWasm: false,
    enableXfa: false,
    stopAtErrors: true,
    standardFontDataUrl: fileURLToPath(
      new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)
    ).replaceAll("\\", "/")
  });
  try {
    const pdf = await task.promise,
      page = await pdf.getPage(1),
      viewport = page.getViewport({ scale: 2 });
    const annotations = await page.getAnnotations();
    assert.deepEqual(annotations.map((item) => item.subtype).sort(), ["Stamp", "Widget"]);
    assert.equal(annotations.find((item) => item.subtype === "Widget").fieldValue, "FILLED");
    for (const mode of [AnnotationMode.DISABLE, AnnotationMode.ENABLE]) {
      const canvas = createCanvas(viewport.width, viewport.height),
        context = canvas.getContext("2d");
      await page.render({ canvas, canvasContext: context, viewport, annotationMode: mode }).promise;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0,
        green = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 180 && pixels[i + 1] < 80 && pixels[i + 2] < 80) red++;
        if (pixels[i + 1] > 120 && pixels[i] < 80 && pixels[i + 2] < 80) green++;
      }
      if (mode === AnnotationMode.DISABLE)
        assert.deepEqual([red, green], [0, 0], "the old mode drops both appearances");
      else {
        assert.ok(red > 8_000, `stamp appearance must be painted: ${red}`);
        assert.ok(green > 6_000, `filled-field appearance must be painted: ${green}`);
      }
    }
  } finally {
    await task.destroy();
  }
});

test("invalid PDF bytes fail parsing instead of producing a blank successful preview", async () => {
  const task = getDocument({
    data: new Uint8Array([1, 2, 3, 4]),
    useWasm: false,
    stopAtErrors: true
  });
  try {
    await assert.rejects(task.promise, { name: "InvalidPDFException" });
  } finally {
    await task.destroy();
  }
});
