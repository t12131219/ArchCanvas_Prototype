"""Rasterize actual SVGs for direct visual comparison."""
import io
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/return-regions/current'
def raster(path,size):
    data=subprocess.check_output(['rsvg-convert','--keep-aspect-ratio','--width',str(size[0]),'--height',str(size[1]),str(path)])
    image=Image.open(io.BytesIO(data)).convert('RGBA')
    bg=Image.new('RGBA',image.size,'white');bg.alpha_composite(image)
    image=bg.convert('RGB');image.thumbnail(size);return image
canvas=Image.new('RGB',(2160,1820),'#f6f8fa');draw=ImageDraw.Draw(canvas)
for i,(label,path) in enumerate([('Before',OUT/'transformer-before.svg'),('Current',OUT/'transformer-current.svg'),('Dedicated reference',ROOT/'verification/generic-convergence/current/reference-expanded.svg')]):
    draw.text((i*720+12,12),label,fill='#293746');canvas.paste(raster(path,(696,1760)),(i*720+12,42))
canvas.save(OUT/'transformer-review.png')
r=json.loads((OUT/'render-report.json').read_text())
canvas=Image.new('RGB',(2000,((len(r['rows'])+4)//5)*560),'#f6f8fa');draw=ImageDraw.Draw(canvas)
for i,row in enumerate(r['rows']):
    x,y=i%5*400,i//5*560
    draw.text((x+10,y+8),row['name'],fill='#293746');canvas.paste(raster(OUT/row['svg'],(380,510)),(x+10,y+38))
canvas.save(OUT/'contact-sheet.png')
# Return region detail at a legible scale rather than only whole-graph thumbnails.
canvas=Image.new('RGB',(1800,1700),'#f6f8fa');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(['ReturnAlternatives-summary-before','ReturnAlternatives-summary-current','ReturnAlternatives-opened']):
    draw.text((i*600+10,12),name,fill='#293746');canvas.paste(raster(OUT/(name+'.svg'),(580,1640)),(i*600+10,42))
canvas.save(OUT/'return-detail-review.png')
print('Rendered actual SVG contact sheet, detail and reference comparison.')
