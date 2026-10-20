"""Present actual selected/rejected SVGs and the unchanged evaluation reference."""
from html import escape
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-frontier/current'


def svg(file, prefix):
    tree = ET.parse(file).getroot()
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
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>局部自适应语义细化审核</title>'
            f'<meta name="render-report-sha256" content="{hashlib.sha256((OUT / "render-report.json").read_bytes()).hexdigest()}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:24px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:660px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>按局部事实选择语义细化</h1><p class="notice">同一套规则选择嵌套角色与独立计算关系。最多测量三个实际候选；'
            '保留原始 IR、手动选择、未知和控制边界。新增真实路径允许有限交叉代价，接触和异值重叠不增加。'
            'Transformer 仅作为评价参考：三个嵌套候选未通过，自动状态保持原图，仍未达到专用图的视觉和逻辑对应目标。</p>')

    def card(name):
        r = rows[name]
        q = r['quality']
        label = '未采用候选' if r.get('trial_for') and not r['accepted'] else '候选步骤' if r.get('trial_for') else '自动细化' if r.get('baseline') else '原有角色状态'
        decision = ''
        if r.get('trial_for'):
            a = rows[r['trial_for']]['adaptive']['attempts'][r['attempt']]
            decision = f'<p>表达收益权重 {a["gain"]}；{escape(", ".join(a["reasons"]) or "通过局部选择检查")}</p>'
        return (f'<article data-case="{escape(name)}"><h2>{escape(name)} · {label}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p><p>{escape(", ".join(q["issues"]) or "无列示质量问题")}</p>'
                + decision + svg(OUT / r['svg'], name) + '</article>')

    def page(file, groups):
        (OUT / file).write_text(head + ''.join('<div class="cards">' + ''.join(card(n) for n in group) + '</div>' for group in groups) + '</html>')
    page('comparison.html', [[n+'-default', n+'-adaptive'] for n in ['SameSource','InterruptedMixer','ForeignComposition','UnknownFusion','BoundaryWeave']])
    names = list(rows)
    page('text-qa.html', [names[i:i+2] for i in range(0,len(names),2)])
    content = head + '<div class="cards">' + card('transformer-default') + card('transformer-adaptive') + '</div>'
    trials = [n for n,r in rows.items() if r.get('trial_for') == 'transformer-adaptive']
    content += ''.join('<div class="cards">' + card(n) + '</div>' for n in trials)
    content += '<div class="cards"><article><h2>专用完全展开参考：仅评价</h2>' + svg(ROOT/'verification/generic-convergence/current/reference-expanded.svg','reference') + '</article><article><h2>通用自动选中状态：尚未收敛</h2>' + svg(OUT/rows['transformer-adaptive']['svg'],'generic-reference-peer') + '</article></div></html>'
    (OUT / 'transformer-comparison.html').write_text(content)
    print(json.dumps({'panels':len(rows)}))


if __name__ == '__main__':
    main()
