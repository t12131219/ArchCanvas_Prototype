"""Publish actual same-source semantic and SVG comparisons, including raw UI."""
import hashlib
import html
import io
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/helper-contracts/current'
report = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
rows = {r['name']: r for r in report['rows']}
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>跨源码 helper 的依赖链认证与可逆展示</title>
<style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''


def panel(name):
    row = rows[name]; q = row['quality']
    return f'''<article><h2>{html.escape(name)}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''


page = head + '<h1>同一份源码：恢复跨 helper 的已证明计算链</h1>'
page += '<p class="note">认证检查整个源码范围的真实依赖链、结果槽和单一输出，保留 helper 的独立来源及精确切边。并非按模型名称识别或将任意 helper 视为透明计算。未知、条件、状态、可变、额外输出和无关计算会阻止整段认证；共享调用仍保留各自身份。</p>'
for name in ['WrappedChain', 'SplitChain', 'NestedChain', 'SharedChain', 'WrappedStages', 'InlineChain', 'UnknownChain', 'ConditionalChain', 'MutableChain', 'EscapingChain', 'DisconnectedChain']:
    page += '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div>'
page += '<p class="note">NestedChain 的语义拥有者是内部 core；外层包装保持源码身份。显示更多真实阶段会增高此图，不能仅用节点减少评价语义改善。</p>'
page += '<div class="grid">' + panel('SplitChain-source-frames') + panel('SplitChain-further') + '</div>'
page += '<article><h2>实际 UI：查看全部17个原始节点与12条边后，恢复同一语义图</h2><div class="fit">' + (OUT / 'ui-raw.svg').read_text() + '</div></article></html>'
(OUT / 'comparison.html').write_text(page)
page = head + '<h1>Transformer：12个 FFN 认证保留，三档布局几何不变</h1>'
page += '<p class="note">原源码的 FFN 已在同一局部范围中；新增跨 helper 认证没有改变模块逻辑或布局。SVG 的证据标题增加“不宣称独立参数或任意别名等价”等说明，因此源码字节可变，而节点、路径和标签几何相同。主图仍与专用参考存在明显组织差距。</p>'
for name in ['transformer-main', 'transformer-fixed-path', 'transformer-fixed-core']:
    page += '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div>'
page += '<article><h2>专用充分展开参考（仅用于评价）</h2><div class="fit">' + (ROOT / report['reference']['file']).read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
ui = ['ui-compact', 'ui-reopened', 'ui-source-frames', 'ui-restored-compact', 'ui-returned', 'ui-raw']
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for name in list(rows) + ui:
    page += f'<article class="native" data-case="{name}"><h2>{name}</h2>' + (OUT / (name + '.svg')).read_text() + '</article>'
(OUT / 'text-qa.html').write_text(page + '</html>')


def raster(file, size):
    data = subprocess.check_output(['rsvg-convert', '--keep-aspect-ratio', '--width', str(size[0]), '--height', str(size[1]), str(file)])
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    bg = Image.new('RGBA', image.size, 'white'); bg.alpha_composite(image)
    return bg.convert('RGB')


for output, cases, size in [
    ('generic-review.png', [(n, OUT / (n + '.svg')) for n in ['WrappedChain-before', 'WrappedChain-current', 'SplitChain-before', 'SplitChain-current']], (2400, 1400)),
    ('guard-review.png', [(n, OUT / (n + '-current.svg')) for n in ['UnknownChain', 'ConditionalChain', 'MutableChain', 'EscapingChain']], (2400, 1600)),
    ('composition-review.png', [(n, OUT / (n + '.svg')) for n in ['NestedChain-before', 'NestedChain-current', 'SharedChain-current', 'ui-raw']], (2400, 1600)),
    ('transformer-review.png', [('Main (geometry unchanged)', OUT / 'transformer-main-current.svg'), ('One path (unchanged)', OUT / 'transformer-fixed-path-current.svg'), ('Three paths (unchanged)', OUT / 'transformer-fixed-core-current.svg'), ('Dedicated reference', ROOT / report['reference']['file'])], (2400, 1900))]:
    canvas = Image.new('RGB', size, '#f6f8fa'); draw = ImageDraw.Draw(canvas); width = size[0] // len(cases)
    for i, (label, file) in enumerate(cases):
        draw.text((i * width + 12, 12), label, fill='#293746')
        canvas.paste(raster(file, (width - 24, size[1] - 60)), (i * width + 12, 42))
    canvas.save(OUT / output)
print(json.dumps({'panels': len(rows), 'native_panels': len(rows) + len(ui), 'render_report_sha256': digest}))
