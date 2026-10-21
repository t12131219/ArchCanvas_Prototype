'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js'),A=require('../semantic_studio/adaptive-frontier.js');
const read=(name,dir)=>JSON.parse(fs.readFileSync(`verification/${dir}/${name}.json`));
const state={paperMedium:'canvas',paperGranularity:'roles'},cache=new Map();
const draw=(name,dir,extra={})=>{const key=JSON.stringify([name,dir,extra]);if(!cache.has(key)){
 const ir=read(name,dir),s={...state,...extra},main=R.render(ir,s),set=D.joint(ir,s,R,{main,maxPanels:3,maxTrials:4});cache.set(key,{ir,state:s,main,set});
}return cache.get(key);};
const fulfilled=rows=>rows.filter(r=>r.status==='fulfilled').map(r=>r.goal);

test('a summary and its inline or independent detail compete using actual canonical goal coverage',()=>{
 const {main,set}=draw('SourceMosaic','summary-coverage/current');
 assert.equal(main.graph.nodes.length,6);assert.equal(set.panels[0].result.graph.nodes.length,11);
 const a=set.attempts.filter(t=>t.comparison_round===0);assert.equal(a.length,2);
 assert.deepEqual(new Set(a.map(t=>t.form)),new Set(['inline','detail']));assert.ok(a.every(t=>t.eligible));
 assert.deepEqual(a[0].gained_goals,a[1].gained_goals);assert.equal(a.find(t=>t.accepted).form,'inline');
 assert.ok(a.find(t=>!t.accepted).reasons.includes('lower-measured-benefit'));
 assert.equal(set.main_unchanged,false);assert.ok(set.panels[0].result.graph.summary_coverage.some(r=>r.form==='operation-paths'&&r.status==='fulfilled'));
});
test('a bounded set can keep a compact main and express unfamiliar nested paths on actual detail figures',()=>{
 const {main,set}=draw('NestedWorkshop','detail-alternatives/experiment',{paperBudget:4});
 assert.equal(set.panels[0].result.svg,main.svg);assert.equal(set.panels.length,3);assert.equal(set.complete,true);
 assert.equal(fulfilled(set.coverage).length,28);assert.equal(fulfilled(set.baseline_coverage).length,4);
 assert.ok(set.preflights.some(t=>!t.eligible));assert.ok(set.attempts.some(t=>t.form==='detail'&&t.accepted));
});
test('the same measured plan may select both inline roles and an independent detail without losing earlier goals',()=>{
 const {ir,main,set}=draw('MixedWeave','coverage-selection/current');
 assert.ok(set.attempts.some(t=>t.accepted&&t.form==='inline'));assert.ok(set.attempts.some(t=>t.accepted&&t.form==='detail'));
 assert.ok(fulfilled(set.coverage).length>fulfilled(set.baseline_coverage).length);
 const before=A.evidence(ir,main),after=A.evidence(ir,set.panels[0].result);
 for(const key of ['roles','summaries','boundaries'])assert.ok([...before[key]].every(id=>after[key].has(id)));
 for(const t of set.attempts.filter(t=>t.accepted))assert.deepEqual(t.lost_goals,[]);
});
test('the original adaptive main choices are carried into inline alternatives',()=>{
 const {ir,main,set}=draw('MixedWeave','coverage-selection/current',{paperAdaptive:true,paperAdaptivePolicy:'structure'});
 const a=A.evidence(ir,main),b=A.evidence(ir,set.panels[0].result);
 for(const key of ['roles','summaries','boundaries'])assert.ok([...a[key]].every(id=>b[key].has(id)));
 assert.ok(fulfilled(set.baseline_coverage).every(id=>fulfilled(set.coverage).includes(id)));
});
test('wrong terminal operands cannot win coverage credit in either inline or independent form',()=>{
 const {ir,state:s,main}=draw('SourceMosaic','summary-coverage/current');
 const renderer={render:(ir,s)=>{const r=R.render(ir,s);return {...r,prepared:{...r.prepared,routes:r.prepared.routes.map(e=>({...e,target_port:'wrong',
  ...(e.bundle_members?{bundle_members:e.bundle_members.map(m=>({...m,target_port:'wrong'}))}:{})}))}};}};
 const set=D.joint(ir,s,renderer,{main,maxPanels:3,maxTrials:2});assert.equal(set.panels.length,1);
 assert.ok(set.attempts.every(t=>!t.accepted&&!t.gained_goals.length));
 assert.ok(set.attempts.find(t=>t.form==='inline').reasons.includes('previous-direct-goals-lost'));
 assert.deepEqual(set.coverage,set.baseline_coverage);
});
test('broken and conditional mixtures retain their unknown and protected boundaries',()=>{
 for(const name of ['BrokenWorkshop','ConditionalWorkshop']){
  const {ir,main,set}=draw(name,'detail-alternatives/experiment',{paperBudget:4}),a=A.evidence(ir,main),b=A.evidence(ir,set.panels[0].result);
  assert.ok([...a.boundaries].every(id=>b.boundaries.has(id)));
  assert.ok(set.panels.every(p=>p.result.document.ir===ir||JSON.stringify(p.result.document.ir)===JSON.stringify(ir)));
  const raw=new Map(ir.nodes.map(n=>[n.id,n]));
  for(const p of set.panels.slice(1)){
   let at=p.state.paperFocus;while(at){const n=raw.get(at);assert.ok(!n?.condition&&!n?.mutable&&n?.kind!=='opaque');at=n?.parent;}
  }
 }
});
test('trial and panel limits leave truthful deferred work and do not mutate the supplied main or requests',()=>{
 const {ir,state:s,main}=draw('NestedWorkshop','detail-alternatives/experiment',{paperBudget:4}),original=JSON.stringify({ir,s}),svg=main.svg;
 let calls=0;const renderer={render:(...args)=>{calls++;return R.render(...args);}};
 const zero=D.joint(ir,s,renderer,{main,maxTrials:0,maxPanels:1});assert.equal(calls,0);assert.equal(zero.panels.length,1);assert.ok(zero.deferred_goals.length);
 const limited=D.joint(ir,s,renderer,{main,maxTrials:2,maxPanels:2});assert.ok(calls<=2);assert.ok(limited.panels.length<=2);assert.ok(limited.deferred_goals.length);
 assert.equal(JSON.stringify({ir,s}),original);assert.equal(main.svg,svg);
});
test('selected figures save and reopen with exact cuts and all canonical objects retained',()=>{
 for(const sample of [draw('SourceMosaic','summary-coverage/current'),draw('MixedWeave','coverage-selection/current')])for(const p of sample.set.panels){
  const r=p.result;assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
  for(const [key,objects]of [['node_accounting',sample.ir.nodes],['edge_accounting',sample.ir.edges]]){
   const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),objects.map(o=>o.id).sort());
  }
  for(const cut of r.graph.publication.boundary){const e=sample.ir.edges.find(e=>e.id===cut.id);for(const key of ['source','target','source_port','target_port','condition','kind','evidence'])assert.deepEqual(cut[key],e[key]);}
 }
});
test('joint CLI export includes the selected main, actual details and truthful main change metadata',()=>{
 const {ir,state:s,main,set}=draw('SourceMosaic','summary-coverage/current'),out=fs.mkdtempSync(path.join(os.tmpdir(),'joint-expressions-'));
 const {manifest}=require('../tools/export_diagram_set.cjs').exportSet(ir,out,{state:s,main,maxPanels:3,maxTrials:4,policy:'joint'});
 assert.equal(manifest.policy,'joint');assert.equal(manifest.main_unchanged,false);assert.deepEqual(manifest.coverage,set.coverage);
 assert.equal(fs.readFileSync(path.join(out,manifest.panels[0].svg),'utf8'),set.panels[0].result.svg);
});

