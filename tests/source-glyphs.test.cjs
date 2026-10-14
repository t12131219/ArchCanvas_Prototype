const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../yworks_edge_router_lab/router.js'),E=require('../yworks_edge_router_lab/graph-engine.js'),C=require('../yworks_edge_router_lab/semantic-constraints.js');
const load=file=>JSON.parse(fs.readFileSync(path.join(__dirname,file)));
const options={margin:6,stub:16,bendCost:40,crossingCost:180,edgeSpacing:12,overlapCost:2,sides:'any',style:'orthogonal'};
const fresh=()=>C.initialize(load('../data/cases/e40ad1504991acea-detailed.json'));

test('actual arithmetic has separate inputs and captions remain owned by the glyph',()=>{
 const g=fresh(),add=g.nodes.find(n=>n.id==='highway.layer0.add'),edges=g.edges.filter(e=>e.target===add.id);
 assert.equal(add.glyphPresentation.kind,'binary-circle');
 assert.equal(new Set(edges.map(e=>e.fixedTarget.side)).size,2);
 assert.equal(R.stats(edges).crossings,0);
 for(const e of g.edges)assert.equal(C.validate(g,e,e.route).ok,true,e.id+': '+C.validate(g,e,e.route).violations);
 const markup=add.html,old=add.x;E.move(g,add.id,16,0,options);
 assert.equal(g.lastMove.blocked,false);assert.equal(add.x,old+16);assert.equal(add.html,markup);
 assert.equal(C.validateSource(g).ok,true);
});
test('saved rectangle draft upgrades to real glyphs without losing manual displacement or waypoints',()=>{
 const old=C.initialize(load('fixtures/highway-pre-glyph.json')),source=fresh();
 const node=old.nodes.find(n=>n.id==='highway.layer0.add'),before={x:node.x,y:node.y},parent=old.nodes.find(n=>n.id===node.parent);
 // A valid previous hand placement, stored independently from source base.
 E.move(old,node.id,12,0,options);assert.equal(old.lastMove.blocked,false);
 const edge=old.edges.find(e=>e.target===node.id);edge.waypoints=[{x:parent.x+30,y:node.y+node.h+40}];
 const anchors=E.clone(old.routeLabels),bindings=old.edges.map(e=>e.binding.endpoint_binding?.canonical);
 E.upgradePresentation(old,source);
 const expected=source.nodes.find(n=>n.id===node.id),slot=expected.glyphPresentation.slot_bbox;
 assert.equal(node.x,before.x+12+expected.x-slot[0]);assert.equal(node.y,before.y+expected.y-slot[1]);
 assert.equal(node.w,32);assert.equal(node.h,32);assert.equal(edge.waypoints.length,1);
 assert.deepEqual(old.routeLabels.map(a=>a.anchor),anchors.map(a=>a.anchor));
 assert.deepEqual(old.edges.map(e=>e.binding.endpoint_binding?.canonical),bindings);
 assert.equal(C.validateSource(old).ok,true);
 for(const e of old.edges)assert.equal(C.validate(old,e,e.route).ok,true,e.id+': '+C.validate(old,e,e.route).violations);
});
test('migration cannot erase tampered source bindings',()=>{
 const old=C.initialize(load('fixtures/highway-pre-glyph.json')),source=fresh();
 old.edges[0].binding.endpoint_binding.canonical.dst='fabricated';E.upgradePresentation(old,source);
 assert.equal(C.validateSource(old).ok,false);
});
test('wrong symbol, glyph meaning or caption geometry is rejected by source baseline',()=>{
 for(const mutate of [n=>n.html=n.html.replace('>+</','>×</'),n=>n.glyphPresentation.operation='multiply',n=>n.labelObstacles[0].x+=100]){
  const g=fresh(),n=g.nodes.find(n=>n.id==='highway.layer0.add');mutate(n);assert.equal(C.validateSource(g).ok,false);
 }
});
test('crossing cost includes contacts at search vertices rather than hiding them in a bend',()=>{
 const nodes=[{id:'s',x:40,y:110,w:32,h:32},{id:'t',x:340,y:110,w:32,h:32}],prior=[[{x:200,y:70},{x:200,y:126},{x:200,y:182}]];
 const edge={source:'s',target:'t',fixedSource:{side:'right',fraction:.5},fixedTarget:{side:'left',fraction:.5}};
 const low=R.routeEdge(edge,nodes,prior,{width:420,height:280,margin:4,bendCost:10,crossingCost:0});
 const high=R.routeEdge(edge,nodes,prior,{width:420,height:280,margin:4,bendCost:10,crossingCost:220,edgeSpacing:12});
 assert.equal(low.ok,true);assert.equal(high.ok,true);assert.ok(high.points.length>low.points.length);
 assert.ok(high.points.some(p=>p.y<70||p.y>182),'route should use a clear corridor around the independent wire');
});
test('both interaction modes keep external glyph captions inside their owning frame',()=>{
 for(const mode of ['move','movePreview']){
  const n={id:'op',x:80,y:70,w:32,h:32,parent:'frame',glyphPresentation:{kind:'binary-circle'},labelObstacles:[{x:44,y:-10,w:50,h:18}],base:[80,70]};
  const g={canvas:[240,200],nodes:[{id:'frame',x:10,y:10,w:180,h:150,expanded:true,base:[10,10]},n],edges:[]};
  E[mode](g,n.id,100,0,options);
  assert.equal(n.x,94,'caption right edge reaches the owner padding before the circle body does');
  assert.ok(n.x+n.labelObstacles[0].x+n.labelObstacles[0].w<=188);
 }
});
