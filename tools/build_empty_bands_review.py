"""Show actual SVGs at unchanged native font size before/after compaction."""
import html
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/empty-bands/current'
if __name__=='__main__':
    reports=[json.loads((OUT/(s+'-report.json')).read_text()) for s in ['small','large']];rows={r['name']:r for report in reports for r in report['rows']}
    head='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>全局空白横带压缩审核</title><style>body{font:16px system-ui;margin:24px;background:#f5f7fb;color:#293746}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}</style>'
    intro='<h1>压缩全局空白，保留计算与细节</h1><p>左：b37c74e；右：当前。统一纵向坐标映射，只删除无节点、标题、横线、标签、端口及显式间距的空白。具体节点大小、字体、来源、消费槽、条件、折叠前沿和交叉关系保持不变；不重新布线。规则没有模型名或参考坐标选择器。</p>'
    def panel(name,native=False):
        r=rows[name];q=r['quality'];d=json.loads((OUT/r['document']).read_text());rec=d['diagnostics']['routing'].get('empty_band_compaction');note='已压缩' if rec and rec['accepted'] else '未压缩'
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 图元 · '+str(q['line_geometry']['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(q['native_width_px'])+'×'+str(q['native_height_px'])+' · '+note+' · 线段接触 '+str(len(q['line_geometry']['unrelated_contacts']))+'</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    page=head+intro
    for report in reports:
        for c in report['comparisons']:page+='<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'text-qa.html').write_text(head+'<h1>原生字号文字审核</h1>'+''.join(panel(n,True) for n in rows)+'</html>')
    for name,case in [('foreign','ForeignPassage'),('detail','Transformer-panel-1'),('main','Transformer-panel-0')]:
        (OUT/(name+'-review.html')).write_text(head+intro+('<p>此陌生案例为明确标注的合成 IR，不代表 Python 源码恢复证明。</p>' if name=='foreign' else '')+'<div class="grid">'+panel(case+'-before')+panel(case+'-current')+'</div></html>')
    (OUT/'transformer-review.html').write_text(head+'<h1>通用中间语义状态与专用展开参考</h1><p>仍可向内部操作和源码展开；整体语义与版式收敛尚未完成。</p><div class="grid">'+panel('Transformer-panel-0-current')+'<section><h3>专用展开参考</h3><div class="fit"><img src="/verification/title-passages/current/dedicated-reference.svg" alt="专用参考"></div></section></div>'+panel('Transformer-panel-1-current')+panel('Transformer-panel-2-current')+'</html>')
