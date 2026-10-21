"""Present the actual selected and rejected SVGs, with a separate native text page."""
import hashlib
import html
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/region-followers/current'
report=json.loads((OUT/'render-report.json').read_text())
rows={r['name']:r for r in report['rows']}

def panel(name,crop=None):
    row=rows[name]
    svg=(OUT/row['svg']).read_text()
    if crop:
        width,height=crop.split()[2:]
        svg=re.sub(r'width="[^"]+" height="[^"]+" viewBox="[^"]+"',f'width="{width}px" height="{height}px" viewBox="{crop}"',svg,count=1)
    q=row['quality']
    return f'<article><h3>{html.escape(name)}</h3><p>{row["nodes"]} 图元 · {row["edges"]} 边 · {q["line_geometry"]["crossings"]} 交叉 · 线长 {q["wire_length"]}</p>{svg}</article>'

page='''<!doctype html><meta charset="utf-8"><title>展开区域出口与后续节点对齐审核</title>
<style>body{font:16px Arial;margin:24px;color:#293746}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{border:1px solid #ccd2da;padding:16px;min-width:0}svg{width:100%;height:auto}h2{margin-top:36px}p{line-height:1.6}</style>
<h1>让后续节点跟随展开区域的真实出口</h1>
<p>通用规则只调整已有下游节点的水平位置，再测量实际连线。模块归属、语义折叠状态、纵向层级、操作数和原始证据保持一致；候选退化时保留原图。</p>
<p>Transformer：80 图元 / 91 边，2166 × 3656 尺寸不变；交叉 48 → 47，连线总长 50203.5 → 49186.5（缩短约 2.0%）。这是固定角色状态的局部改善，整体目标尚未完成。</p>
<h2>Transformer 底部：输出跟随右侧区域出口</h2>'''
page+='<section>'+panel('Transformer-before','0 3220 2166 436')+panel('Transformer-current','0 3220 2166 436')+'</section>'
for name in ['ExitChain','UnknownFollower','TwoSources','GuardedInputs']:
    page+='<h2>'+name+'</h2><section>'+panel(name+'-before')+panel(name+'-current')+'</section>'
page+='''<h2>拒绝的实际候选：GuardedInputs</h2><p>交叉仍为 4，线长从 6244 增至 6282，因此生产输出保留原图。下面右图仅供审核候选。</p><section>'''
page+=panel('GuardedInputs-current')+'<article><h3>Rejected candidate</h3>'+(OUT/'GuardedInputs-rejected.svg').read_text()+'</article></section>'
page+='<h2>Transformer 完整固定状态</h2><section>'+panel('Transformer-before')+panel('Transformer-current')+'</section>'
page+='''<h2>专用展开参考，仅用于评价</h2><img style="max-width:900px;width:100%" src="../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg">
<p>规则未读取模型名称、案例 ID 或参考坐标。当前通用状态下保留进一步展开能力；本阶段没有重新验证完整自适应选择，也没有验证数千节点整图的 SVG 路由和浏览器性能。</p>
<h2>真实编辑器操作</h2><p>导入 → 保存 → 重开 → 折叠 → 源码全部展开 → 恢复：15 / 15 / 10 / 15 / 15 个节点。保存重开与恢复的 SVG 字节一致。</p><img style="max-width:1200px;width:100%" src="ui-returned.png">'''
(OUT/'review.html').write_text(page)
native='<!doctype html><meta name="inline-render-report-sha256" content="'+hashlib.sha256((OUT/'render-report.json').read_bytes()).hexdigest()+'"><meta charset="utf-8"><title>出口对齐原生文字审核</title><style>body{margin:0}section{margin:8px}svg{display:block}</style>'
for row in report['rows']:
    native+='<section data-panel="'+row['name']+'"><h2>'+row['name']+'</h2>'+(OUT/row['svg']).read_text()+'</section>'
for f in ['GuardedInputs-rejected.svg','ui-planned.svg','ui-folded.svg','ui-raw.svg']:
    native+='<section data-panel="'+f+'"><h2>'+f+'</h2>'+(OUT/f).read_text()+'</section>'
(OUT/'text-qa.html').write_text(native)
