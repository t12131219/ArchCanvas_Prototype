'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.EdgeRouterLabRouting=require('../yworks_edge_router_lab/router');
for(const f of ['physical-ports','junction-markers','route-labels','source-contracts','semantic-constraints','graph-engine','runtime-layout','recursive-graph'])require('../yworks_edge_router_lab/'+f);
const G=require('../yworks_edge_router_lab/generic-semantic'),O=SummaryFlowOptimizer,R=EdgeRouterLabRouting;
const copy=v=>structuredClone(v);
function ready(split=false){const g=sample(split);assert.equal(G.route(g,{refineFlow:false,refinePlacement:false,refineChannels:false,refineCrossings:false}).failed,0);valid(g);return g;}
function valid(g){const c=SummaryEngine.validateView(g);assert.equal(c.source.ok,true);assert.equal(c.layout.ok,true,JSON.stringify(c.layout));assert.deepEqual(c.edges.filter(([,v])=>!v.ok),[]);}
function sample(split=false){const n=(id,x,y)=>({id,parent:'r',x,y,w:80,h:44,semantic:{kind:'compute'},expanded:false});const nodes=[{id:'r',x:0,y:0,w:800,h:650,expanded:true,routingObstacle:false,semantic:{kind:'composite'}},n('u',620,480),n('v',100,480),n('a',100,260),n('b',360,260),n('c',620,260),n('z',360,80)];const pairs=split?[['u','a'],['v','b'],['v','c'],['a','z'],['b','z'],['c','z']]:[['v','a'],['v','b'],['v','c']];const edges=pairs.map(([source,target],i)=>({id:'e'+i,source,target,binding:{kind:'data',source,target,source_port:'out',target_port:'in'+i},projection:{presentationSlots:{source:source+':out',target:target+':in'+i}},arrow:'target',style:'orthogonal',waypoints:[],route:[],fixedSource:{side:'top',fraction:.5},fixedTarget:{side:'bottom',fraction:.2+i*.08},portPolicy:{source:{mode:'free',shape:'rectangle',spacing:6},target:{mode:'free',shape:'rectangle',spacing:6}},contract:{source,target,wire:source+':out',gates:[],bus:false,sharedStem:null,minimumTerminal:9,enforcePortApproach:true}}));return {canvas:[800,650],nodes,edges};}

