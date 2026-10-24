'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine'),C=require('../semantic_studio/composition-layout');
const read=n=>JSON.parse(fs.readFileSync('verification/call-boundaries/current/'+n+'.json'));
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperComposition:'architecture'};
const columnFixture=name=>JSON.parse(fs.readFileSync('verification/architecture-columns/current/'+name+'.json'));
const columnState=ir=>({...state,paperGranularity:'all',paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
const pathInput=name=>JSON.parse(fs.readFileSync('verification/path-rows/current/'+name+'.json'));
test('ordinary convolution and dense serial paths use measured rows with exact operations, source order, bindings and fonts',()=>{
 for(const direction of ['up','down'])for(const start of ['left','right']){
  const ir=pathInput('SpatialPipeline'),raw=JSON.stringify(ir),s={...columnState(ir),paperDirection:direction,paperArchitecturePathRows:start},g=E.project(ir,s),c=C.compose(g,s);
  assert.equal(c.publication.composition.path_rows.length,2);assert.deepEqual(c.edges,g.edges);
  assert.deepEqual(c.node_accounting,g.node_accounting);assert.deepEqual(c.edge_accounting,g.edge_accounting);assert.equal(JSON.stringify(ir),raw);
  const ns=new Map(c.nodes.map(n=>[n.id,n]));
  for(const r of c.publication.composition.path_rows){
   assert.equal(r.rows.length,2);assert.deepEqual(r.rows.flatMap(r=>r.ids),r.ordered);assert.ok(r.after.h<r.before.h);assert.equal(r.after.w,r.before.w);
   for(let i=0;i<r.rows.length;i++){
    const row=r.rows[i],ps=row.ids.map(id=>c.positions.get(id));assert.equal(new Set(ps.map(p=>p.y+p.h/2)).size,1);
    const reverse=!!(i%2)!==(start==='right');assert.equal(ps[0].x>ps.at(-1).x,reverse);
   }
   for(const id of r.ordered){const p=c.positions.get(id),owner=c.positions.get(r.node),n=ns.get(id),original=g.nodes.find(n=>n.id===id);
    assert.equal(n.paper.font,original.paper.font);assert.equal(n.paper.caption,original.paper.caption);assert.equal(n.paper.title,original.paper.title);
    assert.ok(p.x>=owner.x&&p.x+p.w<=owner.x+owner.w&&p.y>=owner.y+owner.header&&p.y+p.h<=owner.y+owner.h);
   }
  }
 }
});
test('short path rows select a bounded measured recipe on ordinary spatial code and retain exact save/reopen',()=>{
 const ir=pathInput('SpatialPipeline'),s={...columnState(ir),paperDirection:'up'},a=R.render(ir,s),b=R.render(ir,{...s,paperArchitecturePathRows:false}),rec=a.prepared.routing.architecture_path_rows;
 assert.equal(rec.selected,'left');assert.equal(rec.max_trials,2);assert.equal(rec.max_wire_ratio,1.02);
 assert.ok(a.prepared.quality.native_height_px<b.prepared.quality.native_height_px);assert.ok(a.prepared.quality.wire_length<=b.prepared.quality.wire_length*1.02);
 assert.equal(a.prepared.quality.line_geometry.crossings,b.prepared.quality.line_geometry.crossings);assert.deepEqual(a.graph.edges,b.graph.edges);
 assert.deepEqual(a.prepared.quality.issues,[]);assert.equal(R.render(a.document.ir,a.document.state).svg,a.svg);
});
test('a topological order of parallel branches cannot become one claimed serial path',()=>{
 const ir=pathInput('BranchedPipeline'),s=columnState(ir),g=E.project(ir,s),c=C.compose(g,s);
 assert.deepEqual(c.publication.composition.path_rows,[]);assert.deepEqual(c.edges,g.edges);
});
test('short path packing declines control, unknown, state, mutable, shared identity, runtime-only, guarded and feedback evidence',()=>{
 for(const variation of ['condition','mutable','opaque','control','state','identity','runtime-only','runtime-evidence','owner-runtime-evidence','owner-condition','owner-mutable','owner-identity','owner-runtime-only','guarded-edge','iteration','feedback','extra-link']){
  const ir=pathInput('SpatialPipeline'),s=columnState(ir),g=E.project(ir,s),parent=g.nodes.find(n=>n.label==='spatial');
  const member=g.nodes.find(n=>n.parent===parent.id&&n.kind==='compute'),e=g.edges.find(e=>e.source===member.id&&g.nodes.some(n=>n.id===e.target&&n.parent===parent.id));assert.ok(e);
  if(variation==='condition'||variation==='mutable')member[variation]=true;
  else if(['opaque','control','state'].includes(variation))member.kind=variation;
  else if(variation==='identity')member.identity_display={kind:'same-object-calls'};
  else if(variation==='runtime-only')member.evidence_status='runtime-only';
  else if(variation==='runtime-evidence')member.runtime_evidence=[{call:'observed'}];
  else if(variation==='owner-runtime-evidence')parent.runtime_evidence=[{call:'observed'}];
  else if(variation==='owner-condition')parent.condition={branch:'guard'};
  else if(variation==='owner-mutable')parent.mutable=true;
  else if(variation==='owner-identity')parent.identity_display={kind:'same-object-calls'};
  else if(variation==='owner-runtime-only')parent.evidence_status='runtime-only';
  else if(variation==='guarded-edge')e.condition={branch:'guard'};else if(variation==='iteration')e.iteration={step:1};
  else if(variation==='feedback')g.positions.context.feedback.add(e.id);
  else g.edges.push({...e,id:'not-a-serial-path',source:e.target,target:e.source});
  assert.ok(!C.compose(g,s).publication.composition.path_rows.some(r=>r.node===parent.id),variation);
 }
});
test('path geometry uses source ownership and dependencies independent of family labels or source locations',()=>{
 const ir=pathInput('SpatialPipeline'),s=columnState(ir),g=E.project(ir,s),a=C.compose(g,s);
 for(const n of g.nodes){n.label='Foreign '+n.id.length;n.semantic_type=n.semantic_type==='convolutional network'?'Unclassified source':n.semantic_type;n.source=[];if(n.source_class)n.source_class='Renamed';}
 const b=C.compose(g,s);assert.deepEqual(b.publication.composition.path_rows.map(r=>r.ordered),a.publication.composition.path_rows.map(r=>r.ordered));assert.deepEqual(b.edges,a.edges);
});
test('manual placement, explicit opt-out and resource limits retain vertical path geometry',()=>{
 const ir=pathInput('SpatialPipeline'),s=columnState(ir),g=E.project(ir,s);
 for(const extra of [{paperArchitecturePathRows:false},{offsets:{[ir.nodes[0].id]:{x:2,y:3}}}])assert.deepEqual(C.compose(g,{...s,...extra}).publication.composition.path_rows,[]);
 g.edges=Array(129).fill(g.edges[0]);assert.deepEqual(C.compose(g,s).publication.composition.path_rows,[]);
});
test('unequal ordinary serial source modules share measured width in both directions while preserving ownership and every binding',()=>{
 for(const direction of ['up','down']){
  const ir=columnFixture('SerialModules'),raw=JSON.stringify(ir),s={...columnState(ir),paperDirection:direction},g=E.project(ir,s),c=C.compose(g,s);
  const columns=c.publication.composition.module_columns;assert.equal(columns.length,1);assert.equal(columns[0].changed.length,1);
  assert.deepEqual(c.edges,g.edges);assert.deepEqual(c.node_accounting,g.node_accounting);assert.deepEqual(c.edge_accounting,g.edge_accounting);
  assert.deepEqual(c.nodes.filter(n=>n.kind==='composite').map(n=>[n.id,n.parent]),g.nodes.filter(n=>n.kind==='composite').map(n=>[n.id,n.parent]));assert.equal(JSON.stringify(ir),raw);
  for(const id of columns[0].members)assert.equal(c.positions.get(id).w,columns[0].width);
  for(const n of c.nodes){const p=c.positions.get(n.id),owner=c.positions.get(c.idx.nodes.get(n.id).parent);if(owner){
   assert.ok(p.x>=owner.x&&p.x+p.w<=owner.x+owner.w);assert.ok(p.y>=owner.y+owner.header&&p.y+p.h<=owner.y+owner.h);
  }}
 }
});
test('module column alignment is independent of labels, paths, source hashes and case identity, and can be disabled',()=>{
 const ir=columnFixture('SerialModules'),s=columnState(ir),before=C.compose(E.project(ir,s),s);
 for(const n of ir.nodes){n.label='Renamed '+n.id.length;n.source=[];delete n.source_class;delete n.module_path;}
 ir.title='Unfamiliar program';delete ir.source;
 const after=C.compose(E.project(ir,s),s);
 assert.deepEqual(after.publication.composition.module_columns.map(r=>r.members),before.publication.composition.module_columns.map(r=>r.members));
 const off=C.compose(E.project(ir,s),{...s,paperArchitectureColumns:false});assert.deepEqual(off.publication.composition.module_columns,[]);
 const widths=before.publication.composition.module_columns[0].members.map(id=>off.positions.get(id).w);assert.ok(new Set(widths).size>1);
});
test('parallel, cyclic, conditional, mutable, unknown and interrupted source paths do not acquire serial module columns',()=>{
 const ir=columnFixture('ParallelModules'),s=columnState(ir);assert.deepEqual(C.compose(E.project(ir,s),s).publication.composition.module_columns,[]);
 for(const variation of ['cycle','condition','mutable','opaque','control','guarded-edge','iteration','disconnect']){
  const ir=columnFixture('SerialModules'),s=columnState(ir),g=E.project(ir,s),a=g.nodes.find(n=>n.label==='produce'),b=g.nodes.find(n=>n.label==='consume');
  const under=(id,ancestor)=>{while(id){if(id===ancestor)return true;id=g.idx.nodes.get(id)?.parent;}return false;};
  const e=g.edges.find(e=>under(e.source,a.id)&&under(e.target,b.id));assert.ok(e);
  if(variation==='cycle')g.edges.push({...e,id:'reverse-cycle',source:e.target,target:e.source});
  else if(variation==='condition'||variation==='mutable')b[variation]=true;
  else if(variation==='opaque'||variation==='control')b.kind=variation;
  else if(variation==='guarded-edge')e.condition='guard';else if(variation==='iteration')e.iteration='next';
  else g.edges=g.edges.filter(x=>x!==e);
  assert.deepEqual(C.compose(g,s).publication.composition.module_columns,[],variation);
 }
});
test('widened module headers retain structured evidence rows and save/reopen preserves the exact SVG',()=>{
 const ir=columnFixture('SerialModules'),s=columnState(ir),g=E.project(ir,s),n=g.nodes.find(n=>n.label==='consume');
 n.paper.read_binding_rows=true;n.paper.captions=['Exact read: first parameter','Exact use: second argument'];
 const c=C.compose(g,s),p=c.positions.get(n.id),drawn=c.nodes.find(x=>x.id===n.id);
 assert.deepEqual(p.captions,['Exact read: first parameter','Exact use: second argument']);assert.deepEqual(drawn.paper.captions,p.captions);
 const r=R.render(ir,s);assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
});
test('ordinary crossing wires may change physical sides only after preserving bindings, goals and measured quality',()=>{
 const {fixture,state}=require('./cross-scope-fixtures.cjs'),ir=fixture({right:6,branches:3});
 const b=R.prepareFigure(ir,{...state,paperCrossScopePorts:false,paperCoupledRoutes:false}),edges=JSON.stringify(b.graph.edges);
 const a=R.prepareArchitectureTerminals(ir,{...state,paperComposition:'architecture'},b),rec=a.prepared.routing.architecture_terminal_refinement;
 assert.ok(rec.attempts.some(t=>t.accepted));assert.ok(rec.attempts.length<=8);
 assert.equal(JSON.stringify(a.graph.edges),edges);assert.deepEqual([...a.graph.positions], [...b.graph.positions]);
 assert.ok(a.prepared.quality.line_geometry.crossings<b.prepared.quality.line_geometry.crossings);assert.ok(a.prepared.quality.wire_length<=b.prepared.quality.wire_length);
 for(const t of rec.attempts.filter(t=>t.accepted))assert.ok(t.facts_preserved&&t.distinct_terminals&&t.relations_preserved&&t.direct_goals_preserved&&t.summary_goals_preserved);
 assert.deepEqual(a.graph.architecture.semantic_contracts,b.graph.architecture.semantic_contracts);
});
test('terminal trials honor manual placement, print, resource limits, opt-out and protected channels',()=>{
 const {fixture,state}=require('./cross-scope-fixtures.cjs'),ir=fixture({right:6,branches:3}),s={...state,paperComposition:'architecture'};
 for(const extra of [{paperArchitectureTerminals:false},{offsets:{l0:{x:1,y:1}}},{paperComposition:'dependency'}]){
  const b=R.prepareFigure(ir,{...state,paperCrossScopePorts:false});assert.equal(R.prepareArchitectureTerminals(ir,{...s,...extra},b),b);
 }
 for(const change of ['print','large','protected','guarded','feedback']){
  const b=R.prepareFigure(ir,{...state,paperCrossScopePorts:false});
  if(change==='print')b.prepared.quality.medium='print';else if(change==='large')b.graph.edges=Array(129).fill(b.graph.edges[0]);
  else for(const e of b.prepared.routes){if(change==='protected')e.design_route={kind:'state-interface'};
   else if(change==='guarded')e.condition={branch:'guard'};else b.graph.positions.context.feedback.add(e.id);}
  assert.equal(R.prepareArchitectureTerminals(ir,s,b),b,change);
 }
});
test('wider overview typography is declined on ordinary guarded source programs when it adds conflicts',()=>{
 const ir=read('ConditionalRead'),s={...state,paperDirection:'up',paperAdaptive:false,paperCompact:true};
 // A second independent conditional fixture exercises rejection, rather than
 // the ordinary side-routing repair that succeeds on ConditionalRead.
 const other=JSON.parse(fs.readFileSync('verification/semantic-generalization/current/ConditionalStack.json'));
 for(const input of [ir,other]){
  const a=R.render(input,s),b=R.render(input,{...s,paperArchitectureColumns:false});
  assert.ok(a.prepared.quality.line_geometry.crossings<=b.prepared.quality.line_geometry.crossings);
  assert.deepEqual(a.graph.edges,b.graph.edges);assert.deepEqual(a.graph.node_accounting,b.graph.node_accounting);
  assert.equal(R.render(a.document.ir,a.document.state).svg,a.svg);
 }
 const r=R.render(other,s);assert.equal(r.prepared.routing.architecture_column_selection.wide_selected,false);
});
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
const sensor=()=>JSON.parse(fs.readFileSync('verification/stream-alignment/current/SensorFusion.json'));
test('a repeat followed by a state cell may use the clean identical frontier despite attached-ID enumeration order',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/stage-sample-frames/current/StateStack.json'));
 const s={...state,paperCompact:true,paperAdaptive:false},raw=JSON.stringify(ir);
 const source=E.project(ir,{paperSampleFrame:true,paperReadBindingRows:true,paperSourceHeadings:true,...s,offsets:{}});
 const oldPolicy=R.render(ir,{...s,paperComposition:'dependency'});
 const dependency=R.render(ir,{paperSampleFrame:true,paperReadBindingRows:true,paperSourceHeadings:true,...s,paperComposition:'dependency'}),r=R.render(ir,s);
 // This fixture exercises the real mismatch: same partition, other order.
 assert.notDeepEqual(source.node_accounting.attached,oldPolicy.graph.node_accounting.attached);
 const partition=b=>Object.fromEntries(Object.entries(b).map(([k,ids])=>[k,ids.slice().sort()]));
 assert.deepEqual(partition(source.node_accounting),partition(dependency.graph.node_accounting));
 assert.deepEqual(partition(source.node_accounting),partition(oldPolicy.graph.node_accounting));
 assert.equal(r.graph.publication.composition.status,'fallback');
 assert.ok(r.graph.publication.composition.rejected_quality.unplaced_port_labels.length);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.deepEqual(r.graph.edges,source.edges);
 assert.deepEqual(partition(r.graph.node_accounting),partition(source.node_accounting));
 assert.deepEqual(r.graph.edge_accounting,source.edge_accounting);
 assert.deepEqual(r.graph.nodes.map(n=>[n.id,n.paper.title,n.paper.caption]),source.nodes.map(n=>[n.id,n.paper.title,n.paper.caption]));
 assert.equal(r.svg,dependency.svg);assert.equal(JSON.stringify(ir),raw);
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 const seq=r.graph.publication.inline_sequences.sequences[0],suffix=seq.remainders[0];
 assert.ok(r.graph.positions.has(suffix.node));
 const opened=R.render(ir,{...s,paperAuto:false,open:[...r.graph.publication.open,suffix.node]});
 assert.ok(suffix.instances.every(id=>opened.graph.positions.has(id)));
});
test('fallback selection for a repeated state path does not depend on model or source labels',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/stage-sample-frames/current/StateStack.json'));
 ir.title='Unfamiliar circuit';const root=ir.nodes.find(n=>n.parent==null);root.label='Unfamiliar circuit';root.source_class='Foreign';
 const r=R.render(ir,{...state,paperCompact:true,paperAdaptive:false});
 assert.equal(r.graph.publication.composition.status,'fallback');assert.deepEqual(r.prepared.quality.issues,[]);
 assert.ok(r.svg.includes('Unfamiliar circuit'));assert.ok(r.graph.nodes.some(n=>n.framework_type==='torch.nn.GRUCell'));
});
const sensorState=ir=>({...state,paperGranularity:'all',paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
test('unequal convolution and dense streams align exit-side cores and entry baselines in either direction without changing facts',()=>{
 for(const direction of ['up','down']){
  const ir=sensor(),raw=JSON.stringify(ir),s={...sensorState(ir),paperDirection:direction},g=E.project(ir,s),c=C.compose(g,s);
  assert.equal(JSON.stringify(ir),raw);assert.deepEqual(c.edges,g.edges);assert.deepEqual(c.node_accounting,g.node_accounting);assert.deepEqual(c.edge_accounting,g.edge_accounting);
  assert.equal(c.publication.composition.stream_alignments.length,1);
  const at=label=>c.positions.get(c.nodes.find(n=>n.label===label).id);
  const a=at('self.image_core'),b=at('self.vector_core'),i=at('image'),v=at('vector');
  assert.equal(direction==='up'?a.y:a.y+a.h,direction==='up'?b.y:b.y+b.h);
  assert.equal(i.y,v.y);assert.equal(at('self.image_path').y,at('self.vector_path').y);
  for(const n of c.nodes){const p=c.positions.get(n.id),parent=c.positions.get(c.idx.nodes.get(n.id).parent);if(parent){
   assert.ok(p.y>=parent.y+parent.header);assert.ok(p.y+p.h<=parent.y+parent.h);
  }}
 }
});
test('stream geometry depends on dependency structure rather than model, module labels or source names',()=>{
 const ir=sensor(),s=sensorState(ir),before=C.compose(E.project(ir,s),s);
 for(const n of ir.nodes){n.label='unfamiliar '+n.id.length;n.source=[];delete n.source_class;delete n.module_path;}
 const after=C.compose(E.project(ir,s),s);
 assert.deepEqual(after.publication.composition.stream_alignments.map(r=>r.stream),before.publication.composition.stream_alignments.map(r=>r.stream));
 assert.deepEqual(after.edges,before.edges);
});
test('stream stretching declines conditional, mutable, unknown, feedback and disconnected sibling corridors',()=>{
 for(const variation of ['condition','mutable','opaque','control','guarded-edge','iteration','feedback','cycle','disconnect']){
  const ir=sensor(),s=sensorState(ir),g=E.project(ir,s),member=g.nodes.find(n=>n.label==='lift · Linear');
  const outgoing=g.edges.find(e=>e.source===member.id),core=g.nodes.find(n=>n.label==='self.vector_core');
  if(['condition','mutable','opaque','control'].includes(variation)){
   if(variation==='condition')member.condition='guard';else if(variation==='mutable')member.mutable=true;else member.kind=variation;
  }else if(variation==='guarded-edge')outgoing.condition='guard';
  else if(variation==='iteration')outgoing.iteration='next';
  else if(variation==='feedback')outgoing.design_route={kind:'iteration-feedback'};
  else if(variation==='cycle')g.edges.push({...outgoing,id:'cycle',source:outgoing.target,target:member.id});
  else g.edges=g.edges.filter(e=>e!==outgoing);
  assert.ok(core);assert.deepEqual(C.compose(g,s).publication.composition.stream_alignments,[],variation);
 }
});
test('unordered parallel siblings are not stretched into a purported serial corridor',()=>{
 const ir=sensor(),s=sensorState(ir),g=E.project(ir,s),seed=g.nodes.find(n=>n.label==='lift · Linear');
 const edge=g.edges.find(e=>e.source===seed.id),target=edge.target;
 g.edges=g.edges.filter(e=>e!==edge);
 for(const suffix of ['one','two']){
  const n={...seed,id:seed.id+':'+suffix,label:suffix};g.nodes.push(n);g.idx.nodes.set(n.id,n);
  g.idx.children.get(n.parent).push(n.id);g.positions.set(n.id,{...g.positions.get(seed.id),id:n.id});
  g.edges.push({...edge,id:suffix+'-in',source:seed.id,target:n.id},{...edge,id:suffix+'-out',source:n.id,target});
 }
 assert.deepEqual(C.compose(g,s).publication.composition.stream_alignments,[]);
});
test('empty captions have no phantom line and saved text rows equal the actual rendered rows',()=>{
 const ir=sensor(),s=sensorState(ir),r=R.render(ir,s);
 for(const n of r.graph.nodes){const p=r.graph.positions.get(n.id);
  assert.deepEqual(p.lines,n.paper.lines);assert.deepEqual(p.captions,n.paper.captions);
  if(!n.paper.caption&&!n.paper.read_binding_rows)assert.deepEqual(p.captions,[]);
 }
 const input=r.graph.nodes.find(n=>n.label==='image');
 assert.ok(!R.nodeBody(input,r.graph.positions.get(input.id)).includes('paper-caption'));
 const before=JSON.parse(fs.readFileSync('verification/stream-alignment/current/SensorFusion-up.layout.json'));
 const up=R.render(ir,{...s,paperDirection:'up'});
 assert.ok(up.prepared.quality.native_width_px*up.prepared.quality.native_height_px<before.layout.bounds.w*before.layout.bounds.h);
 assert.deepEqual(up.prepared.quality.issues,[]);
 assert.equal(R.render(up.document.ir,up.document.state).svg,up.svg);
});
test('only redundant source-kind captions of expanded frames move to recoverable title evidence',()=>{
 const ir=sensor(),s=sensorState(ir),g=E.project(ir,s),c=C.compose(g,s),notes=c.publication.composition.source_kind_notes;
 assert.ok(notes.length);
 for(const note of notes){
  const n=c.nodes.find(n=>n.id===note.node);assert.equal(g.nodes.find(n=>n.id===note.node).paper.caption,note.caption);
  assert.equal(n.paper.caption,'');assert.deepEqual(n.paper.captions,[]);
  assert.ok(R.nodeTitle(n,c.idx).includes('Source kind: '+note.caption));
  assert.ok(R.nodeTitle(n,c.idx).includes(note.scope));assert.deepEqual(c.positions.get(n.id).source_kind_note,note);
 }
 // Proof-specific convolution captions remain on the unfamiliar model.
 const conv=c.nodes.find(n=>n.label==='self.image_core');assert.equal(conv.paper.caption,'convolutional network');
 for(const variation of ['condition','mutable','identity','observed','unknown','role','opaque']){
  const fresh=sensor(),g=E.project(fresh,sensorState(fresh)),n=g.nodes.find(n=>n.label==='self.vector_path');
  if(variation==='identity')n.identity_display={};else if(variation==='observed')n.observed_calls={observations:[]};
  else if(variation==='unknown')n.paper.unknown_count=1;else if(variation==='role')n.role_annotations=[{}];
  else if(variation==='opaque')n.kind='opaque';else n[variation]=true;
  assert.ok(!C.compose(g,s).publication.composition.source_kind_notes.some(r=>r.node===n.id),variation);
 }
});
test('streams with different proof heading lengths preserve aligned cores and inputs in both flow directions',()=>{
 const ir=sensor();
 for(const direction of ['up','down']){
  const s={...sensorState(ir),paperDirection:direction},g=E.project(ir,s),c=C.compose(g,s);
  assert.ok(c.publication.composition.stream_headings.length);
  const at=label=>c.positions.get(c.nodes.find(n=>n.label===label).id),a=at('self.image_core'),b=at('self.vector_core');
  assert.equal(direction==='up'?a.y:a.y+a.h,direction==='up'?b.y:b.y+b.h);
  assert.equal(at('image').y,at('vector').y);
  for(const n of c.nodes){const p=c.positions.get(n.id),parent=c.positions.get(c.idx.nodes.get(n.id).parent);if(parent){
   assert.ok(p.y>=parent.y+parent.header);assert.ok(p.y+p.h<=parent.y+parent.h);
  }}
  assert.deepEqual(c.edges,g.edges);
 }
});
test('independent input regions may retain natural height with exit-side alignment and exact internal geometry',()=>{
 for(const direction of ['up','down']){
  const ir=sensor(),raw=JSON.stringify(ir),s={...sensorState(ir),paperDirection:direction},g=E.project(ir,s),before=C.compose(g,s),after=C.compose(g,{...s,paperArchitectureStreams:'compact'});
  assert.equal(JSON.stringify(ir),raw);assert.deepEqual(after.edges,before.edges);assert.deepEqual(after.node_accounting,before.node_accounting);assert.deepEqual(after.edge_accounting,before.edge_accounting);
  const rec=after.publication.composition.stream_compactions;assert.equal(rec.length,1);assert.equal(after.publication.composition.stream_alignments.length,0);
  const at=(c,label)=>c.positions.get(c.nodes.find(n=>n.label===label).id),a=at(after,'self.image_path'),b=at(after,'self.vector_path');
  assert.equal(direction==='up'?a.y:a.y+a.h,direction==='up'?b.y:b.y+b.h);
  assert.notEqual(a.h,b.h);assert.equal(rec[0].removed_slack,rec[0].aligned_height-rec[0].compact_height);
  const frame=after.positions.get(rec[0].stream);assert.equal(frame.h,rec[0].compact_height);assert.ok(frame.h<before.positions.get(rec[0].stream).h);
  for(const n of after.nodes){const p=after.positions.get(n.id),owner=after.positions.get(after.idx.nodes.get(n.id).parent);if(owner){assert.ok(p.x>=owner.x&&p.x+p.w<=owner.x+owner.w);assert.ok(p.y>=owner.y+owner.header&&p.y+p.h<=owner.y+owner.h);}}
 }
});
test('natural input-region height is selected only after whole-figure measurement and retains save/reopen',()=>{
 for(const direction of ['up','down']){
  const ir=sensor(),s={...sensorState(ir),paperDirection:direction},r=R.render(ir,s),b=R.render(ir,{...s,paperArchitectureStreams:'aligned'}),receipt=r.prepared.routing.architecture_stream_selection;
  assert.equal(receipt.max_trials,1);assert.ok(receipt.accepted);assert.ok(receipt.facts_preserved&&receipt.goals_preserved&&receipt.relations_preserved);
  assert.ok(r.prepared.quality.wire_length<=b.prepared.quality.wire_length);assert.equal(r.prepared.quality.line_geometry.crossings,b.prepared.quality.line_geometry.crossings);
  assert.deepEqual(r.graph.edges,b.graph.edges);assert.deepEqual(r.document.ir,ir);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
  assert.ok(receipt.candidate.frame_area<receipt.before.frame_area);assert.deepEqual(r.prepared.quality.issues,[]);
 }
});
test('input-region compaction depends on geometry and entry provenance, not names or source family',()=>{
 const ir=sensor(),s=sensorState(ir),a=C.compose(E.project(ir,s),{...s,paperArchitectureStreams:'compact'});
 for(const n of ir.nodes){n.label='foreign';n.source=[];delete n.source_class;delete n.module_path;}ir.title='Other';
 const b=C.compose(E.project(ir,s),{...s,paperArchitectureStreams:'compact'});
 assert.deepEqual(b.publication.composition.stream_compactions.map(r=>r.stream),a.publication.composition.stream_compactions.map(r=>r.stream));assert.deepEqual(a.edges,b.edges);
});
test('manual placements and explicit aligned policy keep existing input-region choices',()=>{
 const ir=sensor(),s=sensorState(ir),g=E.project(ir,s);
 assert.deepEqual(C.compose(g,{...s,paperArchitectureStreams:'aligned'}).publication.composition.stream_compactions,[]);
 assert.deepEqual(C.compose(g,{...s,paperArchitectureStreams:'compact',offsets:{[ir.nodes[0].id]:{x:1,y:2}}}).publication.composition.stream_compactions,[]);
 const r=R.render(ir,{...s,paperArchitectureStreams:'aligned'});assert.equal(r.prepared.routing.architecture_stream_selection,undefined);
});
const sharedInput=()=>JSON.parse(fs.readFileSync('verification/input-placement/current/SharedInputPaths.json'));
test('multiply used ordinary source input moves only inside its existing vacant owner with shorter measured wire',()=>{
 const ir=sharedInput(),s={...columnState(ir),paperDirection:'down'},raw=JSON.stringify(ir),r=R.render(ir,s),b=R.render(ir,{...s,paperArchitectureInputs:false}),rec=r.prepared.routing.architecture_input_placement;
 assert.equal(JSON.stringify(ir),raw);assert.equal(rec.max_inputs,3);assert.equal(rec.max_positions_per_input,3);assert.equal(rec.selected.length,1);assert.ok(rec.attempts.length<=9);
 assert.deepEqual(r.graph.edges,b.graph.edges);assert.deepEqual(r.graph.node_accounting,b.graph.node_accounting);assert.deepEqual(r.graph.edge_accounting,b.graph.edge_accounting);assert.deepEqual(r.document.architecture,b.document.architecture);
 assert.ok(r.prepared.quality.wire_length<b.prepared.quality.wire_length*.6);assert.equal(r.prepared.quality.line_geometry.crossings,0);assert.deepEqual(r.prepared.quality.issues,[]);
 const moved=new Set(rec.selected.map(x=>x.node));
 for(const n of r.graph.nodes){const a=r.graph.positions.get(n.id),old=b.graph.positions.get(n.id);assert.equal(a.font,old.font);assert.equal(a.w,old.w);assert.equal(a.h,old.h);
  if(!moved.has(n.id))assert.deepEqual(a,old);
 }
 for(const x of rec.selected){const p=r.graph.positions.get(x.node),owner=r.graph.positions.get(x.owner);
  assert.ok(x.facts_preserved&&x.direct_goals_preserved&&x.summary_goals_preserved&&x.relations_preserved);assert.equal(r.graph.idx.nodes.get(x.node).parent,x.owner);
  assert.ok(p.x>=owner.x+18&&p.x+p.w<=owner.x+owner.w-18&&p.y>=owner.y+owner.header&&p.y+p.h<=owner.y+owner.h-18);
  assert.deepEqual(x.uses,r.graph.edges.filter(e=>e.source===x.node).map(e=>e.id));
 }
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
});
test('shorter input placement with added crossings is rejected and the prior SVG is retained exactly',()=>{
 const ir=sharedInput(),s={...columnState(ir),paperDirection:'up'},r=R.render(ir,s),b=R.render(ir,{...s,paperArchitectureInputs:false}),rec=r.prepared.routing.architecture_input_placement;
 assert.equal(rec.selected.length,0);assert.ok(rec.attempts.some(x=>x.candidate.wire_length<x.before.wire_length&&x.candidate.crossings>x.before.crossings));assert.equal(r.svg,b.svg);
});
test('shared input geometry uses identity and real uses independently of names and family annotations',()=>{
 const ir=sharedInput(),s={...columnState(ir),paperDirection:'down'},a=R.render(ir,s);
 for(const n of ir.nodes){n.label='Foreign';n.source=[];delete n.source_class;delete n.module_path;}ir.title='Other';
 const b=R.render(ir,s);assert.deepEqual(b.prepared.routing.architecture_input_placement.selected.map(x=>x.node),a.prepared.routing.architecture_input_placement.selected.map(x=>x.node));assert.deepEqual(b.graph.edges,a.graph.edges);
});
test('guarded, mutable, identity-bearing and runtime evidence inputs retain their existing placement policy',()=>{
 for(const variant of ['condition','mutable','identity_display','runtime_evidence','evidence_status']){
  const ir=sharedInput(),input=ir.nodes.find(n=>n.kind==='interface'&&n.label==='context');assert.ok(input);
  input[variant]=variant==='evidence_status'?'runtime-only':variant==='runtime_evidence'?[{call:'observed'}]:variant==='identity_display'?{kind:'same-object-calls',label:'shared',invocation:1,count:2}:true;
  const s={...columnState(ir),paperDirection:'down'},r=R.render(ir,s);assert.ok(!r.prepared.routing.architecture_input_placement?.attempts.some(x=>x.node===input.id),variant);
 }
});
test('manual positions, explicit input opt-out and one-use inputs do not enter the shared input search',()=>{
 const ir=sharedInput(),s={...columnState(ir),paperDirection:'down'};
 for(const extra of [{paperArchitectureInputs:false},{offsets:{[ir.nodes[0].id]:{x:2,y:3}}}])assert.equal(R.render(ir,{...s,...extra}).prepared.routing.architecture_input_placement,undefined);
 const r=R.render(ir,s),nodes=new Map(r.graph.nodes.map(n=>[n.id,n]));for(const x of r.prepared.routing.architecture_input_placement.attempts){assert.equal(nodes.get(x.node).label,'context');assert.ok(x.uses.length>=2);}
});
