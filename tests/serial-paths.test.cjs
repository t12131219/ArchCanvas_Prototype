'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),P=require('../semantic_studio/publication.js'),
 F=require('../semantic_studio/local-pipelines.js'),S=require('../semantic_studio/summary-goals.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},folder='verification/serial-paths/experiment/';
const read=name=>JSON.parse(fs.readFileSync(folder+name+'.json'));
const render=(ir,extra={})=>R.render(ir,{...state,...extra});
const get=r=>r.graph.publication.local_pipelines?.rows.find(p=>p.path_display);
function accounted(ir,r){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
function compile(ir,plan){return F.compile({ir,plan,bindings:new Map(),metadata:new Set(ir.nodes.filter(n=>n.value!==undefined).map(n=>n.id)),configurationUses:new Set()});}

test('a long extracted path folds through structural partitions while every call/configuration remains distinct',()=>{
 const ir=read('LongCurve'),original=JSON.stringify(ir),r=render(ir),p=get(r);assert.ok(p);assert.equal(p.status,'summary');
 assert.equal(p.operations.length,14);assert.deepEqual(p.path_display.runs.map(r=>r.operations.length),[8,3,2,1]);
 assert.deepEqual(p.path_display.runs.flatMap(r=>r.operations),p.operations.map(o=>o.node));assert.ok(p.display_partitions.length);
 assert.ok(r.svg.includes('8 calls'));assert.match(r.svg,/Every call, operand and configuration remains distinct/);
 const nan=p.path_display.runs.find(r=>r.label==='nan_to_num');
 const values=nan.operations.map(id=>ir.nodes.find(n=>n.id===id).arguments.kwargs.nan);
 assert.deepEqual(values,[0,1]);assert.equal(JSON.stringify(ir),original);accounted(ir,r);
 const c=r.graph.summary_coverage.find(c=>c.node===p.node);assert.equal(c.status,'fulfilled');assert.equal(c.detailed_relationships_fulfilled,false);
 assert.ok(p.operations.every(o=>!r.graph.expression_coverage.some(c=>c.goal==='goal:node:'+o.node&&c.status==='fulfilled')));
});

test('summary, frame detail, exact operations and refold are reversible with actual routes and source cuts',()=>{
 const ir=read('LongCurve'),folded=render(ir),p=get(folded),base=folded.graph.publication.open;
 const framed=render(ir,{paperAuto:false,open:[...base,p.node]});assert.ok(framed.graph.nodes.length>folded.graph.nodes.length);
 assert.ok(!get(framed).detailed_operations_exposed);
 const opened=render(ir,{paperAuto:false,open:[...base,...p.source_boundaries.map(b=>b.node),...p.display_partitions.map(b=>b.node)]});
 assert.equal(get(opened).detailed_operations_exposed,true);assert.ok(opened.graph.nodes.length>framed.graph.nodes.length);
 const c=opened.graph.summary_coverage.find(c=>c.node===p.node);assert.equal(c.status,'fulfilled');assert.equal(c.form,'operation-paths');
 for(const r of [folded,framed,opened]){assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r);assert.deepEqual(r.document.ir,ir);}
 const saved=JSON.parse(JSON.stringify(opened.document));assert.equal(render(saved.ir,saved.state).svg,opened.svg);
 assert.equal(render(ir,folded.document.state).svg,folded.svg);
});

test('an unknown neighbor and a state write remain explicit, without hiding the independently proved path',()=>{
 for(const name of ['MixedCurve','StatefulCurve']){const ir=read(name),r=render(ir);assert.equal(get(r).status,'summary');
  const protectedNodes=ir.nodes.filter(n=>n.kind==='opaque'||n.mutable);assert.ok(protectedNodes.length);
  for(const n of protectedNodes){assert.ok(r.graph.nodes.some(x=>x.id===n.id));assert.ok(!get(r).canonical_members.includes(n.id));}
  accounted(ir,r);assert.deepEqual(r.prepared.quality.issues,[]);
 }
});

test('escaping intermediates and late external inputs are not silently converted into a closed serial summary',()=>{
 assert.equal(get(render(read('EscapingCurve'))),undefined);
 const r=render(read('LateCurve')),p=get(r);assert.equal(p.status,'expanded');assert.ok(p.detailed_operations_exposed);
 assert.equal(r.graph.summary_coverage.find(c=>c.node===p.node).form,'operation-paths');
});

test('every unknown, mutable, conditional, observed, certified or identity boundary inside a long path blocks it',()=>{
 const source=read('LongCurve'),p=get(render(source));
 for(const change of [{kind:'opaque'},{kind:'control'},{mutable:true},{condition:{branch:'a'}},{evidence_status:'runtime-only'},
  {identity_display:{reference:'shared'}},{observed_calls:{}},{runtime_evidence:[{}]},{semantic_contracts:['c']},{repeat_contract:{}},{iteration:{}}]){
  const ir=structuredClone(source);Object.assign(ir.nodes.find(n=>n.id===p.operations[7].node),change);
  assert.ok(![...compile(ir,ir).values()].some(r=>r.operations.length>6),JSON.stringify(change));
 }
});

test('synthetic display frames require exact membership/cuts and cannot authorize crossing a semantic boundary',()=>{
 const ir=read('LongCurve'),plan=structuredClone(P.plan(ir)),owner=get(render(ir));
 for(const mutate of [n=>n.semantic_type='dependency-band',n=>n.boundary_ports.pop(),n=>n.canonical_members.pop(),
  n=>n.canonical_members[0]=n.canonical_members[1],n=>n.mutable=true,n=>n.presentation_only=false]){
  const changed=structuredClone(plan),n=changed.nodes.find(n=>n.id===owner.display_partitions[0].node);mutate(n);
  assert.ok(!compile(ir,changed).has(owner.node));
 }
});

test('independent coverage rejects forged counts, reordered/omitted calls and damaged display partition proofs',()=>{
 const ir=read('LongCurve'),r=render(ir),p=get(r);
 for(const mutate of [p=>p.path_display.runs[0].operations.pop(),p=>p.path_display.runs.reverse(),p=>p.path_display.runs[0].label='invented',
  p=>p.display_partitions[0].cuts.pop(),p=>p.display_partitions[0].canonical_members.pop(),
  p=>p.canonical_members[0]=p.canonical_members[1]]){
  const plan=structuredClone(r.graph.architecture);mutate(plan.nodes.find(n=>n.id===p.node).local_pipeline);
  const c=S.evaluate(S.build(ir,plan),ir,r.graph,r.prepared).find(c=>c.node===p.node);
  assert.equal(c.status,'unfulfilled');assert.ok(c.proof_errors.length);
 }
 const g=structuredClone(r.graph);g.nodes.find(n=>n.id===p.node).paper.lines=['sin · 7 calls'];
 assert.equal(S.evaluate(r.graph.summary_goals,ir,g,r.prepared).find(c=>c.node===p.node).status,'unfulfilled');
});

test('model names do not select the representation, and print/disabled-summary policies remain separate',()=>{
 const ir=read('LongCurve'),r=render(ir),changed=structuredClone(ir);changed.title='Transformer';
 for(const n of changed.nodes){n.label='Transformer';n.source_class='Unseen';}
 assert.deepEqual(get(render(changed)).path_display,get(r).path_display);
 assert.equal(get(render(ir,{paperPipelineSummaries:false})),undefined);
 assert.equal(render(ir,{paperMedium:'print'}).graph.publication.local_pipelines,undefined);
});

test('refactored source helpers retain each source cut while mixed operation labels remain fully listed',()=>{
 for(const [name,count]of [['RefactoredCurve',15],['VariedCurve',8]]){
  const ir=read(name),r=render(ir),p=get(r);assert.equal(p.status,'summary');assert.equal(p.operations.length,count);
  assert.deepEqual(p.path_display.runs.flatMap(r=>r.operations),p.operations.map(o=>o.node));
  if(name==='RefactoredCurve')assert.ok(p.source_boundaries.length>1);
  else assert.equal(p.path_display.runs.length,8);
  assert.equal(r.graph.summary_coverage.find(c=>c.node===p.node).status,'fulfilled');
  assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r);
 }
});

test('an explicit exact role request remains visible instead of being swallowed by a long source summary',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/adaptive-role-paths/current/BoundedWeave.json')),
  cert=ir.semantic_contracts.find(c=>c.roles?.numerical_guards?.length),target=cert.roles.numerical_guards[0];
 const automatic=render(ir,{paperAdaptive:true,paperAdaptivePolicy:'structure'});assert.ok(automatic.graph.publication.local_pipelines.rows.some(p=>p.path_display&&p.canonical_members.includes(target)&&p.status==='summary'));
 const requested=render(ir,{paperRolePaths:[{node:cert.node,certificate:cert.id,role:['numerical_guards','0']}]});
 assert.ok(requested.graph.positions.has(target));assert.ok(requested.graph.publication.role_frontier.roles.some(r=>r.node===target&&r.status==='exposed'&&JSON.stringify(r.role_keys)==='["numerical_guards","0"]'));
 assert.ok(!requested.graph.publication.local_pipelines.rows.some(p=>p.status==='summary'&&p.canonical_members.includes(target)));
 assert.deepEqual(requested.document.ir,ir);assert.deepEqual(requested.prepared.quality.issues,[]);accounted(ir,requested);
});
