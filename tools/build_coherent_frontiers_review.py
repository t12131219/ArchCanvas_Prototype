"""Review the actual saved SVGs beside the dedicated expression reference."""
from pathlib import Path
import hashlib
import html
import json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'verification/coherent-frontiers/current'
report = json.loads((OUT/'render-report.json').read_text())
rows = {r['name']:r for r in report['rows']}
sha = lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
esc = html.escape
style = '''body{font:16px Arial,"Noto Sans SC",sans-serif;color:#293746;margin:24px}h1{font-size:25px}p{line-height:1.6}table{border-collapse:collapse}td,th{border:1px solid #c8d2dc;padding:8px;text-align:left}.panels{display:grid;grid-template-columns:repeat(3,minmax(300px,1fr));gap:16px}article{border:1px solid #c8d2dc;padding:12px;overflow:auto}article svg{display:block;width:100%;height:auto;margin:auto}article h3{font-size:17px}a{color:#2168a0}.top{max-height:470px;overflow:hidden}.native article{margin:16px 0}.native article svg{width:auto;max-width:none;margin:0}'''
def card(name,title=None,top=False):
    row=rows[name]
    return '<article data-case="'+esc(name)+'"><h3>'+esc(title or name)+'</h3><p>'+str(row['nodes'])+' 图元 · '+str(row['edges'])+' 边 · '+str(row['quality']['native_width_px'])+'×'+str(row['quality']['native_height_px'])+' px · '+str(row['quality']['line_geometry']['crossings'])+' 交叉</p><div'+(' class="top"' if top else '')+'>'+(OUT/row['svg']).read_text()+'</div></article>'
reference='snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
overview='snapshots/transformer_programmatic_guide/generated/figure1_overview.svg'
references={f:sha(ROOT/f) for f in [reference,overview]}
header='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通用主图的局部粒度一致性审核</title><meta name="inline-render-report-sha256" content="'+sha(OUT/'render-report.json')+'"><style>'+style+'</style>'
lead='<h1>通用主图：局部粒度一致性</h1><p>相近的局部展示结构在同一预算范围内共同决定默认展开；每个调用及操作数仍独立。手工展开和显式关系请求优先，未知、条件、状态及共享身份保持边界。</p><p>这一步改善主图层次，尚未完成与专用 Transformer 的全面语义及视觉收敛。固定策略主图交叉线由 47 增至 48；源码投影完整性不能代替数千节点 SVG 性能验证。</p>'
local='<h2>陌生结构：原先一处展开、另一处折叠；现在同级表达，仍可单独展开</h2><div class="panels">'+''.join(card(n,t)for n,t in [('Coherent-tight-before','原策略：遍历顺序影响细节'),('Coherent-tight-current','当前：相近结构同级表达'),('Coherent-one-open','实际可继续展开一处')])+'</div>'
top='<h2>Transformer 顶部组织与专用展开参考</h2><p>前两栏显示实际 SVG 顶部截面，便于观察重复区域起点。第三栏保留完整专用参考；它只用于审核，没有参与通用生产规则。</p><div class="panels">'+card('Transformer-fixed-before','通用 · 之前（顶部）',True)+card('Transformer-fixed-current','通用 · 当前（顶部）',True)+'<article><h3>专用 01093cc06a87b35a · 展开参考</h3>'+(ROOT/reference).read_text()+'</article></div>'
full='<h2>完整通用主图与概览</h2><div class="panels">'+card('Transformer-fixed-before','之前 · 完整主图')+card('Transformer-fixed-current','当前 · 完整主图')+card('Transformer-overview-current','概览 · SVG 与原策略相同')+'</div>'
table='<h2>同输入、同预算比较</h2><table><tr><th>输入</th><th>图元数之前 → 当前</th><th>主图相同</th></tr>'+''.join('<tr><td>'+esc(c['name'])+'</td><td>'+str(rows[c['before']]['nodes'])+' → '+str(rows[c['current']]['nodes'])+'</td><td>'+('是' if c['svg_equal'] else '否')+'</td></tr>'for c in report['comparisons'])+'</table><p>直接细节目标随折叠可能暂缓，不能计为主图已经表达。展开、保存、重开和收回均单独审核。</p>'
(OUT/'review.html').write_text(header+lead+local+top+table+full+'<p><a href="text-qa.html">全部 SVG 原生比例文字审核</a> · <a href="render-report.json">渲染记录</a></p></html>')
(OUT/'text-qa.html').write_text(header+'<body class="native"><h1>全部实际 SVG 原生文字审核</h1>'+''.join(card(n)for n in rows)+'</body></html>')
(OUT/'reference-report.json').write_text(json.dumps({'render_report_sha256':sha(OUT/'render-report.json'),'reference_only':True,'references_sha256':references},indent=2)+'\n')
print(json.dumps({'panels':len(rows),'references':len(references)}))
