"""Present measured and rejected layouts beside source-identical figures."""
from pathlib import Path
import hashlib
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/invocation-inputs/current'
read = lambda f: json.loads((OUT/f).read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
esc = html.escape
report = read('render-report.json')
rows = {r['name']: r for r in report['rows']}
style = '''body{font:16px Arial,"Noto Sans SC",sans-serif;color:#293746;margin:24px}h1{font-size:25px}p{line-height:1.6}.panels{display:grid;grid-template-columns:repeat(3,minmax(300px,1fr));gap:16px}article{border:1px solid #c8d2dc;padding:12px;overflow:auto}article svg{display:block;width:100%;height:auto;margin:auto}article h3{font-size:17px}a{color:#2168a0}.native article{margin:16px 0}.native article svg{width:auto;max-width:none;margin:0}'''
header = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>固定调用参数的语义与布局审核</title><meta name="inline-render-report-sha256" content="'+sha(OUT/'render-report.json')+'"><style>'+style+'</style>'
def card(name, title=None):
    row = rows[name]
    q = row['quality']
    return '<article data-case="'+esc(name)+'"><h3>'+esc(title or name)+'</h3><p>'+str(row['nodes'])+' 图元 · '+str(row['edges'])+' 边 · '+str(q['native_width_px'])+'×'+str(q['native_height_px'])+' px · '+str(q['line_geometry']['crossings'])+' 交叉</p>'+(OUT/row['svg']).read_text()+'</article>'

lead = '<h1>固定调用参数：明确数值，按实际几何选择位置</h1><p>只依据本次源码调用的字面值证据；每个原输入节点与真实使用边仍保留，动态覆盖、条件、状态和未知边界继续独立。标题旁布局需要与同一语义前沿比较后采用。</p><p>下列陌生案例的标题布局因交叉或面积增加被拒绝，当前主图仍显示明确的参数值。第三栏保留实测被拒绝候选，便于审核选择依据。</p>'
if (OUT/'adaptive-report.json').exists():
    adaptive = read('adaptive-report.json')
    if adaptive['terminal']:
        lead += '<p>完整默认自适应 CLI 计算已成功结束：'+str(round(adaptive['current']['elapsed_ms']/1000,3))+' 秒，'+str(adaptive['current']['nodes'])+' 图元、'+str(adaptive['current']['edges'])+' 边。最终默认图与固定角色图相同；没有宣称浏览器延迟或整体视觉收敛已经达标。</p>'
local = ''.join('<h2>'+esc(name)+'</h2><div class="panels">'+card(name+'-before','冻结旧实现')+card(name+'-current','当前默认选择')+card(name+'-header-trial','被拒绝：强制标题布局')+'</div>' for name in ['BoundCalls','OptionalUnknown','WideBindings'])
reference = 'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
transformer = '<h2>Transformer：通用中间状态与专用展开参考</h2><p>专用图仅作评价参考。当前通用状态下仍有更细计算可展开，未知边界、条件和参数节点未因视觉相似被删除。</p><div class="panels">'+card('Transformer-fixed-before','通用 · 冻结旧实现')+card('Transformer-fixed-current','通用 · 当前固定粒度')+'<article><h3>专用展开参考 · 01093cc06a87b35a</h3>'+(ROOT/reference).read_text()+'</article></div>'
current = read('Transformer-fixed-current.layout.json')
fixed = current['publication'].get('invocation_inputs', {}).get('rows', [])
if fixed:
    owner = fixed[0]['source_parent']
    crops = []
    for version in ['before','current']:
        doc = read('Transformer-fixed-'+version+'.layout.json')
        pos = next(n for n in doc['layout']['nodes'] if n['id'] == owner)
        svg = (OUT/('Transformer-fixed-'+version+'.svg')).read_text()
        svg = re.sub(r'viewBox="[^"]+"', f'viewBox="{pos["x"]-24} {pos["y"]-24} {pos["w"]+48} {pos["h"]+48}"', svg, count=1)
        svg = re.sub(r'width="[^"]+" height="[^"]+"', f'width="{pos["w"]+48}px" height="{pos["h"]+48}px"', svg, count=1)
        file = 'Transformer-local-'+version+'.svg'
        (OUT/file).write_text(svg)
        crops.append('<article><h3>同一源码调用 · '+version+'</h3>'+svg+'</article>')
    transformer += '<h2>同一调用区域的实际 SVG 截面</h2><div class="panels">'+''.join(crops)+'</div>'
(OUT/'review.html').write_text(header+lead+local+transformer+'<p><a href="text-qa.html">实际 SVG 原生文字审核</a> · <a href="render-report.json">测量记录</a> · <a href="adaptive-report.json">完整默认自适应记录</a></p></html>')
native = ''.join(card(name) for name in rows)
for name in ['planned','folded','raw']:
    native += '<article data-case="ui-'+name+'"><h3>实际编辑器 · '+name+'</h3>'+(OUT/('ui-'+name+'.svg')).read_text()+'</article>'
(OUT/'text-qa.html').write_text(header+'<body class="native"><h1>原生比例：文字边界检查</h1>'+native+'</body></html>')
(OUT/'reference-report.json').write_text(json.dumps({'render_report_sha256':sha(OUT/'render-report.json'),'reference_only':True,'references_sha256':{reference:sha(ROOT/reference)},'crops':{p.name:sha(p) for p in OUT.glob('Transformer-local-*.svg')}},indent=2)+'\n')
print(json.dumps({'panels':len(rows),'native_with_ui':len(rows)+3}))
