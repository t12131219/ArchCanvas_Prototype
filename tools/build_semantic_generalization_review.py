"""Review real SVGs at their saved frontiers; never redraw a baseline."""
import html
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'verification/semantic-generalization/current'
suite = json.loads((OUT / 'suite-report.json').read_text())
style = '''<style>body{margin:18px;background:#eef2f7;color:#17263a;font:14px/1.5 system-ui}h1{font-size:22px;margin:0}h2{font-size:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{background:#fff;border:1px solid #c6d0dc;padding:12px}h3{margin:0 0 6px}object{width:100%;height:560px;display:block}a{color:#145d9a}table{border-collapse:collapse;background:white}td,th{border:1px solid #c6d0dc;padding:5px 10px;text-align:left}</style>'''


def card(label, path):
    return '<article><h3>'+html.escape(label)+'</h3><object type="image/svg+xml" data="'+html.escape(path)+'"></object><a href="'+html.escape(path)+'">原始 SVG</a></article>'


head = '<!doctype html><meta charset="utf-8"><title>通用语义跨模型审核</title>'+style
page = head+'<h1>通用语义跨模型审核</h1><p>按语义证据和实际几何选择版式。新增 12 份普通源码输入；原有 56 个展示状态逐字节复核。该有限套件不代表所有模型都已得到理想布局。</p>'
page += '<p><a href="state.html">重复结构与状态端口：真实修复</a> · <a href="repeats.html">卷积、全连接及双路重复</a> · <a href="independent-report.json">独立审核</a></p>'
for label, ref, panel in [('概览','reference-collapsed.svg','Transformer-F0'),('语义详图','reference-expanded.svg','Transformer-F1')]:
    page += '<h2>保留双状态目标 · '+label+'</h2><div class="pair">'+card('专用参照','../../generic-convergence/current/'+ref)+card('本轮复核的通用状态','../../architecture-trunks/current/'+panel+'.svg')+'</div>'
for r in suite['rows']:
    page += '<h2>'+html.escape(r['name'])+'</h2><p>'+('版式发生变化，语义切面和绑定保持一致。' if r['changed'] else '真实 SVG 与冻结实现一致。')+'</p><div class="pair">'+card('修改前',r['before_svg'])+card('当前',r['svg'])+'</div>'
(OUT / 'review.html').write_text(page)
state = head+'<h1>通用质量回退 · 重复处理与状态单元</h1><p>同一节点、调用、操作数与归属分区。左侧 input 标签需要图下注释；右侧标签可直接放在线旁，源码调用标题继续保留。采用依赖布局，因此图幅和流程方向可能改变。</p><div class="pair">'+card('修改前 · 架构概览','StateStack-F0.before.svg')+card('当前 · 相同切面的质量回退','StateStack-F0.svg')+'</div><p><a href="review.html">全部跨模型与双状态审核</a></p>'
(OUT / 'state.html').write_text(state)
repeats = head+'<h1>不同语义下的相同重复结构</h1><p>两档均依据证书选择；没有可证明的展开层时允许两档相同。后续调用可继续展开，单次调用和真实结果不会由代表调用替代。</p>'
for name in ['ConvStack','IndependentStack','TwinStacks','SharedStack','MixedStack','InterruptedStack','MutatedStack']:
    repeats += '<h2>'+name+'</h2><div class="pair">'+card('概览',name+'-F0.svg')+card('语义详图',name+'-F1.svg')+'</div>'
(OUT / 'repeats.html').write_text(repeats)
native = '<!doctype html><meta charset="utf-8"><title>Native cross-family SVG text audit</title><style>body{margin:0}section{margin:20px}</style>'
for r in suite['rows']:
    native += '<section data-panel="'+r['name']+'"><h2>'+r['name']+'</h2>'+(OUT / r['svg']).read_text()+'</section>'
(OUT / 'native-audit.html').write_text(native)
print(OUT / 'review.html')
