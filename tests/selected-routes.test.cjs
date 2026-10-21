'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js');
function fixture(name){
 const f=JSON.parse(fs.readFileSync('tests/fixtures/'+name+'.json'));
 const positions=new Map(f.positions.map(p=>[p.id,{...p}])),by=new Map(f.nodes.map(n=>[n.id,n]));
 const nodes=f.nodes.filter(n=>positions.has(n.id)).map(n=>({...n,label:n.id,paper:{font:16,captions:[],lines:[n.id]}}));
 const edges=f.routes.map(e=>({...e,evidence:'source-dependency',paper_labels:[]}));
 const xs=[...positions.values()],x=Math.min(...xs.map(p=>p.x))-28,y=Math.min(...xs.map(p=>p.y))-28;
 const graph={nodes,edges,positions,idx:{nodes:by},constraint_receipts:[],bounds:{x,y,w:Math.max(...xs.map(p=>p.x+p.w))-x+28,h:Math.max(...xs.map(p=>p.y+p.h))-y+28},
  publication:{medium:'canvas',paper_width_mm:180,canvas_limits:{width_px:20000,height_px:20000,area_px2:4e8,nodes:256,edges:256}}};
 positions.context={idx:graph.idx,edges,feedback:new Set(),portOrder:'neighbors',ancestorPorts:'boundary',crossingCost:180,contactCost:360,stubLength:16,
  compoundAlignments:[],branchColumns:[],contextLanes:[],inputDocks:[]};
 return {graph,prepared:{...R.evaluateRoutes(graph,edges,'neighbors-short'),routing:{selected:'neighbors-short'}}};
}
const identity=r=>JSON.stringify({nodes:r.graph.nodes,positions:[...r.graph.positions],edges:r.prepared.routes.map(({route,...e})=>e)});
for(const name of ['parallel-rail-contact','narrow-rail-contact'])test(name+' refines selected paths without changing geometry or bindings',()=>{
 const b=fixture(name),fixed=identity(b),endpoints=new Map(b.prepared.routes.map(e=>[e.id,[e.route.points[0],e.route.points.at(-1)]]));
 const r=R.polishRoutes(b),q=r.prepared.quality,old=b.prepared.quality,receipt=r.prepared.routing.selected_route_refinement;
 assert.equal(identity(r),fixed);assert.ok(receipt.attempts<=32);assert.ok(receipt.accepted.length);
 assert.ok(q.line_geometry.crossings<=old.line_geometry.crossings+1);
 assert.ok(q.line_geometry.unrelated_contacts.length<old.line_geometry.unrelated_contacts.length);
 assert.ok(q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length);
 assert.ok(q.native_width_px<=old.native_width_px&&q.native_height_px<=old.native_height_px);
 for(const e of r.prepared.routes)assert.deepEqual([e.route.points[0],e.route.points.at(-1)],endpoints.get(e.id));
 assert.equal(JSON.stringify(R.polishRoutes(fixture(name)).prepared.routes),JSON.stringify(r.prepared.routes));
});
test('unknown, conditional and state wire metadata survive geometry refinement verbatim',()=>{
 const b=fixture('narrow-rail-contact');
 for(const [i,e]of b.prepared.routes.entries()){e.evidence=i%2?'runtime-tensor':'source-dependency';e.condition={test:'foreign-flag',outcome:!!(i%2)};e.canonical_source=e.source;e.canonical_target=e.target;e.target_port='foreign:'+i;}
 b.graph.nodes[0].kind='opaque';b.graph.nodes[1].mutable=true;
 const original=identity(b),r=R.polishRoutes(b);assert.equal(identity(r),original);
});
test('a clean selected diagram and noncanvas figure do not start repair work',()=>{
 const b=fixture('narrow-rail-contact');b.prepared.quality.medium='print';assert.equal(R.polishRoutes(b),b);assert.equal(b.prepared.routing.selected_route_refinement,undefined);
 const a=fixture('narrow-rail-contact');a.prepared.quality.line_geometry={crossings:0,unrelated_contacts:[],overlapping_paths:[]};assert.equal(R.polishRoutes(a),a);assert.equal(a.prepared.routing.selected_route_refinement,undefined);
});
