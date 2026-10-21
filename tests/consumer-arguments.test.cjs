'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js'),I=require('../semantic_studio/invocation-inputs.js');
function scene({right=false}={}){
 const nodes=[{id:'root',parent:null,kind:'composite'},{id:'fixed',parent:'root',kind:'interface',role:'input'},{id:'consumer',parent:'root',kind:'compute'}];
 const positions=new Map([{id:'root',x:0,y:0,w:800,h:700,header:70,expanded:true},{id:'fixed',x:40,y:90,w:120,h:40},
  {id:'consumer',x:right?200:400,y:500,w:160,h:70}].map(n=>[n.id,n]));
 const edge={id:'use',source:'fixed',target:'consumer',source_port:'out',target_port:'kw:flag',kind:'control'};
 positions.context={idx:{nodes:new Map(nodes.map(n=>[n.id,n]))},edges:[edge],feedback:new Set(),fixedInputs:[],inputDocks:[],contextLanes:[]};
 return {positions,edge,literals:new Map([['fixed',{value:false}]])};
}
for(const side of ['left','right'])test('fixed input moves beside the consumer on '+side+' without changing topology',()=>{
 const {positions,edge,literals}=scene(),original=JSON.stringify([...positions]),frozen=JSON.stringify(edge);
 const p=L.consumerArguments(positions,literals,side);assert.equal(p.records.length,1);const row=p.records[0];assert.equal(row.side,side);
 assert.equal(JSON.stringify([...positions]),original);assert.equal(JSON.stringify(edge),frozen);
 assert.deepEqual(p.positions.get('root'),positions.get('root'));assert.deepEqual(p.positions.get('consumer'),positions.get('consumer'));
 assert.ok(p.positions.get('fixed').y>400);assert.equal(row.edges[0].target_port,'kw:flag');
});
test('unproved inputs, other consumers, incoming edges, expanded consumers and established placement are excluded',()=>{
 for(const alter of [s=>s.literals.clear(),s=>s.positions.context.edges.push({...s.edge,id:'other',target:'root'}),
  s=>s.positions.context.edges.push({...s.edge,id:'in',source:'root',target:'fixed'}),s=>s.positions.get('consumer').expanded=true,
  s=>s.positions.context.fixedInputs.push({nodes:['fixed']}),s=>s.positions.context.inputDocks.push({node:'fixed'}),
  s=>s.positions.context.feedback.add('use'),s=>s.positions.context.idx.nodes.get('consumer').parent='another']){
  const s=scene();alter(s);assert.deepEqual(L.consumerArguments(s.positions,s.literals).records,[]);
 }
});
test('conditions, iteration, state/design channels and guarded bundled uses retain their routing policy',()=>{
 for(const extra of [{condition:{branch:'if'}},{iteration:{step:1}},{design_route:{kind:'state-interface'}},{context_lane:{owner:'root'}},{layout_after:'root'},
  {kind:'state-write'},...['condition','iteration','design_route','context_lane','layout_after'].map(k=>({bundle_members:[{kind:'data',[k]:true}]}))]){
  const s=scene();Object.assign(s.edge,extra);assert.deepEqual(L.consumerArguments(s.positions,s.literals).records,[],JSON.stringify(extra));
 }
});
test('available space, parent title, gutters and concrete obstacles constrain placement',()=>{
 for(const change of ['narrow','body','title','lane']){
  const s=scene(),p=s.positions.get('root'),b=s.positions.get('consumer');
  if(change==='narrow'){p.w=220;b.x=40;}
  if(change==='body'){s.positions.set('left-wall',{id:'left-wall',x:200,y:480,w:180,h:100});s.positions.set('right-wall',{id:'right-wall',x:580,y:480,w:180,h:100});}
  if(change==='title'){p.header=580;}
  if(change==='lane'){p.design_gutter=380;p.context_gutter=350;s.positions.context.contextLanes=[{owner:'root',side:'right'}];}
  assert.deepEqual(L.consumerArguments(s.positions,s.literals).records,[],change);
 }
});
const read=name=>JSON.parse(fs.readFileSync('verification/consumer-arguments/current/'+name+'.json'));
const state=ir=>({paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false,paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,edges:r.graph.edges,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,coverage:r.document.expression_coverage});
test('source-derived mixed conditional and unknown computations retain facts while late fixed inputs become shorter',()=>{
 // Isolate the consumer move from final narrow-band compaction.
 const ir=read('MixedChoices'),original=JSON.stringify(ir),s={...state(ir),paperResidualBands:false},a=R.render(ir,{...s,paperConsumerArguments:false}),b=R.render(ir,s),rec=b.prepared.routing.consumer_argument_refinement;
 assert.ok(rec.selected.length===2&&rec.attempts.length<=2);assert.deepEqual(facts(b),facts(a));assert.equal(JSON.stringify(ir),original);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length*.8);assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings);
 const moved=new Set(rec.selected.map(r=>r.node));for(const [id,p]of a.graph.positions)if(!moved.has(id))assert.deepEqual(b.graph.positions.get(id),p);
 assert.ok(rec.selected.some(r=>b.graph.idx.nodes.get(r.target).kind==='opaque'));assert.ok(rec.selected.some(r=>b.graph.idx.nodes.get(r.target).semantic_type==='conditional-collection'));
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
for(const name of ['LateChoice','DynamicChoice','GuardedChoice'])test(name+' retains the baseline when geometry or fixed-value evidence is unavailable',()=>{
 const ir=read(name),s=state(ir),a=R.render(ir,{...s,paperConsumerArguments:false}),b=R.render(ir,s);
 assert.deepEqual(facts(a),facts(b));assert.equal(a.svg,b.svg);
 if(name!=='LateChoice')assert.equal(I.compile(ir).size,0);
});
test('print, manual offsets and explicit opt-out bypass automatic staging',()=>{
 const ir=read('MixedChoices'),s=state(ir);
 for(const extra of [{paperConsumerArguments:false},{paperMedium:'print'},{offsets:{[ir.nodes[0].id]:{x:4,y:0}}}])assert.equal(R.render(ir,{...s,...extra}).prepared.routing.consumer_argument_refinement,undefined);
});
test('family and label changes do not select this geometry primitive',()=>{
 const {positions,literals}=scene(),a=L.consumerArguments(positions,literals);
 for(const n of positions.context.idx.nodes.values()){n.label='Unseen operation';n.class_name='Foreign';n.operator='unknown';}
 assert.deepEqual(L.consumerArguments(positions,literals).records,a.records);
});
test('selected-route opt-out is respected during consumer placement trials',()=>{
 const ir=read('MixedChoices'),r=R.render(ir,{...state(ir),paperSelectedRoutes:false});
 assert.ok(r.prepared.routing.consumer_argument_refinement?.attempts.length);assert.equal(r.prepared.routing.selected_route_refinement,undefined);
});
