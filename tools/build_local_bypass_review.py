"""Build an actual-SVG review with local crops and full reference comparison."""
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/local-bypasses/current'
read=lambda p:json.loads(p.read_text())

if __name__=='__main__':
    audit=read(OUT/'independent-report.json');assert audit['passed']
    row=next(r for r in audit['comparisons'] if r['name']=='Transformer-panel-0')
    docs=[read(OUT/('Transformer-panel-0-'+s+'.layout.json')) for s in ['before','current']]
    scope=docs[1]['layout']['local_bypasses'][0]
    edges=[next(e for e in d['layout']['edges'] if e['id']==scope['edge']) for d in docs]
    boxes=[p for p in docs[1]['layout']['nodes'] if p['id'] in scope['frontier']]
    points=[p for e in edges for p in e['route']['points']]
    left=min(p['x'] for p in points)-24;right=max(p['x']+p['w'] for p in boxes)+24
    top=min(p['y'] for p in points)-50;bottom=max(p['y'] for p in points)+50
    for suffix in ['before','current']:
        tree=ET.parse(OUT/('Transformer-panel-0-'+suffix+'.svg'));svg=tree.getroot()
        svg.set('viewBox',f'{left} {top} {right-left} {bottom-top}');svg.set('width',str(right-left));svg.set('height',str(bottom-top))
        tree.write(OUT/('detail-'+suffix+'.svg'),encoding='unicode')
    a,b=row['before'],row['current'];reduction=100*(a['wire']-b['wire'])/a['wire']
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>局部旁路：通用分支证据与版式审核</title><style>
body{font:16px/1.6 system-ui;background:#f5f7fb;color:#263447;margin:20px}main{max-width:1500px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.three{grid-template-columns:repeat(3,minmax(0,1fr))}
section{background:white;border:1px solid #cbd5e1;padding:16px;margin:12px 0;min-width:0}h1{margin:8px 0}h2{font-size:19px;margin:0 0 10px}
img{width:100%;height:auto}.detail img{height:460px;object-fit:contain}a{color:#175fc2}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;border-bottom:1px solid #dbe2ec;padding:8px}
@media(max-width:850px){.grid,.three{display:block}}</style><main><h1>局部旁路：已采用的有限改进</h1>'''
    page+=f'''<p>依据已认证的分支路径及可见包围框确定局部通道，保留原始来源归属、操作数、物理端点和更细展开能力。展开标题仍允许穿行。</p>
<p><strong>主图：{a['nodes']} 个图元 / {a['edges']} 条连接；交叉 {a['crossings']} → {b['crossings']}；线长 {a['wire']} → {b['wire']}（减少 {reduction:.2f}%）。</strong>
两条前馈旁路靠近实际分支；含条件路径的注意力分支保留原通道。模块组织、画布尺寸与参考图的差距仍在。</p><div class="grid detail">'''
    for suffix,title in [('before','之前：跟随较大的源码归属范围'),('current','当前：围绕已认证的局部分支')]:
        page+=f'<section><h2>{title}</h2><a href="Transformer-panel-0-{suffix}.svg"><img src="detail-{suffix}.svg" alt="{title}"></a></section>'
    page+='''</div><p>以上为同一正式 SVG 的局部视窗，仅用于放大检查；点击可查看原始整图。</p>
<section><h2>泛化及独立审核</h2><p>'''+f"{len(audit['comparisons'])} 个状态、{len(audit['comparisons'])*2} 张 SVG 对照；五种损坏反例均被拒绝。"+'''节点、原始绑定、直接表达、约束收据和 SVG 障碍分别核对。
仅比较固定的主图与两张详图，没有重跑图组规划。原始源码投影仍可恢复 3371 个节点 / 3663 条边；本轮没有重新路由整张原始源码 SVG 或测量浏览器性能。</p><table><tr><th>案例</th><th>局部旁路</th><th>线长：前 → 后</th><th>交叉：前 → 后</th></tr>'''
    for r in audit['comparisons']:
        x,y=r['before'],r['current']
        page+=f"<tr><td>{html.escape(r['name'])}</td><td>{y['local_bypasses']}</td><td>{x['wire']} → {y['wire']}</td><td>{x['crossings']} → {y['crossings']}</td></tr>"
    page+='''</table></section><div class="grid three">'''
    for src,title in [('Transformer-panel-0-before.svg','之前的通用主图'),('Transformer-panel-0-current.svg','当前通用中间语义状态'),('/verification/title-passages/current/dedicated-reference.svg','专用参考图')]:
        page+=f'<section><h2>{title}</h2><a href="{src}"><img src="{src}" alt="{title}"></a></section>'
    page+='''</div><section><h2>证据</h2><p><a href="independent-report.json">独立 SVG 审核</a> · <a href="large-report.json">三张大图的正式对照</a> · <a href="small-report.json">陌生、残缺、状态与条件组合</a> · <a href="source-expandability.json">原始投影完整性</a> · <a href="/docs/local-bypasses.md">设计与复现</a></p>
<p>专用展开图对应通用图的一个中间语义状态，其下仍可展开。此次仅改善局部绕行，整体目标仍未完成。</p></section></main></html>'''
    (OUT/'review.html').write_text(page)
