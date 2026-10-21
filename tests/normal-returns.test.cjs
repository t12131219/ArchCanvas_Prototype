'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),F=require('../semantic_studio/presentation-regions.js'),I=require('../semantic_studio/invocation-inputs.js'),R=require('../semantic_studio/publication-renderer.js');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles'},copy=x=>JSON.parse(JSON.stringify(x));
const load=name=>JSON.parse(fs.readFileSync('verification/normal-returns/current/'+name+'.json'));
function fixture(name='FixedReturn'){
 const ir=load(name),g=E.project(ir,{...state,paperNormalReturns:false}),region=g.publication.return_regions.rows[0];
 const open=g.publication.open.filter(id=>id!==region.group),plan=g.architecture;
 return {ir,plan,open:new Set(open),inputs:I.compile(ir),region,state:{...state,paperAuto:false,open}};
}
function account(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
const uses=g=>g.edges.flatMap(e=>e.bundle_members||[e]);

test('a closed fixed invocation keeps its selected data cut and predicate while attaching exact alternative uses',()=>{
 for(const name of ['FixedReturn','DefaultReturn','FixedTuple','FixedPair']){
  const f=fixture(name),before=JSON.stringify(f.ir),a=E.project(f.ir,{...f.state,paperNormalReturns:false}),g=E.project(f.ir,f.state),row=g.publication.normal_returns.rows[0];
  assert.equal(row.status,'summary');assert.equal(JSON.stringify(f.ir),before);account(f.ir,g);
  assert.deepEqual(g.nodes.map(n=>n.id),a.nodes.map(n=>n.id));assert.deepEqual(g.publication.open,a.publication.open);
  assert.equal(uses(g).length,uses(a).length-row.alternative_inputs.length);
  for(const edge of row.alternative_inputs){assert.ok(g.edge_accounting.attached.includes(edge.id));assert.deepEqual(g.annotations.get(row.group).find(n=>n.edge.id===edge.id).edge,edge);}
  for(const edge of [...row.selected_inputs,row.predicate.edge])assert.ok(uses(g).some(e=>e.id===edge.id),edge.id);
  for(const e of uses(g))for(const k of ['canonical_source','canonical_target','resolved_source','source_port','target_port','condition','originals'])assert.deepEqual(e[k],uses(a).find(x=>x.id===e.id)[k]);
  // The selected return's position in the aggregate is NOT its tuple operand slot.
  assert.equal(row.selected_return.aggregate_slot,name==='FixedTuple'?'0':'1');
  assert.equal(row.selected_inputs.length,['FixedTuple','FixedPair'].includes(name)?2:1);
  if(name==='FixedPair')assert.deepEqual(row.selected_inputs.map(e=>e.target_port),['0','1']);
  if(name==='FixedReturn')assert.deepEqual(row.selected_return.source_conditions,[]);
 }
});

test('opening, refolding and saved re-render restore every source branch and the original SVG',()=>{
 for(const name of ['FixedReturn','FixedTuple']){
  const f=fixture(name),r=R.render(f.ir,f.state),row=r.graph.publication.normal_returns.rows[0],open=[...f.state.open,row.group,...f.region.canonical_members];
  const expanded=R.render(f.ir,{...f.state,open}),plain=R.render(f.ir,{...f.state,open,paperNormalReturns:false});
  assert.equal(expanded.svg,plain.svg);assert.equal(expanded.graph.publication.normal_returns,undefined);
  assert.ok(r.svg.includes('Normal return'));assert.ok(r.svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').includes('Other source path retained'));
  for(const edge of row.alternative_inputs){assert.ok(!expanded.graph.edge_accounting.attached.includes(edge.id));assert.ok(expanded.graph.edges.some(e=>e.id===edge.id));}
  for(const id of [row.aggregate,...f.region.return_sites.map(s=>s.node)])assert.ok(expanded.graph.positions.has(id));
  for(const result of [r,expanded]){account(f.ir,result.graph);assert.deepEqual(result.document.ir,f.ir);assert.deepEqual(result.prepared.quality.issues,[]);}
  const branchGoals=r.graph.expression_coverage.filter(c=>c.kind==='conditional-region');assert.ok(branchGoals.length);
  assert.ok(branchGoals.every(c=>c.status!=='fulfilled'));
  assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
  assert.equal(R.render(expanded.document.ir,{...expanded.document.state,open:f.state.open}).svg,r.svg);
 }
});

test('a valid source summary with worse geometry retains the original expression and records rejection',()=>{
 const f=fixture('FixedPair'),a=R.render(f.ir,{...f.state,paperNormalReturns:false}),b=R.render(f.ir,f.state),trial=b.prepared.routing.normal_return_refinement;
 assert.ok(trial&&!trial.accepted&&trial.facts_preserved&&trial.direct_goals_preserved&&!trial.geometry_preserved);
 assert.equal(b.svg,a.svg);assert.equal(b.document.publication.normal_returns,undefined);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);account(f.ir,b.graph);
});

test('dynamic entry guards, rebound guards, unknown computation and state writes do not acquire a normal-return summary',()=>{
 for(const name of ['DynamicReturn','ReboundReturn','UnknownReturn','StatefulReturn','LocalChoice']){
  const ir=load(name),g=E.project(ir,state),open=g.publication.open.filter(id=>!g.publication.return_regions?.rows.some(r=>r.group===id));
  assert.equal(E.project(ir,{...state,paperAuto:false,open}).publication.normal_returns,undefined,name);
 }
});

test('stale fixed values, return selection, branch witnesses, exact slots and cuts veto lowering',()=>{
 const mutations=[
  f=>delete f.ir.nodes.find(n=>n.id===f.region.aggregate).return_selection,
  f=>f.ir.nodes.find(n=>n.id===f.region.aggregate).return_selection.selected=f.region.return_sites[0].node,
  f=>f.ir.nodes.find(n=>n.id===f.region.aggregate).return_selection.call_constants.report=true,
  f=>f.ir.nodes.find(n=>n.slot==='report').source_constant_input.value=true,
  f=>f.ir.nodes.find(n=>n.slot==='report').slot='foreign',
  f=>f.ir.nodes.find(n=>n.id===f.region.control).source[0].expression='not report',
  f=>f.ir.nodes.find(n=>n.condition?.outcome==='false').condition.branch='foreign',
  f=>f.ir.edges.find(e=>e.id===f.region.return_sites[1].edge).target_port='99',
  f=>f.ir.edges.find(e=>e.id===f.region.return_sites[1].edge).source_port='99',
  f=>f.ir.edges.find(e=>e.target===f.region.return_sites[1].node).condition={branch:'foreign',outcome:'true'},
  f=>f.ir.edges.find(e=>e.source===f.region.control).target_port='unknown',
  f=>f.ir.edges.find(e=>e.target===f.region.control).iteration={loop:'foreign'},
  f=>f.ir.nodes.push({id:'unaccounted-body',parent:f.ir.nodes.find(n=>n.condition?.outcome==='false').id,kind:'compute'}),
  f=>f.ir.nodes.push({id:'unknown-control',parent:f.ir.nodes.find(n=>n.id===f.region.control).parent,kind:'opaque',reason:'unsupported-statement'}),
  f=>f.ir.nodes.push({id:'unknown-expression',parent:f.ir.nodes.find(n=>n.id===f.region.control).parent,kind:'opaque',reason:'unsupported-expression'}),
  f=>f.ir.edges.find(e=>e.id===f.region.cuts.find(e=>e.target_port==='0').id).target_port='99',
 ];
 for(const [i,mutate]of mutations.entries()){const f=fixture();mutate(f);assert.equal(F.normalReturns(f).rows.length,0,'mutation '+i);}
 for(const location of ['ir','plan'])for(const idKey of ['control','aggregate'])for(const extra of [{kind:'opaque'},{mutable:true},{runtime_evidence:[{}]},{evidence_status:'runtime-only'},{kind:'state'},{identity_display:{}}]){
  const f=fixture();Object.assign(f[location].nodes.find(n=>n.id===f.region[idKey]),extra);assert.equal(F.normalReturns(f).rows.length,0,location+' '+idKey+' '+JSON.stringify(extra));
 }
});

test('explicit detail, focus, print and other granularities do not silently lower a requested source boundary',()=>{
 const f=fixture();for(const extra of [{paperNormalReturns:false},{paperInvocationInputs:false},{paperFocus:f.ir.nodes.find(n=>n.id===f.region.control).parent},
  {paperExpressionDetails:[f.region.return_sites[0].node]},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  assert.equal(E.project(f.ir,{...f.state,...extra}).publication.normal_returns,undefined,JSON.stringify(extra));
 }
 const row=F.normalReturns(f).rows[0];for(const requested of [[row.group],[row.selected_return.node],[f.ir.nodes.find(n=>n.id===f.region.control).parent]]){
  assert.equal(F.normalReturns({...f,requested}).rows.length,0);
 }
});

test('names and case metadata do not select the invocation-return rule',()=>{
 const a=fixture(),b=fixture();for(const where of [b.ir,b.plan])for(const n of where.nodes){n.label='Unseen';n.source_class='Unknown';n.case='foreign';}
 assert.deepEqual(F.normalReturns(a).rows,F.normalReturns(b).rows);
});

test('per-edge attachment cannot swallow another use or bypass an expanded, hidden or stale owner',()=>{
 const f=fixture(),result=F.normalReturns(f),row=result.rows[0],edges=result.attachments,edge=row.alternative_inputs[0];
 const s={view:'architecture',mode:'source',open:[...f.open]},options={edgeAttachments:edges};
 const closed=E.project(f.ir,s,result.plan,options);assert.ok(closed.edge_accounting.attached.includes(edge.id));
 for(const altered of [
  {...s,open:[...s.open,row.group,...f.region.canonical_members]},
  {...s,open:[s.open[0]]}
 ])assert.ok(!E.project(f.ir,altered,result.plan,options).edge_accounting.attached.includes(edge.id));
 const corrupted=copy(f.ir);corrupted.edges.find(e=>e.id===edge.id).target_port='other';
 assert.ok(!E.project(corrupted,s,result.plan,options).edge_accounting.attached.includes(edge.id));
 for(const e of f.ir.edges.filter(e=>e.source===edge.source&&e.id!==edge.id&&!edges.has(e.id)))assert.ok(!closed.edge_accounting.attached.includes(e.id),e.id);
});
