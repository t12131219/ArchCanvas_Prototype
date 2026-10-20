"""Build comparison and native-size text review pages from actual SVGs."""
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/branch-tail-stages/current'
report = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
rows = {r['name']: r for r in report['rows']}
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="render-report-sha256" content="{digest}">
<title>通用分支末端与语义阶段组合审核</title>
<style>body{{font:16px Arial,sans-serif;color:#293746;margin:20px}}h1{{font-size:24px}}h2{{font-size:19px}}
.note{{background:#fff3d4;padding:14px;line-height:1.6}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:16px 0}}
.three{{grid-template-columns:repeat(3,minmax(0,1fr))}}article{{border:1px solid #c7d1dc;padding:16px;overflow:auto}}
.fit svg{{width:100%;height:auto;display:block}}a{{color:#28637f}}.native{{overflow:auto;margin-top:20px}}
</style>'''


def panel(name):
    r = rows[name]
    q = r['quality']
    svg = (OUT / r['svg']).read_text()
    return f'''<article><h2>{html.escape(name)}</h2><p>{r['nodes']} 图元 / {r['edges']} 边 ·
{q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 ·
{len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><p>限制：{html.escape(', '.join(q['issues']) or '无报告限制')} ·
<a href="{r['svg']}">原始 SVG</a></p><div class="fit">{svg}</div></article>'''


local = head + '<h1>分支末端的可逆语义组合</h1><p class="note">规则依据已有局部证明、独占使用和精确端口选择摘要成员。'
local += '操作名仍打印，展开恢复原计算；未知、条件、共享、状态及独立语义边界保留。布局分段仅在已展开且同一源码作用域时可重组。此页缩略图不代替原生文字检查。</p>'
local += '<div class="grid three">' + ''.join(panel(n) for n in ['UnaryWeave-before', 'UnaryWeave-current', 'UnaryWeave-opened']) + '</div>'
for name in ['InterruptedWeave', 'ConditionalWeave', 'ReusedWeave', 'MultipleInputWeave', 'ImageWeave', 'StatefulWeave', 'WholeBranchWeave']:
    local += '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div>'
(OUT / 'comparison.html').write_text(local + '</html>')
reference = report['reference']['svg']
relative = '../../../' + reference
transformer = head + '<h1>通用语义状态与专用参考</h1><p class="note">五处分支末端纳入相应摘要，Dropout 仍明确打印、可展开。'
transformer += '94 → 89 图元，102 → 97 边，高度 4364 → 4118，宽度 2588、57 交叉保持。该结果有局部紧凑度改善；专用参考的阶段组织、内部角色和整体可读性仍未达到。生产规则不使用模型名、案例 ID 或参考版式。</p>'
transformer += '<div class="grid">' + panel('transformer-before') + panel('transformer-current') + '</div>'
transformer += '<div class="grid"><article><h2>专用完全展开参考（仅评价）</h2><p><a href="' + relative + '">原始参考</a></p><object style="width:100%;height:1400px" data="' + relative + '"></object></article>' + panel('transformer-current') + '</div></html>'
(OUT / 'transformer-comparison.html').write_text(transformer)
native = head + '<h1>原始 SVG 比例文字检查</h1>'
for r in report['rows']:
    native += '<section class="native" data-svg="' + r['svg'] + '"><h2>' + r['name'] + '</h2>' + (OUT / r['svg']).read_text() + '</section>'
(OUT / 'text-qa.html').write_text(native + '</html>')
print(json.dumps({'panels': len(rows), 'pages': 3, 'render_report_sha256': digest}))
