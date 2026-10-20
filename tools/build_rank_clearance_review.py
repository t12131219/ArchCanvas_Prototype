"""Show actual selected, rejected and reference SVGs with their measured limits."""
from html import escape
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/rank-clearance/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    prior = json.loads((ROOT / report['prior_report']).read_text())
    old = {r['name']: r for r in prior['rows']}
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()

    def svg(file, key):
        element = ET.parse(file).getroot()
        ids = {e.get('id'): key + '-' + e.get('id') for e in element.iter() if e.get('id')}
        for e in element.iter():
            for attr, value in list(e.attrib.items()):
                if attr == 'id':
                    e.set(attr, ids[value])
                else:
                    for a, b in ids.items():
                        value = value.replace('url(#' + a + ')', 'url(#' + b + ')')
                    e.set(attr, value)
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        return ET.tostring(element, encoding='unicode')

    def card(name, before=False):
        r = old[name] if before else rows[name]
        file = ROOT / Path(report['prior_report']).parent / r['svg'] if before else OUT / r['svg']
        q = r['quality']
        label = '上一轮实际图' if before else '显式试验，未自动采用' if r.get('experiment_for') else '本轮实际选中图'
        key = ('before-' if before else '') + name
        return (f'<article data-case="{key}"><h2>{escape(name)} · {label}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p><p>{escape(", ".join(q["issues"]) or "无列示质量问题")}</p>'
                + svg(file, key) + '</article>')

    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
            f'<meta name="render-report-sha256" content="{digest}"><title>阶段间隙审核：保留相同语义与展开状态</title>'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:22px}h1{font-size:24px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:20px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:620px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>按依赖阶段分配留白，并逐区测量</h1><p class="notice">同一套通用规则保留节点、操作数、条件、未知边界及展开状态。'
            '完整候选失败后最多测量三个绘图区域；仅采用面积与路由均通过的步骤。ChannelChain、ForeignSignals、CrossedSignals 是人工几何测试图。'
            'Transformer 仅用于评价；局部或几何改善不能证明已接近专用图，整体目标仍未完成。图中无节点交叉表示跨越。</p>')
    def page(name, groups):
        (OUT / name).write_text(head + ''.join('<div class="cards">' + ''.join(card(n, b) for n, b in group) + '</div>' for group in groups) + '</html>')
    page('comparison.html', [[('ChannelChain-before', False), ('ChannelChain-auto', False), ('ChannelChain-folded', False)],
                             [('CrossedSignals-auto', True), ('CrossedSignals-auto', False), ('CrossedSignals-auto-candidate', False)]])
    page('panel-comparison.html', [[('transformer-local-panel', True), ('transformer-local-panel', False)]])
    names=list(rows)
    page('text-qa.html', [[(n, False) for n in names[i:i+3]] for i in range(0, len(names), 3)])
    content = head
    for n in ['transformer-local', 'transformer-selected']:
        content += '<div class="cards">' + card(n, True) + card(n) + card(n + '-candidate') + '</div>'
    content += '<div class="cards">' + card('transformer-default') + '<article><h2>专用展开参考（仅评价）</h2>'
    content += svg(ROOT / 'verification/generic-convergence/current/reference-expanded.svg', 'reference') + '</article></div></html>'
    (OUT / 'transformer-comparison.html').write_text(content)
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()
