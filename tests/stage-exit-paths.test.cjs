'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperCompact:true,paperAdaptive:false};
const read=n=>JSON.parse(fs.readFileSync('verification/stage-exit-paths/current/'+n+'.json'));
const render=(n,s={})=>R.render(read(n),{...state,...s});
const done=(r,key)=>r.graph[key].filter(c=>c.status==='fulfilled').map(c=>c.goal).sort();
const facts=r=>({publication:r.graph.publication,nodes:r.graph.nodes,edges:r.graph.edges,
 node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,
 expression_goals:r.graph.expression_goals,summary_goals:r.graph.summary_goals});
function complete(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('a fresh source outlet follows its real expanded region after the complete stage render',()=>{
 const ir=read('OutletWorkshop'),raw=JSON.stringify(ir),a=R.render(ir,{...state,paperRegionFollowers:false}),b=R.render(ir,state),d=b.prepared.routing.stage_exit_refinement;
 assert.ok(d.accepted&&d.local_accepted);assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),raw);
 for(const key of ['facts_preserved','goals_preserved','applied_relations_preserved','geometry_preserved'])assert.ok(d[key],key);
 assert.equal(d.max_trials,1);assert.equal(d.records.length,2);assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);
 assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);assert.deepEqual(b.prepared.quality.line_geometry,a.prepared.quality.line_geometry);
 for(const row of d.records){assert.equal(row.before.y,row.after.y);const p=b.graph.positions.get(row.node);
  for(const edge of row.inputs){const e=b.graph.edges.find(e=>e.id===edge.edge);assert.equal(e.source_port,edge.source_port);assert.equal(e.target_port,edge.target_port);
   const source=b.graph.positions.get(e.source);assert.equal(p.x+p.w/2,source.x+source.w/2);}}
 complete(ir,b.graph);
});
test('unresolved downstream behavior remains an explicit opaque endpoint with its exact use',()=>{
 const a=render('UnknownOutlet',{paperRegionFollowers:false}),b=render('UnknownOutlet');assert.ok(b.prepared.routing.stage_exit_refinement.accepted);
 const n=b.graph.nodes.find(n=>n.kind==='opaque');assert.ok(n);assert.ok(b.prepared.routing.stage_exit_refinement.records.some(r=>r.node===n.id));
 assert.deepEqual(facts(a),facts(b));assert.ok(b.svg.includes('foreign_finish'));assert.ok(n.unresolved||n.kind==='opaque');
});
test('two source regions at a join cannot be interpreted as a single-source outlet',()=>{
 const a=render('JoinedOutlets',{paperRegionFollowers:false}),b=render('JoinedOutlets');assert.equal(b.prepared.routing.stage_exit_refinement,undefined);
 assert.equal(a.svg,b.svg);assert.deepEqual(facts(a),facts(b));
});
test('state inputs and mutable uses keep their actual boundaries and ordinary layout',()=>{
 for(const name of ['StatefulOutlet','MutableOutlet']){const a=render(name,{paperRegionFollowers:false}),b=render(name);
  assert.equal(b.prepared.routing.stage_exit_refinement,undefined);assert.equal(a.svg,b.svg);assert.deepEqual(facts(a),facts(b));complete(read(name),b.graph);}
 assert.ok(read('StatefulOutlet').nodes.some(n=>n.framework_type==='torch.nn.GRUCell'));assert.ok(read('MutableOutlet').nodes.some(n=>n.mutable));
});
test('a proposed conditional-neighbor outlet with no final benefit is rejected without changing the SVG',()=>{
 const a=render('ConditionalOutlet',{paperRegionFollowers:false}),b=render('ConditionalOutlet'),d=b.prepared.routing.stage_exit_refinement;
 assert.ok(d.proposed.length);assert.equal(d.accepted,false);assert.equal(d.geometry_preserved,false);assert.equal(d.local_accepted,false);
 assert.deepEqual(d.before,d.candidate);assert.equal(a.svg,b.svg);assert.deepEqual(facts(a),facts(b));
 assert.ok(b.graph.nodes.some(n=>n.kind==='control'));
});
test('separate shared-module invocations retain their identities and multi-source join',()=>{
 const a=render('SharedOutlets',{paperRegionFollowers:false}),b=render('SharedOutlets');assert.equal(a.svg,b.svg);
 assert.equal(b.prepared.routing.stage_exit_refinement,undefined);assert.deepEqual(facts(a),facts(b));
 const calls=b.graph.nodes.filter(n=>n.module_binding?.selection==='self.prepare');assert.equal(calls.length,2);
 assert.notEqual(calls[0].id,calls[1].id);assert.equal(calls[0].module_binding.reference,calls[1].module_binding.reference);
 assert.notEqual(calls[0].module_binding.invocation,calls[1].module_binding.invocation);
});
test('fulfilled direct and summary goals survive final source-outlet alignment',()=>{
 for(const name of ['OutletWorkshop','UnknownOutlet','ConditionalOutlet','StatefulOutlet','SharedOutlets','MutableOutlet']){
  const a=render(name,{paperRegionFollowers:false}),b=render(name);
  for(const key of ['expression_coverage','summary_coverage'])assert.deepEqual(done(a,key),done(b,key),name);
  const applied=r=>new Set(r.graph.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
  for(const id of applied(a))assert.ok(applied(b).has(id),name+':'+id);}
});
test('saving, reopening and returning from a deeper stage view are deterministic',()=>{
 const ir=read('OutletWorkshop'),a=R.render(ir,state),doc=JSON.parse(JSON.stringify(a.document));assert.equal(R.render(doc.ir,doc.state).svg,a.svg);
 const ids=a.graph.nodes.filter(n=>n.kind==='composite'&&!a.graph.positions.get(n.id).expanded).map(n=>n.id);assert.ok(ids.length);
 const b=R.render(ir,{...state,paperAuto:false,open:[...a.graph.publication.open,...ids]});assert.ok(b.graph.nodes.length>a.graph.nodes.length);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);assert.equal(R.render(ir,state).svg,a.svg);complete(ir,b.graph);
});
test('all extracted source facts are accessible beneath coarse and expanded stages',()=>{
 for(const {entry}of JSON.parse(fs.readFileSync('verification/stage-exit-paths/current/extraction.json')).rows){const ir=read(entry);
  const g=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
  assert.deepEqual(g.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(g.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());}
});
test('opt outs, manual placement, print and other granularity presets do not start the final stage trial',()=>{
 for(const extra of [{paperRegionFollowers:false},{offsets:{[read('OutletWorkshop').nodes[0].id]:{x:1,y:0}}},{paperMedium:'print'},{paperGranularity:'roles'},{paperGranularity:'semantic'}]){
  assert.equal(render('OutletWorkshop',extra).prepared.routing.stage_exit_refinement,undefined);}
});
test('model and class renaming cannot select the outlet primitive',()=>{
 const ir=read('OutletWorkshop'),a=R.render(ir,state);ir.title='Previously unseen';for(const n of ir.nodes){n.source_class='Arbitrary';n.class_name='Arbitrary';}
 const b=R.render(ir,state);assert.deepEqual(b.prepared.routing.stage_exit_refinement,a.prepared.routing.stage_exit_refinement);
 assert.deepEqual([...b.graph.positions],[...a.graph.positions]);
});
