"""Show actual final-entry SVGs and selected cross-scope routes."""
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/source-columns/current'
if __name__=='__main__':
    reports=[json.loads((OUT/(s+'-report.json')).read_text()) for s in ['small','large']];rows={r['name']:r for report in reports for r in report['rows']}
    head='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>最终布局中的跨区端口审核</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}</style>'
    intro='<h1>在最终排版上复核跨区端口</h1><p>左：478ae13；右：当前。固定所有图元与折叠状态，按真实来源及接收区域试排侧入口。比较完整布线与保留远处路径的候选；只接受交叉减少、线长不增加且事实、终端、已有约束和直接表达保留的结果。没有模型名或专用坐标规则。第三组列序未改变。</p>'
    def panel(name,native=False):
        r=rows[name];q=r['quality']
        note='（左侧局部折叠往返状态）' if name=='ForeignFour-opened' else ''
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+note+'</h3><p>'+str(r['nodes'])+' 图元 · '+str(q['line_geometry']['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(q['native_width_px'])+'×'+str(q['native_height_px'])+' · 非相关线段接触 '+str(len(q['line_geometry']['unrelated_contacts']))+'</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    page=head+intro
    for report in reports:
        for c in report['comparisons']:page+='<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'text-qa.html').write_text(head+'<h1>正式 SVG 原生文字审核</h1>'+''.join(panel(n,True) for n in rows)+'</html>')
    (OUT/'foreign-review.html').write_text(head+intro+'<p>此例为明确标注的合成 IR，验证陌生拓扑的绘图规则，不代表 Python 源码恢复证明。</p><div class="grid">'+panel('ForeignFour-before')+panel('ForeignFour-current')+'</div></html>')
    (OUT/'main-review.html').write_text(head+intro+'<div class="grid">'+panel('Transformer-panel-0-before')+panel('Transformer-panel-0-current')+'</div></html>')
    doc=json.loads((OUT/'Transformer-panel-0-current.layout.json').read_text());boxes={p['id']:p for p in doc['layout']['nodes']};edges={e['id']:e for e in doc['layout']['edges']}
    changed=next(t['entries'] for t in doc['diagnostics']['routing']['final_scope_entry_refinement']['attempts'] if t['accepted'])
    ids={id for c in changed for id in [edges[c['edge']]['source'],edges[c['edge']]['target']]};ns=[boxes[id] for id in ids]
    x=min(n['x'] for n in ns)-45;y=min(n['y'] for n in ns)-70;w=max(n['x']+n['w'] for n in ns)-x+45;h=max(n['y']+n['h'] for n in ns)-y+45
    page=head+intro+'<div class="grid">'
    for suffix in ['before','current']:
        svg=ET.parse(OUT/('Transformer-panel-0-'+suffix+'.svg')).getroot();svg.set('viewBox',f'{x} {y} {w} {h}');svg.set('width',str(w));svg.set('height',str(h))
        page+='<section><h3>'+suffix+'</h3><div class="fit">'+ET.tostring(svg,encoding='unicode').replace('ns0:','').replace(':ns0','')+'</div></section>'
    (OUT/'entries-review.html').write_text(page+'</div></html>')
    (OUT/'transformer-review.html').write_text(head+'<h1>通用中间语义状态与专用展开参考</h1><p>内部操作和源码仍能进一步展开。整体语义和版式收敛尚未完成。</p><div class="grid">'+panel('Transformer-panel-0-current')+'<section><h3>专用展开参考</h3><div class="fit"><img src="/verification/title-passages/current/dedicated-reference.svg" alt="专用参考"></div></section></div><h2>当前细节状态</h2>'+panel('Transformer-panel-1-current')+panel('Transformer-panel-2-current')+'</html>')
