'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../semantic_studio/transform-configurations.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/transform-configurations/current/'+name+'.json'));
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
test('literal method configurations preserve call order, signed axes and explicit keyword positions',()=>{
 for(const [name,text]of [['AxisPatch',['permute(0, 2, 1)','flatten(1, 2)']],['ExtentPatch',['view(-1, 4)','transpose(-2, -1)']],
  ['KeywordPatch',['transpose(dim0=0, dim1=2)','reshape(-1, 4)']]]){
  const ir=read(name),raw=JSON.stringify(ir),rows=[...C.compile(ir).values()];assert.deepEqual(rows.map(r=>r.text),text);assert.equal(JSON.stringify(ir),raw);
  for(const row of rows){assert.equal(ir.edges.find(e=>e.id===row.receiver_edge).target,row.node);assert.match(row.scope,/no tensor rank, valid shape/);}
 }
});
test('resolved metadata cannot override dynamic syntax, changed literals or incoming configuration paths',()=>{
 const ir=read('AxisPatch'),id=[...C.compile(ir).keys()][0];
 for(const mutate of [n=>n.arguments.args[0]=1,n=>n.syntax.fields.args[0]={operand:'.args:0'},n=>n.syntax.fields.args[0]={literal_type:'bool',literal:'False'},
  n=>n.syntax.fields.args[0]={literal_expression:'Call(func=Name(id="eval"), args=[])'},n=>n.arguments.kwargs.other=0,n=>n.operator='foreign']){
  const p=structuredClone(ir);mutate(p.nodes.find(n=>n.id===id));assert.equal(C.compile(p).has(id),false);
 }
 const dynamic=read('DynamicPatch'),n=dynamic.nodes.find(n=>n.operator==='transpose');n.arguments.args=[0,2];assert.equal(C.compile(dynamic).has(n.id),false);
 const p=structuredClone(ir);p.edges.push({id:'extra',source:p.nodes[0].id,target:id,target_port:'arg:0',source_port:'out',kind:'data',evidence:'source-dependency'});
 assert.equal(C.compile(p).has(id),false);
});
test('conditions, mutations, runtime evidence and protected ancestors prevent source-literal claims',()=>{
 const ir=read('AxisPatch'),id=[...C.compile(ir).keys()][0];
 for(const guard of [{kind:'opaque'},{mutable:true},{condition:{test:'x'}},{evidence_status:'runtime-only'},{runtime_evidence:[{}]},{observed_calls:{}},{identity_display:{}}]){
  for(const ancestor of [false,true]){const p=structuredClone(ir),n=p.nodes.find(n=>n.id===id);Object.assign(ancestor?p.nodes.find(parent=>parent.id===n.parent):n,guard);assert.equal(C.compile(p).has(id),false);}
 }
 for(const patch of [{condition:{test:'x'}},{kind:'state-read'},{iteration:{}},{evidence:'runtime-trace'}]){
  const p=structuredClone(ir);Object.assign(p.edges.find(e=>e.target===id),patch);assert.equal(C.compile(p).has(id),false);
 }
});
test('summary annotations retain dependency goals, exact bindings, original IR and reversible expansion',()=>{
 for(const name of ['AxisPatch','ExtentPatch','KeywordPatch','InterruptedPatch','StatefulPatch']){
  const ir=read(name),a=R.render(ir,{...state,paperTransformConfigurations:false}),b=R.render(ir,state);
  assert.deepEqual(b.document.ir,ir);assert.deepEqual(b.graph.node_accounting,a.graph.node_accounting);assert.deepEqual(b.graph.edge_accounting,a.graph.edge_accounting);
  assert.deepEqual(b.document.expression_coverage,a.document.expression_coverage);assert.deepEqual(b.document.summary_coverage,a.document.summary_coverage);
  const summary=b.graph.nodes.find(n=>n.local_pipeline&&!n.local_pipeline_expanded&&n.transform_configurations?.length);assert.ok(summary,name);
  for(const row of summary.transform_configurations)assert.ok(summary.paper.captions.join('').replace(/\s/g,'').includes(row.display_text.replace(/\s/g,'')));
  const opened=R.render(ir,{...state,paperAuto:false,open:[...b.graph.publication.open,summary.id]});
  assert.ok(summary.local_pipeline.operations.every(o=>opened.graph.positions.has(o.node)),name);
  assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);assert.equal(R.render(ir,{...state,paperTransformConfigurations:false}).svg,a.svg);
 }
});
test('unknown and state boundaries survive; only independently proved neighboring calls are annotated',()=>{
 const ir=read('InterruptedPatch'),r=R.render(ir,state);assert.ok(r.graph.nodes.some(n=>n.kind==='opaque'));
 assert.equal([...C.compile(ir).values()].length,3);
 const stateful=R.render(read('StatefulPatch'),state);assert.ok(stateful.graph.nodes.some(n=>n.framework_type==='torch.nn.GRUCell'));
 const conditional=read('ConditionalPatch');for(const row of C.compile(conditional).values())assert.ok(!conditional.nodes.find(n=>n.id===row.node).condition);
});
test('names do not select literal configurations; print and other granularities retain their policy',()=>{
 const ir=read('AxisPatch'),a=[...C.compile(ir).values()];for(const n of ir.nodes){n.label='Foreign';n.source_class='Unknown';}ir.title='Anything';
 assert.deepEqual([...C.compile(ir).values()],a);
 for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'}])assert.equal(R.render(ir,{...state,...extra}).document.publication.transform_configurations,undefined);
 const malformed=read('AxisPatch');malformed.nodes[0].function_target='__proto__';assert.doesNotThrow(()=>C.compile(malformed));
});
