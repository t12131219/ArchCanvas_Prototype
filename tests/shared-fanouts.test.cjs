'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const fs=require('node:fs');
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:['root']};
function fixture(){
 const nodes=[['root',null,'composite'],['s','root','compute'],...['a','b','c','out'].map(id=>[id,'root','compute'])].map(([id,parent,kind])=>({id,parent,kind,label:id,operator:'foreign',source:[],runtime_evidence:[]}));
 const edges=[...['a','b','c'].map(target=>['s',target]),...['a','b','c'].map(source=>[source,'out'])].map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'arg:'+i,kind:'data',evidence:'source-dependency'}));
 const ir={schema:'archcanvas-source-semantic/2',title:'Unnamed distribution',nodes,edges,motifs:[]},first=E.project(ir,{...state,view:'publication'}),g=E.project(ir,{...state,view:'publication',open:first.architecture.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
 const slots={root:[0,0,1100,1100],s:[450,100,180,64],a:[150,700,180,64],b:[450,700,180,64],c:[750,700,180,64],out:[450,950,180,64]};
 g.nodes=g.nodes.filter(n=>slots[n.id]).map(n=>({...n,parent:n.id==='root'?null:'root'}));
 g.idx=E.index({nodes:g.nodes,edges:g.edges});
 for(const id of [...g.positions.keys()])if(!slots[id])g.positions.delete(id);
 g.positions.context.idx=g.idx;
 for(const [id,[x,y,w,h]]of Object.entries(slots))Object.assign(g.positions.get(id),{x,y,w,h});
 g.bounds={x:-24,y:-24,w:1148,h:1148};
 return {ir,baseline:{graph:g,prepared:R.prepare(g)}};
}
const shape=r=>({nodes:r.graph.nodes,edges:r.graph.edges,positions:[...r.graph.positions],ir:r.graph.architecture,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting});
test('one resolved output shares a marked stem while all original uses and physical terminals survive',()=>{
 const {ir,baseline:a}=fixture(),raw=JSON.stringify(shape(a)),b=R.prepareSharedFanouts(ir,state,a),rec=b.prepared.routing.shared_fanout_refinement;
 assert.equal(rec.selected.length,1);assert.ok(rec.selected[0].ink_candidate<rec.selected[0].ink_before*.8);
 assert.equal(JSON.stringify(shape(b)),raw);assert.equal(JSON.stringify(shape(a)),raw);
 assert.ok(b.prepared.quality.wire_length>a.prepared.quality.wire_length);
 assert.ok(b.prepared.quality.wire_length-a.prepared.quality.wire_length<=rec.selected[0].terminal_detour_budget+.1);
 const before=new Map(a.prepared.routes.map(e=>[e.id,e]));
 for(const e of b.prepared.routes){const p=before.get(e.id);assert.deepEqual([e.route.points[0],e.route.points.at(-1)],[p.route.points[0],p.route.points.at(-1)]);assert.deepEqual({...e,route:null},{...p,route:null});}
 const saved=R.renderPrepared(ir,state,b);assert.ok(saved.svg.includes('paper-fanout-junction'));assert.equal(saved.document.layout.shared_fanouts.length,1);
 assert.equal(R.prepareSharedFanouts(ir,state,b),b);
});
test('different output slots or resolved values never become a shared value',()=>{
 for(const patch of [{source_port:'other'},{resolved_source:'other'},{source:'b'}]){
  const {baseline:a}=fixture();Object.assign(a.prepared.routes[0],patch);Object.assign(a.prepared.routes[1],{resolved_source:'third'});
  assert.equal(L.sharedFanouts(a.graph.positions,a.prepared.routes).length,0);
 }
});
test('conditional, state, feedback, contextual, bundled and labelled uses are excluded individually',()=>{
 for(const patch of [{condition:{branch:'guard',outcome:'true'}},{iteration:{loop:'foreign'}},{kind:'state-read'},
  {context_lane:{owner:'root'}},{design_route:{kind:'bypass'}},{layout_after:'root'},{bundle_members:[]},{paper_labels:[{text:'condition'}]}]){
  const {baseline:a}=fixture();for(const e of a.prepared.routes.filter(e=>e.source==='s'))Object.assign(e,patch);
  assert.equal(L.sharedFanouts(a.graph.positions,a.prepared.routes).length,0,JSON.stringify(patch));
 }
});
test('unknown consumer boundaries remain real endpoints and source identity is not duplicated',()=>{
 const {ir,baseline:a}=fixture();a.graph.idx.nodes.get('a').kind='opaque';
 const b=R.prepareSharedFanouts(ir,state,a);assert.equal(b.prepared.routing.shared_fanout_refinement.selected.length,1);
 assert.equal(b.graph.idx.nodes.get('a').kind,'opaque');assert.deepEqual(shape(b),shape(a));
 for(const patch of [{mutable:true},{kind:'state'},{condition:{branch:'guard'}},{evidence_status:'runtime-only'}]){
  const {baseline:a}=fixture();Object.assign(a.graph.idx.nodes.get('s'),patch);assert.equal(L.sharedFanouts(a.graph.positions,a.prepared.routes).length,0);
 }
});
test('concrete obstacles block a shared stem even when independent paths remain valid',()=>{
 const {ir,baseline:a}=fixture();const p=a.graph.positions.get('b');a.graph.positions.set('obstacle',{...p,id:'obstacle',x:530,y:250,w:30,h:100});
 a.graph.idx.nodes.set('obstacle',{id:'obstacle',parent:'root',kind:'opaque'});
 assert.equal(R.prepareSharedFanouts(ir,state,a),a);
});
test('expanded titles are pass-through while unrelated bodies block the stem',()=>{
 for(const [y,header,expected]of [[660,60,true],[600,40,false]]){
  const {baseline:a}=fixture();a.graph.positions.set('frame',{id:'frame',x:300,y,w:100,h:150,expanded:true,header});
  a.graph.idx.nodes.set('frame',{id:'frame',parent:'root',kind:'composite'});
  // The shared stem must lie only in the header to be eligible.
  assert.equal(L.sharedFanouts(a.graph.positions,a.prepared.routes).length>0,expected);
 }
});
test('shared ink and junction degree distinguish a true fork from a two-segment bend',()=>{
 const mk=points=>({source:'s',resolved_source:'s',source_port:'out',route:{points:points.map(([x,y])=>({x,y}))}});
 const a=mk([[0,0],[0,20],[20,20],[20,40]]),b=mk([[0,0],[0,20],[-20,20],[-20,40]]);
 assert.equal(L.fanoutInk([a,b]),100);assert.deepEqual(L.fanoutJunctions([a,b]),[{x:0,y:20}]);
 assert.deepEqual(L.fanoutJunctions([a]),[]);
});
test('existing labels remain fixed and a stem crossing one is rejected',()=>{
 const {ir,baseline:a}=fixture(),label={x:530,y:400,w:60,h:23,text:'retained',edge:'e3'};
 a.prepared=R.evaluateRoutes(a.graph,a.prepared.routes,a.prepared.quality.route_strategy,{placed:[label],suppressed:[]});
 const b=R.prepareSharedFanouts(ir,state,a);assert.equal(b,a);
 assert.deepEqual(b.prepared.labeling.placed,[label]);assert.ok(b.prepared.routing.shared_fanout_refinement.attempts.every(r=>!r.accepted&&!r.existing_labels_clear));
});
test('names cannot select the rule; manual geometry, print and opt-out remain respected',()=>{
 const {ir,baseline:a}=fixture(),first=L.sharedFanouts(a.graph.positions,a.prepared.routes);
 for(const n of a.graph.nodes){n.label='Unseen';n.source_class='Arbitrary';n.case='foreign';}
 assert.deepEqual(L.sharedFanouts(a.graph.positions,a.prepared.routes),first);
 for(const extra of [{paperSharedFanouts:false},{offsets:{s:{x:1,y:0}}},{paperProtectFrameTitles:true}])assert.equal(R.prepareSharedFanouts(ir,{...state,...extra},a),a);
 a.prepared.quality.medium='print';assert.equal(R.prepareSharedFanouts(ir,state,a),a);
});
test('default full rendering and saved folding restore deterministic evidence',()=>{
 const {ir}=fixture(),a=R.render(ir,state),folded=R.render(ir,{...state,open:[]}),b=R.render(a.document.ir,a.document.state);
 assert.ok(folded.graph.nodes.length<a.graph.nodes.length);assert.equal(a.svg,b.svg);assert.deepEqual(a.document.ir,ir);
});
test('different source values get separate measured rails in unfamiliar, unknown, shared and mutable programs',()=>{
 for(const name of ['UnseenDistribution','InterruptedDistribution','ConditionalDistribution','SharedDistribution','MutableDistribution']){
  const ir=JSON.parse(fs.readFileSync('verification/shared-fanouts/current/'+name+'.json'));
  const s={...state,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)},a=R.render(ir,{...s,paperSharedFanouts:false}),b=R.render(ir,s);
  const selected=b.document.layout.shared_fanouts||[];
  if(name==='UnseenDistribution'||name==='MutableDistribution'){
   assert.equal(selected.length,2);assert.notEqual(selected[0].fork,selected[1].fork);assert.notEqual(selected[0].resolved_source,selected[1].resolved_source);
  }else if(name!=='ConditionalDistribution')assert.ok(selected.length);
  assert.deepEqual(b.document.ir,ir);assert.deepEqual(b.document.architecture,a.document.architecture);
  assert.deepEqual(b.graph.node_accounting,a.graph.node_accounting);assert.deepEqual(b.graph.edge_accounting,a.graph.edge_accounting);
  assert.deepEqual(b.document.expression_coverage,a.document.expression_coverage);
  assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings);
  assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 }
});
module.exports={fixture,state};

