"""Render comparison pages from captured production SVG files."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/transform-sequences/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def page(title, sections):
    result = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>变换参数保留直接构造的 tuple/list 及每个元素的源码表达式。命名变量仍保留原名；未知、条件、状态和返回边界保留。说明不推断有效形状或执行结果，模块标题允许穿线。</p>
<nav><a href="review.html">陌生与混合程序</a><a href="transformer-review.html">完整架构与专用参考</a><a href="all-review.html">全部正式 SVG</a><a href="independent-checks.json">独立源码与 SVG 审核</a></nav>'''
    for label, panels in sections:
        result += f'<section id="{escape(label, quote=True)}"><h2>{escape(label)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for title, file, metrics in panels:
            svg = ET.parse(OUT / file).getroot()
            svg.set('width', '100%')
            svg.set('height', 'auto')
            result += f'<article data-artifact="{escape(file)}"><h3>{escape(title)}</h3><p class="metrics">{escape(metrics)}</p>{ET.tostring(svg, encoding="unicode")}<a href="{escape(file)}">原尺寸 SVG</a></article>'
        result += '</div></section>'
    return result + '<p>这次改进扩展通用源码表达能力；Transformer 三张图应与上一版相同，整体向专用图收敛的工作仍未完成。</p></html>'


if __name__ == '__main__':
    read = lambda f: json.loads((OUT / f).read_text())
    small = read('small-report.json')['rows']
    large = [read(f'Transformer-panel-{i}-report.json')['rows'][0] for i in range(3)]
    def panels(row):
        return [('本轮前' if r['suffix'] == 'before' else '当前', r['svg'],
            f"{r['quality']['native_width_px']} × {r['quality']['native_height_px']} · crossings {r['quality']['line_geometry']['crossings']} · Σ wire {r['quality']['wire_length']}") for r in row['results']]
    reference = 'dedicated-reference.svg'
    (OUT / reference).write_bytes((ROOT / 'verification/source-fork-widths/current' / reference).read_bytes())
    chosen = [next(r for r in small if r['name'] == name) for name in ['TuplePatch', 'ListPatch', 'UnknownTuple', 'MixedTuple', 'MutableList']]
    (OUT / 'review.html').write_text(page('结构化变换参数：陌生程序对照', [(r['name'], panels(r)) for r in chosen]))
    (OUT / 'transformer-review.html').write_text(page('通用架构与专用参考：结构化参数回归', [(large[0]['name'], panels(large[0]) + [('专用参考 · 01093cc06a87b35a', reference, '只作架构与版式参考')])] + [(r['name'], panels(r)) for r in large[1:]]))
    (OUT / 'all-review.html').write_text(page('结构化参数：全部正式对照', [(r['name'], panels(r)) for r in large + small]))
