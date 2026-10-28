"""Create a clearly labeled, inert local acceptance PDF and text attachment."""
from pathlib import Path
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
pdf = out / 'ui-preview-sample.pdf'
page = canvas.Canvas(str(pdf), pagesize=A4)
page.setTitle('ui-preview local acceptance sample')
page.setAuthor('Local preview fixture')
page.setFillColor(HexColor('#15384a'))
page.rect(0, 735, 595, 107, fill=1, stroke=0)
page.setFillColorRGB(1, 1, 1)
page.setFont('Helvetica-Bold', 22)
page.drawString(44, 793, 'LOCAL ACCEPTANCE SAMPLE')
page.setFont('Helvetica', 12)
page.drawString(44, 766, 'ui-preview | logisticspluscn | isolated preview database')
page.setFillColor(HexColor('#15384a'))
page.setFont('Helvetica-Bold', 17)
page.drawString(44, 695, 'Attachment preview verification')
page.setFont('Helvetica', 12)
for index, line in enumerate([
    'Reference: UI-PREVIEW-BOOKING-001',
    'Purpose: verify authenticated PDF preview and download.',
    'This is a newly generated local test record.',
    'It is not a shipping document, invoice or carrier response.',
    'No personal data, active content, embedded files or external links.',
    'Original SQL attachments and credentials remain unchanged.',
]):
    page.drawString(44, 657 - index * 27, line)
page.setStrokeColor(HexColor('#ba4b25'))
page.line(44, 437, 551, 437)
page.setFillColor(HexColor('#536673'))
page.setFont('Helvetica', 10)
page.drawString(44, 60, 'ui-preview acceptance fixture | Page 1 of 1')
page.showPage()
page.save()
reader = PdfReader(str(pdf))
assert len(reader.pages) == 1
assert 'LOCAL ACCEPTANCE SAMPLE' in reader.pages[0].extract_text()
assert '/OpenAction' not in reader.trailer['/Root']
assert not reader.pages[0].get('/Annots')
(out / 'ui-preview-notes.txt').write_text(
    'ui-preview LOCAL ACCEPTANCE SAMPLE\n'
    'New isolated preview record; not an actual shipping document.\n'
    'Reference: UI-PREVIEW-BOOKING-001\n'
    'Used to verify authorized text preview and download.\n', encoding='utf-8')
# Render the authored page for visual verification when PDFium is available.
try:
    import pypdfium2
    doc = pypdfium2.PdfDocument(str(pdf))
    doc[0].render(scale=1.2).to_pil().save(out / 'ui-preview-sample.png')
except ImportError:
    pass
print('Local PDF and text samples generated and structurally checked.')
