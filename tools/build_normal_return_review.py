"""Build a review from the independently audited SVGs, including rejected work."""
import html
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ET.register_namespace('', 'http://www.w3.org/2000/svg')

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/normal-returns/current'
read = lambda p: json.loads(p.read_text())


def inline(file, crop=None):
    svg = ET.parse(OUT / file).getroot()
    if crop:
        svg.set('viewBox', ' '.join(map(str, crop)))
        svg.set('width', str(crop[2]));svg.set('height', str(crop[3]))
    svg.set('style', 'display:block;width:100%;height:auto')
    return ET.tostring(svg, encoding='unicode')


if __name__ == '__main__':
    audit = read(OUT / 'independent-report.json');assert audit['passed']
    main = next(r for r in audit['comparisons'] if r['name'] == 'Transformer-panel-0')
    docs = [read(OUT / ('Transformer-panel-0-' + s + '.layout.json')) for s in ['before', 'current']]
    normal = next(r for r in docs[1]['publication']['normal_returns']['rows'] if r['status'] == 'summary')
    crops = []
    for d in docs:
        p = next(p for p in d['layout']['nodes'] if p['id'] == normal['group'])
        owner = next(n['parent'] for n in d['architecture']['nodes'] if n['id'] == p['id'])
        frame = next(n for n in d['layout']['nodes'] if n['id'] == owner)
        top = max(frame['y'], p['y'] - 370)
        crops.append([frame['x'] - 18, top, frame['w'] + 36, p['y'] + p['h'] - top + 26])
    percentage = 100 * (main['before']['wire'] - main['current']['wire']) / main['before']['wire']
    def cards(name, crops=None):
        return '<div class="pair">' + ''.join('<section><h3>' + label + '</h3>' + inline(name + '-' + suffix + '.svg', crops[i] if crops else None) + '</section>'
            for i, (suffix, label) in enumerate([('before', '此前'), ('current', '当前')])) + '</div>'
    rows = ''.join('<tr><td>' + html.escape(r['name']) + '</td>' + ''.join('<td>' + str(r[s][k]) + '</td>' for k in ['nodes', 'edges', 'crossings', 'wire'] for s in ['before', 'current']) + '</tr>' for r in audit['comparisons'])
    content = '''<!doctype html><meta charset="utf-8"><title>正常返回摘要：通用证据与视觉审核</title>
<style>body{font:15px system-ui;margin:24px auto;padding:0 20px;max-width:1180px;color:#263647;background:#f5f7fa}h1{font-size:24px}h2{font-size:19px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}section{background:white;border:1px solid #d4dce6;padding:14px;border-radius:8px;overflow:hidden}h3{margin:0 0 12px}table{border-collapse:collapse;background:white;width:100%}td,th{padding:7px;border:1px solid #d4dce6;text-align:right}td:first-child{text-align:left}pre{white-space:pre-wrap;word-break:break-all;background:white;padding:12px}a{color:#235b9e}</style>
<h1>正常返回摘要：通用证据与视觉审核</h1>
<p>固定源码调用参数确定正常返回点时，闭合摘要突出该返回的依赖，其他源码返回路径仍可展开。动态条件、状态、未知边界保留原表达；几何退化的候选不采用。</p>
'''
    content += f'<p>Transformer 主图：{main["before"]["edges"]} → {main["current"]["edges"]} 条连线，线长减少 {percentage:.2f}%，交叉保持 {main["current"]["crossings"]}。这只是局部改善，整体仍未达到专用参考的组织效果。</p>'
    content += '<h2>主图局部：投影到返回</h2>' + cards('Transformer-panel-0', crops)
    content += '<details><summary>本次调用的返回证据及保留路径</summary><pre>' + html.escape(json.dumps(normal, ensure_ascii=False, indent=2)) + '</pre></details>'
    content += '<h2>陌生计算中的普通返回</h2>' + cards('Invocation-FixedReturn')
    content += '<h2>陌生计算中的元组返回</h2>' + cards('Invocation-FixedTuple')
    content += '<h2>未采用的元组顺序交换候选</h2><p>候选新增一次交叉且增加线长，正式结果保持此前 SVG。右侧显示未采用的试验。</p><div class="pair"><section><h3>正式结果（保持原图）</h3>' + inline('Invocation-FixedPair-current.svg') + '</section><section><h3>已拒绝候选</h3>' + inline('rejected-pair.svg') + '</section></div>'
    content += '<h2>全部审核状态</h2><table><tr><th>状态</th>' + ''.join('<th>' + k + s + '</th>' for k in ['节点', '连线', '交叉', '线长'] for s in ['旧', '新']) + '</tr>' + rows + '</table>'
    content += '<h2>全图与专用参考</h2><div class="pair"><section><h3>通用中间语义视图</h3><img style="width:100%" src="Transformer-panel-0-current.svg"></section><section><h3>专用参考</h3><img style="width:100%" src="../../title-passages/current/dedicated-reference.svg"></section></div>'
    content += '<p><a href="independent-report.json">独立审核记录</a> · <a href="small-report.json">小案例记录</a> · <a href="large-report.json">主图与详图记录</a></p>'
    (OUT / 'review.html').write_text(content)
