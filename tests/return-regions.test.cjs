'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/presentation-regions.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={view:'publication',paperMedium:'canvas',paperGranularity:'roles'};
const load=name=>JSON.parse(fs.readFileSync('verification/return-regions/current/'+name+'.json'));
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'x',kind:'interface',parent:'root'},
  {id:'control',kind:'control',operator:'if',label:'report',parent:'root'},
  ...['yes','no'].map((id,i)=>({id,kind:'composite',parent:'root',condition:{branch:'control',outcome:i?'false':'true'}})),
  {id:'tuple',kind:'compute',operator:'tuple',parent:'yes'},
  {id:'trueReturn',kind:'interface',role:'output',parent:'yes'},
  {id:'fallthrough',kind:'interface',role:'output',parent:'root'},
  {id:'aggregate',kind:'interface',role:'output',parent:'root'},
  {id:'output',kind:'interface',role:'output',parent:'root'}];
 const edge=(id,source,target,kind='data',source_port='out',target_port='in')=>({id,source,target,kind,source_port,target_port});
 const edges=[edge('predicate','x','control','control'),edge('yesControl','control','yes','control','out','true'),edge('noControl','control','no','control','out','false'),
  edge('tupleValue','x','tuple'),edge('tupleReturn','tuple','trueReturn'),edge('fallthroughValue','x','fallthrough'),
  edge('trueBinding','trueReturn','aggregate','interface-binding','out','0'),edge('fallthroughBinding','fallthrough','aggregate','interface-binding','out','1'),edge('use','aggregate','output','alias')];
 const members=['control','yes','no','tuple','trueReturn'],set=new Set(members),cuts=edges.filter(e=>set.has(e.source)!==set.has(e.target));
 const selection={id:'group',kind:'conditional-collection',members:['control','yes','no'],canonical_members:members};
 const group={id:'group',kind:'composite',parent:'root',presentation_only:true,semantic_type:'conditional-collection',canonical_members:members,boundary_selection:selection,boundary_ports:cuts};
 const plan={nodes:[...nodes.map(n=>({...n,parent:['control','yes','no'].includes(n.id)?'group':n.parent})),group],
  findings:[{id:'group',members:selection.members,label:'Conditional alternatives',roles:{units:selection.members,boundary_selection:selection},proof:[]}],
  publication:{boundary_plans:[{proposals:[selection]}]},relation_graph:{relations:[]}};
 return {ir:{nodes,edges},plan};
}
function account(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}

test('local source returns join their existing condition with exact slots, source ancestry and recomputed cuts',()=>{
 const f=fixture(),before=JSON.stringify(f),r=F.returns(f),row=r.rows[0],group=r.plan.nodes.find(n=>n.id==='group');
 assert.equal(r.rows.length,1);assert.equal(JSON.stringify(f),before);
 assert.deepEqual(row.added_members,['fallthrough','aggregate']);
 assert.deepEqual(new Set(row.canonical_members),new Set([...f.plan.nodes.at(-1).canonical_members,'fallthrough','aggregate']));
 assert.deepEqual(row.return_sites,[{node:'trueReturn',edge:'trueBinding',source_port:'out',aggregate_slot:'0',source_conditions:[{branch:'control',outcome:'true'}]},
  {node:'fallthrough',edge:'fallthroughBinding',source_port:'out',aggregate_slot:'1',source_conditions:[]}]);
 const all=new Set(row.canonical_members),cuts=f.ir.edges.filter(e=>all.has(e.source)!==all.has(e.target));
 assert.deepEqual(row.cuts,cuts);assert.deepEqual(group.boundary_ports,cuts);assert.deepEqual(group.boundary_selection.boundary_edges,cuts.map(e=>e.id));
 assert.deepEqual(group.boundary_selection.output_edges,['use']);assert.equal(r.plan.nodes.find(n=>n.id==='aggregate').parent,'group');
 assert.equal(r.plan.nodes.find(n=>n.id==='output').parent,'root');assert.equal(group.semantic_contracts,undefined);
 assert.deepEqual(r.plan.publication.boundary_plans[0].proposals[0],group.boundary_selection);
 assert.deepEqual(r.plan.findings[0].roles.boundary_selection,group.boundary_selection);
 assert.deepEqual(r.plan.findings[0].members,group.boundary_selection.members);
});

test('raw or planned effects, identities, contracts and runtime-only boundaries veto return grouping',()=>{
 for(const location of ['ir','plan'])for(const id of ['control','tuple','trueReturn','fallthrough','aggregate'])for(const guard of [
  {kind:'opaque'},{kind:'state'},{mutable:true},{identity_display:{}},{observed_calls:{}},{runtime_evidence:[{}]},
  {evidence_status:'runtime-only'},{repeat_contract:{}},{iteration:{}},{semantic_contracts:['certificate']},{contract_roles:{}}]){
  const f=fixture();Object.assign(f[location].nodes.find(n=>n.id===id),guard);
  assert.equal(F.returns(f).rows.length,0,location+' '+id+' '+JSON.stringify(guard));
 }
});

