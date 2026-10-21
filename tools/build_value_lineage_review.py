"""Actual SVG comparison, with the corrected semantic scope enlarged."""
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/value-lineage/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')
read = lambda p: json.loads(p.read_text())


def inline(name, suffix, position=False):
    svg = ET.parse(OUT / (name + '-' + suffix + '.svg')).getroot()
    if position:
        d = read(OUT / (name + '-' + suffix + '.layout.json'))
        p = next(p for p in d['layout']['nodes'] if p['title'] == 'position' and p.get('expanded'))
        crop = [p['x'] - 70, p['y'] - 40, p['w'] + 140, p['h'] + 80]
        svg.set('viewBox', ' '.join(map(str, crop)))
        svg.set('width', str(crop[2]));svg.set('height', str(crop[3]))
    return ET.tostring(svg, encoding='unicode')


if __name__ == '__main__':
    audit = read(OUT / 'independent-report.json');assert audit['passed']
    rows = {r['name']: r for r in audit['comparisons']}
    page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>数据值与配置依赖：通用语义审核</title><style>
body{font:16px/1.65 system-ui;background:#f5f7fb;color:#263447;margin:20px}main{max-width:1450px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.three{grid-template-columns:repeat(3,minmax(0,1fr))}
section{background:#fff;border:1px solid #cbd5e1;padding:16px;margin:12px 0;min-width:0}h1{margin:8px 0}h2{font-size:19px;margin:0 0 10px}
svg.publication,img{width:100%;height:auto}.crop svg{height:590px;object-fit:contain}a{color:#175fc2}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;border-bottom:1px solid #dbe2ec;padding:8px}
code{background:#edf2f7;padding:2px 4px}@media(max-width:850px){.grid,.three{display:block}}</style><main>
<h1>配置来源不能证明残差数据分支</h1>
<p>同一套通用规则区分数据值与形状、类型、设备及分配配置。原始依赖保留；仅撤回没有值路径证据的 Residual 解释。真实数据分支仍可认证，展开模块标题仍允许连线穿过。</p>
<p><code>x + resource[:, :x.size(1)].to(dtype=x.dtype)</code> 中，x 决定切片长度和输出类型，但没有成为 resource 分支所变换的张量值。</p>
<div class="grid crop">'''
    for suffix, title in [('before', '之前：配置依赖被误标为 Residual'), ('current', '当前：保留资源、配置和真实加法')]:
        page += f'<section data-panel="position-{suffix}"><h2>{title}</h2>' + inline('Transformer-panel-0', suffix, True) + '</section>'
    page += '</div><p>以上为实际主图 SVG 的局部视窗。撤销错误摘要后可能露出更多计算，本轮不以减少节点或线长作为收益。</p>'
    for name, title in [('ExemplarOnly', '陌生配置案例：resource.to(x) 的 x 只是类型／设备参照'),
                        ('TrueValue', '真正的数据分支：x + relu(x).to(resource)'),
                        ('MixedValues', 'helper、真实残差与未知调用组合：边界保留')]:
        page += '<h2>' + title + '</h2><div class="grid">'
        for suffix, label in [('before', '之前'), ('current', '当前')]:
            page += f'<section data-panel="{name}-{suffix}"><h2>{label}</h2>' + inline(name, suffix) + '</section>'
        page += '</div>'
    page += '<section><h2>固定状态的实际 SVG 指标</h2><table><tr><th>状态</th><th>节点：前 → 后</th><th>通用残差发现：前 → 后</th><th>交叉：前 → 后</th><th>线长：前 → 后</th></tr>'
    for r in audit['comparisons']:
        a, b = r['before'], r['current']
        page += f"<tr><td>{html.escape(r['name'])}</td><td>{a['nodes']} → {b['nodes']}</td><td>{a['generic_residuals']} → {b['generic_residuals']}</td><td>{a['crossings']} → {b['crossings']}</td><td>{a['wire']} → {b['wire']}</td></tr>"
    page += '''</table><p><a href="independent-report.json">独立 XML 审核</a> · <a href="certificate-comparison.json">源码认证对照</a> · <a href="roundtrip.json">保存／折叠／再展开</a> · <a href="fresh-extraction.json">重新抽取</a> · <a href="source-expandability.json">完整源码投影</a></p></section><div class="grid three">'''
    for src, title in [('Transformer-panel-0-before.svg', '之前的通用主图'), ('Transformer-panel-0-current.svg', '当前中间语义状态'),
                       ('/verification/title-passages/current/dedicated-reference.svg', '专用参考图')]:
        page += f'<section><h2>{title}</h2><a href="{src}"><img src="{src}" alt="{title}"></a></section>'
    page += '''</div><p>通用语义与专用图的整体收敛仍未完成。保留全部源码事实不等于本轮已重新验证数千节点 SVG 路由和浏览器性能。</p></main></html>'''
    (OUT / 'review.html').write_text(page)
