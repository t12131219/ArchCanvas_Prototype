'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const {fixture,state:request}=require('./cross-scope-fixtures.cjs');
// Isolate the scope-port policy from the later coupled-route pass.
const state={...request,paperCoupledRoutes:false};
function scene(right=false){
 const nodes=[{id:'root',parent:null},{id:'from',parent:'root'},{id:'region',parent:'root'},{id:'to',parent:'region'}];
 const positions=new Map([{id:'root',x:0,y:0,w:700,h:700,expanded:true},{id:'from',x:right?600:20,y:550,w:60,h:40},
  {id:'region',x:200,y:100,w:300,h:400,expanded:true},{id:'to',x:300,y:200,w:60,h:40}].map(p=>[p.id,p]));
 const edge={id:'use',source:'from',target:'to',kind:'data',source_port:'result:1',target_port:'kw:foreign'};
 positions.context={idx:{nodes:new Map(nodes.map(n=>[n.id,n]))},edges:[edge],feedback:new Set()};
 return {positions,edge};
}
for(const right of [false,true])test('scope entries face the source on either side and preserve exact ports '+right,()=>{
 const {positions,edge}=scene(right),before=JSON.stringify(edge),c=L.crossScopeEntries(positions);
 assert.equal(c.length,1);assert.equal(c[0].target_side,right?'right':'left');assert.equal(c[0].source_side,right?'left':'right');
 positions.context.crossScopePorts=c;const r=L.route(edge,positions);assert.ok(r.ok);assert.equal(r.source_side,c[0].source_side);assert.equal(r.target_side,c[0].target_side);
 assert.equal(JSON.stringify(edge),before);
 for(const n of positions.values())n.label='Unseen region';assert.deepEqual(L.crossScopeEntries(positions),c);
});
test('ancestor endpoints, inside sources, collapsed or overlapping frames are excluded',()=>{
 for(const change of ['inside','ancestor-source','ancestor-target','collapsed','overlap']){
  const {positions,edge}=scene(),idx=positions.context.idx;
  if(change==='inside')idx.nodes.get('from').parent='region';
  if(change==='ancestor-source')edge.source='region';
  if(change==='ancestor-target')edge.target='root';
  if(change==='collapsed')positions.get('region').expanded=false;
  if(change==='overlap')positions.get('from').x=250;
  assert.deepEqual(L.crossScopeEntries(positions),[],change);
 }
});
test('guarded, state, feedback, control, and established channels cannot acquire ordinary scope entries',()=>{
 for(const extra of [{condition:{branch:'if'}},{design_route:{kind:'state-interface'}},{design_route:{kind:'iteration-feedback'}},
  {kind:'control'},{iteration:{step:1}},{context_lane:{owner:'region',side:'left'}},{layout_after:true},
  {bundle_members:[{kind:'data'},{kind:'data',condition:{branch:'if'}}]},{bundle_members:[{kind:'data'},{kind:'control'}]},
  {condition:{branch:'outer'},bundle_members:[{kind:'data'}]},
  ...['iteration','design_route','context_lane','layout_after'].map(k=>({bundle_members:[{kind:'data',[k]:true}]}))]){
  const {positions,edge}=scene();Object.assign(edge,extra);assert.deepEqual(L.crossScopeEntries(positions),[],JSON.stringify(extra));
 }
});
test('SCC feedback retains its existing routing policy',()=>{
 const {positions,edge}=scene();positions.context.feedback.add(edge.id);assert.deepEqual(L.crossScopeEntries(positions),[]);
});
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,nodes:r.document.layout.nodes,edges:r.graph.edges,
 nodes_accounted:r.graph.node_accounting,edges_accounted:r.graph.edge_accounting,publication:r.document.publication});
const direct=r=>new Set(r.document.expression_coverage.filter(g=>g.status==='fulfilled').map(g=>g.goal));
test('unfamiliar reconvergence improves at a fixed semantic frontier and retains distinct operands',()=>{
 const ir=fixture({right:6,branches:3}),original=JSON.stringify(ir),a=R.render(ir,{...state,paperCrossScopePorts:false}),b=R.render(ir,state);
 const rec=b.prepared.routing.cross_scope_refinement;
 assert.ok(rec.selected.length===3&&rec.attempts.every(t=>t.accepted&&t.facts_preserved));assert.equal(rec.max_trials,3);
 assert.deepEqual(facts(b),facts(a));assert.equal(JSON.stringify(ir),original);
 assert.equal(a.prepared.quality.line_geometry.crossings,5);assert.equal(b.prepared.quality.line_geometry.crossings,4);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);
 assert.ok([...direct(a)].every(id=>direct(b).has(id)));
 const uses=b.document.layout.edges.filter(e=>rec.selected.some(c=>c.edge===e.id));
 assert.equal(new Set(uses.map(e=>e.target_port)).size,3);assert.equal(new Set(uses.map(e=>JSON.stringify(e.route.points[0]))).size,3);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('a crossing reduction exceeding the 2% wire budget is rejected without leaking geometry or cached paths',()=>{
 const ir=fixture({left:8,right:6,branches:3}),a=R.render(ir,{...state,paperCrossScopePorts:false}),b=R.render(ir,state),rec=b.prepared.routing.cross_scope_refinement;
 assert.ok(rec.attempts.some(t=>!t.accepted&&t.candidate.crossings<t.before.crossings&&t.candidate.wire_length>rec.before.wire_length*1.02));
 assert.deepEqual(rec.selected,[]);assert.equal(b.svg,a.svg);assert.equal(b.document.layout.cross_scope_ports,undefined);
 assert.deepEqual(b.prepared.routes,a.prepared.routes);
});
for(const option of ['unknown','guarded'])test(option+' boundaries retain exact evidence without claiming an improvement',()=>{
 const ir=fixture({right:6,branches:3,[option]:true}),a=R.render(ir,{...state,paperCrossScopePorts:false}),b=R.render(ir,state);
 assert.deepEqual(facts(b),facts(a));assert.equal(a.svg,b.svg);
 if(option==='unknown')assert.equal(b.document.ir.nodes.find(n=>n.id==='l5').kind,'opaque');
 else assert.ok(b.document.layout.edges.filter(e=>e.source==='l5').every(e=>e.condition));
});
test('explicit opt-out, manual offsets, print and resource limits bypass automatic trials',()=>{
 const ir=fixture({right:6,branches:3});
 for(const extra of [{paperCrossScopePorts:false},{offsets:{l0:{x:4,y:0}}},{paperMedium:'print'}])
  assert.equal(R.render(ir,{...state,...extra}).prepared.routing.cross_scope_refinement,undefined);
 const b=R.render(ir,{...state,paperCrossScopePorts:false});b.graph.edges=Array(129).fill(b.graph.edges[0]);
 assert.equal(R.prepareCrossScopePorts(ir,state,b),b);assert.equal(b.prepared.routing.cross_scope_refinement,undefined);
});
test('selected-route opt-out remains respected inside a scope-port trial',()=>{
 const b=R.render(fixture({right:6,branches:3}),{...state,paperSelectedRoutes:false});
 assert.ok(b.prepared.routing.cross_scope_refinement?.attempts.length);assert.equal(b.prepared.routing.selected_route_refinement,undefined);
});
