"""Display real before/current SVGs and native crops of changed node titles."""
import copy
import hashlib
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ET.register_namespace('', 'http://www.w3.org/2000/svg')

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-identity/experiment'
r = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>通用角色身份与上下文标题审核</title><style>body{{font:16px Arial;color:#293746;margin:24px;line-height:1.6}}h1{{font-size:25px}}h2{{font-size:19px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}article{{padding:16px;border:1px solid #b9c7d4;margin:12px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}.native svg{{max-width:none}}.note{{padding:14px;background:#fff3d4}}.crops{{display:flex;gap:32px}}</style>'''
page = head + '<h1>通用角色身份与上下文标题</h1><p class="note">保留准确的证书键数组；带点的键与嵌套键不再共用角色身份。数字成员保留所在字段。以下标题局部取自实际 SVG；标题变宽会重新测量节点。八组输入的实际路由和质量指标均相同，五组完整 SVG 相同。这项修复尚未实现专用参考的整体收敛。</p>'
first = r['comparisons'][0]; node = first['changed_titles'][0]['node']
page += '<h2>实际 SVG 标题局部（原生比例）</h2><div class="crops">'
for variant in ['before', 'current']:
    row = next(x for x in r['rows'] if x['case'] == first['name'] and x['variant'] == variant)
    tree = ET.parse(OUT / row['svg']).getroot(); ns = '{http://www.w3.org/2000/svg}'
    element = copy.deepcopy(next(e for e in tree.iter() if e.get('data-node-id') == node))
    document = json.loads((OUT / row['document']).read_text()); geometry = next(n for n in document['layout']['nodes'] if n['id'] == node)
    element.set('transform', 'translate(16,16)')
    crop = ET.Element(ns + 'svg', {'class':'publication', 'width':str(geometry['w'] + 32), 'height':str(geometry['h'] + 32), 'viewBox':f"0 0 {geometry['w'] + 32} {geometry['h'] + 32}"})
    crop.append(copy.deepcopy(tree.find(ns + 'style'))); crop.append(element)
    page += '<article><h2>' + variant + '</h2>' + ET.tostring(crop, encoding='unicode') + '</article>'
page += '</div><p>完整图仍保留每个原始操作数、结果槽、条件和来源；局部标题裁剪仅便于阅读，不代替整图审核。</p>'
native = head + '<h1>实际 SVG 原生文字审核</h1>'
for case in r['comparisons']:
    page += '<h2>' + html.escape(case['name']) + '</h2><div class="grid">'
    for row in [x for x in r['rows'] if x['case'] == case['name']]:
        svg = (OUT / row['svg']).read_text(); q = row['quality']
        page += f'<article><h2>{row["variant"]}</h2><p>{row["nodes"]} 图元 / {row["edges"]} 边 · {q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉</p><div class="fit">{svg}</div></article>'
        native += '<article class="native" data-case="' + row['name'] + '"><h2>' + row['name'] + '</h2>' + svg + '</article>'
    page += '</div>'
(OUT / 'review.html').write_text(page + '</html>'); (OUT / 'text-qa.html').write_text(native + '</html>')
print(json.dumps({'panels':len(r['rows']), 'render_report_sha256':digest}))
