"""Show saved SVGs directly, with the dedicated pair as visual references."""
import html
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'verification/path-rows/current'


def main():
    suite = json.loads((OUT / 'suite-report.json').read_text())
    rows = {r['name']: r for r in suite['rows']}
    style = '<style>body{margin:18px;color:#24354a;background:#edf2f7;font:14px/1.5 system-ui}h1{font-size:23px;margin:0}h2{font-size:18px}.pair,.triple{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.triple{grid-template-columns:repeat(3,1fr)}article{padding:12px;background:white;border:1px solid #c6d0dc}img{width:100%;height:auto}h3{margin:0 0 8px;font-size:16px}a{color:#145d9a}td,th{padding:5px 8px;border:1px solid #c6d0dc}table{border-collapse:collapse;background:white}</style>'
    head = '<!doctype html><meta charset="utf-8"><title>通用串行路径行布局审核</title>'+style
    nav = '<p><a href="overview.html">概览对照</a> · <a href="detail.html">详图对照</a> · <a href="generic.html">普通源码模块</a> · <a href="review.html">全部 102 个状态</a> · <a href="independent-report.json">独立审核</a></p>'
    def card(title, file):
        return '<article><h3>'+html.escape(title)+'</h3><a href="'+html.escape(file)+'"><img src="'+html.escape(file)+'" alt="'+html.escape(title)+'"></a></article>'
    for grain, title, reference, name in [('overview','概览','collapsed','Transformer-F0'), ('detail','语义详图','expanded','Transformer-F1')]:
        r = rows[name]
        page = head+'<h1>两个目标状态 · '+title+'</h1>'+nav
        q, b = r['quality'], r['before_quality']
        page += '<p>同一通用展示切面；节点、操作数、调用与归属保留。当前 '+str(q['native_width_px'])+' × '+str(q['native_height_px'])+'；交叉 '+str(b['line_geometry']['crossings'])+' → '+str(q['line_geometry']['crossings'])+'。专用参照不是通用图的展开下限。</p>'
        page += '<div class="triple">'+card('专用参照','../../generic-convergence/current/reference-'+reference+'.svg')+card('通用修改前',r['before_svg'])+card('通用当前',r['svg'])+'</div>'
        if grain == 'detail':
            page += '<p><a href="Transformer-finer.svg">继续展开具体计算后的实际 SVG</a>。高度进一步接近专用参照，但总体宽度和跨区线路仍有差距；源调用边界、条件区域和独立使用继续保留。</p>'
        (OUT / (grain+'.html')).write_text(page)
    generic = head+'<h1>通用规则 · 普通串行计算路径与分支边界</h1>'+nav+'<p>普通卷积、线性计算与连续存储操作：真实短串行路径可在原有框宽内改用行布局，分支仍保留分支。逐条依赖、源码归属和运算身份保持不变；备选最多允许 2% 的额外线长，以换取更小图幅。</p>'
    for name in ['SpatialPipeline-up-F1','SpatialPipeline-down-F1','BranchedPipeline-up-F1','SerialModules-F1','ConditionalStack-F0','MutatedStack-F0']:
        r = rows[name]
        generic += '<h2>'+name+'</h2><div class="pair">'+card('修改前',r['before_svg'])+card('当前',r['svg'])+'</div>'
    (OUT / 'generic.html').write_text(generic)
    page = head+'<h1>通用布局的跨语义验收</h1>'+nav+'<p>43 份输入、102 个状态。各图使用同一套生产规则；条件、状态、共享、未知、分支和重复结构继续保留。有限验证不代表所有未来源码都有理想布局。</p><table><tr><th>状态</th><th>SVG 变化</th><th>交叉 前 / 后</th><th>模块列</th></tr>'
    for r in suite['rows']:
        page += '<tr><td><a href="'+r['svg']+'">'+html.escape(r['name'])+'</a></td><td>'+str(r['changed'])+'</td><td>'+str(r['before_quality']['line_geometry']['crossings'])+' / '+str(r['quality']['line_geometry']['crossings'])+'</td><td>'+str(len(r['columns']))+'</td></tr>'
    (OUT / 'review.html').write_text(page+'</table>')
    native = '<!doctype html><meta charset="utf-8"><title>Native SVG text audit</title><style>body{margin:0}section{margin:20px}</style>'
    for r in suite['rows']:
        native += '<section data-panel="'+r['name']+'"><h2>'+r['name']+'</h2>'+(OUT / r['svg']).read_text()+'</section>'
    (OUT / 'native-audit.html').write_text(native)


if __name__ == '__main__':
    main()
