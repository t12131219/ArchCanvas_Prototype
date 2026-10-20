"""Review actual before/after SVGs and retain the dedicated reference for evaluation."""
import hashlib
import html
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/sample-frames/current'
r = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="render-report-sha256" content="{digest}">
<title>通用重复区域与代表调用审核</title><style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}
.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}
.fit svg{{width:100%;height:auto}}table{{border-collapse:collapse}}td,th{{border:1px solid #bdc9d5;padding:10px;text-align:left}}
.native{{overflow:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''
def panel(row):
    q = row['quality']
    return f'''<article><h2>{html.escape(row['name'])}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''
page = head + '<h1>以明确身份说明替代重复的代表调用外框</h1><p class="note">只在唯一已证明代表与完整、关闭的后续调用集合中合并外框。原始调用身份、参数关系、每个计算、端口、条件与后续调用均保留。异构、未知、可变、共享身份或已展开的后续调用保留原有边界。默认还需实际布局测量通过。</p>'
page += '<table><tr><th>输入</th><th>前 → 后尺寸</th><th>前 → 后线长</th><th>前 → 后交叉</th></tr>'
for c in r['comparisons']:
    a, b = c['before'], c['current']
    page += f"<tr><td>{c['name']}</td><td>{a['width']} × {a['height']} → {b['width']} × {b['height']}</td><td>{a['wire']} → {b['wire']}</td><td>{a['crossings']} → {b['crossings']}</td></tr>"
page += '</table>'
for name in [c['name'] for c in r['comparisons'] if c['name'] != 'transformer']:
    page += '<div class="grid">' + ''.join(panel(row) for row in r['rows'] if row['name'].startswith(name + '-')) + '</div>'
(OUT / 'comparison.html').write_text(page + '</html>')
page = head + '<h1>通用 Transformer 的代表调用表达</h1><p class="note">89 → 87 图元，97 条边不变；2066 × 4028 → 2002 × 3908 px，交叉 57 → 56，无关接触仍为 0。两个代表调用身份在序列框标题区明确说明，后续五次调用各自保持在可展开的摘要内。三组角色列与三条已实现上下文通道继续保留。主图语义及整体版式与专用参考仍有差距。</p><div class="grid">'
page += ''.join(panel(row) for row in r['rows'] if row['name'].startswith('transformer-')) + '</div>'
reference = ROOT / 'verification/generic-convergence/current/reference-expanded.svg'
page += '<article><h2>专用全展开参考（仅用于评价）</h2><div class="fit">' + reference.read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for row in r['rows']:
    page += '<section class="native" data-svg="' + row['svg'] + '"><h2>' + row['name'] + '</h2>' + (OUT / row['svg']).read_text() + '</section>'
(OUT / 'text-qa.html').write_text(page + '</html>')
print(json.dumps({'panels': len(r['rows']), 'render_report_sha256': digest}))
