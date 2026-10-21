"""Show default title passages beside the preceding obstacle policy."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/title-passages/current'
read = lambda p: json.loads(p.read_text())
if __name__ == '__main__':
    reports = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    audit = read(OUT / 'independent-report.json')
    rows = {r['name']: r for report in reports for r in report['rows']}
    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>模块标题区域允许连线穿过</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}h2{margin-top:36px}</style>'
    def panel(name, native=False):
        r = rows[name];q = r['quality'];g = q['line_geometry']
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 节点 · '+str(g['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(len(g['unrelated_contacts']))+' 接触</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    intro = '<h1>模块标题区允许连线直接穿过</h1><p>左：此前避让标题；右：当前默认穿过标题。真实计算节点、未知边界及无关模块的内部区域仍参与障碍路由。</p>'
    page = head+intro+'<p>图组直接覆盖 '+str(audit['joint']['before'])+' → '+str(audit['joint']['after'])+'；连线变短不等于所有交叉都减少，完整代价见每张图。</p>'
    page += '<p>已知退化：Transformer 主图交叉 27 → 35，第一张详图 4 → 19；第二张详图改善为 18 → 16。BraidedInputs 自适应展开从 56 增至 68 节点，不能视为相同前沿的纯布线比较。未完成专用参考收敛。</p>'
    for report in reports:
        for c in report['comparisons']:
            page += '<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    for r in reports[1]['rows']:
        if '-trial-' in r['name']:page += '<h2>规划候选</h2>'+panel(r['name'])
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'same-source-review.html').write_text(head+intro+'<div class="grid">'+panel('SameSource-before')+panel('SameSource-current')+'</div></html>')
    (OUT/'text-qa.html').write_text(head+'<h1>'+str(len(rows))+' 张 SVG 原生文字审核</h1>'+''.join(panel(name,True) for name in rows)+'</html>')
    reference = ROOT/'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
    (OUT/'dedicated-reference.svg').write_bytes(reference.read_bytes())
    j = reports[1]['joint']
    (OUT/'transformer-review.html').write_text(head+'<h1>当前通用语义状态与专用展开参考</h1><p>模块标题不再是连线路由障碍。最细事实与继续展开能力保留；整体语义及视觉收敛仍未完成。</p><div class="grid">'+panel(j['panels'][0]['capture'])+'<section><h3>专用参考</h3><div class="fit"><img alt="专用展开参考" src="dedicated-reference.svg"></div></section></div><h2>实际选择的详图</h2>'+''.join(panel(p['capture']) for p in j['panels'][1:])+'</html>')
