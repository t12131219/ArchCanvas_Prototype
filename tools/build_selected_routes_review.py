"""Expose accepted selected-route refinements and remaining rejected details."""
import html
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/selected-routes/current'
read = lambda p: json.loads(p.read_text())
if __name__ == '__main__':
    reports = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    audit = read(OUT / 'independent-report.json')
    rows = {r['name']: r for report in reports for r in report['rows']}
    head = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>保留已选路径的通用路由优化</title><style>body{font:16px system-ui;margin:24px;color:#293746;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0;background:white;padding:14px;border:1px solid #bcc8d4;margin-bottom:20px}.fit svg,.fit img{width:100%;height:auto}.native{max-height:760px;overflow:auto}.native svg{max-width:none}.note{background:#fff3d4;padding:16px}h2{margin-top:36px}</style>'
    def panel(name, native=False):
        r = rows[name];q = r['quality'];g = q['line_geometry']
        return '<section data-panel="'+name+'"><h3>'+html.escape(name)+'</h3><p>'+str(r['nodes'])+' 节点 · '+str(q['native_width_px'])+' × '+str(q['native_height_px'])+' px · '+str(g['crossings'])+' 交叉 · '+str(len(g['unrelated_contacts']))+' 接触 · '+str(sum(not o['same_value'] for o in g['overlapping_paths']))+' 异值重叠</p><div class="'+('native' if native else 'fit')+'">'+(OUT/r['svg']).read_text()+'</div></section>'
    page = head+'<h1>固定语义状态，继续改善已选连线</h1><p>保留原始事实、节点布局、边界、操作数与物理端口，只复查冲突最多的少数路径。每张图最多 32 次候选路由；新的布局或语义不由连线修复推断。</p>'
    page += '<p class="note">图组直接覆盖 '+str(audit['joint']['before'])+' → '+str(audit['joint']['after'])+'。下面保留未通过图组选择的详图；局部路径质量改善不等于已经接近专用参考。</p>'
    for c in audit['comparisons']:
        if c.get('rescheduled'):continue
        source = next(cmp for report in reports for cmp in report['comparisons'] if cmp['name']==c['name'])
        page += '<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(source['before'])+panel(source['after'])+'</div>'
    (OUT/'review.html').write_text(page+'</html>')
    page=head+'<h1>已选路径优化：实际 SVG 前后对照</h1><p>节点、语义状态与物理端口保持一致。连线交叉、接触与异值重叠从 SVG 独立复算；未通过图组选择的候选仍单独保留。</p>'
    for c in reports[1]['comparisons']:
        page+='<h2>'+html.escape(c['name'])+'</h2><div class="grid">'+panel(c['before'])+panel(c['after'])+'</div>'
    (OUT/'route-review.html').write_text(page+'</html>')
    (OUT/'text-qa.html').write_text(head+'<h1>'+str(len(rows))+' 张 SVG 原生文字审核</h1>'+''.join(panel(name,True) for name in rows)+'</html>')
    reference=ROOT/'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
    (OUT/'dedicated-reference.svg').write_bytes(reference.read_bytes())
    j=reports[1]['joint']
    page=head+'<h1>当前通用语义状态与专用展开参考</h1><p>最细事实保留；下图是中间语义状态。通用规则不使用参考图的坐标和案例身份。专用图全面收敛及数千节点整图性能仍未完成。</p><div class="grid">'+panel(j['panels'][0]['capture'])+'<section><h3>专用参考</h3><div class="fit"><img alt="专用展开参考" src="dedicated-reference.svg"></div></section></div><h2>实际选择的详图</h2><div class="grid">'+''.join(panel(p['capture']) for p in j['panels'][1:])+'</div>'
    (OUT/'transformer-review.html').write_text(page+'</html>')
