/* Isolated routing experiment. Does not replace or patch production modules. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sourceFile='semantic_studio/architecture-layout.js',source=fs.readFileSync(sourceFile,'utf8');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function load(cached){
 let code=source;
 const at='  function route(e,positions){';
 code=code.replace(at,at+`\n    const stats=root.RouteExperimentMetrics={checks:0,check_hits:0,costs:0,cost_hits:0};
    const checks=new Map(),costs=new Map();
    const segmentKey=(a,b)=>a.x<b.x||a.x===b.x&&a.y<=b.y?[a.x,a.y,b.x,b.y].join(','):[b.x,b.y,a.x,a.y].join(',');
    function routeBlocked(a,b,boxes){stats.checks++;${cached?"const k=segmentKey(a,b);if(checks.has(k)){stats.check_hits++;return checks.get(k);}const value=blocked(a,b,boxes);checks.set(k,value);return value;":"return blocked(a,b,boxes);"}}
 `);
 code=code.replace('!blocked(ps[i-1],p,boxes)','!routeBlocked(ps[i-1],p,boxes)');
 code=code.replace('if(blocked(from,p,boxes))continue;','if(routeBlocked(from,p,boxes))continue;');
 code=code.replace('    function congestion(a,b){let penalty=0;',`    function rawCongestion(a,b){let penalty=0;`);
 const marker='    const length=ps=>';
 code=code.replace(marker,`    function congestion(a,b){stats.costs++;${cached?"const k=segmentKey(a,b);if(costs.has(k)){stats.cost_hits++;return costs.get(k);}const value=rawCongestion(a,b);costs.set(k,value);return value;":"return rawCongestion(a,b);"}}\n`+marker);
 const context=vm.createContext({});vm.runInContext(code,context);return context;
}
const original=load(false),candidate=load(true),rows=[];
const files=process.argv.slice(2);
assert.ok(files.length,'Pass actual saved .layout.json documents');
for(const file of files){
 const bytes=fs.readFileSync(file),doc=JSON.parse(bytes),edges=doc.layout.edges,strategy=doc.diagnostics.routing.selected;
 // Replay the same route against the final surrounding paths. This tests the
 // local optimization, not the entire profile selector or a re-rendered SVG.
 const selected=edges.slice().sort((a,b)=>b.route.points.length-a.route.points.length||a.id.localeCompare(b.id)).slice(0,3);
 for(const edge of selected){
  const run=context=>{
   const positions=new Map(doc.layout.nodes.map(n=>[n.id,{...n}]));
   positions.context={idx:{nodes:new Map(doc.architecture.nodes.map(n=>[n.id,n]))},edges,feedback:new Set(),
    reserved:edges.filter(e=>e.id!==edge.id).flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p])),
    portOrder:strategy.startsWith('neighbors')?'neighbors':'canonical',ancestorPorts:strategy.includes('-header-')?'header':'boundary',
    crossingCost:strategy.includes('-clear-')?90:18,contactCost:0,stubLength:16};
   const start=performance.now(),result=context.SemanticLayout.route(edge,positions);
   return {result:JSON.parse(JSON.stringify(result)),ms:performance.now()-start,stats:{...context.RouteExperimentMetrics}};
  };
  const a=run(original),b=run(candidate);assert.deepEqual(b.result,a.result);
  const row={file,document_sha256:sha(bytes),edge:edge.id,identical:true,baseline_ms:a.ms,candidate_ms:b.ms,
    speedup:a.ms/b.ms,baseline:a.stats,candidate:b.stats};rows.push(row);console.log(JSON.stringify(row));
 }
}
const result={schema:'route-segment-cache-experiment/1',production_applied:false,source:sourceFile,source_sha256:sha(Buffer.from(source)),
 experiment_sha256:sha(fs.readFileSync(__filename)),rows,
 scope:'Paired routes against identical saved positions, terminals, obstacles and surrounding paths. No full-render, new-layout or visual-convergence claim.'};
fs.writeFileSync('/tmp/route-segment-cache-experiment.json',JSON.stringify(result,null,2)+'\n');
