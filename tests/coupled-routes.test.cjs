'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const {fixture,state:request}=require('./cross-scope-fixtures.cjs');
// Keep this stage's fixed-terminal checks independent of later port swaps.
const state={...request,paperSourcePortOrder:false};
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,nodes:r.document.layout.nodes,
 edges:r.graph.edges,coverage:r.document.expression_coverage,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting});
test('an unfamiliar reconvergence leaves a single-wire local minimum without changing its frontier or terminals',()=>{
 const ir=fixture({right:6,branches:3}),original=JSON.stringify(ir),a=R.render(ir,{...state,paperCoupledRoutes:false}),b=R.render(ir,state);
 assert.equal(a.prepared.quality.line_geometry.crossings,4);assert.equal(b.prepared.quality.line_geometry.crossings,2);
 assert.equal(b.prepared.quality.wire_length,a.prepared.quality.wire_length);assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 const record=b.prepared.routing.coupled_route_refinement,accepted=record.attempts.filter(t=>t.accepted);
 assert.ok(accepted.length);assert.ok(record.attempts.length<=record.max_attempts);
 const old=new Map(a.prepared.routes.map(e=>[e.id,e])),touched=new Set(accepted.flatMap(t=>t.edges));
 for(const e of b.prepared.routes){const was=old.get(e.id);
  assert.deepEqual([e.route.source_side,e.route.target_side,e.route.points[0],e.route.points.at(-1)],
   [was.route.source_side,was.route.target_side,was.route.points[0],was.route.points.at(-1)]);
  if(!touched.has(e.id))assert.deepEqual(e,was);
 }
 assert.ok(accepted.every(t=>t.facts_preserved&&t.physical_terminals_preserved&&t.direct_goals_candidate>=t.direct_goals_before));
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 const folded=R.render(ir,{...state,open:['root','right']});assert.ok(!folded.graph.positions.has('l5'));
 assert.equal(R.render(ir,state).svg,b.svg);
});
test('labels and model or operator names do not license a coupled repair',()=>{
 const ir=fixture({right:6,branches:3}),a=R.render(ir,state);
 ir.title='NeverSeen';for(const n of ir.nodes){n.label='foreign';n.class_name='Another';if(n.operator)n.operator='novel';}
 const b=R.render(ir,state);
 assert.deepEqual(b.prepared.routing.coupled_route_refinement.attempts.filter(t=>t.accepted).map(t=>t.edges),
  a.prepared.routing.coupled_route_refinement.attempts.filter(t=>t.accepted).map(t=>t.edges));
 assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
});
for(const flag of ['unknown','guarded'])test(flag+' boundaries and exact conditions remain intact',()=>{
 const ir=fixture({right:6,branches:3,[flag]:true}),a=R.render(ir,{...state,paperCoupledRoutes:false}),b=R.render(ir,state);
 assert.deepEqual(facts(a),facts(b));assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings);
 if(flag==='unknown')assert.equal(b.document.ir.nodes.find(n=>n.id==='l5').kind,'opaque');
 else assert.ok(b.graph.edges.filter(e=>e.source==='l5').every(e=>e.condition));
});
test('rejected coupled paths do not leak their caches, receipts or selected routes',()=>{
 const ir=fixture({left:8,right:6,branches:3}),a=R.render(ir,{...state,paperCoupledRoutes:false}),b=R.render(ir,state);
 const r=b.prepared.routing.coupled_route_refinement;assert.ok(r.attempts.length&&r.attempts.every(t=>!t.accepted));
 assert.deepEqual(facts(a),facts(b));assert.deepEqual(a.graph.constraint_receipts,b.graph.constraint_receipts);
 assert.deepEqual(a.prepared.routes,b.prepared.routes);assert.equal(a.svg,b.svg);
});
test('state, feedback, control and explicitly routed boundaries retain their selected paths',()=>{
 for(const guard of ['control','state','feedback','context','iteration']){
  const ir=fixture({right:6,branches:3}),b=R.render(ir,{...state,paperCoupledRoutes:false});
  for(const e of b.prepared.routes){
   if(guard==='control')e.kind='control';
   if(guard==='state')e.design_route={kind:'state-interface'};
   if(guard==='feedback')b.graph.positions.context.feedback.add(e.id);
   if(guard==='context')e.context_lane={owner:'right',side:'left'};
   if(guard==='iteration')e.iteration={step:1};
  }
  assert.equal(R.prepareCoupledRoutes(ir,state,b),b);
 }
});
test('manual geometry, print, opt-out and the route resource limit bypass coupled search',()=>{
 const ir=fixture({right:6,branches:3});
 for(const extra of [{paperCoupledRoutes:false},{paperMedium:'print'},{offsets:{l0:{x:4,y:0}}}])
  assert.equal(R.render(ir,{...state,...extra}).prepared.routing.coupled_route_refinement,undefined);
 const b=R.render(ir,{...state,paperCoupledRoutes:false});b.graph.edges=Array(129).fill(b.graph.edges[0]);
 assert.equal(R.prepareCoupledRoutes(ir,state,b),b);
});
