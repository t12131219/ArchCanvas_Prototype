'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../semantic_studio/module-arguments.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/module-arguments/current/'+name+'.json'));
function state(ir){
 const helpers=new Set(ir.nodes.filter(n=>n.kind==='composite'&&n.semantic_type==='source-function').map(n=>n.id));
 return {mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperAuto:false,
  open:ir.nodes.filter(n=>n.kind==='composite'&&!helpers.has(n.id)).map(n=>n.id)};
}
function compiled(ir){const s=state(ir);return M.compile({ir,plan:ir,open:new Set(s.open),focus:ir.nodes.find(n=>!n.parent).id});}
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
}}
test('one exact module argument becomes a typed closed-consumer annotation without claiming a call',()=>{
 for(const name of ['SuppliedCurve','UnusedCurve']){
  const ir=read(name),before=JSON.stringify(ir),s=state(ir),plain=R.render(ir,{...s,paperModuleArguments:false}),r=R.render(ir,s);
  const rows=r.graph.publication.module_arguments.rows;assert.equal(rows.length,1);const row=rows[0];assert.equal(row.status,'attached');
  assert.equal(r.graph.nodes.length,plain.graph.nodes.length-1);assert.equal(r.graph.edges.length,plain.graph.edges.length-1);
  assert.ok(r.graph.node_accounting.attached.includes(row.node));assert.ok(r.graph.edge_accounting.attached.includes(row.edge.id));
  assert.equal(r.graph.representatives[row.node],row.consumer);assert.ok(!r.graph.positions.has(row.node));
  assert.deepEqual(row.edge,ir.edges.find(e=>e.id===row.edge.id));assert.deepEqual(row.configuration,ir.nodes.find(n=>n.id===row.node).resource_constructor);
  const node=r.graph.nodes.find(n=>n.id===row.consumer);assert.ok(node.paper.caption.includes(row.label));assert.ok(r.svg.includes('Module arg'));
  assert.equal(r.graph.annotations.get(row.consumer).find(n=>n.edge.id===row.edge.id).annotation_kind,'module-reference-argument');
  assert.match(row.scope,/Passing does not assert invocation/);assert.deepEqual(r.graph.publication.open,plain.graph.publication.open);
  assert.equal(JSON.stringify(ir),before);accounted(ir,r.graph);assert.deepEqual(r.prepared.quality.issues,[]);
  if(name==='UnusedCurve')assert.ok(!ir.nodes.some(n=>n.framework_type==='torch.nn.Linear'),'passing an unused module creates no computation');
 }
});
test('opening the consumer restores the same module read, exact edge and byte-identical refold/save',()=>{
 const ir=read('SuppliedCurve'),s=state(ir),r=R.render(ir,s),row=r.graph.publication.module_arguments.rows[0];
 const opened=R.render(ir,{...s,open:[...s.open,row.consumer]});
 assert.equal(opened.graph.publication.module_arguments.rows[0].status,'source-detail');assert.ok(opened.graph.positions.has(row.node));
 const edge=opened.graph.edges.find(e=>e.id===row.edge.id);assert.equal(edge.canonical_source,row.node);assert.equal(edge.canonical_target,row.input);assert.equal(edge.target_port,row.argument);
 assert.ok(!opened.graph.nodes.some(n=>n.module_arguments?.length));accounted(ir,opened.graph);assert.deepEqual(opened.prepared.quality.issues,[]);
 for(const result of [r,opened])assert.equal(R.render(result.document.ir,result.document.state).svg,result.svg);
 assert.equal(R.render(ir,{...opened.document.state,open:s.open}).svg,r.svg);
});
test('construction, symbolic reference, framework type, argument port and source ownership are independently required',()=>{
 for(const mutate of [
  (n)=>n.module_resource_binding.status='unknown',(n)=>n.module_resource_binding.read='foreign',
  (n)=>n.module_resource_binding.rule_version='future/1',(n)=>n.module_resource_binding.construction_evidence=[],
  (n)=>n.module_resource_binding.allocation='unknown',(n)=>n.module_identity='other',
  (n)=>n.symbolic_value.reference='other',(n)=>n.symbolic_value.framework_type='torch.nn.Linear',
  (n)=>n.resource_constructor.args=[{unresolved:'setting'}],(n)=>n.resource_constructor.kwargs={x:{unknown:true}},
  (n,ir)=>ir.edges.find(e=>e.source===n.id).source_port='slot:1',
  (n,ir)=>ir.edges.find(e=>e.source===n.id).target_port='another',
  (n,ir)=>ir.nodes.find(x=>x.id===ir.edges.find(e=>e.source===n.id).target).parent=ir.nodes[0].id,
  (n,ir)=>ir.edges.push({id:'other-use',source:n.id,target:ir.nodes[0].id,kind:'data'}),
  (n,ir)=>ir.edges.push({id:'write',source:ir.nodes[0].id,target:n.id,kind:'state-write'}),
 ]){
  const ir=read('SuppliedCurve'),n=ir.nodes.find(n=>n.module_resource);mutate(n,ir);assert.equal(compiled(ir).rows.length,0);
 }
});
test('conditions, unknowns, runtime, effects, shared reads and identity remain protected locally',()=>{
 for(const attrs of [{mutable:true},{condition:{branch:'if'}},{runtime_evidence:[{}]},{evidence_status:'runtime-only'},
  {identity_display:{}},{observed_calls:{}},{kind:'opaque'}]){
  for(const place of ['read','consumer','root']){
   const ir=read('SuppliedCurve'),n=ir.nodes.find(n=>n.module_resource),input=ir.edges.find(e=>e.source===n.id).target;
   const target=place==='read'?n:place==='root'?ir.nodes[0]:ir.nodes.find(x=>x.id===ir.nodes.find(x=>x.id===input).parent);
   Object.assign(target,attrs);assert.equal(compiled(ir).rows.length,0);
  }
 }
 for(const name of ['SharedCurve','GuardedCurve','UnprovedCurve']){
  const ir=read(name),s=state(ir),a=R.render(ir,{...s,paperModuleArguments:false}),b=R.render(ir,s);assert.equal(b.svg,a.svg);assert.equal(b.graph.publication.module_arguments,undefined);
 }
 const ir=read('SuppliedCurve'),n=ir.nodes.find(n=>n.module_resource);ir.nodes.push({...n,id:'other-read'});assert.equal(compiled(ir).rows.length,0);
});
test('mixed conditional, shared, unknown and recurrent neighborhoods preserve independent annotation and every boundary',()=>{
 const ir=read('MixedSuppliers'),s=state(ir),by=new Map(ir.nodes.map(n=>[n.id,n]));
 for(const n of ir.nodes.filter(n=>n.kind==='opaque')){let at=n.parent;while(at){if(!s.open.includes(at))s.open.push(at);at=by.get(at)?.parent;}}
 const a=R.render(ir,{...s,paperModuleArguments:false}),b=R.render(ir,s);
 assert.equal(b.graph.publication.module_arguments.rows.length,1);assert.ok(b.graph.nodes.length<a.graph.nodes.length);
 const attached=b.graph.publication.module_arguments.rows[0].node;
 for(const n of a.graph.nodes)if(n.id!==attached&&!b.graph.positions.has(n.id))assert.ok(b.graph.frame_ownership.some(r=>r.node===n.id));
 const bindings=r=>r.graph.edges.map(e=>[e.id,e.canonical_source,e.canonical_target,e.source_port,e.target_port,e.kind,e.condition]);
 assert.deepEqual(bindings(b),bindings(a).filter(e=>e[1]!==attached));
 assert.ok(b.graph.nodes.some(n=>n.kind==='opaque'));assert.ok(b.graph.nodes.some(n=>n.framework_type==='torch.nn.GRU'));assert.ok(ir.edges.some(e=>e.condition));
 accounted(ir,b.graph);assert.deepEqual(b.prepared.quality.issues,[]);
});
test('a fixed-repeat ancestor does not hide or combine distinct concrete module arguments',()=>{
 const ir=read('SuppliedCurve');ir.nodes[0].repeat_contract={count:3,homogeneous:true};
 assert.equal(compiled(ir).rows.length,1);
 ir.nodes[0].iteration={dynamic:true};assert.equal(compiled(ir).rows.length,0);
});
test('a module also called outside the consumer retains explicit shared identity',()=>{
 const ir=read('SuppliedCurve'),n=ir.nodes.find(n=>n.module_resource),call=ir.nodes.find(c=>c.kind==='compute'&&c.module_identity===n.module_identity&&c.framework_type==='torch.nn.GELU');
 assert.ok(call&&compiled(ir).rows.length===1,'the one internal call is a legitimate use of the argument');
 ir.nodes.push({...call,id:'external-invocation',parent:ir.nodes[0].id,module_identity:n.module_identity});
 assert.equal(compiled(ir).rows.length,0,'an external direct call may share the passed object');
});
test('display names cannot select the policy; explicit detail and other media retain source expression',()=>{
 const ir=read('SuppliedCurve'),expected=compiled(ir).rows;
 for(const n of ir.nodes){if(n.role!=='input')n.label='Unseen thing';n.source_class='Foreign';}
 assert.deepEqual(compiled(ir).rows,expected);
 const source=read('SuppliedCurve'),s=state(source);
 for(const extra of [{paperModuleArguments:false},{paperMedium:'print'},{paperGranularity:'detailed'},{paperGranularity:'semantic'}])
  assert.equal(R.render(source,{...s,...extra}).graph.publication.module_arguments,undefined);
 const row=expected[0];for(const id of [row.node,row.input,row.consumer])assert.equal(M.compile({ir:source,plan:source,focus:source.nodes[0].id,open:new Set(s.open),requested:[id]}).rows.length,0);
});
