"""Build comparisons from actual SVG bytes, without redrawing the diagrams."""
import hashlib
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-path-stages/current'
read = lambda p: json.loads(p.read_text())
small, large = [read(OUT / (s + '-render-report.json')) for s in ['small', 'large']]
rows = small['rows'] + large['rows']
css = 'body{font-family:Arial,sans-serif;margin:24px;color:#293746;background:#f6f8fb}h1{font-size:22px}p{max-width:1100px;line-height:1.6}.grid{display:flex;gap:20px;align-items:flex-start}.panel{background:white;padding:14px;border:1px solid #ccd5e1;flex:1;min-width:0}.panel svg{width:100%;height:auto}a{color:#315c8a}section{margin:24px 0}h2{font-size:16px}'


def panel(name, file):
    return '<section class="panel" data-panel="' + html.escape(name) + '"><h2>' + html.escape(name) + '</h2>' + (OUT / file).read_text() + '</section>'


def page(file, title, body):
    (OUT / file).write_text('<!doctype html><meta charset="utf-8"><title>' + title + '</title><style>' + css + '</style><h1>' + title + '</h1>' + body)


page('review-prism.html', '陌生模型：摘要与两级展开', '<p>从左到右：基线、合组摘要、展开角色与 helper、继续展开 helper。每一步来自正式 SVG；增加展开层会增加容器和高度。</p><div class="grid">' + ''.join(panel(n, n + '.svg') for n in ['PrismPath-before', 'PrismPath-grouped', 'PrismPath-opened', 'PrismPath-detail']) + '</div>')
page('review-mixed.html', '混合结构：未知边界与状态接口', '<p>独立的已认证角色可以合组。未知调用、GRU 及隐藏状态接口保持原结构；这张图整体高度没有改善。</p><div class="grid">' + ''.join(panel(n, n + '.svg') for n in ['MixedPaths-before', 'MixedPaths-grouped']) + '</div>')

reference = read(ROOT / 'verification/role-operation-stages/current/visual-review.json')['reference']['file']
ref = ROOT / reference
ref_name = 'dedicated-reference.svg'
(OUT / ref_name).write_bytes(ref.read_bytes())
page('review-transformer.html', 'Transformer：通用状态与专用参考', '<p>左：冻结基线；中：角色与独占后续路径合组；右：专用参考。通用结果仍有固定调用参数、返回分支和内部路径；本轮不宣称整体已接近参考。</p><div class="grid">' + panel('通用基线', 'Transformer-before.svg') + panel('通用角色与路径合组', 'Transformer-grouped.svg') + panel('专用参考', ref_name) + '</div>')

crops = []
for suffix in ['before', 'grouped']:
    name = 'Transformer-' + suffix
    doc = read(OUT / (name + '.layout.json'))
    p = next(n for n in doc['layout']['nodes'] if n.get('semantic_type') == 'multihead-attention') if any(n.get('semantic_type') == 'multihead-attention' for n in doc['layout']['nodes']) else None
    if p is None:
        by = {n['id']: n for n in doc['architecture']['nodes']}
        p = next(n for n in doc['layout']['nodes'] if by[n['id']].get('contract_roles', {}).get('projections'))
    svg = (OUT / (name + '.svg')).read_text()
    box = [p['x'] - 12, p['y'] - 12, p['w'] + 24, p['h'] + 24]
    svg = re.sub(r'(<svg\b[^>]*?)viewBox="[^"]*"', lambda m: m[1] + 'viewBox="' + ' '.join(map(str, box)) + '"', svg, count=1)
    svg = re.sub(r'(<svg\b[^>]*?)width="[^"]*"', lambda m: m[1] + 'width="' + str(box[2]) + '"', svg, count=1)
    svg = re.sub(r'(<svg\b[^>]*?)height="[^"]*"', lambda m: m[1] + 'height="' + str(box[3]) + '"', svg, count=1)
    file = name + '-crop.svg'
    (OUT / file).write_text(svg)
    crops.append(dict(file=file, source=name + '.svg', box=box, node=p['id'], sha256=hashlib.sha256(svg.encode()).hexdigest()))
page('review-local.html', '实际角色与后续路径局部对照', '<p>投影及独占的 reshape、transpose、copy 路径合为一个可展开阶段。运算名称仍显示在摘要；参数、形状读取和原始切边保留在文档中。</p><div class="grid">' + panel('基线', crops[0]['file']) + panel('合组', crops[1]['file']) + '</div>')
(OUT / 'crop-report.json').write_text(json.dumps(dict(rows=crops), indent=2) + '\n')
links = [('review-prism.html', '陌生模型与两级展开'), ('review-mixed.html', '未知调用与状态混合'), ('review-local.html', 'Transformer 局部实际 SVG'), ('review-transformer.html', '全图与专用参考')]
page('review.html', '角色与独占后续路径：通用语义阶段审核', '<p>可选功能，默认关闭。规则依据角色证书、完整 helper 路径、独占使用及真实作用域；不读取模型名称、案例 ID、源码哈希或参考坐标。完整目标仍未完成。</p><ul>' + ''.join('<li><a href="' + f + '">' + t + '</a></li>' for f, t in links) + '</ul>')
ui = [f.name for f in OUT.glob('ui-*.svg') if 'refolded' not in f.name and 'reopened' not in f.name and '-raw.' not in f.name]
page('text-qa.html', '原生 SVG 文字检查', ''.join(panel(r['name'], r['svg']) for r in rows) + ''.join(panel(f, f) for f in ui))
print(json.dumps(dict(panels=len(rows), ui_panels=len(ui), reference=reference)))
