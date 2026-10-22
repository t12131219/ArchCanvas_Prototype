'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine'),F=require('../semantic_studio/local-pipelines'),G=require('../semantic_studio/summary-goals');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages'};
const read=n=>JSON.parse(fs.readFileSync('verification/read-binding-rows/current/'+n+'.json'));
const render=(n,s={})=>R.render(read(n),{...state,...s});
const rows=r=>r.graph.nodes.filter(n=>n.paper.read_binding_rows);
const fulfilled=(r,key)=>r.graph[key].filter(c=>c.status==='fulfilled').map(c=>c.goal).sort();
test('measured use rows retain the frontier, accounting, exact edges and fulfilled goals',()=>{
 const ir=read('ReusedWorkshop'),raw=JSON.stringify(ir),a=R.render(ir,{...state,paperReadBindingRows:false}),b=R.render(ir,state);
 assert.ok(b.prepared.routing.read_binding_rows.accepted);assert.equal(rows(b).length,1);
 assert.deepEqual(a.graph.publication,b.graph.publication);assert.deepEqual(a.graph.node_accounting,b.graph.node_accounting);assert.deepEqual(a.graph.edge_accounting,b.graph.edge_accounting);
 assert.deepEqual(a.graph.edges,b.graph.edges);assert.deepEqual(fulfilled(a,'expression_coverage'),fulfilled(b,'expression_coverage'));assert.deepEqual(fulfilled(a,'summary_coverage'),fulfilled(b,'summary_coverage'));
 assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);assert.equal(JSON.stringify(ir),raw);
 assert.ok(rows(b)[0].paper.title.endsWith(' · tanh'));
});
test('one shared intermediate result has two exact operand uses, without duplicated operations',()=>{
 const r=render('ReusedWorkshop'),display=rows(r)[0].paper.read_binding_rows,mul=display.rows.find(r=>r.label==='mult');
 assert.equal(display.rows.length,4);assert.equal(mul.uses.length,2);assert.deepEqual(mul.uses.map(u=>u.target_port),['0','2']);
 assert.equal(mul.uses[0].producer,mul.uses[1].producer);assert.equal(mul.uses[0].value,mul.uses[1].value);
 assert.equal(new Set(display.rows.map(r=>r.node)).size,display.rows.length);
});
test('read references follow canonical identities even when two labels have the same spelling',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/source-read-paths/current/PairReads.json')),r=R.render(ir,state);
 const p=structuredClone(r.graph.nodes.find(n=>n.local_pipeline?.source_reads?.length===2).local_pipeline);
 for(const n of p.source_reads)n.expression='self.same';
 const display=F.bindingRows(p);assert.equal(display.reads.length,2);assert.notEqual(display.reads[0].node,display.reads[1].node);
 assert.ok(display.rows.some(r=>r.text.includes('read1("self.same")')));assert.ok(display.rows.some(r=>r.text.includes('read2("self.same")')));
});
test('tuple packing and both getitem operations remain explicit in a six-operation DAG',()=>{
 const r=render('TupleWorkshop'),d=rows(r)[0].paper.read_binding_rows;
 assert.equal(d.rows.length,6);assert.equal(d.rows.filter(r=>r.label==='getitem').length,2);
 const pack=d.rows.find(r=>r.label==='structure');assert.deepEqual(pack.uses.map(r=>r.target_port),['0','1']);
 assert.ok(d.rows.filter(r=>r.label==='getitem').every(r=>r.uses.some(u=>u.producer===pack.node)));
 assert.ok(r.graph.summary_coverage.every(r=>r.status==='fulfilled'));
});
test('unknown, condition and state boundaries beside the helper remain visible with unchanged bindings',()=>{
 for(const name of ['UnknownNeighbor','ConditionalNeighbor','StatefulNeighbor']){
  const ir=read(name),a=render(name,{paperReadBindingRows:false}),b=render(name);
  assert.ok(rows(b).length,name);for(const n of ir.nodes.filter(n=>['opaque','control'].includes(n.kind)||n.state_interface))assert.equal(b.graph.positions.has(n.id),a.graph.positions.has(n.id));
  assert.deepEqual(a.graph.edges,b.graph.edges);assert.deepEqual(a.graph.publication,b.graph.publication);
 }
});
test('shared module calls keep separate cards, call numbers and canonical read nodes',()=>{
 const r=render('SharedNeighbor'),ns=rows(r);assert.equal(ns.length,2);
 assert.deepEqual(ns.map(n=>n.local_pipeline.owner_identity.invocation),[1,2]);
 assert.equal(ns[0].local_pipeline.owner_identity.reference,ns[1].local_pipeline.owner_identity.reference);
 assert.notEqual(ns[0].paper.read_binding_rows.reads[0].node,ns[1].paper.read_binding_rows.reads[0].node);
 for(const n of ns)assert.ok(n.paper.captions.join(' ').includes('source call '+n.local_pipeline.owner_identity.invocation+'/2'));
});
test('the summary evaluator rejects omitted use text and forged use, read and input identities',()=>{
 const r=render('ReusedWorkshop'),node=rows(r)[0];
 for(const mutate of [n=>n.paper.captions=n.paper.captions.filter(s=>!s.includes('#2 mult')),
  n=>n.paper.read_binding_rows.rows[0].uses[0].target_port='wrong',n=>n.paper.read_binding_rows.reads[0].node='wrong',
  n=>n.paper.read_binding_rows.inputs[0].node='wrong',n=>n.paper.read_binding_rows.rows.pop()]){
  const nodes=r.graph.nodes.map(n=>n.id===node.id?structuredClone(n):n);mutate(nodes.find(n=>n.id===node.id));
  const checks=G.evaluate(r.graph.summary_goals,r.document.ir,{...r.graph,nodes},r.prepared);
  assert.equal(checks.find(c=>c.node===node.id).status,'unfulfilled');
 }
});
test('long names wrap without losing characters or altering canonical source reads',()=>{
 const r=render('LongWorkshop'),n=rows(r)[0],d=n.paper.read_binding_rows;
 assert.ok(n.paper.captions.join('').replace(/\s/g,'').includes(d.reads[0].expression));assert.ok(d.reads[0].expression.length>60);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.ok(r.graph.summary_coverage.find(c=>c.node===n.id).status==='fulfilled');
});
test('opening the helper, saving, reopening and returning preserve exact operations and source expansion',()=>{
 const ir=read('ReusedWorkshop'),a=R.render(ir,state),p=rows(a)[0].local_pipeline;
 const open=[...a.graph.publication.open,p.node,...(p.display_partitions||[]).map(p=>p.node)];
 const b=R.render(ir,{...state,paperAuto:false,open});assert.ok(p.operations.every(n=>b.graph.positions.has(n.node)));
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);assert.equal(R.render(ir,state).svg,a.svg);
 const source=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(source.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(source.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
});
test('opt outs retain the ordinary printing and protected presets do not start a layout trial',()=>{
 const a=render('ReusedWorkshop',{paperReadBindingRows:false});assert.equal(rows(a).length,0);assert.ok(a.svg.includes('Reads self.offset'));
 for(const s of [{paperGranularity:'roles'},{paperMedium:'print'},{offsets:{[read('ReusedWorkshop').nodes[0].id]:{x:1,y:0}}}])assert.equal(render('ReusedWorkshop',s).prepared.routing.read_binding_rows,undefined);
});
test('a longer result label that increases height is rejected after measuring the complete graph',()=>{
 const ordinary=render('WideLabelWorkshop',{paperReadBindingRows:false}),chosen=render('WideLabelWorkshop'),forced=render('WideLabelWorkshop',{paperReadBindingRows:true});
 const decision=chosen.prepared.routing.read_binding_rows;assert.equal(decision.accepted,false);assert.equal(decision.geometry_preserved,false);
 assert.ok(forced.prepared.quality.native_height_px>ordinary.prepared.quality.native_height_px);assert.equal(chosen.svg,ordinary.svg);
 assert.equal(rows(chosen).length,0);assert.ok(rows(forced).length);
});
test('class and display renaming do not change canonical use references or source-read eligibility',()=>{
 const ir=read('ReusedWorkshop'),a=R.render(ir,state);ir.title='Unseen';
 for(const n of ir.nodes){n.label='Unfamiliar';n.source_class='Unseen';n.class_name='Unseen';}
 const b=R.render(ir,state);assert.deepEqual(rows(a).map(n=>n.paper.read_binding_rows),rows(b).map(n=>n.paper.read_binding_rows));
 assert.deepEqual(a.graph.publication.local_pipelines,b.graph.publication.local_pipelines);
});
