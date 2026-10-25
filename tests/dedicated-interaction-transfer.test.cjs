'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine'),L=require('../semantic_studio/architecture-layout'),I=require('../semantic_studio/canvas-interaction'),V=require('../semantic_studio/canvas-preview'),A=require('../semantic_studio/authoring-model');
const oracle=require('../verification/interaction-performance/baseline/interaction-oracle.cjs');
function scene(count=80,existing=false){
 const nodes=[{id:'root',parent:null},{id:'group',parent:'root'},...Array.from({length:count},(_,i)=>({id:'c'+i,parent:'group'})),...Array.from({length:90},(_,i)=>({id:'o'+i,parent:'root'}))],idx=E.index({nodes}),positions=new Map([['root',{x:0,y:0,w:6000,h:5000,header:90,expanded:true}],['group',{x:100,y:100,w:800,h:800,expanded:true,header:60}],...Array.from({length:count},(_,i)=>['c'+i,{x:120+i%20*30,y:120+Math.floor(i/20)*25,w:15,h:15}]),...Array.from({length:90},(_,i)=>['o'+i,{x:1200+i%10*100,y:100+Math.floor(i/10)*100,w:40,h:40}])]);
 if(existing)positions.set('o0',{x:110,y:100,w:60,h:60});positions.context={idx,edges:[],routeCache:new Map(),reserved:[]};return {graph:{nodes,idx,positions,edges:[],bounds:{x:0,y:0,w:6000,h:5000},constraint_receipts:[]}};
}
test('an enclosing subtree broad phase agrees with the independent linear oracle, including prior overlaps and escaping descendants',()=>{
 for(const existing of [false,true])for(const escapes of [false,true]){
  const f=scene(300,existing);if(escapes)f.graph.positions.get('c0').x=990;
  const s=I.session(f,'group');assert.equal(s.enclosed,!escapes);
  for(let dx=-500;dx<=1600;dx+=37)for(let dy=-200;dy<600;dy+=43)assert.deepEqual(I.constrain(s,dx,dy),oracle.constrain({...s,parent:{...s.parent,header:0}},dx,dy));
 }
});
test('manual children may occupy the parent title row and saved geometry uses the same rule',()=>{
 const f=scene(),s=I.session(f,'group'),c=I.constrain(s,0,-98);assert.deepEqual(c,{ok:true,dx:0,dy:-98});
 const moved=I.move(f,'group',0,-98).figure;assert.equal(moved.graph.positions.get('group').y,2);assert.ok(I.restore(f,JSON.parse(JSON.stringify(I.placement(moved)))));
 const wrong=I.placement(moved);wrong.positions.find(p=>p[0]==='group')[2]=-1;assert.equal(I.restore(f,wrong),null);
});
test('straight boundary previews keep both endpoints, orthogonality and arrow direction in either drag direction',()=>{
 for(const vertical of [false,true])for(const target of [false,true]){
  const e={source:'a',target:'b',route:{points:vertical?[{x:20,y:20},{x:20,y:200}]:[{x:20,y:20},{x:200,y:20}]}},s={ids:new Set([target?'b':'a'])};
  for(const [dx,dy]of [[17,23],[-40,-30],[0,0]]){
   const ps=I.previewRoute(e,s,dx,dy),first=e.route.points[0],last=e.route.points[1];
   assert.deepEqual(ps[0],target?first:{x:first.x+dx,y:first.y+dy});assert.deepEqual(ps.at(-1),target?{x:last.x+dx,y:last.y+dy}:last);
   assert.ok(ps.every((p,i)=>!i||p.x===ps[i-1].x||p.y===ps[i-1].y));const end=ps.at(-1),before=ps.at(-2);assert.ok(vertical?end.y>before.y:end.x>before.x);
  }
 }
});
function portsScene(){
 const nodes=['a','b','o'].map(id=>({id,parent:null})),edges=[{id:'e',source:'a',target:'b',source_port:'out',target_port:'operand',kind:'data'}],idx=E.index({nodes,edges}),positions=new Map([['a',{x:100,y:100,w:80,h:70}],['b',{x:250,y:300,w:80,h:70}],['o',{x:210,y:110,w:40,h:40}]]);
 positions.context={idx,edges,feedback:new Set(),routeCache:new Map(),reserved:[]};positions.context.routeCache.set('e',L.route(edges[0],positions));return {graph:{nodes,edges,idx,positions,bounds:{x:0,y:0,w:600,h:600},constraint_receipts:[]}};
}
test('release selects physical sides independently of canonical operands and restores exactly; constrained or corrupt policies cannot override ports',()=>{
 const f=portsScene(),raw=JSON.stringify(f.graph.edges),moved=I.move(f,'a',0,2).figure,ctx=moved.graph.positions.context,r=ctx.routeCache.get('e');
 assert.deepEqual(ctx.physicalPortSides.e,['bottom','left']);assert.equal(r.points.length,3);assert.equal(JSON.stringify(moved.graph.edges),raw);assert.equal(f.graph.positions.context.physicalPortSides,undefined);
 const saved=JSON.parse(JSON.stringify(I.placement(moved))),restored=I.restore(f,saved);assert.ok(restored);assert.deepEqual(I.placement(restored).routes,saved.routes);
 for(const sides of [['bad','left'],['bottom'],['top','left','extra']]){const broken=structuredClone(saved);broken.policy.physicalPortSides.e=sides;assert.equal(I.restore(f,broken),null);}
 for(const extra of [{kind:'control'},{design_route:{kind:'bypass'}},{context_lane:{owner:'o'}},{iteration:true},{bundle_members:[]}]){
  const edge={...f.graph.edges[0],...extra};assert.equal(L.allowsPhysicalSides(edge,f.graph.positions),false);
 }
 const unrelated=structuredClone(saved);unrelated.policy.physicalPortSides.unknown=['top','left'];assert.equal(I.restore(f,unrelated),null);
});
// A small structural DOM, with reparenting and attribute accounting. Browser
// verification separately exercises real SVG, pointer capture and commit.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attrs=new Map();this.writes=0;this.parentNode=null;}
 get firstChild(){return this.children[0]||null;}
 setAttribute(k,v){this.attrs.set(k,String(v));this.writes++;}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
 appendChild(n){this.insertBefore(n,null);}insertBefore(n,before){n.remove();const at=before?this.children.indexOf(before):this.children.length;assert.ok(at>=0);this.children.splice(at,0,n);n.parentNode=this;}
 remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
 querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}
}
test('grouped previews preserve paint order, update only boundary ink and restore exact DOM on cancel',()=>{
 const layer=new Element('g'),nodes=new Map(),edges=new Map(),doc={createElementNS:(ns,tag)=>new Element(tag)};
 for(let i=0;i<1000;i++){const n=new Element('g');n.setAttribute('transform',`translate(${i},10)`);layer.appendChild(n);nodes.set('n'+i,n);}
 const still=new Element('g');layer.insertBefore(still,nodes.get('n500'));const original=[...layer.children],moving=new Set(nodes.keys());
 const edgeLayer=new Element('g'),boundary=new Element('g'),ink=new Element('path');ink.setAttribute('d','M0,0 L2000,0');boundary.appendChild(ink);edgeLayer.appendChild(boundary);edges.set('e',boundary);
 const label=new Element('g');label.setAttribute('visibility','visible');edgeLayer.appendChild(label);
 const edge={id:'e',source:'n0',target:'external',route:{points:[{x:0,y:0},{x:2000,y:0}]}};
 const preview=V.create({session:{ids:moving,edges:[edge]},nodes,edges,labels:[{element:label,edge:'e'}],document:doc});assert.equal(preview.stats.groups,2);
 for(let i=0;i<120;i++)preview.update(i,i/2);
 assert.ok([...nodes.values()].every(n=>n.writes===1),'child transforms are not rewritten per frame');assert.equal(label.getAttribute('visibility'),'hidden');
 const flattened=layer.children.flatMap(n=>n.getAttribute('data-move-preview')!==null?n.children:[n]);assert.deepEqual(flattened,original);assert.equal(still.parentNode,layer);
 preview.reset();preview.reset();assert.deepEqual(layer.children,original);assert.equal(ink.getAttribute('d'),'M0,0 L2000,0');assert.equal(label.getAttribute('visibility'),'visible');
});
test('indexed editor ports preserve the original algorithm and exact ordering across unrelated source models',()=>{
 const legacy=require('../verification/dedicated-interaction/baseline/authoring-ports.cjs');
 for(const file of ['verification/input-placement/current/SharedInputPaths.json','data/semantic/0216717d966327f4.json']){
  const ir=JSON.parse(fs.readFileSync(file)),doc=A.fromIR(ir),index=A.portIndex(doc);
  const candidates=doc.nodes.filter(n=>n.kind!=='composite').slice(0,40).concat(doc.nodes.filter(n=>n.kind==='composite').slice(0,25));
  for(const n of candidates)assert.deepEqual(A.ports(doc,n.id,index),legacy.ports(doc,n.id),n.id);
 }
});

