'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../semantic_studio/architecture-layout.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js'),C=require('../semantic_studio/relation-constraints.js');
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'s',kind:'interface',parent:'root'},
  {id:'branch',kind:'composite',parent:'root'},{id:'one',kind:'compute',parent:'branch'},
  {id:'two',kind:'compute',parent:'branch'},{id:'join',kind:'compute',parent:'root'}].map(n=>({...n,label:n.id,source:[],paper:{font:16,lines:[n.id],captions:[]}}));
 const edge={id:'skip',source:'s',target:'join',kind:'data',source_port:'out',target_port:'0',resolved_source:'s',canonical_source:'s',canonical_target:'join',originals:['skip'],paper_labels:[],design_route:{kind:'bypass',certificate:'proof',owner:'root'}};
 const certificate={id:'proof',rule:'fixture-local-relation',roles:{skip:'s',skip_slot:'out',add:'join',branch_path:['one','two']}};
 const ir={nodes,edges:[{...edge}]},idx=E.index(ir),positions=new Map([
  {id:'root',x:0,y:0,w:900,h:1000,expanded:true,header:70,design_gutter:70},
  {id:'s',x:450,y:100,w:100,h:60},{id:'branch',x:420,y:300,w:220,h:300,expanded:true,header:70},
  {id:'one',x:470,y:390,w:100,h:60},{id:'two',x:470,y:500,w:100,h:60},{id:'join',x:450,y:700,w:100,h:60}
 ].map(p=>[p.id,p]));
 positions.context={idx,edges:[edge],feedback:new Set(),compoundAlignments:[],branchColumns:[],contextLanes:[],inputDocks:[],fixedInputs:[]};
 const plan={nodes,edges:[edge],semantic_contracts:[certificate],design_constraints:[{kind:'bypass',certificate:'proof',...certificate.roles}]};
 const receipts=C.project(plan,[edge],id=>id,{});C.evaluate(receipts,positions,[edge]);
 const graph={nodes,edges:[edge],idx,positions,architecture:plan,representatives:Object.fromEntries(nodes.map(n=>[n.id,n.id])),constraint_receipts:receipts,
  publication:{medium:'canvas',open:['root','branch'],paper_width_mm:180,canvas_limits:{width_px:2000,height_px:2000,area_px2:4e6,nodes:128,edges:128}},bounds:{x:-28,y:-30,w:956,h:1088}};
 const route=L.route(edge,positions),baseline={graph,prepared:{...R.evaluateRoutes(graph,[{...edge,route}],'canonical-short'),routing:{}}};
 return {ir,baseline};
}
test('local bypass encloses the proved branch, retaining source owner, exact operands and terminals',()=>{
 const {ir,baseline:b}=fixture(),facts=JSON.stringify({ir,nodes:b.graph.nodes,edges:b.graph.edges,positions:[...b.graph.positions]}),r=R.prepareLocalBypasses(ir,{},b);
 assert.equal(JSON.stringify({ir,nodes:r.graph.nodes,edges:r.graph.edges,positions:[...r.graph.positions]}),facts);
 assert.ok(r.prepared.quality.wire_length<b.prepared.quality.wire_length*.6);
 const before=b.prepared.routes[0],after=r.prepared.routes[0];assert.deepEqual([after.route.points[0],after.route.points.at(-1)],[before.route.points[0],before.route.points.at(-1)]);
 assert.equal(after.design_route.owner,'root');assert.equal(r.graph.constraint_receipts[0].consumption,'local-bypass-lane');assert.equal(r.graph.constraint_receipts[0].status,'applied');
 assert.deepEqual(r.graph.positions.context.localBypassScopes[0].frontier,['branch']);assert.equal(b.graph.positions.context.localBypassScopes,undefined);
 assert.deepEqual(R.prepareLocalBypasses(ir,{},fixture().baseline).prepared.routes,r.prepared.routes);
});
test('names and unrelated outer wrappers do not replace branch evidence',()=>{
 const {baseline:b}=fixture(),edge=b.graph.edges[0],a=L.localBypassScope(b.graph,edge);
 for(const n of b.graph.nodes){n.label='unseen';n.source_class='not-a-model-family';}
 assert.deepEqual(L.localBypassScope(b.graph,edge),a);
 b.graph.representatives.one='root';assert.equal(L.localBypassScope(b.graph,edge),null);
});
test('missing witnesses, conditional paths, state, mutable and unknown branch operations keep the outer lane',()=>{
 for(const patch of [{kind:'opaque'},{kind:'state'},{kind:'buffer'},{kind:'control'},{mutable:true},{condition:{branch:'choice'}},{operator:'phi'}]){
  const {ir,baseline:b}=fixture();Object.assign(b.graph.idx.nodes.get('one'),patch);assert.equal(R.prepareLocalBypasses(ir,{},b),b);
 }
 const {baseline:b}=fixture();delete b.graph.representatives.two;assert.equal(L.localBypassScope(b.graph,b.graph.edges[0]),null);
});
test('slots, canonical join, source identity and edge boundaries must match the certificate exactly',()=>{
 for(const patch of [{source_port:'slot:2'},{resolved_source:'other'},{canonical_target:'other'},{condition:{branch:'c'}},{iteration:{}},{bundle_members:[]},{kind:'state-write'},{context_lane:{}}]){
  const {baseline:b}=fixture();Object.assign(b.graph.edges[0],patch);assert.equal(L.localBypassScope(b.graph,b.graph.edges[0]),null);
 }
 const {baseline:b}=fixture();b.graph.architecture.semantic_contracts=[];assert.equal(L.localBypassScope(b.graph,b.graph.edges[0]),null);
});
test('an unrelated concrete obstacle blocks all local proposals without losing the outer route',()=>{
 const {ir,baseline:b}=fixture(),n={id:'obstacle',parent:'root',kind:'opaque'};
 b.graph.idx.nodes.set(n.id,n);b.graph.positions.set(n.id,{id:n.id,x:360,y:180,w:60,h:500});
 const r=R.prepareLocalBypasses(ir,{},b);assert.equal(r,b);assert.equal(r.prepared.routing.local_bypass_refinement.selected.length,0);
 assert.equal(r.graph.constraint_receipts[0].consumption,'reserved-lane');
});
test('receipt audit rejects wrong branch witnesses, shortcuts and stale local scope without accepting the old owner gutter',()=>{
 for(const corrupt of [r=>r.graph.positions.context.localBypassScopes[0].mapping[0].canonical='wrong',
  r=>r.prepared.routes[0].route.points[1].x=36,r=>r.prepared.routes[0].route.points[2].y=400,
  r=>r.graph.positions.context.localBypassScopes=[]]){
  const {ir,baseline:b}=fixture(),r=R.prepareLocalBypasses(ir,{},b);corrupt(r);E.auditConstraintRoutes(r.graph,r.prepared.routes);
  assert.equal(r.graph.constraint_receipts[0].status,'conflict');assert.equal(r.graph.constraint_receipts[0].route_verified,false);
 }
});
test('manual offsets, print, opt-out and resource limits preserve the requested result',()=>{
 for(const state of [{paperLocalBypasses:false},{offsets:{s:{x:1,y:0}}}]){const {ir,baseline:b}=fixture();assert.equal(R.prepareLocalBypasses(ir,state,b),b);}
 const {ir,baseline:b}=fixture();b.prepared.quality.medium='print';assert.equal(R.prepareLocalBypasses(ir,{},b),b);
 b.prepared.quality.medium='canvas';b.graph.edges=Array(129).fill(b.graph.edges[0]);assert.equal(R.prepareLocalBypasses(ir,{},b),b);
});
test('a pre-existing route conflict cannot masquerade as an applied local bypass',()=>{
 const {ir,baseline:b}=fixture();for(const p of b.prepared.routes[0].route.points.slice(1,-1))p.x=200;
 const r=R.prepareLocalBypasses(ir,{},b);assert.equal(r,b);assert.equal(r.prepared.routing.local_bypass_refinement,undefined);
 assert.equal(r.graph.constraint_receipts[0].status,'conflict');assert.equal(r.graph.positions.context.localBypassScopes,undefined);
});
module.exports={fixture};
