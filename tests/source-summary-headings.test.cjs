'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),G=require('../semantic_studio/summary-goals'),E=require('../semantic_studio/semantic-engine');
const state={paperMedium:'canvas',paperGranularity:'stages',paperAdaptive:false};
const read=n=>JSON.parse(fs.readFileSync('verification/source-summary-headings/current/'+n+'.json'));
const render=(name,s={})=>R.render(read(name),{...state,...s});
const headings=r=>r.graph.nodes.filter(n=>n.paper.source_heading);
const done=(r,k)=>r.graph[k].filter(c=>c.status==='fulfilled').map(c=>c.goal);
test('source headings retain the exact computation, cuts, frontier, accounting and geometry',()=>{
 const ir=read('UnnamedWork'),raw=JSON.stringify(ir),a=R.render(ir,{...state,paperSourceHeadings:false}),b=R.render(ir,state),d=b.prepared.routing.source_summary_headings;
 assert.ok(d.accepted);for(const key of ['facts_preserved','goals_preserved','applied_relations_preserved','geometry_preserved'])assert.ok(d[key],key);
 assert.equal(d.max_trials,1);assert.deepEqual(d.before,d.candidate);
 for(const k of ['publication','edges','edge_accounting','node_accounting','expression_goals','summary_goals'])assert.deepEqual(a.graph[k],b.graph[k],k);
 for(const k of ['expression_coverage','summary_coverage'])assert.deepEqual(done(a,k),done(b,k));
 const n=headings(b)[0];assert.equal(n.paper.title,'Source: adjust');assert.ok(n.paper.captions.join('').includes('Result #4 · sin · Dependency DAG'));
 assert.deepEqual(n.paper.read_binding_rows,a.graph.nodes.find(m=>m.id===n.id).paper.read_binding_rows);assert.equal(JSON.stringify(ir),raw);
});
test('source naming never certifies a module family, including misleading familiar labels',()=>{
 const ir=read('UnnamedWork'),a=R.render(ir,state);ir.title='Transformer';
 for(const n of ir.nodes){n.source_class='Transformer';n.class_name='LSTM';if(n.id===headings(a)[0].id)n.label='Attention';}
 const b=R.render(ir,state),n=headings(b)[0];assert.equal(n.paper.title,'Source: Attention');
 assert.deepEqual(a.graph.publication,b.graph.publication);assert.deepEqual(a.graph.edges,b.graph.edges);
 assert.equal(n.semantic_type,'source-module');assert.equal(n.semantic_contracts?.length||0,0);
});
test('every relocated result, use row, alias and canonical identity is independently required',()=>{
 const r=render('UnnamedWork'),node=headings(r)[0];
 const changes=[n=>n.paper.source_heading.label='made up',n=>n.paper.source_heading.node='other',
  n=>n.paper.source_heading.result_title='Result #1',n=>n.paper.source_heading.schema='wrong',
  n=>n.paper.lines=['Source: guessed'],n=>n.paper.captions=n.paper.captions.slice(1),
  n=>n.paper.captions=n.paper.captions.filter(s=>!s.includes('#2 mult')),
  n=>n.paper.read_binding_rows.rows[0].uses[0].target_port='wrong',n=>delete n.paper.source_heading];
 for(const change of changes){const nodes=structuredClone(r.graph.nodes);change(nodes.find(n=>n.id===node.id));
  const checks=G.evaluate(r.graph.summary_goals,r.document.ir,{...r.graph,nodes},r.prepared);
  assert.equal(checks.find(c=>c.node===node.id).status,'unfulfilled');}
});
test('long source labels are rejected by the complete geometry comparison',()=>{
 const a=render('LongAlias',{paperSourceHeadings:false}),b=render('LongAlias'),forced=render('LongAlias',{paperSourceHeadings:true});
 const d=b.prepared.routing.source_summary_headings;assert.ok(d);assert.equal(d.accepted,false);assert.equal(d.geometry_preserved,false);
 assert.equal(a.svg,b.svg);assert.equal(headings(b).length,0);assert.ok(forced.prepared.quality.native_height_px>a.prepared.quality.native_height_px);
});
test('unknown, state, condition and mutable neighbors remain explicit with exact bindings',()=>{
 for(const name of ['UnknownBoundary','StateBoundary','ConditionalBoundary','MutableBoundary']){
  const a=render(name,{paperSourceHeadings:false}),b=render(name);assert.ok(headings(b).length,name);
  assert.deepEqual(a.graph.edges,b.graph.edges);assert.deepEqual(a.graph.publication,b.graph.publication);
  for(const n of read(name).nodes.filter(n=>['opaque','control'].includes(n.kind)||n.mutable||n.state_interface))assert.equal(a.graph.positions.has(n.id),b.graph.positions.has(n.id));
 }
 assert.ok(render('UnknownBoundary').svg.includes('foreign_transform'));
 assert.equal(headings(render('ProtectedInside')).length,0);
});
test('shared calls retain separate references and printed invocation numbers',()=>{
 const r=render('SharedBoundary'),ns=headings(r);assert.equal(ns.length,2);
 assert.notEqual(ns[0].id,ns[1].id);assert.notEqual(ns[0].paper.read_binding_rows.reads[0].node,ns[1].paper.read_binding_rows.reads[0].node);
 for(const n of ns)assert.ok(n.paper.captions.join('').includes('source call '+n.local_pipeline.owner_identity.invocation+'/2'));
});
test('saving, reopening, deeper operations and complete source detail remain accessible',()=>{
 const ir=read('UnnamedWork'),a=R.render(ir,state),n=headings(a)[0];assert.equal(R.render(a.document.ir,a.document.state).svg,a.svg);
 const b=R.render(ir,{...state,paperAuto:false,open:[...a.graph.publication.open,n.id,...(n.local_pipeline.display_partitions||[]).map(p=>p.node)]});
 assert.ok(n.local_pipeline.operations.every(o=>b.graph.positions.has(o.node)));assert.equal(headings(b).length,0);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);assert.equal(R.render(ir,state).svg,a.svg);
 const c=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(c.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(c.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
});
test('opt outs, non-stage views, print, manual offsets and missing use rows do not start the trial',()=>{
 for(const s of [{paperSourceHeadings:false},{paperReadBindingRows:false},{paperGranularity:'roles'},{paperGranularity:'semantic'},{paperMedium:'print'},
  {offsets:{[read('UnnamedWork').nodes[0].id]:{x:1,y:0}}}]){
  const r=render('UnnamedWork',s);assert.equal(r.prepared.routing.source_summary_headings,undefined);assert.equal(headings(r).length,0);
 }
});
