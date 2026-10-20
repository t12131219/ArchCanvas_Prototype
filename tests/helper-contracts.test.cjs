'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const source=(name,suffix='current')=>JSON.parse(fs.readFileSync('verification/helper-contracts/current/'+name+'-'+suffix+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'};
test('same-source helper refactoring exposes the real certified phases with less drawing nesting',()=>{
 for(const name of ['WrappedChain','SplitChain','WrappedStages']){
  const ir=source(name),before=JSON.stringify(ir),r=R.render(ir,state),old=R.render(source(name,'before'),state),cert=ir.semantic_contracts.find(c=>c.rule==='feed-forward');
  for(const role of ['input_projection','activation','output_projection'])assert.ok(r.graph.positions.has(cert.roles[role]));
  assert.ok(r.graph.nodes.length<old.graph.nodes.length);assert.ok(r.prepared.quality.native_height_px<old.prepared.quality.native_height_px);
  assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(JSON.stringify(ir),before);
 }
});
test('one nested semantic owner does not turn the whole outer source wrapper into the same computation',()=>{
 const ir=source('NestedChain'),r=R.render(ir,state),cert=ir.semantic_contracts.find(c=>c.rule==='feed-forward'),root=ir.nodes.find(n=>n.parent===null);
 assert.notEqual(cert.node,root.id);assert.equal(r.document.architecture.nodes.find(n=>n.id===root.id).semantic_type,'source-module');
 assert.ok(r.graph.positions.has(cert.roles.activation));
});
test('unknown, conditional, mutable, escaping and disconnected regions retain the same actual SVG',()=>{
 for(const name of ['UnknownChain','ConditionalChain','MutableChain','EscapingChain','DisconnectedChain']){
  const ir=source(name);assert.ok(!(ir.semantic_contracts||[]).some(c=>c.rule==='feed-forward'));
  assert.equal(R.render(ir,state).svg,R.render(source(name,'before'),state).svg);
 }
});
test('source frames and all raw facts remain recoverable after saving and refolding the semantic graph',()=>{
 const ir=source('SplitChain'),before=JSON.stringify(ir),r=R.render(ir,state),frames=R.render(ir,{...state,paperFrameView:'source'});
 assert.ok(frames.graph.nodes.length>r.graph.nodes.length);assert.ok(r.graph.frame_ownership.some(a=>a.kind==='role-source'));
 assert.equal(r.svg,R.render(r.document.ir,r.document.state).svg);assert.equal(r.svg,R.render(ir,state).svg);
 const raw=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(raw.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(raw.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
 assert.equal(JSON.stringify(ir),before);
});
test('shared projection calls retain both identities and sharing relation through semantic presentation',()=>{
 const ir=source('SharedChain'),r=R.render(ir,state),cert=ir.semantic_contracts.find(c=>c.rule==='feed-forward');
 assert.ok(r.graph.positions.has(cert.roles.input_projection)&&r.graph.positions.has(cert.roles.output_projection));
 assert.notEqual(cert.roles.input_projection,cert.roles.output_projection);
 const linears=ir.nodes.filter(n=>n.operator==='linear');assert.equal(new Set(linears.map(n=>n.module_identity)).size,1);
 assert.ok(r.document.architecture.relation_graph.relations.some(x=>x.type==='same-object-calls'));
});
