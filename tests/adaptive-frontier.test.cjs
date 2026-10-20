'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const A=require('../semantic_studio/adaptive-frontier.js'),F=require('../semantic_studio/local-expressions.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},load=name=>JSON.parse(fs.readFileSync(name==='SameSource'?'verification/semantic-design/current/after/SameSource.json':'verification/local-relations/current/'+name+'.json'));
const cache=new Map();function render(name,extra={}){const key=JSON.stringify([name,extra]);if(!cache.has(key))cache.set(key,R.render(load(name),{...state,...extra}));return cache.get(key);}
function accounts(ir,g){for(const [key,objects]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),objects.map(n=>n.id).sort());}}

test('adaptive selection opens a nested certificate by proved references, retaining independently folded boundaries',()=>{
 const r=render('SameSource',{paperAdaptive:true}),a=r.graph.publication.adaptive_frontier;
 assert.ok(a.attempts.some(t=>t.accepted&&t.opportunity.kind==='roles'));assert.equal(r.graph.nodes.length,17);
 assert.ok(a.attempts[0].gained_goals.some(g=>g.kind==='arithmetic'));assert.ok(a.attempts[0].gain>0);
 assert.deepEqual(r.prepared.quality.issues,[]);accounts(r.document.ir,r.graph);
});
test('uncertified residual fragments gain expression detail independently of whole-family certification',()=>{
 const ir=load('InterruptedMixer'),before=JSON.stringify(ir),r=R.render(ir,{...state,paperAdaptive:true}),a=r.graph.publication.adaptive_frontier,b=render('InterruptedMixer');
 assert.ok(a.attempts.some(t=>t.accepted&&t.opportunity.kind==='relation'));assert.ok(a.selected_expression_details.length);
 assert.ok(!ir.semantic_contracts?.length);assert.ok(r.graph.nodes.length>b.graph.nodes.length);
 assert.ok(r.prepared.quality.line_geometry.crossings<=b.prepared.quality.line_geometry.crossings);
 assert.equal(r.graph.publication.local_expressions.requests.find(r=>r.type==='unknown-boundary').status,'fulfilled');
 assert.equal(JSON.stringify(ir),before);accounts(ir,r.graph);
});
test('candidate selection ignores labels, model names and arbitrary nested certificate role keys',()=>{
 const base=render('SameSource'),a=A.candidates(base.graph,state),g={...base.graph,architecture:JSON.parse(JSON.stringify(base.graph.architecture))};
 for(const n of g.architecture.nodes){n.label='Transformer';n.source_class='Unfamiliar';}
 for(const c of g.architecture.semantic_contracts)c.roles={unfamiliar:{renamed:c.roles}};
 const b=A.candidates(g,state);assert.deepEqual(b,a);
});
test('explicit relation paths stop at control, runtime, identity, unknown and repetition boundaries',()=>{
 for(const guard of [{kind:'opaque'},{kind:'control'},{condition:{predicate:'x'}},{mutable:true},{identity_display:{reference:'x'}},
  {evidence_status:'runtime-only'},{runtime_evidence:[{}]},{semantic_type:'loop-template'},{semantic_type:'conditional-collection'},{observed_calls:[{}]}]){
  const p={nodes:[{id:'root',kind:'composite'},{id:'guard',kind:'composite',parent:'root',...guard},{id:'work',kind:'compute',parent:'guard'}],
   relation_graph:{relations:[{id:'r',node:'work',type:'arithmetic',members:['work'],source_scope:'guard',bindings:[],properties:{}}]}};
  const f=F.compile({plan:p,focus:'root',details:['r']});assert.equal(f.requests[0].targets[0].frontier_node,'guard',JSON.stringify(guard));assert.ok(!f.open.has('guard'));
 }
});
test('explicit relation detail preserves source evidence and cannot invent a missing relationship',()=>{
 const p={nodes:[{id:'root',kind:'composite'},{id:'helper',kind:'composite',parent:'root'},{id:'work',kind:'compute',parent:'helper'}],
 relation_graph:{relations:[{id:'r',node:'work',type:'arithmetic',members:['work'],source_scope:'helper',bindings:[],properties:{},not_asserted:['family'],evidence_scope:'source-local'}]}};
 const before=JSON.stringify(p),f=F.compile({plan:p,focus:'root',details:['missing','r']});assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].requested,true);assert.deepEqual(f.requests[0].not_asserted,['family']);assert.equal(f.requests[0].evidence_scope,'source-local');
 assert.ok(f.open.has('helper'));assert.equal(JSON.stringify(p),before);
});
test('gain cannot be manufactured by merely exposing extra node names or hidden-instance counts',()=>{
 const b=render('SameSource'),q=A.assess(b.document.ir,b,b);assert.equal(q.gain,0);assert.equal(q.accepted,false);
 assert.ok(q.reasons.includes('no-verified-relationship-gain'));assert.equal(A.evidence(b.document.ir,b).goals.size, b.graph.expression_coverage.filter(c=>c.status==='fulfilled').length);
});
test('actual routed gain cannot override contacts, canonical accounting, labels or resource failures',()=>{
 const b=render('SameSource'),r=render('SameSource',{paperAdaptive:true});
 for(const kind of ['contacts','labels','route','budget','accounting']){
  const trial={graph:{...r.graph},prepared:{...r.prepared,quality:JSON.parse(JSON.stringify(r.prepared.quality))}},q=trial.prepared.quality;
  if(kind==='contacts')q.line_geometry.unrelated_contacts.push({edges:['a','b']});
  if(kind==='labels')q.unplaced_port_labels.push({edge:'x'});
  if(kind==='route')q.route_failures.push({id:'x'});
  if(kind==='budget')q.native_width_px=20000;
  if(kind==='accounting')trial.graph.node_accounting={visible:[]};
  assert.equal(A.assess(b.document.ir,b,trial).accepted,false,kind);
 }
});
test('adaptive rendering is reversible, deterministic after reopening, and never rewrites the request or canonical IR',()=>{
 const ir=load('SameSource'),s={...state,paperAdaptive:true},before=JSON.stringify({ir,s}),r=R.render(ir,s);
 assert.equal(JSON.stringify({ir,s}),before);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 assert.equal(R.renderPrepared(ir,r.document.state,r).svg,r.svg);
 assert.equal(R.render(ir,{...s,paperAdaptive:false}).svg,render('SameSource').svg);
 const raw=R.render(ir,{...s,paperAuto:false,open:[...r.graph.idx.children.keys()].filter(Boolean)});
 assert.ok(raw.graph.nodes.length>r.graph.nodes.length);assert.ok(!raw.graph.publication.adaptive_frontier);accounts(ir,raw.graph);
});
test('explicit/manual/source-panel and print requests remain outside adaptive selection',()=>{
 for(const extra of [{paperAuto:false,open:['model']},{paperMedium:'print'},{paperGranularity:'modules'},{offsets:{model:{x:10,y:20}}}]){
  const b=render('SameSource',extra),r=render('SameSource',{...extra,paperAdaptive:true});assert.equal(r.svg,b.svg);assert.ok(!r.graph.publication.adaptive_frontier);
 }
});
test('bounded selection preserves local budget deferral and previous independent expressions',()=>{
 for(const name of ['MixedCircuit','ForeignComposition','BrokenCell','ConditionalCarry']){
  const b=render(name),r=render(name,{paperAdaptive:true}),a=r.graph.publication.adaptive_frontier;
  assert.ok(a.attempts.length<=3);assert.ok(a.preflights.length<=36);
  const previously=A.evidence(b.document.ir,b),now=A.evidence(r.document.ir,r);
  for(const id of previously.goals.keys())assert.ok(now.goals.has(id),id);
  for(const id of previously.boundaries)assert.ok(now.boundaries.has(id),id);accounts(r.document.ir,r.graph);
 }
 const small=render('SameSource',{paperAdaptive:true,paperBudget:4});assert.equal(small.graph.publication.adaptive_frontier.attempts.length,0);
});
test('unrequested existing SVG states remain byte-identical to the actual frozen baseline',()=>{
 const old=require('../tools/load_publication_renderer.cjs')(path.resolve('verification/local-relations/iteration-25-before-adaptive-frontier/implementation/semantic_studio'));
 for(const name of ['MixedCircuit','UnknownFusion','BrokenCell','ConditionalCarry','SameSource'])assert.equal(render(name).svg,old.render(load(name),state).svg);
});
