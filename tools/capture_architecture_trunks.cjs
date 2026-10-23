'use strict';
// Frozen prior SVGs prove the same frontier; new cases use a real opt-out pair.
const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict');
const R=require('./load_publication_renderer.cjs')('./semantic_studio');
const out='verification/architecture-trunks/current/',base='verification/architecture-proportions/current/';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const implementation=Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')||f==='index.html').map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
fs.mkdirSync(out,{recursive:true});
const suite=read(base+'suite-report.json'),rows=[];
function capture(name,input,state,before,beforeSvg,beforeDocument){
 const ir=read(input),raw=JSON.stringify(ir),r=R.render(ir,state),doc=JSON.parse(JSON.stringify(r.document));
 assert.equal(JSON.stringify(ir),raw);assert.deepEqual(doc.ir,ir);
 for(const key of ['ir','architecture','publication','expression_goals','expression_coverage','summary_goals','summary_coverage'])assert.deepEqual(doc[key],before[key],name+': '+key);
 for(const key of ['nodes','bounds','labels','node_accounting','edge_accounting','representatives','frame_ownership'])assert.deepEqual(doc.layout[key],before.layout[key],name+': '+key);
 const strip=e=>{const {route,...binding}=e;return binding;};
 assert.deepEqual(doc.layout.edges.map(strip),before.layout.edges.map(strip));
 const selected=doc.layout.shared_fanouts||[],changed=new Set(selected.flatMap(r=>r.edges)),old=new Map(before.layout.edges.map(e=>[e.id,e]));
 for(const e of doc.layout.edges){const was=old.get(e.id);
  assert.deepEqual([e.route.points[0],e.route.points.at(-1)],[was.route.points[0],was.route.points.at(-1)]);
  if(!changed.has(e.id))assert.deepEqual(e.route,was.route);
 }
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+svg,r.svg);fs.writeFileSync(out+document,JSON.stringify(doc));
 const row={name,input,input_sha256:sha(input),state,svg,document,svg_sha256:sha(out+svg),document_sha256:sha(out+document),
  before_svg:beforeSvg,before_sha256:sha(out+beforeSvg),before_document:beforeDocument,before_document_sha256:sha(out+beforeDocument),
  nodes:doc.layout.nodes.length,edges:doc.layout.edges.length,quality:r.prepared.quality,before_quality:before.diagnostics.publication,
  stream_alignments:doc.publication.composition.stream_alignments||[],selected,
  same_nodes_labels_bindings_terminals_accounting_goals:true};rows.push(row);
 console.log(JSON.stringify({name,groups:selected.length,ink_saved:selected.reduce((n,r)=>n+r.ink_before-r.ink_candidate,0),crossings:r.prepared.quality.line_geometry.crossings,issues:r.prepared.quality.issues}));
}
for(const row of suite.rows){
 assert.equal(sha(base+row.svg),row.svg_sha256);assert.equal(sha(base+row.document),row.document_sha256);
 capture(row.name,row.input,row.state,read(base+row.document),'../../architecture-proportions/current/'+row.svg,'../../architecture-proportions/current/'+row.document);
}
for(const name of ['UnseenDistribution','InterruptedDistribution','ConditionalDistribution','SharedDistribution','MutableDistribution','ContextWeaver']){
 const input=name==='ContextWeaver'?out+name+'.json':'verification/shared-fanouts/current/'+name+'.json',ir=read(input);
 for(const direction of ['up','down']){
  const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'all',paperComposition:'architecture',paperAuto:false,
   paperAdaptive:false,paperCompact:false,paperPipelineSummaries:false,paperDirection:direction,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
  const before=R.render(ir,{...state,paperSharedFanouts:false}),label=name+'-'+direction;
  fs.writeFileSync(out+label+'.before.svg',before.svg);fs.writeFileSync(out+label+'.before.layout.json',JSON.stringify(before.document));
  capture(label,input,state,JSON.parse(JSON.stringify(before.document)),label+'.before.svg',label+'.before.layout.json');
 }
}
for(const [p,h] of Object.entries(implementation))assert.equal(sha(p),h,'Producer changed during capture');
fs.writeFileSync(out+'suite-report.json',JSON.stringify({schema:'architecture-trunks-suite/1',baseline_commit:'a54e7ab5c6b04b8c99be63bf5dc96ea0aefb9560',implementation_sha256:implementation,
 source:'tests/semantic_fixtures/architecture_trunks.py',source_sha256:sha('tests/semantic_fixtures/architecture_trunks.py'),runtime_executed:false,rows,goal_complete:false},null,2)+'\n');
