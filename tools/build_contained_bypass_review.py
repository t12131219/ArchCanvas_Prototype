"""Review the actual routed SVGs, including unfamiliar and protected regions."""
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/contained-bypasses/current'
read=lambda p:json.loads(p.read_text())
ET.register_namespace('', 'http://www.w3.org/2000/svg')

def inline(name,suffix,crop=None):
    svg=ET.parse(OUT/(name+'-'+suffix+'.svg')).getroot()
    if crop:
        svg.set('viewBox',' '.join(map(str,crop)));svg.set('width',str(crop[2]));svg.set('height',str(crop[3]))
    return ET.tostring(svg,encoding='unicode')

if __name__=='__main__':
    audit=read(OUT/'independent-report.json');assert audit['passed']
    rows={r['name']:r for r in audit['comparisons']}
    current=read(OUT/'Transformer-panel-0-current.layout.json')
    s=next(s for s in current['layout']['local_bypasses'] if s.get('contained_boundaries'))
    e=next(e for e in current['layout']['edges'] if e['id']==s['edge']);ps={p['id']:p for p in current['layout']['nodes']}
    rects=[ps[id] for id in s['frontier']];top=e['route']['points'][0]['y']-50;bottom=e['route']['points'][-1]['y']+70
    left=min(ps[id]['x'] for id in s['frontier'])-150;right=max(p['x']+p['w'] for p in rects)+40
    crop=(left,top,right-left,bottom-top)
    a,b=rows['Transformer-panel-0']['before'],rows['Transformer-panel-0']['current']
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>闭合条件区域：通用旁路审核</title><style>
body{font:16px/1.6 system-ui;background:#f5f7fb;color:#263447;margin:20px}main{max-width:1500px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.three{grid-template-columns:repeat(3,minmax(0,1fr))}
section{background:white;border:1px solid #cbd5e1;padding:16px;margin:12px 0;min-width:0}h1{margin:8px 0}h2{font-size:19px;margin:0 0 10px}
svg.publication,img{width:100%;height:auto}.crop svg{height:510px;object-fit:contain}a{color:#175fc2}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;border-bottom:1px solid #dbe2ec;padding:8px}
@media(max-width:850px){.grid,.three{display:block}}</style><main><h1>闭合条件区域：保留分支，缩短旁路</h1>'''
    page+=f'''<p>同一套规则依据完整的条件边界、原始操作数和已认证旁路组织画面，不依赖模型名称。只改变连线路径；原始 IR、模块状态与进一步展开能力保留。标题继续允许穿行。</p>
<p><strong>主图：{a['nodes']} 个图元 / {a['edges']} 条连接；交叉 {a['crossings']} → {b['crossings']}；线长 {a['wire']} → {b['wire']}（减少 {100*(a['wire']-b['wire'])/a['wire']:.2f}%）。</strong></p><div class="grid crop">'''
    for suffix,title in [('before','之前：沿较大的源码外框绕行'),('current','当前：围绕实际闭合分支')]:
        page+=f'<section data-panel="Transformer-panel-0-{suffix}"><h2>{title}</h2>'+inline('Transformer-panel-0',suffix,crop)+'</section>'
    page+='</div><p>以上为实际整图 SVG 的放大视窗，只改变取景框。</p>'
    for name,title in [('ContainedChoice-closed','普通条件函数：闭合状态'),('ConditionalMosaic-closed','混合组合：只调整已证明区域，未知调用和状态写入仍保留'),('ConditionalMosaic-open','继续展开：实际分支和状态细节保留')]:
        page+='<h2>'+title+'</h2><div class="grid">'
        for suffix,label in [('before','之前'),('current','当前')]:
            page+=f'<section data-panel="{name}-{suffix}"><h2>{label}</h2>'+inline(name,suffix)+'</section>'
        page+='</div>'
    page+='<section><h2>独立 SVG 审核</h2><table><tr><th>状态</th><th>闭合边界</th><th>线长：前 → 后</th><th>交叉：前 → 后</th></tr>'
    for r in audit['comparisons']:
        x,y=r['before'],r['current']
        page+=f"<tr><td>{html.escape(r['name'])}</td><td>{y['contained_boundaries']}</td><td>{x['wire']} → {y['wire']}</td><td>{x['crossings']} → {y['crossings']}</td></tr>"
    page+='</table><p><a href="independent-report.json">独立审核</a> · <a href="roundtrip.json">保存／展开／收回</a> · <a href="source-expandability.json">原始事实投影</a></p></section><div class="grid three">'
    for src,title in [('Transformer-panel-0-before.svg','之前的通用主图'),('Transformer-panel-0-current.svg','当前通用中间语义状态'),('/verification/title-passages/current/dedicated-reference.svg','专用语义参考图')]:
        page+=f'<section><h2>{title}</h2><a href="{src}"><img src="{src}" alt="{title}"></a></section>'
    page+='''</div><p>本轮比较固定主图和两张详图，未重新规划整个图组。原始源码投影可恢复全部事实；它不代表本轮已验证数千节点的完整 SVG 路由或浏览器性能。语义状态与专用参考的整体收敛仍未完成。</p></main></html>'''
    (OUT/'review.html').write_text(page)
