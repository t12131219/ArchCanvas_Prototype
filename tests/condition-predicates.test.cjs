'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const F=require('../semantic_studio/presentation-regions.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'};
const load=name=>JSON.parse(fs.readFileSync('verification/condition-predicates/current/'+name+'.json'));
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'x',kind:'interface',parent:'root'},
  {id:'test',kind:'compute',operator:'compare',parent:'root'},{id:'control',kind:'control',operator:'if',label:'x is not None',parent:'root'},
  {id:'yes',kind:'composite',semantic_type:'conditional-region',condition:{branch:'control',outcome:'true'},parent:'root'},
  {id:'no',kind:'composite',semantic_type:'conditional-region',condition:{branch:'control',outcome:'false'},parent:'root'}];
 const edges=[{id:'input',source:'x',target:'test',kind:'data',source_port:'out',target_port:'0'},
  {id:'decision',source:'test',target:'control',kind:'control',source_port:'out',target_port:'in'},
  ...['yes','no'].map((id,i)=>({id:'branch'+i,source:'control',target:id,kind:'control',source_port:'out',target_port:i?'false':'true'}))];
 const ir={nodes,edges},members=['control','yes','no'],inside=new Set(members),cuts=edges.filter(e=>inside.has(e.source)!==inside.has(e.target));
 const group={id:'group',kind:'composite',parent:'root',presentation_only:true,semantic_type:'conditional-collection',canonical_members:members,
  boundary_selection:{id:'group',kind:'conditional-collection',members,canonical_members:members},boundary_ports:cuts};
 const plan={nodes:[...nodes.map(n=>({...n,parent:members.includes(n.id)?'group':n.parent})),group],findings:[],relation_graph:{relations:[]}};
 return {ir,plan};
}
function account(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}

test('an exclusive direct comparison joins its conditional boundary with exact source cuts and no IR mutation',()=>{
 const f=fixture(),before=JSON.stringify(f),r=F.predicates(f),row=r.rows[0],group=r.plan.nodes.find(n=>n.id==='group');
 assert.equal(r.rows.length,1);assert.equal(r.plan.nodes.find(n=>n.id==='test').parent,'group');
 assert.deepEqual(row.canonical_members,['test','control','yes','no']);assert.deepEqual(row.cuts,[f.ir.edges[0]]);
 assert.equal(group.label,'If x is not None');assert.equal(group.boundary_selection.predicate.edge,'decision');
 assert.deepEqual(group.boundary_selection.input_edges,['input']);assert.deepEqual(group.boundary_selection.output_edges,[]);
 assert.equal(JSON.stringify(f),before);assert.equal(group.semantic_contracts,undefined);
});

test('the inspector finding and selection receipt describe the same expanded boundary without mutating the prior finding',()=>{
 const f=fixture(),group=f.plan.nodes.find(n=>n.id==='group'),members=group.boundary_selection.members;
 f.plan.findings=[{id:'group',label:'Conditional alternatives',members,roles:{units:members,boundary_selection:group.boundary_selection},proof:['Source boundary.']}];
 f.plan.publication={boundary_plans:[{proposals:[group.boundary_selection]}]};
 const before=JSON.stringify(f),r=F.predicates(f),finding=r.plan.findings[0],selection=r.plan.nodes.find(n=>n.id==='group').boundary_selection;
 assert.equal(finding.label,'If x is not None');assert.deepEqual(finding.members,selection.members);
 assert.deepEqual(finding.roles.units,selection.members);assert.deepEqual(finding.roles.boundary_selection,selection);
 assert.deepEqual(r.plan.publication.boundary_plans[0].proposals[0],selection);assert.equal(JSON.stringify(f),before);
});

