"""Show actual completed adaptive SVGs and a separate dedicated reference."""
from pathlib import Path
import hashlib
import html
import json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-comparison/current'
report = json.loads((OUT / 'render-report.json').read_text())
rows = {r['name']: r for r in report['rows']}
ui = json.loads((OUT / 'ui-report.json').read_text()) if (OUT / 'ui-report.json').exists() else None
if ui:
    rows.update({r['name']: r for r in ui['rows']})
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>完整自适应主图与专用参考审核</title><meta name="inline-render-report-sha256" content="' + sha(OUT / 'render-report.json') + '"><style>body{font:16px Arial,sans-serif;color:#293746;margin:24px}p{line-height:1.6}.panels{display:grid;grid-template-columns:repeat(3,minmax(280px,1fr));gap:16px}article{border:1px solid #bdc9d5;padding:12px;overflow:auto}article svg{width:100%;height:auto;display:block}.native article{margin:20px 0}.native article svg{width:auto;max-width:none}.top{height:480px;overflow:hidden}h1{font-size:24px}h2{font-size:20px}h3{font-size:17px}a{color:#2168a0}</style>'
def panel(name, top=False):
    row = rows[name]; q = row['quality']
    return '<article data-case="' + html.escape(name) + '"><h3>' + html.escape(name) + '</h3><p>' + str(row['nodes']) + ' 图元 · ' + str(row['edges']) + ' 边 · ' + str(q['native_width_px']) + '×' + str(q['native_height_px']) + ' px · ' + str(q['line_geometry']['crossings']) + ' 交叉</p><div' + (' class="top"' if top else '') + '>' + (OUT / row['svg']).read_text() + '</div></article>'
ref = ROOT / report['reference']['file']
reference = '<article><h3>专用展开参考 · 仅供评价</h3>' + ref.read_text() + '</article>'
timing = json.loads((OUT / 'transformer-timing.json').read_text())
elapsed = timing['rows'][1]['elapsed_ms'] / 1000
lead = f'<h1>完整默认自适应比较已经完成</h1><p>使用同一源码事实和相同的结构优先自动策略。当前主图 80 图元、91 边；三次额外展开候选均被拒绝，没有采用新的局部路径。当前完整规划测得 {elapsed:.3f} 秒；之前的耗时未记录，不能计算加速倍数。</p><p>顶部粒度和起点更一致，整体尺寸稍小；交叉从 47 增至 48。与专用参考相比，主图仍偏宽、连线绕行较多，配置接口占用空间，整体缩放后的文字仍小。目标尚未完成。专用参考未参与通用规则。</p>'
page = head + lead + '<h2>顶部组织</h2><div class="panels">' + panel('transformer-before', True) + panel('transformer-current', True) + reference + '</div><h2>完整主图</h2><div class="panels">' + panel('transformer-before') + panel('transformer-current') + reference + '</div><h2>通用组合案例：同时核对自动状态</h2>'
for name in ['BoundedWeave', 'MixedBoundary', 'ConditionalWeave', 'SeparateStages', 'SameSource', 'UnknownFusion']:
    page += '<div class="panels">' + panel(name + '-before') + panel(name + '-current') + '</div>'
if ui:
    page += '<h2>真实编辑器往返</h2><p>导入自动状态 19 → 保存重开 19 → 收起路径 13 → 最细源码 144 → 恢复语义状态 19。当前规则只选择一条局部路径；旧阶段的两条路径记录保留为历史。</p><div class="panels">' + panel('ui-planned') + panel('ui-refolded') + '</div>'
page += '<p><a href="text-qa.html">全部 SVG 原生文字审核</a> · <a href="render-report.json">实际测量记录</a> · <a href="transformer-current.svg">当前主图 SVG</a></p></html>'
(OUT / 'review.html').write_text(page)
(OUT / 'text-qa.html').write_text(head + '<body class="native"><h1>原生 SVG 文字边界</h1>' + ''.join(panel(n) for n in rows) + '</body></html>')
print(json.dumps({'panels': len(rows), 'render_report_sha256': sha(OUT / 'render-report.json')}))
