"""Present actual audited SVG bytes, including the source lead crossing."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/source-port-order/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def page(title, sections):
    html = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>在实际相交的输出起始段中交换两个既有几何端口的位置，保留各自的值、槽位和消费端口。仅修改首次转弯之前的两段，不合并值，不移动节点，不重布远处路径。模块标题继续允许穿过。</p>
<nav><a href="review.html">局部与陌生图</a><a href="transformer-review.html">完整主图、详图与专用参考</a><a href="all-review.html">全部正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''
    for label, panels, crop in sections:
        html += f'<section id="{escape(label,quote=True)}"><h2>{escape(label)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for title, file, metrics in panels:
            svg = ET.parse(OUT / file).getroot()
            svg.set('width','100%');svg.set('height','auto')
            if crop:svg.set('viewBox',crop)
            html += f'<article data-artifact="{escape(file)}"><h3>{escape(title)}</h3><p class="metrics">{escape(metrics)}</p>{ET.tostring(svg,encoding="unicode")}<a href="{escape(file)}">原尺寸 SVG</a></article>'
        html += '</div></section>'
    html += '<p>这里只改善已有计算的几何排列。完整架构、局部证据与专用参考的组织收敛仍未完成；控制、状态和未知边界保留。</p></html>'
    return html


if __name__ == '__main__':
    read=lambda f:json.loads((OUT/f).read_text())
    small=read('small-report.json')['rows']
    large=[read(f'Transformer-panel-{i}-report.json')['rows'][0]for i in range(3)]
    def panels(row):
        return [('本轮前' if r['suffix']=='before' else '当前',r['svg'],
                 f"{r['quality']['native_width_px']} × {r['quality']['native_height_px']} · crossings {r['quality']['line_geometry']['crossings']} · Σ wire {r['quality']['wire_length']}")for r in row['results']]
    reference='dedicated-reference.svg'
    (OUT/reference).write_bytes((ROOT/'verification/transform-configurations/current'/reference).read_bytes())
    chosen=[next(r for r in small if r['name']==name)for name in ['SharedColumns','LongReconvergence','UnknownReconvergence','NestedLeads-bottom']]
    (OUT/'review.html').write_text(page('输出端口按实际转弯位置排列',[(r['name'],panels(r),'270 80 570 240' if r['name']=='NestedLeads-bottom' else None)for r in chosen]+[('主图局部：输入分叉',panels(large[0]),'875 70 300 330')]))
    (OUT/'transformer-review.html').write_text(page('同一语义前沿：通用主图与专用参考',[(large[0]['name'],panels(large[0])+[('专用详细参考 · 01093cc06a87b35a',reference,'仅作架构与版式参考')],None)]+[(r['name'],panels(r),None)for r in large[1:]]))
    (OUT/'all-review.html').write_text(page('输出端口排列：全部正式对照',[(r['name'],panels(r),None)for r in large+small]))
