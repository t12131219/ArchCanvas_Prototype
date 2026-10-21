'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const before=require('../verification/route-memoization/experiment/architecture-layout-before.js');
const candidate=require('../semantic_studio/architecture-layout.js');
function scene(nodes,edges){
 const positions=new Map(nodes.map(n=>[n.id,{id:n.id,x:n.x,y:n.y,w:n.w||82,h:n.h||54,...n}]));
 // Compare score memoization under the archived obstacle policy. The new
 // default title passages have separate geometry and fidelity tests.
 positions.context={protectFrameTitles:true,idx:{nodes:new Map(nodes.map(n=>[n.id,{id:n.id,parent:n.parent??null}]))},edges,feedback:new Set(),reserved:[],crossingCost:18,contactCost:0};
 return positions;
}
function replay(positions,edges,policies){
 let checks=0;
 for(const policy of policies){
  Object.assign(positions.context,policy,{reserved:[]});
  for(const e of edges){
   const a=before.route(e,positions),b=candidate.route(e,positions);assert.deepEqual(b,a,'route '+e.id+' '+JSON.stringify(policy));checks++;
   for(let i=1;i<a.points.length;i++)positions.context.reserved.push([a.points[i-1],a.points[i]]);
  }
 }
 return checks;
}
const policies=[{portOrder:'canonical',crossingCost:18,contactCost:0,stubLength:16},
 {portOrder:'neighbors',crossingCost:90,contactCost:0,stubLength:16},
 {portOrder:'neighbors',crossingCost:540,contactCost:1080,stubLength:8}];
test('cached scores preserve exact routes after reservations, policies, order and geometry change',()=>{
 const nodes=[{id:'a',x:40.25,y:20.125},{id:'b',x:160.75,y:20.125},{id:'c',x:100.5,y:170.875},
  {id:'d',x:20.25,y:320.625},{id:'e',x:190.75,y:320.625}];
 const edges=[['a','c'],['b','c'],['c','d'],['c','e'],['a','e'],['b','d']].map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'arg:'+i}));
 const p=scene(nodes,edges);assert.equal(replay(p,edges,policies),18);
 p.get('c').x+=17.75;p.get('e').y+=31.125;
 assert.equal(replay(p,edges.slice().reverse(),policies),18);
});
test('nested frames, inward control ports and existing bypass/context lanes retain exact geometry',()=>{
 const nodes=[{id:'owner',x:0,y:0,w:600,h:600,expanded:true,header:80,protected_header_height:60,design_gutter:80,context_gutter:64},
  {id:'source',x:120,y:110,parent:'owner'},{id:'inner',x:110,y:240,w:390,h:240,parent:'owner',expanded:true,header:70},
  {id:'sink',x:290,y:340,parent:'inner'},{id:'outside',x:740,y:190}];
 const edges=[{id:'control-in',source:'owner',target:'source',kind:'control'},
  {id:'flow',source:'source',target:'sink'},
  {id:'bypass',source:'source',target:'sink',design_route:{kind:'bypass',owner:'owner'}},
  {id:'context',source:'outside',target:'sink',context_lane:{owner:'owner',side:'right',index:0}},
  {id:'control-out',source:'sink',target:'owner',kind:'control'}];
 const p=scene(nodes,edges);assert.equal(replay(p,edges,[...policies,{...policies[1],ancestorPorts:'header'}]),20);
});
test('circular endpoints, feedback and degenerate reserved segments preserve obstacle/contact decisions',()=>{
 const nodes=[{id:'sum',x:80,y:80,w:48,h:48,symbol:'+'},{id:'other',x:250,y:180},
  {id:'start',x:15,y:230},{id:'block',x:150,y:210,w:80,h:70}];
 const edges=[{id:'a',source:'start',target:'sum'},{id:'b',source:'sum',target:'other'},
  {id:'feedback',source:'other',target:'sum'},{id:'self',source:'sum',target:'sum'}];
 const p=scene(nodes,edges);p.context.feedback.add('feedback');
 const reserved=[[{x:150,y:180},{x:150,y:180}],[{x:128,y:104},{x:210,y:104}]];
 for(const policy of policies){Object.assign(p.context,policy,{reserved});for(const e of edges)assert.deepEqual(candidate.route(e,p),before.route(e,p));}
});
test('deterministic varied unfamiliar graphs preserve every terminal, failure and orthogonal route',()=>{
 let seed=731921;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};let checked=0;
 for(let sceneIndex=0;sceneIndex<24;sceneIndex++){
  const nodes=Array.from({length:8},(_,i)=>({id:'n'+i,x:(i%3)*150+random()*20,y:Math.floor(i/3)*145+random()*20,w:64+random()*20,h:48+random()*20}));
  const edges=Array.from({length:12},(_,i)=>{const source=Math.floor(random()*8),target=Math.floor(random()*8);return {id:'e'+i,source:'n'+source,target:'n'+target,
   kind:i%7===0?'control':'data',source_port:i%3?'out':'slot:0',target_port:'arg:'+i};});
  checked+=replay(scene(nodes,edges),sceneIndex%2?edges.slice().reverse():edges,policies);
 }
 assert.equal(checked,864);
});
