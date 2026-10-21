'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js');
const {fixture,state}=require('./measured-frontier-fixtures.cjs');
const load=(name,dir='coverage-selection')=>JSON.parse(fs.readFileSync(`verification/${dir}/current/${name}.json`));
const baseState={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
const account=(ir,r)=>{for(const [key,list]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),list.map(n=>n.id).sort());
}};
test('automatic selection measures the actual final routes even when no detail opportunity exists',()=>{
 const ir=fixture(),r=R.render(ir,state),a=r.document.publication.adaptive_frontier;
 assert.equal(a.attempts.length,0);assert.equal(r.prepared.quality.line_geometry.crossings,0);
 assert.ok(r.prepared.routing.context_source_refinement?.accepted||r.prepared.routing.region_follower_refinement?.accepted);
 assert.deepEqual(a.selected,A.metrics(r));assert.deepEqual(a.baseline,A.metrics(r));account(ir,r);
});
test('each assessed semantic candidate can be independently replayed with its final geometry',()=>{
 const ir=load('MixedWeave'),r=R.render(ir,baseState),a=r.document.publication.adaptive_frontier;
 assert.ok(a.attempts.some(t=>t.accepted)&&a.attempts.some(t=>!t.accepted));
 for(const t of a.attempts){
  const candidate=R.render(ir,{...baseState,...t.requested_state,paperAdaptive:false});
  assert.deepEqual(t.candidate,A.metrics(candidate));account(ir,candidate);
  if(t.eligible)assert.deepEqual(t.reasons.filter(x=>x!=='lower-measured-benefit'),[]);
 }
 assert.deepEqual(a.selected,A.metrics(r));
});
test('successive selected frontiers and evidence use the same final presentation',()=>{
 const ir=load('MixedWeave'),r=R.render(ir,baseState),a=r.document.publication.adaptive_frontier;
 let selected=R.render(ir,{...baseState,paperAdaptive:false}),round=-1,next=null;
 for(const t of a.attempts){
  if(t.comparison_round!==round){if(next)selected=next;next=null;round=t.comparison_round;}
  assert.deepEqual(t.before,A.metrics(selected));
  const candidate=R.render(ir,{...baseState,...t.requested_state,paperAdaptive:false});
  const actual=A.assess(ir,selected,candidate);
  for(const key of ['accepted','gain','gained_goals','gained_summary_goals','selection_benefit','lost_goals','lost_summary_goals','before','candidate'])
   assert.deepEqual(actual[key],key==='accepted'?t.eligible:t[key],key);
  if(t.accepted)next=candidate;
 }
});
test('unknown, guarded and shared inputs retain their boundaries while final metrics stay truthful',()=>{
 for(const name of ['InterruptedWeave','UncertifiedWeave']){
  const ir=load(name),before=R.render(ir,{...baseState,paperAdaptive:false}),r=R.render(ir,baseState);
  assert.deepEqual(r.document.publication.adaptive_frontier.selected,A.metrics(r));
  const a=A.evidence(ir,before),b=A.evidence(ir,r);
  assert.ok([...a.boundaries].every(id=>b.boundaries.has(id)));assert.deepEqual(r.document.ir,ir);account(ir,r);
 }
});
test('explicit geometric opt-outs are respected by both baseline and chosen candidate',()=>{
 for(const extra of [{paperRegionFollowers:false},{paperContextSourceFacing:false}]){
  const ir=fixture(),r=R.render(ir,{...state,...extra}),a=r.document.publication.adaptive_frontier;
  assert.deepEqual(a.selected,A.metrics(r));
  if(extra.paperRegionFollowers===false)assert.equal(r.prepared.routing.region_follower_refinement,undefined);
  if(extra.paperContextSourceFacing===false)assert.equal(r.prepared.routing.context_source_refinement,undefined);
 }
});
test('manual views, print and non-role presets do not acquire an automatic selection receipt',()=>{
 const ir=fixture();for(const extra of [{paperAuto:false},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  const a=R.render(ir,{...state,...extra}),b=R.render(ir,{...state,...extra,paperAdaptive:false});
  assert.equal(a.svg,b.svg);assert.equal(a.document.publication.adaptive_frontier,undefined);account(ir,a);
 }
});
test('save/reopen and label changes preserve raw facts and do not store trial geometry as user requests',()=>{
 const ir=fixture(),s={...state},original=JSON.stringify({ir,s}),r=R.render(ir,s);
 assert.equal(JSON.stringify({ir,s}),original);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 assert.equal(r.document.state.paperRolePaths,undefined);
 for(const n of ir.nodes)n.label='Other';ir.title='Unseen';
 const renamed=R.render(ir,s);assert.deepEqual(renamed.document.publication.adaptive_frontier.selected,A.metrics(renamed));account(ir,renamed);
});
