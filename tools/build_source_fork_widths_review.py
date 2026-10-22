"""Build review pages from actual SVG captures; no substitute drawings."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/source-fork-widths/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def page(title, sections):
    html = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>同一外部输出槽进入同一依赖行时，可对少量消费者补齐宽度；单节点增宽最多 20%。源码、端口、参数说明和继续展开能力保留，不推断计算等价或并发。标题区域允许穿线。</p>
<nav><a href="review.html">陌生程序与局部对照</a><a href="transformer-review.html">完整主图与专用参考</a><a href="all-review.html">全部正式 SVG</a><a href="independent-checks.json">独立 AST/SVG 审核</a></nav>'''
    for label, panels, crop in sections:
        html += f'<section id="{escape(label,quote=True)}"><h2>{escape(label)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for title, file, metrics in panels:
            svg = ET.parse(OUT / file).getroot()
            svg.set('width','100%');svg.set('height','auto')
            if crop:svg.set('viewBox',crop)
            html += f'<article data-artifact="{escape(file)}"><h3>{escape(title)}</h3><p class="metrics">{escape(metrics)}</p>{ET.tostring(svg,encoding="unicode")}<a href="{escape(file)}">原尺寸 SVG</a></article>'
        html += '</div></section>'
    return html + '<p>整体架构与专用参考的收敛仍在继续。未知、条件、可变与状态边界保留；等宽只是一项布局偏好，不计为新增计算覆盖。</p></html>'


if __name__ == '__main__':
    read=lambda f:json.loads((OUT/f).read_text())
    small=read('small-report.json')['rows']
    large=[read(f'Transformer-panel-{i}-report.json')['rows'][0]for i in range(3)]
    def panels(row):
        return [('本轮前' if r['suffix']=='before' else '当前',r['svg'],
                 f"{r['quality']['native_width_px']} × {r['quality']['native_height_px']} · crossings {r['quality']['line_geometry']['crossings']} · Σ wire {r['quality']['wire_length']}")for r in row['results']]
    reference='dedicated-reference.svg'
    (OUT/reference).write_bytes((ROOT/'verification/transform-operands/current'/reference).read_bytes())
    chosen=[next(r for r in small if r['name']==name)for name in ['BorrowedGrid','SeparateGrid','MixedGrid','ConfiguredShape-open']]
    # Crops are review-only windows into the actual SVG; production geometry
    # and state selection never read these coordinates or case names.
    (OUT/'review.html').write_text(page('跨容器的同来源分叉排版',[(r['name'],panels(r),None)for r in chosen]))
    (OUT/'transformer-review.html').write_text(page('语义中间状态：跨容器来源分叉',[(large[0]['name'],panels(large[0])+[('专用参考 · 01093cc06a87b35a',reference,'只作架构与版式参考')],None)]+[(r['name'],panels(r),None)for r in large[1:]]))
    (OUT/'all-review.html').write_text(page('来源分叉：全部正式对照',[(r['name'],panels(r),None)for r in large+small]))
