'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine'),G=require('../semantic_studio/summary-goals');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperAdaptive:false};
const read=name=>JSON.parse(fs.readFileSync('verification/stage-routes/current/'+name+'.json'));
const done=(r,k)=>r.graph[k].filter(c=>c.status==='fulfilled').map(c=>c.goal).sort();
function preserved(a,b){
 for(const key of ['architecture','publication','expression_goals','summary_goals'])assert.deepEqual(a.document[key],b.document[key],key);
 for(const key of ['node_accounting','edge_accounting','frame_ownership','representatives'])assert.deepEqual(a.graph[key],b.graph[key],key);
 assert.deepEqual(a.graph.edges,b.graph.edges);assert.deepEqual([...a.graph.positions],[...b.graph.positions]);
 for(const key of ['expression_coverage','summary_coverage'])assert.deepEqual(done(a,key),done(b,key));
 for(const e of b.prepared.routes){const old=a.prepared.routes.find(x=>x.id===e.id);assert.deepEqual([e.route.points[0],e.route.points.at(-1),e.route.source_side,e.route.target_side],[old.route.points[0],old.route.points.at(-1),old.route.source_side,old.route.target_side]);}
}
test('the final coarse frontier shortens an actual mutable source path without changing any node or binding',()=>{
 const ir=read('LayeredPatch'),raw=JSON.stringify(ir),a=R.render(ir,{...state,paperRouteShortcuts:false}),b=R.render(ir,state),r=b.prepared.routing.route_shortcuts;
 assert.ok(r.final_stage_frontier&&r.selected.length);assert.equal(a.prepared.quality.line_geometry.crossings,1);assert.equal(b.prepared.quality.line_geometry.crossings,0);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);assert.ok(ir.nodes.some(n=>n.mutable));preserved(a,b);assert.equal(JSON.stringify(ir),raw);
 assert.ok(r.attempts.length<=48&&r.max_edges===12&&r.max_candidates_per_edge===64);
 for(const row of r.selected){assert.deepEqual(row.lost_summaries,[]);assert.equal(row.summary_goals_before,row.summary_goals_candidate);}
});
test('actual framework state remains visible and exact while an unrelated input detour shortens',()=>{
 const ir=read('StatePatch'),a=R.render(ir,{...state,paperRouteShortcuts:false}),b=R.render(ir,state);
 assert.ok(b.prepared.routing.route_shortcuts.selected.length);preserved(a,b);
 for(const n of ir.nodes.filter(n=>n.state_interface||n.framework_type==='torch.nn.GRUCell'))assert.ok(b.graph.positions.has(n.id));
 assert.equal(a.prepared.quality.line_geometry.crossings,2);assert.equal(b.prepared.quality.line_geometry.crossings,1);
});
test('unknown, conditional and shared-call boundaries retain their current graph when no safe shortcut exists',()=>{
 for(const name of ['UnknownPatch','ConditionalPatch','SharedPatch']){const a=R.render(read(name),{...state,paperRouteShortcuts:false}),b=R.render(read(name),state);preserved(a,b);assert.equal(a.svg,b.svg,name);}
 assert.ok(read('UnknownPatch').nodes.some(n=>n.kind==='opaque'));assert.ok(read('ConditionalPatch').nodes.some(n=>n.condition||n.kind==='control'));
 const shared=R.render(read('SharedPatch'),state);assert.ok(shared.graph.architecture.relation_graph.relations.some(r=>r.type==='same-object-calls'));
 assert.ok(shared.graph.nodes.some(n=>n.identity_display));
});
function summaryScene(){
 const ir=read('SummarizedPatch'),root=ir.nodes.find(n=>n.parent==null).id;
 for(const [id,kind,role]of [['probe-source','interface','input'],['probe-target','compute'],['probe-context','interface','input'],['probe-end','compute']])ir.nodes.push({id,parent:root,kind,role,label:id,operator:kind==='compute'?'novel':undefined,source:[],runtime_evidence:[]});
 for(const [id,source,target]of [['probe-first','probe-source','probe-target'],['probe-second','probe-context','probe-end']])ir.edges.push({id,source,target,kind:'data',source_port:'out',target_port:'value',evidence:'source-dependency'});
 const g=R.prepareFigure(ir,{...state,paperRouteShortcuts:false}).graph,positions=new Map([...g.positions].map(([id,p])=>[id,{...p,x:p.x+600}]));
 positions.context={...g.positions.context,routeCache:new Map(),reserved:[]};
 Object.assign(positions.get(root),{x:0,y:0,w:1400,h:900,header:60});
 for(const [id,x,y,w,h]of [['probe-source',40,70,100,44],['probe-target',240,470,120,64],['probe-context',370,140,100,44],['probe-end',100,250,120,64]])Object.assign(positions.get(id),{x,y,w,h});
 const graph={...g,positions,bounds:{x:0,y:0,w:1400,h:900}},initial=R.prepare(graph);
 const route=(id,points)=>({...graph.edges.find(e=>e.id===id),route:{ok:true,source_side:'bottom',target_side:'top',points:points.map(([x,y])=>({x,y}))}});
 const replacements=new Map([['probe-first',route('probe-first',[[90,114],[90,210],[320,210],[320,450],[300,450],[300,470]])],['probe-second',route('probe-second',[[420,184],[420,230],[160,230],[160,250]])]]);
 const prepared=R.evaluateRoutes(graph,initial.routes.map(e=>replacements.get(e.id)||e),initial.quality.route_strategy);prepared.routing={};
 return {ir,baseline:{graph,prepared}};
}
test('a real folded source-read DAG keeps its summary text and every canonical cut during accepted final shortening',()=>{
 const {ir,baseline}=summaryScene(),goals=G.build(ir,baseline.graph.architecture),before=G.evaluate(goals,ir,baseline.graph,baseline.prepared).filter(c=>c.status==='fulfilled');assert.equal(before.length,1);
 const b=R.prepareRouteShortcuts(ir,state,baseline,{stages:true}),record=b.prepared.routing.route_shortcuts;
 assert.ok(record.selected.some(r=>r.edge==='probe-first'));assert.equal(record.summary_goals_before,1);
 assert.ok(record.selected.every(r=>r.summary_goals_candidate===1&&!r.lost_summaries.length));
 assert.deepEqual(G.evaluate(goals,ir,b.graph,b.prepared).filter(c=>c.status==='fulfilled').map(c=>c.goal),before.map(c=>c.goal));
 assert.deepEqual([...b.graph.positions],[...baseline.graph.positions]);assert.deepEqual(b.graph.nodes,baseline.graph.nodes);assert.deepEqual(b.graph.edges,baseline.graph.edges);
});
test('save/reopen, finer canonical source and return to the coarse frontier retain all extracted facts',()=>{
 const ir=read('LayeredPatch'),a=R.render(ir,state),b=R.render(a.document.ir,a.document.state);assert.equal(a.svg,b.svg);
 const source=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(source.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(source.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
 assert.equal(R.render(ir,state).svg,a.svg);
});
test('print, manual geometry, opt-out and non-stage views retain the prior pass placement',()=>{
 for(const extra of [{paperRouteShortcuts:false},{paperMedium:'print'},{offsets:{[read('LayeredPatch').nodes[0].id]:{x:1,y:0}}},{paperGranularity:'semantic'}]){
  const r=R.render(read('LayeredPatch'),{...state,...extra});assert.equal(r.prepared.routing.route_shortcuts?.final_stage_frontier,undefined);
 }
 const r=R.render(read('LayeredPatch'),{...state,paperGranularity:'roles'});assert.equal(r.prepared.routing.route_shortcuts?.final_stage_frontier,undefined);
});
test('misleading model family metadata cannot select a route or change semantic claims',()=>{
 const ir=read('LayeredPatch'),a=R.render(ir,state);ir.title='Transformer';for(const n of ir.nodes){n.class_name='LSTM';n.source_class='MoE';}
 const b=R.render(ir,state);assert.deepEqual(a.graph.edges,b.graph.edges);assert.deepEqual(a.graph.publication.open,b.graph.publication.open);
 assert.equal(a.prepared.quality.line_geometry.crossings,b.prepared.quality.line_geometry.crossings);
 assert.deepEqual(a.graph.architecture.findings,b.graph.architecture.findings);
});
