"""Present actual automatic runs and independently replayed local candidates."""
import hashlib
import html
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/measured-frontiers/current'
report=json.loads((OUT/'render-report.json').read_text())
rows={r['name']:r for r in report['rows']}
esc=html.escape

def panel(name):
    row=rows[name];actual=row['actual_metrics'];selected=row['adaptive']['selected'] if row['adaptive'] else None
    receipt=f'选择记录交叉 {selected["crossings"]}' if selected else '手工候选重放'
    return f'<article><h3>{esc(name)}</h3><p>{row["nodes"]} 图元 / {row["edges"]} 边 · 实际交叉 {actual["crossings"]} · {receipt} · {actual["width"]} × {actual["height"]}</p>'+(OUT/row['svg']).read_text()+'</article>'

page='''<!doctype html><meta charset="utf-8"><title>按最终布局选择语义粒度</title>
<style>body{font:16px Arial;margin:24px;color:#293746}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{border:1px solid #ccd2da;padding:16px;min-width:0}svg{width:100%;height:auto}h2{margin-top:36px}p{line-height:1.6}td,th{padding:8px;border:1px solid #ccd2da}table{border-collapse:collapse}</style>
<h1>按实际最终布局选择语义粒度</h1>
<p>自适应选择现在将上下文来源路由和区域出口对齐纳入每次基线、候选的测量，再比较已表达关系和画面成本。原始 IR、操作数和保存的展示请求仍逐项审核。</p>
<p>本轮修复的是选择依据和实际输出的一致性。它不等于全局摘要/细节联合规划，也不表示已经达到专用参考图。</p>
<table><tr><th>案例</th><th>旧记录 / 旧实际交叉</th><th>新记录 / 新实际交叉</th><th>最终 SVG 是否相同</th></tr>'''
for pair in report['comparisons']:
    a,b=[rows[pair[k]] for k in ['before','current']]
    def counts(r):
        return f'{r["adaptive"]["selected"]["crossings"] if r["adaptive"] else "—"} / {r["actual_metrics"]["crossings"]}'
    same=a['svg_sha256']==b['svg_sha256']
    page+=f'<tr><td>{esc(pair["name"])}</td><td>{counts(a)}</td><td>{counts(b)}</td><td>{"相同" if same else "不同"}</td></tr>'
page+='</table><h2>能直接复现的选择记录差异</h2><section>'+panel('CrossedBranches-before')+panel('CrossedBranches-current')+'</section>'
page+='<h2>陌生组合：真实候选比较</h2><section>'+panel('MixedWeave-before')+panel('MixedWeave-current')+'</section>'
for replay in report['replays']:
    page+=f'<h3>候选 {replay["attempt"]}：符合接受条件 {replay["eligible"]}，本轮选中 {replay["selected"]}</h3><section>'+panel(replay['name'])+'</section>'
page+='<p>上面的三个小候选均独立生成实际 SVG 并核对选择记录。完整 Transformer 未选中候选的指标仅为生产过程记录，没有另行导出所有候选 SVG。</p>'
page+='<h2>完整 Transformer 自动选择</h2><section>'+panel('Transformer-before')+panel('Transformer-current')+'</section>'
a,b=rows['Transformer-before'],rows['Transformer-current']
page+=f'<p>冻结旧实现完整运行耗时 {a["elapsed_ms"]/1000:.1f} 秒；当前完整运行耗时 {b["elapsed_ms"]/1000:.1f} 秒。两次运行受机器负载影响，此记录不作为性能提升结论。</p>'
page+='''<h2>专用详细参考，仅用于评价</h2><img style="max-width:900px;width:100%" src="../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg">
<p>参考图用于比较模块逻辑与视觉组织，未向生产规则输入模型名称、案例 ID 或参考坐标。通用中间状态仍保留进一步展开的事实；当前整体组织与参考仍有明显差距。</p>
<h2>真实编辑器操作</h2><p>导入、保存重开、折叠、源码全部展开、恢复：15 / 15 / 10 / 15 / 15 图元。另在 MixedWeave 中实际运行自适应选择，导出 25 图元 / 25 边，与 CLI 字节一致。</p>
<img style="max-width:1200px;width:100%" src="ui-adaptive.png">
<p>最细源码投影保留 3371 节点、3663 边；这项检查没有证明数千节点完整 SVG 路由或浏览器性能。更广泛未见组合、图组与粒度联合规划仍待完成。</p>'''
(OUT/'review.html').write_text(page)
native='<!doctype html><meta charset="utf-8"><meta name="inline-render-report-sha256" content="'+hashlib.sha256((OUT/'render-report.json').read_bytes()).hexdigest()+'"><title>最终布局选择原生文字审核</title><style>body{margin:0}section{margin:8px}svg{display:block}</style>'
for row in report['rows']:
    native+='<section data-panel="'+row['name']+'"><h2>'+row['name']+'</h2>'+(OUT/row['svg']).read_text()+'</section>'
for f in ['ui-planned.svg','ui-folded.svg','ui-raw.svg','ui-adaptive.svg']:
    native+='<section data-panel="'+f+'"><h2>'+f+'</h2>'+(OUT/f).read_text()+'</section>'
(OUT/'text-qa.html').write_text(native)
