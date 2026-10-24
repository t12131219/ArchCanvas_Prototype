'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{Worker}=require('node:worker_threads');
const E=require('../semantic_studio/semantic-engine'),R=require('../semantic_studio/publication-renderer'),I=require('../semantic_studio/canvas-interaction'),S=require('../semantic_studio/scene-runtime'),Client=require('../semantic_studio/scene-client');
const read=p=>JSON.parse(fs.readFileSync(p));
const ir=read('verification/input-placement/current/SharedInputPaths.json');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperComposition:'architecture',paperDirection:'down'};
function initialized(value=ir){const runtime=S.create();assert.equal(runtime.run({task:'init',epoch:1,ir:value}).ok,true);return runtime;}
function geometry(){
 const nodes=[['root',null],['a','root'],['aa','a'],['b','root']].map(([id,parent])=>({id,parent})),idx=E.index({nodes});
 const positions=new Map([['root',{x:0,y:0,w:500,h:400,header:40,expanded:true}],['a',{x:40,y:70,w:140,h:160,header:30,expanded:true}],['aa',{x:60,y:120,w:80,h:50}],['b',{x:300,y:70,w:120,h:160}]]);
 positions.context={idx,edges:[],routeCache:new Map(),reserved:[]};return {graph:{nodes,edges:[],idx,positions,bounds:{x:-20,y:-20,w:560,h:460},constraint_receipts:[]}};
}
function someMove(runtime,base){
 for(const n of base.figure.graph.nodes.filter(n=>n.parent)){
  const s=I.session(base.figure,n.id),c=I.constrain(s,2,0);if(!c.ok||!c.dx)continue;
  const result=runtime.run({task:'move',baseKey:base.key,id:n.id,dx:2,dy:0,epoch:1});if(result.ok&&result.metrics.moved)return {result,node:n.id};
 }
 assert.fail('fixture must permit a verified module move');
}

