"""Build review pages from actual SVG outputs, never reconstructed diagrams."""
import hashlib
from html import escape
import json
from pathlib import Path
from build_dependency_tree_review import svg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/dependency-dags/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通用依赖 DAG 与可逆展开</title>'
            f'<meta name="render-report-sha256" content="{digest}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:23px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:600px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>通用依赖 DAG 摘要与继续展开</h1><p class="notice">每个操作只记一次，内部复用通过明确引用表达；'
            '重复操作数和不同结果槽分别保留。引用编号不表示执行顺序。未知、条件、中间结果外泄及最终多结果打包保持原有边界。'
            '摘要仍能展开；节点变少不等于面积必然变小，也不等于详细表达目标已经完成。</p>')

    def card(name):
        r = rows[name]
        q = r['quality']
        return (f'<article data-case="{escape(name)}"><h2>{escape(name)}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p>' + svg(OUT / r['svg'], name) + '</article>')

    groups = []
    for name in ['ReusedCircuit', 'SquaredCircuit', 'TupleCircuit', 'UnknownCircuit', 'ConditionalCircuit', 'SharedTree', 'EscapingTree', 'InterruptedMixer']:
        names = [name + s for s in ['-before', '-current', '-opened'] if name + s in rows]
        groups.append('<div class="cards">' + ''.join(card(n) for n in names) + '</div>')
    (OUT / 'comparison.html').write_text(head + ''.join(groups) + '</html>')
    text = head + '<p class="notice">专用图的完全展开应对应通用图的一个中间语义状态；通用图仍可继续展开。'
    text += '本轮增加陌生局部计算的摘要能力，Transformer 默认 SVG 与冻结基线逐字节一致：94 图元 / 102 边，2588 × 4364，57 交叉。'
    text += '尚未达到专用参考的模块组织和视觉效果。源码细节投影可恢复 3371 节点 / 3663 边；数千节点同屏 SVG 路由与交互性能未验证。</p>'
    text += '<div class="cards">' + card('transformer-before') + card('transformer-current') + '</div>'
    text += '<div class="cards">' + card('transformer-focused') + card('transformer-focused-open') + '</div>'
    text += '<div class="cards"><article><h2>专用完全展开参考（仅用于评价）</h2>' + svg(ROOT / report['reference']['svg'], 'reference') + '</article>' + card('transformer-current') + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(text)
    (OUT / 'text-qa.html').write_text(head + ''.join(card(n) for n in rows) + '</html>')
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()
