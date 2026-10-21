"""Publish the actual alternatives and honest before/current measurements."""
import hashlib
import html
import json
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/joint-expressions/current'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=read(OUT/'render-report.json');a=read(OUT/'independent-report.json');by={s['name']:s for s in r['sets']};metrics={s['name']:s for s in a['results']}
style='body{font:16px system-ui;background:#edf1f5;color:#203343;margin:28px}h1{font-size:28px}p{max-width:1100px;line-height:1.7}table{border-collapse:collapse;background:white}td,th{padding:8px 14px;border:1px solid #ccd4dc;text-align:left}article{margin:20px 0;padding:18px;background:white;border-radius:10px}img{display:block;max-width:100%;height:auto;margin:auto}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pair img{max-height:980px}.caption{font-size:14px;color:#455866}a{color:#25618a}'
def image(row,caption):
 return '<article><h3>'+html.escape(caption)+'</h3><a href="'+row+'.svg"><img src="'+row+'.svg"></a><p class="caption">'+row+' · 点击查看原始 SVG</p></article>'
parts=['<!doctype html><meta charset="utf-8"><title>主图与详图的联合表达选择审核</title><style>'+style+'</style><h1>主图与详图的联合表达选择</h1><p>从相同底层事实，比较主图局部展开和独立详图。按真实路径兑现的目标与实际面积、图数选择。该功能是有界局部搜索；默认旧策略保留，编辑器通过“规划主图与详图”显式启用。</p><p><b>完整目标尚未完成。</b>Transformer 在两次试算预算下覆盖退化（49 → 41）；其主图 SVG 不变。此轮不能据此声称更接近专用图。陌生案例有局部收益，条件结构仍有未兑现目标。</p><p><a href="text-qa.html">全部实际 SVG 原始字号审核</a> · <a href="render-report.json">全部候选与选择记录</a> · <a href="independent-report.json">独立核验</a> · <a href="ui-report.json">实际编辑器审核</a></p><table><tr><th>输入</th><th>已表达 / 目标：旧 → 当前</th><th>图数：旧 → 当前</th><th>总面积比：当前 / 旧</th><th>当前主图节点</th></tr>']
for pair in r['comparisons']:
 b,c=[metrics[pair[k]] for k in ['before','current']]
 parts.append(f'<tr><td>{pair["name"]}</td><td>{b["fulfilled"]}/{b["goals"]} → {c["fulfilled"]}/{c["goals"]}</td><td>{b["panels"]} → {c["panels"]}</td><td>{c["total_area"]/b["total_area"]:.3f}</td><td>{c["main_nodes"]}</td></tr>')
parts+=['</table><h2 id="source">同一段陌生计算：主图展开与独立详图</h2><p>SourceMosaic 两种形式都兑现相同的五项新增目标。旧版采用两张图；联合选择保留一张 11 节点主图。其计算仍可在源码视图展开为 16 节点。</p><div class="pair">',image('SourceMosaic-before-initial','旧主图：6 节点'),image(by['SourceMosaic-current']['panels'][0]['row'],'当前主图：11 节点'),'</div><div class="pair">']
s=by['SourceMosaic-current']
for attempt in s['attempts']:
 parts.append(image(attempt['row'],attempt['form']+' · '+('选中' if attempt['accepted'] else '未选中')+' · '+', '.join(attempt['reasons'])))
parts+=['</div><h2 id="mixed">混合结构：同一轮选择既有内联，也有独立详图</h2><p>MixedWeave 保留共享调用身份和边界；新主图展开一条已认证角色路径，并选择一个独立依赖区域详图。43 项目标中兑现 20 项，仍有 23 项暂缓。</p><div class="pair">']
for p in by['MixedWeave-current']['panels']:parts.append(image(p['row'],p['id']))
parts+=['</div><h2 id="unknown">未知、残缺与条件范围</h2><p>三份新输入只静态解析，未执行运行追踪。未知与条件内部不被擅自补全；GuardedRelayWorkshop 仍仅兑现 18/24 项。</p><div class="pair">']
for name in ['RelayWorkshop','BrokenRelayWorkshop','GuardedRelayWorkshop']:
 for p in by[name+'-current']['panels']:parts.append(image(p['row'],name+' · '+p['id']))
parts+=['</div><h2 id="transformer">Transformer：保留退化及参考差距</h2><p>同输入、相同两次候选预算。新策略用一次试算比较主图展开与详图，旧策略可将两次全部用于详图；最终 49/1855 → 41/1855。分母是当前作用域逐实例的直接表达目标，不能解释为总体架构正确率。主图均为 80 节点；专用图仅用于视觉评估，不参与规则或候选选择。</p><div class="pair">',image(by['Transformer-before']['panels'][0]['row'],'通用旧主图'),image(by['Transformer-current']['panels'][0]['row'],'通用当前主图：字节相同'),'</div><div class="pair">']
for p in by['Transformer-current']['panels'][1:]:parts.append(image(p['row'],'当前选中详图'))
dedicated='../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg'
parts.append('<article><h3>专用详细图（评估参考）</h3><a href="'+dedicated+'"><img src="'+dedicated+'"></a></article></div>')
(OUT/'review.html').write_text(''.join(parts))
# Literal inline bytes enable native SVG text and label measurements.
ui=['ui-SourceMosaic-planned.svg','ui-SourceMosaic-raw.svg','ui-MixedWeave-planned.svg','ui-MixedWeave-detail.svg']
expected={row['name']:row['svg'] for row in r['rows']};expected.update({f:f for f in ui})
page=['<!doctype html><meta charset="utf-8"><meta name="inline-render-report-sha256" content="'+sha(OUT/'render-report.json')+'"><title>联合表达 SVG 原始字号检查</title><style>body{font:14px system-ui;margin:20px}section{margin:24px 0;border:1px solid #aaa;width:max-content}section>svg{display:block;max-width:none;max-height:none}</style><h1>实际候选及编辑器导出 · 原始字号</h1>']
for name,f in expected.items():page.append('<section data-panel="'+name+'"><h2>'+name+'</h2>'+(OUT/f).read_text()+'</section>')
(OUT/'text-qa.html').write_text(''.join(page))
shutil.copyfile(ROOT/'verification/measured-frontiers/current/browser-text-probe.js',OUT/'browser-text-probe.js')
print(json.dumps({'rows':len(r['rows']),'native_panels':len(expected)}))
