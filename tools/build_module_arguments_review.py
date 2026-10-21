"""Build visual and native-text comparison pages from actual SVGs."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/module-arguments/current'

if __name__ == '__main__':
    reports = [json.loads((OUT / (s + '-report.json')).read_text()) for s in ['small', 'large']]
    rows = {r['name']: r for report in reports for r in report['rows']}
    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>模块实参的通用语义摘要审核</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}</style>'
    intro = '<h1>把已证明的模块实参放回消费者摘要</h1><p>左：2213a19；右：当前。框中的 Module arg 仅表示传入该模块引用及其构造配置，不表示执行、透明性或参数共享。展开消费者会恢复原始引用、接口和绑定边；共享、条件、未知构造保持原有表达。规则不依据模型或案例名称。</p>'
    def panel(name, native=False):
        r = rows[name]; q = r['quality']
        return '<section data-panel="' + name + '"><h3>' + html.escape(name) + '</h3><p>' + str(r['nodes']) + ' 图元 · ' + str(q['line_geometry']['crossings']) + ' 交叉 · 线长 ' + str(q['wire_length']) + ' · ' + str(q['native_width_px']) + '×' + str(q['native_height_px']) + '</p><div class="' + ('native' if native else 'fit') + '">' + (OUT / r['svg']).read_text() + '</div></section>'
    page = head + intro
    for report in reports:
        for c in report['comparisons']:
            page += '<h2>' + html.escape(c['name']) + '</h2><div class="grid">' + panel(c['before']) + panel(c['after']) + '</div>'
    (OUT / 'review.html').write_text(page + '</html>')
    (OUT / 'text-qa.html').write_text(head + '<h1>正式 SVG 原生文字检查</h1>' + ''.join(panel(name, True) for name in rows) + '</html>')
    for name in ['SuppliedCurve', 'UnusedCurve', 'MixedSuppliers']:
        (OUT / (name + '-review.html')).write_text(head + intro + '<div class="grid">' + panel(name + '-before') + panel(name + '-current') + '</div><h2>展开消费者后恢复引用及原始接口</h2>' + panel(name + '-opened') + '</html>')
    (OUT / 'main-review.html').write_text(head + intro + '<div class="grid">' + panel('Transformer-panel-0-before') + panel('Transformer-panel-0-current') + '</div></html>')
    (OUT / 'transformer-review.html').write_text(head + '<h1>通用中间语义状态与专用展开参考</h1><p>更细的操作和源码仍保留。阅读方向、阶段分组及长上下文路径仍有差异，整体目标尚未完成。</p><div class="grid">' + panel('Transformer-panel-0-current') + '<section><h3>专用展开参考</h3><div class="fit"><img src="/verification/title-passages/current/dedicated-reference.svg" alt="专用参考"></div></section></div><h2>当前细节状态</h2>' + panel('Transformer-panel-1-current') + panel('Transformer-panel-2-current') + '</html>')
