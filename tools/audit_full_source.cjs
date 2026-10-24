/* Full catalog audit. Freeze production, tests and this capture for the run. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process'),v8=require('node:v8');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const source=process.env.FULL_SOURCE||path.join(root,'semantic_studio');
const E=require(path.join(source,'semantic-engine')),P=require(path.join(source,'publication')),R=require(path.join(source,'publication-renderer')),C=require(path.join(source,'composition-layout')),L=require(path.join(source,'architecture-layout'));
const plain=x=>JSON.parse(JSON.stringify(x));
function accounting(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}}
if(process.argv[2]==='--case'){
 const model=JSON.parse(process.argv[3]),ir=read(path.join(root,'data/semantic',model.ir)),raw=JSON.stringify(ir),rows=[];
 const initial={view:'publication',mode:'source',paperMedium:'canvas',paperComposition:'architecture',paperDirection:'up'};
 const overview=C.frontier(initial,'overview'),detail=C.frontier(overview,'detail');Object.assign(detail,C.certifiedDetails(ir,detail));
 for(const [name,state]of [['F0',overview],['F1',detail],...(P.fullyExpanded?[['full',P.fullyExpanded(ir,detail,E)]]:[])]){
  const t=performance.now(),f=R.prepareFigure(ir,state),ms=performance.now()-t,g=f.graph;accounting(ir,g);
  if(name==='full'){
   const expected=E.project(ir,state);assert.deepEqual(g.node_accounting,expected.node_accounting);assert.deepEqual(g.edge_accounting,expected.edge_accounting);
   assert.equal(g.node_accounting.collapsed.length,0);assert.equal(g.node_accounting.contracted.length,0);assert.equal(g.node_accounting.attached.length,0);
  }
  const svg=R.renderPrepared(ir,state,f).svg;
  rows.push({name,state,nodes:g.nodes.length,edges:g.edges.length,compute_ms:ms,svg_sha256:hash(svg),facts_sha256:hash(JSON.stringify({nodes:g.nodes,edges:g.edges,nodes_accounted:g.node_accounting,edges_accounted:g.edge_accounting})),quality:{issues:f.prepared.quality.issues,failures:f.prepared.quality.route_failures.length,crossings:f.prepared.quality.line_geometry.crossings}});
 }
 assert.equal(JSON.stringify(ir),raw);fs.writeSync(1,JSON.stringify({id:model.id,title:model.title,input_sha256:hash(raw),rows}));process.exit(0);
}
if(process.argv[2]==='--routes'){
 const packed=v8.deserialize(fs.readFileSync('/tmp/full-source-scene.v8')),g=packed.graph;g.positions.context=packed.context;
 const ctx=g.positions.context;Object.assign(ctx,{routeCache:new Map(),reserved:[],portOrder:'canonical',ancestorPorts:'boundary',crossingCost:18,contactCost:0,stubLength:16});
 const distance=e=>{const a=g.positions.get(e.source),b=g.positions.get(e.target);return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);};
 const routeAll=()=>{for(const e of g.edges.slice().sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id))){const r=E.route(e,g.positions);ctx.routeCache.set(e.id,r);ctx.reserved.push(...r.points.slice(1).map((p,i)=>[r.points[i],p]));}};
 const t=performance.now();if(L.withRoutingIndex)L.withRoutingIndex(g.positions,routeAll);else routeAll();const routingMs=performance.now()-t;
 const routes=g.edges.map(e=>({...e,route:ctx.routeCache.get(e.id)})),q=R.evaluateRoutes(g,routes,'canonical-short').quality;
 fs.writeSync(1,JSON.stringify({routing_ms:routingMs,routes:routes.length,routes_sha256:hash(JSON.stringify(routes)),quality_sha256:hash(JSON.stringify(q)),failures:q.route_failures.length}));process.exit(0);
}
const out=path.resolve(process.argv[2]||'verification/full-source/current'),before=process.argv[3];fs.mkdirSync(out,{recursive:true});
const producers=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(n=>n.endsWith('.js')||n==='index.html').map(n=>path.join(root,'semantic_studio',n)),__filename];
const frozen=Object.fromEntries(producers.map(p=>[path.relative(root,p),hash(fs.readFileSync(p))])),models=read(path.join(root,'data/semantic/catalog.json')).models,results=[];
for(const model of models){
 const r=cp.spawnSync(process.execPath,[__filename,'--case',JSON.stringify(model)],{cwd:root,env:process.env,encoding:'utf8',timeout:120000,maxBuffer:5e6});
 assert.equal(r.status,0,model.title+': '+r.stderr+' '+(r.error||''));const row=JSON.parse(r.stdout);
 if(before){const old=read(path.join(before,'catalog-report.json')).models.find(x=>x.id===row.id);for(const item of row.rows.filter(x=>x.name!=='full')){const b=old.rows.find(x=>x.name===item.name);assert.equal(item.svg_sha256,b.svg_sha256,model.title+' '+item.name+' SVG');assert.equal(item.facts_sha256,b.facts_sha256);}}
 results.push(row);fs.writeFileSync(path.join(out,'catalog-report.json'),JSON.stringify({implementation_sha256:frozen,models:results,complete:false},null,2));console.log(JSON.stringify({model:row.title,states:row.rows.length}));
}
for(const [p,h]of Object.entries(frozen))assert.equal(hash(fs.readFileSync(path.join(root,p))),h,'changed during capture');
fs.writeFileSync(path.join(out,'catalog-report.json'),JSON.stringify({schema:'full-source-catalog/1',implementation_sha256:frozen,models:results,complete:true},null,2)+'\n');
