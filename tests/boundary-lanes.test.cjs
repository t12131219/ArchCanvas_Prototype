const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),C=globalThis.SummaryConstraints,R=globalThis.EdgeRouterLabRouting;
const catalog=JSON.parse(fs.readFileSync(root+'/data/catalog.json'));
function load(id){const c=catalog.cases.find(c=>c.id===id),sources=Object.fromEntries(c.views.filter(v=>v.json).map(v=>[v.key,C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))))]));return F.build(F.create(sources));}
test('nested frame lanes use corridor space on all four sides and retain stroke safety',()=>{
 const frame={id:'inner',x:40,y:40,w:120,h:120,expanded:true},outer={id:'outer',x:20,y:20,w:160,h:160,expanded:true},g={canvas:[220,220],nodes:[outer,frame],edges:[]},e={width:2.2};
 const pads=C.laneClearances(g,e,frame);for(const side of ['left','right','top','bottom']){assert.equal(pads[side].outside,10);assert.equal(pads[side].inside,12);}
 const cramped={...g,nodes:[{...outer,x:34,y:34,w:132,h:132},frame]};for(const pad of Object.values(C.laneClearances(cramped,e,frame)))assert.equal(pad.outside,C.borderClearance(e,frame));
 const title={x:20,y:6,w:60,h:16};frame.labelObstacles=[title];assert.equal(C.laneClearances(g,e,frame).top.inside,C.borderClearance(e,frame));
});
test('partial Transformer forks and Memory bends keep air around frames and remain movable',()=>{
 let g=F.toggle(load('01093cc06a87b35a'),'enc.self',true);g=F.toggle(g,'enc.ffn',true);const authority=E.clone(g.recursive.authority),bindings=E.clone(g.edges.map(e=>e.binding));assert.equal(F.route(g).failed,0);
 for(const id of ['binding-005-4','encoder-memory-to-cross-39'])assert.deepEqual(C.laneContacts(g,g.edges.find(e=>e.id===id)),[]);
 const residual=g.edges.find(e=>e.id==='binding-005-4'),self=g.nodes.find(n=>n.id==='enc.self');assert.ok(residual.route[1].y-self.y-self.h>=12-1e-5);
 const branches=g.edges.filter(e=>e.source==='src_pe.add');assert.ok(branches.every(e=>e.route[0].x===branches[0].route[0].x));assert.equal(C.validateJunctions(g).ok,true);
 const full=F.all(E.clone(g),true);assert.equal(F.route(full).failed,0);assert.ok(E.validateView(full).edges.every(([,v])=>v.ok));
 const before=E.clone(g);E.move(g,'src_pe.add',12,0);assert.equal(g.lastMove.blocked,false);assert.ok(E.validateView(g).edges.every(([,v])=>v.ok));assert.deepEqual(g.recursive.authority,authority);assert.deepEqual(g.edges.map(e=>e.binding),bindings);F.captureMove(before,g,'src_pe.add');
 const upgraded=F.upgrade({...E.clone(g),recursive:{...E.clone(g.recursive),presentationVersion:9}});assert.equal(F.route(upgraded).failed,0);assert.deepEqual(upgraded.recursive.state.layouts,g.recursive.state.layouts);assert.deepEqual(upgraded.recursive.state.open,g.recursive.state.open);
});
test('visibility search finds a free center lane when nominal spacing cannot fit between occupied walls',()=>{
 const nodes=[{id:'s',x:20,y:100,w:30,h:30},{id:'t',x:20,y:20,w:30,h:30}],edge={source:'s',target:'t',fixedSource:{side:'right',fraction:.5},fixedTarget:{side:'right',fraction:.5}},walls=[{x:60,y:60,w:10,h:100},{x:78,y:60,w:10,h:100}],prior=[[{x:70,y:30},{x:70,y:150}],[{x:78,y:30},{x:78,y:150}]];
 const result=R.routeEdge(edge,nodes,prior,{margin:2,stub:4,width:150,height:180,edgeSpacing:10,extraObstacles:walls});assert.equal(result.ok,true);assert.ok(result.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 // Exact CCVAE consumer lanes exercise the same narrow nested corridor in
 // the recursive editor and retain the producer identities.
 const g=F.toggle(load('8ed3fd7a969716dc'),'ccvae.encoder',true);assert.equal(F.route(g).failed,0);const checked=E.validateView(g);assert.ok(checked.source.ok&&checked.layout.ok&&checked.edges.every(([,v])=>v.ok));
});
