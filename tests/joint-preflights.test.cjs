'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=require('../tools/load_publication_renderer.cjs'),{renderer:R,diagrams:D}=load('./semantic_studio',{diagramSet:true}),E=load('./semantic_studio',{engine:true});
const read=(name,folder)=>JSON.parse(fs.readFileSync('verification/'+folder+'/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'};
const fulfilled=s=>s.coverage.filter(g=>g.status==='fulfilled').map(g=>g.goal);

test('a no-op role projection does not consume either routed trial of an unfamiliar mixed diagram',()=>{
 const ir=read('MixedWeave','coverage-selection/current'),main=R.render(ir,state),original=JSON.stringify(ir),calls=[];
 const renderer={render:(ir,s)=>{calls.push(JSON.stringify(s));return R.render(ir,s);}};
 const set=D.joint(ir,state,renderer,{main,maxPanels:3,maxTrials:2});
 const deferred=set.preflights.find(p=>p.reasons.includes('protected-or-deferred-role'));
 assert.ok(deferred&&deferred.reasons.includes('no-new-projected-goals'));
 assert.equal(deferred.role_request.selection,'deferred');assert.ok(!calls.includes(JSON.stringify(deferred.state)));
 assert.equal(calls.length,2);assert.equal(set.rendered_trials,2);assert.equal(fulfilled(set).length,20);
 assert.ok(set.baseline_coverage.filter(g=>g.status==='fulfilled').every(g=>fulfilled(set).includes(g.goal)));
 assert.equal(JSON.stringify(ir),original);
});

test('deferred alternate forms do not make unrelated tiny panels displace a nested computation figure',()=>{
 const ir=read('NestedWorkshop','detail-alternatives/experiment'),s={...state,paperBudget:4},main=R.render(ir,s);
 const set=D.joint(ir,s,R,{main,maxPanels:3,maxTrials:2});
 assert.equal(set.rendered_trials,2);assert.equal(set.panels.length,3);assert.equal(set.complete,true);assert.equal(fulfilled(set).length,28);
 assert.equal(set.panels[0].result.svg,main.svg);
 assert.ok(set.preflights.some(p=>!p.eligible));
 assert.equal(set.attempts.length,2);assert.ok(set.attempts.every(a=>a.accepted&&a.form==='detail'));
 assert.notEqual(set.attempts[0].comparison_round,set.attempts[1].comparison_round);
});

test('an exact certified role stopped by a display budget stays a deferred projection, never coverage',()=>{
 const ir=read('SameSource','semantic-design/current/after'),base=E.project(ir,{...state,view:'publication'});
 const c=ir.semantic_contracts.find(c=>c.roles.scores&&base.positions.has(c.node));assert.ok(c);
 const opportunity={kind:'role-path',node:c.node,certificate:c.id,role:['scores']};
 const next={...state,view:'publication',paperBudget:4,paperRolePaths:[{node:c.node,certificate:c.id,role:['scores']}]};
 const graph=E.project(ir,next),receipt=D.preflight(ir,base.expression_goals?.goals||[],graph,opportunity);
 assert.equal(receipt.eligible,false);assert.ok(receipt.reasons.includes('protected-or-deferred-role'));
 assert.notEqual(receipt.role_request.status,'exposed');assert.ok(!('coverage' in receipt)&&!('quality' in receipt));
});

test('projection promises cannot override corrupted physical operand bindings',()=>{
 const ir=read('SourceMosaic','summary-coverage/current'),main=R.render(ir,state);
 const renderer={render:(ir,s)=>{const r=R.render(ir,s);return {...r,prepared:{...r.prepared,routes:r.prepared.routes.map(e=>({...e,target_port:'corrupted',
  ...(e.bundle_members?{bundle_members:e.bundle_members.map(m=>({...m,target_port:'corrupted'}))}:{})}))}};}};
 const set=D.joint(ir,state,renderer,{main,maxPanels:3,maxTrials:2});
 assert.ok(set.preflights.some(p=>p.eligible&&p.possible_goals.length));assert.ok(set.attempts.every(a=>!a.accepted));
 assert.equal(set.panels.length,1);assert.deepEqual(set.coverage,set.baseline_coverage);
});

test('zero render budget leaves every original obligation deferred or already fulfilled without projections',()=>{
 const ir=read('BrokenWorkshop','detail-alternatives/experiment'),s={...state,paperBudget:4},main=R.render(ir,s);let calls=0;
 const set=D.joint(ir,s,{render:()=>{calls++;throw Error('unexpected render');}},{main,maxTrials:0,maxPanels:3});
 assert.equal(calls,0);assert.equal(set.projected_trials,0);assert.equal(set.preflights.length,0);assert.equal(set.attempts.length,0);
 assert.deepEqual(set.coverage,set.baseline_coverage);assert.ok(set.deferred_goals.length);
});
