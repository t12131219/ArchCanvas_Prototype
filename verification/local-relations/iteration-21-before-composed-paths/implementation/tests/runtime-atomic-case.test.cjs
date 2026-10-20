const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),caseId='01093cc06a87b35c';
require('../yworks_edge_router_lab/router.js');
const E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),C=globalThis.SummaryConstraints;
const read=view=>JSON.parse(fs.readFileSync(`${root}/data/cases/${caseId}-${view}.json`));
const full=read('source-atomic'),receipt=JSON.parse(fs.readFileSync(root+'/data/semantic/transformer-runtime.json')).runtime;
const run=receipt.runs.find(r=>r.case==='with-masks'&&r.mode==='eval');
function load(){return F.build(F.create(Object.fromEntries(['source-atomic','overview','compact-templates'].map(v=>[v,C.initialize(read(v))]))));}
function legal(g){const start=Date.now(),r=F.route(g),v=E.validateView(g);assert.equal(r.failed,0,r.reason);assert.ok(v.source.ok,v.source.violations.join(';'));assert.ok(v.layout.ok,v.layout.violations.join(';'));for(const [id,r]of v.edges)assert.ok(r.ok,id+': '+r.violations.join(';'));return Date.now()-start;}

test('copy preserves the original case and exactly covers the selected execution',()=>{
 const original=fs.readFileSync(`${root}/data/cases/01093cc06a87b35b-source-atomic.json`);
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),full.runtimeExpansion.originalSha256);
 assert.equal(full.runtimeExpansion.traceDigest,receipt.trace_digest);
 assert.equal(full.runtimeExpansion.coverage,'observed-run');
 const ops=full.nodes.filter(n=>n.atomicity==='runtime-operator');
 assert.equal(ops.length,186);assert.deepEqual(ops.map(n=>n.semantic.runtime_event),run.events);
 assert.equal(full.nodes.filter(n=>n.atomicity==='parameter').length,45);
 assert.equal(full.nodes.filter(n=>n.atomicity==='buffer').length,1);
 assert.equal(full.nodes.filter(n=>n.semantic.call_id&&n.atomicity.endsWith('call')).length,52);
 // The dependency oracle is the raw receipt, not the generated edge list.
 for(const event of run.events)for(const [operand,input]of event.inputs.entries()){
   const edge=full.edges.find(e=>e.target===event.id&&e.binding.runtime.operand===operand);
   assert.ok(edge,event.id+': missing operand '+operand);
   assert.deepEqual(edge.binding.runtime.tensor,input);
   assert.equal(edge.source,input.producer==='op64'&&event.module_path.startsWith('decoder')?'runtime:memory':input.producer);
 }
 assert.equal(full.edges.length,run.events.reduce((n,e)=>n+e.inputs.length,0)+1+run.outputs.length);
 assert.equal(full.nodes.filter(n=>n.atomicity==='runtime-operator'&&n.semantic.operator.includes('softmax')).length,3);
 assert.ok(!full.nodes.some(n=>n.id==='probabilities'));
 assert.equal(full.nodes.find(n=>n.id==='op64').semantic.runtime_event.outputs.length,3);
});

test('memory feeds both cross-attention K and V through independent recorded operands',()=>{
 const memoryEdges=full.edges.filter(e=>e.source==='runtime:memory');
 assert.deepEqual(memoryEdges.map(e=>e.target),['op129','op136']);
 for(const edge of memoryEdges){assert.equal(edge.binding.runtime.tensor.producer,'op64');assert.equal(edge.binding.runtime.tensor.slot,0);assert.deepEqual(edge.binding.runtime.tensor.shape,[1,3,8]);}
 assert.equal(new Set(memoryEdges.map(e=>JSON.stringify(e.binding.wire_identity))).size,1);
});

