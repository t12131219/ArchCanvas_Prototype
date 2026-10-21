'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),experiment=process.env.ARCHCANVAS_EXPERIMENT_ROOT;
if(!experiment)throw Error('Run tools/experiment_source_corridors.py');
const R=require(path.join(experiment,'semantic_studio/publication-renderer.js')),L=require(path.join(experiment,'semantic_studio/architecture-layout.js'));
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},...['s','a','b'].map(id=>({id,kind:id==='s'?'interface':'compute',parent:'root'}))]
  .map(n=>({...n,label:n.id,source:[],paper:{font:16,lines:[n.id],captions:[]}}));
 const edges=['a','b'].map((target,i)=>({id:'e'+i,source:'s',target,source_port:'out',target_port:'operand:'+i,resolved_source:'s',
  canonical_source:'s',canonical_target:target,kind:'data',evidence:'source-dependency',paper_labels:[]}));
 const positions=new Map([{id:'root',x:0,y:0,w:900,h:900,expanded:true,header:70},{id:'s',x:300,y:100,w:100,h:60},
  {id:'a',x:100,y:700,w:100,h:60},{id:'b',x:600,y:700,w:100,h:60}].map(p=>[p.id,p]));
 const idx={nodes:new Map(nodes.map(n=>[n.id,n]))};
 positions.context={idx,edges,feedback:new Set(),compoundAlignments:[],branchColumns:[],contextLanes:[],inputDocks:[],fixedInputs:[],portOrder:'canonical',ancestorPorts:'boundary'};
 const routes=edges.map(e=>({...e,route:L.route(e,positions)})),last=routes[1],s=last.route.points[0],t=last.route.points.at(-1);
 last.route.points=[s,{x:s.x,y:s.y+16},{x:780,y:s.y+16},{x:780,y:t.y-16},{x:t.x,y:t.y-16},t];
 const graph={nodes,edges,positions,idx,bounds:{x:-28,y:-30,w:956,h:958},constraint_receipts:[],
  publication:{medium:'canvas',paper_width_mm:180,canvas_limits:{width_px:2000,height_px:2000,area_px2:4e6,nodes:128,edges:128}}};
 return {graph,prepared:{...R.evaluateRoutes(graph,routes,'canonical-short'),routing:{selected:'canonical-short'}}};
}
const identity=r=>JSON.stringify({nodes:r.graph.nodes,positions:[...r.graph.positions],edges:r.graph.edges,routes:r.prepared.routes.map(({route,...e})=>e)});
test('parallel source corridor shortens a detour while keeping every terminal and operand',()=>{
 const b=fixture(),before=identity(b),terminals=b.prepared.routes.map(e=>[e.route.points[0],e.route.points.at(-1)]),r=R.prepareSourceCorridors({}, {},b);
 assert.equal(identity(r),before);assert.ok(r.prepared.routing.source_corridor_refinement.accepted.length);
 assert.ok(r.prepared.quality.wire_length<b.prepared.quality.wire_length);assert.ok(r.prepared.quality.line_geometry.crossings<=b.prepared.quality.line_geometry.crossings);
 assert.deepEqual(r.prepared.routes.map(e=>[e.route.points[0],e.route.points.at(-1)]),terminals);
 assert.equal(r.graph.positions.context.sourceRails,undefined);
 assert.deepEqual(R.prepareSourceCorridors({}, {},fixture()).prepared.routes,r.prepared.routes);
});
test('same visible box without an exact producer and result slot never authorizes a corridor',()=>{
 for(const mutate of [e=>e.resolved_source='hidden-result',e=>e.source_port='other-slot',e=>e.condition={branch:'choice',outcome:'true'},e=>e.iteration={step:2},e=>e.design_route={kind:'bypass'},e=>e.context_lane={owner:'root',side:'left'}]){
  const b=fixture();mutate(b.prepared.routes[1]);const r=R.prepareSourceCorridors({}, {},b);assert.equal(r,b);assert.equal(r.prepared.routing.source_corridor_refinement,undefined);
 }
});
test('a bundle requires one exact source slot in every retained member',()=>{
 const b=fixture(),e=b.prepared.routes[1];e.bundle_members=[{...e,id:'one'},{...e,id:'two',target_port:'different-use'}];e.kind='data-bundle';e.source_port='bundle';e.resolved_source=e.id;
 const r=R.prepareSourceCorridors({}, {},b);assert.ok(r.prepared.routing.source_corridor_refinement.accepted.length);
 const c=fixture(),f=c.prepared.routes[1];f.bundle_members=[{...f,id:'one'},{...f,id:'two',source_port:'another-result'}];
 assert.equal(R.prepareSourceCorridors({}, {},c),c);
});
test('protected producer, feedback, manual layout and resource budgets retain the original result',()=>{
 for(const patch of [{kind:'opaque'},{mutable:true},{condition:{branch:'choice'}},{identity_display:{label:'same-object'}},{observed_calls:{}}]){
  const b=fixture();Object.assign(b.graph.idx.nodes.get('s'),patch);assert.equal(R.prepareSourceCorridors({}, {},b),b);
 }
 for(const state of [{paperSourceCorridors:false},{offsets:{s:{x:1,y:0}}}]){const b=fixture();assert.equal(R.prepareSourceCorridors({},state,b),b);}
 const b=fixture();b.graph.positions.context.feedback.add('e1');assert.equal(R.prepareSourceCorridors({}, {},b),b);
 const c=fixture();c.prepared.quality.medium='print';assert.equal(R.prepareSourceCorridors({}, {},c),c);
 const d=fixture();d.graph.edges=Array(129).fill(d.graph.edges[0]);assert.equal(R.prepareSourceCorridors({}, {},d),d);
});
module.exports={fixture};