test('same-value fan-outs share a source prefix and derive actual branch dots, with mirrored flow',()=>{
 for(const mirror of [false,true]){const g=sample();if(mirror){for(const n of g.nodes.filter(n=>n.parent))n.y=590-n.y;for(const e of g.edges){e.fixedSource.side='bottom';e.fixedTarget.side='top';}}
 G.route(g,{refineFlow:false,refinePlacement:false,refineChannels:false,refineCrossings:false});valid(g);
 const facts=copy(g.edges.map(e=>e.binding)),before=O.ink(g.edges),stats=R.stats(g.edges);O.fanouts(g,G.routeOptions(),1500);valid(g);
 assert.ok(g.nativeFanoutRefinement.accepted>0);assert.ok(O.ink(g.edges)<before);assert.ok(R.stats(g.edges).crossings<=stats.crossings);assert.deepEqual(g.edges.map(e=>e.binding),facts);
 const markers=O.markers({...g,generic:{}});assert.ok(markers.length);for(const m of markers){assert.ok(m.edges.length>=2);assert.equal(new Set(m.edges.map(id=>g.edges.find(e=>e.id===id).contract.wire)).size,1);}
 const renamed=copy(g);for(const n of renamed.nodes)n.semantic.label='Independent name';assert.deepEqual(O.markers({...renamed,generic:{}}),markers);
 }
});
test('distinct values, source slots, bundles, conditional uses, drafts and manual routes never gain a fabricated common trunk',()=>{
 for(const variant of ['value','slot','bundle','condition','effect','mutable','draft','manual','curved','octilinear','missing-value','scope','policy']){
 const g=ready();for(const [i,e]of g.edges.entries()){
 if(variant==='value')e.contract.wire='distinct call '+i;
 if(variant==='slot')e.projection.presentationSlots.source='slot '+i;
 if(variant==='bundle')e.binding.bundle_members=[copy(e.binding)];
 if(variant==='condition')e.binding.condition={predicate:'p',branch:i};
 if(variant==='effect')e.binding.kind='state-write';
 if(variant==='draft')e.draft=true;
 if(variant==='curved'||variant==='octilinear')e.style=variant;
 if(variant==='missing-value')delete e.contract.wire;
 if(variant==='manual')e.waypoints=[{x:300,y:400}];
 }if(variant==='mutable')g.nodes.find(n=>n.id==='v').semantic.mutable=true;
 const before=copy(g.edges);O.fanouts(g,G.routeOptions({...variant==='scope'?{flowEdges:new Set()}:variant==='policy'?{policy:'never'}:{}}),1500);
 assert.deepEqual(g.edges,before,variant);assert.equal(O.markers({...g,generic:{}}).length,variant==='scope'||variant==='policy'?1:0,variant);
 }
});
test('unordered sibling modules move as geometry only, grouping the actual shared input and reducing crossings',()=>{
 const g=ready(true),facts=copy(g.edges.map(e=>[e.id,e.source,e.target,e.binding])),before=R.stats(g.edges),parents=g.nodes.map(n=>[n.id,n.parent]);
 O.reorder(g,G.routeOptions(),1500);valid(g);assert.ok(g.nativeSiblingRefinement.accepted>0);assert.ok(R.stats(g.edges).crossings<before.crossings);assert.ok(R.stats(g.edges).length<before.length);
 const x=id=>g.nodes.find(n=>n.id===id).x;assert.ok(x('b')<x('a'));assert.ok(x('c')<x('a'));
 assert.deepEqual(g.edges.map(e=>[e.id,e.source,e.target,e.binding]),facts);assert.deepEqual(g.nodes.map(n=>[n.id,n.parent]),parents);
 const renamed=ready(true);for(const n of renamed.nodes)n.semantic.label='Different';O.reorder(renamed,G.routeOptions(),1500);assert.deepEqual(renamed.nodes.map(n=>[n.id,n.x,n.y]),g.nodes.map(n=>[n.id,n.x,n.y]));
});
test('permutation proposals respect transitive dependencies, control, effects, loops and opaque/conditional descendants',()=>{
 for(const variant of ['data','control','transitive','effect','iteration','condition','opaque','nested']){
 const g=ready(true),a=g.nodes.find(n=>n.id==='a'),b=g.nodes.find(n=>n.id==='b');
 if(['data','control','effect','iteration'].includes(variant))g.edges.push({source:'a',target:'b',binding:{kind:variant==='control'?'control':variant==='effect'?'state-write':'data',...(variant==='iteration'?{iteration:1}:{})}});
 if(variant==='transitive')g.edges.push({source:'a',target:'z',binding:{kind:'data'}},{source:'z',target:'b',binding:{kind:'data'}});
 if(variant==='condition')a.semantic.condition={predicate:'p'};
 if(variant==='opaque')a.semantic.kind='opaque';
 if(variant==='nested'){a.expanded=true;g.nodes.push({id:'inner',parent:'a',x:a.x+5,y:a.y+5,w:30,h:25,semantic:{kind:'state',mutable:true}});}
 const rows=O.rowCandidates(g);assert.ok(rows.every(p=>!p.from.includes('a')),variant);
 }
});
test('zero budget and large cuts preserve geometry, while moving a shared consumer keeps legal connections and truthful dots',()=>{
 const g=ready(true),before=copy(g);O.reorder(g,G.routeOptions(),0);O.fanouts(g,G.routeOptions(),0);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);
 const large=copy(g);large.nodes.push(...Array.from({length:301},(_,i)=>({id:'extra'+i})));const edges=copy(large.edges);O.reorder(large,G.routeOptions(),100);O.fanouts(large,G.routeOptions(),100);assert.deepEqual(large.edges,edges);
 const movable=ready();O.fanouts(movable,G.routeOptions(),1000);SummaryEngine.move(movable,'c',12,0,G.routeOptions());valid(movable);assert.equal(movable.lastMove.blocked,false);
 for(const m of O.markers({...movable,generic:{}}))assert.ok(m.edges.every(id=>SummaryJunctionMarkers.contains(movable.edges.find(e=>e.id===id).route,m.point)));
});

