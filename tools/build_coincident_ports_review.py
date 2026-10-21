"""Build before/after pages from audited SVGs, including local port crops."""
import html
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/coincident-ports/current'
if __name__=='__main__':
    reports=[json.loads((OUT/(s+'-report.json')).read_text()) for s in ['small','large','extra']];rows={r['name']:r for report in reports for r in report['rows']}
    head='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>对齐来源的端口排序审核</title><style>body{font:16px system-ui;margin:24px;background:#f5f7fb;color:#293746}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}</style>'
    intro='<h1>减少来源对齐处的端口交织</h1><p>左：e9e6b8a；右：当前。在相邻节点中心重合时试排物理端口，使距离近的来源相邻；原始操作数、条件、来源身份、独立端口及折叠前沿保留。接纳要求交叉减少且线长、尺寸、标签及既有表达不退化。标题继续允许穿行，规则不依据模型名称或参考坐标。</p>'
    def panel(name,native=False,crop=None):
        r=rows[name];q=r['quality'];d=json.loads((OUT/r['document']).read_text());rec=d['diagnostics']['routing'].get('coincident_port_refinement');note=str(len(rec['selected']))+' 组接纳' if rec else '原顺序'
        svg=(OUT/r['svg']).read_text()
        if crop:
            svg=re.sub(r'viewBox="[^"]+"','viewBox="'+' '.join(map(str,crop))+'"',svg,count=1)
            svg=re.sub(r'width="[^"]+" height="[^"]+"',f'width="{crop[2]}px" height="{crop[3]}px"',svg,count=1)
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 图元 · '+str(q['line_geometry']['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(q['native_width_px'])+'×'+str(q['native_height_px'])+' · '+note+' · 线段接触 '+str(len(q['line_geometry']['unrelated_contacts']))+'</p><div class="'+('native' if native else 'fit')+'">'+svg+'</div></section>'
    page=head+intro
    for report in reports:
        for c in report['comparisons']:page+='<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'text-qa.html').write_text(head+'<h1>原生字号文字审核</h1>'+''.join(panel(n,True) for n in rows)+'</html>')
    for name,case in [('foreign','ForeignChoice'),('source','MixedChoices'),('rejection','EscapingChain'),('main','Transformer-panel-0'),('detail','Transformer-panel-1')]:
        extra='<p>此图为明确标注的合成 IR，只用于检验几何与事实保留，不代表 Python 源码抽取证明。</p>' if name in ['foreign','rejection'] else ''
        (OUT/(name+'-review.html')).write_text(head+('<style>.fit svg{width:100%;height:410px}</style>' if name=='foreign' else '')+intro+extra+'<div class="grid">'+panel(case+'-before')+panel(case+'-current')+'</div></html>')
    doc=json.loads((OUT/rows['Transformer-panel-0-current']['document']).read_text());selection=doc['layout']['coincident_ports'][-1];p=next(n for n in doc['layout']['nodes'] if n['id']==selection['node']);crop=(p['x']-50,p['y']-290,p['w']+100,410)
    (OUT/'ports-review.html').write_text(head+'<style>.fit svg{width:100%;height:410px}</style>'+intro+'<p>下图是正式主图的局部裁切，用于查看端口交叉；完整路径和模块见 <a href="main-review.html">主图对照</a>。</p><div class="grid">'+panel('Transformer-panel-0-before',crop=crop)+panel('Transformer-panel-0-current',crop=crop)+'</div></html>')
    (OUT/'transformer-review.html').write_text(head+'<h1>通用中间语义状态与专用展开参考</h1><p>仍可进一步展开。阅读方向、密度和整体语义／视觉收敛继续保留为未完成工作。</p><div class="grid">'+panel('Transformer-panel-0-current')+'<section><h3>专用展开参考</h3><div class="fit"><img src="/verification/title-passages/current/dedicated-reference.svg" alt="专用参考"></div></section></div>'+panel('Transformer-panel-1-current')+panel('Transformer-panel-2-current')+'</html>')
