'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../semantic_studio/architecture-layout.js'),E=require('../semantic_studio/semantic-engine.js');
const {scene,inGutter}=require('./selected-context-fixtures.cjs');
for(const side of ['left','right'])test('congestion search retains a selected '+side+' context without an entry band',()=>{
 const {edge,positions}=scene({side}),original=JSON.stringify(edge),r=L.route(edge,positions);
 assert.ok(r.ok&&inGutter(r,positions,edge));assert.equal(r.target_side,side);assert.equal(JSON.stringify(edge),original);
 const soft=scene({side,selected:false}),shortcut=L.route(soft.edge,soft.positions);
 assert.ok(shortcut.ok&&!inGutter(shortcut,soft.positions,soft.edge));
 assert.deepEqual([r.points[0],r.points.at(-1)],[shortcut.points[0],shortcut.points.at(-1)]);
 // The constrained search can find a different gutter entry, avoiding the
 // reserved long rail instead of merely keeping its original crowded route.
 const rail=side==='left'?116:584;
 assert.ok(!r.points.some((p,i,a)=>i&&p.x===rail&&a[i-1].x===rail&&Math.max(p.y,a[i-1].y)>100&&Math.min(p.y,a[i-1].y)<550));
});
test('selected route search remains deterministic, orthogonal and obstacle free after renaming',()=>{
 const {edge,positions}=scene(),r=L.route(edge,positions);
 for(const p of positions.values())p.title='Unseen region';
 assert.deepEqual(L.route(edge,positions),r);
 for(let i=1;i<r.points.length;i++)assert.ok(r.points[i].x===r.points[i-1].x||r.points[i].y===r.points[i-1].y);
 const bodies=['source','target'].map(id=>positions.get(id));
 for(let i=1;i<r.points.length;i++)assert.ok(!L.blocked(r.points[i-1],r.points[i],bodies));
});
test('entry-band channels retain the same gutter requirement without an explicit selected list',()=>{
 const {edge,positions}=scene({selected:false,entryBand:true}),r=L.route(edge,positions);
 assert.ok(r.ok&&inGutter(r,positions,edge));
});
test('an unobstructed selected channel is unchanged and expanded titles remain pass-through',()=>{
 const a=scene({crowded:false}),b=scene({crowded:false,selected:false});
 const r=L.route(a.edge,a.positions);assert.deepEqual(r,L.route(b.edge,b.positions));
 assert.ok(inGutter(r,a.positions,a.edge));
 const title={...a.positions.get('region'),h:70};
 assert.ok(r.points.some((p,i,a)=>i&&L.blocked(a[i-1],p,[title])));
});
test('guarded and state-bound uses cannot acquire selected context proposals',()=>{
 const nodes=[['root',null,'composite'],['outside','root','interface'],['region','root','composite'],['inside','region','compute'],['join','region','compute']]
  .map(([id,parent,kind])=>({id,parent,kind,label:id}));
 for(const extra of [{condition:{branch:'if',outcome:'true'}},{design_route:{kind:'state-interface'}},{kind:'control'}]){
  const edges=[{id:'internal',source:'inside',target:'join',kind:'data'}, {id:'external',source:'outside',target:'join',kind:'data',...extra}];
  assert.deepEqual(L.contextEntries(E.index({nodes,edges}),new Set(nodes.map(n=>n.id)),edges),[]);
 }
});