test('a scoped flow pass changes only selected edges and current native documents preserve forks across save/load',()=>{
 const scoped=ready(),untouched=structuredClone(scoped.edges.slice(0,2));O.fanouts(scoped,G.routeOptions({flowEdges:new Set(['e2'])}),1000);valid(scoped);assert.deepEqual(scoped.edges.slice(0,2),untouched);
 const fs=require('fs'),ir=JSON.parse(fs.readFileSync('data/semantic/d6df94c94e8a5888.json')),g=G.build(ir);G.route(g);valid(g);
 const doc=G.document(g),loaded=G.read(doc),restored=G.restore(G.build(loaded.ir,loaded.state),loaded.nativeLayout);valid(restored);assert.deepEqual(O.markers(restored),O.markers(g));assert.deepEqual(G.layoutSnapshot(restored),G.layoutSnapshot(g));
 for(const version of [11,12,13]){doc.renderer='native-semantic/'+version;const migrated=G.read(doc);assert.equal(migrated.nativeLayout,null);assert.deepEqual(migrated.migration.previousNativeLayout,doc.nativeLayout);assert.deepEqual(migrated.ir,ir);}
});

function dogleg(){
 const g=sample();g.edges=g.edges.slice(1);
 for(const e of g.edges){const target=g.nodes.find(n=>n.id===e.target);e.fixedSource={side:'top',fraction:.5};e.fixedTarget={side:'bottom',fraction:.5};
 e.route=[{x:140,y:480},{x:140,y:420},{x:260,y:420},{x:260,y:440},{x:300,y:440},{x:300,y:360},{x:target.x+40,y:360},{x:target.x+40,y:304}];}
 valid(g);return g;
}
test('local shortcut removes shared cross-region doglegs without changing endpoints or facts',()=>{
 for(const mirror of [false,true]){const g=dogleg();if(mirror){for(const n of g.nodes)n.x=800-n.x-n.w;for(const e of g.edges)for(const p of e.route)p.x=800-p.x;}valid(g);
 const facts=copy(g.edges.map(e=>[e.binding,e.contract,e.fixedSource,e.fixedTarget])),before=R.stats(g.edges),painted=O.ink(g.edges);
 O.shortcuts(g,G.routeOptions(),1000);valid(g);assert.ok(g.nativeShortcutRefinement.accepted);assert.ok(R.stats(g.edges).bends<before.bends);assert.ok(R.stats(g.edges).length<before.length);assert.ok(O.ink(g.edges)<=painted);assert.deepEqual(g.edges.map(e=>[e.binding,e.contract,e.fixedSource,e.fixedTarget]),facts);
 for(const m of O.markers({...g,generic:{}}))assert.ok(m.edges.every(id=>SummaryJunctionMarkers.contains(g.edges.find(e=>e.id===id).route,m.point)));
 }
});
test('shortcut preserves obstacles, manual routes, scope, budgets and non-orthogonal modes',()=>{
 for(const variant of ['manual','bus','draft','pending','curve','octilinear','never','scope','zero','large']){
 const g=dogleg();for(const e of g.edges){if(variant==='manual')e.waypoints=[{x:260,y:440}];if(variant==='bus')e.contract.bus=true;if(variant==='draft')e.draft=true;if(variant==='pending')e.pendingRouting=true;if(variant==='curve')e.style='curved';if(variant==='octilinear')e.style='octilinear';}
 if(variant==='large')g.nodes.push(...Array.from({length:301},(_,i)=>({id:'extra'+i})));
 const saved=copy(g.edges);O.shortcuts(g,G.routeOptions({...variant==='never'?{policy:'never'}:variant==='scope'?{flowEdges:new Set()}:{} }),variant==='zero'?0:1000);assert.deepEqual(g.edges,saved,variant);
 }
 const g=dogleg();g.nodes.push({id:'wall',parent:'r',x:160,y:345,w:80,h:65,semantic:{kind:'compute'}});valid(g);O.shortcuts(g,G.routeOptions(),1000);valid(g);
 const scoped=dogleg(),peer=copy(scoped.edges[1]);O.shortcuts(scoped,G.routeOptions({flowEdges:new Set([scoped.edges[0].id])}),1000);assert.deepEqual(scoped.edges[1],peer);valid(scoped);
});

