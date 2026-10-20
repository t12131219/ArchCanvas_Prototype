"""Review actual before/after SVGs and retain the dedicated reference for evaluation."""
import hashlib
import html
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/entry-bands/current'
r = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="render-report-sha256" content="{digest}">
<title>通用输入接口与主图布局审核</title><style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}
.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}
.fit svg{{width:100%;height:auto}}table{{border-collapse:collapse}}td,th{{border:1px solid #bdc9d5;padding:10px;text-align:left}}
.native{{overflow:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''
def panel(row):
    q = row['quality']
    return f'''<article><h2>{html.escape(row['name'])}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''
page = head + '<h1>依据真实消费位置排列输入接口</h1><p class="note">所有对照保留相同的可见节点、操作数、条件、角色、证据、折叠状态和底层 IR。只有测量有收益、且通过实际路由检查的候选才采用。陌生组合以展开 helper 的状态检验；摘要状态另行保留。本轮改善几何组织，尚未完成主图与专用参考的语义对应。</p>'
page += '<table><tr><th>输入</th><th>前 → 后尺寸</th><th>前 → 后线长</th><th>前 → 后交叉</th></tr>'
for c in r['comparisons']:
    a, b = c['before'], c['current']
    page += f"<tr><td>{c['name']}</td><td>{a['width']} × {a['height']} → {b['width']} × {b['height']}</td><td>{a['wire']} → {b['wire']}</td><td>{a['crossings']} → {b['crossings']}</td></tr>"
page += '</table>'
for name in [c['name'] for c in r['comparisons'] if c['name'] != 'transformer']:
    page += '<div class="grid">' + ''.join(panel(row) for row in r['rows'] if row['name'].startswith(name + '-')) + '</div>'
(OUT / 'comparison.html').write_text(page + '</html>')
page = head + '<h1>通用 Transformer 主图的几何组织优化</h1><p class="note">89 图元 / 97 边全部保留；2588 × 4118 → 2066 × 4028 px，面积减少约 22%；57 交叉保持不变，0 无关接触。3 组角色列与 3 条已实现上下文通道保留。尚未实现的 9 条通道提议仍明确记录，暂不预留空白沟槽。这里是目标中间语义状态的布局改进；细粒度展开与专用图语义对应仍需继续验收。</p><div class="grid">'
page += ''.join(panel(row) for row in r['rows'] if row['name'].startswith('transformer-')) + '</div>'
reference = ROOT / 'verification/generic-convergence/current/reference-expanded.svg'
page += '<article><h2>专用全展开参考（仅用于评价）</h2><div class="fit">' + reference.read_text() + '</div></article></html>'
(OUT / 'transformer-comparison.html').write_text(page)
page = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for row in r['rows']:
    page += '<section class="native" data-svg="' + row['svg'] + '"><h2>' + row['name'] + '</h2>' + (OUT / row['svg']).read_text() + '</section>'
(OUT / 'text-qa.html').write_text(page + '</html>')
print(json.dumps({'panels': len(r['rows']), 'render_report_sha256': digest}))
