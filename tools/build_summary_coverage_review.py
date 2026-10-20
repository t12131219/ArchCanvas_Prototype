"""Build review pages from actual SVG outputs, never reconstructed diagrams."""
import hashlib
from html import escape
import json
from pathlib import Path
from build_dependency_tree_review import svg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/summary-coverage/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通用摘要与详细表达检查</title>'
            f'<meta name="render-report-sha256" content="{digest}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:23px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:600px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>通用摘要与详细表达检查</h1><p class="notice">操作依赖结构可以由摘要或展开路径表达；两种形式分别检查。'
            '摘要不完成内部操作数、参数或运行行为的详细目标。隐藏候选保持 deferred；自动细化必须保留已表达的依赖结构。'
            '本轮图形几何保持不变，新增的是有范围的表达证据和检查器说明，联合摘要/细节规划仍待实现。</p>')

    def card(name):
        r = rows[name]
        q = r['quality']
        checks = r.get('summary_coverage', [])
        counts = {kind: sum(c['form'] == kind for c in checks) for kind in ['summary', 'operation-paths', 'deferred']}
        explanation = ('依赖结构：摘要 ' + str(counts['summary']) + ' / 详细路径 ' + str(counts['operation-paths']) + ' / 未展开 ' + str(counts['deferred'])) if checks else ('旧基线未提供摘要表达检查；不补写历史证据。' if r.get('version') == 'before' else '当前范围没有适用的局部摘要候选。')
        return (f'<article data-case="{escape(name)}"><h2>{escape(name)}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p><p>{escape(explanation)}</p>' + svg(OUT / r['svg'], name) + '</article>')

    groups = []
    for name in ['SourceMosaic', 'InterruptedMosaic', 'LateMosaic', 'ReusedCircuit', 'TupleCircuit', 'SharedTree', 'EscapingTree', 'BranchedMosaic']:
        names = [name + s for s in ['-before', '-current', '-opened', '-adaptive'] if name + s in rows]
        groups.append('<div class="cards">' + ''.join(card(n) for n in names) + '</div>')
    (OUT / 'comparison.html').write_text(head + ''.join(groups) + '</html>')
    text = head + '<p class="notice">Transformer 默认 SVG 与冻结基线逐字节一致：94 图元 / 102 边，2588 × 4364，57 交叉。'
    text += '14 个局部摘要通过操作依赖结构检查，60 个隐藏候选保持未完成；内部原子细节仍单独计分。'
    text += '尚未达到专用参考的模块组织和视觉效果。源码细节投影可恢复 3371 节点 / 3663 边；数千节点同屏 SVG 路由与交互性能未验证。</p>'
    text += '<div class="cards">' + card('transformer-before') + card('transformer-current') + '</div>'
    text += '<div class="cards"><article><h2>专用完全展开参考（仅用于评价）</h2>' + svg(ROOT / report['reference']['svg'], 'reference') + '</article>' + card('transformer-current') + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(text)
    (OUT / 'text-qa.html').write_text(head + ''.join(card(n) for n in rows) + '</html>')
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()
