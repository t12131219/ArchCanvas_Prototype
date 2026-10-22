"""Show committed before SVGs and new captures without rerendering either."""
from pathlib import Path
import json
import sys

OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'verification/stream-alignment/current'
report = json.loads((OUT / 'suite-report.json').read_text())
rows = {r['name']: r for r in report['rows']}
style = '<style>body{margin:12px;background:#eef2f7;color:#17263a;font:14px/1.5 system-ui}h1{font-size:22px;margin:0}p{margin:6px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{background:white;padding:10px;border:1px solid #c6d0dc}object{display:block;width:100%;height:540px}h3{margin:0}a{color:#145d9a}</style>'


def card(label, path):
    return f'<article><h3>{label}</h3><object type="image/svg+xml" data="{path}"></object><a href="{path}">原始 SVG</a></article>'


for name, panel in [('overview', 'Transformer-F0'), ('detail', 'Transformer-F1'), ('generic', 'SensorFusion-up')]:
    r = rows[panel]
    page = '<!doctype html><meta charset="utf-8"><title>通用架构编排审核</title>' + style
    page += f'<h1>{panel} · 同一展示层级前后对照</h1><p>依据依赖、文字测量和容器几何编排；保留全部节点、绑定、源码归属和继续展开能力。</p><div class="pair">'
    page += card('修改前 · 冻结实现', r['before_svg']) + card('修改后 · 通用规则', r['svg'])
    page += '</div><p>对齐不表示并行执行。各状态分别检查线长和交叉；条件内部、包裹层和残差线路仍需改善。</p><p><a href="review.html">全部双状态和其他模型</a></p>'
    (OUT / f'{name}.html').write_text(page)
page = '<!doctype html><meta charset="utf-8"><title>通用输入流对齐审核</title>' + style + '<h1>通用规则 · 双状态与跨模型审核</h1>'
page += '<p>Transformer 专用参照和通用两档分别对照。当前仍未完成双状态视觉收敛。以下所有规则均由依赖和几何触发。</p>'
for title, ref, name in [('概览', 'reference-collapsed.svg', 'Transformer-F0'), ('详图', 'reference-expanded.svg', 'Transformer-F1')]:
    page += '<h2>' + title + '</h2><div class="pair">' + card('专用参照', '../../generic-convergence/current/' + ref) + card('通用切面', rows[name]['svg']) + '</div>'
for r in report['rows']:
    page += '<h2>' + r['name'] + '</h2><p>' + str(len(r['stream_alignments'])) + ' 处伸展；节点和边集合与修改前一致。</p><div class="pair">'
    page += card('冻结修改前', r['before_svg']) + card('修改后', r['svg']) + '</div>'
page += '<p><a href="suite-report.json">捕获及绑定比对</a> · <a href="independent-report.json">SVG 独立审核</a></p>'
(OUT / 'review.html').write_text(page)
native = '<!doctype html><meta charset="utf-8"><title>SVG native text audit</title><style>body{margin:0}section{margin:20px}</style>'
for r in report['rows']:
    native += '<section data-panel="' + r['name'] + '"><h2>' + r['name'] + '</h2>' + (OUT / r['svg']).read_text() + '</section>'
(OUT / 'native-audit.html').write_text(native)
print(OUT / 'review.html')
