"""Publish measured whole/partial semantic frontiers and their actual SVGs."""
import hashlib
import html
import io
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-role-paths/current'
report = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
rows = {row['name']: row for row in report['rows']}
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>通用语义状态的整组与局部路径选择</title>
<style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}p{{line-height:1.6}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}td,th{{padding:8px;text-align:left;border-bottom:1px solid #ddd}}table{{border-collapse:collapse}}</style>'''


def panel(name):
    row = rows[name]; q = row['quality']
    return f'''<article><h2>{html.escape(name)}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''


page = head + '<h1>通用语义状态：比较整组展开与单条已证明路径</h1>'
page += '<p class="note">结构优先的自适应规划从实际证书角色引用中产生局部路径候选，与整组角色展开竞争；不根据模型名、案例 ID、源码哈希或特定角色名称选择。最终采用须通过实际端口、接线、条件和未知边界以及几何检查。增加细节会增高画面，不能把“更多节点”直接等同于“更好的架构图”。</p>'
for name in ['BoundedWeave', 'MixedBoundary', 'ConditionalWeave', 'SeparateStages', 'SameSource', 'UnknownFusion']:
    page += '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div>'
page += '<h2>BoundedWeave：三个实际测量机会</h2><table><tr><th>候选</th><th>尺寸</th><th>结果</th></tr>'
for attempt in rows['BoundedWeave-current']['adaptive']['attempts']:
    opportunity = attempt['opportunity']; q = attempt['candidate']
    label = opportunity['kind'] + ' ' + '.'.join(opportunity.get('role', []))
    result = '采用' if attempt['accepted'] else ', '.join(attempt['reasons']) or '未胜出'
    page += f'<tr><td>{html.escape(label)}</td><td>{q["width"]} × {q["height"]}</td><td>{html.escape(result)}</td></tr>'
page += '</table><p>整组细节因面积代价过大被拒绝；局部选择保留原始事实，其他路径仍可独立细化。相邻未知调用和条件包含不被跨越或抹去。SameSource、SeparateStages 继续选择收益更好的整组展开。关闭自动细化时，主图 SVG 与修改前相同。</p>'
page += '<div class="grid">' + panel('BoundedWeave-whole-trial') + panel('BoundedWeave-first-path') + '</div>'
page += '<div class="grid">' + panel('BoundedWeave-main-current') + panel('BoundedWeave-manual-paths') + '</div>'
page += '<article><h2>真实编辑器：自动两条 → 保存重开 → 手动保留一条 → 收回 → 最细源码 → 重开语义状态</h2><p>进一步展开的实际 UI 源码状态保留全部144节点、145条边。该案例不代表数千节点完整路由或浏览器性能。</p><div class="fit">' + (OUT / 'ui-raw.svg').read_text() + '</div></article></html>'
(OUT / 'comparison.html').write_text(page)
page = head + '<h1>Transformer：结构优先的自动语义状态对照</h1>'
if 'transformer-current' in rows:
    before, current = [rows['transformer-' + side] for side in ['before', 'current']]
    unchanged = before['svg_sha256'] == current['svg_sha256']
    page += '<p class="note">' + ('当前与修改前的实际 SVG 逐字节相同；本阶段没有取得 Transformer 视觉改善。' if unchanged else '以下均为实际自动选择结果；用节点、接线及几何审核判断收益与代价。')
    page += ' 专用参考只用于评价，尚未证明全面接近。没有按其坐标或模型名称调整生产规则。</p>'
    page += '<div class="grid">' + panel('transformer-before') + panel('transformer-current') + '</div>'
else:
    page += '<p class="note">本轮大型实际测量仍在运行；尚无本阶段的完整 Transformer 自适应对照结果，不以历史或固定配置的 SVG 替代。</p>'
page += '<article><h2>专用详细参考（仅用于评价）</h2><div class="fit">' + (ROOT / report['reference']['file']).read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
ui = ['ui-planned', 'ui-reopened', 'ui-manual', 'ui-refolded', 'ui-raw', 'ui-returned']
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for name in list(rows) + ui:
    page += f'<article class="native" data-case="{name}"><h2>{name}</h2>' + (OUT / (name + '.svg')).read_text() + '</article>'
(OUT / 'text-qa.html').write_text(page + '</html>')


def raster(file, size):
    data = subprocess.check_output(['rsvg-convert', '--keep-aspect-ratio', '--width', str(size[0]), '--height', str(size[1]), str(file)])
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    bg = Image.new('RGBA', image.size, 'white'); bg.alpha_composite(image)
    bg = bg.convert('RGB')
    # librsvg may satisfy the requested width while exceeding height. Bound
    # both axes before compositing, so a tall frontier is not silently cropped.
    bg.thumbnail(size, Image.Resampling.LANCZOS)
    return bg


cases = [
    ('generic-review.png', [(n, OUT / (n + '.svg')) for n in ['BoundedWeave-before', 'BoundedWeave-current', 'SeparateStages-current', 'SameSource-current']], (2400, 1800)),
    ('boundaries-review.png', [(n, OUT / (n + '.svg')) for n in ['MixedBoundary-before', 'MixedBoundary-current', 'ConditionalWeave-before', 'ConditionalWeave-current']], (2800, 2000)),
]
if 'transformer-current' in rows:
    cases.append(('transformer-review.png', [('Before adaptive', OUT / 'transformer-before.svg'), ('Current adaptive', OUT / 'transformer-current.svg'), ('Dedicated reference', ROOT / report['reference']['file'])], (2700, 2100)))
for output, panels, size in cases:
    canvas = Image.new('RGB', size, '#f6f8fa'); draw = ImageDraw.Draw(canvas); width = size[0] // len(panels)
    for i, (label, file) in enumerate(panels):
        draw.text((i * width + 12, 12), label, fill='#293746')
        canvas.paste(raster(file, (width - 24, size[1] - 60)), (i * width + 12, 42))
    canvas.save(OUT / output)
print(json.dumps({'panels': len(rows), 'native_panels': len(rows) + len(ui), 'render_report_sha256': digest}))
