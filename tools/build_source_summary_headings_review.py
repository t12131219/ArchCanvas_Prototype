"""Review actual formal SVGs, retaining source coordinates and geometry."""
from html import escape
import xml.etree.ElementTree as ET
from check_source_summary_headings import ROOT, OUT, reports
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def start(title):
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title><style>
body{{margin:22px;background:#eef2f7;color:#26344a;font:15px Arial,sans-serif;line-height:1.6}}h1{{font-size:25px}}h2{{font-size:20px}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}article{{background:white;border:1px solid #cbd4e1;border-radius:8px;padding:14px;overflow:hidden}}article svg{{width:100%;height:auto;display:block}}article h3{{margin:0 0 8px}}.metrics{{font:13px monospace}}section{{margin:25px 0}}nav{{display:flex;gap:25px;flex-wrap:wrap}}a{{color:#315e97}}.note{{padding:12px 18px;background:white;border-left:4px solid #6b83a8}}</style><h1>{title}</h1><p class="note">通用规则只以源码名标识调用，不据名称认证模型语义。结果、操作数、读取与调用身份继续显示；实际尺寸、线长、字号和冲突不退化才采用。</p><nav><a href="review.html">折叠／展开双目标</a><a href="heading-review.html">本轮标题对照</a><a href="mixed-review.html">陌生组合与长名称拒绝</a><a href="all-review.html">28 张实际 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''


def panel(file, title, metric='', reference=False, crop=None):
    path = ROOT/'verification/generic-convergence/current'/file if reference else OUT/file
    svg = ET.parse(path).getroot()
    svg.set('width','100%'); svg.set('height','auto')
    if crop: svg.set('viewBox',crop)
    data = '' if reference else f' data-artifact="{escape(file)}"'
    href = '../../generic-convergence/current/'+file if reference else file
    return f'<article{data}><h3>{escape(title)}</h3><p class="metrics">{escape(metric)}</p>{ET.tostring(svg,encoding="unicode")}<a href="{escape(href)}">原尺寸 SVG</a></article>'


def capture(c,title,crop=None):
    q=c['quality']
    return panel(c['svg'],title,f"{q['native_width_px']} × {q['native_height_px']} · wire {q['wire_length']} · crossings {q['line_geometry']['crossings']}",crop=crop)


def pair(row):
    return '<section><h2>'+escape(row['name'])+'</h2><div class="columns">'+''.join(capture(c,t) for c,t in zip(row['results'],['6884dc1 · 原状态','当前 · 同一前沿（或显式展开）']))+'</div></section>'


if __name__=='__main__':
    rows=[r for report in reports() for r in report['rows']]; by={r['name']:r for r in rows}
    p=start('通用语义摘要：折叠与展开双目标')
    p+='<h2>F0：专用完全折叠与通用阶段概览</h2><p>通用粗档保持 28 图元／37 连接、848×1676、9 处交叉。两处 position 调用保留源码标题，原四步计算及共享调用身份仍可核对。当前整体比例、阅读方向、输入线路和说明密度仍与专用图有差距。</p><div class="columns">'
    p+=panel('reference-collapsed.svg','专用参考 · 完全折叠','1600 × 1218',True)
    p+=capture(by['Transformer-F0']['results'][1],'通用 F0 · 阶段概览')+'</div>'
    p+='<h2>F1：细档继续保留</h2><p>三张既有 F1 SVG 逐字节不变。F1 下面仍可继续展开源码节点；它不是系统的最细档位。</p><div class="columns">'
    p+=panel('reference-expanded.svg','专用参考 · 完全展开','1600 × 2742',True)
    p+=capture(by['Transformer-F1-0']['results'][1],'通用 F1 · 主图')+'</div>'
    for i in [1,2]:p+=pair(by[f'Transformer-F1-{i}'])
    p+='<p>原始 Transformer 源码投影仍为 3371 节点／3663 边；数千节点的全量 SVG 性能未验证。双目标尚未完成。</p></html>'
    (OUT/'review.html').write_text(p)
    focus=start('源码标题保留 · 同一真实计算与相同布局')
    focus+='<p>下面只改变实际 SVG 的阅读窗口，不移动图元。position 是源码调用标识；Dropout 和四步绑定仍以真实抽取内容显示。</p><div class="columns">'
    focus+=''.join(capture(c,t,'32 260 848 370') for c,t in zip(by['Transformer-F0']['results'],['原：结果作为标题','当前：源码名作为标题']))+'</div>'
    focus+='<p>原始尺寸 848×1676、线长 15059.3、9 处交叉均不变。其他操作、两档边界和更深源码保持。</p></html>'
    (OUT/'heading-review.html').write_text(focus)
    overview=start('F0 粗档 · 专用折叠参考与通用阶段概览')
    overview+='<style>article svg{height:430px}.note,nav{display:none}</style><p>同一源码；通用图保留进一步展开。当前 28 图元／37 连接，848×1676；整体比例和线路组织仍待收敛。</p><div class="columns">'
    overview+=panel('reference-collapsed.svg','专用参考 · 完全折叠','1600 × 1218',True)
    overview+=capture(by['Transformer-F0']['results'][1],'通用 F0 · 两处源码标题已恢复')+'</div></html>'
    (OUT/'overview-review.html').write_text(overview)

    (OUT/'mixed-review.html').write_text(start('陌生源码组合与长名称反例')+''.join(pair(r) for r in rows if not r['name'].startswith('Transformer'))+'</html>')
    (OUT/'all-review.html').write_text(start('28 张正式 SVG：文本、图元和端口审核')+''.join(pair(r) for r in rows)+'</html>')
