'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('../semantic_studio/diagram-set.js'),R=require('../semantic_studio/publication-renderer.js');
const folder='verification/detail-alternatives/experiment/',base={paperMedium:'canvas',paperGranularity:'roles'};
const read=(name,dir=folder)=>JSON.parse(fs.readFileSync(dir+name+'.json'));
const cases=new Map();
function workshop(name){if(!cases.has(name)){const ir=read(name),state={...base,paperAuto:false,open:[ir.nodes.find(n=>!n.parent).id],paperCanvasLimits:{height_px:1100}},main=R.render(ir,state);
 cases.set(name,{ir,state,main,set:D.render(ir,state,R,{maxPanels:5,maxTrials:8,main})});}return cases.get(name);}

test('a rejected whole-module detail does not suppress exact known and unknown local alternatives',()=>{
 const {ir,main,set}=workshop('NestedWorkshop');assert.equal(set.panels[0].result,main);assert.ok(set.attempts.some(a=>!a.accepted&&a.request.startsWith('focus:')));
 assert.ok(set.panels.some(p=>p.id.includes('selection:')));assert.ok(set.panels.some(p=>p.id.includes('unknown-boundary:')));assert.ok(set.panels.some(p=>p.id.includes('gated-product:')));
 const direct=D.coverage(ir,set.plan,[set.panels[0]]).filter(c=>c.status==='fulfilled').length;
 assert.ok(set.coverage.filter(c=>c.status==='fulfilled').length>direct);assert.ok(set.deferred_goals.length);assert.equal(set.complete,false);
 for(const p of set.panels.slice(1)){const request=set.plan.candidates.find(c=>c.id===p.id);assert.ok(main.graph.positions.has(request.anchor));assert.ok(request.alternative_for.length);assert.ok(D.acceptable(p.result));}
});

test('a nested original helper remains available after its enclosing detail only partially fulfills goals',()=>{
 const ir=read('RefactoredCurve','verification/serial-paths/experiment/'),state={...base,paperCanvasLimits:{height_px:900}},main=R.render(ir,state),set=D.render(ir,state,R,{maxPanels:4,maxTrials:8,main});
 const nested=set.plan.candidates.find(c=>c.kind==='computation-paths'&&c.endpoint);assert.ok(nested);assert.ok(!main.graph.positions.has(nested.endpoint));assert.ok(main.graph.positions.has(nested.anchor));
 assert.ok(set.panels.some(p=>p.id===nested.id));assert.equal(set.complete,true);assert.equal(set.coverage.length,18);
 assert.equal(set.panels[0].result.svg,main.svg);
});

test('single-operation alternatives preserve exact input/result bindings when a whole serial detail exceeds its budget',()=>{
 const ir=read('LongCurve','verification/serial-paths/experiment/'),state={...base,paperCanvasLimits:{height_px:600}},main=R.render(ir,state),set=D.render(ir,state,R,{maxPanels:3,maxTrials:5,main});
 assert.ok(set.attempts.some(a=>!a.accepted));const detail=set.panels.find(p=>p.id.startsWith('operation:'));assert.ok(detail);
 const request=set.plan.candidates.find(c=>c.id===detail.id),goal=set.plan.goals.find(g=>g.id===request.goals[0]);assert.ok(detail.result.graph.positions.has(goal.focus_node));
 assert.equal(D.coverage(ir,{goals:[goal]},[detail])[0].status,'fulfilled');
 const bad={...detail,result:{...detail.result,prepared:{...detail.result.prepared,routes:detail.result.prepared.routes.map(e=>({...e,target_port:'wrong'}))}}};
 assert.equal(D.coverage(ir,{goals:[goal]},[bad])[0].status,'deferred');
 assert.ok(set.deferred_goals.length);assert.ok(set.attempts.length<=5);
});

test('breaking a gate preserves independently proved selection/reuse and exposes the new unknown boundary',()=>{
 const a=workshop('NestedWorkshop'),b=workshop('BrokenWorkshop');
 assert.ok(a.set.plan.candidates.some(c=>c.label.includes('gated product')));assert.ok(!b.set.plan.candidates.some(c=>c.label.includes('gated product')));
 for(const c of [a,b]){assert.ok(c.set.panels.some(p=>p.id.includes('selection:')));assert.ok(c.set.plan.candidates.some(p=>p.id.includes('source-uses:')));}
 const missing=b.ir.nodes.find(n=>n.function_target==='unfinished_weight'||n.label==='unfinished_weight');assert.ok(missing);
 assert.ok(b.set.panels.some(p=>p.result.graph.nodes.some(n=>n.id===missing.id&&n.kind==='opaque')));
});

