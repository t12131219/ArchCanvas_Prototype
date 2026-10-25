'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../semantic_studio/semantic-engine'),P=require('../semantic_studio/publication'),I=require('../semantic_studio/canvas-interaction'),G=require('../semantic_studio/geometry-index');
const oracle=require('../verification/interaction-performance/baseline/interaction-oracle.cjs');
const L=require('../semantic_studio/architecture-layout');
test('spatial drag checks preserve the linear oracle including clamping, existing overlap and prior legal deltas',()=>{
 let seed=91;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)%4000)-2000;
 for(let scene=0;scene<18;scene++){
  const origins=new Map(Array.from({length:80},(_,i)=>[String(i),{x:rand(),y:rand(),w:Math.abs(rand()%190)+1,h:Math.abs(rand()%110)+1}]));
  const obstacles=Array.from({length:300},()=>({x:rand(),y:rand(),w:Math.abs(rand()%150)+1,h:Math.abs(rand()%90)+1}));
  if(scene%3===0)obstacles.push({...origins.get('1')});
  const s={id:'0',origins,obstacles,obstacleIndex:G.boxes(obstacles),parent:scene%2?{x:-2000,y:-2000,w:4000,h:4000,header:50}:null,bounds:{x:-2200,y:-2200,w:4400,h:4400},dx:3,dy:-7};
  for(const [dx,dy]of [[NaN,0],[Infinity,3],[0,0],[-10000,10000],...Array.from({length:25},()=>[rand(),rand()])])assert.deepEqual(I.constrain(s,dx,dy),oracle.constrain({...s,parent:s.parent&&{...s.parent,header:0}},dx,dy));
 }
});
test('cached wrapped text retains exact characters, line breaks and independent mutable result arrays',()=>{
 const words=['a_veryLongIdentifier.with.MixedCASE','共享参数 / Q → K → V','   leading trailing  ','a\n b\t c','MWilI@#%','🙂value · readonly', ''];
 for(const word of words)for(const limit of [0,20,90,300,Infinity])for(const font of [12,13,16,19.25]){
  const expected=oracle.wrap(word,limit,font),first=P.wrap(word,limit,font);assert.deepEqual(first,expected);first.push('must not leak');assert.deepEqual(P.wrap(word,limit,font),expected);
 }
});
function wide(){
 const nodes=[{id:'root',parent:null},...Array.from({length:180},(_,i)=>({id:'n'+i,parent:'root'}))],idx=E.index({nodes}),positions=new Map([['root',{x:0,y:0,w:30000,h:1000,header:40,expanded:true}],...nodes.slice(1).map((n,i)=>[n.id,{x:20+i*80,y:100,w:50,h:50}])]);
 positions.context={idx,edges:[],routeCache:new Map(),reserved:[]};return {graph:{nodes,edges:[],idx,positions,bounds:{x:0,y:0,w:30000,h:1000},constraint_receipts:[]}};
}
test('indexed saved geometry accepts valid wide siblings and rejects newly colliding or escaping children',()=>{
 const f=wide(),saved=I.placement(f);saved.positions.find(p=>p[0]==='n20')[1]+=2;const a=I.restore(f,saved);assert.ok(a);assert.equal(a.graph.positions.get('n20').x,f.graph.positions.get('n20').x+2);
 const bad=E.clone(saved);bad.positions.find(p=>p[0]==='n20')[1]=f.graph.positions.get('n21').x;assert.equal(I.restore(f,bad),null);
 const outside=E.clone(saved);outside.positions.find(p=>p[0]==='n20')[2]=-10;assert.equal(I.restore(f,outside),null);
 assert.ok(I.restore(f,I.placement(f)));assert.equal(f.graph.positions.get('n20').x,1620);
});
test('translated circular ports survive JSON restoration while real terminal displacement is rejected',()=>{
 const nodes=[{id:'a',parent:null},{id:'b',parent:null}],edges=['e1','e2'].map(id=>({id,source:'a',target:'b',kind:'data'})),idx=E.index({nodes,edges});
 const positions=new Map([['a',{x:10,y:100,w:50,h:60}],['b',{x:200,y:100,w:40,h:40,symbol:true}]]);
 positions.context={idx,edges,feedback:new Set(),routeCache:new Map(),reserved:[]};
 const routes=edges.map(e=>({...e,route:L.route(e,positions)}));positions.context.routeCache=new Map(routes.map(e=>[e.id,e.route]));
 const f={graph:{nodes,edges,idx,positions,bounds:{x:0,y:0,w:600,h:600},constraint_receipts:[]}},saved=JSON.parse(JSON.stringify(I.placement(f)));
 for(const p of saved.positions)p[1]+=51.3;for(const [,r]of saved.routes)for(const p of r.points)p.x+=51.3;
 const restored=I.restore(f,saved);assert.ok(restored);
 const canonical=L.route(edges[0],restored.graph.positions,{terminalsOnly:true}).points.at(-1),actual=saved.routes[0][1].points.at(-1);
 assert.notEqual(actual.x,canonical.x,'fixture must exercise translation roundoff');assert.ok(Math.abs(actual.x-canonical.x)<1e-12);
 assert.deepEqual(I.placement(restored).routes,saved.routes,'restoration retains the saved paths exactly');
 const wrong=E.clone(saved);wrong.routes[0][1].points.at(-1).x-=1e-6;
 assert.equal(I.physical({...edges[0],route:wrong.routes[0][1]},restored.graph.positions),true,'a physically legal path must still fail the terminal check');
 assert.equal(I.restore(f,wrong),null);assert.equal(positions.get('b').x,200);
});
