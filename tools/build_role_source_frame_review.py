"""Build side-by-side actual SVGs, native text page and review rasters."""
import hashlib
import html
import io
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-source-frames/current'
report = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
rows = {r['name']: r for r in report['rows']}
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>通用角色路径的源码外框合并审核</title>
<style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''


def panel(name):
    row = rows[name]; q = row['quality']
    return f'''<article><h2>{html.escape(name)}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''


page = head + '<h1>已证明的局部角色：操作保留，源码外框可恢复</h1>'
page += '<p class="note">仅将已展开、无独立语义或执行边界的源码外框转为来源附注；要求实际显示本地已认证角色端点，且实测布局改善。所有操作、操作数和源码身份仍保留。每次只比较一个布局候选；受保护或不满足条件的区域保持原图。</p>'
for name in ['SeparateStages-main', 'SeparateStages-path', 'SeparateStages-all', 'SameSource-path', 'WrappedStages', 'UnknownStages', 'ConditionalStages']:
    page += '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div>'
page += panel('SeparateStages-source-frames')
page += '<p class="note">WrappedStages 的激活被放入 helper 后，当前直接子节点 FFN 契约未能认证整段计算。此处保持原图，未借助外框合并绕过语义缺口。未知和条件 helper 同样保持边界。</p></html>'
(OUT / 'comparison.html').write_text(page)
page = head + '<h1>Transformer：本轮几何保持不变，与专用图仍有差距</h1>'
page += '<p class="note">主图与固定配置角色细化均无符合本轮要求的新外框，因此本轮不改善 Transformer。专用图仅用于评价；选定角色细化仍明显增高、增加交叉。固定配置结果不代表默认自动细化或数千节点浏览性能。</p>'
for name in ['transformer-main', 'transformer-fixed-path', 'transformer-fixed-core']:
    page += '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div>'
page += '<article><h2>专用充分展开参考（仅用于评价）</h2><div class="fit">' + (ROOT / report['reference']['file']).read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
ui = ['ui-compact', 'ui-reopened', 'ui-restored-compact', 'ui-source-frames', 'ui-further', 'ui-further-refolded', 'ui-refolded']
for name in list(rows) + ui:
    page += f'<article class="native" data-case="{name}"><h2>{name}</h2>' + (OUT / (name + '.svg')).read_text() + '</article>'
(OUT / 'text-qa.html').write_text(page + '</html>')


def raster(file, size):
    data = subprocess.check_output(['rsvg-convert', '--keep-aspect-ratio', '--width', str(size[0]), '--height', str(size[1]), str(file)])
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    bg = Image.new('RGBA', image.size, 'white'); bg.alpha_composite(image)
    return bg.convert('RGB')


for output, cases, size in [
    ('generic-review.png', [('Path before: 20', OUT / 'SeparateStages-path-before.svg'), ('Path now: 19', OUT / 'SeparateStages-path-current.svg'), ('All roles before: 23', OUT / 'SeparateStages-all-before.svg'), ('All roles now: 20', OUT / 'SeparateStages-all-current.svg')], (2400, 1700)),
    ('guard-review.png', [(name, OUT / (name + '-current.svg')) for name in ['SameSource-path', 'WrappedStages', 'UnknownStages', 'ConditionalStages']], (2400, 1600)),
    ('transformer-review.png', [('Main (unchanged)', OUT / 'transformer-main-current.svg'), ('One path (unchanged)', OUT / 'transformer-fixed-path-current.svg'), ('Three paths (unchanged)', OUT / 'transformer-fixed-core-current.svg'), ('Dedicated reference', ROOT / report['reference']['file'])], (2400, 1900))]:
    canvas = Image.new('RGB', size, '#f6f8fa'); draw = ImageDraw.Draw(canvas)
    width = size[0] // len(cases)
    for i, (label, file) in enumerate(cases):
        draw.text((i * width + 12, 12), label, fill='#293746')
        canvas.paste(raster(file, (width - 24, size[1] - 60)), (i * width + 12, 42))
    canvas.save(OUT / output)
print(json.dumps({'panels': len(report['rows']), 'native_panels': len(rows) + len(ui), 'render_report_sha256': digest}))
