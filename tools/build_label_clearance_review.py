"""Actual SVG comparison, keeping rejected geometry proposals visible."""
from html import escape
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/label-clearance/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()

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
        label = '显式候选；不代表自动采用' if r['experiment'] else ('采用局部留白' if r['refinement'] and r['refinement']['accepted'] else '保持原有布局')
        return (f'<article data-case="{name}" class="{"proposal" if r["experiment"] else ""}"><h2>{name}</h2><p>{label}</p>'
                f'<p>{r["nodes"]} 图元 / {r["edges"]} 边 · {q["native_width_px"]} × {q["native_height_px"]} px'
                f' · {q["line_geometry"]["crossings"]} 交叉 · {len(q["line_geometry"]["unrelated_contacts"])} 无关接触'
                f' · {escape(", ".join(q["issues"]) or "无列示质量问题")}</p>'
                + svg(OUT / r['svg'], name) + '</article>')

    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
            f'<meta name="render-report-sha256" content="{digest}"><title>局部标签留白审核</title>'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:22px}h1{font-size:24px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{border:1px solid #bbc9d7;padding:12px;min-width:0}'
            '.proposal{border:2px solid #c78537;background:#fff8ed}svg{width:100%;height:580px;display:block}.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>局部标签留白：测量后选择，保留语义前沿</h1>'
            '<p class="notice">整体目标尚未完成。条件连线的留白按实际绘图容器计算；只有面积减少且语义、端口、路由、交叉和接触均不退化时才自动采用。'
            'ForeignSignals/CrossedSignals 是人工构造的几何测试图。Transformer 仅供评价，候选和拒绝结果均保留，不能把变小直接计为收敛。</p>')
    def page(name, groups):
        (OUT / name).write_text(head + ''.join('<div class="cards">' + ''.join(card(n) for n in group) + '</div>' for group in groups) + '</html>')
    page('comparison.html', [['ForeignSignals-global', 'ForeignSignals-candidate', 'ForeignSignals-auto'],
                             ['CrossedSignals-global', 'CrossedSignals-candidate', 'CrossedSignals-auto']])
    page('text-qa.html', [list(rows)[i:i+3] for i in range(0, len(rows), 3)])
    content = head + '<div class="cards">' + ''.join(card(n) for n in ['transformer-default', 'transformer-local', 'transformer-local-candidate']) + '</div>'
    content += '<div class="cards">' + ''.join(card(n) for n in ['transformer-selected', 'transformer-selected-candidate'])
    content += '<article><h2>专用展开参考（仅评价）</h2>' + svg(ROOT / 'verification/generic-convergence/current/reference-expanded.svg', 'reference') + '</article></div></html>'
    (OUT / 'transformer-comparison.html').write_text(content)
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()
