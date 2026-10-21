'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js'),G=require('../semantic_studio/expression-goals.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},read=name=>JSON.parse(fs.readFileSync('verification/frontier-reservations/current/'+name+'.json'));
const project=(ir,s={})=>E.project(ir,{...state,...s,view:'publication'}),render=(ir,s={})=>R.render(ir,{...state,...s});
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}

test('summary lowering preserves the unsummarized logical frontier and every unrelated display choice',()=>{
 for(const name of ['FrontierMosaic','NestedMosaic','UnknownMosaic','BranchedMosaic'])for(const paperBudget of [4,6,8,10,20]){
  const ir=read(name),before=JSON.stringify(ir),g=project(ir,{paperBudget}),plain=project(ir,{paperBudget,paperPipelineSummaries:false}),r=g.publication.frontier_reservations;
  assert.deepEqual(r?.planned_open||g.publication.open,plain.publication.open);
  const members=new Set((r?.summaries||[]).flatMap(s=>s.canonical_members));
  assert.deepEqual(g.nodes.filter(n=>!members.has(n.id)).map(n=>n.id).sort(),plain.nodes.filter(n=>!members.has(n.id)).map(n=>n.id).sort());
  assert.deepEqual(plain.publication.open.filter(id=>!g.publication.open.includes(id)).sort(),(r?.summaries||[]).flatMap(s=>s.reserved_open).sort());
  assert.equal(JSON.stringify(ir),before);accounted(ir,g);
 }
});

test('a source summary does not spend its released budget opening a neighboring reused result',()=>{
 const ir=read('FrontierMosaic'),g=project(ir,{paperBudget:8}),r=g.publication.frontier_reservations;
 assert.equal(r.summaries.length,1);assert.equal(g.nodes.length,6);
 const helper=g.architecture.nodes.find(n=>n.label==='self.reused');assert.equal(g.positions.get(helper.id).expanded,false);
 const expanded=render(ir,{paperAuto:false,open:[...r.selected_open,helper.id]});
 assert.ok(expanded.graph.nodes.length>g.nodes.length);assert.equal(expanded.graph.positions.get(helper.id).expanded,true);
});

test('nested summary reservations are disjoint and leave original source boundaries individually expandable',()=>{
 const ir=read('NestedMosaic'),r=render(ir,{paperBudget:6}),reservation=r.graph.publication.frontier_reservations;
 assert.equal(reservation.summaries.length,1);
 const summary=r.graph.publication.local_pipelines.rows.find(p=>p.node===reservation.summaries[0].node);
 assert.equal(summary.source_boundaries.length,2);
 const opened=render(ir,{paperAuto:false,open:[...r.graph.publication.open,...summary.source_boundaries.map(b=>b.node)]});
 assert.ok(summary.operations.every(o=>opened.graph.positions.has(o.node)));
 assert.deepEqual(opened.graph.publication.local_pipelines.rows.find(p=>p.node===summary.node).bindings,summary.bindings);
 assert.ok(!opened.graph.publication.frontier_reservations);accounted(ir,opened.graph);
});

test('shared-source expression goals require the producer, every consumer and both canonical paths',()=>{
 const ir=read('FrontierMosaic'),p=project(ir,{paperBudget:8}),relation=p.architecture.relation_graph.relations.find(r=>r.type==='source-uses');
 const r=render(ir,{paperBudget:8,paperExpressionDetails:[relation.id]}),goal=r.graph.expression_goals.goals.find(g=>g.relation===relation.id);
 assert.deepEqual(new Set(goal.core),new Set([relation.node,...relation.bindings.map(b=>b.target)]));
 assert.equal(r.graph.expression_coverage.find(c=>c.goal===goal.id).status,'fulfilled');
 assert.equal(r.graph.publication.local_expressions.requests.find(q=>q.relation===relation.id).status,'fulfilled');
 const graph={...r.graph,positions:new Map(r.graph.positions)};graph.positions.delete(relation.bindings[0].target);
 assert.equal(G.evaluate({goals:[goal]},graph,r.prepared,ir)[0].status,'unfulfilled');
 const prepared={...r.prepared,routes:r.prepared.routes.filter(e=>!relation.bindings.some(b=>e.id===b.edge))};
 assert.equal(G.evaluate({goals:[goal]},r.graph,prepared,ir)[0].status,'unfulfilled');
 assert.ok(relation.not_asserted.includes('parallel execution'));
});

test('measured source-use detail gains survive DAG lowering and disproportionate cost still rejects',()=>{
 const tight=render(read('FrontierMosaic'),{paperBudget:8,paperAdaptive:true}),wide=render(read('BranchedMosaic'),{paperBudget:8,paperAdaptive:true});
 const a=tight.graph.publication.adaptive_frontier.attempts.find(t=>t.opportunity.type==='source-uses'),b=wide.graph.publication.adaptive_frontier.attempts.find(t=>t.opportunity.type==='source-uses');
 assert.ok(a.gain>0);assert.equal(a.accepted,true);assert.deepEqual(a.lost_goals,[]);
 assert.equal(b.accepted,true);assert.ok(b.gained_goals.some(g=>g.kind==='source-uses'));assert.deepEqual(b.lost_goals,[]);
 assert.deepEqual(wide.prepared.quality.issues,[]);assert.ok(wide.graph.publication.adaptive_frontier.selected_expression_details.length);
 const baseline=render(read('FrontierMosaic'),{paperBudget:8}),trial={...tight,prepared:{...tight.prepared,quality:structuredClone(tight.prepared.quality)}};
 trial.prepared.quality.native_width_px*=100;
 const rejected=A.assess(baseline.document.ir,baseline,trial);assert.equal(rejected.accepted,false);assert.ok(rejected.reasons.includes('disproportionate-area-cost'));
});

test('unknown boundaries survive reservation and measured refinement',()=>{
 const ir=read('UnknownMosaic'),b=render(ir,{paperBudget:8}),a=render(ir,{paperBudget:8,paperAdaptive:true});
 const unknowns=b.graph.nodes.filter(n=>n.kind==='opaque').map(n=>n.id);assert.ok(unknowns.length);
 assert.ok(unknowns.every(id=>a.graph.positions.has(id)));assert.ok(a.graph.expression_coverage.some(c=>c.kind==='unknown-boundary'&&c.status==='fulfilled'));
 accounted(ir,a.graph);
});

test('renaming a model or wrapping source-use metadata in labels does not select its details',()=>{
 const ir=read('BranchedMosaic'),g=project(ir,{paperBudget:8}),before=A.candidates(g,state);
 for(const n of g.architecture.nodes){n.label='Transformer';n.source_class='NeverSeen';}
 assert.deepEqual(A.candidates(g,state),before);
});

test('saving, reopening, disabling summaries and manual open preserve their requested behavior',()=>{
 const ir=read('FrontierMosaic'),s={...state,paperBudget:8},before=JSON.stringify({ir,s}),r=R.render(ir,s);
 assert.equal(JSON.stringify({ir,s}),before);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 const manual=render(ir,{paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
 assert.ok(!manual.graph.publication.frontier_reservations);assert.ok(manual.graph.nodes.length>r.graph.nodes.length);
 for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperPipelineSummaries:false}])assert.ok(!render(ir,extra).graph.publication.frontier_reservations);
});