test('overview and full expansion retain two compact bottom-up model lanes',()=>{
 assert.equal(full.irSha256,'eda3354b71af6bd42ed86f12ef17e0df16216a4ef3e65a877f0928f74fbc65f2');
 const lanes=[['input:src','runtime:call1','runtime:call5','runtime:call9','runtime:memory'],['input:tgt','runtime:call43','runtime:call47','runtime:call51','runtime:call101','runtime:logits']];
 for(const g of [read('overview'),full]){
  const by=new Map(g.nodes.map(n=>[n.id,n]));
  for(const ids of lanes)for(let i=1;i<ids.length;i++){
   const lower=by.get(ids[i-1]),upper=by.get(ids[i]);assert.ok(upper.y+upper.h<lower.y,ids[i]+' must be above '+ids[i-1]);
   assert.equal(upper.x+upper.w/2,lower.x+lower.w/2,'stages share a lane center');
  }
  assert.ok(Math.max(...lanes[0].map(id=>by.get(id).x+by.get(id).w))<Math.min(...lanes[1].map(id=>by.get(id).x)),'model lanes must remain separate');
 }
 const overview=read('overview');assert.ok(overview.canvas[0]<2000&&overview.canvas[1]<1600);
 assert.ok(full.canvas[0]<5000&&full.canvas[1]<22000,'all recorded operators remain in a compact vertical hierarchy');
});

test('nested attention, projection, complete expansion and collapse retain legal source bindings',()=>{
 let g=load();legal(g);const timings=[];
 for(const id of ['runtime:call9','runtime:call10','runtime:call11','runtime:call12','helper:call11:scaled_dot_product_attention:1']){
  g=F.toggle(g,id,true);timings.push({id,ms:legal(g),nodes:g.nodes.length});
 }
 assert.ok(g.nodes.some(n=>n.semantic?.operator==='aten._softmax.default'));
 const bound=JSON.stringify(g.recursive.authority.detail.edges.map(e=>e.binding));
 g=F.all(g,true);legal(g);assert.equal(g.nodes.length,306);assert.equal(g.edges.length,250);
 g=F.all(g,false);legal(g);assert.equal(g.nodes.length,16);
 assert.equal(JSON.stringify(g.recursive.authority.detail.edges.map(e=>e.binding)),bound);
 console.log('trace frontier measurements',JSON.stringify(timings));
});

test('decoder cross-attention expands with continuous memory bindings',()=>{
 let g=load();
 for(const id of ['runtime:call51','runtime:call52','runtime:call69','runtime:call72']){g=F.toggle(g,id,true);legal(g);}
 const edge=g.edges.find(e=>e.projection.original===full.edges.find(e=>e.source==='runtime:memory'&&e.target==='op129').id);
 assert.ok(edge);assert.equal(edge.source,'runtime:memory');assert.equal(edge.target,'op129');
 assert.equal(edge.binding.runtime.tensor.producer,'op64');
});

test('moving the complete execution hierarchy retains every descendant and canonical operand',()=>{
 let g=F.all(load(),true);legal(g);const before=E.clone(g);
 const bindings=JSON.stringify(g.edges.map(e=>e.binding));
 const moved=E.move(g,'runtime:call0',12,10,{margin:4,stub:14,bendCost:40,crossingCost:0,overlapCost:2,edgeSpacing:10,sides:'any',style:'orthogonal'});
 assert.equal(g.lastMove.blocked,false);assert.equal(moved.size,306);
 for(const n of g.nodes){const old=before.nodes.find(v=>v.id===n.id);assert.equal(n.x,old.x+12);assert.equal(n.y,old.y+10);}
 F.captureMove(before,g,'runtime:call0');legal(g);assert.equal(JSON.stringify(g.edges.map(e=>e.binding)),bindings);
});

test('precomputed inspection paths retain their verified lanes without a fresh search',()=>{
 const catalog=JSON.parse(fs.readFileSync(root+'/data/catalog.json')).cases.find(c=>c.id===caseId);
 const sources=Object.fromEntries([...catalog.views,...catalog.routeTemplates].map(v=>{
  const file=path.join(root,v.json||v.asset.replace(/\.js$/,'.json'));
  return [v.key,C.initialize(JSON.parse(fs.readFileSync(file)))];
 }));
 let g=F.build(F.create(sources));
 for(const id of ['runtime:call9','runtime:call10','runtime:call11','runtime:call12','helper:call11:scaled_dot_product_attention:1']){
  g=F.toggle(g,id,true);const result=F.route(g);
  assert.equal(result.routed,0);assert.equal(result.failed,0);legal(g);
 }
});
