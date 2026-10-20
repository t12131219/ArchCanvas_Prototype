'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),F=require('../semantic_studio/local-pipelines.js');
const read=name=>JSON.parse(fs.readFileSync('verification/dependency-trees/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'},draw=(ir,s={})=>R.render(ir,{...state,...s});
const trees=g=>(g.publication.local_pipelines?.rows||[]).filter(r=>r.dependency_tree);
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}

test('a converging tree retains distinct operand slots and every internal dependency exactly once',()=>{
 const ir=read('MergeWeave'),before=JSON.stringify(ir),r=draw(ir),row=trees(r.graph)[0];assert.ok(row);assert.equal(row.status,'summary');
 const seen=[],edges=[];function visit(t){seen.push(t.node);for(const input of t.inputs){edges.push(input.edge);const binding=row.bindings.find(b=>b.edge===input.edge);
  assert.equal(binding.target,t.node);assert.equal(binding.producer,input.expression.node);assert.equal(binding.target_port,input.target_port);assert.equal(binding.source_port,input.source_port);visit(input.expression);}}
 visit(row.dependency_tree);assert.equal(new Set(seen).size,seen.length);assert.deepEqual(seen.sort(),row.operations.map(o=>o.node).sort());
 assert.deepEqual(edges.sort(),row.bindings.filter(b=>seen.includes(b.producer)).map(b=>b.edge).sort());
 assert.match(r.svg,/Dependency tree/);assert.match(r.svg,/sub ←/);assert.equal(JSON.stringify(ir),before);accounted(ir,r.graph);
 assert.ok(row.operations.every(o=>r.graph.expression_coverage.find(c=>c.goal==='goal:node:'+o.node)?.status!=='fulfilled'));
});

test('tree summaries reopen, preserve exact bindings and save/refold deterministically',()=>{
 const ir=read('MergeWeave'),folded=draw(ir),row=trees(folded.graph)[0];
 const opened=draw(ir,{paperAuto:false,open:[...folded.graph.publication.open,...row.source_boundaries.map(b=>b.node)]});
 const detail=trees(opened.graph).find(r=>r.node===row.node);assert.equal(detail.status,'expanded');assert.equal(detail.detailed_operations_exposed,true);
 assert.ok(opened.graph.nodes.length>folded.graph.nodes.length);assert.deepEqual(detail.bindings,row.bindings);
 for(const r of [folded,opened]){assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r.graph);assert.equal(draw(r.document.ir,r.document.state).svg,r.svg);}
 assert.equal(draw(ir,{paperAuto:false,open:folded.graph.publication.open}).svg,folded.svg);
});

test('focusing a nested source region preserves its summary and further expansion without summarizing the canonical model root',()=>{
 const ir=read('ScaledProjection'),row=trees(draw(ir).graph)[0],s={paperFocus:row.node,paperAuto:false,open:[]};
 const folded=draw(ir,s),opened=draw(ir,{...s,open:[row.node]});
 assert.equal(trees(folded.graph)[0].status,'summary');assert.equal(trees(opened.graph)[0].status,'expanded');
 assert.equal(folded.graph.nodes.length,1);assert.ok(opened.graph.nodes.length>1);
 assert.equal(trees(folded.graph)[0].dependency_tree.node,row.dependency_tree.node);
 assert.deepEqual(trees(folded.graph)[0].bindings,row.bindings);
 assert.ok(!draw(ir).graph.publication.local_pipelines.rows.some(r=>r.node===ir.nodes.find(n=>!n.parent).id));
});

test('framework parameter reads remain exact attached resources without scalar evaluation or family inference',()=>{
 const ir=read('ScaledProjection'),r=draw(ir),row=trees(r.graph)[0];assert.ok(row);assert.equal(row.status,'summary');
 assert.deepEqual(row.operations.map(o=>o.label),['Linear','sqrt','mult']);assert.equal(row.parameter_reads.length,1);
 for(const resource of row.parameter_reads){assert.deepEqual(resource.edges,ir.edges.filter(e=>e.source===resource.node));
  for(const edge of resource.edges)assert.ok([...r.graph.annotations.values()].flat().some(note=>note.resource.id===resource.node&&note.edge.id===edge.id));}
 assert.match(row.scope,/No scalar evaluation/);assert.equal(row.value,undefined);accounted(ir,r.graph);
});

test('late context, escape, internal fanout and conditions remain explicit; an unknown sibling does not discard a valid tree',()=>{
 const late=draw(read('LateTree'));assert.equal(trees(late.graph)[0].status,'expanded');
 for(const name of ['EscapingTree','SharedTree','ConditionalTree']){const ir=read(name),r=draw(ir);assert.equal(trees(r.graph).length,0,name);accounted(ir,r.graph);}
 const unknown=draw(read('UnknownTree'));assert.equal(trees(unknown.graph).length,1);assert.ok(unknown.graph.nodes.some(n=>n.kind==='opaque'));
});

