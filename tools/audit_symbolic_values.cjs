#!/usr/bin/env node
'use strict';
// Evaluation only: production rules never read these source names or cases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/symbolic-values/current');
const R=require('../semantic_studio/publication-renderer.js'),M=require('./representative_atlas.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const extraction=read(path.join(out,'extraction.json')),frozen=path.join(root,'verification/local-relations/iteration-08-before-symbolic-values');
assert.equal(sha(path.join(frozen,'snapshot.json')),extraction.frozen_snapshot_sha256);
for(const [file,digest]of Object.entries(read(path.join(frozen,'snapshot.json')).files))assert.equal(sha(path.join(frozen,'implementation',file)),digest);
assert.equal(sha(path.join(root,'tools/build_symbolic_evidence.py')),extraction.builder_sha256);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'tools/symbolic_values.cjs','tools/representative_atlas.cjs','tools/audit_symbolic_values.cjs'];
const implementation=Object.fromEntries(files.map(file=>[file,sha(path.join(root,file))])),comparisons=[],rows=[];
function render(name,ir,state,scope){
 const original=JSON.stringify(ir),r=R.render(ir,state);assert.equal(JSON.stringify(ir),original);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const row={name,svg,document,state,scope,nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  svg_sha256:sha(path.join(out,svg)),document_sha256:sha(path.join(out,document)),quality:r.prepared.quality,
  representative:r.graph.publication.representative,selected:r.graph.publication.granularity,
  expression_goals:r.graph.expression_coverage.reduce((a,g)=>(a[g.status]=(a[g.status]||0)+1,a),{})};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,font:row.quality.min_print_font_pt,issues:row.quality.issues}));return row;
}
for(const input of extraction.rows){
 assert.equal(sha(path.join(root,input.source)),input.source_sha256);
 const pair={};
 for(const version of ['before','current']){
  const p=path.join(out,input[version].ir);assert.equal(sha(p),input[version].ir_sha256);
  const ir=read(p),checked=M.inspect(ir);assert.deepEqual(checked.diagnostics,[]);
  pair[version]={ir,checked};
 }
 assert.equal(pair.before.ir.nodes.length,pair.current.ir.nodes.length);assert.equal(pair.before.ir.edges.length,pair.current.ir.edges.length);
 const compact=({checked})=>checked.sequences.map(s=>({sequence:s.id,groups:s.groups.map(g=>({status:g.status,indices:g.indices,representative:g.representative})),instances:s.rows.map(r=>({instance:r.instance,status:r.status,reason:r.reason||null}))}));
 comparisons.push({name:input.name,source:input.source,source_sha256:input.source_sha256,before:compact(pair.before),current:compact(pair.current),
  symbolic_reads:pair.current.ir.nodes.filter(n=>n.symbolic_value).length,canonical_nodes:pair.current.ir.nodes.length,canonical_edges:pair.current.ir.edges.length});
 if(input.name==='transformer'){
  const ir=pair.current.ir;
  for(const [index,s]of pair.current.checked.sequences.entries()){
   render('transformer-layer-'+index+'-before',pair.before.ir,{paperFocus:s.rows[0].instance,paperGranularity:'modules'},'Frozen extraction, current renderer; one concrete source instance.');
   render('transformer-layer-'+index+'-current',ir,{paperFocus:s.id,paperRepresentative:true,paperGranularity:'modules'},'Current extraction and renderer; one concrete representative with exact source positions. Not a reference-frontier match.');
  }
 }else for(const version of ['before','current']){
  const {ir,checked}=pair[version];render(input.name+'-'+version,ir,{paperFocus:checked.sequences[0].id,paperRepresentative:true,paperGranularity:'modules'},
   'Same source and requested state, current renderer; extraction changed. Concrete instance boundaries remain in the canonical graph.');
 }
}
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(path.join(root,file)),digest);
const report={schema:'symbolic-value-audit/1',extraction_sha256:sha(path.join(out,'extraction.json')),implementation_sha256:implementation,
 frozen_snapshot_sha256:extraction.frozen_snapshot_sha256,runtime_executed:false,goal_complete:false,comparisons,rows,
 scope:'14 development sources plus Transformer evaluation. Source Tensor contracts, unresolved concrete attributes, resource selections and supported exits; no runtime validation, purity or numerical equality.',
 unresolved_panels:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues}))};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');
const digest=sha(path.join(out,'render-report.json'));
const card=r=>`<article data-case="${esc(r.name)}"><h3>${esc(r.name)}</h3><p>${r.nodes} nodes · ${r.quality.min_print_font_pt} pt · ${r.quality.line_geometry.crossings} crossings · ${esc(r.quality.issues.join(', ')||'current geometry checks passed')}</p><p>${esc(r.scope)}</p>${fs.readFileSync(path.join(out,r.svg),'utf8')}</article>`;
const head=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="symbolic-render-report-sha256" content="${digest}"><title>Symbolic source contracts: before / current</title><style>body{font:15px Arial,sans-serif;margin:20px;color:#293746}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}article{min-width:0;border:1px solid #ccd4df;padding:12px}h3{font-size:17px}svg{width:100%;height:650px}p{overflow-wrap:anywhere}</style><h1>来源契约与局部结构代表</h1><p>具体属性值仍未解决；改名可同组，配置/属性差异保留，未知与可变计算不共用代表。仅为语义增量，尚未达到参考图的语义折叠状态。</p>`;
const pairs=rows.reduce((a,r,i)=>(i%2?a[a.length-1].push(r):a.push([r]),a),[]);
fs.writeFileSync(path.join(out,'review.html'),head+pairs.map(p=>'<section class="pair">'+p.map(card).join('')+'</section>').join('')+'</html>');
fs.writeFileSync(path.join(out,'transformer-review.html'),head+pairs.filter(p=>p[0].name.startsWith('transformer')).map(p=>'<section class="pair">'+p.map(card).join('')+'</section>').join('')+'</html>');
