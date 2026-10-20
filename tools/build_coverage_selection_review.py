"""Review actual SVGs for local structure/detail selection, including tradeoffs."""
import hashlib
from html import escape
import json
from pathlib import Path
from build_dependency_tree_review import svg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/coverage-selection/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>模块关系与内部操作的局部选择</title>'
            f'<meta name="render-report-sha256" content="{digest}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:23px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:600px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>模块关系与内部操作的局部选择</h1><p class="notice">以实际候选布局比较关键关系、结构和细节收益。'
            '摘要表达不等于内部操作数全部展开；不同策略的覆盖范围可能不同，图元更少不自动表示视觉更好。'
            '旧策略、手动继续展开和原始事实保留。本轮仍是有预算的局部选择，整体规划及专用参考对齐尚未完成。</p>')

    def card(name):
        r, q = rows[name], rows[name]['quality']
        policy = r.get('adaptive', {}).get('policy') if r.get('adaptive') else None
        label = {'structure': '模块与关系', 'detail': '内部操作'}.get(policy, '默认 / 手动')
        if r.get('version') == 'before' and r['state'].get('paperAdaptive'):
            label = '冻结基线：内部操作'
        checks = r.get('summary_coverage', [])
        summaries = sum(c['form'] == 'summary' for c in checks)
        detail = sum(c['form'] == 'operation-paths' for c in checks)
        accepted = sum(t['accepted'] for t in (r.get('adaptive') or {}).get('attempts', []))
        return (f'<article data-case="{escape(name)}"><h2>{escape(name)} · {label}</h2>'
                f'<p>{r["nodes"]} 图元 / {r["edges"]} 边 · {q["native_width_px"]} × {q["native_height_px"]} px · '
                f'{q["line_geometry"]["crossings"]} 交叉 · {len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p>'
                f'<p>依赖结构：摘要 {summaries} / 展开路径 {detail}；自动采用 {accepted} 次局部细化。'
                '这些数值不代表完整原子细节覆盖。</p>' + svg(OUT / r['svg'], name) + '</article>')

    groups = []
    for name in ['MixedWeave', 'SourceMosaic', 'BranchedMosaic', 'InterruptedWeave', 'UncertifiedWeave',
                 'UnknownMosaic', 'SameSource', 'ConditionalCarry', 'ForeignComposition']:
        names = [name + s for s in ['-before', '-current', '-manual'] if name + s in rows]
        groups.append('<div class="cards">' + ''.join(card(n) for n in names) + '</div>')
    (OUT / 'comparison.html').write_text(head + '<p class="notice">MixedWeave 图元 29 → 25，摘要增加；交叉 0 → 3。'
                                       '因此这次选择体现了结构与细节的取舍，并不证明所有可读性指标改善。</p>' + ''.join(groups) + '</html>')
    b, c, p = (rows[n] for n in ['transformer-before', 'transformer-current', 'transformer-planned'])
    text = head + '<p class="notice">专用全展开仅作为通用图中间语义状态的评价参考。'
    text += '通用默认图与冻结基线' + ('逐字节一致' if b['svg_sha256'] == c['svg_sha256'] else '存在变化') + '。'
    text += f'模块关系策略为 {p["nodes"]} 图元 / {p["edges"]} 边；尚未达到专用参考的模块组织与视觉效果。'
    text += '原始源码投影可恢复 3371 节点 / 3663 边；数千节点同屏路由与交互性能未验证。</p>'
    text += '<div class="cards">' + ''.join(card(n) for n in ['transformer-before', 'transformer-current', 'transformer-planned']) + '</div>'
    text += '<div class="cards"><article data-case="reference"><h2>专用完全展开参考（仅评价）</h2>'
    text += svg(ROOT / report['reference']['svg'], 'reference') + '</article>' + card('transformer-planned') + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(text)
    (OUT / 'text-qa.html').write_text(head + ''.join(card(n) for n in rows) + '</html>')
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()
