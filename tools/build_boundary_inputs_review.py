"""Display measured native SVGs, including rejected and explicit candidates."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/boundary-inputs/current'
if __name__ == '__main__':
    reports = [json.loads((OUT / (s + '-report.json')).read_text()) for s in ['small', 'large']]
    audit = json.loads((OUT / 'independent-report.json').read_text())
    rows = {r['name']: r for report in reports for r in report['rows']}

    def panel(name, title=None, native=False):
        r = rows[name]
        q = r['quality']
        return ('<section data-panel="' + name + '"><h3>' + html.escape(title or name) + '</h3><p>' +
                f"{r['nodes']} 节点 · {q['native_width_px']} × {q['native_height_px']} px · {q['line_geometry']['crossings']} 交叉 · 线长 {q['wire_length']} · 问题 {html.escape(str(q['issues']))}" +
                '</p><div class="' + ('native' if native else 'fit') + '">' + (OUT / r['svg']).read_text() + '</div></section>')

    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>条件与未知边界的输入布局</title><style>body{font:16px system-ui;margin:24px;background:#f5f7fb;color:#293746}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{background:white;border:1px solid #bdc9d5;padding:14px;min-width:0;margin-bottom:20px}.fit svg{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}h2{margin-top:36px}.note{padding:16px;background:#fff3d4}</style>'
    intro = '<h1>条件与未知边界：保留真实连接的输入布局</h1><p>沿可见数据依赖就近放置原有输入端点，仍处于接收区域之外。允许连接到条件或未知边界，禁止跨越受保护内部；条件、调用、操作数和源码归属保持。</p><p class="note">自动选择沿用原有门槛：线长至少减少 10%，宽度/面积最多增加 12%，高度、交叉、接触与失败路由不得增加。显式对照不代表自动选中。两张 UnknownBraided 图仍有端口标签附注问题，保留原始报告；本阶段未完成整个目标。</p>'
    page = head + intro
    for c in reports[0]['comparisons']:
        page += '<h2>' + html.escape(c['name']) + '</h2><p>' + ('显式布局对照：自动候选因宽度代价被拒绝。未知调用本身仍可见。' if c.get('explicit') else '自动选择：' + ('接受' if c.get('receipt', {}) and c['receipt']['accepted'] else '保留原布局')) + '</p><div class="grid">' + panel(c['before']) + panel(c['after']) + '</div>'
    (OUT / 'review.html').write_text(page + '</html>')
    joint = reports[1]['joint']
    previous = joint['initial_panels'][1]['capture']
    current = joint['panels'][1]['capture']
    historical = audit['historical']
    page = head + '<h1>Transformer：同一详图的进一步展开</h1><p>通用规则接受了此前因连线代价落选的嵌套角色层。主图和另一个实例详图保留，图组直接目标 ' + str(audit['joint']['before']) + ' → ' + str(audit['joint']['after']) + '，原有直接目标无丢失。</p><p class="note">相对历史图组 ' + str(historical['direct']) + ' 个直接目标，当前仍缺少 ' + str(len(historical['missing'])) + ' 个历史目标。该对照验证三张图已满时的一次通用原位细化，尚非完整专用图收敛；数千节点整体路由和浏览器交互仍待验收。</p><div class="grid">' + panel(previous, '展开前') + panel(current, '继续展开后') + '</div><h2>当前图组</h2><div class="grid">' + ''.join(panel(p['capture'], '主图' if p['id']=='main' else '具体实例详图') for p in joint['panels']) + '</div>'
    (OUT / 'transformer-review.html').write_text(page + '</html>')
    (OUT / 'text-qa.html').write_text(head + '<h1>所有实际 SVG 的原生文字审核</h1>' + ''.join(panel(name, native=True) for name in rows) + '</html>')
