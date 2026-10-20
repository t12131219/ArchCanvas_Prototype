"""Present actual SVGs, measurable native text and honest geometry tradeoffs."""
import hashlib
import html
import io
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/input-docks/current'
r = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>通用外部输入就近布局审核</title>
<style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}table{{border-collapse:collapse}}td,th{{border:1px solid #bdc9d5;padding:10px;text-align:left}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''


def panel(row):
    q = row['quality']
    return f'''<article><h2>{html.escape(row['name'])}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · 线长 {q['wire_length']} · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''


intro = '<p class="note">唯一的原有外部输入移到使用位置附近；不复制值、不改变源码归属、调用、参数槽位或逻辑展开状态。实际线长至少减少 10%，才允许最多增加 12% 的宽度和面积；高度、交叉、接触与失败路由不得增加。保留主入口。条件、未知、状态和非普通依赖不授权移动。该位置不表示输入在此处生成或较晚提供。</p>'
page = head + '<h1>通用输入布局：接受与拒绝</h1>' + intro
page += '<table><tr><th>输入</th><th>候选</th><th>尺寸 前 → 后</th><th>线长 前 → 后</th><th>交叉 前 → 后</th></tr>'
for c in r['comparisons']:
    a, b = c['before'], c['current']
    accepted = c['refinement'] and c['refinement']['accepted']
    page += f"<tr><td>{c['name']}</td><td>{'接受' if accepted else '保留原布局'}</td><td>{a['width']} × {a['height']} → {b['width']} × {b['height']}</td><td>{a['wire']} → {b['wire']}</td><td>{a['crossings']} → {b['crossings']}</td></tr>"
page += '</table><p>LateInputs 的候选被拒绝，旧有一个端口标签需附注的问题保留；BraidedInputs 的更深展开候选因两个标签无法放置被拒绝。不能将保留旧布局解释为候选已解决所有问题。</p>'
for name in ['BraidedInputs', 'LateInputs', 'GuardedInputs', 'UnknownInputs', 'StatefulInputs', 'MixedWeave', 'ConditionalCarry', 'ReturnAlternatives']:
    page += '<div class="grid">' + ''.join(panel(row) for row in r['rows'] if row['name'].startswith(name + '-')) + '</div>'
(OUT / 'comparison.html').write_text(page + '</html>')
page = head + '<h1>Transformer：通用输入布局与专用参考</h1>' + intro
page += '<p>通用规则仍保留原始 86 图元与 94 条边。与专用参考的完整语义对应、长路径和来源外框组织仍未完成。</p><div class="grid">'
page += ''.join(panel(row) for row in r['rows'] if row['name'].startswith('transformer-')) + '</div>'
page += '<article><h2>专用充分展开参考（仅用于评价）</h2><div class="fit">' + (ROOT / r['reference']['file']).read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for row in r['rows']:
    page += '<article class="native" data-case="' + row['name'] + '"><h2>' + row['name'] + '</h2>' + (OUT / row['svg']).read_text() + '</article>'
for name in ['ui-opened', 'ui-transformer-opened']:
    if (OUT / (name + '.svg')).exists():
        page += '<article class="native" data-case="' + name + '"><h2>' + name + '</h2>' + (OUT / (name + '.svg')).read_text() + '</article>'
(OUT / 'text-qa.html').write_text(page + '</html>')


def raster(path, size):
    data = subprocess.check_output(['rsvg-convert', '--keep-aspect-ratio', '--width', str(size[0]), '--height', str(size[1]), str(path)])
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    bg = Image.new('RGBA', image.size, 'white'); bg.alpha_composite(image)
    return bg.convert('RGB')


canvas = Image.new('RGB', (2160, 1820), '#f6f8fa'); draw = ImageDraw.Draw(canvas)
for i, (label, file) in enumerate([('Before', OUT / 'transformer-before.svg'), ('Current', OUT / 'transformer-current.svg'), ('Dedicated reference', ROOT / r['reference']['file'])]):
    draw.text((i * 720 + 12, 12), label, fill='#293746'); canvas.paste(raster(file, (696, 1760)), (i * 720 + 12, 42))
canvas.save(OUT / 'transformer-review.png')
canvas = Image.new('RGB', (1800, 1500), '#f6f8fa'); draw = ImageDraw.Draw(canvas)
for i, name in enumerate(['BraidedInputs-before', 'BraidedInputs-current', 'BraidedInputs-expanded']):
    draw.text((i * 600 + 12, 12), name, fill='#293746'); canvas.paste(raster(OUT / (name + '.svg'), (576, 1440)), (i * 600 + 12, 42))
canvas.save(OUT / 'generic-review.png')
print(json.dumps({'panels': len(r['rows']), 'render_report_sha256': digest}))
