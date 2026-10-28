// Inert fixture: a red stamp appearance and an already-filled green widget.
// There are no actions, scripts, external links, attachments or interactive layers.
export function pdfAppearanceFixture() {
  const stream = (content, extra = "") =>
    `<< /Length ${Buffer.byteLength(content)} ${extra} >>\nstream\n${content}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /AcroForm 9 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> /Contents 4 0 R /Annots [5 0 R 6 0 R] >>",
    stream("q 1 1 1 rg 0 0 300 300 re f Q"),
    "<< /Type /Annot /Subtype /Stamp /Rect [30 200 150 250] /Name /Approved /F 4 /AP << /N 7 0 R >> >>",
    "<< /Type /Annot /Subtype /Widget /FT /Tx /T (local-filled) /V (FILLED) /Rect [30 100 150 150] /F 4 /DA (/Helv 10 Tf 0 g) /AP << /N 8 0 R >> >>",
    stream(
      "q 1 0 0 rg 0 0 120 50 re f Q",
      "/Type /XObject /Subtype /Form /BBox [0 0 120 50] /Resources << >>"
    ),
    stream(
      "q 0 0.8 0 rg 0 0 120 50 re f Q BT /F1 10 Tf 6 20 Td (FILLED) Tj ET",
      "/Type /XObject /Subtype /Form /BBox [0 0 120 50] /Resources << /Font << /F1 10 0 R >> >>"
    ),
    "<< /Fields [6 0 R] /NeedAppearances false /DR << /Font << /Helv 10 0 R >> >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
