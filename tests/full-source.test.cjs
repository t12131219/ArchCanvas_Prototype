'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine'),P=require('../semantic_studio/publication'),R=require('../semantic_studio/publication-renderer'),L=require('../semantic_studio/architecture-layout'),C=require('../semantic_studio/composition-layout'),G=require('../semantic_studio/geometry-index');
const read=p=>JSON.parse(fs.readFileSync(p)),plain=x=>JSON.parse(JSON.stringify(x));
const base={view:'publication',mode:'source',paperMedium:'canvas',paperComposition:'architecture',paperGranularity:'roles',paperAuto:false};
function partition(ir,graph){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}}
test('explicit full source exposes every eligible canonical unit in all 43 catalog models',()=>{
 const models=read('data/semantic/catalog.json').models;assert.equal(models.length,43);
 for(const model of models){const ir=read('data/semantic/'+model.ir),original=JSON.stringify(ir),state=P.fullyExpanded(ir,base,E),g=E.project(ir,state),idx=E.index(ir);
  const source=id=>{while(id){if(id==='runtime-observations'||id.startsWith('runtime:'))return false;id=idx.nodes.get(id)?.parent;}return true;};
  assert.deepEqual(g.nodes.map(n=>n.id).sort(),ir.nodes.filter(n=>source(n.id)).map(n=>n.id).sort(),model.title);
  assert.equal(g.node_accounting.collapsed.length,0);assert.equal(g.node_accounting.attached.length,0);assert.equal(g.node_accounting.contracted.length,0);
  for(const n of g.nodes)assert.equal(n.parent,idx.nodes.get(n.id).parent);
  for(const e of g.edges){const raw=ir.edges.find(x=>x.id===e.id);assert.equal(e.source,raw.source);assert.equal(e.target,raw.target);assert.equal(e.source_port,raw.source_port);assert.equal(e.target_port,raw.target_port);assert.deepEqual(e.condition,raw.condition);}
  partition(ir,g);assert.equal(JSON.stringify(ir),original);assert.equal(E.viewIndex(ir,state).nodes.size,ir.nodes.length);
 }
});
test('full source preserves runtime evidence scopes, conditions, unknown and mutable boundaries',()=>{
 for(const name of ['ConditionalStack','UnknownStack','StateStack','SharedStack']){
  const ir=read('verification/semantic-generalization/current/'+name+'.json');
  for(const mode of ['source','merged',...(ir.nodes.some(n=>n.id==='runtime-observations')?['runtime']:[])]){
   const s=P.fullyExpanded(ir,{...base,mode},E),g=E.project(ir,s);partition(ir,g);
   for(const n of g.nodes){const raw=ir.nodes.find(x=>x.id===n.id);for(const key of ['condition','mutable','source','runtime_evidence','module_identity'])assert.deepEqual(n[key],raw[key]);}
  }
 }
});
test('canonical source detail is reversible, exactly saved and independent of all node/edge identities',()=>{
 const original=read('verification/input-placement/current/SharedInputPaths.json'),ids=new Map([...original.nodes,...original.edges].map((n,i)=>[n.id,'anonymous-'+i]));
 const rename=x=>Array.isArray(x)?x.map(rename):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,rename(v)])):ids.get(x)||x;
 for(const ir of [original,rename(original)]){
  const s=P.fullyExpanded(ir,base,E),r=R.render(ir,s);assert.equal(r.graph.nodes.length,ir.nodes.length);partition(ir,r.graph);
  assert.equal(R.render(plain(ir),plain(s)).svg,r.svg);
  const parent=ir.nodes.find(n=>n.parent&&s.open.includes(n.id)).id,closed={...s,open:s.open.filter(id=>id!==parent)},fold=R.render(ir,closed);
  assert.ok(fold.graph.nodes.length<r.graph.nodes.length);partition(ir,fold.graph);assert.equal(R.render(ir,s).svg,r.svg);
  assert.equal(C.frontier(s,'overview').paperCanonical,undefined);assert.equal(C.frontier(s,'detail').paperCanonical,undefined);
 }
});
test('multiscale reservations return exact intersecting segments in insertion order',()=>{
 const index=G.segments(),rows=[];let seed=8191;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)%2000)-1000;
 for(let i=0;i<600;i++){const a={x:rand(),y:rand()},b=i%2?{x:rand(),y:a.y}:{x:a.x,y:rand()};if(i%19===0)Object.assign(b,a);rows.push([a,b]);index.add(a,b);
  if(i%17)continue;
  for(let j=0;j<12;j++){const a={x:rand(),y:rand()},b=j%2?{x:rand(),y:a.y}:{x:a.x,y:rand()};
   const expected=rows.flatMap(([c,d],order)=>Math.min(c.x,d.x)<=Math.max(a.x,b.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.min(c.y,d.y)<=Math.max(a.y,b.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y)?[order]:[]);
   assert.deepEqual(index.query(a,b).map(r=>r.order),expected);
  }
 }
});
test('routing scopes preserve exact paths, obstacles, ties and reservations after geometry changes',()=>{
 const ir=read('verification/input-placement/current/SharedInputPaths.json'),g=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)}),p=g.positions;
 for(const policy of [{portOrder:'canonical',crossingCost:18,contactCost:0},{portOrder:'neighbors',crossingCost:540,contactCost:1080}]){
  Object.assign(p.context,policy,{reserved:[]});const before=[],obstacles=[];
  for(const e of g.edges){obstacles.push(L.routeObstacles(e,p));const r=L.route(e,p);before.push(r);p.context.reserved.push(...r.points.slice(1).map((v,i)=>[r.points[i],v]));}
  p.context.reserved=[];L.withRoutingIndex(p,()=>{for(const [i,e]of g.edges.entries()){assert.deepEqual(L.routeObstacles(e,p),obstacles[i]);const r=L.route(e,p);assert.deepEqual(r,before[i]);p.context.reserved.push(...r.points.slice(1).map((v,i)=>[r.points[i],v]));}});
  p.get(g.nodes.at(-1).id).x+=7.25;
 }
 assert.throws(()=>L.withRoutingIndex(p,()=>{throw Error('cancel');}),/cancel/);
});
test('large-scene broad phase retains the exact original crossing/contact/overlap results',()=>{
 // Independent quadratic oracle, including coincident bends, shared values,
 // zero-length segments and coordinates on either side of the origin.
 const old=require('../verification/full-source/baseline/line-geometry.cjs');
 const routes=[];let seed=1909;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)%90)-45;
 for(let i=0;i<180;i++){const a={x:rand(),y:rand()},b={x:a.x,y:rand()},c={x:rand(),y:b.y};routes.push({id:'e'+i,resolved_source:'v'+i%7,source_port:'out',route:{points:[a,b,c,...(i%13===0?[c]:[])]}});}
 assert.deepEqual(plain(R.lineGeometry(routes)),plain(old.lineGeometry(routes)));
});
