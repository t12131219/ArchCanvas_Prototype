"""Build review pages from hash-audited, actual SVG captures."""
from html import escape
from pathlib import Path
import xml.etree.ElementTree as ET
from check_stage_overview import OUT, ROOT, read, reports
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def start(title):
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{margin:24px;background:#eef2f7;color:#26344a;font:15px Arial,sans-serif;line-height:1.6}}h1{{font-size:26px}}h2{{font-size:20px}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}article{{background:white;border:1px solid #ccd5e2;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px}}article svg{{display:block;width:100%;height:auto}}.metrics{{font:13px monospace}}section{{margin:26px 0}}a{{color:#315e97}}nav{{display:flex;gap:22px;flex-wrap:wrap}}.note{{background:white;padding:12px 18px;border-left:4px solid #6b83a8}}</style>
<h1>{title}</h1><p class="note">双目标：F0 阶段概览接近专用完全折叠图；F1 角色及局部细节接近专用展开图。两者之下仍保留更细源码检查。本轮增加的是可缩放画布中的通用阶段概览，不宣称整体版式已收敛。</p>
<nav><a href="review.html">Transformer 双目标</a><a href="mixed-review.html">陌生组合与可逆展开</a><a href="all-review.html">38 张正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''


def panel(file, title, metric='', reference=False):
    path = ROOT / 'verification/generic-convergence/current' / file if reference else OUT / file
    svg = ET.parse(path).getroot()
    svg.set('width', '100%'); svg.set('height', 'auto')
    href = '../../generic-convergence/current/' + file if reference else file
    data = '' if reference else f' data-artifact="{escape(file)}"'
    return f'<article{data}><h3>{escape(title)}</h3><p class="metrics">{escape(metric)}</p>{ET.tostring(svg, encoding="unicode")}<a href="{escape(href)}">原尺寸 SVG</a></article>'


def capture(c, title):
    q = c['quality']
    metric = f"{q['native_width_px']} × {q['native_height_px']} · crossings {q['line_geometry']['crossings']} · wire {q['wire_length']}"
    return panel(c['svg'], title, metric)


def pair(row):
    labels = {'new-coarse-preset-vs-prior-certified-boundary-preset': ('原语义边界档 · 同一 IR', '新增阶段概览 · 同一 IR'),
              'coarse-vs-manual-detail': ('阶段概览', '手动展开摘要'),
              'same-state-regression': ('441c3ab · 原状态', '当前 · 相同状态，SVG 完全一致')}
    return '<section><h2>' + escape(row['name']) + '</h2><div class="columns">' + ''.join(
        capture(c, title) for c, title in zip(row['results'], labels[row['comparison']])) + '</div></section>'


if __name__ == '__main__':
    allrows = [r for report in reports() for r in report['rows']]
    by = {r['name']: r for r in allrows}
    page = start('通用阶段概览：同时对照专用折叠与展开状态')
    page += '<h2>F0：阶段概览与专用完全折叠</h2><p>当前保留 3 个注意力、2 个 FFN、5 个 Add & Norm。仍有位置编码、调用边界、重复实例余项等细节；阅读方向与 memory 线路尚不同。专用图中的末端 Softmax 是 Transformer.forward 之外的注释，不补成实际执行节点。</p><div class="columns">'
    page += panel('reference-collapsed.svg', '专用参考 · 完全折叠', '23 nodes · 25 edges · 1600 × 1218', True)
    page += capture(by['Transformer-F0']['results'][1], '通用 F0 · 阶段概览 · 40 图元 / 46 连接') + '</div>'
    page += pair(by['Transformer-F0'])
    page += '<h2>F1：专用展开与通用细节图组</h2><p>通用三张已选定细节图在本轮前后逐字节相同。这里展示现有能力及剩余差距，并不把阶段摘要计为内部运算已经展开。</p><div class="columns">'
    page += panel('reference-expanded.svg', '专用参考 · 完全展开', '83 nodes · 85 edges · 1600 × 2742', True)
    page += capture(by['Transformer-F1-0']['results'][1], '通用 F1 · 主图') + '</div>'
    for i in [1, 2]:
        page += pair(by[f'Transformer-F1-{i}'])
    page += '<p>原始源码投影仍保留 3371 节点与 3663 条边；这不等于数千节点完整 SVG 的路由性能已通过验收。</p></html>'
    (OUT / 'review.html').write_text(page)
    (OUT / 'mixed-review.html').write_text(start('通用阶段概览：组合边界与继续展开') + ''.join(pair(r) for r in allrows if not r['name'].startswith('Transformer-')) + '</html>')
    (OUT / 'all-review.html').write_text(start('通用阶段概览：38 张正式 SVG 对照') + ''.join(pair(r) for r in allrows) + '</html>')