test('a reused final result folds with distinct exact output cuts and canonical consumer bindings',()=>{
 const ir=read('ResultFanout'),r=draw(ir),row=trees(r.graph)[0];assert.ok(row);assert.equal(row.status,'summary');assert.ok(row.output_bindings.length);
 assert.ok(row.output_bindings.every(b=>b.producer===row.result_operation));
 const uses=r.graph.edges.filter(e=>e.source===row.node);assert.equal(uses.length,2);
 assert.ok(uses.every(e=>e.source===row.node));assert.equal(new Set(uses.map(e=>e.canonical_target)).size,2);
 for(const edge of uses){assert.ok(r.prepared.routes.find(p=>p.id===edge.id)?.route.ok);assert.ok(ir.edges.some(e=>e.id===edge.id&&e.target===edge.canonical_target&&e.target_port===edge.target_port));}
 assert.ok(uses.every(e=>row.output_bindings.some(b=>e.originals.includes(b.edge))));
 assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r.graph);
});

test('guarded tree members and parameter effects cannot be hidden by a candidate or a stored title',()=>{
 for(const attrs of [{kind:'opaque'},{kind:'control'},{mutable:true},{condition:{test:'unknown'}},{identity_display:{reference:'shared'}},
  {runtime_evidence:[{}]},{evidence_status:'runtime-only'},{observed_calls:{}},{semantic_contracts:['untrusted']}]){
  const ir=read('MergeWeave'),plan=require('../semantic_studio/publication.js').plan(ir),bindings=new Map();
  for(const n of ir.nodes){const incoming=ir.edges.filter(e=>e.target===n.id);if(['interface','value-alias'].includes(n.kind)&&incoming.length===1)bindings.set(n.id,incoming[0]);}
  assert.equal(F.compile({ir,plan,bindings,metadata:new Set(),configurationUses:new Set()}).size,1);
  Object.assign(plan.nodes.find(n=>n.operator==='sub'),attrs);
  assert.equal(F.compile({ir,plan,bindings,metadata:new Set(),configurationUses:new Set()}).size,0,JSON.stringify(attrs));
 }
 for(const mutation of ['write','input','escape']){
  const ir=read('ScaledProjection'),param=ir.nodes.find(n=>n.kind==='parameter'),edge=ir.edges.find(e=>e.source===param.id);
  if(mutation==='write')edge.kind='state-write';
  if(mutation==='input')ir.edges.push({id:'parameter-input',source:ir.nodes.find(n=>n.kind==='interface').id,target:param.id,kind:'data',source_port:'out',target_port:'in'});
  if(mutation==='escape')ir.edges.push({...edge,id:'parameter-escape',target:ir.nodes.find(n=>n.function_target==='torch.relu').id});
  assert.equal(trees(draw(ir).graph).length,0,mutation);
 }
});

test('names, stale supplied summaries and node order do not authorize a dependency tree',()=>{
 const ir=read('MergeWeave'),row=trees(draw(ir).graph)[0];for(const n of ir.nodes){n.label='Transformer';n.source_class='Unseen';n.local_pipeline={dependency_tree:{node:'fake'}};}
 const renamed=trees(draw(ir).graph)[0];assert.deepEqual(renamed.dependency_tree,row.dependency_tree);assert.deepEqual(renamed.bindings,row.bindings);
 // The topology, not declaration order, selects the unique result.
 ir.nodes.reverse();const reordered=trees(draw(ir).graph)[0];assert.deepEqual(reordered.dependency_tree,row.dependency_tree);
 const broken=read('UnknownTree');for(const n of broken.nodes)n.local_pipeline=row;assert.equal(trees(draw(broken).graph).length,1);
});

test('cycles, repeated internal operand uses, and extra disconnected operations reject a tree summary',()=>{
 const original=read('MergeWeave'),row=trees(draw(original).graph)[0];
 for(const mutate of [ir=>ir.edges.push({id:'cycle',source:row.result_operation,target:row.entry_operations[0],kind:'data'}),
  ir=>ir.edges.push({...ir.edges.find(e=>row.operations.some(o=>o.node===e.source)&&e.target===row.result_operation),id:'duplicate-use',target_port:'again'}),
  ir=>ir.nodes.push({id:'disconnected',parent:row.node,kind:'compute',operator:'sin'}),
  ir=>{const inputs=ir.edges.filter(e=>e.target===row.result_operation);inputs[1].target_port=inputs[0].target_port;},
  ir=>{ir.edges.find(e=>e.target===row.result_operation).iteration={kind:'loop-carried'};}]){
  const ir=structuredClone(original);mutate(ir);assert.equal(trees(draw(ir).graph).length,0);
 }
 // Compile directly as well: presentation caching cannot authorize a cycle.
 const ir=structuredClone(original);ir.edges.push({id:'bad',source:row.result_operation,target:row.entry_operations[0],kind:'data'});
 assert.equal(F.compile({ir,plan:ir,bindings:new Map(),metadata:new Set(),configurationUses:new Set()}).size,0);
});

test('print, semantic and explicit-disabled views keep their existing detail contract',()=>{
 for(const s of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperPipelineSummaries:false}]){const r=draw(read('MergeWeave'),s);assert.equal(r.graph.publication.local_pipelines,undefined);}
});
