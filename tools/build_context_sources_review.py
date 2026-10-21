"""Build an actual-SVG routing comparison with explicit limits."""
import html,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/context-sources/current'
r=json.loads((OUT/'render-report.json').read_text());rows={x['name']:x for x in r['rows']}
def panel(name,crop=False):
 row=rows[name];s=(OUT/row['svg']).read_text();q=row['quality']
 if crop:
  import re
  s=re.sub(r'viewBox="[^"]+"','viewBox="430 2350 1090 1090"',s,count=1)
 return f'<article><h3>{html.escape(name)}</h3><p>{row["nodes"]} 图元 · {row["edges"]} 边 · {q["line_geometry"]["crossings"]} 交叉 · 线长 {q["wire_length"]}</p>{s}</article>'
s='''<!doctype html><meta charset="utf-8"><title>跨区依赖源端口审核</title><style>body{font:16px Arial;margin:24px;color:#293746}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{border:1px solid #ccd2da;padding:16px;min-width:0}svg{width:100%;height:auto}h2{margin-top:36px}p{line-height:1.6}</style><h1>跨区依赖：让源端口朝向接收区域</h1><p>仅在同一语义状态、同一节点位置上比较一次连线候选。原始调用、操作数、未知边界与条件保留；有退化时维持原图。</p><p>Transformer 仅缩短 59 个 SVG 单位，48 处交叉和主图尺寸保持不变。尚未完成专用参考收敛或数千节点浏览器验收。</p>'''
for name in ['ForeignLong','UnknownSource','SameHeight','GuardedSource','Transformer']:
 s+='<h2>'+name+'</h2><section>'+panel(name+'-before')+panel(name+'-current')+'</section>'
s+='<h2>Transformer：同一区域连线截面</h2><section>'+panel('Transformer-before',True)+panel('Transformer-current',True)+'</section>'
s+='<h2>专用展开参考，仅作评价</h2><img style="max-width:900px;width:100%" src="../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg"><p>通用图的当前状态下面仍保留更细事实。当前阶段只验证源端口方向，未宣称整体视觉等价。</p>'
(OUT/'review.html').write_text(s)
# Native browser text measurement uses all actual SVGs at their native size.
s='<!doctype html><meta name="inline-render-report-sha256" content="'+hashlib.sha256((OUT/'render-report.json').read_bytes()).hexdigest()+'"><meta charset="utf-8"><title>跨区依赖原生文字审核</title><style>body{margin:0}section{margin:8px}svg{display:block}</style>'
for row in r['rows']:s+='<section data-panel="'+row['name']+'"><h2>'+row['name']+'</h2>'+(OUT/row['svg']).read_text()+'</section>'
for f in ['ui-planned.svg','ui-folded.svg','ui-raw.svg']:
 if (OUT/f).exists():s+='<section data-panel="'+f+'"><h2>'+f+'</h2>'+(OUT/f).read_text()+'</section>'
(OUT/'text-qa.html').write_text(s)
