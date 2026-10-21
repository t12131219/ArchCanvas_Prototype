"""Show the actual selected and rejected SVGs without redrawing them."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/compact-main/current'
read = lambda p: json.loads(p.read_text())
reports = [read(OUT / (s + '-render-report.json')) for s in ['small', 'large']]
rows = reports[0]['rows'] + reports[1]['rows']
comparisons = {c['name']: c for report in reports for c in report['comparisons']}
css = 'body{font:16px Arial,sans-serif;margin:24px;color:#293746;background:#f6f8fb}h1{font-size:22px}h2{font-size:17px}p{line-height:1.65;max-width:1100px}.grid{display:flex;gap:20px;align-items:flex-start}.panel{background:white;border:1px solid #ccd5e1;padding:14px;flex:1;min-width:0}.panel svg{width:100%;height:auto}section{margin:24px 0}'


def panel(name, file):
    return '<section class="panel" data-panel="' + html.escape(name) + '"><h2>' + html.escape(name) + '</h2>' + (OUT / file).read_text() + '</section>'


def page(file, title, body):
    (OUT / file).write_text('<!doctype html><meta charset="utf-8"><title>' + title + '</title><style>' + css + '</style><h1>' + title + '</h1>' + body)


c = comparisons['PrismPath']
page('review-prism.html', '自动语义折叠与可继续展开的详图', '<p>左：原始角色状态；中：系统选择的语义主图；右：补回隐藏关系并增加具体运算的真实详图。主图更紧凑，图组总面积增加；不把摘要计为原子计算覆盖。</p><div class="grid">' + panel('原始主图', c['baseline'] + '.svg') + panel('选中的语义主图', c['current']['panels'][0]['capture'] + '.svg') + panel('对应实例的补足详图', c['current']['panels'][1]['capture'] + '.svg') + '</div>')
c = comparisons['InterleavedPaths']
page('review-mixed.html', '混合模型：条件、未知调用和跨步状态', '<p>同一套局部规则可折叠已认证路径，未知调用、条件选择及 GRU 状态接口仍保留。两张局部详图分别兑现具体实例的计算。</p><div class="grid">' + panel('原始主图', c['baseline'] + '.svg') + panel('规划后的主图', c['current']['panels'][0]['capture'] + '.svg') + '</div>')
c = comparisons['Transformer']
ref = ROOT / 'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
(OUT / 'dedicated-reference.svg').write_bytes(ref.read_bytes())
page('review-transformer.html', 'Transformer：保留落选候选与专用参考', '<p>左：最终保留的通用主图；中：被拒绝的单区域折叠候选，其实际连线成本更差；右：专用参考。该轮没有改善 Transformer 主图，仍有明显视觉差距。局部单区域搜索不能代表多个区域协同折叠的结果。</p><div class="grid">' + panel('选中的通用主图', c['current']['panels'][0]['capture'] + '.svg') + panel('落选的单区域折叠', 'Transformer-current-trial-1.svg') + panel('专用参考', 'dedicated-reference.svg') + '</div>')
page('review.html', '紧凑主图与真实补足详图：审核入口', '<p>从未折叠前冻结目标，成组审核摘要与对应实例详图。依据通用角色、独占路径、精确绑定和实际布局；不使用模型名称或专用参考坐标。完整目标未完成。</p><ul><li><a href="review-prism.html">陌生模型：自动选择摘要与补足详图</a></li><li><a href="review-mixed.html">条件、未知与状态混合</a></li><li><a href="review-transformer.html">Transformer 落选结果及参考差距</a></li></ul>')
ui = read(OUT / 'ui-report.json')['rows']
page('text-qa.html', '全部实际候选与编辑器导出：原生文字核验', ''.join(panel(r['name'], r['svg']) for r in rows + ui))
(OUT / 'browser-text-probe.js').write_bytes((ROOT / 'verification/role-path-stages/current/browser-text-probe.js').read_bytes())
print(json.dumps(dict(panels=len(rows), ui_panels=len(ui))))