test('reused predicates, alias chains, conditional/effect edges and other scopes retain the original boundary',()=>{
 for(const mutate of [f=>f.ir.edges.push({id:'escape',source:'test',target:'x',kind:'data'}),
  f=>f.ir.edges[1].condition={branch:'outer',outcome:'true'},f=>f.ir.edges[0].kind='state-read',
  f=>f.plan.nodes.find(n=>n.id==='test').parent='other',f=>f.plan.nodes.find(n=>n.id==='test').operator='foreign',
  f=>f.plan.nodes.find(n=>n.id==='test').kind='value-alias',f=>f.ir.edges.splice(1,1),
  f=>f.ir.edges[0].source='yes']){
  const f=fixture();mutate(f);assert.equal(F.predicates(f).rows.length,0);
 }
});

test('unknown, state, runtime and identity boundaries cannot be hidden by adding a comparison',()=>{
 for(const target of ['test','control','yes'])for(const guard of [{kind:'opaque'},{mutable:true},{identity_display:{}},
  {observed_calls:{}},{runtime_evidence:[{}]},{evidence_status:'runtime-only'}]){
  const f=fixture();Object.assign(f.plan.nodes.find(n=>n.id===target),guard);Object.assign(f.ir.nodes.find(n=>n.id===target),guard);
  assert.equal(F.predicates(f).rows.length,0,target+JSON.stringify(guard));
 }
});

test('grouping follows local source facts after model renaming and does not select by condition text',()=>{
 const f=fixture(),a=F.predicates(f);for(const n of f.plan.nodes){n.source_class='Transformer';n.label='Foreign condition';}
 const b=F.predicates(f);assert.deepEqual(b.rows.map(r=>[r.group,r.node,r.control,r.canonical_members,r.cuts]),a.rows.map(r=>[r.group,r.node,r.control,r.canonical_members,r.cuts]));
 assert.equal(b.rows[0].label,'Foreign condition');
});

test('late predicate lowering preserves the allocated open set and independent detail on real source compositions',()=>{
 for(const name of ['ConditionalSplice','EscapingDecision','UnknownDecision'])for(const paperBudget of [4,12,20,28]){
  const ir=load(name),a=E.project(ir,{...state,view:'publication',paperBudget}),b=E.project(ir,{...state,view:'publication',paperBudget,paperConditionPredicates:false});
  assert.deepEqual(a.publication.open,b.publication.open,name+' budget '+paperBudget);account(ir,a);
  const hidden=new Set(a.publication.condition_predicates.rows.map(r=>r.node));
  for(const n of b.nodes)if(!hidden.has(n.id))assert.ok(a.nodes.some(m=>m.id===n.id),'independent node '+n.id);
  if(name!=='ConditionalSplice')assert.equal(a.publication.condition_predicates.rows.length,0);
 }
});

test('a folded condition prints its actual predicate and restores the exact control and comparison when opened',()=>{
 const ir=load('ConditionalSplice'),g=E.project(ir,{...state,view:'publication'}),row=g.publication.condition_predicates.rows[0];assert.ok(row);
 const open=g.publication.open.filter(id=>id!==row.group),r=R.render(ir,{...state,paperAuto:false,open});
 assert.equal(r.graph.publication.condition_predicates.rows.find(t=>t.group===row.group).status,'summary');
 assert.equal(r.graph.nodes.find(n=>n.id===row.group).paper.title,'If '+row.label);assert.ok(!r.graph.positions.has(row.node));
 assert.ok(!r.graph.expression_coverage.some(c=>c.goal==='goal:node:'+row.node&&c.status==='fulfilled'));
 const expanded=R.render(ir,{...state,paperAuto:false,open:[...open,row.group]});
 assert.ok(expanded.graph.positions.has(row.node)&&expanded.graph.positions.has(row.control));account(ir,r.graph);account(ir,expanded.graph);
 assert.deepEqual(r.document.ir,ir);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.deepEqual(expanded.prepared.quality.issues,[]);
});

test('print, other granularities and explicit opt-out keep the legacy projection',()=>{
 const ir=load('ConditionalSplice');
 for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperConditionPredicates:false}]){
  const a=E.project(ir,{...state,...extra,view:'publication'});assert.equal(a.publication.condition_predicates,undefined);
 }
});
