"""Build before/after, expansion, native-text and dedicated-reference review pages."""
import html
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/prefix-role-paths/current'
read=lambda p:json.loads(p.read_text())
if __name__=='__main__':
    reports=[read(OUT/'small-report.json')]
    if (OUT/'large-report.json').exists():reports.append(read(OUT/'large-report.json'))
    rows={r['name']:r for report in reports for r in report['rows']}
    head='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>角色与前置路径合组审核</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}h2{margin-top:36px}</style>'
    def panel(name,native=False):
        r=rows[name];q=r['quality'];g=q['line_geometry']
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 图元 · '+str(g['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(q['native_width_px'])+'×'+str(q['native_height_px'])+'</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    intro='<h1>角色与前置 helper 路径的通用合组</h1><p>左：ef94501；右：当前。同一证书中的已证明 helper 路径和后续角色可合为一个阶段；只跨越独占普通赋值别名。阶段 → helper → 原始运算仍能逐步展开。未知、条件、状态、共享输出和选中结果槽不作为透明连接。展开模块标题继续允许连线通行。</p>'
    page=head+intro
    for report in reports:
        for c in report['comparisons']:page+='<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    (OUT/'review.html').write_text(page+'</html>')
    for name in ['PreparedCurve','MixedPreparation']:
        (OUT/(name+'-review.html')).write_text(head+intro+'<div class="grid">'+panel(name+'-before')+panel(name+'-current')+'</div><h2>继续展开</h2><div class="grid">'+panel(name+'-opened')+panel(name+'-deep')+'</div></html>')
    (OUT/'text-qa.html').write_text(head+'<h1>'+str(len(rows))+' 张正式 SVG 原生文字审核</h1>'+''.join(panel(name,True) for name in rows)+'</html>')
    if len(reports)>1:
        (OUT/'main-review.html').write_text(head+intro+'<div class="grid">'+panel('Transformer-panel-0-before')+panel('Transformer-panel-0-current')+'</div></html>')
        joint=reports[1]['joint']
        (OUT/'transformer-review.html').write_text(head+'<h1>通用中间语义状态与专用展开参考</h1><p>通用规则组合相邻、可独立证明的表达；这个状态下面保留更细的 helper 和原始事实。当前与专用参考仍有方向、分组和长通道差异，整体目标未完成。</p><div class="grid">'+panel(joint['panels'][0]['capture'])+'<section><h3>专用展开参考</h3><div class="fit"><img alt="专用展开参考" src="/verification/title-passages/current/dedicated-reference.svg"></div></section></div><h2>实际选择的详图</h2>'+''.join(panel(p['capture']) for p in joint['panels'][1:])+'</html>')
