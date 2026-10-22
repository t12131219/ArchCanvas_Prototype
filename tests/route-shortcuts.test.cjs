'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const length=ps=>ps.reduce((s,p,i)=>s+(i?Math.abs(p.x-ps[i-1].x)+Math.abs(p.y-ps[i-1].y):0),0);
function scene(){
 const nodes=[{id:'root',kind:'composite',parent:null,label:'Foreign'},
  {id:'source',kind:'interface',role:'input',parent:'root',label:'x'},
  {id:'target',kind:'compute',parent:'root',label:'novel step',operator:'novel'},
  {id:'other',kind:'interface',role:'input',parent:'root',label:'context'},
  {id:'end',kind:'compute',parent:'root',label:'other step',operator:'novel'}].map(n=>({...n,source:[],runtime_evidence:[]}));
 const edges=[{id:'first',source:'source',target:'target',kind:'data',source_port:'out',target_port:'left',evidence:'source-dependency'},
  {id:'second',source:'other',target:'end',kind:'data',source_port:'out',target_port:'right',evidence:'source-dependency'}];
 const ir={schema:'archcanvas-source-semantic/2',title:'Foreign crossing',nodes,edges,motifs:[]};
 const state={view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:['root'],paperAdaptive:false,paperRouteShortcuts:false};
 const graph=E.project(ir,state),p=(id,x,y,w,h,extra={})=>[id,{...graph.positions.get(id),x,y,w,h,...extra}];
 const positions=new Map([p('root',0,0,500,600,{expanded:true,header:60}),p('source',40,70,100,44),p('target',240,470,120,64),p('other',370,140,100,44),p('end',100,250,120,64)]);
 positions.context={...graph.positions.context,edges:graph.edges,feedback:new Set()};graph.positions=positions;
 const route=(edge,points)=>({...graph.edges.find(e=>e.id===edge),route:{ok:true,source_side:'bottom',target_side:'top',points:points.map(([x,y])=>({x,y}))}});
 const routes=[route('first',[[90,114],[90,210],[320,210],[320,450],[300,450],[300,470]]),
  route('second',[[420,184],[420,230],[160,230],[160,250]])];
 const prepared=R.evaluateRoutes(graph,routes,'canonical-short',{placed:[],suppressed:[]});prepared.routing={};
 return {ir,state,baseline:{graph,prepared},edge:routes[0],positions};
}
test('an actual crossed detour can shorten with identical terminals, facts, nodes and untouched paths',()=>{
 const {ir,state,baseline}=scene(),before=JSON.stringify(ir),old=baseline.prepared.routes;
 const result=R.prepareRouteShortcuts(ir,{...state,paperRouteShortcuts:true},baseline),record=result.prepared.routing.route_shortcuts;
 assert.ok(record.selected.length);assert.ok(result.prepared.quality.line_geometry.crossings<baseline.prepared.quality.line_geometry.crossings);
 assert.ok(result.prepared.quality.wire_length<baseline.prepared.quality.wire_length);assert.equal(JSON.stringify(ir),before);
 assert.deepEqual([...result.graph.positions],[...baseline.graph.positions]);assert.deepEqual(result.graph.edges,baseline.graph.edges);
 for(const e of result.prepared.routes){const was=old.find(w=>w.id===e.id);assert.deepEqual([e.route.points[0],e.route.points.at(-1),e.route.source_side,e.route.target_side],[was.route.points[0],was.route.points.at(-1),was.route.source_side,was.route.target_side]);if(!record.selected.some(r=>r.edge===e.id))assert.deepEqual(e,was);}
 assert.equal(result.prepared.quality.line_geometry.overlapping_paths.length,0);assert.equal(result.prepared.quality.line_geometry.unrelated_contacts.length,0);
 assert.ok(record.attempts.length<=48);
});
test('candidate routes stay orthogonal, shorter and outside actual bodies and labels',()=>{
 const {edge,positions}=scene(),labels=[{x:180,y:350,w:50,h:60}],rows=L.routeShortcuts(edge,positions,labels);assert.ok(rows.length&&rows.length<=64);
 for(const r of rows){assert.ok(length(r.points)<length(edge.route.points));for(let i=1;i<r.points.length-1;i++){const a=r.points[i-1],b=r.points[i],c=r.points[i+1];assert.ok(!(a.x===b.x&&b.x===c.x||a.y===b.y&&b.y===c.y));}for(let i=1;i<r.points.length;i++){assert.ok(r.points[i].x===r.points[i-1].x||r.points[i].y===r.points[i-1].y);assert.ok(!L.blocked(r.points[i-1],r.points[i],[...L.routeObstacles(edge,positions),...labels]));}}
 const raw=JSON.stringify(rows);for(const n of positions.context.idx.nodes.values()){n.label='Transformer';n.operator='other';}assert.equal(JSON.stringify(L.routeShortcuts(edge,positions,labels)),raw);
});
test('module headers remain pass-through while unrelated bodies remain obstacles',()=>{
 const {edge,positions}=scene();positions.set('title-frame',{x:170,y:200,w:100,h:240,header:100,expanded:true});
 positions.context.idx.nodes.set('title-frame',{id:'title-frame',parent:'root',kind:'composite'});
 assert.ok(L.routeShortcuts(edge,positions).some(r=>r.points.some((p,i,ps)=>i&&L.blocked(ps[i-1],p,[{x:170,y:200,w:100,h:100}]))));
 for(const r of L.routeShortcuts(edge,positions))assert.ok(r.points.every((p,i,ps)=>!i||!L.blocked(ps[i-1],p,[{x:162,y:290,w:116,h:158}])));
});
test('state, iterations, explicit channels, bundles and oversized paths keep their policies',()=>{
 for(const extra of [{kind:'control'},{kind:'state-read'},{design_route:{kind:'bypass'}},{context_lane:{owner:'root',side:'left'}},{iteration:{}},{layout_after:'source'},{bundle_members:[]},{route:{ok:false,points:[]}}]){
  const {edge,positions}=scene();assert.deepEqual(L.routeShortcuts({...edge,...extra},positions),[]);
 }
 const {edge,positions}=scene();positions.context.feedback.add(edge.id);assert.deepEqual(L.routeShortcuts(edge,positions),[]);
 positions.context.feedback.clear();assert.deepEqual(L.routeShortcuts({...edge,route:{...edge.route,points:Array(25).fill(edge.route.points[0])}},positions),[]);
});
test('manual geometry, print, optout and resource limits skip the final shortcut pass',()=>{
 for(const extra of [{paperRouteShortcuts:false},{offsets:{source:{x:1,y:0}}}]){const {ir,state,baseline}=scene();assert.equal(R.prepareRouteShortcuts(ir,{...state,...extra},baseline),baseline);}
 const {ir,state,baseline}=scene();baseline.prepared.quality.medium='print';assert.equal(R.prepareRouteShortcuts(ir,{...state,paperRouteShortcuts:true},baseline),baseline);
 baseline.prepared.quality.medium='canvas';baseline.graph.edges=Array(129).fill(baseline.graph.edges[0]);assert.equal(R.prepareRouteShortcuts(ir,{paperRouteShortcuts:true},baseline),baseline);
});
test('already straight paths are unchanged and rejected proposals do not mutate caches',()=>{
 const {ir,state,baseline}=scene();for(const e of baseline.prepared.routes)e.route.points=[e.route.points[0],{x:e.route.points[0].x,y:e.route.points.at(-1).y},e.route.points.at(-1)];
 baseline.prepared=R.evaluateRoutes(baseline.graph,baseline.prepared.routes,'canonical-short',{placed:[],suppressed:[]});baseline.prepared.routing={};
 const raw=JSON.stringify(baseline.prepared.routes),cache=baseline.graph.positions.context.routeCache;
 const r=R.prepareRouteShortcuts(ir,{...state,paperRouteShortcuts:true},baseline);assert.equal(JSON.stringify(r.prepared.routes),raw);assert.equal(r.graph.positions.context.routeCache,cache);
});
test('a real mutable source boundary retains raw facts, direct goals and saved rendering after shortening an input wire',()=>{
 const fs=require('node:fs'),report=JSON.parse(fs.readFileSync('verification/unconsumed-dimensions/current/small-report.json'));
 const row=report.rows.find(r=>r.name==='MutableShape'),ir=JSON.parse(fs.readFileSync(row.input));
 const a=R.render(ir,{...row.state,paperRouteShortcuts:false}),b=R.render(ir,row.state);
 assert.equal(a.prepared.quality.line_geometry.crossings,1);assert.equal(b.prepared.quality.line_geometry.crossings,0);
 assert.deepEqual(a.document.ir,b.document.ir);assert.deepEqual(a.document.architecture,b.document.architecture);
 assert.deepEqual(a.document.publication,b.document.publication);assert.deepEqual(a.document.expression_coverage,b.document.expression_coverage);
 assert.deepEqual(a.document.layout.nodes,b.document.layout.nodes);assert.deepEqual(a.graph.node_accounting,b.graph.node_accounting);assert.deepEqual(a.graph.edge_accounting,b.graph.edge_accounting);
 for(const e of b.prepared.routes){const was=a.prepared.routes.find(x=>x.id===e.id);assert.deepEqual([e.route.points[0],e.route.points.at(-1)],[was.route.points[0],was.route.points.at(-1)]);}
 assert.ok(b.document.ir.nodes.some(n=>n.mutable));assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('unknown endpoints and branch conditions retain their exact identity through a geometric shortcut',()=>{
 const {ir,state,baseline}=scene(),target=baseline.graph.nodes.find(n=>n.id==='target');target.kind='opaque';
 const first=baseline.prepared.routes[0];first.condition={branch:'foreign',outcome:'false'};
 const r=R.prepareRouteShortcuts(ir,{...state,paperRouteShortcuts:true},baseline);
 assert.ok(r.prepared.routing.route_shortcuts.selected.length);assert.equal(r.graph.nodes.find(n=>n.id==='target').kind,'opaque');
 assert.deepEqual(r.prepared.routes.find(e=>e.id===first.id).condition,first.condition);
});

test('scope-port placement and final shortening compose without changing the selected semantic frontier',()=>{
 const {fixture,state}=require('./cross-scope-fixtures.cjs');
 const ir=fixture({left:4,right:4,branches:4}),request={...state,paperCoupledRoutes:false,paperResidualBands:false,paperSourcePortOrder:false};
 const a=R.render(ir,{...request,paperRouteShortcuts:false}),b=R.render(ir,request);
 assert.deepEqual(a.document.architecture,b.document.architecture);assert.deepEqual(a.document.publication,b.document.publication);assert.deepEqual(a.document.expression_coverage,b.document.expression_coverage);
 assert.deepEqual(a.document.layout.nodes,b.document.layout.nodes);assert.deepEqual(a.document.layout.cross_scope_ports,b.document.layout.cross_scope_ports);
 assert.equal(a.prepared.quality.line_geometry.crossings,8);assert.equal(b.prepared.quality.line_geometry.crossings,7);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
