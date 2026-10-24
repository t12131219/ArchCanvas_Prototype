'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine'),I=require('../semantic_studio/canvas-interaction'),S=require('../semantic_studio/scene-runtime'),Client=require('../semantic_studio/scene-client');
const read=p=>JSON.parse(fs.readFileSync(p)),ir=read('verification/input-placement/current/SharedInputPaths.json');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperComposition:'architecture',paperDirection:'down',paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
const init=value=>{const rt=S.create();assert.equal(rt.run({task:'init',epoch:1,ir:value}).ok,true);return rt;};
const render=(rt,state,extra={})=>{const r=rt.run({task:'render',epoch:1,state,...extra});assert.equal(r.ok,true,r.error);return r;};
test('frontier cache ignores navigation receipts and open-set order while preserving the current document',()=>{
 const rt=init(ir),a=render(rt,state),next={...state,open:state.open.slice().reverse(),paperFrontierReturn:{view:'source',open:['return-here']},paperFrontierRecipe:{note:'current evidence'}};
 const b=render(rt,next);assert.equal(b.key,a.key);assert.equal(b.metrics.cached,true);assert.deepEqual(b.state,next);
 assert.equal(R.renderPrepared(ir,b.state,b.figure).svg,R.renderPrepared(ir,a.state,a.figure).svg);
 for(const change of [{paperDirection:'up'},{mode:'merged'},{paperRoleDetails:['another-role']},{canvasPlacement:{identity:'different'}},{paperFocus:'another-focus'}])
  assert.notEqual(S.frontierKey({...state,...change}),S.frontierKey(state));
});
test('frequently revisited parents survive eviction and model initialization clears all cache aliases',()=>{
 const rt=init(ir),a=render(rt,state);for(let i=0;i<5;i++)render(rt,{...state,paperWidthMm:150+i});
 assert.equal(render(rt,state).key,a.key);render(rt,{...state,paperWidthMm:170});assert.equal(render(rt,state).key,a.key);
 rt.run({task:'init',epoch:2,ir:E.clone(ir)});assert.equal(rt.run({task:'render',epoch:1,state}).stale,true);
 assert.equal(rt.run({task:'render',epoch:2,state}).metrics.cached,false);
});
function checkToggle(value,s){
 const raw=JSON.stringify(value),rt=init(value),a=render(rt,s),id=s.open[1],closed={...s,open:s.open.filter(v=>v!==id)};
 const b=render(rt,closed,{frontier:id,baseKey:a.key});assert.equal(b.metrics.incremental,true);assert.ok(b.figure.prepared.routing.parent_frontier.reused_routes>0);
 assert.equal(JSON.stringify(value),raw);assert.deepEqual(b.figure.prepared.quality.issues,[]);assert.ok(b.figure.prepared.routes.every(e=>I.physical(e,b.figure.graph.positions)));
 const canonical=E.project(value,{paperSampleFrame:true,paperReadBindingRows:true,paperSourceHeadings:true,...closed});
 assert.deepEqual(b.figure.graph.node_accounting,canonical.node_accounting);assert.deepEqual(b.figure.graph.edge_accounting,canonical.edge_accounting);
 const saved=JSON.parse(JSON.stringify(b.state)),expected=R.renderPrepared(value,b.state,b.figure).svg;
 const reopened=render(init(value),saved);assert.ok(reopened.state.canvasPlacement);assert.equal(R.renderPrepared(value,saved,reopened.figure).svg,expected);assert.equal(R.render(value,saved).svg,expected);
 const coldOpen=R.prepareFrontier(value,s,b.figure,id);assert.ok(coldOpen,'first expansion must also reuse routes');assert.equal(coldOpen.graph.nodes.length,a.figure.graph.nodes.length);
 assert.deepEqual(coldOpen.graph.node_accounting,a.figure.graph.node_accounting);assert.deepEqual(coldOpen.graph.edges,a.figure.graph.edges);
 assert.ok(coldOpen.prepared.routes.every(e=>I.physical(e,coldOpen.graph.positions)));
 // Toggle back, then revisit the closed parent through the request alias.
 const c=render(rt,{...s,open:s.open.slice().reverse()},{frontier:id,baseKey:b.key});assert.equal(c.key,a.key);assert.equal(c.metrics.cached,true);
 const d=render(rt,closed,{frontier:id,baseKey:c.key});assert.equal(d.key,b.key);assert.equal(d.metrics.cached,true);assert.ok(d.state.canvasPlacement);
 assert.equal(R.renderPrepared(value,d.state,d.figure).svg,expected);
 return {a,b};
}
test('ordinary parent toggles reuse legal routes and save/reopen exactly with complete canonical accounting',()=>checkToggle(ir,state));
test('parent optimization also works after all source node and edge identities are renamed',()=>{
 const ids=new Map([...ir.nodes,...ir.edges].map((n,i)=>[n.id,'renamed-'+i]));
 const rename=x=>Array.isArray(x)?x.map(rename):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,rename(v)])):ids.get(x)||x;
 checkToggle(rename(ir),rename(state));
});
test('ineligible or physically conflicting incremental candidates return to the complete renderer',()=>{
 const a=R.prepareFigure(ir,state),id=state.open[1],closed={...state,open:state.open.filter(v=>v!==id)};
 assert.equal(R.prepareFrontier(ir,{...closed,paperAuto:true},a,id),null);
 assert.equal(R.prepareFrontier(ir,closed,a,'missing'),null);
 assert.equal(R.prepareFrontier(ir,state,a,id),null);
 const rt=init(ir),base=render(rt,state),b=render(rt,{...closed,paperDirection:'up'},{frontier:id,baseKey:base.key});assert.equal(b.metrics.incremental,false);
 assert.equal(R.renderPrepared(ir,b.state,b.figure).svg,R.render(ir,{...closed,paperDirection:'up'}).svg);
 const saved=I.placement(a);saved.layout={paperFocus:'forged',paperArchitecturePathRows:'forged',paperArchitectureStreams:'forged'};assert.deepEqual(I.placementLayout(saved),{});
});
test('conditional, unknown and state boundaries retain every fact when a parent is toggled or its candidate falls back',()=>{
 for(const name of ['ConditionalStack','UnknownStack','StateStack']){
  const value=read('verification/semantic-generalization/current/'+name+'.json'),raw=JSON.stringify(value),s={...state,open:value.nodes.filter(n=>n.kind==='composite').map(n=>n.id)},rt=init(value),a=render(rt,s);
  const parent=a.figure.graph.nodes.find(n=>n.parent&&a.figure.graph.positions.get(n.id).expanded);assert.ok(parent,name+' requires an expandable parent');
  const next={...s,open:s.open.filter(id=>id!==parent.id)},b=render(rt,next,{frontier:parent.id,baseKey:a.key}),g=b.figure.graph;
  assert.equal(JSON.stringify(value),raw);
  for(const [key,items]of [['node_accounting',value.nodes],['edge_accounting',value.edges]]){
   const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
  }
  assert.deepEqual(g.node_accounting,E.project(value,{paperSampleFrame:true,paperReadBindingRows:true,paperSourceHeadings:true,...next}).node_accounting);
 }
});
test('a timed-out worker is terminated and never repeats the expensive operation on the UI thread',async()=>{
 let fallbacks=0;const workers=[];
 const client=Client.create({timeoutMs:25,fallback(){fallbacks++;throw Error('must not run');},workerFactory(){
  const w={postMessage(m){if(m.task==='init')queueMicrotask(()=>w.onmessage({data:{requestId:m.requestId,ok:true}}));else if(workers.length>1)queueMicrotask(()=>w.onmessage({data:{requestId:m.requestId,ok:true,metrics:{cached:true}}}));},terminate(){w.terminated=true;}};
  workers.push(w);return w;
 }});
 try{client.init(ir);const r=await client.request({task:'render',state});assert.equal(r.ok,false);assert.equal(r.execution,'worker-timeout');assert.match(r.error,/超时/);assert.equal(workers[0].terminated,true);assert.equal(fallbacks,0);
  const next=await client.request({task:'render',state});assert.equal(next.ok,true);assert.equal(next.execution,'worker');assert.equal(fallbacks,0);
 }finally{client.dispose();}
});
