'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine'),R=require('../semantic_studio/publication-renderer');
const read=p=>JSON.parse(fs.readFileSync(p));
const ir=read('verification/input-placement/current/SharedInputPaths.json');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
const project=()=>E.project(ir,state);
test('one search reuses identical routing inputs, isolates returned data and releases its cache on exit or exception',()=>{
 const oracle=R.prepare(project()),route=E.route;let calls=0;E.route=(...args)=>{calls++;return route(...args);};
 try{
  R.withPreparationCache(()=>{
   const a=R.prepare(project()),n=calls;assert.ok(n>0);assert.deepEqual(a,oracle);
   a.routes[0].route.points[0].x+=1000;a.quality.issues.push('polluted');
   const g=project(),b=R.prepare(g);assert.equal(calls,n);assert.deepEqual(b,oracle);
   assert.deepEqual([...g.positions.context.routeCache],b.routes.map(e=>[e.id,e.route]));
   R.withPreparationCache(()=>assert.deepEqual(R.prepare(project()),oracle));assert.equal(calls,n);
  });
  let n=calls;R.withPreparationCache(()=>R.prepare(project()));assert.ok(calls>n);
  assert.throws(()=>R.withPreparationCache(()=>{R.prepare(project());throw Error('cancel');}),/cancel/);
  n=calls;R.withPreparationCache(()=>R.prepare(project()));assert.ok(calls>n);
 }finally{E.route=route;}
});
test('geometry, labels, exact slots, conditions, parentage, publication limits and routing policies invalidate shared work',()=>{
 const edits=[g=>g.positions.get(g.nodes[0].id).x+=2,
  g=>g.nodes[0].paper.font=11,g=>g.nodes[0].paper.captions=['Extra caption'],
  g=>g.edges[0].source_port='different-slot',g=>g.edges[0].condition={branch:'unseen',outcome:'false'},
  g=>g.edges[0].paper_labels=[{text:'different condition'}],
  g=>{const idx=g.positions.context.idx;g.positions.context.idx={...idx,nodes:new Map([...idx.nodes].map(([id,n])=>[id,{...n}]))};g.positions.context.idx.nodes.get(g.edges[0].target).parent=null;},
  g=>{const idx=g.positions.context.idx;g.positions.context.idx={...idx,nodes:new Map([...idx.nodes].map(([id,n])=>[id,{...n}]))};g.positions.context.idx.nodes.get(g.edges[0].target).label='Renamed source';},
  g=>g.publication.canvas_limits={...g.publication.canvas_limits,width_px:1},
  g=>g.positions.context.crossScopePorts=[{edge:g.edges[0].id,source_side:'left',target_side:'left'}],
  g=>g.positions.context.protectFrameTitles=true];
 for(const edit of edits){
  const expectedGraph=project();edit(expectedGraph);const expected=R.prepare(expectedGraph);
  const route=E.route;let calls=0;E.route=(...args)=>{calls++;return route(...args);};
  try{R.withPreparationCache(()=>{R.prepare(project());const n=calls,g=project();edit(g);assert.deepEqual(R.prepare(g),expected);assert.ok(calls>n);});}finally{E.route=route;}
 }
});
function identity(g){
 const partition=b=>Object.fromEntries(Object.keys(b).sort().map(k=>[k,b[k].slice().sort()]));
 return JSON.stringify({nodes:g.nodes.map(n=>n.id).sort(),edges:g.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.kind,e.condition,e.originals,
  (e.bundle_members||[e]).map(m=>[m.id,m.canonical_source,m.canonical_target,m.resolved_source,m.source_port,m.target_port,m.kind,m.condition,m.originals])]).sort((a,b)=>a[0].localeCompare(b[0])),nodes_accounted:partition(g.node_accounting),edges_accounted:partition(g.edge_accounting)});
}
test('fixed-frontier fallback preflights a different source-return cut and retains the source facts and labels',()=>{
 const value=read('verification/normal-returns/current/FixedReturn.json'),s={...state,open:undefined};
 const initial=E.project(value,{...s,paperAuto:undefined,paperNormalReturns:false}),region=initial.publication.return_regions.rows[0];
 s.open=initial.publication.open.filter(id=>id!==region.group);
 const projected=E.project(value,s),fixed=R.prepareFigure(value,s,{requiredFrontier:identity(projected)});
 assert.equal(fixed.prepared.routing.frontier_preflight.reason,'different-canonical-frontier');
 assert.equal(identity(fixed.graph),identity(projected));assert.equal(fixed.prepared.quality.unplaced_port_labels.length,0);
 const ordinary=R.prepareFigure(value,s);assert.ok(ordinary.prepared.routing.normal_return_refinement);
 assert.equal(R.renderPrepared(value,s,fixed).svg,R.renderPrepared(value,s,ordinary).svg);
 // An identical alternative remains eligible; arbitrary nested searches must
 // not inherit the completed fallback's restriction.
 const disabled={...s,paperNormalReturns:false};assert.equal(R.prepareFigure(value,disabled).prepared.routing.frontier_preflight,undefined);
});
