"""Build review pages from frozen/current actual renders, with native inline SVG QA."""
import hashlib
import html
import json
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/joint-preflights/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=read(OUT/'render-report.json');audit=read(OUT/'independent-report.json')
sets={s['name']:s for s in r['sets']};metrics={s['name']:s for s in audit['results']}
style='body{font:16px system-ui;background:#edf1f5;color:#203343;margin:28px}h1{font-size:28px}p{max-width:1100px;line-height:1.7}table{border-collapse:collapse;background:white}td,th{padding:8px 12px;border:1px solid #ccd4dc;text-align:left}article{margin:20px 0;padding:18px;background:white;border-radius:10px;min-width:0;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;margin:auto}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pair img{max-height:980px}.caption{font-size:14px;color:#455866}a{color:#25618a}pre{white-space:pre-wrap;overflow-wrap:anywhere}'
def header(title):
 return '<!doctype html><meta charset="utf-8"><title>'+title+'</title><style>'+style+'</style><h1>'+title+'</h1>'
def image(row,caption):
 return '<article><h3>'+html.escape(caption)+'</h3><a href="'+row+'.svg"><img src="'+row+'.svg"></a><p class="caption">'+html.escape(row)+' · 点击查看原始 SVG</p></article>'
def figures(name,version):
 return ''.join(image(p['row'],version+' · '+p['id']) for p in sets[name+'-'+version]['panels'])
intro='<p>同一原始事实图，在主图内展开或另开详图之间选择。新版先检查实际未路由投影能否展开，再把路由预算用于可行候选；投影只用于调度，覆盖仍由实际 SVG 核验。默认顺序策略保持，编辑器通过“规划主图与详图”启用联合规划。</p><p><b>完整目标尚未完成。</b>本轮修复有限预算下的覆盖退化，Transformer 主图未变，尚未更接近专用参考。生产规则不读取模型名、案例 ID 或参考坐标。</p>'
parts=[header('候选投影预检与路由预算审核'),intro,'<p><a href="text-qa.html">92 张实际 SVG 原始字号检查</a> · <a href="render-report.json">渲染记录</a> · <a href="projection-report.json">独立投影重放</a> · <a href="independent-report.json">独立核验</a> · <a href="ui-report.json">实际编辑器操作</a></p><table><tr><th>输入</th><th>已表达 / 目标：旧 → 当前</th><th>候选路由次数</th><th>图数</th><th>总面积比</th></tr>']
for pair in r['comparisons']:
 b,c=[metrics[pair[k]] for k in ['before','current']]
 trials=[sets[pair[k]]['rendered_trials'] for k in ['before','current']]
 parts.append(f'<tr><td>{pair["name"]}</td><td>{b["fulfilled"]}/{b["goals"]} → {c["fulfilled"]}/{c["goals"]}</td><td>{trials[0]} → {trials[1]}</td><td>{b["panels"]} → {c["panels"]}</td><td>{c["total_area"]/b["total_area"]:.3f}</td></tr>')
parts.append('</table>')
sections={
 'source':('陌生局部计算：同等表达', '<p>SourceMosaic 两版均用一张主图兑现 9/9 项目标。源码视图仍可恢复 16 节点、14 条边。</p>', ['SourceMosaic']),
 'mixed':('混合结构：增加一个独立详图', '<p>MixedWeave 从 20/43 提升到 25/43，图数从两张增加到三张，总面积也增加。主图保持 21 节点，新增 self.collect 的 8 节点详图；不能据此宣称主图更紧凑。</p>', ['MixedWeave']),
 'boundaries':('嵌套、残缺与条件：避免无效试算', '<p>NestedWorkshop 与 BrokenWorkshop 覆盖保持，候选路由从四次降到两次。条件结构仍有未兑现目标；预检不能把未知或受限范围算作已表达。</p>', ['NestedWorkshop','BrokenWorkshop','ConditionalWorkshop']),
 'transformer':('Transformer：恢复覆盖，主图未变', '<p>同输入、固定 roles、关闭自适应、相同两次候选路由预算：41/1855 → 49/1855，图数两张 → 三张。该分母是逐实例直接表达目标，不能解释为架构正确率。两版主图字节一致，80 节点 / 91 边、2166 × 3656；新增详图没有完成参考图的语义和视觉收敛。</p>', ['Transformer'])}
for slug,(title,note,names) in sections.items():
 body=['<h2>'+title+'</h2>',note]
 for name in names:
  body+=['<h3>'+name+'</h3><div class="pair"><div>',figures(name,'before'),'</div><div>',figures(name,'current'),'</div></div>']
  receipts=sets[name+'-current'].get('preflights',[])
  if receipts:
   compact=[{k:v for k,v in x.items() if k in ['request','eligible','reasons','projected_nodes','projected_edges','role_request','comparison_round']} for x in receipts]
   body+=['<details><summary>投影调度记录（不证明覆盖）</summary><pre>'+html.escape(json.dumps(compact,ensure_ascii=False,indent=2))+'</pre></details>']
 if slug=='transformer':
  ref='../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
  body+=['<article><h3>专用详细图：仅用于评价</h3><a href="'+ref+'"><img src="'+ref+'"></a></article>']
 section=''.join(body);parts+=['<p><a href="review-'+slug+'.html">单独查看此组</a></p>',section]
 (OUT/('review-'+slug+'.html')).write_text(header(title)+'<p><a href="review.html">返回完整审核</a></p>'+section)
(OUT/'review.html').write_text(''.join(parts))
ui=['ui-SourceMosaic-planned.svg','ui-SourceMosaic-raw.svg','ui-MixedWeave-planned.svg','ui-MixedWeave-detail.svg','ui-MixedWeave-detail-2.svg']
expected={row['name']:row['svg'] for row in r['rows']};expected.update({f:f for f in ui})
page=['<!doctype html><meta charset="utf-8"><meta name="inline-render-report-sha256" content="'+sha(OUT/'render-report.json')+'"><title>投影预检 SVG 原始字号检查</title><style>body{font:14px system-ui;margin:20px}section{margin:24px 0;border:1px solid #aaa;width:max-content}section>svg{display:block;max-width:none;max-height:none}</style><h1>实际候选及编辑器导出 · 原始字号</h1>']
for name,f in expected.items():page.append('<section data-panel="'+name+'"><h2>'+name+'</h2>'+(OUT/f).read_text()+'</section>')
(OUT/'text-qa.html').write_text(''.join(page))
shutil.copyfile(ROOT/'verification/joint-expressions/current/browser-text-probe.js',OUT/'browser-text-probe.js')
print(json.dumps({'svg':len(r['rows']),'native_panels':len(expected)}))
