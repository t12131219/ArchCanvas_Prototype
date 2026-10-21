"""Publish actual selected/candidate SVGs; never redraw or normalize evidence."""
import html
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cohort-folds/current'
read = lambda p: json.loads(p.read_text())
reports = [read(OUT / (s + '-render-report.json')) for s in ['small', 'large']]
comparisons = {c['name']: c for report in reports for c in report['comparisons']}
rows = [r for report in reports for r in report['rows']]
css = 'body{font:16px Arial,sans-serif;margin:24px;color:#293746;background:#f6f8fb}h1{font-size:22px}h2{font-size:17px}p{line-height:1.65;max-width:1100px}.grid{display:flex;gap:20px;align-items:flex-start}.panel{background:white;border:1px solid #ccd5e1;padding:14px;flex:1;min-width:0}.panel svg{width:100%;height:auto}section{margin:24px 0}'
def panel(name, file):
    return '<section class="panel" data-panel="' + html.escape(name) + '"><h2>' + html.escape(name) + '</h2>' + (OUT / file).read_text() + '</section>'
def page(file, title, body):
    (OUT / file).write_text('<!doctype html><meta charset="utf-8"><title>' + title + '</title><style>' + css + '</style><h1>' + title + '</h1>' + body)
for name, file, title, description in [
    ('ParallelPaths', 'review-parallel.html', '两条路径一起折叠与对应实例详图', '两路都折叠，才缩短共同占用的画面；每个实例的真实计算仍可在同一原始作用域详图中追溯。'),
    ('SplitEnvelopes', 'review-split.html', '四个认证区域与两个原始作用域', '四个区域一起选择；在两个不同的原始源码容器中分别打开真实计算。没有用一个相似实例替代另一个。'),
    ('GuardedEnvelope', 'review-mixed.html', '条件、未知调用与递推状态仍保持边界', '已认证路径可以一起折叠；条件选择、未知调用和 GRU 状态接口继续保留。')]:
    c = comparisons[name]
    body = '<p>' + description + '</p><div class="grid">' + panel('上一轮选中的主图', c['previous']['panels'][0]['capture'] + '.svg') + panel('当前选中的主图', c['current']['panels'][0]['capture'] + '.svg') + '</div><div class="grid">'
    body += ''.join(panel('原始作用域详图 ' + str(i), p['capture'] + '.svg') for i, p in enumerate(c['current']['panels'][1:], 1)) + '</div>'
    page(file, title, body)
c = comparisons['Transformer']
(OUT / 'dedicated-reference.svg').write_bytes((ROOT / 'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg').read_bytes())
t = next(t for t in c['current']['attempts'] if t['form'] == 'summary-set')
accepted = t['accepted']
description = ('当前采用多区域协同折叠；原始直接目标由对应实例详图补回。' if accepted else '多区域协同候选仍被真实成本或证据检查拒绝，完整保留落选图；没有降低验收门槛。')
page('review-transformer.html', 'Transformer：上一轮、当前与专用参考', '<p>' + description + ' 通用规则不读取专用参考的坐标、名称或案例 ID。仍需核对模块组织、来源外框、长连接和留白差距。</p><div class="grid">' + panel('上一轮主图', c['previous']['panels'][0]['capture'] + '.svg') + panel('当前主图', c['current']['panels'][0]['capture'] + '.svg') + panel('专用参考', 'dedicated-reference.svg') + '</div><div class="grid">' + ''.join(panel('对应实例详图 ' + str(i), p['capture'] + '.svg') for i, p in enumerate(c['current']['panels'][1:], 1)) + '</div>')
page('review.html', '多区域语义折叠与精确实例恢复：审核入口', '<p>依据原始作用域、认证角色和实际布局，协同选择多个区域；细节仍可展开。完整目标尚未完成。</p><ul><li><a href="review-parallel.html">两路协同折叠</a></li><li><a href="review-split.html">四区域与两作用域</a></li><li><a href="review-mixed.html">条件、未知与状态</a></li><li><a href="review-transformer.html">Transformer 与专用参考</a></li></ul>')
ui = read(OUT / 'ui-report.json')['rows']
page('text-qa.html', '全部实际候选和编辑器导出：浏览器原生文字审核', ''.join(panel(r['name'], r['svg']) for r in rows + ui))
(OUT / 'browser-text-probe.js').write_bytes((ROOT / 'verification/role-path-stages/current/browser-text-probe.js').read_bytes())
print(json.dumps(dict(formal_panels=len(rows), ui_panels=len(ui), transformer_summary_accepted=accepted)))
