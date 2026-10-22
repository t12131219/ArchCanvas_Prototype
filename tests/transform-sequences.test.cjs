'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../semantic_studio/transform-configurations.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/transform-sequences/current/'+name+'.json'));
const compile=(ir,options={})=>[...C.compile(ir,{operands:true,...options}).values()];
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
test('direct tuple/list arguments preserve syntax, singleton commas, empty tuples and exact slots',()=>{
 for(const [name,expected]of [
  ['TuplePatch',['reshape((x.shape[0], width, -1))','permute((1, 0, 2))']],
  ['ListPatch',['reshape(shape=[x.shape[0], -1])','permute([axis, 0])']],
  ['ArithmeticTuple',['reshape((batch, (length * factor), (width // factor)))']],
  ['SingleTuple',['reshape((width,))']],['EmptyTuple',['reshape(())']]]){
  const ir=read(name),raw=JSON.stringify(ir),rows=compile(ir);assert.deepEqual(rows.map(r=>r.text),expected);assert.equal(JSON.stringify(ir),raw);
  for(const row of rows)for(const slot of row.slots){
   assert.equal(slot.expression.kind,'source-sequence');
   assert.deepEqual(slot.binding,ir.edges.find(e=>e.id===slot.binding.id));
   assert.equal(slot.binding.source,slot.expression.node);
   for(const edge of slot.expression.dependencies)assert.deepEqual(edge,ir.edges.find(e=>e.id===edge.id));
  }
 }
});
test('structured arguments do not trust cached call values or constructor values',()=>{
 const ir=read('TuplePatch'),before=compile(ir);
 for(const n of ir.nodes)if(n.arguments)n.arguments.args=n.arguments.args.map(()=>999999);
 assert.deepEqual(compile(ir),before);
});
test('every sequence element requires exact construction slot, syntax, source result and static evidence',()=>{
 for(const mutate of [
  (ir,n,e)=>ir.edges.splice(ir.edges.indexOf(e),1),
  (ir,n,e)=>ir.edges.push({...e,id:'duplicate'}),
  (ir,n,e)=>e.target_port='15',(ir,n,e)=>e.source_port='1',
  (ir,n,e)=>e.condition={flag:true},(ir,n,e)=>e.iteration={loop:'x'},
  (ir,n,e)=>e.evidence='runtime-trace',(ir,n,e)=>e.kind='state-read',
  (ir,n,e)=>e.source=n.id,
  (ir,n)=>n.structure_kind='dict',(ir,n)=>n.syntax.type='List',
  (ir,n)=>n.syntax.fields.elts[0]={operand:'.elts:99'},
  (ir,n)=>n.syntax.fields.elts[2]={literal_type:'bool',literal:'True'},
  (ir,n)=>n.mutable=true,
 ]){
  const ir=read('TuplePatch'),row=compile(ir)[0],n=ir.nodes.find(n=>n.id===row.slots[0].expression.node),e=ir.edges.find(e=>e.target===n.id);
  mutate(ir,n,e);assert.ok(!compile(ir).some(r=>r.node===row.node));
 }
});
test('element and total expression budgets reject oversized, cyclic or deeply expanded arguments',()=>{
 for(const size of [17,16]){
  const ir=read('TuplePatch'),row=compile(ir)[0],n=ir.nodes.find(n=>n.id===row.slots[0].expression.node),e=ir.edges.find(e=>e.target===n.id);
  const inner=JSON.parse(JSON.stringify(n));inner.id='inner-sequence';
  const innerEdges=ir.edges.filter(e=>e.target===n.id).map(e=>({...e,id:'inner:'+e.id,target:inner.id}));
  ir.edges=ir.edges.filter(e=>e.target!==n.id);
  ir.nodes.push(inner);ir.edges.push(...innerEdges);
  n.syntax.fields.elts=Array.from({length:size},(_,i)=>({operand:'.elts:'+i}));
  for(let i=0;i<size;i++)ir.edges.push({...e,source:inner.id,id:'repeated:'+i,target_port:String(i)});
  // Repeated nested sequences exceed the shared 64-node expression budget.
  assert.ok(!compile(ir).some(r=>r.node===row.node));
 }
});
test('unknown, starred and guarded parts stay unclaimed while independent known calls remain',()=>{
 assert.deepEqual(compile(read('UnknownTuple')).map(r=>r.text),['reshape((width, -1))']);
 assert.deepEqual(compile(read('StarredTuple')),[]);
 const ir=read('ConditionalTuple'),rows=compile(ir);assert.deepEqual(rows.map(r=>r.text),['permute((1, 0))']);
 for(const guard of [{condition:{flag:true}},{evidence_status:'runtime-only'},{identity_display:{}},{observed_calls:{}},{runtime_evidence:[{}]}]){
  const ir=read('TuplePatch'),row=compile(ir)[0],seq=ir.nodes.find(n=>n.id===row.slots[0].expression.node);
  Object.assign(ir.nodes.find(n=>n.id===seq.parent),guard);assert.ok(!compile(ir).some(r=>r.node===row.node));
 }
});
test('named mutable or escaping sequences retain their source name and are never inlined',()=>{
 for(const name of ['MutableList','EscapingTuple']){
  const rows=compile(read(name));assert.deepEqual(rows.map(r=>r.text),['reshape(shape)']);
  assert.equal(rows[0].slots[0].expression.kind,'source-reference');
  assert.deepEqual(rows,compile(read(name),{sequences:false}));
 }
});
test('new source notes preserve computations, all bindings, unknown and recurrent boundaries and coverage',()=>{
 for(const name of ['TuplePatch','ListPatch','UnknownTuple','MixedTuple','EscapingTuple']){
  const ir=read(name),a=R.render(ir,{...state,paperTransformSequences:false}),b=R.render(ir,state);
  assert.deepEqual(b.document.ir,ir);assert.deepEqual(b.graph.node_accounting,a.graph.node_accounting);assert.deepEqual(b.graph.edge_accounting,a.graph.edge_accounting);
  assert.deepEqual(b.document.expression_coverage,a.document.expression_coverage);assert.deepEqual(b.document.summary_coverage,a.document.summary_coverage);
  for(const n of a.graph.nodes.filter(n=>n.kind==='opaque'||n.mutable||n.framework_type==='torch.nn.GRUCell'))assert.ok(b.graph.nodes.some(m=>m.id===n.id));
  assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 }
});
test('source details remain visible when opened and folded, independent of model or display name',()=>{
 const ir=read('TuplePatch'),before=compile(ir);for(const n of ir.nodes){n.label='Renamed';n.source_class='Unseen';}ir.title='Unseen';assert.deepEqual(compile(ir),before);
 const original=read('TuplePatch'),r=R.render(original,state),opened=R.render(original,{...state,paperAuto:false,open:original.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
 for(const row of compile(original))assert.ok(opened.graph.positions.has(row.node));
 assert.deepEqual(opened.document.ir,r.document.ir);
 for(const extra of [{paperTransformSequences:false},{paperTransformOperands:false},{paperTransformConfigurations:false},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  const r=R.render(original,{...state,...extra});assert.ok(!r.graph.nodes.some(n=>n.transform_configurations?.some(op=>op.slots.some(s=>s.expression?.kind==='source-sequence'))));
 }
});
