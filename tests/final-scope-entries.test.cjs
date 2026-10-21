'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const {fixture,state:request}=require('./cross-scope-fixtures.cjs');
// Isolate scope-port coordinates from later route and narrow-band passes.
const state={...request,paperCoupledRoutes:false,paperResidualBands:false,paperSourcePortOrder:false};
const input=extra=>fixture({left:4,right:4,branches:4,...extra});
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,nodes:r.document.layout.nodes,edges:r.graph.edges,
 node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,representatives:r.graph.representatives,coverage:r.document.expression_coverage});
test('final review retains distant routes when a full reroute exceeds the wire budget',()=>{
 const ir=input(),original=JSON.stringify(ir),a=R.render(ir,{...state,paperFinalScopeEntries:false}),b=R.render(ir,state),rec=b.prepared.routing.final_scope_entry_refinement;
 assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 assert.equal(a.prepared.quality.line_geometry.crossings,10);assert.equal(b.prepared.quality.line_geometry.crossings,8);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);
 assert.deepEqual(rec.attempts.map(t=>[t.route_mode,t.accepted]),[['full',false],['retained',true]]);
 assert.ok(rec.attempts[0].candidate.wire_length>rec.before.wire_length);assert.ok(rec.attempts[1].distinct_terminals);
 assert.equal(rec.selected.length,4);assert.equal(rec.max_trials,6);
 const uses=b.prepared.routes.filter(e=>rec.selected.some(c=>c.edge===e.id));
 assert.equal(new Set(uses.map(e=>e.target_port)).size,4);assert.equal(new Set(uses.map(e=>JSON.stringify(e.route.points[0]))).size,4);
 assert.ok(uses.every(e=>e.route.ok&&e.route.source_side==='right'&&e.route.target_side==='left'));
 const touched=new Set(rec.attempts[1].refreshed_edges),old=new Map(a.prepared.routes.map(e=>[e.id,e]));
 const distant=b.prepared.routes.filter(e=>!touched.has(e.id));assert.ok(distant.some(e=>JSON.stringify(e)===JSON.stringify(old.get(e.id))));
 // Optional selected-route polishing may further improve a distant path,
 // while holding its exact physical terminals fixed.
 for(const e of distant)assert.deepEqual([e.route.points[0],e.route.points.at(-1)],[old.get(e.id).route.points[0],old.get(e.id).route.points.at(-1)]);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('all uses sharing changed endpoints receive refreshed terminals',()=>{
 const b=R.render(input(),state),rec=b.prepared.routing.final_scope_entry_refinement,t=rec.attempts.find(t=>t.accepted),edges=new Map(b.graph.edges.map(e=>[e.id,e]));
 const peers=new Set(t.entries.flatMap(c=>[edges.get(c.edge).source,edges.get(c.edge).target]));
 for(const e of edges.values())if(peers.has(e.source)||peers.has(e.target))assert.ok(t.refreshed_edges.includes(e.id));
 const terminals=new Set();for(const e of b.prepared.routes)for(const [node,role,p]of [[e.source,true,e.route.points[0]],[e.target,false,e.route.points.at(-1)]]){
  const key=JSON.stringify([node,role,p]);assert.ok(!terminals.has(key));terminals.add(key);
 }
});
test('lower crossings still cannot authorize longer wire or leak a rejected port plan',()=>{
 const ir=input({left:8,right:6,branches:3}),a=R.render(ir,{...state,paperFinalScopeEntries:false}),b=R.render(ir,state),rec=b.prepared.routing.final_scope_entry_refinement;
 assert.ok(rec.attempts.every(t=>!t.accepted&&t.candidate.crossings<t.before.crossings&&t.candidate.wire_length>t.before.wire_length));
 assert.equal(b.svg,a.svg);assert.deepEqual(b.prepared.routes,a.prepared.routes);assert.deepEqual(rec.selected,rec.initial_entries);assert.deepEqual(facts(a),facts(b));
});
for(const flag of ['unknown','guarded'])test(flag+' boundaries preserve their original facts and selected geometry',()=>{
 const ir=input({[flag]:true}),a=R.render(ir,{...state,paperFinalScopeEntries:false}),b=R.render(ir,state);
 assert.deepEqual(facts(a),facts(b));assert.equal(a.svg,b.svg);
 if(flag==='unknown')assert.equal(b.document.ir.nodes.find(n=>n.id==='l3').kind,'opaque');
 else assert.ok(b.graph.edges.filter(e=>e.source==='l3').every(e=>e.condition));
});
test('renaming the model, scopes and operators does not provide port selection evidence',()=>{
 const a=R.render(input(),state),ir=input();ir.title='Foreign mosaic';for(const n of ir.nodes){n.label='Unseen';n.class_name='Other';if(n.operator)n.operator='foreign';}
 const b=R.render(ir,state);assert.deepEqual(b.prepared.routing.final_scope_entry_refinement.selected,a.prepared.routing.final_scope_entry_refinement.selected);
 assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
});
test('folding, restoring and saved state preserve the final-review result',()=>{
 const ir=input(),a=R.render(ir,state),folded=R.render(ir,{...state,open:['root','right']}),b=R.render(ir,state);
 assert.ok(!folded.graph.positions.has('l3'));assert.equal(b.svg,a.svg);
 for(const r of [a,folded,b])for(const [key,raw]of [['node_accounting','nodes'],['edge_accounting','edges']]){
  const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),ir[raw].map(n=>n.id).sort());
 }
});
test('manual geometry, print, policy opt-outs and resource limits bypass final review',()=>{
 const ir=input();for(const extra of [{paperFinalScopeEntries:false},{paperCrossScopePorts:false},{paperMedium:'print'},{offsets:{l0:{x:4,y:0}}}])assert.equal(R.render(ir,{...state,...extra}).prepared.routing.final_scope_entry_refinement,undefined);
 const b=R.render(ir,{...state,paperFinalScopeEntries:false});b.graph.edges=Array(129).fill(b.graph.edges[0]);assert.equal(R.prepareCrossScopePorts(ir,state,b,{final:true}),b);
});
test('explicit selected-route opt-out remains honored in final candidates',()=>{
 const r=R.render(input(),{...state,paperSelectedRoutes:false});assert.ok(r.prepared.routing.final_scope_entry_refinement?.attempts.length);assert.equal(r.prepared.routing.selected_route_refinement,undefined);
});