test('ambiguous output bindings, other source scopes, escaping uses and external terminals keep their boundary',()=>{
 const mutations=[
  f=>f.ir.edges.find(e=>e.id==='fallthroughBinding').target_port='0',
  f=>f.ir.edges.find(e=>e.id==='fallthroughBinding').kind='data',
  f=>f.ir.edges.find(e=>e.id==='fallthroughBinding').condition={branch:'control',outcome:'false'},
  f=>f.ir.edges.find(e=>e.id==='fallthroughValue').kind='state-read',
  f=>f.ir.edges.find(e=>e.id==='predicate').iteration={loop:'outer'},
  f=>f.ir.edges.find(e=>e.id==='predicate').condition={branch:'other',outcome:'true'},
  f=>f.ir.edges.push({id:'extraUse',source:'trueReturn',target:'output',kind:'data'}),
  f=>f.ir.edges.push({id:'extraExit',source:'tuple',target:'output',kind:'data'}),
  f=>f.ir.edges.push({id:'extraInput',source:'x',target:'fallthrough',kind:'data'}),
  f=>f.ir.edges.splice(f.ir.edges.findIndex(e=>e.id==='use'),1),
  f=>f.ir.nodes.find(n=>n.id==='aggregate').parent='foreign',
  f=>f.ir.nodes.find(n=>n.id==='fallthrough').parent='foreign',
  f=>f.plan.nodes.find(n=>n.id==='aggregate').parent='foreign',
  f=>f.plan.nodes.find(n=>n.id==='fallthrough').parent='foreign',
  f=>f.ir.nodes.find(n=>n.id==='aggregate').role='input',
  f=>f.ir.nodes.find(n=>n.id==='fallthrough').kind='compute',
  f=>f.ir.nodes.find(n=>n.id==='aggregate').condition={branch:'other',outcome:'true'},
  f=>f.ir.nodes.find(n=>n.id==='fallthrough').condition={branch:'other',outcome:'true'},
  f=>f.plan.nodes.at(-1).canonical_members.push('x')];
 for(const [i,mutate]of mutations.entries()){const f=fixture();mutate(f);assert.equal(F.returns(f).rows.length,0,'mutation '+i);}
});

test('model names, case metadata and predicate wording do not select return grouping',()=>{
 const f=fixture(),a=F.returns(f);for(const where of [f.ir,f.plan])for(const n of where.nodes){n.source_class='UnseenCircuit';n.case='not-transformer';n.label='foreign label';}
 const b=F.returns(f);for(const r of [a,b])for(const row of r.rows)delete row.predicate;
 assert.deepEqual(b.rows,a.rows);
});

test('real if/else and fallthrough sources preserve canonical facts and the previously allocated open set',()=>{
 for(const name of ['ReturnAlternatives','PairedReturns','UnknownReturns','StatefulReturns','ComparedReturns'])for(const paperBudget of [12,28]){
  const ir=load(name),before=JSON.stringify(ir),a=E.project(ir,{...state,paperBudget}),b=E.project(ir,{...state,paperBudget,paperReturnRegions:false});
  assert.equal(JSON.stringify(ir),before);assert.deepEqual(a.publication.open,b.publication.open);account(ir,a);
  assert.equal(a.publication.return_regions.rows.length,['UnknownReturns','StatefulReturns'].includes(name)?0:1,name);
  if(name==='ComparedReturns'){
   const predicate=a.publication.condition_predicates.rows[0],ret=a.publication.return_regions.rows[0];assert.ok(predicate&&ret);
   assert.deepEqual(new Set(predicate.canonical_members),new Set(ret.canonical_members));assert.deepEqual(predicate.cuts,ret.cuts);
  }
 }
});

test('fold, open, save and refold restore return points without falsely fulfilling hidden detail',()=>{
 for(const name of ['ReturnAlternatives','PairedReturns','ComparedReturns']){
  const ir=load(name),g=E.project(ir,state),row=g.publication.return_regions.rows[0],open=g.publication.open.filter(id=>id!==row.group);
  const closed=R.render(ir,{...state,paperAuto:false,open}),expanded=R.render(ir,{...state,paperAuto:false,open:[...new Set([...open,row.group,...row.canonical_members])]});
  assert.equal(closed.graph.publication.return_regions.rows[0].status,'summary');
  assert.ok(closed.svg.includes('Return alternatives'));assert.ok(closed.svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').includes('source returns'));
  for(const id of [row.aggregate,...row.return_sites.map(r=>r.node)]){
   assert.ok(!closed.graph.positions.has(id));assert.ok(expanded.graph.positions.has(id),name+' '+id);
   assert.ok(!closed.graph.expression_coverage.some(c=>c.goal==='goal:node:'+id&&c.status==='fulfilled'));
  }
  for(const r of [closed,expanded]){account(ir,r.graph);assert.deepEqual(r.document.ir,ir);assert.deepEqual(r.prepared.quality.issues,[]);}
  assert.equal(R.render(closed.document.ir,closed.document.state).svg,closed.svg);
  const saved=JSON.parse(JSON.stringify(expanded.document));assert.equal(R.render(saved.ir,{...saved.state,open}).svg,closed.svg);
 }
});

test('print, other granularities and explicit opt-out retain their legacy boundaries',()=>{
 const ir=load('ReturnAlternatives');for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperReturnRegions:false}]){
  assert.equal(E.project(ir,{...state,...extra}).publication.return_regions,undefined);
 }
});
