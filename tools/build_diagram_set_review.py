"""Build review pages from the actual bounded diagram-set artifacts."""
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/diagram-set/current'
report = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="render-report-sha256" content="{digest}"><title>通用主图与局部详图审核</title>
<style>body{{font:16px Arial;color:#293746;margin:20px}}h1{{font-size:24px}}h2{{font-size:19px}}
.note{{background:#fff3d4;padding:14px;line-height:1.6}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
article{{border:1px solid #bfcbd6;padding:16px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}
table{{border-collapse:collapse}}td,th{{border:1px solid #bfcbd6;padding:10px;text-align:left}}.native{{overflow:auto;margin-top:20px}}</style>'''


def panel(r):
    q = r['quality']
    return f'''<article><h2>{html.escape(r['name'])}</h2><p>{r['nodes']} 图元 / {r['edges']} 边 ·
{q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 ·
{len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{r['svg']}">原始 SVG</a>
<div class="fit">{(OUT / r['svg']).read_text()}</div></article>'''


page = head + '<h1>主图保留语义摘要，局部详图补充直接计算</h1>'
page += '<p class="note">规则依据可见边界、局部事实、精确端口和实际图面质量选择详图。'
page += '六组主图均与冻结基线逐字节相同。图组只补充阅读路径，不能替代主图对专用参考的接近度优化。'
page += '表内计数为当前焦点与证据范围内的逐实例表达目标；摘要存在和规划意图不计为直接表达。</p>'
page += '<table><tr><th>输入</th><th>图面</th><th>主图直接表达</th><th>图组合计</th><th>待展开</th></tr>'
for s in report['sets']:
    page += f'''<tr><td><a href="{s['name']}/index.html">{s['name']}</a></td><td>{s['panels']}</td>
<td>{s['main_fulfilled']} / {s['goals']}</td><td>{s['fulfilled']} / {s['goals']}</td><td>{s['deferred']}</td></tr>'''
page += '</table>'
for name in ['FiberBlend', 'BrokenFiberBlend', 'SameSource', 'MixedWeave', 'UnknownFusion']:
    page += '<h2>' + name + '</h2><div class="grid">'
    page += ''.join(panel(r) for r in report['rows'] if r['name'].startswith(name + '-')) + '</div>'
(OUT / 'comparison.html').write_text(page + '</html>')
transformer = head + '<h1>语义主图、局部角色与专用参考</h1>'
transformer += '<p class="note">主图保持 89 图元 / 97 边，2588 × 4118 px，57 交叉、0 无关接触。'
transformer += '三个局部详图直接补充 24 项表达，总计 60 / 1855 项；1795 项仍待展开。'
transformer += '该逐实例细节指标不等于架构语义覆盖率，也不表示整体接近度已改善。'
transformer += '专用全展开是通用图目标中间状态的参照；底层细节继续保留。</p><div class="grid">'
transformer += ''.join(panel(r) for r in report['rows'] if r['name'].startswith('transformer-')) + '</div>'
reference = '../../../verification/generic-convergence/current/reference-expanded.svg'
transformer += '<article><h2>专用完全展开参考（仅评价）</h2><p><a href="' + reference + '">原始参考</a></p><object style="width:100%;height:1500px" data="' + reference + '"></object></article></html>'
(OUT / 'transformer-comparison.html').write_text(transformer)
native = head + '<h1>实际 SVG 原生比例文字检查</h1>'
for r in report['rows']:
    native += '<section class="native" data-svg="' + r['svg'] + '"><h2>' + r['name'] + '</h2>' + (OUT / r['svg']).read_text() + '</section>'
(OUT / 'text-qa.html').write_text(native + '</html>')
print(json.dumps({'panels': len(report['rows']), 'render_report_sha256': digest}))
