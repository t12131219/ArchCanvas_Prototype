const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../yworks_edge_router_lab/interaction-mode.js');
require('../yworks_edge_router_lab/router.js');
require('../yworks_edge_router_lab/physical-ports.js');
require('../yworks_edge_router_lab/junction-markers.js');
require('../yworks_edge_router_lab/route-labels.js');
require('../yworks_edge_router_lab/source-contracts.js');
const E=require('../yworks_edge_router_lab/graph-engine.js');
const C=require('../yworks_edge_router_lab/semantic-constraints.js');

const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json')));
const load=(title,collection,view='detailed')=>{
  const c=catalog.cases.find(v=>v.title===title&&v.collection===collection&&!v.historical);
  return C.initialize(JSON.parse(fs.readFileSync(path.join(root,c.views.find(v=>v.key===view).json))));
};
const options={margin:6,stub:28,bendCost:40,crossingCost:180,overlapCost:2,edgeSpacing:12,sides:'any',style:'orthogonal'};

test('interaction mode contract normalizes and labels persisted values',()=>{
  assert.equal(M.normalize(undefined),'compat');
  assert.equal(M.normalize('compat'),'compat');
  assert.equal(M.normalize('realtime'),'realtime');
  assert.equal(M.normalize('forged'),'compat');
  assert.equal(M.key,'summary-merge:interaction-mode');
});

test('realtime candidate is the same authoritative move as a committed gesture',()=>{
  const base=load('Transformer','transformer_programmatic_guide','detailed');
  const id='enc.self.sdpa.av',dx=34,dy=0;
  const realtime=E.clone(base),committed=E.clone(base);
  E.move(realtime,id,dx,dy,options);E.move(committed,id,dx,dy,options);
  assert.deepEqual(realtime,committed);
  assert.equal(realtime.lastMove.blocked,false);
  const edge=realtime.edges.find(e=>e.source===id||e.target===id);
  assert.ok(edge,'moved node must have an incident connection');
  assert.deepEqual(realtime.semanticBaseline,base.semanticBaseline);
  assert.deepEqual(edge.binding,base.edges.find(e=>e.id===edge.id).binding);
  assert.equal(C.validateSource(realtime).ok,true);
  assert.ok(C.validate(realtime,edge,edge.route).ok);
});

test('compatibility preview stays lightweight while the realtime commit stays semantic',()=>{
  const base=load('Transformer','transformer_programmatic_guide','detailed');
  const preview=E.clone(base),id='enc.self.k.value';
  E.movePreview(preview,id,12,0);
  assert.equal(preview.nodes.find(n=>n.id===id).x,base.nodes.find(n=>n.id===id).x+12);
  assert.deepEqual(preview.semanticBaseline,base.semanticBaseline);
  assert.deepEqual(preview.edges.map(e=>e.binding),base.edges.map(e=>e.binding));
  const realtime=E.clone(base);E.move(realtime,id,12,0,options);
  assert.equal(C.validateSource(realtime).ok,true);
  for(const edge of realtime.edges)assert.equal(C.validate(realtime,edge,edge.route).ok,true,edge.id);
  assert.deepEqual(realtime.semanticBaseline,base.semanticBaseline);
});

test('invalid realtime position rolls back as one node and route transaction',()=>{
  const base=load('Transformer','transformer_programmatic_guide','detailed');
  const candidate=E.clone(base),id='enc.self.k.value';
  E.move(candidate,id,0,22,options);
  assert.equal(candidate.lastMove.blocked,true);
  assert.deepEqual(candidate.nodes,base.nodes);
  assert.deepEqual(candidate.edges,base.edges);
  assert.deepEqual(candidate.attachments,base.attachments);
});

test('route captions still use the moved route in both interaction modes',()=>{
  const base=load('Transformer','transformer_programmatic_guide','detailed');
  const realtime=E.clone(base);E.move(realtime,'enc.self.sdpa.av',20,0,options);
  for(const graph of [base,realtime]){
    const placements=E.routeLabelPlacements(graph,true);
    for(const a of graph.routeLabels||[])if(graph.edges.some(e=>e.id===a.edge))assert.ok(placements.has(a.id),a.id);
  }
});
