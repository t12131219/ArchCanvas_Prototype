"""Build dual-frontier and generalization reviews from actual audited SVGs."""
from html import escape
import xml.etree.ElementTree as ET
from check_stage_exit_paths import ROOT, OUT, reports
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def start(title):
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{margin:24px;background:#eef2f7;color:#26344a;font:15px Arial,sans-serif;line-height:1.6}}h1{{font-size:26px}}h2{{font-size:20px}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}article{{background:white;border:1px solid #ccd5e2;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px}}article svg{{display:block;width:100%;height:auto}}.metrics{{font:13px monospace}}section{{margin:26px 0}}a{{color:#315e97}}nav{{display:flex;gap:22px;flex-wrap:wrap}}.note{{background:white;padding:12px 18px;border-left:4px solid #6b83a8}}</style>
<h1>{title}</h1><p class="note">F0 阶段概览接近专用完全折叠图；F1 角色与局部细节接近专用展开图。两者之下继续保留源码检查。本轮只调整单一展开区域的真实出口与后续节点的几何对齐；完整渲染后线长更短，且不增高、不增宽、不增加冲突才采用。</p>
<nav><a href="review.html">Transformer 双目标</a><a href="mixed-review.html">通用组合与拒绝反例</a><a href="all-review.html">26 张正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''


def panel(file, title, metric='', reference=False):
    path = ROOT / 'verification/generic-convergence/current' / file if reference else OUT / file
    svg = ET.parse(path).getroot()
    svg.set('width', '100%'); svg.set('height', 'auto')
    href = '../../generic-convergence/current/' + file if reference else file
    data = '' if reference else f' data-artifact="{escape(file)}"'
    return f'<article{data}><h3>{escape(title)}</h3><p class="metrics">{escape(metric)}</p>{ET.tostring(svg, encoding="unicode")}<a href="{escape(href)}">原尺寸 SVG</a></article>'


def capture(c, title):
    q = c['quality']
    return panel(c['svg'], title, f"{q['native_width_px']} × {q['native_height_px']} · crossings {q['line_geometry']['crossings']} · wire {q['wire_length']}")


def pair(row):
    labels = {'same-frontier-comparison': ('bb45fd8 · 相同语义前沿', '当前 · 完整渲染后选择'),
              'coarse-vs-region-detail': ('阶段概览 · 可继续展开', '展开内部残差计算区域'),
              'same-state-regression': ('bb45fd8 · 原状态', '当前 · SVG 逐字节相同')}
    return '<section><h2>' + escape(row['name']) + '</h2><div class="columns">' + ''.join(
        capture(c, title) for c, title in zip(row['results'], labels[row['comparison']])) + '</div></section>'


if __name__ == '__main__':
    allrows = [r for report in reports() for r in report['rows']]
    by = {r['name']: r for r in allrows}
    page = start('阶段出口对齐：折叠与展开双目标审核')
    page += '<h2>F0：阶段概览与专用完全折叠</h2><p>通用 F0 保留 28 图元 / 37 连接和原有语义前沿，只将 generator 与 return 对齐到实际输出区域。高度 1700 → 1676，线长 15578.3 → 15059.3；交叉保持 9。三处注意力、两处 FFN、五处 Add & Norm、重复范围和跨区上下文保留。它仍与专用图在阅读方向、输入线路、整体比例和注释密度上存在差距。</p><div class="columns">'
    page += panel('reference-collapsed.svg', '专用参考 · 完全折叠', '23 nodes / 25 edges · 1600 × 1218', True)
    page += capture(by['Transformer-F0']['results'][1], '通用 F0 · 阶段概览') + '</div>'
    page += pair(by['Transformer-F0'])
    page += '<h2>F1：专用展开与通用细节图组</h2><p>三张既有 F1 SVG 均逐字节不变。专用图的 Softmax outside Transformer.forward 是说明，不补成执行节点。两档之下均保留更细的源码检查，不把 F1 当作通用系统的最细展开。</p><div class="columns">'
    page += panel('reference-expanded.svg', '专用参考 · 完全展开', '83 nodes / 85 edges · 1600 × 2742', True)
    page += capture(by['Transformer-F1-0']['results'][1], '通用 F1 · 主图') + '</div>'
    for i in [1,2]: page += pair(by[f'Transformer-F1-{i}'])
    page += '<p>3371 节点 / 3663 边的原始源码投影完整；数千节点完整 SVG 的路由性能未验证。F0/F1 的最终视觉收敛仍未完成。</p></html>'
    (OUT / 'review.html').write_text(page)
    mixed = start('通用出口路径：陌生组合、保留边界与拒绝候选')
    mixed += '<p>7 个新物理源码入口覆盖不同深度的分支计算、未解析输出、多来源汇合、条件、状态、共享调用和可变使用。单一来源的正常与未知输出均可对齐；多来源、状态及可变使用保留原布局。条件邻居的候选没有最终收益，自动拒绝。没有模型家族名或参考坐标参与生产决策。</p>'
    mixed += ''.join(pair(r) for r in allrows if not r['name'].startswith('Transformer-')) + '</html>'
    (OUT / 'mixed-review.html').write_text(mixed)
    (OUT / 'all-review.html').write_text(start('26 张正式 SVG：实际图元、精确连接与文本审核') + ''.join(pair(r) for r in allrows) + '</html>')
    overview = start('双目标审核 · 专用折叠参考与通用阶段概览')
    overview += '<style>.note,nav{display:none}article svg{height:510px;width:100%}</style><p>同一源码 · 核心阶段保留 · 两档均可进一步展开 · 整体版式仍待收敛</p><div class="columns">'
    overview += panel('reference-collapsed.svg', '专用参考 · 完全折叠', '23 nodes / 25 edges · 1600 × 1218', True)
    overview += capture(by['Transformer-F0']['results'][1], '通用 F0 · 阶段概览 · 28 图元 / 37 连接')
    overview += '</div><p>本轮：输出链沿真实出口对齐；高度 1700 → 1676；交叉保持 9；线长减少约 3.3%。<a href="review.html">完整双目标对照</a></p></html>'
    (OUT / 'overview-review.html').write_text(overview)
    focus = start('真实出口对齐 · 同一语义前沿的局部对照')
    focus += '<p>只裁取实际 SVG 底部作阅读窗口；图元坐标、文字和路径均来自正式产物。左：输出链偏在左边。右：沿真实来源向下读取。原始 SVG 保持完整。</p><div class="columns">'
    for capture_row, title in zip(by['Transformer-F0']['results'], ['改动前 · 输出链在左侧', '当前 · 跟随真实区域出口']):
        svg = ET.parse(OUT / capture_row['svg']).getroot()
        x,y,w,h = map(float, svg.get('viewBox').split())
        svg.set('viewBox', f'{x} {y+h-410} {w} 410')
        svg.set('width', '100%'); svg.set('height', 'auto')
        focus += '<article><h3>'+title+'</h3>'+ET.tostring(svg, encoding='unicode')+'</article>'
    focus += '</div><p>28 图元 / 37 连接不变；高度 1700 → 1676；线长 15578.3 → 15059.3；交叉保持 9。<a href="review.html">专用折叠/展开双目标完整对照</a></p></html>'
    (OUT / 'outlet-review.html').write_text(focus)
