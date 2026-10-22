"""Render comparison pages from captured production SVG files."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/unconsumed-dimensions/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def page(title, sections):
    result = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>维度解包中无后续用途的本地槽位保留为配置证据；不再阻止已证明的维度参数退出计算主链。未知、条件、状态和返回边界保留。模块标题允许穿线。</p>
<nav><a href="review.html">陌生与混合程序</a><a href="transformer-review.html">完整架构与专用参考</a><a href="all-review.html">全部正式 SVG</a><a href="independent-checks.json">独立源码与 SVG 审核</a></nav>'''
    for label, panels in sections:
        result += f'<section id="{escape(label, quote=True)}"><h2>{escape(label)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for title, file, metrics in panels:
            svg = ET.parse(OUT / file).getroot()
            svg.set('width', '100%')
            svg.set('height', 'auto')
            result += f'<article data-artifact="{escape(file)}"><h3>{escape(title)}</h3><p class="metrics">{escape(metrics)}</p>{ET.tostring(svg, encoding="unicode")}<a href="{escape(file)}">原尺寸 SVG</a></article>'
        result += '</div></section>'
    return result + '<p>本轮按真实端口和全部用途判断配置归属，不依赖模型名称。折叠会降低部分原子计算的直接露出，不将其计为覆盖增益；实际交叉与连线代价见上方指标。整体向专用图收敛的工作仍未完成。</p></html>'


if __name__ == '__main__':
    read = lambda f: json.loads((OUT / f).read_text())
    small = read('small-report.json')['rows']
    large = [read(f'Transformer-panel-{i}-report.json')['rows'][0] for i in range(3)]
    def panels(row):
        return [('本轮前' if r['suffix'] == 'before' else '当前', r['svg'],
            f"{r['quality']['native_width_px']} × {r['quality']['native_height_px']} · crossings {r['quality']['line_geometry']['crossings']} · Σ wire {r['quality']['wire_length']}") for r in row['results']]
    reference = 'dedicated-reference.svg'
    (OUT / reference).write_bytes((ROOT / 'verification/source-fork-widths/current' / reference).read_bytes())
    chosen = [next(r for r in small if r['name'] == name) for name in ['PartialDimensions', 'PartialDimensions-open', 'MixedDimensions', 'InterruptedDimensions', 'FeatureDimension', 'MixedGrid']]
    (OUT / 'review.html').write_text(page('维度配置归属：陌生与混合程序对照', [(r['name'], panels(r)) for r in chosen]))
    (OUT / 'transformer-review.html').write_text(page('通用架构与专用参考：维度配置归属', [(large[0]['name'], panels(large[0]) + [('专用参考 · 01093cc06a87b35a', reference, '只作架构与版式参考')])] + [(r['name'], panels(r)) for r in large[1:]]))
    (OUT / 'all-review.html').write_text(page('维度配置归属：全部正式对照', [(r['name'], panels(r)) for r in large + small]))
