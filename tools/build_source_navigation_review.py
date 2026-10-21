"""Build a compact review from actual editor captures and independent evidence."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/source-navigation/current'


def build():
    report = json.loads((OUT / 'independent-report.json').read_text())
    assert report['passed']
    source = report['source']
    timing = report['cli_median_ms']
    page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>完整源码展开与图元定位审核</title>
<style>body{font:16px/1.6 system-ui;margin:24px;background:#f5f7fb;color:#293746}
main{max-width:1500px;margin:auto}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
section{min-width:0;background:white;padding:16px;border:1px solid #cbd5e1;margin:20px 0}
img{width:100%;height:auto;border:1px solid #e2e8f0}a{color:#175fc2}code{overflow-wrap:anywhere}
@media(max-width:850px){.grid{display:block}}</style><main>
<h1>从语义主图进入最细源码事实</h1>
<p>新增通用“查找当前图元”：按名称、模块路径和源码位置检索当前可见对象，以原始比例定位。
展开外框定位标题；查找仅改变镜头和证据面板。标题区域继续允许连线穿行，计算节点仍避让。</p>
<p><strong>本轮改善的是导航与验证覆盖。</strong>未新增语义推断或论文版式优化；整体目标仍未完成。</p>'''
    page += (f'<section><h2>完整源码的实际证据</h2><p>{source["nodes"]} 个节点 / '
             f'{source["edges"]} 条边，{source["orthogonal_segments"]} 段正交线，节点侵入为 0。'
             f'画布 {source["bounds"]["w"]} × {source["bounds"]["h"]} px。</p>'
             '<p>实际编辑器折叠后撤销，恢复 SVG 与基线逐字节相同；定位前后保存文档完全一致。'
             '三次 CLI 投影及路由的几何哈希相同。'
             f'本机 CLI 中位数：投影 {timing["project"]:.1f} ms，路由 {timing["route"]:.1f} ms。'
             '这些数值不代表浏览器渲染延迟。</p></section>')

    def capture(file, title, caption):
        return (f'<section><h2>{html.escape(title)}</h2><p>{html.escape(caption)}</p>'
                f'<a href="{file}"><img src="{file}" alt="{html.escape(title)}"></a></section>')

    page += '<div class="grid">'
    page += capture('before-browser.png', '全图缩放', '3371 个节点缩到一屏后几乎成为细线，不能据此检查细节。')
    page += capture('located-browser.png', '定位最细源码节点', '实际编辑器按 generator 定位底部节点，保持原始字号；整图和端口关系不变。')
    page += '</div><div class="grid">'
    page += capture('mixed-browser.png', '陌生计算与未知边界', 'MixedChoices 的 41 个节点 / 42 条边：定位 unfamiliar_bridge，opaque 及条件边界保留。')
    page += capture('main-browser.png', '返回中间语义主图', '65 个图元 / 76 条边：三个 query 按具体模块路径区分，主图 SVG 与上一轮逐字节一致。')
    page += '''</div><section><h2>可复核产物</h2><ul>
<li><a href="ui-source-before.svg">实际完整源码 SVG</a> · <a href="ui-source-restored.svg">撤销恢复 SVG</a>（大图，建议下载或使用编辑器定位）</li>
<li><a href="ui-main.svg">实际语义主图 SVG</a> · <a href="browser-navigation.json">真实浏览器记录</a></li>
<li><a href="source-saved.json.gz">实际保存文档</a> · <a href="source-after-saved.json.gz">定位后保存文档</a>（解压后可导入）</li>
<li><a href="source-routing-report.json">三次 CLI 报告</a> · <a href="independent-report.json">独立审核与文件哈希</a></li>
<li><a href="/semantic_studio/index.html">打开通用编辑器</a> · <a href="/verification/coincident-ports/current/transformer-review.html">语义主图与专用参考</a></li>
</ul><p>806 项既有测试通过。独立审核还拒绝了缺失节点、缺失边、错误端口说明、移动节点、同步篡改 SVG 与布局以侵入节点五种反例。</p>
<p>未认证全图所有边之间的交叉或整体可读性，未测量浏览器事件／绘制耗时与帧率，也未证明所有展示粒度的一次“展开全部”都暴露全部原始事实。阅读方向、长上下文路径和局部细节密度仍待改进。</p>
</section></main></html>'''
    (OUT / 'review.html').write_text(page)


if __name__ == '__main__':
    build()
