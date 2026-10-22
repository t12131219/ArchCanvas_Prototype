"""Build dual-frontier and generalization reviews from actual audited SVGs."""
from html import escape
import xml.etree.ElementTree as ET
from check_read_binding_rows import ROOT, OUT, reports
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def start(title):
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{margin:24px;background:#eef2f7;color:#26344a;font:15px Arial,sans-serif;line-height:1.6}}h1{{font-size:26px}}h2{{font-size:20px}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}article{{background:white;border:1px solid #ccd5e2;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px}}article svg{{display:block;width:100%;height:auto}}.metrics{{font:13px monospace}}section{{margin:26px 0}}a{{color:#315e97}}nav{{display:flex;gap:22px;flex-wrap:wrap}}.note{{background:white;padding:12px 18px;border-left:4px solid #6b83a8}}</style>
<h1>{title}</h1><p class="note">F0 阶段概览接近专用完全折叠图；F1 角色与局部细节接近专用展开图。两者之下继续保留源码检查。本轮只改变同一依赖摘要的文字组织，通过实际测量决定是否采用。</p>
<nav><a href="review.html">Transformer 双目标</a><a href="mixed-review.html">通用组合与拒绝反例</a><a href="all-review.html">38 张正式 SVG</a><a href="independent-checks.json">独立审核</a></nav>'''


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
    labels = {'same-frontier-comparison': ('d62563a · 相同语义前沿', '当前 · 相同语义前沿'),
              'coarse-vs-helper-detail': ('折叠摘要 · 按算子打印输入使用', '手动展开 helper 和表达式'),
              'rejected-printing-candidate': ('自动保留原表示 · 高度 418', '强制候选供检查 · 高度 422，自动拒绝'),
              'same-state-regression': ('d62563a · 原状态', '当前 · SVG 逐字节相同')}
    return '<section><h2>' + escape(row['name']) + '</h2><div class="columns">' + ''.join(
        capture(c, title) for c, title in zip(row['results'], labels[row['comparison']])) + '</div></section>'


if __name__ == '__main__':
    allrows = [r for report in reports() for r in report['rows']]
    by = {r['name']: r for r in allrows}
    page = start('输入引用按算子呈现：折叠与展开双目标审核')
    page += '<h2>F0：阶段概览与专用完全折叠</h2><p>3 个注意力、2 个 FFN、5 个 Add & Norm 和重复调用范围保留。两张读取 helper 卡片改用逐算子输入引用，28 图元与 37 连接不变。输入槽、结果槽与读取节点身份不丢失。readN 只标识当前提取图中的读取节点，不证明运行时读取值相等。阅读方向、跨区上下文连线和整体比例仍不同于参考；未宣布双目标收敛完成。</p><div class="columns">'
    page += panel('reference-collapsed.svg', '专用参考 · 完全折叠', '23 nodes · 25 edges · 1600 × 1218', True)
    page += capture(by['Transformer-F0']['results'][1], '通用 F0 · 阶段概览 · 28 图元 / 37 连接') + '</div>'
    page += pair(by['Transformer-F0'])
    page += '<h2>F1：专用展开与通用细节图组</h2><p>本轮三张既有 F1 SVG 均逐字节不变。诊断记录增加可核查的替代文字计划，不应据 SVG 相同声称整个诊断文档相同。专用图末端 Softmax 是 Transformer.forward 之外的注释，不补成实际执行节点。</p><div class="columns">'
    page += panel('reference-expanded.svg', '专用参考 · 完全展开', '83 nodes · 85 edges · 1600 × 2742', True)
    page += capture(by['Transformer-F1-0']['results'][1], '通用 F1 · 主图') + '</div>'
    for i in [1, 2]: page += pair(by[f'Transformer-F1-{i}'])
    page += '<p>3371 节点 / 3663 边的原始源码投影完整；数千节点完整 SVG 的路由性能未验证。</p></html>'
    (OUT / 'review.html').write_text(page)
    mixed = start('通用依赖摘要：输入使用、继续展开与拒绝反例')
    mixed += '<p>10 个新物理源码入口覆盖共享中间结果、元组打包/getitem、长属性名、未知邻居、状态、条件、共享模块调用和未知调用链。不根据模型家族名选择。WideLabel 候选把高度增加 4px，自动保留原图。即使候选更像紧凑公式，也不放宽测量条件。</p>'
    mixed += ''.join(pair(r) for r in allrows if not r['name'].startswith('Transformer-')) + '</html>'
    (OUT / 'mixed-review.html').write_text(mixed)
    (OUT / 'all-review.html').write_text(start('38 张正式 SVG：逐节点、逐边与文本边界审核') + ''.join(pair(r) for r in allrows) + '</html>')
    overview = start('双目标审核 · 专用折叠参考与通用粗档')
    overview += '<style>.note,nav{display:none}article svg{height:510px;width:100%}</style><p>同一源码 · 核心阶段和真实调用保留 · 仍可展开 · 整体版式尚未收敛</p><div class="columns">'
    overview += panel('reference-collapsed.svg', '专用参考 · 完全折叠', '23 nodes / 25 edges · 1600 × 1218', True)
    overview += capture(by['Transformer-F0']['results'][1], '通用阶段概览 · 28 图元 / 37 连接')
    overview += '</div><p>本轮：相同前沿高度 1732 → 1700；交叉保持 9；线长 15898.3 → 15578.3。<a href="review.html">完整双目标对照</a></p></html>'
    (OUT / 'overview-review.html').write_text(overview)
    detail = start('通用摘要：使用关系清楚，内部仍可展开')
    detail += '<style>article svg{height:560px;width:100%}</style><p>左：每个结果只编号一次，两个乘法输入继续引用同一结果。右：双击 helper 与内部表达式后恢复实际算子和连接。read1 只表示已提取的读取节点，不说明运行时读取次数或值相等。</p>'
    detail += pair(by['ReusedWorkshop-open']) + '</html>'
    (OUT / 'helper-detail-review.html').write_text(detail)