function frozenLocal(){
 const ir=read('NestedWorkshop','detail-alternatives/experiment'),s={...state,paperAdaptive:false,paperBudget:4},base=R.render(ir,s);
 const manual={...s,paperAuto:false,open:base.graph.publication.open},main=R.render(ir,manual);
 const scope=D.plan(ir,main,manual).candidates.find(c=>c.kind==='computation-paths').state.paperFocus;
 const localState={...s,paperFocus:scope,paperAuto:false,open:[scope]},local=R.render(ir,localState);
 return {ir,state:manual,main,initialPanels:[{id:'main',state:manual,result:main},
   {id:'local',anchor:scope,label:'Exact local scope',state:localState,result:local,refinable:true}]};
}
test('an automatic local figure can refine in place when the panel budget is full',()=>{
 const x=frozenLocal(),before=JSON.stringify({ir:x.ir,state:x.state,states:x.initialPanels.map(p=>p.state)});
 const set=D.joint(x.ir,x.state,R,{main:x.main,initialPanels:x.initialPanels,maxPanels:2,maxTrials:2});
 assert.equal(set.panels.length,2);assert.equal(set.panels[0].result.svg,x.main.svg);
 assert.ok(set.attempts.some(t=>t.accepted&&t.target_panel==='local'&&t.form==='inline'));
 assert.ok(fulfilled(set.coverage).length>fulfilled(set.baseline_coverage).length);
 assert.ok(fulfilled(set.baseline_coverage).every(id=>fulfilled(set.coverage).includes(id)));
 const local=set.panels[1],original=x.initialPanels[1];
 for(const key of ['id','anchor','label'])assert.equal(local[key],original[key]);
 assert.equal(local.result.graph.publication.focus,original.result.graph.publication.focus);
 assert.deepEqual(local.result.graph.publication.boundary,original.result.graph.publication.boundary);
 assert.equal(local.state.paperAuto,false);assert.ok(original.state.open.every(id=>local.state.open.includes(id)));
 assert.equal(R.render(x.ir,local.state).svg,local.result.svg);
 assert.equal(JSON.stringify({ir:x.ir,state:x.state,states:x.initialPanels.map(p=>p.state)}),before);
});
test('refining an existing figure still requires exact operands and cannot replace it with a bad route',()=>{
 const x=frozenLocal(),renderer={render:(ir,s)=>{const r=R.render(ir,s);return {...r,prepared:{...r.prepared,
  routes:r.prepared.routes.map(e=>({...e,target_port:'wrong',...(e.bundle_members?{bundle_members:e.bundle_members.map(m=>({...m,target_port:'wrong'}))}:{})}))}};}};
 const set=D.joint(x.ir,x.state,renderer,{main:x.main,initialPanels:x.initialPanels,maxPanels:2,maxTrials:2});
 assert.ok(set.attempts.length);assert.ok(set.attempts.every(t=>!t.accepted));
 assert.ok(set.attempts.some(t=>t.reasons.includes('previous-direct-goals-lost')));
 assert.equal(set.panels[1].result.svg,x.initialPanels[1].result.svg);assert.deepEqual(set.coverage,set.baseline_coverage);
});
test('explicit local figures are not automatically refined without planner ownership',()=>{
 const x=frozenLocal();delete x.initialPanels[1].refinable;let renders=0;
 const set=D.joint(x.ir,x.state,{render:()=>{renders++;throw Error('manual figure must remain fixed');}},
  {main:x.main,initialPanels:x.initialPanels,maxPanels:2,maxTrials:4});
 assert.equal(renders,0);assert.equal(set.attempts.length,0);assert.equal(set.panels[1].result.svg,x.initialPanels[1].result.svg);
});
test('a frozen automatic detail tries the complete nested role layer before equal-priority partial paths',()=>{
 const ir=read('SameSource','semantic-design/current/after'),s={...state,paperAdaptive:false},base=R.render(ir,s);
 const manual={...s,paperAuto:false,open:base.graph.publication.open},main=R.render(ir,manual);
 const owner=base.graph.nodes.find(n=>n.contract_roles?.attention).id,localState={...s,paperFocus:owner,paperAuto:false,open:[owner]},local=R.render(ir,localState);
 const set=D.joint(ir,manual,R,{main,initialPanels:[{id:'main',state:manual,result:main},
  {id:'local',anchor:owner,state:localState,result:local,refinable:true}],maxPanels:2,maxTrials:1});
 assert.equal(set.rendered_trials,1);assert.equal(set.attempts.length,1);
 const t=set.attempts[0];assert.equal(t.target_panel,'local');assert.ok(t.request.includes(':roles:'));assert.ok(t.accepted);
 assert.ok(fulfilled(set.coverage).length>fulfilled(set.baseline_coverage).length);
 const selected=set.panels[1];assert.equal(selected.state.paperAuto,false);assert.ok(selected.state.open.length>localState.open.length);
 assert.ok(selected.result.graph.publication.role_frontier.detail_requests.some(r=>r.status==='expanded'));
 assert.equal(set.panels[0].result.svg,main.svg);assert.equal(selected.result.graph.publication.focus,owner);
});
