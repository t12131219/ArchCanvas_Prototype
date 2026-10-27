'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
global.EdgeRouterLabRouting=require('../yworks_edge_router_lab/router');
for(const f of ['physical-ports','junction-markers','route-labels','source-contracts','semantic-constraints','graph-engine','runtime-layout','recursive-graph'])require('../yworks_edge_router_lab/'+f);
const G=require('../yworks_edge_router_lab/generic-semantic'),I=require('../yworks_edge_router_lab/source-runtime');
const ir=JSON.parse(fs.readFileSync('verification/source-runtime-integration/preflight/assisted.json')),clone=v=>JSON.parse(JSON.stringify(v));
const owner=ir.source_runtime_index.regions[0].source;
function ledger(g){for(const [key,all]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const rows=Object.values(g.generic.receipts[key]).flat();assert.equal(rows.length,all.length);assert.deepEqual(new Set(rows),new Set(all.map(n=>n.id)));}}
function check(g){assert.deepEqual(G.validate(g,true),{ok:true,violations:[]});ledger(g);assert.deepEqual(g.generic.ir,ir);}
test('source-led merge inserts observed computation at original unknown call and connects exact operands',()=>{
 const before=JSON.stringify(ir),g=G.build(ir);check(g);
 assert.ok(!g.nodes.some(n=>n.id==='runtime-observations'));
 const n=g.nodes.find(n=>n.id===owner);assert.ok(n.expanded);assert.equal(n.semantic.source_runtime.static_kind,'opaque');assert.equal(ir.nodes.find(n=>n.id===owner).kind,'opaque');
 assert.equal(g.nodes.find(n=>n.id==='runtime:0:op1').parent,owner);
 const input=g.edges.find(e=>e.id==='e00003').binding;assert.equal(input.target,'runtime:0:op1');assert.equal(input.target_port,'1');assert.equal(input.runtime_bridge.source_binding.target,owner);assert.equal(input.runtime_bridge.source_binding.target_port,'arg:0');
 const out=g.edges.find(e=>e.id==='e00006').binding;assert.equal(out.source,'runtime:0:op1');assert.equal(out.runtime_bridges[0].output.owner,owner);assert.equal(out.runtime_bridges[0].source_binding.source_port,'out');
 assert.equal(JSON.stringify(ir),before);assert.ok(g.nodes.some(n=>n.semantic.label==='sigmoid'));assert.ok(g.nodes.some(n=>n.semantic.label==='relu'));
});
test('run selector never mixes executions, with complete source branches and full trace still accessible',()=>{
 const a=G.build(ir),b=G.operate(a,{kind:'state',patch:{runtimeInlineRun:2}});check(b);
 assert.ok(b.nodes.some(n=>n.id==='runtime:2:op1'));assert.ok(!b.nodes.some(n=>n.id.startsWith('runtime:0:')));
 const source=G.operate(b,{kind:'state',patch:{mode:'source'}});assert.ok(!source.nodes.some(n=>n.id.startsWith('runtime:')));check(source);
 const runtime=G.operate(b,{kind:'state',patch:{mode:'runtime'}}),full=G.operate(runtime,{kind:'all',open:true});check(full);assert.equal(full.nodes.filter(n=>n.id.startsWith('runtime:')).length,ir.nodes.filter(n=>n.id.startsWith('runtime:')).length);
});
test('collapse/reopen, F0/F1, full expansion and document roundtrip preserve canonical accounting',()=>{
 let g=G.build(ir);g=G.operate(g,{id:owner});assert.ok(!g.nodes.some(n=>n.id==='runtime:0:op1'));check(g);
 g=G.operate(g,{id:owner});assert.ok(g.nodes.some(n=>n.id==='runtime:0:op1'));check(g);
 for(const action of ['overview','detail']){g=G.operate(g,{kind:'frontier',action});check(g);}
 g=G.operate(g,{kind:'all',open:true});check(g);assert.equal(g.nodes.length,17);assert.equal(g.edges.length,15);assert.equal(G.route(g).failed,0);assert.deepEqual(G.validate(g),{ok:true,violations:[]});
 const doc=G.document(g),payload=G.read(clone(doc)),restored=G.build(payload.ir,payload.state);check(restored);assert.deepEqual(restored.nodes.map(n=>n.id),g.nodes.map(n=>n.id));
});
test('ambiguous repeated calls, corrupt operand bindings and legacy receipts keep source boundary',()=>{
 for(const change of [x=>{x.source_runtime_index.regions.push(clone(x.source_runtime_index.regions[0]));},x=>{x.source_runtime_index.regions[0].inputs[0].target_port='99';},x=>{delete x.runtime.runs[0].module_events.find(e=>e.path==='projection'&&e.event==='exit').output_is_tensor;},x=>{delete x.source_runtime_index;}]){
  const x=clone(ir);change(x);assert.equal(I.regions(x,0).length,0);const g=G.build(x);assert.ok(!g.nodes.some(n=>n.id==='runtime-observations'));assert.ok(!g.nodes.some(n=>n.id.startsWith('runtime:')));assert.equal(g.nodes.find(n=>n.id===owner).semantic.kind,'opaque');assert.equal(G.validate(g,true).ok,true);
 }
});
test('version 14 merged documents migrate drawings while retaining their full evidence and former layout',()=>{
 const g=G.build(ir),d=G.document(g);d.renderer='native-semantic/14';const loaded=G.read(d);assert.deepEqual(loaded.ir,ir);assert.equal(loaded.nativeLayout,null);assert.ok(loaded.migration.previousNativeLayout);check(G.build(loaded.ir,loaded.state));
});
test('two consecutive unknown calls join once, including a shared parameter identity',()=>{
 // Extend the real captured call with a second invocation consuming its return.
 const x=clone(ir),v=x.source_runtime_index.regions[0],run=x.runtime.runs[0],prefix='runtime:0:',first=v.source;
 const second=clone(x.nodes.find(n=>n.id===first));second.id+=':second';second.source[0].column=40;second.source[0].end_column=52;x.nodes.push(second);
 const call=clone(run.module_events.find(e=>e.id==='call1'&&e.event==='enter'));call.id='call3';call.source_stack[0].column=40;call.source_stack[0].end_column=52;call.input_bindings[0]={...call.input_bindings[0],id:'t4',producer:'op1',slot:0};run.module_events.push(call);
 const exit=clone(run.module_events.find(e=>e.id==='call1'&&e.event==='exit'));exit.id='call3';exit.outputs[0]={...exit.outputs[0],id:'t7',producer:'op5'};run.module_events.push(exit);
 const next=clone(run.events.find(e=>e.id==='op1'));next.id='op5';next.module_call='call3';next.inputs[1]={...next.inputs[1],id:'t4',producer:'op1',slot:0};next.outputs[0]={...next.outputs[0],id:'t7',producer:'op5'};run.events.push(next);
 const nn=clone(x.nodes.find(n=>n.id===prefix+'op1'));nn.id=prefix+'op5';nn.inputs=clone(next.inputs);nn.outputs=clone(next.outputs);x.nodes.push(nn);
 const incoming=x.edges.find(e=>e.id==='e00003');x.edges.push({...incoming,id:'second-input',source:first,target:second.id,source_port:'out'});
 x.edges.push({id:'second-output',source:second.id,target:x.edges.find(e=>e.id==='e00004').target,source_port:'out',target_port:'value',kind:'alias',evidence:'source-dependency'});
 const cross={id:'second-runtime-input',source:prefix+'op1',target:nn.id,source_port:'0',target_port:'1',kind:'data',evidence:'runtime-tensor'};x.edges.push(cross);
 // addmm's other inputs belong to the already proven resources/event graph.
 for(const e of x.edges.filter(e=>e.target===prefix+'op1'&&e.target_port!=='1'))x.edges.push({...e,id:e.id+':second',target:nn.id});
 const w=clone(v);w.source=second.id;w.call=prefix+'call3';w.events=[nn.id];w.resources=[v.resources[0]];w.inputs=[{source_edge:'second-input',runtime_edge:cross.id,tensor:'t4',argument_port:'arg:0',target:nn.id,target_port:'1'}];w.output={source:nn.id,source_port:'0',tensor:'t7'};
 // The transposed weight is an external tensor; add its explicit source operand
 // rather than accidentally declaring it to be a resource identity.
 x.edges=x.edges.filter(e=>e.id!=='rt-edge:3:second');next.inputs=next.inputs.slice(0,2);nn.inputs=clone(next.inputs);
 x.source_runtime_index.regions.push(w);
 assert.equal(I.regions(x,0).length,2);const prepared=I.prepare(x,0);assert.ok(!prepared.ir.edges.some(e=>e.id===cross.id));const bridge=prepared.ir.edges.find(e=>e.id==='second-input');assert.equal(bridge.source,prefix+'op1');assert.equal(bridge.target,nn.id);
 const resource=x.nodes.find(n=>n.id===v.resources[0]);assert.equal(prepared.ir.nodes.filter(n=>n.id===resource.id).length,1);
});
