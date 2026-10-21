"""Render expression corrections separately from unselected geometry trials."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/exact-expression/current'
if __name__ == '__main__':
    reports = [json.loads((OUT / (size + '-report.json')).read_text()) for size in ['small', 'large', 'recovery']]
    audit = json.loads((OUT / 'independent-report.json').read_text())
    rows = {r['name']: r for report in reports for r in report['rows']}
    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>精确绑定与语义展开审核</title><style>body{font:16px system-ui;margin:24px;background:#f5f7fb;color:#293746}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{background:white;border:1px solid #bdc9d5;padding:14px;min-width:0;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}h2{margin-top:36px}.note{padding:16px;background:#fff3d4}</style>'

    def panel(name, title=None, native=False):
        row = rows[name]
        doc = json.loads((OUT / row['document']).read_text())
        q = row['quality']
        count = sum(r['status'] == 'fulfilled' for r in doc['expression_coverage'])
        return ('<section data-panel="' + name + '"><h3>' + html.escape(title or name) + '</h3><p>' +
                f"{row['nodes']} 节点 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · 原始已表达记录 {count} · 问题 {html.escape(str(q['issues']))}" +
                '</p><div class="' + ('native' if native else 'fit') + '">' + (OUT / row['svg']).read_text() + '</div></section>')

    intro = '<h1>语义展开：用精确连接判断是否已表达</h1><p>来源、结果槽、操作数、条件与证据必须吻合；只有节点或同 ID 连线出现，不能算作关系已画清楚。底层记录、局部选择与图组采用同一绑定契约。</p>'
    intro += '<p class="note">独立审核纠正 ' + str(len(audit['corrected_claims'])) + ' 处旧的已表达记录。八组前后对照的实际几何与精确直接覆盖均保留；本轮未增加 Transformer 的直接表达覆盖或改善其几何。</p>'
    page = head + intro
    for c in reports[0]['comparisons']:
        page += '<h2>' + html.escape(c['name']) + '</h2><div class="grid">' + panel(c['before'], '原记录') + panel(c['after'], '精确记录') + '</div>'
    page += '<h2>此前遗漏的局部详图入口</h2><p>三个单次操作详图恢复了原先只作为附注的形状或配置输入，精确表达各自操作。两个条件未知边界仍未直接表达完整绑定，继续保留未完成状态；不跨越条件拼接证据。</p><div class="grid">'
    for r in reports[2]['recoveries']:
        page += panel(r['capture'], r['name'] + ' · ' + str(len(r['expressed_goals'])) + ' 个目标直接表达')
    page += '</div>'
    (OUT / 'review.html').write_text(page + '</html>')
    j = reports[1]['joint']
    reference = ROOT / 'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
    (OUT / 'dedicated-reference.svg').write_bytes(reference.read_bytes())
    page = head + '<h1>Transformer：当前语义状态与继续展开的限制</h1><p>当前主图保留独立实例、重复结构、角色与更深的细节入口。专用参考用于比较表达质量，通用规则不读取该参考的坐标或案例名称。</p>'
    page += '<p class="note">当前图组 74 个直接目标保留，相对历史图组仍有 8 个目标未直接表达。两次进一步展开因接触、重叠与交叉代价被拒绝；不能把纠正旧记录称为视觉收敛。最细源码投影仍为 3371 节点、3663 边，整图路由和交互性能尚待验收。</p>'
    page += '<div class="grid">' + panel(j['panels'][0]['capture'], '当前通用主图') + '<section><h3>专用展开参考</h3><div class="fit"><img alt="专用 Transformer 展开参考" src="dedicated-reference.svg"></div></section></div>'
    page += '<h2>保留的具体实例详图</h2><div class="grid">' + ''.join(panel(p['capture']) for p in j['panels'][1:]) + '</div>'
    page += '<h2>未选中的继续展开候选</h2><p>以下图形保留实际失败，不作为覆盖计分或交付图组。</p><div class="grid">' + ''.join(panel(r['name']) for r in reports[1]['rows'] if r['name'].startswith('Transformer-trial-')) + '</div>'
    (OUT / 'transformer-review.html').write_text(page + '</html>')
    (OUT / 'text-qa.html').write_text(head + '<h1>' + str(len(rows)) + ' 张实际 SVG 的原生文字测量</h1>' + ''.join(panel(name, native=True) for name in rows) + '</html>')
