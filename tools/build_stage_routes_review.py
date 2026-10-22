"""Display the immutable formal captures; never recompute their geometry."""
from html import escape
import xml.etree.ElementTree as ET
from check_stage_routes import ROOT, OUT, reports

ET.register_namespace('', 'http://www.w3.org/2000/svg')


def start(title):
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title><style>
body{{margin:22px;background:#eef2f7;color:#26344a;font:15px Arial,sans-serif;line-height:1.6}}h1{{font-size:25px}}h2{{font-size:20px}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}article{{background:white;border:1px solid #cbd4e1;border-radius:8px;padding:14px;overflow:hidden}}article svg{{width:100%;height:auto;display:block}}article h3{{margin:0 0 8px}}.metrics{{font:13px monospace}}section{{margin:25px 0}}nav{{display:flex;gap:25px;flex-wrap:wrap}}a{{color:#315e97}}.note{{padding:12px 18px;background:white;border-left:4px solid #6b83a8}}</style><h1>{title}</h1><p class="note">固定节点、物理端点、规范绑定与语义前沿。只有交叉和线长同时减少，且不损失已兑现的计算及摘要目标，才采用粗档局部捷径。</p><nav><a href="review.html">双目标</a><a href="route-review.html">实际线路改善</a><a href="expansion-review.html">摘要继续展开</a><a href="all-review.html">28 张正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''


def panel(file, title, metric='', reference=False):
    path = ROOT/'verification/generic-convergence/current'/file if reference else OUT/file
    svg = ET.parse(path).getroot()
    svg.set('width', '100%'); svg.set('height', 'auto')
    attr = '' if reference else f' data-artifact="{escape(file)}"'
    href = '../../generic-convergence/current/'+file if reference else file
    return f'<article{attr}><h3>{escape(title)}</h3><p class="metrics">{escape(metric)}</p>{ET.tostring(svg,encoding="unicode")}<a href="{escape(href)}">原尺寸 SVG</a></article>'


def capture(c, title):
    q = c['quality']
    return panel(c['svg'], title, f"{c['nodes']} 图元 · {c['edges']} 连接 · {q['native_width_px']} × {q['native_height_px']} · wire {q['wire_length']} · crossings {q['line_geometry']['crossings']}")


def pair(row):
    labels = ['38a2d66 · 改动前', '当前 · 相同前沿']
    if row['comparison'] == 'coarse-vs-open': labels = ['粗档摘要', '局部继续展开']
    return '<section><h2>'+escape(row['name'])+'</h2><div class="columns">'+''.join(capture(c,t) for c,t in zip(row['results'],labels))+'</div></section>'


if __name__ == '__main__':
    rows = [r for report in reports() for r in report['rows']]; by = {r['name']:r for r in rows}
    p = start('粗档线路：通用改善与 Transformer 双目标')
    p += '<h2>F0 对照专用完全折叠图</h2><p>本轮 Transformer 粗档 SVG 逐字节不变：28 图元／37 连接，848×1676，9 处交叉。整体比例、输入与上下文线路、说明密度仍有差距。</p><div class="columns">'
    p += panel('reference-collapsed.svg','专用参考 · 完全折叠','1600 × 1218',True)
    p += capture(by['Transformer-F0']['results'][1],'通用 F0 · 可继续展开')+'</div>'
    p += '<h2>F1 对照专用展开图</h2><p>三张固定细档 SVG 也逐字节不变。F1 是语义前沿，下面仍有更细源码事实。</p><div class="columns">'
    p += panel('reference-expanded.svg','专用参考 · 完全展开','1600 × 2742',True)
    p += capture(by['Transformer-F1-0']['results'][1],'通用 F1 · 主图')+'</div>'
    for i in [1,2]: p += pair(by[f'Transformer-F1-{i}'])
    p += '<p>本轮 1022 项测试及 28 张正式 SVG 独立审核通过。三种普通源码案例有局部线路收益；这不代表 Transformer 双目标已收敛。3371 节点／3663 边的规范源码投影仍保留，数千节点全量 SVG 性能尚未验证。</p></html>'
    (OUT/'review.html').write_text(p)
    p = start('通用粗档：固定端点的局部线路改善')
    p += '<p>没有移动节点，没有按模块名称选择布局。三种源码案例减少交叉和线长；状态、可变与未知边界仍保留。</p>'
    p += ''.join(pair(by[n]) for n in ['LayeredPatch','StatePatch','MutableShape'])+'</html>'
    (OUT/'route-review.html').write_text(p)
    (OUT/'route-compact.html').write_text(start('通用粗档：固定端点的局部线路改善')+'<style>article svg{height:400px}</style>'+pair(by['LayeredPatch'])+'</html>')
    p = start('粗档摘要下面继续保留计算与源码')
    p += '<p>实际编辑器验证 10 → 13 → 16 图元，保存重开仍为 16；切换源码层级并显示细节、展开全部后为 19 图元／19 连接。重新导入原粗档文档回到 10 图元。该小案例往返不替代 Transformer 双档联合交互验收。</p>'
    p += pair(by['SummarizedPatch-open'])+'</html>'
    (OUT/'expansion-review.html').write_text(p)
    (OUT/'all-review.html').write_text(start('28 张正式 SVG：实际文字与图元边界')+''.join(pair(r) for r in rows)+'</html>')
