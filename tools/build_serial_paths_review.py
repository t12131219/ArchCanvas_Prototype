"""Show actual paired SVGs, native text and progressive local expansion."""
import hashlib
import html
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/serial-paths/experiment'
r = json.loads((OUT / 'render-report.json').read_text())
digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
head = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="inline-render-report-sha256" content="{digest}"><title>通用长路径摘要与可逆展开审核</title><style>body{{font:16px Arial;color:#293746;margin:24px;line-height:1.6}}h1{{font-size:25px}}h2{{font-size:19px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}article{{padding:16px;border:1px solid #b9c7d4;margin:12px 0;overflow:auto}}.fit svg{{width:100%;height:auto}}.native svg{{max-width:none}}.note{{padding:14px;background:#fff3d4}}.first .fit{{max-height:900px;overflow:auto}}.first .fit svg{{width:230px;max-width:100%;height:auto;display:block;margin:0 auto}}table{{border-collapse:collapse}}td,th{{padding:7px 14px;border:1px solid #b9c7d4}}</style>'''
page = head + '<h1>通用长路径摘要与可逆展开</h1><p class="note">连续同类操作仅压缩调用次数说明；每次调用、操作数、配置和源码边界保持独立。通用 Stage 外框不会阻断已有证据支持的串联路径。未知、状态、条件与中间结果逃逸仍受保护。完整 Transformer 自适应对照仍在原进程中；这里的 Transformer-fixed 仅验证固定策略。</p>'
page += '<h2>LongCurve：同一事实图，14 次调用完整保留</h2><div class="grid first">'
for row in [x for x in r['rows'] if x['case'] == 'LongCurve' and x['variant'] in ['before','current']]:
    q = row['quality']
    page += f'<article><h2>{row["variant"]} · {row["nodes"]} 图元 · {q["native_height_px"]}px 高</h2><div class="fit">'+(OUT / row['svg']).read_text()+'</div></article>'
page += '</div>'
page += '<h2>实际输出尺寸</h2><table><tr><th>案例</th><th>图元数（前 → 后）</th><th>高度 px（前 → 后）</th><th>交叉数（前 → 后）</th></tr>'
for c in r['comparisons']:
    page += f'<tr><td>{html.escape(c["name"])}</td><td>{c["before"]["nodes"]} → {c["current"]["nodes"]}</td><td>{c["before"]["height"]} → {c["current"]["height"]}</td><td>{c["before"]["crossings"]} → {c["current"]["crossings"]}</td></tr>'
page += '</table>'
native = head + '<h1>实际 SVG 原生文字审核</h1>'
for c in r['comparisons']:
    page += '<h2>' + html.escape(c['name']) + '</h2><div class="grid">'
    for row in [x for x in r['rows'] if x['case'] == c['name'] and x['variant'] in ['before','current']]:
        svg = (OUT / row['svg']).read_text(); q=row['quality']
        title = f'{row["variant"]} · {row["nodes"]} 图元 / {row["edges"]} 边 · {q["native_width_px"]} × {q["native_height_px"]} px'
        page += '<article><h2>'+title+'</h2><div class="fit">'+svg+'</div></article>'
    page += '</div>'
for row in r['rows']:
    svg=(OUT / row['svg']).read_text()
    native += '<article class="native" data-case="'+row['name']+'"><h2>'+row['name']+'</h2>'+svg+'</article>'
page += '<h2>同一事实图的逐步展开</h2><div class="grid">'
for row in [x for x in r['rows'] if x['case']=='LongCurve' and x['variant'] in ['frame','operations']]:
    page += '<article><h2>'+row['variant']+' · '+str(row['nodes'])+' 图元</h2><div class="fit">'+(OUT / row['svg']).read_text()+'</div></article>'
page += '</div><p>图元减少不等于事实删除；原始 IR、精确连接及全部调用身份均在独立审核范围内。此项进展不代表专用参考的整体语义和版式收敛已完成。</p>'
(OUT / 'review.html').write_text(page + '</html>')
(OUT / 'text-qa.html').write_text(native + '</html>')
print(json.dumps({'svg_panels':len(r['rows']), 'render_report_sha256':digest}))