test('canonical editor frontiers reuse legal routes and resident undo/redo without losing source facts',()=>{
 const S=require('../semantic_studio/scene-runtime');
 for(const file of ['verification/input-placement/current/SharedInputPaths.json','data/semantic/0216717d966327f4.json']){
  const ir=JSON.parse(fs.readFileSync(file)),raw=JSON.stringify(ir),runtime=S.create();assert.equal(runtime.run({task:'init',epoch:1,ir}).ok,true);
  const state={view:'publication',paperCanonical:true,mode:'source',paperMedium:'canvas',paperComposition:'dependency',paperAuto:false,paperGranularity:'detailed',details:true,open:ir.nodes.filter(n=>!n.parent&&n.kind==='composite').map(n=>n.id)},a=runtime.run({task:'render',epoch:1,state});
  const parent=ir.nodes.find(n=>n.parent&&n.kind==='composite'&&a.figure.graph.positions.has(n.id)),next={...state,open:[...state.open,parent.id]},b=runtime.run({task:'render',epoch:1,state:next,frontier:parent.id,baseKey:a.key});
  assert.equal(b.ok,true,b.error);assert.equal(b.metrics.incremental,true);assert.ok(b.figure.prepared.routing.parent_frontier.reused_routes>0);
  const expected=E.project(ir,next);assert.deepEqual(b.figure.graph.nodes,expected.nodes);assert.deepEqual(b.figure.graph.edges,expected.edges);assert.ok(b.figure.prepared.routes.every(e=>I.physical(e,b.figure.graph.positions)));
  const undo=runtime.run({task:'render',epoch:1,state,baseKey:b.key,frontier:parent.id});assert.equal(undo.key,a.key);assert.equal(undo.metrics.cached,true);
  const redo=runtime.run({task:'render',epoch:1,state:next,baseKey:undo.key,frontier:parent.id});assert.equal(redo.key,b.key);assert.equal(redo.metrics.cached,true);assert.equal(JSON.stringify(ir),raw);
 }
});
test('arrow geometry uses a fixed world-space tip at the physical terminal, independent of bundle stroke width',()=>{
 const R=require('../semantic_studio/publication-renderer');assert.match(R.defs,/refX="9" refY="4"/);assert.match(R.defs,/markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse"/);assert.match(R.defs,/M0 0 L9 4 L0 8Z/);assert.match(R.defs,/fill="context-stroke"/);
 for(const file of ['index.html','authoring.html']){const text=fs.readFileSync('semantic_studio/'+file,'utf8');assert.match(text,/refX="9" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse"/);assert.match(text,/M0 0 L9 4 L0 8Z/);}
});
