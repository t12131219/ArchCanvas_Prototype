"""Review fixed call arguments staged beside their actual consumers."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/consumer-arguments/current'
read = lambda p: json.loads(p.read_text())
if __name__ == '__main__':
    reports = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    audit = read(OUT / 'independent-report.json')
    rows = {r['name']: r for report in reports for r in report['rows']}
    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>固定输入的消费者邻近布局</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}h2{margin-top:36px}</style>'
    def panel(name, native=False):
        r = rows[name];q = r['quality'];g = q['line_geometry']
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 节点 · '+str(g['crossings'])+' 交叉 · 线长 '+str(q['wire_length'])+' · '+str(len(g['unrelated_contacts']))+' 接触</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    intro = '<h1>固定调用输入：在消费者旁保留明确数值和真实连接</h1><p>左：a9260ef；右：当前。仅移动已证明固定值、且只有一个可见消费区域的现有输入。条件、未知边界、来源归属和操作数均保留；不裁剪分支，展开模块标题仍允许穿过。小样例从真实源码静态抽取，未执行未知调用。</p>'
    page = head+intro+'<p>图组直接覆盖 '+str(audit['joint']['before'])+' → '+str(audit['joint']['after'])+'；整体语义与专用参考收敛仍未完成。</p>'
    for report in reports:
        for c in report['comparisons']:
            page += '<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    for r in reports[1]['rows']:
        if '-trial-' in r['name']:page += '<h2>实际规划候选</h2>'+panel(r['name'])
    (OUT/'review.html').write_text(page+'</html>')
    (OUT/'main-review.html').write_text(head+intro+'<div class="grid">'+panel('Transformer-panel-0-before')+panel('Transformer-panel-0-current')+'</div></html>')
    (OUT/'mixed-review.html').write_text(head+intro+'<div class="grid">'+panel('MixedChoices-before')+panel('MixedChoices-current')+'</div></html>')
    (OUT/'text-qa.html').write_text(head+'<h1>'+str(len(rows))+' 张 SVG 原生文字审核</h1>'+''.join(panel(name,True) for name in rows)+'</html>')
    j = reports[1]['joint']
    (OUT/'transformer-review.html').write_text(head+'<h1>当前通用语义状态与专用展开参考</h1><p>标题可通行，固定调用输入按实际消费者就近组织。此语义状态下面仍能展开源码事实；与专用参考的整体语义与视觉收敛尚未完成。</p><div class="grid">'+panel(j['panels'][0]['capture'])+'<section><h3>专用参考</h3><div class="fit"><img alt="专用展开参考" src="/verification/title-passages/current/dedicated-reference.svg"></div></section></div><h2>实际选择的详图</h2>'+''.join(panel(p['capture']) for p in j['panels'][1:])+'</html>')