test('local alternatives cannot open through mutable, runtime, identity, repeat or unknown ancestors',()=>{
 const {main,state}=workshop('NestedWorkshop'),owner=main.graph.nodes.find(n=>n.kind==='composite'&&!main.graph.positions.get(n.id).expanded);assert.ok(owner);
 for(const change of [{mutable:true},{kind:'opaque'},{observed_calls:{}},{evidence_status:'runtime-only'},{runtime_evidence:[{}]},
  {identity_display:{reference:'same'}},{repeat_contract:{}},{iteration:{}},{condition:{branch:'test'}}]){
  const graph={...main.graph,nodes:main.graph.nodes.map(n=>n.id===owner.id?{...n,...change}:n)};
  const plan=D.plan(workshop('NestedWorkshop').ir,{graph},state);
  assert.ok(!plan.candidates.some(c=>c.alternative_for&&c.anchor===owner.id),JSON.stringify(change));
 }
});

test('conditional interiors keep their protected ownership instead of becoming unconditional local details',()=>{
 const {ir,main,set}=workshop('ConditionalWorkshop'),by=new Map(main.graph.architecture.nodes.map(n=>[n.id,n]));
 const guarded=id=>{while(id){const n=by.get(id);if(n?.condition||n?.kind==='control')return true;id=n?.parent;}return false;};
 for(const c of set.plan.candidates.filter(c=>c.alternative_for))assert.equal(guarded(c.endpoint),false);
 const branchNodes=ir.nodes.filter(n=>guarded(n.id));assert.ok(branchNodes.length);
 assert.ok(set.deferred_goals.some(id=>set.plan.goals.find(g=>g.id===id)?.core.some(n=>branchNodes.some(b=>b.id===n))));
});

test('local and nested detail documents restore exact SVGs, cuts and every original object without changing IR',()=>{
 const {ir,set}=workshop('NestedWorkshop'),original=JSON.stringify(ir);
 for(const p of set.panels){const r=p.result;assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
  for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
  for(const cut of r.graph.publication.boundary){const e=ir.edges.find(e=>e.id===cut.id);assert.ok(e);for(const key of ['source','target','source_port','target_port','kind','evidence','condition'])assert.deepEqual(cut[key],e[key]);}
 }assert.equal(JSON.stringify(ir),original);
});

test('new requests are driven by structure and focus, not labels or model names',()=>{
 const {ir,state,main}=workshop('NestedWorkshop'),renamed=structuredClone(ir);renamed.title='Transformer';for(const n of renamed.nodes){n.label='Unseen';n.source_class='Foreign';}
 const fields=p=>p.candidates.map(({id,kind,state,goals,anchor,endpoint,alternative_for})=>({id,kind,state,goals,anchor,endpoint,alternative_for}));
 assert.deepEqual(fields(D.plan(ir,main,state)),fields(D.plan(renamed,R.render(renamed,state),state)));
 const helper=ir.nodes.find(n=>n.label==='long_path'&&n.kind==='composite'),focusedState={...base,paperFocus:helper.id,paperAuto:false,open:[]},focused=R.render(ir,focusedState),plan=D.plan(ir,focused,focusedState);
 for(const c of plan.candidates.filter(c=>c.alternative_for))assert.ok(c.endpoint.startsWith(helper.id+'/')||c.endpoint===helper.id);
});

test('display reparenting cannot erase an original protected ancestor when planning hidden detail',()=>{
 const {ir,main,state}=workshop('NestedWorkshop'),owner=main.graph.nodes.find(n=>n.kind==='composite'&&!main.graph.positions.get(n.id).expanded);
 for(const change of [{repeat_contract:{}},{iteration:{}},{condition:{branch:'source-only'}},{mutable:true},{evidence_status:'runtime-only'}]){
  const changed=structuredClone(ir);Object.assign(changed.nodes.find(n=>n.id===owner.id),change);
  const planned=D.plan(changed,main,state);assert.ok(!planned.candidates.some(c=>c.alternative_for&&c.anchor===owner.id),JSON.stringify(change));
 }
});

test('a hidden source frame does not take away the independent request for an already visible local relationship',()=>{
 const {ir,main,state}=workshop('NestedWorkshop'),relation=main.graph.architecture.relation_graph.relations.find(r=>r.type==='arithmetic'),
  node=main.graph.architecture.nodes.find(n=>n.id===relation.node),owner=main.graph.nodes.find(n=>n.kind==='composite'&&!main.graph.positions.get(n.id).expanded);
 const positions=new Map(main.graph.positions);positions.delete(owner.id);positions.set(node.id,{expanded:false});
 const graph={...main.graph,positions,nodes:[...main.graph.nodes.filter(n=>n.id!==owner.id),node]};
 const planned=D.plan(ir,{graph},state),request=planned.candidates.find(c=>c.state.paperRelation===relation.id);
 assert.ok(request);assert.equal(request.anchor,node.id);assert.equal(request.alternative_for,undefined);
 assert.ok(planned.candidates.some(c=>c.endpoint===owner.id&&c.alternative_for));
});
