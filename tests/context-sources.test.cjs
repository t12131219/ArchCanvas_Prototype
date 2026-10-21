'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js'),L=require('../semantic_studio/architecture-layout.js');
const {fixture,state}=require('./context-source-fixtures.cjs');
const facts=r=>({ir:r.document.ir,nodes:r.document.layout.nodes,edges:r.graph.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.kind,e.condition,e.originals,e.bundle_members]),
  nodes_accounted:r.graph.node_accounting,edges_accounted:r.graph.edge_accounting,open:r.graph.publication.open});
for(const unknown of [false,true])test('measured source facing removes a crossing and preserves repeated exact operands'+(unknown?' at an unknown boundary':''),()=>{
  const ir=fixture({unknown}),original=JSON.stringify(ir),a=R.render(ir,{...state,paperContextSourceFacing:false}),b=R.render(ir,state),receipt=b.prepared.routing.context_source_refinement;
  assert.ok(receipt.accepted);assert.deepEqual(facts(b),facts(a));assert.equal(JSON.stringify(ir),original);
  assert.equal(a.prepared.quality.line_geometry.crossings,1);assert.equal(b.prepared.quality.line_geometry.crossings,0);
  assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);assert.deepEqual(b.prepared.quality.issues,[]);
  const uses=b.prepared.routes.filter(e=>e.source==='c'&&e.target==='z');assert.equal(uses.length,2);
  assert.ok(uses.every(e=>e.route.ok&&e.route.source_side==='right'));
  assert.notDeepEqual(uses[0].route.points[0],uses[1].route.points[0]);assert.notEqual(uses[0].target_port,uses[1].target_port);
  if(unknown)assert.equal(b.graph.nodes.find(n=>n.id==='c').kind,'opaque');
  assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('balanced branches already face each other and are left byte-identical',()=>{
  const ir=fixture({balanced:true}),a=R.render(ir,{...state,paperContextSourceFacing:false}),b=R.render(ir,state);
  assert.equal(a.svg,b.svg);assert.equal(b.prepared.routing.context_source_refinement,undefined);
});
test('guarded external operands cannot become ordinary side entries',()=>{
  const ir=fixture({guarded:true}),r=R.render(ir,state);
  assert.ok(r.graph.edges.filter(e=>e.source==='c').every(e=>e.condition&&!e.context_lane));
  assert.equal(r.prepared.routing.context_source_refinement,undefined);
});
test('manual offsets and explicit policy bypass automatic source routing selection',()=>{
  const ir=fixture();
  for(const extra of [{paperContextSourceFacing:false},{offsets:{c:{x:8,y:0}}}])assert.equal(R.render(ir,{...state,...extra}).prepared.routing.context_source_refinement,undefined);
  assert.equal(R.render(ir,{...state,paperMedium:'print'}).prepared.routing.context_source_refinement,undefined);
});
test('labels, operators and family names do not authorize source-facing geometry',()=>{
  const a=R.render(fixture(),state),renamed=fixture();
  for(const n of renamed.nodes){n.label='other';n.class_name='Unseen';if(n.operator)n.operator='foreign';}
  const b=R.render(renamed,state);assert.ok(b.prepared.routing.context_source_refinement.accepted);
  assert.deepEqual(b.prepared.routing.context_source_refinement.changes,a.prepared.routing.context_source_refinement.changes);
});
test('ancestor, state, feedback and conditional routes retain existing source policies',()=>{
  const r=R.render(fixture(),{...state,paperContextSourceFacing:true}),edge=r.graph.edges.find(e=>e.source==='c'&&e.context_lane),positions=r.graph.positions;
  for(const extra of [{condition:{branch:'if'}},{kind:'control'},{design_route:{kind:'state-interface'}},{design_route:{kind:'iteration-feedback'}},{source:'root'},{source:'right'},{target:'root'}])assert.equal(L.contextSourceSide({...edge,...extra},positions),null);
  assert.equal(L.contextSourceSide({...edge,bundle_members:[{kind:'data'},{kind:'data',condition:{branch:'if'}}]},positions),null);
});
test('folding and restoring a source region preserves canonical accounting and selection',()=>{
  const ir=fixture(),a=R.render(ir,state),folded=R.render(ir,{...state,open:['root','right']}),restored=R.render(ir,state);
  assert.ok(!folded.graph.positions.has('c'));
  for(const r of [a,folded,restored])for(const [bucket,key]of [['node_accounting','nodes'],['edge_accounting','edges']]){
    const ids=Object.values(r.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),ir[key].map(n=>n.id).sort());
  }
  assert.equal(restored.svg,a.svg);
});
