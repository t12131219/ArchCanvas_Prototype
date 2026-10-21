'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js'),L=require('../semantic_studio/architecture-layout.js'),E=require('../semantic_studio/semantic-engine.js');
const {fixture,state:request}=require('./context-source-fixtures.cjs');
// Isolate this stage's geometry; final narrow-band mapping is tested separately.
const state={...request,paperResidualBands:false};
const facts=r=>({ir:r.document.ir,nodes:r.graph.nodes.map(n=>n.id),edges:r.graph.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.kind,e.condition,e.originals,e.bundle_members]),
 open:r.graph.publication.open,roles:r.graph.publication.role_frontier,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,boundary:r.graph.publication.boundary});
test('a downstream terminal follows the actual region exit without changing frontier or ranks',()=>{
 const ir=fixture(),original=JSON.stringify(ir),a=R.render(ir,{...state,paperRegionFollowers:false}),b=R.render(ir,state),receipt=b.prepared.routing.region_follower_refinement;
 assert.ok(receipt.accepted);assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 assert.deepEqual(receipt.records.map(r=>r.node),['out']);assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length*.85);
 const exit=b.graph.positions.get('z'),out=b.graph.positions.get('out');assert.equal(out.x+out.w/2,exit.x+exit.w/2);
 for(const [id,p]of a.graph.positions){const q=b.graph.positions.get(id);assert.equal(p.y,q.y);assert.equal(p.w,q.w);assert.equal(p.h,q.h);if(id!=='out')assert.equal(p.x,q.x);}
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('unknown operations may remain explicit on an aligned output path',()=>{
 const ir=fixture();ir.nodes.find(n=>n.id==='out').kind='opaque';const a=R.render(ir,{...state,paperRegionFollowers:false}),b=R.render(ir,state);
 assert.ok(b.prepared.routing.region_follower_refinement.accepted);assert.equal(b.graph.nodes.find(n=>n.id==='out').kind,'opaque');assert.deepEqual(facts(a),facts(b));
});
function drawing(){
 const nodes=[{id:'root',parent:null,kind:'composite'},{id:'region',parent:'root',kind:'composite'},{id:'other',parent:'root',kind:'composite'},
 {id:'exit',parent:'region',kind:'compute'},{id:'foreign',parent:'other',kind:'compute'},{id:'tail',parent:'root',kind:'compute'},{id:'out',parent:'root',kind:'interface'}];
 const edges=[{id:'e0',source:'exit',target:'tail',kind:'data',source_port:'result',target_port:'arg:0'},{id:'e1',source:'tail',target:'out',kind:'data',source_port:'out',target_port:'return'}];
 const positions=new Map([['root',{x:0,y:0,w:700,h:700,expanded:true}],['region',{x:300,y:100,w:250,h:200,expanded:true}],['other',{x:50,y:100,w:200,h:200,expanded:true}],
 ['exit',{x:400,y:230,w:80,h:40,expanded:false}],['foreign',{x:100,y:230,w:80,h:40,expanded:false}],['tail',{x:40,y:400,w:120,h:40,expanded:false}],['out',{x:40,y:500,w:100,h:40,expanded:false}]].map(([id,p])=>[id,{id,...p}]));
 positions.context={idx:E.index({nodes,edges}),contextLanes:[],routeCache:new Map(),reserved:[]};
 return {nodes,edges,positions};
}
const proposal=d=>L.regionFollowers(E.index(d),d.nodes,d.edges,d.positions);
test('successive followers retain exact uses, source ownership and vertical placement',()=>{
 const d=drawing(),original=JSON.stringify([...d.positions]),r=proposal(d);
 assert.deepEqual(r.records.map(x=>x.node),['tail','out']);assert.equal(r.positions.get('tail').x+60,440);assert.equal(r.positions.get('out').x+50,440);
 assert.equal(JSON.stringify([...d.positions]),original);assert.deepEqual(r.records[0].inputs,[{edge:'e0',source:'exit',target:'tail',source_port:'result',target_port:'arg:0'}]);
});
test('distinct source regions and escaped parent inputs keep their multi-input DAG positions',()=>{
 for(const source of ['foreign','root']){const d=drawing();d.edges.push({id:'extra',source,target:'tail',kind:'data'});assert.deepEqual(proposal(d).records,[]);}
});
test('feedback, conditions, state routes, guarded nodes and cycles do not authorize alignment',()=>{
 const mutations=[d=>d.edges[0].kind='control',d=>d.edges[0].condition={branch:'if'},d=>d.edges[0].design_route={kind:'state-interface'},d=>d.edges[1].design_route={kind:'iteration-feedback'},
 d=>d.edges[1].layout_after='region',d=>d.nodes.find(n=>n.id==='tail').mutable=true,d=>d.nodes.find(n=>n.id==='tail').condition={branch:'if'},
 d=>d.positions.get('tail').cyclic=true,d=>d.positions.get('region').cyclic=true,d=>d.positions.get('tail').y=200];
 for(const mutate of mutations){const d=drawing();mutate(d);assert.deepEqual(proposal(d).records,[]);}
});
test('sibling obstacles and reserved context gutters bound candidate positions',()=>{
 const d=drawing();d.nodes.push({id:'blocker',parent:'root',kind:'compute'});d.positions.set('blocker',{id:'blocker',x:370,y:390,w:140,h:70,expanded:false});assert.deepEqual(proposal(d).records,[]);
 const g=drawing();g.positions.get('root').context_gutter=400;g.positions.context.contextLanes=[{owner:'root',side:'left',selected:true}];
 assert.ok(proposal(g).records.every(r=>r.after.x>=416));
});
test('explicit opt-out, manual positions and print state retain requested layout',()=>{
 const ir=fixture();for(const extra of [{paperRegionFollowers:false},{offsets:{out:{x:10,y:0}}},{paperMedium:'print'}])assert.equal(R.render(ir,{...state,...extra}).prepared.routing.region_follower_refinement,undefined);
});
test('source/model renaming leaves the local geometric decision unchanged',()=>{
 const ir=fixture(),a=R.render(ir,state);for(const n of ir.nodes){n.label='other';n.class_name='Foreign';if(n.operator)n.operator='unseen';}
 const b=R.render(ir,state);assert.ok(b.prepared.routing.region_follower_refinement.accepted);assert.deepEqual(b.prepared.routing.region_follower_refinement.records,a.prepared.routing.region_follower_refinement.records);
});
test('folding the producing region does not erase original detail or prevent restoring layout',()=>{
 const ir=fixture(),a=R.render(ir,state),b=R.render(ir,{...state,open:['root','left']}),c=R.render(ir,state);
 assert.equal(b.prepared.routing.region_follower_refinement,undefined);assert.equal(c.svg,a.svg);
 for(const r of [a,b,c])for(const [bucket,key]of [['node_accounting','nodes'],['edge_accounting','edges']]){
 const ids=Object.values(r.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),ir[key].map(n=>n.id).sort());}
});
