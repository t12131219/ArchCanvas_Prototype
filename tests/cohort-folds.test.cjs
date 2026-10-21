'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js'),C=require('../semantic_studio/compact-diagrams.js'),E=require('../semantic_studio/semantic-engine.js'),A=require('../semantic_studio/adaptive-frontier.js'),L=require('../semantic_studio/architecture-layout.js');
const state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
const read=name=>JSON.parse(fs.readFileSync('verification/cohort-folds/current/'+name+'.json')),cache=new Map();
function draw(name){if(!cache.has(name)){const ir=read(name),main=R.render(ir,state),set=D.render(ir,state,R,{policy:'compact',main,maxTrials:6,maxPanels:3});cache.set(name,{ir,main,set});}return cache.get(name);}
const done=rows=>new Set(rows.filter(r=>r.status==='fulfilled').map(r=>r.goal)),stages=g=>g.publication.role_path_stages?.rows||[];
function groups(ir,main){const probe=E.project(ir,{...state,paperRolePathStages:true}),out=new Map();for(const r of stages(probe))if(r.status==='summary')for(const owner of new Set(r.roles.map(r=>r.owner))){if(!out.has(owner))out.set(owner,[]);out.get(owner).push(r);}return out;}

test('two siblings compact together and recover both exact instances in one original scope',()=>{
 const {ir,main,set}=draw('ParallelPaths'),t=set.attempts.find(t=>t.form==='summary-set'&&t.accepted);
 assert.equal(t.owners.length,2);assert.equal(t.recoveries.length,1);assert.deepEqual(t.recoveries[0].owners,t.owners);
 assert.equal(t.recoveries[0].scope,main.graph.publication.focus);assert.equal(main.graph.nodes.length,15);assert.equal(set.panels[0].result.graph.nodes.length,13);
 assert.ok(t.metrics.area<t.before.area&&t.main_cost<1);assert.ok([...done(set.baseline_coverage)].every(id=>done(set.coverage).has(id)));
 assert.deepEqual(t.recovery,{roles:[],summaries:[],paths:[]});assert.equal(done(set.coverage).size,14);
 assert.ok(t.main_lost_goals.every(id=>!done(D.coverage(ir,set.plan,[set.panels[0]])).has(id)));
});
test('unfamiliar residual wrappers open the display ancestors of the selected source paths',()=>{
 const {ir,main,set}=draw('FramedEnvelope'),t=set.attempts.find(t=>t.form==='summary-set'&&t.accepted),by=new Map(main.graph.architecture.nodes.map(n=>[n.id,n]));
 assert.equal(t.owners.length,2);assert.equal(t.recoveries.length,1);
 const r=t.recoveries[0];let intermediates=0;
 for(const owner of r.owners){let at=owner;while(at!==r.scope){assert.ok(r.state.open.includes(at));if(by.get(at).presentation_only)intermediates++;at=by.get(at).parent;}}
 assert.ok(r.state.open.includes(r.scope));
 assert.ok(intermediates>0);assert.ok(done(set.coverage).size>done(set.baseline_coverage).size);assert.deepEqual(C.preserve(ir,[{result:main}],set.panels,D),{roles:[],summaries:[],paths:[]});
});
test('four owners in two distinct source scopes use two exact recovery panels within the render budget',()=>{
 const {main,set}=draw('SplitEnvelopes'),t=set.attempts.find(t=>t.form==='summary-set'&&t.accepted);
 assert.equal(t.owners.length,4);assert.equal(t.recoveries.length,2);assert.ok(t.recoveries.every(r=>r.owners.length===2));
 assert.notEqual(t.recoveries[0].scope,t.recoveries[1].scope);
 const maximal=set.attempts.find(a=>a.form==='summary-set'&&a.owners.length===4);
 assert.ok(maximal);assert.equal(maximal.recoveries.length,2);assert.ok(maximal.recoveries.every(r=>r.owners.length===2));
 assert.notEqual(maximal.recoveries[0].scope,maximal.recoveries[1].scope);
 assert.ok(maximal.reasons.includes('lower-measured-benefit')||maximal.accepted);
 assert.ok(set.rendered_trials<=6);assert.ok(set.panels.length>=2);assert.ok(set.panels[0].result.graph.nodes.length<main.graph.nodes.length);
 assert.ok(done(set.coverage).size>=done(set.baseline_coverage).size);
});
test('failed fold speculation reserves at least half the budget for ordinary exact details',()=>{
 const {ir,main}=draw('SplitEnvelopes');
 let renders=0;
 const renderer={render:(ir,s)=>{renders++;const r=R.render(ir,s);if(!s.paperParallelRailRepair)return r;
  return {...r,prepared:{...r.prepared,quality:{...r.prepared.quality,issues:['fixture-rejected-recovery']}}};}};
 const set=D.render(ir,state,renderer,{policy:'compact',main,maxTrials:6,maxPanels:3});
 assert.ok(set.attempts.some(t=>t.form==='summary-set'&&t.reasons.includes('figure-quality')));
 assert.ok(!set.attempts.some(t=>t.form==='summary-set'&&t.accepted));
 assert.equal(set.summary_trial_limit,3);assert.ok(set.rendered_trials<=6);assert.equal(renders,set.rendered_trials);
 assert.ok(set.attempts.some(t=>t.form!=='summary-set'&&t.rendered));
 assert.ok([...done(set.baseline_coverage)].every(id=>done(set.coverage).has(id)));
 assert.ok(done(set.coverage).size>done(set.baseline_coverage).size);
});
test('packing cannot jump a repeated, observed, conditional, stateful or certified parent',()=>{
 const {ir,main}=draw('ParallelPaths'),g=groups(ir,main),focus=main.graph.publication.focus;
 for(const change of [{repeat_contract:{count:2}},{semantic_type:'repeat-instance'},{condition:{branch:'choice'}},{mutable:true},{identity_display:true},{evidence_status:'runtime-only'},{runtime_evidence:[{}]},{iteration:{}},{observed_calls:1}]){
  const changed=structuredClone(ir);Object.assign(changed.nodes.find(n=>n.id===focus),change);
  const requests=C.requests(changed,main,g,focus);assert.ok(requests.every(r=>r.scopes.every(s=>s.scope!==focus)));
 }
 const changed=structuredClone(ir);changed.semantic_contracts.push({id:'parent-certificate',node:focus});
 assert.ok(C.requests(changed,main,g,focus).every(r=>r.scopes.every(s=>s.scope!==focus)));
 const request=C.requests(ir,main,g,focus).find(r=>r.owners.length===2).scopes[0];assert.equal(C.recoveryState(changed,main,state,request),null);
});
test('attaching a redundant source frame does not erase its canonical sibling recovery scope',()=>{
 const {ir,main}=draw('ParallelPaths'),g=groups(ir,main),focus=main.graph.publication.focus;
 const attached={...main,graph:{...main.graph,positions:new Map([...main.graph.positions].filter(([id])=>id!==focus))}};
 const request=C.requests(ir,attached,g,focus).find(r=>r.owners.length===2);
 assert.equal(request.scopes.length,1);assert.equal(request.scopes[0].scope,focus);assert.ok(C.recoveryState(ir,attached,state,request.scopes[0]));
});
test('a conditional unknown and GRU state survive coordinated folds; shared calls keep independent boundaries',()=>{
 const {ir,main,set}=draw('GuardedEnvelope'),b=A.evidence(ir,main),a=A.evidence(ir,set.panels[0].result);
 assert.ok([...b.boundaries].every(id=>a.boundaries.has(id)));assert.ok([...done(set.baseline_coverage)].every(id=>done(set.coverage).has(id)));
 const shared=draw('SharedEnvelope');assert.ok(!shared.set.attempts.some(t=>t.form==='summary-set'));
});
test('a packed recovery cannot claim coverage after one instance loses its canonical operand',()=>{
 const {ir,main}=draw('ParallelPaths');let broken=false;
 const renderer={render:(ir,s)=>{const r=R.render(ir,s);if(s.paperAuto!==false)return r;broken=true;
  return {...r,prepared:{...r.prepared,routes:r.prepared.routes.map(e=>({...e,target_port:'wrong',...(e.bundle_members?{bundle_members:e.bundle_members.map(m=>({...m,target_port:'wrong'}))}:{})}))}};
 }};
 const set=D.render(ir,state,renderer,{policy:'compact',main,maxTrials:4,maxPanels:3}),t=set.attempts.find(t=>t.form==='summary-set');
 assert.ok(broken);assert.equal(t.owners.length,2);assert.ok(t.reasons.includes('previous-direct-goals-lost'));assert.ok(!t.accepted);
});
test('selected packed figures reopen and deeper local expansion preserves canonical facts',()=>{
 const {ir,set}=draw('PairedEnvelope'),before=JSON.stringify(ir);
 for(const p of set.panels)assert.equal(R.render(ir,JSON.parse(JSON.stringify(p.result.document.state))).svg,p.result.svg);
 const p=set.panels[0],stage=stages(p.result.graph).find(r=>r.status==='summary'),deep=R.render(ir,{...p.state,paperAuto:false,open:[...p.result.graph.publication.open,stage.node,stage.helper]});
 assert.ok(stage.operations.every(o=>deep.graph.positions.has(o.node)));assert.equal(JSON.stringify(ir),before);
});
test('parallel rail repair removes false junctions with fixed terminals and at most one extra crossing',()=>{
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/parallel-rail-contact.json')),positions=new Map(fixture.positions.map(n=>[n.id,n]));let routes=fixture.routes;
 positions.context={idx:{nodes:new Map(fixture.nodes.map(n=>[n.id,n]))},edges:routes,feedback:new Set(),portOrder:'neighbors',ancestorPorts:'boundary',crossingCost:180,contactCost:360,stubLength:16};
 const before=R.lineGeometry(routes);assert.equal(before.unrelated_contacts.length,4);assert.equal(before.overlapping_paths.filter(p=>!p.same_value).length,2);
 for(const id of fixture.repair){const e=routes.find(e=>e.id===id),points=e.route.points;
  positions.context.reserved=routes.filter(e=>e.id!==id).flatMap(e=>e.route.points.slice(1).map((b,i)=>[e.route.points[i],b]));positions.context.repairRoute=e.route;
  const route=L.route(e,positions);assert.ok(route.ok);assert.deepEqual(route.points[0],points[0]);assert.deepEqual(route.points.at(-1),points.at(-1));
  assert.ok(route.points.every((p,i)=>!i||p.x===route.points[i-1].x||p.y===route.points[i-1].y));routes=routes.map(e=>e.id===id?{...e,route}:e);
 }
 const after=R.lineGeometry(routes);assert.deepEqual(after.unrelated_contacts,[]);assert.ok(after.overlapping_paths.every(p=>p.same_value));assert.ok(after.crossings<=before.crossings+1);
});
test('a narrow obstacle corridor separates unrelated rails without additional crossings',()=>{
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/narrow-rail-contact.json')),positions=new Map(fixture.positions.map(n=>[n.id,n]));
 positions.context={idx:{nodes:new Map(fixture.nodes.map(n=>[n.id,n]))},edges:fixture.routes,feedback:new Set(),portOrder:'neighbors',ancestorPorts:'boundary',crossingCost:180,contactCost:360,stubLength:16};
 const e=fixture.routes.find(e=>e.id===fixture.repair),before=R.lineGeometry(fixture.routes),original=JSON.stringify(fixture);
 assert.equal(before.overlapping_paths.filter(p=>!p.same_value).length,1);assert.equal(before.unrelated_contacts.length,2);
 positions.context.reserved=fixture.routes.filter(r=>r!==e).flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));positions.context.repairRoute=e.route;
 const route=L.route(e,positions),after=R.lineGeometry(fixture.routes.map(r=>r===e?{...r,route}:r));
 assert.ok(route.ok);assert.deepEqual(route.points[0],e.route.points[0]);assert.deepEqual(route.points.at(-1),e.route.points.at(-1));
 assert.deepEqual(after.unrelated_contacts,[]);assert.ok(after.overlapping_paths.every(p=>p.same_value));assert.equal(after.crossings,before.crossings);
 assert.equal(JSON.stringify(fixture),original);
});
