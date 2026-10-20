"""Rasterize the actual SVGs for structural visual review (rsvg-convert + PIL)."""
import io
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/diagram-set/current'
report = json.loads((OUT / 'render-report.json').read_text())


def raster(path, size):
    png = subprocess.check_output(['rsvg-convert', '--keep-aspect-ratio', '--width', str(size[0]), '--height', str(size[1]), str(path)])
    img = Image.open(io.BytesIO(png)).convert('RGBA')
    bg = Image.new('RGBA', img.size, 'white')
    bg.alpha_composite(img)
    image = bg.convert('RGB')
    image.thumbnail(size)
    return image


canvas = Image.new('RGB', (1500, 3500), '#f6f8fa')
draw = ImageDraw.Draw(canvas)
for i, row in enumerate(report['rows']):
    img = raster(OUT / row['svg'], (480, 450))
    x, y = (i % 3) * 500, (i // 3) * 500
    draw.text((x + 10, y + 8), row['name'], fill='#253746')
    canvas.paste(img, (x + 10, y + 35))
canvas.save(OUT / 'panel-contact-sheet.png')
canvas = Image.new('RGB', (1500, 1550), 'white')
draw = ImageDraw.Draw(canvas)
for i, (label, path) in enumerate([
        ('Generic semantic main', OUT / 'transformer/000-main.svg'),
        ('Dedicated expanded reference', ROOT / 'verification/generic-convergence/current/reference-expanded.svg')]):
    draw.text((i * 750 + 15, 10), label, fill='#253746')
    canvas.paste(raster(path, (720, 1480)), (i * 750 + 15, 45))
canvas.save(OUT / 'main-reference-review.png')
print('Rendered actual SVG contact sheet and main/reference pair.')
