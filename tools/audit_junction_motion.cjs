/* Exercise the shared fork rule on the Transformer collection. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints,J=globalThis.SummaryJunctionMarkers;
const cat=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),reports=[],covered=new Set();
for(const c of cat.cases.filter(c=>!c.historical)){
  if(covered.has(c.collection))continue;
  for(const v of c.views){
    if(!v.json)continue;const original=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))));
    for(const marker of original.junctionMarkers||[]){
      const owner=original.nodes.find(n=>n.id===marker.owner);if(!owner||owner.junction)continue;
      const g=E.clone(original),before=E.junctionPoint(g,marker),binding=JSON.stringify(g.edges.map(e=>e.binding));
      const ids=E.move(g,owner.id,2,0);if(!ids.size)continue;
      const after=E.junctionPoint(g,marker),check=C.validateJunctions(g);
      if(!after||!check.ok||!C.validateSource(g).ok||binding!==JSON.stringify(g.edges.map(e=>e.binding)))throw Error(c.title+' invalid junction motion');
      if(!marker.edges.every(id=>J.contains(g.edges.find(e=>e.id===id).route,after)))throw Error(c.title+' detached marker');
      reports.push({collection:c.collection,case:c.id,title:c.title,view:v.key,producer:owner.id,junction:marker.id,before,after,moved:[...ids],passed:true});
      covered.add(c.collection);break;
    }
    if(covered.has(c.collection))break;
  }
}
const required=['transformer_programmatic_guide'];
const missing=required.filter(c=>!covered.has(c));
const report={passed:!missing.length,collections:covered.size,reports,missing,model_executed:false};
fs.writeFileSync(root+'/verification/shortest-routing/junction-motion.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(missing.length)process.exitCode=1;