test('unrelated near-parallel wires separate while exact shared values and terminal clearance remain intact',()=>{
 const make=()=>{const g=dogleg();for(const [i,e]of g.edges.entries()){e.contract.wire='different-value:'+i;e.projection.presentationSlots.source='different-slot:'+i;e.fixedSource.fraction=.4+i*.2;const x=132+i*16,t=g.nodes.find(n=>n.id===e.target);e.route=[{x,y:480},{x,y:420+i*1.6},{x:t.x+40,y:420+i*1.6},{x:t.x+40,y:304}];}valid(g);return g;};
 for(const mirror of [false,true]){const g=make();if(mirror){for(const n of g.nodes)n.y=650-n.y-n.h;for(const e of g.edges){e.fixedSource.side='bottom';e.fixedTarget.side='top';for(const p of e.route)p.y=650-p.y;}}valid(g);
 const facts=copy(g.edges.map(e=>[e.binding,e.contract])),near=O.proximity(g.edges),stats=R.stats(g.edges);assert.ok(near>0);O.separate(g,G.routeOptions(),1000);valid(g);assert.ok(g.nativeSeparationRefinement.accepted);assert.ok(O.proximity(g.edges)<near);assert.ok(R.stats(g.edges).bends<=stats.bends);assert.ok(R.stats(g.edges).crossings<=stats.crossings);assert.deepEqual(g.edges.map(e=>[e.binding,e.contract]),facts);
 for(const e of g.edges)assert.ok(R.dist(e.route[0],e.route[1])>=9);
 }
 for(const variant of ['manual','never','zero','scope','curve','bus','large','disabled']){const g=make();if(variant==='large')g.nodes.push(...Array.from({length:301},(_,i)=>({id:'x'+i})));for(const e of g.edges){if(variant==='manual')e.waypoints=[copy(e.route[1])];if(variant==='curve')e.style='curved';if(variant==='bus')e.contract.bus=true;}const saved=copy(g.edges);O.separate(g,G.routeOptions({...variant==='scope'?{flowEdges:new Set()}:variant==='never'?{policy:'never'}:variant==='disabled'?{edgeSpacing:0}:{}}),variant==='zero'?0:1000);assert.deepEqual(g.edges,saved,variant);}
 const shared=make();for(const e of shared.edges){e.contract.wire='same';e.projection.presentationSlots.source='same';}assert.equal(O.proximity(shared.edges),0);const saved=copy(shared.edges);O.separate(shared,G.routeOptions(),1000);assert.deepEqual(shared.edges,saved);
 const scoped=make(),peer=copy(scoped.edges[1]);O.separate(scoped,G.routeOptions({flowEdges:new Set([scoped.edges[0].id])}),1000);assert.deepEqual(scoped.edges[1],peer);valid(scoped);
});

function crossedJoin(){
 const g=ready(true),es=g.edges.filter(e=>e.target==='z');
 for(const [i,e]of es.entries()){const n=g.nodes.find(n=>n.id===e.source);e.physicalSource={side:'top',fraction:.5};e.physicalTarget={side:'bottom',fraction:.8-i*.3};const s=SummaryPhysicalPorts.point(n,e.physicalSource),t=SummaryPhysicalPorts.point(g.nodes.find(n=>n.id==='z'),e.physicalTarget);e.route=[s,{x:s.x,y:180+i*12},{x:t.x,y:180+i*12},t];}
 valid(g);return g;
}
test('parallel convergence jointly reserves ordered input slots, preserves operands, and handles reversed flow and renamed roles',()=>{
 for(const mirror of [false,true]){const g=crossedJoin();if(mirror){for(const n of g.nodes.filter(n=>n.parent))n.y=650-n.y-n.h;for(const e of g.edges){for(const name of ['fixedSource','fixedTarget','physicalSource','physicalTarget'])if(e[name])e[name].side=e[name].side==='top'?'bottom':e[name].side==='bottom'?'top':e[name].side;for(const p of e.route)p.y=650-p.y;}}valid(g);
 const facts=copy(g.edges.map(e=>[e.id,e.binding,e.contract])),before=R.stats(g.edges);O.convergence(g,G.routeOptions(),1000);valid(g);assert.ok(g.nativeConvergenceRefinement.accepted>0);assert.ok(R.stats(g.edges).crossings<before.crossings);assert.deepEqual(g.edges.map(e=>[e.id,e.binding,e.contract]),facts);
 const incoming=g.edges.filter(e=>e.target==='z').sort((a,b)=>g.nodes.find(n=>n.id===a.source).x-g.nodes.find(n=>n.id===b.source).x);assert.ok(incoming.every((e,i)=>!i||e.physicalTarget.fraction>incoming[i-1].physicalTarget.fraction));
 const named=crossedJoin();for(const n of named.nodes)n.label='Arbitrary role';O.convergence(named,G.routeOptions(),1000);valid(named);assert.ok(named.nativeConvergenceRefinement.accepted);
 }
 for(const variant of ['scope','never','zero','manual','condition','effect','opaque','large']){const g=crossedJoin();if(variant==='manual')g.edges[0].waypoints=[copy(g.edges[0].route[1])];if(variant==='condition')g.edges.find(e=>e.target==='z').binding.condition={predicate:'p'};if(variant==='effect')g.edges[0].binding.kind='state-write';if(variant==='opaque')g.nodes.find(n=>n.id==='a').semantic.kind='opaque';if(variant==='large')g.nodes.push(...Array.from({length:301},(_,i)=>({id:'extra'+i})));const saved=copy(g.edges),nodes=copy(g.nodes);O.convergence(g,G.routeOptions({...variant==='scope'?{flowEdges:new Set()}:variant==='never'?{policy:'never'}:{}}),variant==='zero'?0:1000);assert.deepEqual(g.edges,saved,variant);assert.deepEqual(g.nodes,nodes,variant);}
});

