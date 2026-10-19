#!/usr/bin/env node
'use strict';
// Evaluation inputs only. No case, model-name or source hash selects production rules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/canvas-medium/current');fs.mkdirSync(out,{recursive:true});
const R=require('../semantic_studio/publication-renderer.js'),M=require('./representative_atlas.cjs');
const frozenPath='verification/local-relations/iteration-09-before-canvas-medium';
const frozen=require('./load_publication_renderer.cjs')(path.join(root,frozenPath,'implementation/semantic_studio'));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p))),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const snapshot=read(frozenPath+'/snapshot.json');for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(frozenPath+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html','semantic_studio/style.css','tools/audit_canvas_medium.cjs'];
const implementation=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,version='current'){
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?frozen:R).render(ir,state);assert.equal(JSON.stringify(ir),before);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const row={name,input,input_sha256:sha(input),version,state,svg,document,nodes:r.graph.nodes.length,edges:r.graph.edges.length,selected:r.graph.publication.granularity,
  svg_sha256:sha('verification/canvas-medium/current/'+svg),document_sha256:sha('verification/canvas-medium/current/'+document),quality:r.prepared.quality,
  representative:r.graph.publication.representative,expression_goals:r.graph.expression_coverage.reduce((a,c)=>(a[c.status]=(a[c.status]||0)+1,a),{})};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,selected:row.selected,issues:row.quality.issues}));return r;
}
for(const name of ['MixedCircuit','BrokenCell','ForeignComposition','UnknownFusion']){
 const input='verification/local-relations/current/'+name+'.json',state={paperGranularity:'detailed'};
 const before=render(name+'-before',input,state,'before'),print=render(name+'-print',input,state);assert.equal(before.svg,print.svg);
 render(name+'-canvas',input,{...state,paperMedium:'canvas'});
}
render('MixedCircuit-limited','verification/local-relations/current/MixedCircuit.json',{paperGranularity:'detailed',paperMedium:'canvas',paperCanvasLimits:{width_px:512,height_px:512,area_px2:262144,nodes:16,edges:16}});
for(const name of ['MutableSteps','MixedSteps'])render(name+'-canvas','verification/local-relations/current/structural-repeats/'+name+'.json',{paperGranularity:'detailed',paperMedium:'canvas'});
const transformer='verification/symbolic-values/current/transformer-current.json',ir=read(transformer);
for(const level of ['overview','detailed'])render('transformer-'+level+'-canvas',transformer,{paperGranularity:level,paperMedium:'canvas'});
for(const [i,s]of M.inspect(ir).sequences.entries())render('transformer-layer-'+i+'-canvas',transformer,{paperFocus:s.id,paperRepresentative:true,paperGranularity:'detailed',paperMedium:'canvas'});
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:'canvas-medium-audit/1',implementation_sha256:implementation,frozen_snapshot:frozenPath+'/snapshot.json',frozen_snapshot_sha256:sha(frozenPath+'/snapshot.json'),
 rows,goal_complete:false,reference_frontier_match:false,scope:'Same IR; canvas retains requested frontier and uses native CSS pixels. Print equality checked against the frozen implementation. Resource diagnostics are post-layout checks, not preemptive protection. Geometry and semantic convergence remain separate obligations.'};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');const digest=sha('verification/canvas-medium/current/render-report.json');
const card=r=>`<article data-case="${esc(r.name)}"><h2>${esc(r.name)}</h2><p>${r.nodes} nodes / ${r.edges} edges · ${r.selected} · ${r.quality.medium==='canvas'?r.quality.min_canvas_font_px+' native px':r.quality.min_print_font_pt+' pt'} · ${esc(r.quality.issues.join(', ')||'current geometry checks passed')}</p>${fs.readFileSync(path.join(out,r.svg),'utf8')}</article>`;
const head=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="canvas-render-report-sha256" content="${digest}"><title>画布前沿保留检查</title><style>body{font:15px Arial,sans-serif;margin:24px;color:#28364a}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{min-width:0;border:1px solid #ccd4df;padding:12px}svg{width:100%;height:700px;display:block}h2{font-size:18px}p{overflow-wrap:anywhere}.notice{padding:14px;background:#fff0da}</style><h1>画布与打印：语义前沿保留</h1><p class="notice">当前尚未实现参考图对应的中间折叠状态。可缩放画布不再为适配单页打印自动降低粒度；原始字号与适应窗口后的字号分别显示。未知边界、关系覆盖和几何问题继续独立审核。</p><p><a href="render-report.json">输入、状态、实现及产物摘要</a></p>`;
fs.writeFileSync(path.join(out,'review.html'),head+'<div class="cards">'+rows.filter(r=>r.version==='current').map(card).join('')+'</div></html>');
fs.writeFileSync(path.join(out,'transformer-review.html'),head+'<div class="cards">'+rows.filter(r=>r.name.startsWith('transformer')).map(card).join('')+'</div></html>');
