'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js');
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
const load=(name,folder='coverage-selection')=>JSON.parse(fs.readFileSync(`verification/${folder}/current/${name}.json`));
const cache=new Map(),draw=(name,extra={},folder)=>{const key=JSON.stringify([name,extra,folder]);if(!cache.has(key))cache.set(key,R.render(load(name,folder),{...state,...extra}));return cache.get(key);};

test('structure focus retains an already expressed dependency summary with finer paths still available',()=>{
 const ir=load('SourceMosaic','summary-coverage'),b=R.render(ir,{...state,paperAdaptive:false}),r=R.render(ir,state);
 assert.equal(r.svg,b.svg);assert.equal(r.graph.nodes.length,6);
 assert.ok(r.graph.publication.adaptive_frontier.preflights.some(p=>p.reason==='dependency-structure-already-expressed'));
 assert.equal(r.graph.publication.adaptive_frontier.attempts.length,0);
 const detailed=R.render(ir,{...state,paperAdaptivePolicy:'detail'});assert.equal(detailed.graph.nodes.length,11);
 const manual=R.render(ir,{...state,paperAuto:false,open:detailed.graph.publication.open});assert.equal(manual.graph.nodes.length,11);
 assert.deepEqual(manual.document.ir,ir);
});

test('actual alternatives compete before committing their frontier, and a safe loser is not reported as selected',()=>{
 const r=draw('MixedWeave'),a=r.graph.publication.adaptive_frontier;
 assert.equal(a.policy,'structure');assert.ok(a.attempts.length<=3&&a.preflights.length<=36);
 const first=a.attempts.filter(t=>t.comparison_round===0),selected=first.find(t=>t.accepted);
 assert.equal(first.length,2);assert.equal(selected.opportunity.kind,'roles');
 for(const other of first.filter(t=>t!==selected&&t.eligible)){
  assert.ok(A.compare(selected.selection_benefit,other.selection_benefit)<=0);
  assert.ok(other.reasons.includes('lower-measured-benefit'));assert.equal(other.accepted,false);
 }
 const detail=draw('MixedWeave',{paperAdaptivePolicy:'detail'});
 assert.ok(r.graph.nodes.length<detail.graph.nodes.length);
 assert.ok(r.graph.summary_coverage.filter(c=>c.form==='summary').length>detail.graph.summary_coverage.filter(c=>c.form==='summary').length);
 assert.deepEqual(r.prepared.quality.issues,[]);
});

test('new scoring never converts a scoped summary into complete atomic operand coverage',()=>{
 const r=draw('SourceMosaic',{},'summary-coverage'),a=A.evidence(r.document.ir,r);
 assert.ok(a.summaries.size);assert.ok(![...a.goals.keys()].some(id=>id.startsWith('goal:summary:')));
 const p=r.graph.summary_goals.goals[0];assert.ok(p.operations.every(o=>!a.goals.has('goal:node:'+o.node)));
 const before=r.graph.publication.adaptive_frontier.preflights.find(p=>p.estimated_benefit);
 assert.equal(before.estimated_benefit.structure,0);assert.equal(before.estimated_benefit.only_summary_internal,true);
});

test('unknown and conditional boundaries remain explicit and an uncertified composition still works',()=>{
 for(const name of ['InterruptedWeave','UncertifiedWeave']){
  const ir=load(name),b=R.render(ir,{...state,paperAdaptive:false}),r=draw(name),before=A.evidence(ir,b),after=A.evidence(ir,r);
  assert.ok([...before.boundaries].every(id=>after.boundaries.has(id)));
  for(const n of ir.nodes.filter(n=>n.kind==='opaque')){
   const representative=r.graph.nodes.find(v=>v.id===(r.graph.positions.has(n.id)?n.id:r.graph.representatives[n.id]));
   assert.ok(representative&&(representative.kind==='opaque'||representative.kind==='control'||representative.condition||representative.paper.unknown_count));
  }
  for(const t of r.graph.publication.adaptive_frontier.attempts.filter(t=>t.accepted))assert.deepEqual(t.lost_goals,[]);
  assert.deepEqual(r.document.ir,ir);assert.deepEqual(r.prepared.quality.issues,[]);
 }
 assert.equal(draw('UncertifiedWeave').graph.architecture.semantic_contracts.length,0);
});

test('critical relationships outrank ordinary role count, while actual quality guards still reject a high benefit',()=>{
 assert.ok(A.compare({cost:1,score:[1,0,0]},{cost:1,score:[0,100,100]})<0);
 const ir=load('MixedWeave'),baseline=R.render(ir,{...state,paperAdaptive:false}),r=draw('MixedWeave');
 for(const mutation of [q=>q.line_geometry.unrelated_contacts.push({}),q=>q.native_width_px=30000,q=>q.route_failures.push({})]){
  const trial={...r,prepared:{...r.prepared,quality:structuredClone(r.prepared.quality)}};mutation(trial.prepared.quality);
  assert.equal(A.assess(ir,baseline,trial).accepted,false);
 }
});

test('model labels do not change initial projected priorities; measured geometry may change later choices',()=>{
 const ir=load('MixedWeave'),renamed=structuredClone(ir);renamed.title='Transformer';
 for(const n of renamed.nodes){n.label='Foreign';n.source_class='Unseen';}
 const r=R.render(renamed,state),original=draw('MixedWeave');
 const initial=figure=>{const unique=new Map();for(const p of figure.graph.publication.adaptive_frontier.preflights)if(!unique.has(p.candidate.id))unique.set(p.candidate.id,[p.estimated_benefit,p.reason]);return [...unique];};
 assert.deepEqual(initial(r),initial(original));
});

test('save and reopen reproduce measured selection and preserve the requested state rather than its trials',()=>{
 const ir=load('MixedWeave'),s={...state},before=JSON.stringify({ir,s}),r=R.render(ir,s);
 assert.equal(JSON.stringify({ir,s}),before);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 assert.equal(r.document.state.paperRoleDetails,undefined);assert.equal(r.document.state.paperExpressionDetails,undefined);
 assert.deepEqual(r.document.ir,ir);
});

test('manual, print and non-role projections do not run structure selection',()=>{
 const ir=load('SourceMosaic','summary-coverage');
 for(const extra of [{paperAuto:false,open:[ir.nodes[0].id]},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  const r=R.render(ir,{...state,...extra}),b=R.render(ir,{...state,...extra,paperAdaptive:false});
  assert.equal(r.svg,b.svg);assert.ok(!r.graph.publication.adaptive_frontier);
 }
});
