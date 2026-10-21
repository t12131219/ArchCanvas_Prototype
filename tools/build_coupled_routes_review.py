"""Build review pages from audited SVG bytes, without regenerating layouts."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/coupled-routes/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def inline(file):
    svg = ET.parse(file).getroot()
    svg.set('width', '100%');svg.set('height', 'auto')
    return ET.tostring(svg, encoding='unicode')


def page(file, title, sections):
    content = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}
.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}
article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px}}</style>
<h1>{title}</h1><p>联合重布实际相交的两条连线，保留节点、原始操作数和物理端口；标题区域继续允许通行。该步骤不识别模型家族，也不改变语义折叠状态。</p>
<nav><a href="review.html">Transformer 与专用参考</a><a href="details-review.html">两张详图</a><a href="generic-review.html">陌生与残缺图</a><a href="independent-report.json">独立审核记录</a></nav>'''
    for title, panels in sections:
        content += f'<section><h2>{escape(title)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for label, source, metrics in panels:
            content += f'<article><h3>{escape(label)}</h3><p class="metrics">{escape(metrics)}</p>{inline(source)}<p><a href="{escape(source.name)}">原尺寸 SVG</a></p></article>'
        content += '</div></section>'
    content += '<p>审核页用于比较本轮局部变化；尚未证明通用图与专用参考全面收敛。源码细节展开能力独立保留。</p></html>'
    (OUT / file).write_text(content)


if __name__ == '__main__':
    small, large = [json.loads((OUT / (k + '-report.json')).read_text()) for k in ['small', 'large']]
    def panels(row):
        result = []
        for r in row['results']:
            q = r['quality']
            result.append(('本轮前' if r['suffix'] == 'before' else '当前', OUT / r['svg'],
                f"{q['native_width_px']} × {q['native_height_px']} · {q['line_geometry']['crossings']} crossings · wire {q['wire_length']}"))
        return result
    reference = OUT / 'dedicated-reference.svg'
    reference.write_bytes((ROOT / 'verification/title-passages/current/dedicated-reference.svg').read_bytes())
    page('review.html', '通用布局：联合布线审核', [('同一语义折叠状态与专用参考', panels(large['rows'][0]) + [('专用详细图 · 01093cc06a87b35a', reference, '1600 × 2742 · 仅作为人工语义与版式参考')])])
    page('details-review.html', '联合布线：详图审核', [(r['name'], panels(r)) for r in large['rows'][1:]])
    page('generic-review.html', '联合布线：陌生与残缺图审核', [(r['name'], panels(r)) for r in small['rows'][:4]])
