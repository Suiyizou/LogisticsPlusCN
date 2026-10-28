"""Generate an inert Chinese, multipage and scanned-image PDF acceptance fixture."""
from pathlib import Path
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
from pypdf import PdfReader
import pypdfium2

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
pdf = out / 'ui-preview-chinese-embedded.pdf'
# Embed a subset in this local sample; do not redistribute the operating-system font file.
font = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('C:/Windows/Fonts/simhei.ttf')
pdfmetrics.registerFont(TTFont('PreviewChinese', str(font)))
c = canvas.Canvas(str(pdf), pagesize=A4)
c.setTitle('ui-preview Chinese multipage canvas acceptance')
c.setAuthor('Local preview fixture')
c.setFillColorRGB(.08, .22, .29)
c.setFont('PreviewChinese', 24)
c.drawString(44, 780, '本地预览验收样本')
c.setFont('PreviewChinese', 14)
for index, line in enumerate([
    '中文文本 · 多页切换 · 本地字体资源',
    '此文件仅用于隔离预览环境的阅读组件验收。',
    '它不是运输单证、合同、发票或船司返回记录。',
    '请确认文字清晰可读，然后点击下一页查看扫描图。',
    '上海罗加国际货物运输代理有限公司',
    'ui-preview / logisticspluscn / Page 1 of 2',
]):
    c.drawString(44, 724 - index * 42, line)
c.showPage()
image = Image.new('RGB', (1100, 900), '#f2f5f6')
draw = ImageDraw.Draw(image)
draw.rectangle((45, 45, 1055, 855), outline='#15384a', width=6)
draw.rectangle((80, 100, 1020, 250), fill='#15384a')
draw.text((110, 160), 'UI-PREVIEW SCANNED IMAGE / PAGE 2', fill='white', font_size=32)
draw.text((110, 330), 'LOCAL ACCEPTANCE SAMPLE', fill='#15384a', font_size=40)
draw.text((110, 420), 'No real shipment data. No actions or links.', fill='#15384a', font_size=28)
draw.rectangle((110, 540, 340, 740), fill='#ba4b25')
draw.ellipse((420, 540, 620, 740), fill='#15384a')
draw.line((710, 550, 950, 730), fill='#ba4b25', width=15)
c.drawImage(ImageReader(image), 40, 220, width=515, height=421)
c.setFont('PreviewChinese', 20)
c.drawString(44, 760, '第二页：扫描图像验收')
c.setFont('PreviewChinese', 13)
c.drawString(44, 700, '请确认图像、颜色与边框完整显示。')
c.showPage()
c.save()
r = PdfReader(str(pdf))
assert len(r.pages) == 2
assert '本地预览验收样本' in r.pages[0].extract_text()
assert '/OpenAction' not in r.trailer['/Root']
assert '/AcroForm' not in r.trailer['/Root']
assert all(not page.get('/Annots') for page in r.pages)
doc = pypdfium2.PdfDocument(str(pdf))
for index in range(len(doc)):
    doc[index].render(scale=1.1).to_pil().save(out / f'ui-preview-chinese-embedded-page-{index + 1}.png')
print('Inert two-page Chinese/scanned PDF generated and rendered.')