test('nested subtree movement clamps to parent body and canvas, and rejects sibling collisions',()=>{
 const f=geometry(),s=I.session(f,'a');assert.deepEqual([...s.ids],['a','aa']);
 assert.equal(I.constrain(s,0,-1000).dy,-28);assert.equal(I.constrain(s,-1000,0).dx,-38);
 assert.equal(I.constrain(s,200,0).ok,false);assert.equal(I.constrain(s,20,20).ok,true);
 assert.equal(I.constrain(I.session(f,'root'),-1000,0).dx,-20);
 const moved=I.move(f,'a',20,20);assert.equal(moved.figure.graph.positions.get('aa').x,80);assert.equal(moved.figure.graph.positions.get('aa').y,140);
 assert.equal(moved.figure.graph.positions.get('a').x,60);assert.equal(f.graph.positions.get('a').x,40);
 assert.throws(()=>I.move(f,'a',200,0),/重叠/);assert.equal(f.graph.positions.get('a').x,40);
});
test('pointer previews preserve orthogonality and use immutable baseline coordinates',()=>{
 const f=geometry(),s=I.session(f,'a'),e={source:'aa',target:'b',route:{points:[{x:140,y:145},{x:160,y:145},{x:160,y:150},{x:300,y:150}]}};
 for(const [dx,dy]of [[20,12],[-15,-4],[0,0]]){const ps=I.previewRoute(e,s,dx,dy);assert.deepEqual(ps[0],{x:140+dx,y:145+dy});assert.deepEqual(ps.at(-1),e.route.points.at(-1));assert.ok(ps.every((p,i)=>!i||p.x===ps[i-1].x||p.y===ps[i-1].y));}
 const internal={...e,target:'a'};assert.deepEqual(I.previewRoute(internal,s,20,12),e.route.points.map(p=>({x:p.x+20,y:p.y+12})));
 assert.equal(f.graph.positions.get('aa').x,60);assert.deepEqual(e.route.points[0],{x:140,y:145});
});
test('scene transport explicitly restores Map context, index, annotations and canonical edge bindings',()=>{
 const runtime=initialized(),a=runtime.run({task:'render',state,epoch:1}),payload=structuredClone(a);
 assert.equal(payload.figure.graph.positions.context,undefined);const g=S.unpack(payload).graph;
 assert.ok(g.positions.context.routeCache instanceof Map);assert.ok(g.idx.nodes instanceof Map);assert.ok(g.annotations instanceof Map);
 assert.deepEqual(g.edges,a.figure.graph.edges);assert.deepEqual(g.node_accounting,a.figure.graph.node_accounting);
 assert.equal(R.renderPrepared(ir,state,payload.figure).svg,R.renderPrepared(ir,state,a.figure).svg);
});
test('cached expand/collapse states skip computation and stale epochs cannot commit',()=>{
 const runtime=initialized(),a=runtime.run({task:'render',state,epoch:1});assert.equal(a.ok,true);
 const b=runtime.run({task:'render',state,epoch:1});assert.equal(b.key,a.key);assert.equal(b.metrics.cached,true);assert.equal(b.metrics.compute_ms,0);
 assert.equal(runtime.run({task:'render',state,epoch:0}).stale,true);
 assert.equal(runtime.run({task:'move',baseKey:-1,id:'missing',dx:2,dy:2,epoch:1}).ok,false);
 const c=runtime.run({task:'render',state,epoch:1});assert.equal(c.key,a.key);assert.deepEqual(c.figure.graph.edges,a.figure.graph.edges);
});
test('verified module movement keeps original facts, parent/call identity, accounting and physical routes',()=>{
 const before=JSON.stringify(ir),runtime=initialized(),a=runtime.run({task:'render',state,epoch:1}),{result:b,node}=someMove(runtime,a);
 assert.deepEqual(b.figure.graph.edges,a.figure.graph.edges);assert.deepEqual(b.figure.graph.nodes,a.figure.graph.nodes);
 assert.deepEqual(b.figure.graph.node_accounting,a.figure.graph.node_accounting);assert.deepEqual(b.figure.graph.edge_accounting,a.figure.graph.edge_accounting);
 assert.equal(JSON.stringify(ir),before);assert.ok(b.state.canvasPlacement);assert.ok(b.figure.prepared.routes.every(e=>I.physical(e,b.figure.graph.positions)));
 assert.equal(b.figure.graph.positions.get(node).x,a.figure.graph.positions.get(node).x+2);
 assert.deepEqual(b.figure.prepared.quality.issues,[]);
 // Undo is a cache lookup on the prior immutable state, not a new layout.
 const undo=runtime.run({task:'render',state:a.state,epoch:1});assert.equal(undo.key,a.key);assert.equal(undo.metrics.cached,true);
 assert.equal(R.renderPrepared(ir,a.state,undo.figure).svg,R.renderPrepared(ir,a.state,a.figure).svg);
});
test('manual geometry and exact SVG survive JSON document save/reopen and CLI export',()=>{
 const runtime=initialized(),a=runtime.run({task:'render',state,epoch:1}),{result:b}=someMove(runtime,a),saved=JSON.parse(JSON.stringify(b.state));
 const next=initialized(),reopened=next.run({task:'render',state:saved,epoch:1});assert.equal(reopened.ok,true);assert.ok(reopened.state.canvasPlacement);
 const expected=R.renderPrepared(ir,b.state,b.figure).svg;assert.equal(R.renderPrepared(ir,reopened.state,reopened.figure).svg,expected);assert.equal(R.render(ir,saved).svg,expected);
 const invalid=E.clone(saved);invalid.canvasPlacement.positions[0][1]=1e9;assert.equal(I.restore(a.figure,invalid.canvasPlacement,ir),null);
 const rebound=E.clone(saved);rebound.canvasPlacement.routes[0][1].points[0].x+=3;assert.equal(I.restore(a.figure,rebound.canvasPlacement,ir),null);
 const different=E.clone(saved);different.canvasPlacement.identity='another frontier';assert.equal(I.restore(a.figure,different.canvasPlacement,ir),null);
});
test('source and architecture views use the same safe transaction and resident routing cache',()=>{
 for(const view of ['source','architecture']){const runtime=initialized(),s={view,mode:'source',open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id),offsets:{},details:true};
  const a=runtime.run({task:'render',state:s,epoch:1});assert.equal(a.ok,true);assert.equal(a.figure.prepared,null);assert.equal(a.figure.graph.positions.context.routeCache.size,a.figure.graph.edges.length);
  const n=a.figure.graph.nodes.find(n=>!n.parent),b=runtime.run({task:'move',baseKey:a.key,id:n.id,dx:2,dy:0,epoch:1});assert.equal(b.ok,true,b.error);assert.deepEqual(b.figure.graph.edges,a.figure.graph.edges);
 }
});
test('resident cache is bounded and cannot reuse scenes after a model switch',()=>{
 const runtime=initialized(),a=runtime.run({task:'render',state,epoch:1});for(let i=0;i<7;i++)assert.equal(runtime.run({task:'render',state:{...state,paperWidthMm:180+i},epoch:1}).ok,true);
 assert.equal(runtime.run({task:'move',baseKey:a.key,id:ir.nodes[0].id,dx:2,dy:0,epoch:1}).ok,false);
 runtime.run({task:'init',epoch:2,ir});assert.equal(runtime.run({task:'render',state,epoch:1}).stale,true);
});
function fakeFactory(){const workers=[];return {workers,factory(){const w={messages:[],terminated:false,postMessage(m){this.messages.push(m);},terminate(){this.terminated=true;},reply(m){this.onmessage({data:m});}};workers.push(w);return w;}};}
test('client rejects old model replies even if a terminated worker finishes late',async()=>{
 const fake=fakeFactory(),client=Client.create({workerFactory:()=>fake.factory()}),epoch=client.init(ir),w=fake.workers[0];
 w.reply({requestId:w.messages[0].requestId,ok:true,epoch});const pending=client.request({task:'render',state});await new Promise(r=>setImmediate(r));const message=w.messages.at(-1);
 client.init(ir);const w2=fake.workers[1];w2.reply({requestId:w2.messages[0].requestId,ok:true,epoch:2});
 w.reply({requestId:message.requestId,ok:true,epoch:1});assert.equal((await pending).stale,true);assert.equal(w.terminated,true);client.dispose();
});
test('worker creation failure has a usable explicit compatibility fallback',async()=>{
 const client=Client.create({workerFactory(){throw Error('disabled');},fallback:()=>S.create()});client.init(ir);
 const a=await client.request({task:'render',state});assert.equal(a.ok,true,a.error);assert.equal(a.execution,'main-fallback');assert.ok(S.unpack(a).graph.positions.context);client.dispose();
});
test('actual worker entry loads the full dependency chain and returns a cloneable scene',async()=>{
 const dir=path.resolve('semantic_studio');
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const ctx=vm.createContext({});ctx.self=ctx;ctx.postMessage=m=>parentPort.postMessage(m);ctx.importScripts=(...names)=>names.forEach(n=>vm.runInContext(fs.readFileSync(path.join(workerData,n.split('?')[0]),'utf8'),ctx,{filename:n}));vm.runInContext(fs.readFileSync(path.join(workerData,'scene-worker.js'),'utf8'),ctx);parentPort.on('message',data=>ctx.onmessage({data}));`,{eval:true,workerData:dir});
 const ask=m=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(m);});
 try{assert.equal((await ask({requestId:1,task:'init',epoch:1,ir})).ok,true);const a=await ask({requestId:2,task:'render',epoch:1,state});assert.equal(a.ok,true,a.error);
  const f=S.unpack(a);assert.equal(R.renderPrepared(ir,state,f).svg,R.render(ir,state).svg);const b=await ask({requestId:3,task:'render',epoch:1,state});assert.equal(b.metrics.cached,true);
 }finally{await worker.terminate();}
});
const Storage=require('../semantic_studio/state-storage');
function fakeStorageDB({abort=false}={}){
 const values=new Map();let creates=0,commits=0;
 const indexedDB={open(){const request={};queueMicrotask(()=>{const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
   const tx={error:Error('aborted'),objectStore(){return {get(key){const req={};queueMicrotask(()=>{req.result=values.get(key);req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return req;},put(value,key){queueMicrotask(()=>{if(abort)tx.onabort?.();else {values.set(key,value);commits++;tx.oncomplete?.();}});}};}};return tx;}};request.result=db;creates++;request.onsuccess();});return request;}};
 return {indexedDB,values,get creates(){return creates;},get commits(){return commits;}};
}
test('IndexedDB commits large view state and loads legacy browser states without deleting them',async()=>{
 const db=fakeStorageDB(),legacy=new Map([['legacy',JSON.stringify({open:['old']})]]),store=Storage.create({indexedDB:db.indexedDB,localStorage:{getItem:k=>legacy.get(k),setItem(){throw Error('quota');}}});
 assert.deepEqual(await store.read('legacy'),{open:['old']});assert.equal(legacy.has('legacy'),true);
 const saved={open:['new'],canvasPlacement:{payload:'x'.repeat(1000000)}};
 assert.deepEqual(await store.write('legacy',JSON.stringify(saved)),{backend:'indexeddb'});assert.equal(db.commits,1);
 assert.deepEqual(await store.read('legacy'),saved);assert.equal(db.creates,1);
});
test('aborted IndexedDB writes fall back explicitly and report failure when both stores reject',async()=>{
 const db=fakeStorageDB({abort:true}),values=new Map(),store=Storage.create({indexedDB:db.indexedDB,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
 assert.deepEqual(await store.write('k','{"open":[]}'),{backend:'localstorage'});assert.deepEqual(await store.read('k'),{open:[]});
 const unavailable=Storage.create({indexedDB:null,localStorage:{getItem(){throw Error('denied');},setItem(){throw Error('quota');}}});
 assert.equal(await unavailable.read('k'),null);await assert.rejects(unavailable.write('k','{}'),/quota/);
});
