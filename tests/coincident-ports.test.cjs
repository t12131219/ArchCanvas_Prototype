'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),L=require('../semantic_studio/architecture-layout.js');
const {fixture,state:defaults}=require('./coincident-port-fixtures.cjs'),state={...defaults,paperEmptyBandCompaction:false};
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,nodes:r.document.layout.nodes,edges:r.graph.edges,
 node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,representatives:r.graph.representatives,coverage:r.document.expression_coverage});
test('geometric ties keep both conditional alternatives while eliminating their artificial braid',()=>{
 const ir=fixture(),original=JSON.stringify(ir),a=R.render(ir,{...state,paperCoincidentPorts:false}),b=R.render(ir,state),rec=b.prepared.routing.coincident_port_refinement;
 assert.equal(a.prepared.quality.line_geometry.crossings,1);assert.equal(b.prepared.quality.line_geometry.crossings,0);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 assert.deepEqual(rec.selected[0].order.map(i=>i.edge),['e1','e3','e2']);assert.equal(rec.max_trials,3);assert.ok(rec.attempts.every(t=>t.accepted));
 assert.equal(b.graph.edges.filter(e=>e.condition?.outcome==='true').length,2);assert.equal(b.graph.edges.filter(e=>e.condition?.outcome==='false').length,1);
 assert.notEqual(b.graph.edges.find(e=>e.id==='e1').target_port,b.graph.edges.find(e=>e.id==='e3').target_port);
});
test('only selected ports move; sides and every opposite physical terminal stay exact',()=>{
 const a=R.render(fixture(),{...state,paperCoincidentPorts:false}),b=R.render(fixture(),state),old=new Map(a.prepared.routes.map(e=>[e.id,e])),used=new Set();
 for(const e of b.prepared.routes){const prev=old.get(e.id);assert.equal(e.route.source_side,prev.route.source_side);assert.equal(e.route.target_side,prev.route.target_side);
  assert.deepEqual(e.route.points[0],prev.route.points[0]);if(e.target!=='sink')assert.deepEqual(e.route.points.at(-1),prev.route.points.at(-1));
  for(const [id,p]of [[e.source,e.route.points[0]],[e.target,e.route.points.at(-1)]]){const key=JSON.stringify([id,p]);assert.ok(!used.has(key));used.add(key);}
 }
 assert.deepEqual(b.prepared.quality.line_geometry.unrelated_contacts,[]);assert.deepEqual(b.prepared.quality.route_failures,[]);
});
test('separate neighbor coordinates, expanded endpoints and protected channels are not tie evidence',()=>{
 const a=R.render(fixture(),{...state,paperCoincidentPorts:false}),pos=a.graph.positions;
 pos.get('a').x+=1;assert.deepEqual(L.coincidentPorts(pos,a.prepared.routes),[]);pos.get('a').x-=1;
 for(const guard of [{expanded:true},{cyclic:true}]){const old={...pos.get('sink')};Object.assign(pos.get('sink'),guard);assert.deepEqual(L.coincidentPorts(pos,a.prepared.routes),[]);pos.set('sink',old);}
 for(const guard of [{kind:'state-read'},{design_route:{kind:'bypass'}},{context_lane:{owner:'root'}},{iteration:{step:1}},{layout_after:'a'}]){
  const edges=JSON.parse(JSON.stringify(a.prepared.routes));Object.assign(edges.find(e=>e.id==='e2'),guard);assert.deepEqual(L.coincidentPorts(pos,edges),[]);
 }
});
test('unknown, shared and mutable producers retain their facts without value-equivalence claims',()=>{
 for(const guard of [{kind:'opaque'},{identity_display:{kind:'same-object-calls',invocation:1,count:2}},{mutable:true},{kind:'state'}]){
  const ir=fixture();Object.assign(ir.nodes.find(n=>n.id==='b'),guard);const a=R.render(ir,{...state,paperCoincidentPorts:false}),b=R.render(ir,state);
  assert.deepEqual(facts(a),facts(b));assert.deepEqual(b.document.ir.nodes.find(n=>n.id==='b'),ir.nodes.find(n=>n.id==='b'));
  assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings);
 }
});
test('names and port spelling provide no selection evidence',()=>{
 const a=R.render(fixture(),state),ir=fixture();ir.title='Other program';for(const n of ir.nodes){n.label='Foreign';n.class_name='Other';}
 for(const e of ir.edges){e.source_port='output:'+e.source_port;e.target_port='slot:'+e.target_port;}
 const b=R.render(ir,state);assert.deepEqual(b.prepared.routing.coincident_port_refinement.selected,a.prepared.routing.coincident_port_refinement.selected);
 assert.equal(b.prepared.quality.line_geometry.crossings,0);assert.deepEqual(b.graph.edges.map(e=>e.target_port),ir.edges.map(e=>e.target_port));
});
test('manual geometry, print, explicit opt-out and resource budgets bypass the final stage',()=>{
 const ir=fixture();for(const extra of [{paperCoincidentPorts:false},{paperMedium:'print'},{offsets:{a:{x:1,y:0}}}])assert.equal(R.render(ir,{...state,...extra}).prepared.routing.coincident_port_refinement,undefined);
 const a=R.render(ir,{...state,paperCoincidentPorts:false});a.graph.edges=Array(129).fill(a.graph.edges[0]);assert.equal(R.prepareCoincidentPorts(ir,state,a),a);
});
test('save, fold, restore and selected-route opt-out retain independent alternatives',()=>{
 const ir=fixture(),a=R.render(ir,state),folded=R.render(ir,{...state,open:[]}),saved=JSON.parse(JSON.stringify(a.document));
 assert.ok(folded.graph.nodes.length<a.graph.nodes.length);assert.equal(R.render(saved.ir,saved.state).svg,a.svg);assert.equal(R.render(ir,state).svg,a.svg);
 const noPolish=R.render(ir,{...state,paperSelectedRoutes:false});assert.equal(noPolish.prepared.routing.selected_route_refinement,undefined);
 assert.equal(noPolish.prepared.quality.line_geometry.crossings,0);assert.deepEqual(facts(noPolish),facts(a));
});
for(const name of ['ForeignReturn','UnknownReturn','NestedReturn'])test(name+' retains source control and reversible details',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/coincident-ports/current/'+name+'.json'));
 const s={...defaults,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)},a=R.render(ir,{...s,paperCoincidentPorts:false}),b=R.render(ir,s);
 assert.deepEqual(facts(a),facts(b));assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 assert.ok(ir.nodes.some(n=>n.kind==='control'));if(name==='UnknownReturn')assert.ok(ir.nodes.some(n=>n.kind==='opaque'));
 const folded=R.render(ir,{...s,open:[]});assert.ok(folded.graph.nodes.length<b.graph.nodes.length);assert.equal(R.render(ir,s).svg,b.svg);
});
