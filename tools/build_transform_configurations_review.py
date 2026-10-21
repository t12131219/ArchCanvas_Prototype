"""Present the audited bytes, complete views and focused configuration examples."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/transform-configurations/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def page(name, title, sections):
    text = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>折叠摘要显示源码已明确给出的变换配置。#序号对应摘要中的原始操作位置；不推断张量秩、合法形状、轴角色或执行成功。动态配置保持原边界，摘要仍可继续展开。</p>
<p>新增说明需要空间，尺寸和线长代价单独报告。展开模块标题仍允许连线穿过。</p>
<nav><a href="review.html">局部语义与陌生组合</a><a href="transformer-review.html">主图、详图与专用参考</a><a href="all-review.html">全部正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''
    for label, panels, crop in sections:
        text += f'<section id="{escape(label, quote=True)}"><h2>{escape(label)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for title, file, metrics in panels:
            svg = ET.parse(OUT / file).getroot()
            svg.set('width', '100%'); svg.set('height', 'auto')
            if crop: svg.set('viewBox', crop)
            text += f'<article data-artifact="{escape(file)}"><h3>{escape(title)}</h3><p class="metrics">{escape(metrics)}</p>{ET.tostring(svg,encoding="unicode")}<a href="{escape(file)}">原尺寸 SVG</a></article>'
        text += '</div></section>'
    text += '<p>本轮只增加有证据的局部配置表达。与专用参考的完整架构和版式收敛仍未完成。</p></html>'
    (OUT / name).write_text(text)


if __name__ == '__main__':
    read = lambda file: json.loads((OUT / file).read_text())
    small = read('small-report.json')['rows']
    large = [read(f'Transformer-panel-{i}-report.json')['rows'][0] for i in range(3)]
    counts = {r['name']: r['annotations'] for r in read('independent-checks.json')['rows']}

    def panels(row):
        result = []
        for r in row['results']:
            q = r['quality']
            metrics = f"{q['native_width_px']} × {q['native_height_px']} · crossings {q['line_geometry']['crossings']} · Σ wire {q['wire_length']}"
            if r['suffix'] == 'current': metrics += f" · literal configurations {counts[row['name']]}"
            result.append(('本轮前' if r['suffix'] == 'before' else '当前', r['svg'], metrics))
        return result

    fresh = [r for r in small if r.get('kind') == 'fresh-source']
    # Put this round's new source fixtures before the inherited mixed cases.
    fresh.sort(key=lambda r: not r['name'].endswith('Patch'))
    page('review.html', '变换配置：可展开摘要与陌生组合', [(r['name'], panels(r), None) for r in fresh] + [('主图局部：投影后的轴配置', panels(large[0]), '175 620 770 680')])
    reference = OUT / 'dedicated-reference.svg'
    reference.write_bytes((ROOT / 'verification/shared-fanouts/current/dedicated-reference.svg').read_bytes())
    page('transformer-review.html', '通用语义状态与专用参考：明确变换配置', [(large[0]['name'], panels(large[0]) + [('专用详细参考 · 01093cc06a87b35a', reference.name, '人工语义与版式参考')], None)] + [(r['name'], panels(r), None) for r in large[1:]])
    page('all-review.html', '变换配置：全部正式对照', [(r['name'], panels(r), None) for r in large + small])