function oriented(direction){
 const f=fixture(),g=f.baseline.graph,points={down:p=>({...p}),up:p=>({x:p.x,y:1100-p.y}),
  right:p=>({x:p.y,y:1100-p.x}),left:p=>({x:1100-p.y,y:p.x})},turn=points[direction];
 const sides={down:{bottom:'bottom',top:'top'},up:{bottom:'top',top:'bottom'},right:{bottom:'right',top:'left'},left:{bottom:'left',top:'right'}}[direction];
 for(const p of g.positions.values()){
  const corners=[turn(p),turn({x:p.x+p.w,y:p.y+p.h})];
  Object.assign(p,{x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),w:Math.abs(corners[0].x-corners[1].x),h:Math.abs(corners[0].y-corners[1].y)});
 }
 const routes=f.baseline.prepared.routes.map(e=>({...e,route:{...e.route,source_side:sides[e.route.source_side],target_side:sides[e.route.target_side],points:e.route.points.map(turn)}}));
 f.baseline.prepared=R.evaluateRoutes(g,routes,f.baseline.prepared.quality.route_strategy,{placed:[],suppressed:[]});return f;
}
for(const direction of ['up','down','left','right'])test('generic architecture trunks keep exact terminals and marked value identity toward '+direction,()=>{
 const {ir,baseline:a}=oriented(direction),raw=JSON.stringify(shape(a)),s={...state,paperComposition:'architecture'},b=R.prepareSharedFanouts(ir,s,a),rec=b.prepared.routing.shared_fanout_refinement;
 assert.ok(rec.selected.length,direction);assert.equal(JSON.stringify(shape(b)),raw);
 const old=new Map(a.prepared.routes.map(e=>[e.id,e]));
 for(const e of b.prepared.routes){const before=old.get(e.id);assert.deepEqual([e.route.points[0],e.route.points.at(-1)],[before.route.points[0],before.route.points.at(-1)]);
  assert.deepEqual({...e,route:null},{...before,route:null});
  for(let i=1;i<e.route.points.length;i++)assert.ok(e.route.points[i].x===e.route.points[i-1].x||e.route.points[i].y===e.route.points[i-1].y);
 }
 assert.ok(rec.attempts.filter(r=>r.accepted).every(r=>r.summary_goals_preserved));
 assert.ok(rec.selected.every(r=>r.ink_candidate<=r.ink_before*.8));
 const saved=R.renderPrepared(ir,s,b);assert.equal(saved.document.layout.shared_fanouts.length,rec.selected.length);
 assert.match(saved.svg,/paper-fanout-junction/);
});
test('side trunks retain different consumer detours around a real intervening operation',()=>{
 const {ir,baseline:a}=oriented('right'),g=a.graph,es=a.prepared.routes.filter(e=>e.source==='s');
 // The middle consumer blocks a straight entry into the farther consumer.
 const targets=es.map(e=>e.target).sort((a,b)=>g.positions.get(a).y-g.positions.get(b).y);
 for(const [i,id] of targets.entries())Object.assign(g.positions.get(id),{x:i===0?650:950,y:180+i*270,w:180,h:64});
 Object.assign(g.positions.get('out'),{x:1250,y:900});
 const fresh=a.prepared.routes.map(e=>{
  if(e.source!=='s')return e;
  const index=es.findIndex(x=>x.id===e.id),s=e.route.points[0],p=g.positions.get(e.target),t={x:p.x,y:p.y+32},rail=480+index*16,exit=p.y-32;
  return {...e,route:{...e.route,points:[s,{x:rail,y:s.y},{x:rail,y:exit},{x:t.x-16,y:exit},{x:t.x-16,y:t.y},t]}};
 });
 // The trunk generator checks all concrete bodies, even when the rest of
 // this deliberately isolated geometry fixture is not being recomposed.
 const proposals=L.architectureFanouts(g.positions,fresh).filter(r=>r.method==='side-output-trunk');assert.ok(proposals.length);
 for(const p of proposals)for(const e of p.routes){const before=fresh.find(x=>x.id===e.id);
  assert.deepEqual(e.route.points.slice(-3),before.route.points.slice(-3));
  assert.ok(e.route.points.every((b,i,ps)=>!i||!L.blocked(ps[i-1],b,L.routeObstacles(e,g.positions))));
 }
});
test('architecture trunks reject guarded sources, changed slots, labelled uses and unrelated junction contacts',()=>{
 for(const patch of [{condition:{branch:'guard'}},{mutable:true},{kind:'state'},{kind:'opaque'},{evidence_status:'runtime-only'}]){
  const {baseline:a}=oriented('up');Object.assign(a.graph.idx.nodes.get('s'),patch);assert.equal(L.architectureFanouts(a.graph.positions,a.prepared.routes).length,0);
 }
 for(const patch of [{source_port:'other'},{resolved_source:'other'},{condition:{branch:'guard'}},{paper_labels:[{text:'retained'}]}]){
  const {baseline:a}=oriented('up'),es=a.prepared.routes.filter(e=>e.source==='s');Object.assign(es[0],patch);Object.assign(es[1],{source_port:'third'});
  assert.equal(L.architectureFanouts(a.graph.positions,a.prepared.routes).length,0);
 }
 const {ir,baseline:a}=oriented('up'),proposal=L.architectureFanouts(a.graph.positions,a.prepared.routes)[0],dot=proposal.junctions[0],other=a.prepared.routes.find(e=>e.source!=='s');
 other.route.points=[{x:dot.x-10,y:dot.y},{x:dot.x+10,y:dot.y}];
 a.prepared=R.evaluateRoutes(a.graph,a.prepared.routes,a.prepared.quality.route_strategy,{placed:[],suppressed:[]});
 const b=R.prepareSharedFanouts(ir,{...state,paperComposition:'architecture'},a);
 assert.ok(!b.prepared.routing.shared_fanout_refinement.selected.length);
 assert.ok(b.prepared.routing.shared_fanout_refinement.attempts.some(r=>!r.junctions_clear));
});
test('one collapsed consumer can keep distinct operand terminals on a shared output stem',()=>{
 const {baseline:a}=oriented('up'),es=a.prepared.routes.filter(e=>e.source==='s');
 const boxes=es.map(e=>a.graph.positions.get(e.target)),target=es[0].target,p=a.graph.positions.get(target);
 Object.assign(p,{x:Math.min(...boxes.map(p=>p.x)),w:Math.max(...boxes.map(p=>p.x+p.w))-Math.min(...boxes.map(p=>p.x))});
 for(const e of es)if(e.target!==target)a.graph.positions.delete(e.target);
 for(const e of es)e.target=es[0].target;
 const proposals=L.architectureFanouts(a.graph.positions,es);assert.ok(proposals.length);
 const r=proposals[0];assert.equal(new Set(r.routes.map(e=>JSON.stringify(e.route.points.at(-1)))).size,3);
});
test('an unfamiliar source program gains a side trunk only when actual crossing and ink measurements justify it',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/architecture-trunks/current/ContextWeaver.json')),raw=JSON.stringify(ir),
  s={...state,paperGranularity:'all',paperComposition:'architecture',paperCompact:false,paperDirection:'up',open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
 const a=R.render(ir,{...s,paperSharedFanouts:false}),b=R.render(ir,s),rec=b.prepared.routing.shared_fanout_refinement;
 assert.ok(rec.selected.some(r=>r.method==='side-output-trunk'&&r.side==='left'));
 assert.ok(rec.attempts.some(r=>r.accepted&&!r.ink_gain&&r.crossing_gain));
 assert.ok(b.prepared.quality.line_geometry.crossings<a.prepared.quality.line_geometry.crossings);
 for(const k of ['ir','architecture','publication','expression_goals','expression_coverage','summary_goals','summary_coverage'])assert.deepEqual(a.document[k],b.document[k]);
 for(const k of ['nodes','bounds','labels','node_accounting','edge_accounting'])assert.deepEqual(a.document.layout[k],b.document.layout[k]);
 const old=new Map(a.prepared.routes.map(e=>[e.id,e]));
 for(const e of b.prepared.routes){const before=old.get(e.id);assert.deepEqual([e.route.points[0],e.route.points.at(-1)],[before.route.points[0],before.route.points.at(-1)]);assert.deepEqual({...e,route:null},{...before,route:null});}
 assert.equal(JSON.stringify(ir),raw);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 for(const n of ir.nodes){n.class_name='Transformer';n.source_class='RecurrentNetwork';}
 assert.deepEqual(R.render(ir,s).document.layout.shared_fanouts,b.document.layout.shared_fanouts);
});
