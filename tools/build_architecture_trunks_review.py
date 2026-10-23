"""Compose frozen/current SVG comparisons; crops change only the viewBox."""
import json
from pathlib import Path
import re

OUT = Path(__file__).resolve().parents[1] / 'verification/architecture-trunks/current'
suite = json.loads((OUT / 'suite-report.json').read_text())
rows = {r['name']: r for r in suite['rows']}
style = '<style>body{margin:12px;background:#eef2f7;color:#17263a;font:14px/1.5 system-ui}h1{font-size:22px;margin:0}p{margin:6px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{background:white;padding:10px;border:1px solid #c6d0dc}object{display:block;width:100%;height:540px}h3{margin:0}a{color:#145d9a}</style>'


def card(label, path):
    return f'<article><h3>{label}</h3><object type="image/svg+xml" data="{path}"></object><a href="{path}">SVG</a></article>'


def pair(title, a, b, note):
    return '<!doctype html><meta charset="utf-8"><title>通用输出线干审核</title>'+style+f'<h1>{title}</h1><p>{note}</p><div class="pair">'+card('修改前 · 已保存 SVG', a)+card('修改后 · 通用输出线干', b)+'</div><p>圆点表示同一输出的分叉；白色跨越表示独立连线。端点和原始使用槽位保持独立。</p><a href="review.html">双状态与全部通用案例</a>'


for page, panel in [('overview', 'Transformer-F0'), ('detail', 'Transformer-F1'), ('generic', 'ContextWeaver-up')]:
    row = rows[panel]
    (OUT / (page+'.html')).write_text(pair(panel, row['before_svg'], row['svg'], '同一节点、文字、绑定和端点；只整理已证明属于同一输出的连线。'))

row = rows['Transformer-F1']
for name, path in [('before', row['before_svg']), ('after', row['svg'])]:
    svg = (OUT / path).read_text()
    svg = re.sub(r'viewBox="[^"]+"', 'viewBox="600 340 1190 1770"', svg, count=1)
    svg = re.sub(r'width="[^"]+" height="[^"]+"', 'width="1190px" height="1770px"', svg, count=1)
    (OUT / ('context-'+name+'.svg')).write_text(svg)
(OUT / 'context.html').write_text(pair('跨区域输出线干 · 同一详图的局部', 'context-before.svg', 'context-after.svg', '仅修改 SVG 视窗以放大同一区域；正式完整 SVG 在详图页中。没有重新布局或删除图元。'))
page = '<!doctype html><meta charset="utf-8"><title>通用输出线干 · 双状态与跨模型审核</title>'+style+'<h1>通用输出线干 · 双状态与跨模型审核</h1><p>规则依据已解析的同一输出、实际端点和障碍，不依据模型名。双状态接近专用图的总目标仍未完成。</p><p><a href="context.html">跨区线干局部</a> · <a href="generic.html">陌生输入区域</a></p>'
for title, ref, panel in [('概览', 'reference-collapsed.svg', 'Transformer-F0'), ('详图', 'reference-expanded.svg', 'Transformer-F1')]:
    page += '<h2>'+title+'</h2><div class="pair">'+card('专用参照', '../../generic-convergence/current/'+ref)+card('当前通用状态', rows[panel]['svg'])+'</div>'
for row in suite['rows']:
    page += '<h2>'+row['name']+'</h2><p>'+str(len(row['selected']))+' 组共享线干（含已有组）；无适用结构或准入未通过时保留原路由。</p><div class="pair">'+card('修改前', row['before_svg'])+card('当前', row['svg'])+'</div>'
page += '<p><a href="independent-report.json">独立审核</a> · <a href="suite-report.json">捕获清单</a></p>'
(OUT / 'review.html').write_text(page)
native = '<!doctype html><meta charset="utf-8"><title>Native SVG text audit</title><style>body{margin:0}section{margin:20px}</style>'
for row in suite['rows']:
    native += '<section data-panel="'+row['name']+'"><h2>'+row['name']+'</h2>'+(OUT / row['svg']).read_text()+'</section>'
(OUT / 'native-audit.html').write_text(native)
print(OUT / 'review.html')