test('a route tangent to a leaf border clears the border in either flow direction without changing its owner or endpoints',()=>{
 for(const mirror of [false,true]){const g=sample();g.edges=[g.edges[1]];const e=g.edges[0];e.fixedSource={side:'top',fraction:.5};e.fixedTarget={side:'bottom',fraction:.5};e.route=[{x:140,y:480},{x:140,y:420},{x:400,y:420},{x:400,y:304}];g.nodes.push({id:'leaf-border',parent:'r',x:200,y:420,w:150,h:44,semantic:{kind:'compute'}});
 if(mirror){for(const n of g.nodes.filter(n=>n.parent))n.y=650-n.y-n.h;e.fixedSource.side='bottom';e.fixedTarget.side='top';for(const p of e.route)p.y=650-p.y;}valid(g);
 const before=O.borders(g,e.route).cost,facts=copy(e.binding),ends=copy([e.route[0],e.route.at(-1)]);assert.ok(before>0);O.separate(g,G.routeOptions({borderClearance:true}),1000);valid(g);assert.ok(O.borders(g,e.route).cost<before);assert.deepEqual(e.binding,facts);assert.deepEqual([e.route[0],e.route.at(-1)],ends);
 }
});
function terminalPair(){const g=sample(true);g.nodes=g.nodes.filter(n=>['r','u','v','z'].includes(n.id));g.edges=g.edges.slice(0,2);for(const [i,e]of g.edges.entries()){e.target=e.binding.target=e.contract.target='z';e.fixedSource={side:'top',fraction:.5};e.fixedTarget={side:'bottom',fraction:.4+i*.1};const x=e.source==='u'?660:140,t=392+i*8;e.route=[{x,y:480},{x,y:450-i*20},{x:t,y:450-i*20},{x:t,y:124}];}valid(g);return g;}
test('near-coincident terminal rays slide presentation slots while preserving canonical operands and scoped/manual policies',()=>{
 const g=terminalPair(),facts=copy(g.edges.map(e=>[e.binding,e.fixedTarget,e.contract])),before=O.proximity(g.edges);assert.ok(before>0);O.terminals(g,G.routeOptions(),1000);valid(g);assert.ok(g.nativeTerminalRefinement.accepted);assert.ok(O.proximity(g.edges)<before);assert.deepEqual(g.edges.map(e=>[e.binding,e.fixedTarget,e.contract]),facts);
 for(const variant of ['manual','bus','scope','never','zero','large','curve','disabled']){const g=terminalPair();for(const e of g.edges){if(variant==='manual')e.waypoints=[copy(e.route[1])];if(variant==='bus')e.contract.bus=true;if(variant==='curve')e.style='curved';}if(variant==='large')g.nodes.push(...Array.from({length:301},(_,i)=>({id:'extra'+i})));const saved=copy(g.edges);O.terminals(g,G.routeOptions({...variant==='scope'?{flowEdges:new Set()}:variant==='never'?{policy:'never'}:variant==='disabled'?{edgeSpacing:0}:{}}),variant==='zero'?0:1000);assert.deepEqual(g.edges,saved,variant);}
 const scoped=terminalPair(),peer=copy(scoped.edges[1]);O.terminals(scoped,G.routeOptions({flowEdges:new Set([scoped.edges[0].id])}),1000);valid(scoped);assert.deepEqual(scoped.edges[1],peer);
});
