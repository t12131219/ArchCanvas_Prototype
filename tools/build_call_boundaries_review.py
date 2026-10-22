"""Show immutable actual captures; this tool never recomputes layout."""
from html import escape
import xml.etree.ElementTree as ET
from check_call_boundaries import ROOT, OUT, reports

ET.register_namespace('', 'http://www.w3.org/2000/svg')


def start(title):
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title><style>
body{{margin:22px;background:#eef2f7;color:#26344a;font:15px Arial,sans-serif;line-height:1.6}}h1{{font-size:25px}}h2{{font-size:20px}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}article{{background:white;border:1px solid #cbd4e1;border-radius:8px;padding:14px;overflow:hidden}}article svg{{width:100%;height:auto;display:block}}article h3{{margin:0 0 8px}}.metrics{{font:13px monospace}}section{{margin:25px 0}}nav{{display:flex;gap:25px;flex-wrap:wrap}}a{{color:#315e97}}.note{{padding:12px 18px;background:white;border-left:4px solid #6b83a8}}</style><h1>{title}</h1><p class="note">阶段概览可显式选择“调用边界”。仅折叠已检查源码读取 DAG 的内部说明，节点、连接和规范事实保留。边界摘要不等于内部依赖已经直接表达；继续双击可查看操作与绑定。默认仍为“运算与绑定”。</p><nav><a href="review.html">双目标</a><a href="boundary-review.html">通用案例与代价</a><a href="expansion-review.html">继续展开</a><a href="all-review.html">36 张正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''


def panel(file, title, metric='', reference=False):
    path = ROOT/'verification/generic-convergence/current'/file if reference else OUT/file
    svg = ET.parse(path).getroot()
    svg.set('width','100%'); svg.set('height','auto')
    attr = '' if reference else f' data-artifact="{escape(file)}"'
    href = '../../generic-convergence/current/'+file if reference else file
    return f'<article{attr}><h3>{escape(title)}</h3><p class="metrics">{escape(metric)}</p>{ET.tostring(svg,encoding="unicode")}<a href="{escape(href)}">原尺寸 SVG</a></article>'


def capture(c,title):
    q=c['quality']
    return panel(c['svg'],title,f"{c['nodes']} 图元 · {c['edges']} 连接 · {q['native_width_px']} × {q['native_height_px']} · wire {q['wire_length']} · crossings {q['line_geometry']['crossings']}")


def pair(row):
    labels={'evidence-vs-boundary':['运算与绑定','调用边界（显式选择）'],
            'boundary-vs-open':['调用边界','继续展开内部操作'],
            'same-state-regression':['015fd95 实际基线','当前 · 同一状态']}[row['comparison']]
    return '<section><h2>'+escape(row['name'])+'</h2><div class="columns">'+''.join(capture(c,t) for c,t in zip(row['results'],labels))+'</div></section>'


if __name__=='__main__':
    rows=[r for report in reports() for r in report['rows']]; by={r['name']:r for r in rows}
    p=start('调用边界折叠：Transformer 粗、细两档对照')
    p+='<h2>F0 对照专用完全折叠状态</h2><p>用户参考保留主要子模块、残差和上下文。通用概览仍需改善整体比例和跨区线路。本轮仅折叠两个源码读取 helper 的内部说明，未减少可见阶段。28 图元／37 连接，848×1676 → 848×1660，交叉 9→8，线长增加约 0.61%；这不是双目标已达标。</p><div class="columns">'
    p+=panel('reference-collapsed.svg','专用参考 · 完全折叠','1600 × 1218',True)
    p+=capture(by['Transformer-F0-boundary']['results'][1],'通用 F0 · 调用边界')+'</div>'
    p+=pair(by['Transformer-F0-boundary'])
    p+='<h2>F1 对照专用完全展开状态</h2><p>三张固定细档 SVG 逐字节不变。F1 下仍保留更细源码展开；此处并未宣称它等于规范图的最细状态。</p><div class="columns">'
    p+=panel('reference-expanded.svg','专用参考 · 完全展开','1600 × 2742',True)
    p+=capture(by['Transformer-F1-0']['results'][1],'通用 F1 · 主图')+'</div>'
    p+='<p>94 组／1031 项测试与 36 张正式 SVG 独立审核通过。3371 节点／3663 边的规范源码投影保留；数千节点全量 SVG 性能、最终 F0↔F1 控件联合往返及整体视觉收敛仍待验证。</p></html>'
    (OUT/'review.html').write_text(p)
    names=['ReadWorkshop','PairReads','SharedReadWorkshop','EscapingRead','InterruptedRead','ConditionalRead','MutableRead']
    p=start('通用调用边界：收益与几何代价')+'<p>按已证明的局部依赖选择规则，不按模型名称或参考坐标。EscapingRead 交叉 0→1、ConditionalRead 交叉 1→2，虽然图宽和线长减少。陌生、逃逸、条件、可变边界没有因此被隐藏。该模式保持可选，不替换默认摘要。</p>'
    (OUT/'boundary-review.html').write_text(p+''.join(pair(by[n]) for n in names)+'</html>')
    (OUT/'boundary-compact.html').write_text(start('通用调用边界：进一步折叠')+'<style>article svg{height:420px}</style>'+pair(by['ReadWorkshop'])+'</html>')
    p=start('调用边界下面继续保留内部操作与源码')+'<p>实际编辑器：9→12→16→19→23 图元。两处源码调用及其表达式分区分别展开；保存重开仍为同一 23 图元 SVG。切换源码层级、显示细节、展开全部：29 节点／30 边。原概览通过导入返回；摘要选择器本身也验证了边界→运算与绑定→边界的 SVG 一致性。这些普通案例证据不能替代 Transformer 最终双档联合验收。</p>'
    (OUT/'expansion-review.html').write_text(p+''.join(pair(by[n+'-open']) for n in ['ReadWorkshop','SharedReadWorkshop','PairReads'])+'</html>')
    (OUT/'all-review.html').write_text(start('36 张正式 SVG：实际文字与端口边界')+''.join(pair(r) for r in rows)+'</html>')
