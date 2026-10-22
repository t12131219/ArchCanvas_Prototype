'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../semantic_studio/transform-configurations.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/transform-operands/current/'+name+'.json'));
const compile=ir=>[...C.compile(ir,{operands:true}).values()].filter(r=>r.rule_version==='transform-operands/1');
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
test('bound source arguments preserve names, attributes, selectors, arithmetic and keyword slots without evaluation',()=>{
 for(const [name,expected]of [
  ['ConfiguredShape',['view(batch, length, self.groups, self.width)']],
  ['BoundAxes',['reshape(x.shape[0], width, -1)','transpose(0, axis)']],
  ['ArithmeticShape',['reshape(batch, (length * factor), (width // factor))']],
  ['KeywordAxes',['transpose(dim0=0, dim1=axis)']]]){
  const ir=read(name),raw=JSON.stringify(ir),rows=compile(ir);assert.deepEqual(rows.map(r=>r.text),expected);assert.equal(JSON.stringify(ir),raw);
  for(const r of rows){assert.match(r.scope,/symbolic references are not evaluated/);for(const s of r.slots.filter(s=>s.binding)){
   assert.deepEqual(s.binding,ir.edges.find(e=>e.id===s.binding.id));assert.equal(s.binding.target,r.node);assert.equal(s.binding.target_port,s.port);
   assert.equal(s.expression.node,s.binding.source);assert.equal(s.expression.port,s.binding.source_port);
  }}
 }
});
test('resolved argument and attribute values cannot substitute numeric results for symbolic source reads',()=>{
 const ir=read('ConfiguredShape'),before=compile(ir);for(const n of ir.nodes){if(n.kind==='state')n.value=987654321;if(n.operator==='reshape')n.arguments.args=[1,2,3,4];}
 assert.deepEqual(compile(ir),before);assert.ok(!compile(ir)[0].text.includes('987654321'));
});
test('missing, duplicated, guarded or wrong-slot operand edges do not certify call arguments',()=>{
 for(const mutate of [
  (ir,e)=>ir.edges.splice(ir.edges.indexOf(e),1),
  (ir,e)=>ir.edges.push({...e,id:'duplicate'}),
  (ir,e)=>e.target_port='arg:99',
  (ir,e)=>e.condition={branch:'x'},(ir,e)=>e.iteration={loop:'x'},
  (ir,e)=>e.evidence='runtime-trace',(ir,e)=>e.kind='state-read',
  (ir,e)=>{ir.nodes.find(n=>n.id===e.source).kind='opaque';},
 ]){
  const ir=read('ConfiguredShape'),row=compile(ir)[0],e=ir.edges.find(e=>e.id===row.slots.find(s=>s.binding).binding.id);mutate(ir,e);assert.ok(!compile(ir).some(r=>r.node===row.node));
 }
});
test('arithmetic syntax and every dependency must agree; cycles and unsupported expressions stay unclaimed',()=>{
 for(const mutate of [n=>n.operator='div',n=>n.syntax.fields.right={operand:'.missing'},n=>n.syntax.fields.op.type='Pow']){
  const ir=read('ArithmeticShape'),r=compile(ir)[0],expr=r.slots.find(s=>s.expression?.kind==='source-arithmetic').expression;mutate(ir.nodes.find(n=>n.id===expr.node));assert.equal(compile(ir).length,0);
 }
 const ir=read('ArithmeticShape'),row=compile(ir)[0],expr=row.slots.find(s=>s.expression?.kind==='source-arithmetic').expression;
 ir.edges.find(e=>e.target===expr.node&&e.target_port==='0').source=expr.node;assert.equal(compile(ir).length,0);
 for(const mutate of [n=>n.operator='foreign',n=>n.syntax.fields.value.operand='.missing']){
  const p=read('BoundAxes');mutate(p.nodes.find(n=>n.operator==='getitem'));assert.ok(!compile(p).some(r=>r.method==='reshape'));
 }
});
test('proved return presentations can trade a small footprint increase for lower cost but remain bounded',()=>{
 const before={medium:'canvas',native_width_px:1000,native_height_px:1000,wire_length:2000,line_geometry:{crossings:4}};
 const good={...before,native_width_px:1030,native_height_px:980,wire_length:1900,line_geometry:{crossings:3}};
 const proposal=R.normalReturnPreference(before,good);assert.ok(proposal.footprint_preserved&&proposal.benefit);
 assert.ok(!R.normalReturnPreference(before,{...good,native_width_px:1060}).footprint_preserved);
 assert.ok(!R.normalReturnPreference(before,{...good,native_width_px:1040,native_height_px:1040}).footprint_preserved);
 assert.ok(!R.normalReturnPreference(before,{...before,native_width_px:1030}).benefit);
});
test('conditions, runtime-only regions and mutations on an expression or its scope reject new argument claims',()=>{
 for(const guard of [{mutable:true},{condition:{test:'flag'}},{evidence_status:'runtime-only'},{runtime_evidence:[{}]},{observed_calls:{}},{identity_display:{}}]){
  for(const ancestor of [false,true]){const ir=read('ConfiguredShape'),row=compile(ir)[0],n=ir.nodes.find(n=>n.id===row.node);Object.assign(ancestor?ir.nodes.find(p=>p.id===n.parent):n,guard);assert.ok(!compile(ir).some(r=>r.node===row.node));}
 }
 assert.equal(compile(read('ConditionalShape')).length,0);
});
test('annotation keeps unknown, escaping, mutable and state boundaries and does not earn new computation coverage',()=>{
 for(const name of ['ConfiguredShape','BoundAxes','ArithmeticShape','EscapingShape','UnknownShape','MutableShape','MixedShape','KeywordAxes']){
  const ir=read(name),a=R.render(ir,{...state,paperTransformOperands:false}),b=R.render(ir,state);
  assert.deepEqual(b.document.ir,ir);assert.deepEqual(b.graph.node_accounting,a.graph.node_accounting);assert.deepEqual(b.graph.edge_accounting,a.graph.edge_accounting);
  assert.deepEqual(b.document.expression_coverage,a.document.expression_coverage);assert.deepEqual(b.document.summary_coverage,a.document.summary_coverage);
  for(const n of a.graph.nodes.filter(n=>n.kind==='opaque'||n.mutable||n.framework_type==='torch.nn.GRUCell'))assert.ok(b.graph.nodes.some(m=>m.id===n.id));
  if(name==='UnknownShape')assert.deepEqual(compile(ir).map(r=>r.text),['reshape(width, -1)']);
 }
});
test('source summaries remain expandable and saved-state rerender is exact',()=>{
 const ir=read('ConfiguredShape'),r=R.render(ir,state),n=r.graph.nodes.find(n=>n.transform_configurations?.some(r=>r.rule_version==='transform-operands/1')&&n.local_pipeline);
 assert.ok(n);const opened=R.render(ir,{...state,paperAuto:false,open:[...r.graph.publication.open,n.id]});
 for(const op of n.local_pipeline.operations)assert.ok(opened.graph.positions.has(op.node));
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);assert.deepEqual(opened.document.ir,ir);
});
test('source spellings and bindings select expressions independently of model/display names; optout retains literal policy',()=>{
 const ir=read('ConfiguredShape'),before=compile(ir);for(const n of ir.nodes){n.label='Changed';n.source_class='Unknown';}ir.title='Unseen';assert.deepEqual(compile(ir),before);
 for(const extra of [{paperTransformOperands:false},{paperTransformConfigurations:false},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  const r=R.render(read('ConfiguredShape'),{...state,...extra});assert.ok(!r.graph.nodes.some(n=>n.transform_configurations?.some(r=>r.rule_version==='transform-operands/1')));
 }
});
