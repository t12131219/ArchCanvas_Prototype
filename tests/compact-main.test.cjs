'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js'),A=require('../semantic_studio/adaptive-frontier.js');
const read=name=>JSON.parse(fs.readFileSync('verification/compact-main/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
const done=rows=>rows.filter(r=>r.status==='fulfilled').map(r=>r.goal),stages=r=>r.graph.publication.role_path_stages?.rows||[];
const cache=new Map();function draw(name){if(!cache.has(name)){const ir=read(name),main=R.render(ir,state),set=D.render(ir,state,R,{policy:'compact',main,maxTrials:4,maxPanels:3});cache.set(name,{ir,main,set});}return cache.get(name);}

test('a compact main and exact local recovery add direct evidence without crediting hidden operations',()=>{
 const {ir,main,set}=draw('PrismPath'),t=set.attempts.find(t=>t.form==='summary-set');
 assert.ok(t.accepted);assert.ok(t.main_lost_goals.length);assert.deepEqual(t.lost_goals,[]);assert.deepEqual(t.recovery,{roles:[],summaries:[],paths:[]});
 assert.equal(main.graph.nodes.length,7);assert.equal(set.panels[0].result.graph.nodes.length,6);
 assert.equal(done(set.coverage).length,7);assert.equal(done(set.baseline_coverage).length,5);
 assert.ok(t.total_area>t.before.area);assert.ok(t.total_wire_length>t.before.wire_length);
 const p=set.panels.find(p=>p.id.startsWith('recovery:'));assert.equal(p.result.graph.publication.focus,t.anchor);
 for(const id of t.main_lost_goals)assert.ok(set.coverage.find(r=>r.goal===id).panels.includes(p.id));
 const d=D.coverage(ir,set.plan,[set.panels[0]]);for(const id of t.main_lost_goals)assert.equal(d.find(r=>r.goal===id).status,'deferred');
});
test('renamed source uses the same role/path/recovery policy',()=>{
 const a=draw('PrismPath'),b=draw('OtherNames');
 assert.equal(a.set.attempts[0].accepted,b.set.attempts[0].accepted);assert.equal(a.set.panels[0].result.graph.nodes.length,b.set.panels[0].result.graph.nodes.length);
 assert.equal(done(a.set.coverage).length,done(b.set.coverage).length);
});
test('owner selection folds one exact scope and does not silently fold its similar neighbor',()=>{
 const ir=read('ParallelPaths'),all=R.render(ir,{...state,paperRolePathStages:true}),rs=stages(all),owners=[...new Set(rs.flatMap(r=>r.roles.map(r=>r.owner)))];assert.equal(owners.length,2);
 for(const owner of owners){const r=R.render(ir,{...state,paperRolePathStages:true,paperRolePathStageOwners:[owner]});assert.equal(stages(r).length,1);assert.ok(stages(r)[0].roles.every(r=>r.owner===owner));}
 const none=R.render(ir,{...state,paperRolePathStages:true,paperRolePathStageOwners:[]});assert.equal(stages(none).length,0);
});
test('shared and unknown helper paths never become automatic certified stage candidates',()=>{
 for(const name of ['SharedPath','UnknownPath']){const {set}=draw(name);assert.ok(!set.attempts.some(t=>t.form==='summary-set'));}
});
test('actual geometry rejects a fold that saves a node but neither space nor routing cost',()=>{
 const {main,set}=draw('MixedPaths'),t=set.attempts.find(t=>t.form==='summary-set');assert.ok(t);assert.equal(t.accepted,false);
 assert.ok(t.reasons.includes('no-main-compaction'));assert.ok(t.reasons.includes('main-routing-cost'));
 assert.equal(set.panels[0].result.svg,main.svg);
});
test('conditional unknown and recurrent state boundaries stay visible in mixed compositions',()=>{
 for(const name of ['ConditionalPaths','MixedPaths','InterleavedPaths']){
  const {ir,main,set}=draw(name),before=A.evidence(ir,main),after=A.evidence(ir,set.panels[0].result);
  assert.ok([...before.boundaries].every(id=>after.boundaries.has(id)));assert.ok(done(set.baseline_coverage).every(id=>done(set.coverage).includes(id)));
  for(const t of set.attempts.filter(t=>t.form==='summary-set'&&t.detail_state))assert.equal(t.detail_state.paperFocus,t.anchor);
 }
});
test('wrong recovery operands cannot make folding eligible',()=>{
 const {ir,main}=draw('PrismPath'),renderer={render:(ir,s)=>{
  const r=R.render(ir,s);if(!s.paperFocus)return r;
  return {...r,prepared:{...r.prepared,routes:r.prepared.routes.map(e=>({...e,target_port:'wrong',...(e.bundle_members?{bundle_members:e.bundle_members.map(m=>({...m,target_port:'wrong'}))}:{})}))}};
 }};
 const set=D.render(ir,state,renderer,{policy:'compact',main,maxTrials:4,maxPanels:3}),t=set.attempts.find(t=>t.form==='summary-set');
 assert.ok(!t.accepted);assert.ok(t.reasons.includes('previous-direct-goals-lost'));assert.equal(set.panels[0].result.svg,main.svg);
});
test('a recovery panel from a different concrete owner is rejected',()=>{
 const {ir,main}=draw('PrismPath'),renderer={render:(ir,s)=>{const r=R.render(ir,s);if(s.paperFocus)r.graph.publication.focus='another-instance';return r;}};
 const set=D.render(ir,state,renderer,{policy:'compact',main,maxTrials:4,maxPanels:3});
 assert.ok(set.attempts.find(t=>t.form==='summary-set').reasons.includes('different-recovery-instance'));
});
test('manual positions and expansion requests retain user control, with bounded truthful work',()=>{
 const {ir,main}=draw('PrismPath');for(const extra of [{paperAuto:false,open:main.graph.publication.open},{offsets:{model:{x:1,y:0}}}]){
  const set=D.render(ir,{...state,...extra},R,{policy:'compact',maxTrials:4,maxPanels:3});assert.ok(!set.attempts.some(t=>t.form==='summary-set'));
 }
 let calls=0;const renderer={render:(...args)=>{calls++;return R.render(...args);}};
 const zero=D.render(ir,state,renderer,{policy:'compact',main,maxTrials:0,maxPanels:1});assert.equal(calls,0);assert.equal(zero.rendered_trials,0);assert.ok(zero.deferred_goals.length);
 const one=D.render(ir,state,renderer,{policy:'compact',main,maxTrials:4,maxPanels:1});assert.ok(calls<=4);assert.equal(one.panels.length,1);assert.ok(one.attempts.filter(t=>t.form==='summary-set').every(t=>!t.accepted));
});
test('selected states save reopen and continue to unfold without mutating canonical facts',()=>{
 const {ir,main,set}=draw('PrismPath'),before=JSON.stringify(ir);
 for(const p of set.panels)assert.equal(R.render(ir,JSON.parse(JSON.stringify(p.result.document.state))).svg,p.result.svg);
 const p=set.panels[0],r=stages(p.result)[0],s={...p.state,paperAuto:false,open:[...p.result.graph.publication.open,r.node,r.helper]},deep=R.render(ir,s);
 assert.ok(r.operations.every(o=>deep.graph.positions.has(o.node)));assert.equal(JSON.stringify(ir),before);
 assert.equal(main.graph.nodes.length,7);assert.ok(set.rendered_trials<=4&&set.panels.length<=3);
});
