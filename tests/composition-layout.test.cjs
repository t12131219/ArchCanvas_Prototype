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
test('cross-region input terminals face the original consumers without changing operand identity',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/helper-contracts/current/Transformer-current.json'));
 const a=E.project(ir,{...state,paperSampleFrame:true}),b=C.compose(a,state);
 assert.ok(b.positions.context.crossScopePorts.length>=6);assert.deepEqual(a.edges,b.edges);
 for(const row of b.positions.context.crossScopePorts){
  const edge=b.edges.find(e=>e.id===row.edge);assert.ok(edge);
  assert.ok(row.source_side!==row.target_side);assert.ok(!edge.condition&&!edge.design_route);
 }
});
test('upward body composition preserves headings, containment and exact source boundaries on unfamiliar structures',()=>{
 for(const name of ['ReadWorkshop','PairReads','InterruptedRead','ConditionalRead','MutableRead','EscapingRead']){
  const ir=read(name),raw=JSON.stringify(ir),g=E.project(ir,state),down=C.compose(g,state),up=C.compose(g,{...state,paperDirection:'up'});
  assert.equal(JSON.stringify(ir),raw);assert.deepEqual(up.edges,down.edges);assert.deepEqual(up.node_accounting,down.node_accounting);
  for(const n of up.nodes){
   const p=up.positions.get(n.id),owner=up.idx.nodes.get(n.id).parent,parent=up.positions.get(owner);
   if(!parent)continue;
   assert.ok(p.y>=parent.y+parent.header,`${name}: child stays below heading`);
   assert.ok(p.y+p.h<=parent.y+parent.h,`${name}: body contains child`);
  }
  const rendered=R.render(ir,{...state,paperDirection:'up'});
  assert.deepEqual(rendered.prepared.quality.route_failures,[]);assert.deepEqual(rendered.prepared.quality.unplaced_port_labels,[]);
 }
});
test('manual drawing offsets survive architecture re-render and save/reopen instead of resetting silently',()=>{
 const ir=read('PairReads'),a=R.render(ir,{...state,paperDirection:'up'}),node=a.graph.nodes.find(n=>!a.graph.positions.get(n.id).expanded),id=node.id;
 const b=R.render(ir,{...state,paperDirection:'up',offsets:{[id]:{x:19,y:7}}});
 assert.equal(b.graph.positions.get(id).x,a.graph.positions.get(id).x+19);
 assert.equal(b.graph.positions.get(id).y,a.graph.positions.get(id).y+7);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('upward source streams retain a real cross-region context and downstream outputs follow their source region',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/helper-contracts/current/Transformer-current.json'));
 const a=C.compose(E.project(ir,{...state,paperSampleFrame:true}),{...state,paperDirection:'up'});
 assert.ok(a.publication.composition.followers.length>=2);
 for(const row of a.publication.composition.followers){
  const p=a.positions.get(row.node),source=a.positions.get(row.source_scope);
  assert.ok(Math.abs(p.x+p.w/2-source.x-source.w/2)<1);
  assert.ok(p.y<source.y);assert.ok(row.edges.every(id=>a.edges.some(e=>e.id===id)));
 }
});
test('hidden children remain indexed so actual summary controls can reopen finer source facts',()=>{
 const ir=read('ReadWorkshop'),g=E.project(ir,state),r=C.compose(g,state);
 for(const n of g.nodes){
  const before=g.idx.children.get(n.id)||[];
  for(const child of before.filter(id=>!g.positions.has(id)))assert.ok(r.idx.children.get(n.id)?.includes(child));
 }
 const summary=r.nodes.find(n=>n.local_pipeline);assert.ok(summary);assert.ok(r.idx.children.get(summary.id).length);
});
test('architecture frontier navigation preserves an exact coarse return snapshot through local edits and save/reopen',()=>{
 const ir=read('ReadWorkshop'),original={...state,paperDirection:'up',paperAuto:true,open:[],offsets:{},paperReadSummary:'bindings'};
 const before=R.render(ir,original),fine=C.frontier(original,'detail');
 assert.deepEqual(fine.paperFrontierReturn,original);assert.equal(fine.paperGranularity,'roles');
 const local={...fine,paperAuto:false,open:['changed-local-selection'],paperFocus:'local'};
 const saved=JSON.parse(JSON.stringify(local)),back=C.frontier(saved,'return');assert.deepEqual(back,original);
 assert.equal(R.render(ir,back).svg,before.svg);
 const overview=C.frontier(saved,'overview');assert.equal(overview.paperGranularity,'stages');assert.ok(!overview.paperFocus&&!overview.paperFrontierReturn);
});
test('serial siblings cannot share a row merely because their previous coordinates coincided',()=>{
 const ir=read('ReadWorkshop'),g=E.project(ir,state);
 // Force every old sibling to the same y. Rebuilt dependency ranks must
 // still separate the source-boundary path; row order is never old-y proof.
 for(const p of g.positions.values())p.y=100;
 const result=C.compose(g,state);
 for(const record of result.publication.composition.records){
  const branch=id=>{let at=id;while(at&&!record.children.includes(at))at=result.idx.nodes.get(at)?.parent;return at;};
  for(const e of result.edges){
   const a=branch(e.source),b=branch(e.target);if(!a||!b||a===b||e.design_route?.kind==='iteration-feedback')continue;
   const ra=record.rows.findIndex(r=>r.includes(a)),rb=record.rows.findIndex(r=>r.includes(b));
   if(ra>=0&&rb>=0)assert.ok(ra<rb,'actual dependency controls the row order');
  }
 }
});
test('detailed frontier opens certified stage computations and records guarded nested scopes as deferred',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/helper-contracts/current/Transformer-current.json'));
 const fine=C.certifiedDetails(ir,C.frontier({...state,paperDirection:'up'},'detail'));
 assert.ok(fine.paperFrontierRecipe.stage_requests.length>=5);assert.ok(fine.paperFrontierRecipe.nested_deferred.length);
 const graph=E.project(ir,{...fine,paperSampleFrame:true});
 for(const id of fine.paperFrontierRecipe.stage_requests){assert.ok(graph.positions.get(id)?.expanded);
  const stage=graph.idx.nodes.get(id);for(const member of stage.contract_stage.canonical_members){
   if(ir.nodes.find(n=>n.id===member)?.kind==='compute')assert.ok(graph.positions.has(member));
  }
 }
 for(const d of fine.paperFrontierRecipe.nested_deferred)assert.ok(!fine.paperRolePaths.some(p=>p.node===d.node));
 assert.deepEqual(C.frontier(fine,'return'),{...state,paperDirection:'up'});
});
test('a composed drawing with unresolved labels retains a clean dependency drawing of the same semantic frontier',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/cell-interfaces/current/StateWorkshop.json'));
 for(const s of [{...state,paperDirection:'up'},C.certifiedDetails(ir,C.frontier({...state,paperDirection:'up'},'detail'))]){
  const original=E.project(ir,{paperSampleFrame:true,paperReadBindingRows:true,paperSourceHeadings:true,...s,offsets:{}}),raw=JSON.stringify(ir);
  const r=R.render(ir,s),receipt=r.graph.publication.composition;
  assert.equal(receipt.status,'fallback');assert.ok(receipt.rejected_quality.unplaced_port_labels.length);
  assert.deepEqual(r.prepared.quality.issues,[]);assert.deepEqual(r.prepared.quality.unplaced_port_labels,[]);
  assert.deepEqual(r.graph.nodes.map(n=>n.id),original.nodes.map(n=>n.id));assert.deepEqual(r.graph.edges,original.edges);
  assert.deepEqual(r.graph.node_accounting,original.node_accounting);assert.deepEqual(r.graph.edge_accounting,original.edge_accounting);
  assert.deepEqual(receipt.input_docks,[]);assert.equal(JSON.stringify(ir),raw);
  assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 }
});
