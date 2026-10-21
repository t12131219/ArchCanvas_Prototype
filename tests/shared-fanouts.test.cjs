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
