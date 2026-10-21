"""Present audited SVG bytes and focused views of shared output paths."""
from html import escape
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/shared-fanouts/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')

def inline(file,crop=None):
    svg=ET.parse(file).getroot();svg.set('width','100%');svg.set('height','auto')
    if crop:svg.set('viewBox',crop)
    return ET.tostring(svg,encoding='unicode')

def page(file,title,sections):
    html=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>同一输出值的多次使用可共用绘图通道；圆点明确标出同源分叉。每条原始边、独立端点和消费槽位保留。展开模块标题允许穿过，实际计算节点及无关模块主体仍需避让。</p>
<p>“可见线条长度”按同源重合段只计一次；“逐边累计线长”逐条计算全部路径。保留分散端点会增加后者，两项分别报告。</p>
<nav><a href="review.html">主图局部</a><a href="transformer-review.html">主图与专用参考</a><a href="generic-review.html">陌生源程序</a><a href="all-review.html">全部状态</a><a href="independent-checks.json">独立审核</a></nav>'''
    for label,panels in sections:
        html+=f'<section><h2>{escape(label)}</h2><div class="columns" style="--columns:{len(panels)}">'
        for title,source,metrics,crop in panels:
            html+=f'<article data-artifact="{escape(source.name)}"><h3>{escape(title)}</h3><p class="metrics">{escape(metrics)}</p>{inline(source,crop)}<a href="{escape(source.name)}">原尺寸 SVG</a></article>'
        html+='</div></section>'
    html+='<p>这是通用分叉布局的增量改进；模块组织与专用参考的整体收敛仍未完成。原始源码可继续展开。</p></html>'
    (OUT/file).write_text(html)

if __name__=='__main__':
    small=json.loads((OUT/'small-report.json').read_text())['rows']
    large=[] if '--small' in sys.argv else [json.loads((OUT/f'Transformer-panel-{i}-report.json').read_text())['rows'][0]for i in range(3)]
    checks=json.loads((OUT/'independent-checks.json').read_text());by={r['name']:r for r in checks['rows']}
    def panels(row,crop=None):
        result=[];rec=by[row['name']]
        for r in row['results']:
            q=r['quality'];metrics=f"{q['native_width_px']} × {q['native_height_px']} · crossings {q['line_geometry']['crossings']} · Σ wire {q['wire_length']}"
            if r['suffix']=='current':metrics+=f" · ink saved {rec['visible_ink_saved']:.1f} · groups {rec['shared_groups']}"
            result.append(('本轮前'if r['suffix']=='before'else'当前',OUT/r['svg'],metrics,crop))
        return result
    if large:
        page('review.html','同源分叉：共享绘图通道审核',[("主图第一组：独立端点 → 同源主干",panels(large[0],'175 620 770 590')),("主图第二组",panels(large[0],'1135 620 770 590'))])
        reference=OUT/'dedicated-reference.svg';reference.write_bytes((ROOT/'verification/residual-bands/current/dedicated-reference.svg').read_bytes())
        page('transformer-review.html','通用语义状态与专用参考',[(large[0]['name'],panels(large[0])+[('专用详细参考 · 01093cc06a87b35a',reference,'1600 × 2742 · 人工语义与版式参考',None)])]+[(r['name'],panels(r))for r in large[1:]])
    page('generic-review.html','同源分叉：陌生及边界组合',[(r['name'],panels(r))for r in small if 'Distribution'in r['name']])
    page('all-review.html','同源分叉：全部正式对照',[(r['name'],panels(r))for r in large+small])
