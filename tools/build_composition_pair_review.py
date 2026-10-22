"""Present both existing reference/candidate SVG pairs without changing them."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/composition-rounds/current'
report = json.loads((OUT / 'suite-report.json').read_text())
rows = {r['name']: r for r in report['rows']}


def card(title, path, note):
    return f'<article><h3>{title}</h3><p>{note}</p><object type="image/svg+xml" data="{path}"></object><a href="{path}" target="_blank">原始 SVG · 原生尺寸</a></article>'


html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>通用架构编排：概览与详图双状态对照</title>
<style>body{margin:0;background:#eef2f7;color:#17263a;font:16px/1.6 system-ui}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:26px}h2{margin:32px 0 12px}nav{display:flex;gap:22px}a{color:#145d9a}p{margin:8px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}article{background:white;padding:16px;border:1px solid #c6d0dc;border-radius:10px}h3{margin:0}object{display:block;width:100%;height:650px;background:white}.detail object{height:1000px}.notice{padding:12px 18px;background:#fff5d9;border-left:4px solid #b88a00}table{border-collapse:collapse;background:white;width:100%}td,th{border:1px solid #ccd5df;padding:8px;text-align:left}.generic{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.generic object{height:400px}@media(max-width:800px){.pair,.generic{grid-template-columns:1fr}} </style><main>
<h1>两个状态分别对齐：通用架构编排第五轮审核</h1>
<nav><a href="#overview">折叠态对照</a><a href="#detail">语义详图对照</a><a href="#finer">继续展开</a><a href="#generic">通用案例</a></nav>
<p>专用图作为审核参照。生产布局按依赖、源码角色和认证边界组织；没有模型名、案例 ID 或参照坐标选择器。</p>
<p class="notice">尚未达到双状态对齐完成：详图的条件作用域内部、残差旁路、上下文总线及包裹层仍有差距。不能以概览改善代替详图验收。</p>
<h2 id="overview">折叠态：专用 overview ↔ 通用架构概览</h2><div class="pair">'''
html += card('专用图 · 折叠', '../../generic-convergence/current/reference-collapsed.svg', '1600 × 1218；语义层次和版式参照。')
html += card('通用图 · F0', 'Transformer-F0.svg', '1250 × 1574；28 图元 / 37 连接；8 交叉。双路输入按消费范围归位，主流程向上。')
html += '</div><h2 id="detail">详图态：专用 detailed ↔ 通用语义详图</h2><div class="pair detail">'
html += card('专用图 · 详图', '../../generic-convergence/current/reference-expanded.svg', '1600 × 2742；这只是参照详图，并非通用层的最底层。')
html += card('通用图 · F1', 'Transformer-F1.svg', '2506 × 3850；80 图元 / 80 连接；12 交叉。五处 Add & Norm 展开，投影路径和 FFN 可见。SDPA 条件作用域默认保留折叠。')
html += '</div><h2 id="finer">详图以下仍可继续展开</h2><div class="pair">'
html += card('进一步打开一条投影路径', 'Transformer-finer.svg', '82 图元 / 81 连接；2622 × 3850。实际界面已双击验证，并保存重开。')
html += card('返回原始概览', 'Transformer-returned.svg', '实际界面返回 SVG 与最初 F0 字节一致。底层 IR 的 3371 节点、3663 边保留；巨型全展开 SVG 性能未验收。')
html += '</div><h2>五轮概览指标</h2><table><tr><th>阶段</th><th>尺寸</th><th>线长</th><th>交叉</th></tr>'
html += '<tr><td>五轮前冻结基线</td><td>848 × 1676</td><td>15059.3</td><td>9</td></tr>'
for i in range(1, 5):
    r = json.loads((OUT / f'round{i}-report.json').read_text())
    # Single-round reports are retained as captured, not reconstructed.
    q = r.get('quality', {})
    if not q:
        q = r['rows'][0]['quality']
    html += f'<tr><td>第 {i} 轮</td><td>{q["native_width_px"]} × {q["native_height_px"]}</td><td>{q["wire_length"]}</td><td>{q["line_geometry"]["crossings"]}</td></tr>'
q = rows['Transformer-F0']['quality']
html += f'<tr><td>第 5 轮 F0</td><td>{q["native_width_px"]} × {q["native_height_px"]}</td><td>{q["wire_length"]}</td><td>{q["line_geometry"]["crossings"]}</td></tr></table>'
html += f'<p>同一 F0 的线长相较五轮前减少约 43.3%。F1 展示集合已变化，不能把它当作同一详图切面的几何净收益。</p><h2 id="generic">通用案例双状态审核</h2><p>正式套件共 {len(rows)} 张 SVG。StateWorkshop 的两档候选出现标签问题，已通过通用质量准入回退为同一展示层级的依赖布局。回退证据保留在文档中。部分程序的两档展示相同，不会为制造差异而强行划分模块。</p><div class="generic">'
for name in ['ReadWorkshop', 'ConditionalRead', 'MutableRead', 'UnknownChain', 'NestedChain', 'StateWorkshop',
             'TinyCNN', 'BranchMLP', 'ReusedRecurrent', 'UnknownCall']:
    for state in ['F0', 'F1']:
        r = rows[name + '-' + state]
        html += card(name + ' · ' + state, r['svg'], f'{r["nodes"]} 图元 / {r["edges"]} 连接；问题：{", ".join(r["quality"]["issues"]) or "无报告问题"}')
html += '</div><p><a href="suite-report.json">正式捕获清单</a> · <a href="independent-report.json">独立 SVG 核验</a></p></main></html>'
(OUT / 'paired-review.html').write_text(html)
style = '<style>body{margin:12px;color:#17263a;background:#eef2f7;font:14px/1.5 system-ui}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{background:white;padding:10px;border:1px solid #c6d0dc}object{display:block;width:100%;height:540px}h1{font-size:22px;margin:0}h3{margin:0}p{margin:6px 0}a{color:#145d9a}</style>'
for name, title, reference, candidate, note in [
    ('overview', '折叠态对照', 'reference-collapsed.svg', 'Transformer-F0.svg',
     '两路输入、向上主流程和消费范围编排；模块包裹、比例和上下文线路仍需收敛。'),
    ('detail', '语义详图对照', 'reference-expanded.svg', 'Transformer-F1.svg',
     '详图下面仍可展开；条件作用域内部、残差旁路及区域对齐仍有明显差距。')]:
    page = '<!doctype html><meta charset="utf-8"><title>' + title + '</title>' + style
    page += '<h1>' + title + ' · 两档分别验收</h1><p>' + note + '</p><div class="pair">'
    page += card('专用参照', '../../generic-convergence/current/' + reference, '保持原始 SVG。')
    page += card('通用架构编排', candidate, '规则依据通用 IR；没有模型、案例 ID 或参照坐标选择器。')
    page += '</div><p><a href="paired-review.html">完整审核、继续展开与其他通用案例</a></p>'
    (OUT / ('paired-' + name + '.html')).write_text(page)
native = '<!doctype html><meta charset="utf-8"><title>Native SVG text audit</title><style>body{margin:0}section{margin:20px}</style>'
for r in report['rows']:
    native += '<section data-panel="' + r['name'] + '"><h2>' + r['name'] + '</h2>' + (OUT / r['svg']).read_text() + '</section>'
(OUT / 'native-audit.html').write_text(native)
generic = '<!doctype html><meta charset="utf-8"><title>其他模型的同一编排规则</title>' + style
generic += '<style>.pair{grid-template-columns:repeat(4,1fr)}object{height:480px}</style><h1>其他模型 · 相同通用规则</h1><p>两档均在完整审核页中保留；以下展示语义详图。不为制造层级差异而强行细分。</p><div class="pair">'
for name in ['TinyCNN', 'BranchMLP', 'ReusedRecurrent', 'UnknownCall']:
    generic += card(name, name + '-F1.svg', '保留原始源码依赖和边界。')
generic += '</div><a href="paired-review.html#generic">全部通用案例与双状态</a>'
(OUT / 'generic-review.html').write_text(generic)
print(OUT / 'paired-review.html')
