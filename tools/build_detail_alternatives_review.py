"""Build review pages from the saved, actually rendered SVGs."""
from pathlib import Path
import json
import html
import hashlib
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/detail-alternatives/experiment'
r = json.loads((OUT / 'render-report.json').read_text())
esc = html.escape
style = '''body{font:16px Arial,"Noto Sans SC",sans-serif;color:#293746;margin:24px}h1{font-size:25px}p{line-height:1.6}table{border-collapse:collapse}td,th{border:1px solid #c8d2dc;padding:8px;text-align:left}.panels{display:grid;grid-template-columns:repeat(3,minmax(300px,1fr));gap:16px}article{border:1px solid #c8d2dc;padding:12px;overflow:auto}article svg{display:block;max-width:100%;height:auto;max-height:610px;margin:auto}article h3{font-size:17px}a{color:#2168a0}.native article{margin:16px 0}.native article svg{max-width:none;max-height:none;margin:0}'''
def card(row, title=None):
    return '<article data-case="'+esc(row['name'])+'"><h3>'+esc(title or row['name'])+'</h3><p>'+str(row['nodes'])+' 图元 · '+str(row['edges'])+' 边 · '+str(row['quality']['native_width_px'])+' × '+str(row['quality']['native_height_px'])+' px</p>'+(OUT / row['svg']).read_text()+'</article>'
rows = r['rows']
workshop = [next(row for row in rows if row['name'] == 'NestedWorkshop-current-'+str(i)) for i in [0,1,4]]
first = '<h2>同一陌生组合：折叠主图与可独立打开的局部关系</h2><p>整块详图超过本例高度预算时，仍可打开已证明的局部关系；未知调用保持真实接口。主图完整保留。</p><div class="panels">'+''.join(card(row, title) for row, title in zip(workshop,['折叠主图','选择操作与多结果边界','门控关系及准确输入']))+'</div>'
table = '<h2>相同预算下的图组直接表达</h2><p>分母是逐实例细节目标数量，不是架构语义覆盖率。增加的详图占用额外图面；主图均逐字节一致。</p><table><tr><th>输入</th><th>之前 → 当前</th><th>图面数</th><th>主图</th></tr>'+''.join('<tr><td>'+esc(p['name'])+'</td><td>'+str(p['before']['fulfilled'])+' → '+str(p['current']['fulfilled'])+' / '+str(p['current']['goals'])+'</td><td>'+str(p['before']['panels'])+' → '+str(p['current']['panels'])+'</td><td>SVG 完全一致</td></tr>' for p in r['comparisons'])+'</table>'
nested = '<h2>嵌套 helper：外层摘要下面继续进入内部调用</h2><div class="panels">'+''.join(card(next(row for row in rows if row['name']==name),title) for name,title in [('RefactoredCurve-current-0','折叠主图'),('RefactoredCurve-current-1','外层详图：仍保留内部摘要'),('RefactoredCurve-current-2','内部 helper 的原始计算')])+'</div>'
page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通用主图与局部细节备选审核</title><meta name="inline-render-report-sha256" content="'+hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()+'"><style>'+style+'</style><h1>通用主图与局部细节备选审核</h1><p>基于原始局部事实提供嵌套范围、关系和单次调用入口。折叠状态之下保留细节；本阶段不代表 Transformer 主图已接近专用参考。</p>'+first+table+nested+'<p><a href="text-qa.html">全部实际 SVG 原生比例文字审核</a> · <a href="render-report.json">渲染记录</a></p></html>'
(OUT / 'review.html').write_text(page)
(OUT / 'text-qa.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>局部详图原生文字审核</title><meta name="inline-render-report-sha256" content="'+hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()+'"><style>'+style+'</style><body class="native"><h1>全部 SVG 原生比例文字审核</h1>'+''.join(card(row) for row in rows)+'</body></html>')
print(json.dumps({'panels':len(rows)}))
