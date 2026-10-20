"""Build actual-SVG review pages, including failed whole-graph experiments."""
import hashlib
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-details/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
    rows = {r['name']: r for r in report['rows']}

    def svg(file, key):
        element = ET.parse(file).getroot()
        ids = {e.get('id'): key + '-' + e.get('id') for e in element.iter() if e.get('id')}
        for e in element.iter():
            for attr, value in list(e.attrib.items()):
                if attr == 'id':
                    e.set(attr, ids[value])
                else:
                    for old, new in ids.items():
                        value = value.replace('url(#' + old + ')', 'url(#' + new + ')')
                    e.set(attr, value)
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        return ET.tostring(element, encoding='unicode')

    def card(name):
        r = rows[name]
        q = r['quality']
        return (f'<article data-case="{name}" class="{"failed" if q["issues"] else ""}"><h2>{name}</h2>'
                f'<p>{r["nodes"]} 图元 / {r["edges"]} 边 · {q["native_width_px"]} × {q["native_height_px"]} px'
                f' · {q["line_geometry"]["crossings"]} 交叉 · {escape(", ".join(q["issues"]) or "当前几何检查通过")}</p>'
                + svg(OUT / r['svg'], name) + '</article>')

    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
            f'<meta name="render-report-sha256" content="{digest}"><title>局部角色细化审核</title>'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:22px}h1{font-size:24px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{border:1px solid #bbc9d7;padding:12px;min-width:0}'
            '.failed{border:2px solid #b74c3b;background:#fff5ef}svg{width:100%;height:600px;display:block}.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>局部角色细化：选择语义状态，保留更深展开</h1>'
            '<p class="notice">目标尚未完成。规则只消费已有认证角色，独立保留每份证明和边界。小图可用；'
            'Transformer 整图追加细节超过面积预算，全部选中还出现路径重叠，标为失败实验。局部详图仅证明该区域可读，不代表整图收敛。</p>')
    (OUT / 'text-qa.html').write_text(head + '<div class="cards">' + ''.join(card(n) for n in rows) + '</div></html>')
    (OUT / 'comparison.html').write_text(head + '<div class="cards">' + ''.join(card(n) for n in [
        'SameSource-default', 'SameSource-selected', 'SameSource-detail']) + '</div></html>')
    reference = ROOT / 'verification/generic-convergence/current/reference-expanded.svg'
    (OUT / 'transformer-comparison.html').write_text(head + '<div class="cards">' + card('transformer-default')
        + card('transformer-local') + card('transformer-selected') + '</div><div class="cards">'
        + card('transformer-local-panel') + '<article><h2>专用参考：展开状态（仅评价）</h2>'
        + svg(reference, 'reference') + '</article></div></html>')
    print(json.dumps({'panels': len(rows), 'goal_complete': False}))


if __name__ == '__main__':
    main()
