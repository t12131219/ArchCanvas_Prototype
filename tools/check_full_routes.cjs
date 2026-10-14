/* Recompute representative complex views without modifying saved geometry. */
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints;
const cat=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),reports=[];
const options={margin:6,stub:28,bendCost:40,crossingCost:180,overlapCost:2,edgeSpacing:12,sides:'any',style:'orthogonal'};
for(const [title,collection]of [['timemixer','timeseries_programmatic_guide'],['autoformer','timeseries_programmatic_guide'],['Transformer','transformer_programmatic_guide'],['timemixer','arrow_semantic_audit']]){
  const c=cat.cases.find(c=>!c.historical&&c.title===title&&c.collection===collection),v=c.views.find(v=>v.key==='detailed');
  const g=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json)))),before=E.clone(g),start=Date.now(),out=E.routeBatch(g,g.edges.map(e=>e.id),options);
  const violations=[...C.validateSource(g).violations,...C.validateJunctions(g).violations,...g.edges.flatMap(e=>C.validate(g,e,e.route).violations.map(reason=>e.id+': '+reason))];
  if(JSON.stringify(g.nodes)!==JSON.stringify(before.nodes)||JSON.stringify(g.semanticBaseline)!==JSON.stringify(before.semanticBaseline)||g.edges.some((e,i)=>JSON.stringify(e.binding)!==JSON.stringify(before.edges[i].binding)))throw Error('Routing modified source evidence');
  const report={id:c.id,case:c.title,collection,view:v.key,routed:out.routed,retained:out.retained,failed:out.failed,ms:Date.now()-start,failures:g.edges.filter(e=>e.failed).map(e=>({id:e.id,reason:e.reason})),violations};
  reports.push(report);console.log(JSON.stringify(report));
}
fs.writeFileSync(root+'/verification/full-route-representatives.json',JSON.stringify(reports,null,2)+'\n');
if(reports.some(r=>r.failed||r.violations.length))process.exitCode=1;
