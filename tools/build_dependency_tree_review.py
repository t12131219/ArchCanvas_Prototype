"""Show actual summary and unfolding SVGs, including candid full-graph cost."""
import hashlib
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/dependency-trees/current'


def svg(path, prefix):
    tree = ET.parse(path).getroot()
    ids = {e.get('id'): prefix + '-' + e.get('id') for e in tree.iter() if e.get('id')}
    for e in tree.iter():
        for attr, value in list(e.attrib.items()):
            if attr == 'id':
                e.set(attr, ids[value])
            else:
                for a, b in ids.items():
                    value = value.replace('url(#' + a + ')', 'url(#' + b + ')')
                e.set(attr, value)
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    return ET.tostring(tree, encoding='unicode')


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通用依赖树摘要与继续展开</title>'
            f'<meta name="render-report-sha256" content="{hashlib.sha256((OUT / "render-report.json").read_bytes()).hexdigest()}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:23px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:600px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>通用依赖树摘要与继续展开</h1><p class="notice">按真实依赖汇合形成可逆摘要；参数、操作数、结果槽和源码边界保留。'
            '摘要中的箭头表示依赖汇入结果，不表示并行执行或完整函数参数列表。未知、条件、内部复用、中间结果外泄和晚到的上下文保持展开。'
            '这是摘要能力的扩展，尚未完成全图摘要与角色细化的联合选择。</p>')

    def card(name):
        r = rows[name]
        q = r['quality']
        return (f'<article data-case="{escape(name)}"><h2>{escape(name)}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p>' + svg(OUT / r['svg'], name) + '</article>')

    groups = [[name+'-before', name+'-current', name+'-opened'] for name in ['MergeWeave', 'ScaledProjection', 'ResultFanout']]
    groups += [[name+'-before', name+'-current'] for name in ['UnknownTree', 'LateTree', 'EscapingTree', 'SharedTree', 'ConditionalTree']]
    (OUT / 'comparison.html').write_text(head + ''.join('<div class="cards">' + ''.join(card(n) for n in group) + '</div>' for group in groups) + '</html>')
    text = head + '<p class="notice">Transformer：两个嵌入计算区域形成摘要，32 个已露出的认证角色保留。'
    text += '自动预算同时展开了邻接的四个细节；整图由 2588 × 4530 变为 2588 × 4634，交叉 57 → 56。'
    text += '局部紧凑并未带来整图面积下降，当前结果仍明显没有达到专用参考。</p>'
    text += '<div class="cards">' + card('transformer-before') + card('transformer-current') + '</div>'
    if 'transformer-focused' in rows:
        text += '<div class="cards">' + card('transformer-focused') + card('transformer-focused-open') + '</div>'
    text += '<div class="cards"><article><h2>专用完全展开参考（仅评价）</h2>' + svg(ROOT / report['reference']['svg'], 'reference') + '</article>' + card('transformer-current') + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(text)
    names = list(rows)
    (OUT / 'text-qa.html').write_text(head + ''.join('<div class="cards">' + ''.join(card(n) for n in names[i:i+2]) + '</div>' for i in range(0, len(names), 2)) + '</html>')
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()
