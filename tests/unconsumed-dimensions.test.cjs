'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('../semantic_studio/dimension-paths.js'),P=require('../semantic_studio/publication.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperCompact:true,paperAdaptive:false};
const read=name=>JSON.parse(fs.readFileSync('verification/unconsumed-dimensions/current/'+name+'.json'));
const shape=ir=>ir.nodes.find(n=>n.attribute_name==='shape'),unused=ir=>ir.nodes.find(n=>n.kind==='value-alias'&&n.slot==='2');
const derive=(ir,enabled=true)=>D.compile({ir,unconsumedBindings:enabled,configurationUse:e=>{
 const n=ir.nodes.find(n=>n.id===e.target);return n?.kind==='compute'&&n.operator==='reshape'&&e.target_port.startsWith('arg:');
}});
const draw=(ir,extra={})=>P.project(ir,{...state,...extra},E);
const receipts=g=>g.publication.configuration_arithmetic.filter(r=>r.unconsumed_bindings);
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}

test('configuration proof records the exact unused unpack slot without asserting execution',()=>{
 const ir=read('PartialDimensions'),before=JSON.stringify(ir),d=derive(ir),s=shape(ir),u=unused(ir),row=d.rows.find(r=>r.node===s.id);
 assert.ok(d.metadata.has(s.id)&&d.metadata.has(u.id));assert.equal(derive(ir,false).metadata.has(s.id),false);
 assert.deepEqual(row.unconsumed_bindings.map(r=>[r.node,r.slot,r.dependency,r.source,r.uses]),[[u.id,'2',ir.edges.find(e=>e.target===u.id),u.source,[]]]);
 assert.match(row.unconsumed_bindings[0].scope,/not dead-code elimination/);assert.match(row.unconsumed_bindings[0].scope,/validity and execution are unproved/);
 assert.equal(d.rows.find(r=>r.node===u.id).unconsumed_binding_of,s.id);assert.equal(JSON.stringify(ir),before);
});
test('source path summary can open to real operations, retaining configuration and unused receipts',()=>{
 const ir=read('PartialDimensions'),g=draw(ir),summary=g.publication.local_pipelines.rows.find(r=>r.status==='summary');assert.ok(summary);
 assert.deepEqual(summary.operations.map(o=>o.operator),['reshape','transpose','copy']);
 const open=[...g.publication.open,summary.node],r=R.render(ir,{...state,paperAuto:false,open}),view=summary.operations[0].node;
 assert.ok(r.graph.positions.has(view));assert.ok(r.graph.node_accounting.attached.includes(shape(ir).id));
 const note=r.graph.annotations.get(view).find(n=>n.configuration_proof?.some(p=>p.unconsumed_bindings));assert.ok(note);
 assert.deepEqual(note.configuration_proof.find(p=>p.unconsumed_bindings).unconsumed_bindings,receipts(g)[0].unconsumed_bindings);
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r.graph);
 const raw=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(raw.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(raw.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
});
for(const name of ['FeatureDimension','EscapingDimension','UnknownDimension','UnconsumedOnly','ConditionalDimensions','CustomDimensions'])test(name+' preserves a non-configuration boundary or lacks the required source contract',()=>{
 const ir=read(name),g=draw(ir);assert.equal(receipts(g).length,0);assert.equal(derive(ir).metadata.has(shape(ir).id),false);accounted(ir,g);
});
test('variable names, model names and stored symbolic facts do not select unused bindings',()=>{
 const ir=read('PartialDimensions'),old=derive(ir);for(const n of ir.nodes){n.label='Other';n.source_class='Unseen';delete n.symbolic_value;}
 assert.deepEqual(derive(ir),old);
 for(const n of ir.nodes)delete n.source_tensor_annotation;
 shape(ir).symbolic_value={kind:'tensor-attribute',attribute:'shape'};shape(ir).source_tensor_annotation='torch.Tensor';
 assert.equal(derive(ir).metadata.has(shape(ir).id),false);
});
test('effects, guards, runtime, identity and malformed unpack edges reject the entire new group',()=>{
 for(const mutate of [
  (ir,u)=>u.mutable=true,(ir,u)=>u.condition={branch:'if'},(ir,u)=>u.evidence_status='runtime-only',
  (ir,u)=>u.observed_calls=[{run:'one'}],(ir,u)=>u.runtime_evidence=[{event:1}],(ir,u)=>u.identity_display={reference:'shared'},
  (ir,u)=>u.semantic_contracts=[{type:'unknown'}],(ir,u)=>u.operator='other',
  (ir,u)=>u.parent='missing',(ir,u)=>{ir.nodes.find(n=>n.id===u.parent).parent=u.parent;},
  (ir,u)=>delete u.slot,(ir,u)=>u.slot='out',
  (ir,u)=>ir.edges.find(e=>e.target===u.id).target_port='wrong',
  (ir,u)=>ir.edges.find(e=>e.target===u.id).source_port='wrong',
  (ir,u)=>ir.edges.find(e=>e.target===u.id).kind='data',
  (ir,u)=>ir.edges.find(e=>e.target===u.id).evidence='runtime',
  (ir,u)=>ir.edges.find(e=>e.target===u.id).condition={outcome:'true'},
  (ir,u)=>ir.edges.find(e=>e.target===u.id).iteration={index:1},
  (ir,u)=>{const e=ir.edges.find(e=>e.target===u.id);ir.edges.push({...e,id:'duplicate'});},
  (ir,u)=>{const e=ir.edges.find(e=>e.target===u.id);ir.nodes.push({...u,id:'duplicate-binding'});ir.edges.push({...e,id:'duplicate-slot',target:'duplicate-binding'});},
  (ir,u)=>ir.edges.push({id:'escape',source:u.id,target:ir.nodes.find(n=>n.role==='output').id,kind:'data',source_port:'out',target_port:'other',evidence:'source-dependency'})
 ]){const ir=read('PartialDimensions');mutate(ir,unused(ir));const d=derive(ir);assert.ok(!d.metadata.has(shape(ir).id));assert.equal(d.rows.filter(r=>r.unconsumed_bindings).length,0);}
});
test('tensor method reshape has a configuration arg:0 while functional reshape retains its feature arg:0',()=>{
 const ir=read('PartialDimensions'),view=ir.nodes.find(n=>n.operator==='reshape');assert.equal(receipts(draw(ir)).length,1);
 ir.edges=ir.edges.filter(e=>!(e.target===view.id&&e.target_port==='receiver'));view.function_target='torch.reshape';
 assert.equal(receipts(draw(ir)).length,0);assert.ok(!derive(ir,false).metadata.has(shape(ir).id));
});
test('optout, print and other semantic granularities do not activate the unused policy',()=>{
 const ir=read('PartialDimensions');for(const extra of [{paperUnconsumedDimensions:false},{paperDimensionPaths:false},{paperMedium:'print'},{paperGranularity:'semantic'}]){const g=draw(ir,extra);assert.equal(receipts(g).length,0);accounted(ir,g);}
});
test('mixed and interrupted compositions keep unknown, state and conditional boundaries',()=>{
 for(const name of ['MixedDimensions','InterruptedDimensions']){
  const ir=read(name),g=draw(ir);assert.ok(receipts(g).length>0);assert.ok(g.nodes.some(n=>n.kind==='opaque'));accounted(ir,g);
  for(const n of ir.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.framework_type?.includes('GRUCell')))assert.ok(!receipts(g).some(r=>r.unconsumed_bindings.some(b=>b.node===n.id)));
  if(name==='InterruptedDimensions')assert.ok(g.nodes.some(n=>n.kind==='control'));
 }
});
