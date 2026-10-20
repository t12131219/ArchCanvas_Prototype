"""Render actual role-frontier SVGs for visual and browser-native review."""
import hashlib
import html
import io
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-paths/current'
report = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>通用语义主图与可选角色细化</title>
<style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''


def panel(row):
    q = row['quality']
    return f'''<article><h2>{html.escape(row['name'])}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''


note = '<p class="note">在保留完整事实图的语义主图中，选择已认证角色的局部来源路径；未选中的其他 helper 保持折叠。端点与输入接线的确认仅覆盖该角色，不代表整个认证计算已完全展开或全部运行路径已覆盖。角色共享源码层级时，单路径与整组展开可能显示相同数量的节点。</p>'
page = head + '<h1>陌生源码：主图、单路径、整组角色与更细展开</h1>' + note
for name in ['SeparateStages', 'SameSource', 'UnknownFusion', 'BrokenCell', 'ConditionalCarry']:
    page += '<div class="grid">' + ''.join(panel(row) for row in report['rows'] if row['name'].startswith(name + '-') and not row['name'].endswith(('-before', '-refolded'))) + '</div>'
(OUT / 'comparison.html').write_text(page + '</html>')
page = head + '<h1>Transformer：中间语义状态及进一步细化</h1>' + note
page += '<p class="note">细化采用主图实际配置固定的通用几何选项。新增细节仍明显增高、增加交叉；本页不证明默认自动细化的布局质量或性能。专用图仅用于评价；完整语义与视觉对应仍未完成。</p><div class="grid">'
page += ''.join(panel(row) for row in report['rows'] if row['name'].startswith('transformer-')) + '</div>'
page += '<article><h2>专用充分展开参考（仅用于评价）</h2><div class="fit">' + (ROOT / report['reference']['file']).read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for name in [r['name'] for r in report['rows']] + ['ui-main', 'ui-path', 'ui-reopened', 'ui-refolded', 'ui-further', 'ui-further-refolded']:
    file = OUT / (name + '.svg')
    if file.exists():
        page += f'<article class="native" data-case="{name}"><h2>{name}</h2>' + file.read_text() + '</article>'
(OUT / 'text-qa.html').write_text(page + '</html>')


def raster(file, size):
    data = subprocess.check_output(['rsvg-convert', '--keep-aspect-ratio', '--width', str(size[0]), '--height', str(size[1]), str(file)])
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    bg = Image.new('RGBA', image.size, 'white'); bg.alpha_composite(image)
    return bg.convert('RGB')


for output, cases, size in [
    ('generic-review.png', [('Main: 13', OUT / 'SeparateStages-main.svg'), ('Scores path: 20', OUT / 'SeparateStages-path.svg'), ('All roles: 23', OUT / 'SeparateStages-all-roles.svg'), ('Further source: 38', OUT / 'SeparateStages-source-detail.svg')], (2400, 1700)),
    ('transformer-review.png', [('Main', OUT / 'transformer-main.svg'), ('One path', OUT / 'transformer-fixed-path.svg'), ('Three paths', OUT / 'transformer-fixed-core.svg'), ('Dedicated reference', ROOT / report['reference']['file'])], (2400, 1900))]:
    canvas = Image.new('RGB', size, '#f6f8fa'); draw = ImageDraw.Draw(canvas)
    width = size[0] // len(cases)
    for i, (label, file) in enumerate(cases):
        draw.text((i * width + 12, 12), label, fill='#293746')
        canvas.paste(raster(file, (width - 24, size[1] - 60)), (i * width + 12, 42))
    canvas.save(OUT / output)
print(json.dumps({'panels': len(report['rows']), 'render_report_sha256': digest}))
