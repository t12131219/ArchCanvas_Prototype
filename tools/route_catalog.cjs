/* Normalize imported active diagrams using the same editor engine and contracts. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints;
const cat=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'))),reports=[];
const options={margin:6,stub:28,bendCost:40,crossingCost:450,overlapCost:2,edgeSpacing:12,sides:'any',style:'orthogonal'};
for(const c of cat.cases.filter(c=>!c.historical))for(const v of c.views){
  if(!v.json)continue;
  const g=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json)))),nodes=JSON.stringify(g.nodes),bindings=JSON.stringify(g.edges.map(e=>e.binding));
  const before=RStats(g),targets=g.edges.filter(e=>process.argv.includes('--invalid-only')?!C.validate(g,e,e.route).ok:E.conflicts(g,e,options)||!process.argv.includes('--repair-only')&&e.route.length>2&&e.portPolicy&&Object.values(e.portPolicy).some(p=>p.mode!=='fixed')).map(e=>e.id),begin=Date.now();
  const result=E.routeBatch(g,targets,options),violations=[...C.validateJunctions(g).violations.map(reason=>({reason})),...g.edges.flatMap(e=>C.validate(g,e,e.route).violations.map(reason=>({edge:e.id,reason})))];
  if(nodes!==JSON.stringify(g.nodes)||bindings!==JSON.stringify(g.edges.map(e=>e.binding)))throw Error('routing mutated model geometry or semantic evidence');
  const report={case:c.id,title:c.title,collection:c.collection,view:v.key,edges:g.edges.length,targets:targets.length,routed:result.routed,retained:result.retained,failed:result.failed,violations,before,after:RStats(g),ms:Date.now()-begin};
  reports.push(report);
  fs.writeFileSync(path.join(root,v.json),JSON.stringify(g,null,2)+'\n');
  fs.writeFileSync(path.join(root,v.asset),'window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+JSON.stringify(c.id+':'+v.key)+']='+JSON.stringify(g)+';\n');
  if(targets.length||reports.length%40===0)console.log(c.title,v.key,'route',result.routed,'retain',result.retained,'fail',result.failed,'violations',violations.length,report.ms+'ms');
}
fs.writeFileSync(path.join(root,'verification/semantic-routing.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify({views:reports.length,edges:reports.reduce((a,b)=>a+b.edges,0),routed:reports.reduce((a,b)=>a+b.routed,0),failed:reports.reduce((a,b)=>a+b.failed,0),violations:reports.reduce((a,b)=>a+b.violations.length,0)}));

if(reports.some(r=>r.failed||r.violations.length))process.exitCode=1;
function RStats(g){return globalThis.EdgeRouterLabRouting.stats(g.edges);}
