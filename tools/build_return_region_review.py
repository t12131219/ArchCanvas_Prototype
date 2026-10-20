"""Build review pages from actual hashed SVG exports, including expansion tradeoffs."""
import hashlib
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ET.register_namespace('', 'http://www.w3.org/2000/svg')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/return-regions/current'
r = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="render-report-sha256" content="{digest}"><title>通用条件返回与可逆细节审核</title>
<style>body{{font:16px Arial;color:#293746;margin:24px}}h1{{font-size:24px}}h2{{font-size:18px}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}article{{border:1px solid #bdc9d5;padding:14px;margin:16px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}table{{border-collapse:collapse}}td,th{{border:1px solid #bdc9d5;padding:10px;text-align:left}}.native{{overflow:auto}}.native svg{{max-width:none;display:block}}.note{{background:#fff3d4;padding:16px;line-height:1.6}}</style>'''
def panel(row):
    q = row['quality']
    return f'''<article><h2>{html.escape(row['name'])}</h2><p>{row['nodes']} 图元 / {row['edges']} 边 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · {len(q['line_geometry']['unrelated_contacts'])} 无关接触</p><a href="{row['svg']}">SVG</a><div class="fit">{(OUT / row['svg']).read_text()}</div></article>'''
page = head + '<h1>条件分支与本地返回接口的统一区域</h1><p class="note">只根据源码条件、返回点与共同输出槽组织区域，不按模型名称选择，不推断实际分支或隐式 false 条件。折叠减少冗余输出边界；展开保留真实返回接口，所以默认已展开状态可能增加图元。未知、状态、身份及额外逃逸边界保留。</p>'
page += '<table><tr><th>输入 / 状态</th><th>图元 前 → 后</th><th>尺寸 前 → 后</th><th>交叉 前 → 后</th></tr>'
for c in r['comparisons']:
    a,b=c['before'],c['current']
    page += f"<tr><td>{c['name']}</td><td>{a['nodes']} → {b['nodes']}</td><td>{a['width']} × {a['height']} → {b['width']} × {b['height']}</td><td>{a['crossings']} → {b['crossings']}</td></tr>"
page += '</table>'
for name in ['ReturnAlternatives','PairedReturns','ComparedReturns','UnknownReturns','StatefulReturns','MixedWeave','ConditionalCarry']:
    page += '<div class="grid">' + ''.join(panel(row) for row in r['rows'] if row['name'].startswith(name+'-')) + '</div>'
(OUT/'comparison.html').write_text(page+'</html>')
page=head+'<h1>通用 Transformer：条件返回区域对照</h1><p class="note">87 → 86 图元，97 → 94 条边；2002 × 3908 → 2066 × 3776 px；线长 63569.6 → 62647.6，交叉 56 → 55，无关接触仍为 0。三处当前可见的条件返回接口合并。此前两个代表外框的共享未通过当前几何候选检查，因此恢复源码外框；宽度增加 64 px。底层 IR 与逻辑展开集合不变。整体语义组织、长路径、交叉与专用参考仍有差距。</p><div class="grid">'
page+=''.join(panel(row) for row in r['rows'] if row['name'].startswith('transformer-'))+'</div>'
page+='<article><h2>专用充分展开参考（仅用于评价）</h2><div class="fit">'+(ROOT/r['reference']['file']).read_text()+'</div></article></html>'
(OUT/'transformer-comparison.html').write_text(page)
page=head+'<h1>实际 SVG 原生比例文字检查</h1>'
for row in r['rows']:
    page+='<section class="native" data-svg="'+row['svg']+'"><h2>'+row['name']+'</h2>'+(OUT/row['svg']).read_text()+'</section>'
if (OUT/'ui-transformer-opened.svg').exists():
    page+='<section class="native" data-svg="ui-transformer-opened.svg"><h2>Transformer actual UI detail</h2>'+(OUT/'ui-transformer-opened.svg').read_text()+'</section>'
(OUT/'text-qa.html').write_text(page+'</html>')
if (OUT/'cli-transformer-opened.layout.json').exists():
    detail=json.loads((OUT/'cli-transformer-opened.layout.json').read_text())
    base=json.loads((OUT/'transformer-current.layout.json').read_text())
    opened=next(row for row in detail['publication']['return_regions']['rows'] if row['status']=='expanded')
    def focus(file,doc):
        node=next(n for n in doc['layout']['nodes'] if n['id']==opened['group'])
        svg=ET.fromstring((OUT/file).read_text())
        svg.set('viewBox',f"{node['x']-32} {node['y']-32} {node['w']+64} {node['h']+64}")
        svg.set('width',str(node['w']+64));svg.set('height',str(node['h']+64))
        return ET.tostring(svg,encoding='unicode')
    page=head+'<h1>Transformer 实际导出 SVG 的局部放大</h1><p class="note">真实界面双击：86 → 91 → 86 个图元。此页只调整 SVG 观察窗口以放大同一个条件返回区域；原始 SVG 不变。区域打开后恢复条件、两个源码分支、具体返回点和输出汇合；分支内部仍可继续展开。</p><div class="grid">'
    for label,file,doc in [('关闭：同一语义边界','ui-transformer-main.svg',base),('打开：恢复分支与返回接口','ui-transformer-opened.svg',detail)]:
        page+='<article><h2>'+label+'</h2><div class="fit">'+focus(file,doc)+'</div></article>'
    (OUT/'ui-detail-review.html').write_text(page+'</div></html>')
print(json.dumps({'panels':len(r['rows']),'render_report_sha256':digest}))
