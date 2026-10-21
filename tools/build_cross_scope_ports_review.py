"""Review measured cross-scope port choices and unchanged semantic frontiers."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cross-scope-ports/current'
read = lambda p: json.loads(p.read_text())
if __name__ == '__main__':
    reports = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    audit = read(OUT / 'independent-report.json')
    rows = {r['name']: r for report in reports for r in report['rows']}
    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>跨模块入口的实测选择</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}h2{margin-top:36px}</style>'
    def panel(name, native=False):
        r = rows[name];q = r['quality'];g = q['line_geometry']
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 节点 · '+str(g['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(len(g['unrelated_contacts']))+' 接触</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    intro = '<h1>跨模块入口：逐组测量后选择接入侧</h1><p>左：5dbf190；右：当前。只根据几何位置和真实依赖提出候选，保留节点位置、操作数及已实现表达；展开模块标题仍允许穿过。陌生样例为手工构造的通用 IR，不代表 Python 抽取验证。</p>'
    page = head+intro+'<p>图组直接覆盖 '+str(audit['joint']['before'])+' → '+str(audit['joint']['after'])+'；整体语义与专用参考收敛仍未完成。</p>'
    for report in reports:
        for c in report['comparisons']:
            page += '<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    for r in reports[1]['rows']:
        if '-trial-' in r['name']:page += '<h2>实际规划候选</h2>'+panel(r['name'])
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'main-review.html').write_text(head+intro+'<div class="grid">'+panel('Transformer-panel-0-before')+panel('Transformer-panel-0-current')+'</div></html>')
    (OUT/'foreign-review.html').write_text(head+intro+'<div class="grid">'+panel('ForeignReconvergence-before')+panel('ForeignReconvergence-current')+'</div></html>')
    (OUT/'text-qa.html').write_text(head+'<h1>'+str(len(rows))+' 张 SVG 原生文字审核</h1>'+''.join(panel(name,True) for name in rows)+'</html>')
    j = reports[1]['joint']
    (OUT/'transformer-review.html').write_text(head+'<h1>当前通用语义状态与专用展开参考</h1><p>标题可通行、跨模块入口经实测选择。此语义状态下面仍能展开源码事实；当前尚未完成与专用参考的全面语义及视觉收敛。</p><div class="grid">'+panel(j['panels'][0]['capture'])+'<section><h3>专用参考</h3><div class="fit"><img alt="专用展开参考" src="/verification/title-passages/current/dedicated-reference.svg"></div></section></div><h2>实际选择的详图</h2>'+''.join(panel(p['capture']) for p in j['panels'][1:])+'</html>')
