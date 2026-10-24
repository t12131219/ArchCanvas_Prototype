'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const Profiles=require('../semantic_studio/presentation-profile'),C=require('../semantic_studio/composition-layout');
const R=require('../semantic_studio/publication-renderer');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const catalog=read('data/semantic/catalog.json'),model=Profiles.defaultModel(catalog),irPath='data/semantic/'+model.ir;
const ir=read(irPath),profile=read('data/semantic/'+model.presentation),report=read(profile.audit.report);
const rows=Object.fromEntries(report.rows.map(row=>[row.name,row])),rendered=new Map();
const render=name=>{if(!rendered.has(name))rendered.set(name,R.render(ir,rows[name].state));return rendered.get(name);};

test('the default catalog model publishes the exact audited source facts and F1 state',()=>{
 assert.equal(sha(irPath),profile.audit.input_sha256);assert.equal(sha(profile.audit.input),sha(irPath));
 assert.equal(sha(profile.audit.report),profile.audit.report_sha256);
 assert.equal(model.digest,ir.ir_digest);assert.equal(profile.ir_digest,ir.ir_digest);
 assert.equal(model.nodes,ir.nodes.length);assert.equal(model.edges,ir.edges.length);
 assert.deepEqual(profile.default_state,rows[profile.audit.detail].state);
 assert.equal(profile.default_state.paperGranularity,'roles');assert.equal(profile.default_state.paperMedium,'canvas');
 assert.ok(profile.default_state.paperFrontierReturn);
});
test('published overview, detail and further expansion reproduce the actual accepted SVGs',()=>{
 const original=JSON.stringify(ir);
 for(const name of [profile.audit.overview,profile.audit.detail,profile.audit.finer]){
  const r=render(name);assert.equal(r.svg,fs.readFileSync('verification/input-placement/current/'+rows[name].svg,'utf8'));
  for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
   const ids=Object.values(r.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);
   assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
  }
  assert.deepEqual(r.prepared.quality.issues,[]);
 }
 assert.equal(JSON.stringify(ir),original);
});
test('first opening selects the reviewed detail and return restores its exact overview',()=>{
 const s=Profiles.initialState(ir,profile);assert.deepEqual(s,profile.default_state);
 const returned=C.frontier(s,'return');assert.deepEqual(returned,rows[profile.audit.overview].state);
 assert.equal(R.render(ir,returned).svg,render(profile.audit.overview).svg);
});
test('saved local expansion, offsets and return snapshots take precedence over publication defaults',()=>{
 const r=render(profile.audit.finer),saved=JSON.parse(JSON.stringify(r.document.state));
 const restored=Profiles.initialState(ir,profile,saved,profile.default_state);
 assert.deepEqual(restored,saved);assert.equal(R.render(ir,restored).svg,r.svg);
 const moved={...saved,offsets:{[ir.nodes[0].id]:{x:20,y:30}}};
 assert.deepEqual(Profiles.initialState(ir,profile,undefined,moved),moved);
 const imported=Profiles.initialState(ir,null,saved);assert.deepEqual(imported,saved);
 assert.notEqual(Profiles.storageKey(ir,profile),'summary-semantic:architecture-v1:'+ir.ir_digest);
 assert.notEqual(Profiles.storageKey(ir,profile),Profiles.storageKey(ir,{...profile,revision:'next-publication'}));
 restored.open.push('test-only');assert.deepEqual(profile.default_state,rows[profile.audit.detail].state);
});
test('catalog selection respects explicit models and rejects profiles from another IR',()=>{
 const other=catalog.models.find(m=>m.id!==model.id);
 assert.equal(Profiles.defaultModel(catalog,other.id).id,other.id);
 assert.equal(Profiles.defaultModel(catalog,'missing').id,model.id);
 assert.equal(Profiles.defaultModel({models:[other]}).id,other.id);
 assert.throws(()=>Profiles.initialState(ir,{...profile,ir_digest:'stale'}),/IR/);
 assert.throws(()=>Profiles.storageKey(ir,{...profile,schema:'unknown'}),/IR/);
});
test('unprofiled ordinary source models also start in the generic certified canvas frontier',()=>{
 for(const name of ['ReadWorkshop','ConditionalRead']){
  const ordinary=read('verification/call-boundaries/current/'+name+'.json'),raw=JSON.stringify(ordinary);
  const state=Profiles.initialState(ordinary,null);
  assert.deepEqual(state,C.certifiedDetails(ordinary,C.frontier({mode:'source'},'detail')));
  assert.equal(state.paperComposition,'architecture');assert.equal(state.paperDirection,'up');
  assert.equal(state.mode,'source');assert.ok(state.paperFrontierReturn);
  assert.equal(JSON.stringify(ordinary),raw);
 }
});
