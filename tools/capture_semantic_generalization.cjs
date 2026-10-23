'use strict';
// Case names belong to evidence selection only, never production policy.
const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict');
const load=require('./load_publication_renderer.cjs'),R=load('./semantic_studio'),B=load('/tmp/archcanvas-generalization-cf3c793/semantic_studio');
const E=load('./semantic_studio',{engine:true}),C=require('../semantic_studio/composition-layout');
const out='verification/semantic-generalization/current/',base='verification/architecture-trunks/current/';
const read=p=>JSON.parse(fs.readFileSync(p)),norm=x=>JSON.parse(JSON.stringify(x));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=[...fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')||f==='index.html').map(f=>'semantic_studio/'+f),
 'tools/capture_semantic_generalization.cjs','tools/load_publication_renderer.cjs'];
const hashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
const partition=b=>Object.fromEntries(Object.entries(b).map(([k,ids])=>[k,ids.slice().sort()]));
const rows=[],retained=[];
function capture(name,input,state){
 const ir=read(input),raw=JSON.stringify(ir),r=R.render(ir,state),before=B.render(ir,state),doc=norm(r.document);
 assert.equal(JSON.stringify(ir),raw);assert.deepEqual(doc.ir,ir);
 assert.deepEqual(r.graph.nodes.map(n=>n.id).sort(),before.graph.nodes.map(n=>n.id).sort());
 assert.deepEqual(norm(r.graph.edges),norm(before.graph.edges));
 for(const key of ['node_accounting','edge_accounting'])assert.deepEqual(norm(partition(r.graph[key])),norm(partition(before.graph[key])));
 assert.equal(R.render(doc.ir,doc.state).svg,r.svg,'save/reopen: '+name);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
  const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
 }
 for(const [suffix,result]of [['',r],['.before',before]]){
  fs.writeFileSync(out+name+suffix+'.svg',result.svg);fs.writeFileSync(out+name+suffix+'.layout.json',JSON.stringify(result.document));
 }
 rows.push({name,input,input_sha256:sha(input),state,svg:name+'.svg',document:name+'.layout.json',
  before_svg:name+'.before.svg',before_document:name+'.before.layout.json',svg_sha256:sha(out+name+'.svg'),document_sha256:sha(out+name+'.layout.json'),
  before_sha256:sha(out+name+'.before.svg'),before_document_sha256:sha(out+name+'.before.layout.json'),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,before_quality:before.prepared.quality,
  composition_status:r.graph.publication.composition?.status||'composed',changed:r.svg!==before.svg,
  same_frontier_bindings_partition:true,save_reopen_exact:true});
 console.log(JSON.stringify({name,changed:r.svg!==before.svg,issues:r.prepared.quality.issues,before:before.prepared.quality.issues}));
 return r;
}
const extraction=read(out+'extraction.json');
for(const row of extraction.rows){
 const input=row.input,ir=read(input),state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',
  paperComposition:'architecture',paperDirection:'down',paperAdaptive:false,paperCompact:true};
 const coarse=capture(row.entry+'-F0',input,state),fineState=C.certifiedDetails(ir,C.frontier(state,'detail'));
 const fine=capture(row.entry+'-F1',input,fineState);
 const suffixes=coarse.graph.publication.inline_sequences?.sequences.flatMap(s=>s.remainders)||[];
 if(suffixes.length){
  const finer={...state,paperAuto:false,open:[...new Set([...coarse.graph.publication.open,...suffixes.map(s=>s.node)])]};
  const opened=capture(row.entry+'-suffix-open',input,finer);
  assert.ok(suffixes.every(s=>opened.graph.positions.get(s.node)?.expanded&&s.instances.every(id=>opened.graph.positions.has(id))));
 }
 assert.equal(R.render(ir,C.frontier(fineState,'return')).svg,coarse.svg,'exact coarse return');
 const full=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(norm(full.nodes.map(n=>n.id).sort()),ir.nodes.map(n=>n.id).sort());assert.deepEqual(norm(full.edges.map(e=>e.id).sort()),ir.edges.map(e=>e.id).sort());
 if(['StateStack','ConvStack','TwinStacks'].includes(row.entry))capture(row.entry+'-up',input,{...state,paperDirection:'up'});
}
// Retain the previous full suite, including both Transformer frontiers. Its
// actual SVGs are immutable references, not redrawn pseudo-baselines.
const suite=read(base+'suite-report.json');
for(const row of suite.rows){
 assert.equal(sha(base+row.svg),row.svg_sha256);assert.equal(sha(row.input),row.input_sha256);
 const r=R.render(read(row.input),row.state);assert.equal(r.svg,fs.readFileSync(base+row.svg,'utf8'),row.name+' changed unexpectedly');
 retained.push({name:row.name,input:row.input,input_sha256:row.input_sha256,svg:base+row.svg,svg_sha256:row.svg_sha256,byte_equal:true});
}
for(const [p,h]of Object.entries(hashes))assert.equal(sha(p),h,'Producer changed during capture');
fs.writeFileSync(out+'suite-report.json',JSON.stringify({schema:'semantic-generalization-suite/1',baseline_commit:'cf3c79337f3d02ae14d127ec998fa9d9c6bbd131',
 implementation_sha256:hashes,extraction_sha256:sha(out+'extraction.json'),rows,retained,
 goal_complete:false,scope:'Cross-family regression evidence. A passing finite suite does not establish universal visual improvement.'},null,2)+'\n');
