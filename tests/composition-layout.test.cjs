'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine'),C=require('../semantic_studio/composition-layout');
const read=n=>JSON.parse(fs.readFileSync('verification/call-boundaries/current/'+n+'.json'));
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperComposition:'architecture'};
test('composition changes only drawing geometry, preserves exact calls, edges, accounting and source facts',()=>{
 const ir=read('ReadWorkshop'),raw=JSON.stringify(ir),g=E.project(ir,state),r=C.compose(g,state);
 assert.deepEqual(r.edges,g.edges);assert.deepEqual(r.node_accounting,g.node_accounting);assert.deepEqual(r.edge_accounting,g.edge_accounting);
 assert.deepEqual(r.nodes.map(n=>n.id),g.nodes.map(n=>n.id));assert.equal(JSON.stringify(ir),raw);
 for(const p of r.positions.values()){assert.ok(p.w>0&&p.h>0);assert.ok(p.x>=r.bounds.x&&p.y>=r.bounds.y);}
});
test('unknown, conditional, mutable and escaping boundaries remain visible in wider architecture cards',()=>{
 for(const name of ['InterruptedRead','ConditionalRead','MutableRead','EscapingRead']){
  const ir=read(name),a=E.project(ir,state),b=C.compose(a,state);
  assert.deepEqual(a.edges,b.edges);assert.deepEqual(a.nodes.map(n=>n.id),b.nodes.map(n=>n.id));
  for(const n of ir.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.mutable))assert.ok(b.positions.has(n.id));
 }
});
test('actual composed SVG has valid routes and can save and reopen with the same recipe',()=>{
 const ir=read('PairReads'),r=R.render(ir,state);
 assert.equal(r.prepared.quality.route_failures.length,0);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
});
test('input docking uses the common receiving scope and keeps every canonical use and external source parent',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/helper-contracts/current/Transformer-current.json'));
 const g=E.project(ir,{...state,paperSampleFrame:true}),r=C.compose(g,state),docks=r.publication.composition.input_docks;
 assert.ok(docks.length>=4);assert.deepEqual(r.edges,g.edges);
 for(const d of docks){
  assert.equal(ir.nodes.find(n=>n.id===d.node).parent,d.source_parent);
  assert.equal(r.idx.nodes.get(d.node).parent,d.drawing_parent);
  assert.deepEqual(d.edges.map(e=>e.edge),g.edges.filter(e=>e.source===d.node).map(e=>e.id));
  for(const e of d.edges){let at=e.target;while(at&&at!==d.drawing_parent)at=r.idx.nodes.get(at)?.parent;assert.equal(at,d.drawing_parent);}
 }
 const shared=g.nodes.find(n=>n.label==='src_key_padding_mask');assert.ok(!docks.some(d=>d.node===shared.id));
});
