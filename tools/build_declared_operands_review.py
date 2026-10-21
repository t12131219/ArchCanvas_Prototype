"""Display actual SVGs and unchanged source bindings before/after local trials."""
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/operand-order/current'
if __name__=='__main__':
    reports=[json.loads((OUT/(s+'-report.json')).read_text()) for s in ['small','large']]
    rows={r['name']:r for report in reports for r in report['rows']}
    head='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>源码声明驱动的局部列序审核</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}</style>'
    intro='<h1>根据真实输入声明逐组试排</h1><p>左：87732cb；右：当前。仅对可独立移动的闭合分支使用消费端源码参数声明顺序，逐组实测；交叉、线长、尺寸、事实、已有约束与直接表达均不允许退化。不根据模型、案例、模块名或 Q/K/V 拼写排序。第三组增加交叉，保留原布局。</p>'
    def panel(name,native=False):
        r=rows[name];q=r['quality']
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 图元 · '+str(q['line_geometry']['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(q['native_width_px'])+'×'+str(q['native_height_px'])+'</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    page=head+intro
    for report in reports:
        for c in report['comparisons']:page+='<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'text-qa.html').write_text(head+'<h1>正式 SVG 原生文字检查</h1>'+''.join(panel(n,True) for n in rows)+'</html>')
    (OUT/'main-review.html').write_text(head+intro+'<div class="grid">'+panel('Transformer-panel-0-before')+panel('Transformer-panel-0-current')+'</div></html>')
    doc=json.loads((OUT/'Transformer-panel-0-current.layout.json').read_text());boxes={p['id']:p for p in doc['layout']['nodes']}
    crops=head+intro
    for i,row in enumerate(doc['layout']['declared_operand_rows']):
        ns=[boxes[n['node']] for n in row['nodes']]+[boxes[row['sink']]]
        x=min(n['x'] for n in ns)-40;y=min(n['y'] for n in ns)-50
        w=max(n['x']+n['w'] for n in ns)-x+40;h=max(n['y']+n['h'] for n in ns)-y+40
        crops+='<h2>局部 '+str(i+1)+'</h2><div class="grid">'
        for suffix in ['before','current']:
            svg=ET.parse(OUT/('Transformer-panel-0-'+suffix+'.svg')).getroot();svg.set('viewBox',f'{x} {y} {w} {h}');svg.set('width',str(w));svg.set('height',str(h))
            crops+='<section><h3>'+suffix+'</h3><div class="fit">'+ET.tostring(svg,encoding='unicode').replace('ns0:','').replace(':ns0','')+'</div></section>'
        crops+='</div>'
    (OUT/'columns-review.html').write_text(crops+'</html>')
    (OUT/'transformer-review.html').write_text(head+'<h1>通用中间语义状态与专用展开参考</h1><p>内部操作和源码仍可进一步展开。整体语义与版式收敛尚未完成。</p><div class="grid">'+panel('Transformer-panel-0-current')+'<section><h3>专用展开参考</h3><div class="fit"><img src="/verification/title-passages/current/dedicated-reference.svg" alt="专用参考"></div></section></div><h2>当前细节状态</h2>'+panel('Transformer-panel-1-current')+panel('Transformer-panel-2-current')+'</html>')
