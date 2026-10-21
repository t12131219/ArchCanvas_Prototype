'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
function scene(entries,edge,protectFrameTitles=false){
 const nodes=new Map(entries.map(n=>[n.id,{kind:'compute',parent:null,...n}]));
 const positions=new Map(entries.map(n=>[n.id,{...n}]));
 positions.context={idx:{nodes},edges:[edge],feedback:new Set(),protectFrameTitles};
 return positions;
}
const wire={id:'use',source:'outside',target:'inside',source_port:'slot:2',target_port:'kw:value',kind:'data',evidence:'source-dependency'};
const length=r=>r.points.slice(1).reduce((s,p,i)=>s+Math.abs(p.x-r.points[i].x)+Math.abs(p.y-r.points[i].y),0);
const hits=(r,p)=>r.points.some((b,i)=>i&&L.blocked(r.points[i-1],b,[p]));
const nested=()=>[
 {id:'outside',x:220,y:0,w:80,h:40},
 {id:'frame',x:60,y:100,w:400,h:420,expanded:true,header:90,kind:'composite'},
 {id:'inner',parent:'frame',x:150,y:220,w:250,h:250,expanded:true,header:80,kind:'composite'},
 {id:'inside',parent:'inner',x:210,y:340,w:100,h:50},
];
test('ordinary wires pass directly through nested open titles with their exact original terminals',()=>{
 const entries=nested(),original=JSON.stringify(wire),p=scene(entries,wire),r=L.route(wire,p),old=L.route(wire,scene(entries,wire,true));
 assert.ok(r.ok&&old.ok);assert.ok(length(r)<length(old));
 for(const id of ['frame','inner']){const b=p.get(id);assert.ok(hits(r,{...b,h:b.header-10}));assert.ok(!hits(old,{...b,h:b.header-10}));}
 assert.deepEqual([r.points[0],r.points.at(-1)],[old.points[0],old.points.at(-1)]);
 assert.equal(JSON.stringify(wire),original);
});
test('unrelated expanded title bands are pass-through while their bodies stay obstacles',()=>{
 const entries=[{id:'outside',x:0,y:10,w:60,h:40},{id:'inside',x:400,y:10,w:60,h:40},
  {id:'other',x:100,y:0,w:200,h:300,expanded:true,header:90,kind:'composite'}];
 const p=scene(entries,wire),r=L.route(wire,p);assert.ok(r.ok);
 assert.ok(hits(r,{x:100,y:0,w:200,h:80}));assert.ok(!hits(r,{x:100,y:80,w:200,h:220}));
 assert.ok(length(r)<length(L.route(wire,scene(entries,wire,true))));
});
test('a concrete header child remains an obstacle even inside an unrelated pass-through title',()=>{
 const entries=[{id:'outside',x:0,y:10,w:60,h:40},{id:'inside',x:400,y:10,w:60,h:40},
  {id:'other',x:100,y:0,w:200,h:300,expanded:true,header:90,kind:'composite'},
  {id:'fixed',parent:'other',x:175,y:10,w:50,h:40,kind:'interface'}];
 const p=scene(entries,wire),r=L.route(wire,p);assert.ok(r.ok);assert.ok(!hits(r,p.get('fixed')));
});
test('collapsed modules and unknown computation bodies remain obstacles',()=>{
 for(const kind of ['composite','opaque']){
  const entries=[{id:'outside',x:0,y:10,w:60,h:40},{id:'inside',x:400,y:10,w:60,h:40},
   {id:'other',x:100,y:0,w:200,h:150,expanded:false,header:90,kind}];
  const p=scene(entries,wire),r=L.route(wire,p);assert.ok(r.ok);assert.ok(!hits(r,p.get('other')));
 }
});
test('title policy does not alter conditional uses, feedback identity or control endpoints',()=>{
 for(const kind of ['data','control']){
  const e={...wire,kind,condition:{branch:'foreign',outcome:true}},before=JSON.stringify(e),p=scene(nested(),e);
  const r=L.route(e,p);assert.ok(r.ok);assert.equal(JSON.stringify(e),before);
  const renamed=nested().map(n=>({...n,label:'Unseen title',operator:'foreign'}));
  assert.deepEqual(L.route(e,scene(renamed,e)),r);
 }
});
test('actual source case uses default passages, retains raw facts and restores saved SVG deterministically',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/semantic-design/current/after/SameSource.json')),before=JSON.stringify(ir);
 const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true};
 const old=R.render(ir,{...state,paperProtectFrameTitles:true}),r=R.render(ir,state);
 assert.equal(r.document.layout.frame_title_routing,'pass-through');assert.equal(old.document.layout.frame_title_routing,'avoid');
 assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(r.prepared.quality.line_geometry.crossings,0);
 assert.ok(r.prepared.quality.wire_length<old.prepared.quality.wire_length*.7);
 assert.deepEqual(r.graph.nodes.map(n=>n.id),old.graph.nodes.map(n=>n.id));
 assert.deepEqual(r.graph.edges,old.graph.edges);assert.equal(JSON.stringify(ir),before);
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 const open=R.render(ir,{...state,paperAuto:false,paperAdaptive:false,open:r.graph.publication.open});
 assert.equal(open.document.layout.frame_title_routing,'pass-through');assert.deepEqual(open.graph.publication.open,r.graph.publication.open);
});
