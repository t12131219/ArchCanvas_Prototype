'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../semantic_studio/architecture.js'),R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const read=name=>JSON.parse(fs.readFileSync('verification/cell-interfaces/current/'+name+'.json'));
const states=ir=>A.build(ir).relation_graph.relations.filter(r=>r.type==='state-interface');
const request={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
test('registered single-step contracts distinguish tensor and state-pair returns, without a time claim',()=>{
 for(const [name,type,roles]of [['StepGate','torch.nn.GRUCell',['step-input','initial-state','final-state']],
  ['StepPair','torch.nn.LSTMCell',['step-input','initial-state','final-state','final-state']]]){
  const ir=read(name),raw=JSON.stringify(ir),[r]=states(ir);assert.equal(r.properties.framework_type,type);assert.equal(r.properties.interface_kind,'single-step');
  assert.deepEqual(r.bindings.map(b=>b.role),roles);assert.equal(r.properties.initial_state,'explicit');assert.ok(r.not_asserted.includes('time recurrence'));
  for(const b of r.bindings){const e=ir.edges.find(e=>e.id===b.edge);assert.deepEqual([b.source,b.target,b.source_port,b.target_port],[e.source,e.target,e.source_port,e.target_port]);}
  assert.equal(JSON.stringify(ir),raw);
 }
 const pair=states(read('StepPair'))[0];assert.deepEqual(pair.bindings.filter(b=>b.role==='final-state').map(b=>b.source_port),['0','1']);
});
test('omitted state and explicit None are proved from the actual source call, not absent edges',()=>{
 for(const [name,mode]of [['ZeroStep','framework-default'],['NoneStep','explicit-none']]){
  const ir=read(name),[r]=states(ir);assert.equal(r.properties.initial_state,mode);assert.equal(r.properties.state_input_port,null);
  const out=R.render(ir,request);assert.match(out.svg,/zero state default/);assert.ok(!r.bindings.some(b=>b.role==='initial-state'));
 }
 const ir=read('StepGate'),[r]=states(ir);ir.edges=ir.edges.filter(e=>e.id!==r.bindings.find(b=>b.role==='initial-state').edge);assert.equal(states(ir).length,0);
});
test('expanded arguments, invalid call shape and source names do not establish a state interface',()=>{
 for(const name of ['ExpandedArguments','ExtraArgument','NamedImpostor'])assert.equal(states(read(name)).length,0,name);
 const ir=read('NamedImpostor');for(const n of ir.nodes){n.label='torch.nn.GRUCell';n.source_class='LSTMCell';}assert.equal(states(ir).length,0);
});
test('ambiguous, effectful, observed and mismatched operands reject the affected contract',()=>{
 for(const mutate of [
  (ir,n,r)=>ir.edges.push({...ir.edges.find(e=>e.id===r.bindings[0].edge),id:'duplicate'}),
  (ir,n,r)=>ir.edges.find(e=>e.id===r.bindings[1].edge).target_port='arg:0',
  (ir,n,r)=>ir.edges.find(e=>e.id===r.bindings[1].edge).evidence='runtime-tensor',
  (ir,n,r)=>ir.edges.find(e=>e.id===r.bindings[1].edge).condition={branch:'if',outcome:'true'},
  (ir,n)=>n.source_framework_module='foreign.GRUCell',
  (ir,n)=>n.operator='gru', (ir,n)=>n.mutable=true,
  (ir,n)=>n.evidence_status='runtime-only', (ir,n)=>delete n.cell_call,
  (ir,n)=>n.runtime_evidence=[{run:0}], (ir,n)=>n.observed_calls={observations:[]},
  (ir,n)=>n.cell_call.keyword_expansion=true,
  (ir,n)=>n.syntax.fields.args.pop(),
 ]){
  const ir=read('StepGate'),[r]=states(ir),n=ir.nodes.find(n=>n.id===r.node);mutate(ir,n,r);assert.equal(states(ir).length,0);
 }
});
test('state interfaces render exact role labels and reserved channels with measurable binding coverage',()=>{
 for(const name of ['StepGate','StepPair','ZeroStep','NoneStep']){
  const ir=read(name),[r]=states(ir),out=R.render(ir,{...request,paperRelation:r.id});
  assert.deepEqual(out.prepared.quality.issues,[]);assert.equal(out.document.expression_coverage.find(g=>g.goal==='goal:'+r.id).status,'fulfilled');
  assert.match(out.svg,/input/);assert.match(out.svg,/h(?:, c)?\)? out/);
  const receipt=out.graph.constraint_receipts.find(c=>c.evidence.relation===r.id);assert.equal(receipt.status,'applied',receipt.reason);assert.equal(receipt.route_verified,true);
  for(const b of r.bindings.filter(b=>b.role!=='step-input'))assert.ok(out.prepared.routes.some(e=>e.semantic_bindings?.some(s=>s.edge===b.edge&&s.role===b.role)&&e.design_route?.kind==='state-interface'));
 }
 const out=R.render(read('StepPair'),request);assert.match(out.svg,/h out/);assert.match(out.svg,/c out/);assert.doesNotMatch(out.svg,/sequence|hₙ|cₙ/);
});
test('conditional local details retain the governing branch and independent unknown boundary',()=>{
 const ir=read('ConditionalStep'),[r]=states(ir);assert.equal(r.condition_scope.length,1);
 const out=R.render(ir,{...request,paperRelation:r.id});assert.equal(out.document.expression_coverage.find(g=>g.goal==='goal:'+r.id).status,'fulfilled');
 assert.ok(out.graph.nodes.some(n=>n.condition?.branch));assert.ok(out.graph.nodes.some(n=>n.kind==='control'));
 assert.ok(A.build(ir).relation_graph.relations.some(r=>r.type==='unknown-boundary'));
 assert.ok(!out.graph.nodes.some(n=>n.kind==='opaque'));assert.deepEqual(out.document.ir,ir);
});
test('a mixed helper cannot hide its state interface inside a dependency path summary',()=>{
 const ir=read('StateWorkshop'),[r]=states(ir),out=R.render(ir,request),plan=A.build(ir);
 for(const type of ['gated-product','state-interface','selection','unknown-boundary','conditional-region'])assert.ok(plan.relation_graph.relations.some(r=>r.type===type),type);
 assert.ok(out.graph.positions.has(r.node));
 assert.ok(!(out.graph.publication.local_pipelines?.rows||[]).some(p=>p.canonical_members.includes(r.node)));
 assert.ok(!plan.relation_graph.relations.some(r=>['time-recurrence','expert-routing','state-update'].includes(r.type)));
 const detail=R.render(ir,{...request,paperRelation:r.id});assert.equal(detail.document.expression_coverage.find(g=>g.goal==='goal:'+r.id).status,'fulfilled');
});
test('saved intermediate states and raw source expansion retain all original identities and dependencies',()=>{
 for(const name of ['StepPair','StateWorkshop','ConditionalStep']){
  const ir=read(name),raw=JSON.stringify(ir),out=R.render(ir,request);
  assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);
  const source=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
  assert.deepEqual(source.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(source.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
  assert.equal(JSON.stringify(ir),raw);
 }
});
test('renaming display labels and model classes cannot select a framework cell contract',()=>{
 const ir=read('StepPair'),[before]=states(ir);ir.title='Unknown';for(const n of ir.nodes){n.label='Foreign';n.source_class='Foreign';}
 assert.deepEqual(states(ir),[before]);
});
